const ITUNES_SEARCH = "https://itunes.apple.com/search";
const ITUNES_LOOKUP = "https://itunes.apple.com/lookup";

function httpError(message, status = 502) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw httpError("曲库服务暂时不可用，请稍后重试。", 502);
    }
    return await response.json();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw httpError("曲库搜索超时，请稍后重试。", 504);
    }
    if (error && error.statusCode) throw error;
    throw httpError("无法连接歌曲曲库，请检查网络后重试。", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizedArtwork(url) {
  if (!url) return "";
  return String(url).replace(/\d+x\d+bb\.(jpg|png)/i, "600x600bb.$1");
}

function mapTrack(track) {
  return {
    id: String(track.trackId || track.collectionId || track.trackViewUrl || track.trackName || ""),
    title: String(track.trackName || track.collectionName || "未知歌曲"),
    artist: String(track.artistName || "未知歌手"),
    album: String(track.collectionName || ""),
    genre: String(track.primaryGenreName || ""),
    coverUrl: normalizedArtwork(track.artworkUrl600 || track.artworkUrl100),
    previewUrl: String(track.previewUrl || ""),
    trackUrl: String(track.trackViewUrl || track.collectionViewUrl || ""),
    releaseYear: track.releaseDate ? String(track.releaseDate).slice(0, 4) : "",
    platform: "MANUAL",
  };
}

function hostnameMatches(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function isSupportedMusicHost(host) {
  return (
    hostnameMatches(host, "music.apple.com") ||
    hostnameMatches(host, "itunes.apple.com") ||
    hostnameMatches(host, "open.spotify.com") ||
    hostnameMatches(host, "youtube.com") ||
    hostnameMatches(host, "youtu.be") ||
    hostnameMatches(host, "music.163.com") ||
    hostnameMatches(host, "y.qq.com") ||
    hostnameMatches(host, "c.y.qq.com")
  );
}

function candidateUrl(input) {
  const match = input.match(/^(https?:\/\/|www\.)\S+$/i);
  if (!match) return null;
  const raw = match[1].toLowerCase() === "www." ? "https://" + input : input;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !isSupportedMusicHost(url.hostname.toLowerCase())) {
      throw httpError("目前支持 Apple Music、Spotify、YouTube、网易云音乐和 QQ 音乐的公开歌曲链接。", 422);
    }
    return url;
  } catch (error) {
    if (error && error.statusCode) throw error;
    throw httpError("歌曲链接格式不正确，请粘贴歌曲名或公开歌曲链接。", 400);
  }
}

async function lookupAppleTrack(url) {
  const hashAndPath = url.pathname + url.search + url.hash;
  const trackParam = url.searchParams.get("i");
  const pathId = hashAndPath.match(/\/id(\d+)/i);
  const id = trackParam && /^\d+$/.test(trackParam) ? trackParam : pathId && pathId[1];
  if (!id) return null;

  const endpoint = ITUNES_LOOKUP + "?" + new URLSearchParams({ id: String(id), entity: "song" });
  const data = await fetchJson(endpoint);
  const tracks = (data.results || []).filter((item) => item.wrapperType === "track" || item.kind === "song");
  return tracks.map(mapTrack);
}

async function resolveOEmbed(url, provider) {
  const endpoint =
    provider === "spotify"
      ? "https://open.spotify.com/oembed"
      : "https://www.youtube.com/oembed";
  const requestUrl = endpoint + "?" + new URLSearchParams({ url: url.href, format: "json" });
  const data = await fetchJson(requestUrl);
  const title = String(data.title || "").trim();
  const author = String(data.author_name || "").trim();
  const genericAuthor = /^(spotify|youtube)$/i.test(author) ? "" : author;
  if (!title) throw httpError("无法从这个链接读取歌曲标题，请改用歌名搜索。", 422);
  return [title, genericAuthor].filter(Boolean).join(" ");
}

async function resolveNetease(url) {
  const idMatch = (url.pathname + url.search + url.hash).match(/[?&]id=(\d+)/i);
  if (!idMatch) return null;
  const id = idMatch[1];
  const endpoint =
    "https://music.163.com/api/song/detail/?" +
    new URLSearchParams({ id, ids: "[" + id + "]" });
  const data = await fetchJson(endpoint, {
    headers: { Referer: "https://music.163.com/" },
  });
  const song = data.songs && data.songs[0];
  if (!song || !song.name) return null;
  const artists = (song.artists || song.ar || []).map((artist) => artist.name).filter(Boolean);
  return [song.name, artists.join(" ")].filter(Boolean).join(" ");
}

async function resolveQqMusic(url) {
  const pathMatch = url.pathname.match(/(?:songDetail|song)\/([A-Za-z0-9]+)/i);
  const id = url.searchParams.get("songmid") || (pathMatch && pathMatch[1]);
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  const endpoint =
    "https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?" +
    new URLSearchParams({ songmid: id, format: "json" });
  const data = await fetchJson(endpoint, {
    headers: { Referer: "https://y.qq.com/" },
  });
  const song = data.data && data.data[0];
  if (!song || !song.songname) return null;
  const artists = (song.singer || []).map((artist) => artist.name).filter(Boolean);
  return [song.songname, artists.join(" ")].filter(Boolean).join(" ");
}

async function resolveSearchTerm(input) {
  const url = candidateUrl(input);
  if (!url) return { term: input };

  const host = url.hostname.toLowerCase();
  if (hostnameMatches(host, "music.apple.com") || hostnameMatches(host, "itunes.apple.com")) {
    const tracks = await lookupAppleTrack(url);
    if (tracks && tracks.length) return { tracks };
    return { term: input };
  }
  if (hostnameMatches(host, "open.spotify.com")) {
    return { term: await resolveOEmbed(url, "spotify") };
  }
  if (hostnameMatches(host, "youtube.com") || hostnameMatches(host, "youtu.be")) {
    return { term: await resolveOEmbed(url, "youtube") };
  }
  if (hostnameMatches(host, "music.163.com")) {
    const term = await resolveNetease(url);
    if (term) return { term };
  }
  if (hostnameMatches(host, "y.qq.com") || hostnameMatches(host, "c.y.qq.com")) {
    const term = await resolveQqMusic(url);
    if (term) return { term };
  }
  throw httpError("无法从链接中读取歌曲信息，请尝试直接输入歌名和歌手。", 422);
}

async function searchItunes(term) {
  const endpoint =
    ITUNES_SEARCH +
    "?" +
    new URLSearchParams({
      term,
      media: "music",
      entity: "song",
      limit: "15",
    });
  const data = await fetchJson(endpoint);
  return (data.results || [])
    .filter((track) => track.trackName && track.artistName)
    .map(mapTrack);
}

export async function searchMusic(input) {
  const query = String(input || "").trim();
  if (!query) throw httpError("请输入歌曲名、歌手名或歌曲链接。", 400);
  if (query.length > 300) throw httpError("搜索内容过长，请缩短后重试。", 400);

  const resolved = await resolveSearchTerm(query);
  if (resolved.tracks) return resolved.tracks.slice(0, 15);
  return searchItunes(resolved.term);
}
