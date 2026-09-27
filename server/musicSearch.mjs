const ITUNES_SEARCH = "https://itunes.apple.com/search";
const ITUNES_LOOKUP = "https://itunes.apple.com/lookup";
const ITUNES_QUERY_LIMIT = 200;
const MAX_RESULTS = 180;
const MAX_SEARCH_QUERIES = 9;

function httpError(message, status = 502) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

async function fetchJson(url, options = {}, timeoutMs = 9000, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw httpError("曲库服务暂时不可用，请稍后重试。", 502);
    return await response.json();
  } catch (error) {
    if (error && error.name === "AbortError") throw httpError("曲库搜索超时，请稍后重试。", 504);
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
    hostnameMatches(host, "163cn.tv") ||
    hostnameMatches(host, "y.qq.com") ||
    hostnameMatches(host, "c.y.qq.com")
  );
}

function trimUrlPunctuation(value) {
  return String(value || "").replace(/[.,!?;:，。！？；：、)\]}>】）》」』]+$/u, "");
}

function extractUrlCandidates(input) {
  const matches = String(input || "").match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/giu) || [];
  return matches.map(trimUrlPunctuation).filter(Boolean);
}

function candidateUrl(input) {
  for (const candidate of extractUrlCandidates(input)) {
    try {
      const raw = /^www\./i.test(candidate) ? "https://" + candidate : candidate;
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      if (!isSupportedMusicHost(url.hostname.toLowerCase())) continue;
      // Music links are public resources; upgrade legacy http shares before fetching.
      url.protocol = "https:";
      return url;
    } catch {
      // Ignore malformed URL fragments and try the next link in the share text.
    }
  }
  return null;
}

function stripUrlCandidates(input) {
  return String(input || "")
    .replace(/(?:https?:\/\/|www\.)[^\s<>"'`]+/giu, " ")
    .replace(/[\[\](){}<>「」『』【】]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractQueryParams(url) {
  const params = new URLSearchParams(url.search);
  const hashQuery = url.hash.match(/[?&]([^#]*)/u);
  if (hashQuery) {
    for (const [key, value] of new URLSearchParams(hashQuery[1])) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  return params;
}

function getNeteaseId(url) {
  const params = extractQueryParams(url);
  const pathId = url.pathname.match(/\/song\/(\d+)/iu);
  const id = params.get("id") || (pathId && pathId[1]);
  return id && /^\d+$/u.test(id) ? id : "";
}

function getQqSongId(url) {
  const params = extractQueryParams(url);
  const pathMatch = url.pathname.match(/(?:songDetail|song)\/([A-Za-z0-9]+)(?:\.html)?/iu);
  const id = params.get("songmid") || (pathMatch && pathMatch[1]);
  return id && /^[A-Za-z0-9]{5,40}$/u.test(id) ? id : "";
}

async function followMusicRedirect(url, fetcher) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetcher(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/json" },
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw httpError("歌曲链接解析超时，请稍后重试。", 504);
      throw httpError("无法解析这个歌曲分享链接，请改用歌名搜索。", 502);
    } finally {
      clearTimeout(timeout);
    }

    const location = response.headers && response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (response.body && typeof response.body.cancel === "function") {
        await response.body.cancel().catch(() => {});
      }
      const next = new URL(location, current);
      if (next.protocol !== "https:" || !isSupportedMusicHost(next.hostname.toLowerCase())) {
        throw httpError("分享链接跳转到了不支持的地址，请直接粘贴歌曲页链接。", 422);
      }
      current = next;
      continue;
    }

    if (response.body && typeof response.body.cancel === "function") {
      await response.body.cancel().catch(() => {});
    }
    const finalUrl = response.url ? new URL(response.url) : current;
    if (finalUrl.protocol !== "https:" || !isSupportedMusicHost(finalUrl.hostname.toLowerCase())) {
      throw httpError("分享链接跳转到了不支持的地址，请直接粘贴歌曲页链接。", 422);
    }
    return finalUrl;
  }
  throw httpError("分享链接跳转次数过多，请直接粘贴歌曲页链接。", 422);
}

async function lookupAppleTrack(url, fetcher) {
  const params = extractQueryParams(url);
  const pathId = url.pathname.match(/\/id(\d+)/iu);
  const id = params.get("i") && /^\d+$/u.test(params.get("i")) ? params.get("i") : pathId && pathId[1];
  if (!id) return [];

  const endpoint = ITUNES_LOOKUP + "?" + new URLSearchParams({ id: String(id), entity: "song" });
  const data = await fetchJson(endpoint, {}, 9000, fetcher);
  return (data.results || [])
    .filter((item) => item.wrapperType === "track" || item.kind === "song")
    .map(mapTrack);
}

async function resolveOEmbed(url, provider, fetcher) {
  const endpoint = provider === "spotify" ? "https://open.spotify.com/oembed" : "https://www.youtube.com/oembed";
  const requestUrl = endpoint + "?" + new URLSearchParams({ url: url.href, format: "json" });
  const data = await fetchJson(requestUrl, {}, 9000, fetcher);
  const title = String(data.title || "").trim();
  const author = String(data.author_name || "").trim();
  const genericAuthor = /^(spotify|youtube|topic)$/iu.test(author) ? "" : author;
  if (!title) throw httpError("无法从这个链接读取歌曲标题，请改用歌名搜索。", 422);
  return [title, genericAuthor].filter(Boolean).join(" ");
}

function mapNeteaseSong(song, id) {
  const artists = (song.artists || song.ar || []).map((artist) => artist && artist.name).filter(Boolean);
  const album = song.album || song.al || {};
  const title = String(song.name || song.songName || "").trim();
  const artist = artists.join(" / ") || "未知歌手";
  if (!title) return null;
  return {
    id: "netease:" + String(song.id || id),
    title,
    artist,
    album: String(album.name || ""),
    genre: "",
    coverUrl: normalizedArtwork(album.picUrl || album.blurPicUrl || song.picUrl || ""),
    previewUrl: "",
    trackUrl: "https://music.163.com/#/song?id=" + encodeURIComponent(String(song.id || id)),
    releaseYear: song.publishTime ? new Date(song.publishTime).getFullYear().toString() : "",
    platform: "NETEASE",
  };
}

async function resolveNetease(url, fetcher) {
  let songUrl = url;
  let id = getNeteaseId(songUrl);
  if (!id && hostnameMatches(songUrl.hostname.toLowerCase(), "163cn.tv")) {
    songUrl = await followMusicRedirect(songUrl, fetcher);
    id = getNeteaseId(songUrl);
  }
  if (!id) return null;
  const endpoint = "https://music.163.com/api/song/detail/?" + new URLSearchParams({ id, ids: "[" + id + "]" });
  const data = await fetchJson(endpoint, { headers: { Referer: "https://music.163.com/" } }, 9000, fetcher);
  const song = data.songs && data.songs[0];
  if (!song) return null;
  const track = mapNeteaseSong(song, id);
  return track ? { track, term: [track.title, track.artist].join(" ") } : null;
}

function mapQqSong(song, id) {
  const singers = (song.singer || song.singer_list || song.singers || [])
    .map((artist) => artist && (artist.name || artist.title))
    .filter(Boolean);
  const title = String(song.songname || song.name || song.title || "").trim();
  const artist = singers.join(" / ") || "未知歌手";
  if (!title) return null;
  const songmid = String(song.songmid || song.mid || id);
  const albummid = String(song.albummid || song.album_mid || "");
  return {
    id: "qq:" + songmid,
    title,
    artist,
    album: String(song.albumname || song.album || ""),
    genre: "",
    coverUrl: albummid ? "https://y.gtimg.cn/music/photo_new/T002R300x300M000" + encodeURIComponent(albummid) + ".jpg?max_age=2592000" : "",
    previewUrl: "",
    trackUrl: "https://y.qq.com/n/ryqq/songDetail/" + encodeURIComponent(songmid),
    releaseYear: "",
    platform: "QQ",
  };
}

async function resolveQqMusic(url, fetcher) {
  let songUrl = url;
  let id = getQqSongId(songUrl);
  if (!id && hostnameMatches(songUrl.hostname.toLowerCase(), "c.y.qq.com")) {
    songUrl = await followMusicRedirect(songUrl, fetcher);
    id = getQqSongId(songUrl);
  }
  if (!id) return null;
  const endpoint = "https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?" + new URLSearchParams({ songmid: id, format: "json" });
  const data = await fetchJson(endpoint, { headers: { Referer: "https://y.qq.com/" } }, 9000, fetcher);
  const song = data.data && data.data[0];
  if (!song) return null;
  const track = mapQqSong(song, id);
  return track ? { track, term: [track.title, track.artist].join(" ") } : null;
}

function splitTitleArtist(query) {
  const match = String(query || "").match(/^\s*(.+?)\s+(?:-|—|–|\||\/|,|，|\+|＋|by)\s+(.+?)\s*$/iu);
  return match ? { first: match[1].trim(), second: match[2].trim() } : null;
}

function buildSearchPlan(query) {
  const plan = [];
  const seen = new Map();
  const pairs = [];
  const addQuery = (term, attribute, limit = 100) => {
    const cleanTerm = String(term || "").replace(/\s+/gu, " ").trim();
    if (!cleanTerm) return;
    const key = (attribute || "all") + "|" + cleanTerm.toLocaleLowerCase();
    if (seen.has(key)) {
      const existing = plan[seen.get(key)];
      existing.limit = Math.max(existing.limit, limit);
      return;
    }
    if (plan.length >= MAX_SEARCH_QUERIES) return;
    seen.set(key, plan.length);
    plan.push({ term: cleanTerm, attribute, limit });
  };
  const addPair = (title, artist) => {
    if (!title || !artist) return;
    const pairKey = title.toLocaleLowerCase() + "|" + artist.toLocaleLowerCase();
    if (!pairs.some((pair) => pair.key === pairKey)) pairs.push({ title, artist, key: pairKey });
    addQuery(title, "songTerm", 80);
    addQuery(artist, "artistTerm", ITUNES_QUERY_LIMIT);
  };

  addQuery(query, null, ITUNES_QUERY_LIMIT);
  const explicit = splitTitleArtist(query);
  if (explicit) {
    addPair(explicit.first, explicit.second);
    addPair(explicit.second, explicit.first);
  } else {
    addQuery(query, "songTerm", 100);
    addQuery(query, "artistTerm", ITUNES_QUERY_LIMIT);
    const tokens = query.split(/\s+/u).filter(Boolean);
    if (tokens.length >= 2) {
      const cuts = Array.from(new Set([Math.floor(tokens.length / 2), 1, tokens.length - 1]));
      for (const cut of cuts) {
        if (cut <= 0 || cut >= tokens.length) continue;
        const left = tokens.slice(0, cut).join(" ");
        const right = tokens.slice(cut).join(" ");
        addPair(left, right);
        addPair(right, left);
      }
    }
  }
  return { plan, pairs, explicit };
}

async function searchItunes(query, fetcher) {
  const params = new URLSearchParams({
    term: query.term,
    media: "music",
    entity: "song",
    limit: String(Math.min(ITUNES_QUERY_LIMIT, Math.max(1, query.limit || 100))),
  });
  if (query.attribute) params.set("attribute", query.attribute);
  const data = await fetchJson(ITUNES_SEARCH + "?" + params, {}, 9000, fetcher);
  return (data.results || []).filter((track) => track.trackName && track.artistName).map(mapTrack);
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function phraseScore(text, phrase) {
  const normalizedPhrase = normalizedText(phrase);
  const normalizedValue = normalizedText(text);
  if (!normalizedPhrase || !normalizedValue) return 0;
  if (normalizedValue === normalizedPhrase) return 100;
  if (normalizedValue.includes(normalizedPhrase)) return 78;
  const words = normalizedPhrase.split(/\s+/u).filter(Boolean);
  if (!words.length) return 0;
  const matched = words.filter((word) => normalizedValue.includes(word)).length;
  return Math.round((matched / words.length) * 55);
}

function relevanceScore(track, query, pairs) {
  const title = normalizedText(track.title);
  const artist = normalizedText(track.artist);
  const normalizedQuery = normalizedText(query);
  const words = normalizedQuery.split(/\s+/u).filter(Boolean);
  const joined = title + " " + artist;
  const coverage = words.length ? words.filter((word) => joined.includes(word)).length / words.length : 0;
  let score = coverage * 40;
  if (title === normalizedQuery) score += 90;
  else if (title.includes(normalizedQuery) && normalizedQuery) score += 60;
  if (artist === normalizedQuery) score += 50;
  for (const pair of pairs) {
    score = Math.max(score, phraseScore(title, pair.title) * 0.62 + phraseScore(artist, pair.artist) * 0.48 + coverage * 20);
  }
  return score;
}

function trackKey(track) {
  const title = normalizedText(track.title);
  const artist = normalizedText(track.artist);
  const album = normalizedText(track.album);
  return title + "|" + artist + "|" + album;
}

function mergeTracks(groups) {
  const result = [];
  for (const group of groups) {
    for (const track of group || []) {
      const key = trackKey(track);
      if (!key || key === "||") continue;
      const [title, artist, album] = key.split("|");
      const existingIndex = result.findIndex((candidate) => {
        const [candidateTitle, candidateArtist, candidateAlbum] = trackKey(candidate).split("|");
        return candidateTitle === title && candidateArtist === artist &&
          (!album || !candidateAlbum || candidateAlbum === album);
      });
      if (existingIndex === -1) {
        result.push(track);
      } else {
        const existing = result[existingIndex];
        result[existingIndex] = {
          ...track,
          ...existing,
          coverUrl: existing.coverUrl || track.coverUrl || "",
          previewUrl: existing.previewUrl || track.previewUrl || "",
          trackUrl: existing.trackUrl || track.trackUrl || "",
          album: existing.album || track.album || "",
          genre: existing.genre || track.genre || "",
          releaseYear: existing.releaseYear || track.releaseYear || "",
        };
      }
    }
  }
  return result;
}

async function resolveSearchTerm(input, fetcher) {
  const url = candidateUrl(input);
  if (!url) {
    const text = stripUrlCandidates(input);
    if (!text) {
      throw httpError("请粘贴受支持平台的歌曲链接，或输入歌名和歌手。", 422);
    }
    return { term: text, directTracks: [] };
  }

  const host = url.hostname.toLowerCase();
  if (hostnameMatches(host, "music.apple.com") || hostnameMatches(host, "itunes.apple.com")) {
    const tracks = await lookupAppleTrack(url, fetcher);
    if (tracks.length) return { directTracks: tracks };
    const textHint = stripUrlCandidates(input);
    if (textHint) return { term: textHint, directTracks: [] };
    throw httpError("没有从这个 Apple Music 链接找到曲目，请直接输入歌名和歌手。", 422);
  }
  if (hostnameMatches(host, "open.spotify.com")) {
    return { term: await resolveOEmbed(url, "spotify", fetcher), directTracks: [] };
  }
  if (hostnameMatches(host, "youtube.com") || hostnameMatches(host, "youtu.be")) {
    return { term: await resolveOEmbed(url, "youtube", fetcher), directTracks: [] };
  }
  if (hostnameMatches(host, "music.163.com") || hostnameMatches(host, "163cn.tv")) {
    const resolved = await resolveNetease(url, fetcher);
    if (resolved) return { term: resolved.term, directTracks: [resolved.track] };
  }
  if (hostnameMatches(host, "y.qq.com") || hostnameMatches(host, "c.y.qq.com")) {
    const resolved = await resolveQqMusic(url, fetcher);
    if (resolved) return { term: resolved.term, directTracks: [resolved.track] };
  }
  throw httpError("无法从链接中读取歌曲信息，请尝试直接输入歌名和歌手。", 422);
}

export async function searchMusic(input, options = {}) {
  const fetcher = options.fetcher || fetch;
  const query = String(input || "").trim();
  if (!query) throw httpError("请输入歌曲名、歌手名或歌曲链接。", 400);
  if (query.length > 600) throw httpError("搜索内容过长，请缩短后重试。", 400);

  const resolved = await resolveSearchTerm(query, fetcher);
  if (resolved.directTracks && resolved.directTracks.length && !resolved.term) {
    return resolved.directTracks.slice(0, MAX_RESULTS);
  }

  const term = String(resolved.term || "").trim();
  if (!term) return (resolved.directTracks || []).slice(0, MAX_RESULTS);
  const { plan, pairs } = buildSearchPlan(term);
  const lookups = await Promise.allSettled(plan.map((search) => searchItunes(search, fetcher)));
  const fulfilled = lookups.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const directTracks = resolved.directTracks || [];
  if (!fulfilled.length && !directTracks.length) {
    const rejected = lookups.find((result) => result.status === "rejected");
    throw rejected ? rejected.reason : httpError("歌曲搜索失败，请稍后重试。", 502);
  }

  const catalogTracks = mergeTracks(fulfilled)
    .map((track, index) => ({ track, index, score: relevanceScore(track, term, pairs) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.track);
  return mergeTracks([directTracks, catalogTracks]).slice(0, MAX_RESULTS);
}

export const searchLimits = Object.freeze({ maxResults: MAX_RESULTS, perQuery: ITUNES_QUERY_LIMIT });
