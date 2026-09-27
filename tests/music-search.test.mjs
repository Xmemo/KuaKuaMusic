import test from "node:test";
import assert from "node:assert/strict";
import { searchMusic } from "../server/musicSearch.mjs";

function jsonResponse(data, options = {}) {
  const headers = new Headers(options.headers || {});
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    headers,
    url: options.url || "",
    body: { cancel: async () => {} },
    async json() { return data; },
  };
}

function itunesTrack(trackId, trackName, artistName, collectionName = "") {
  return {
    trackId,
    trackName,
    artistName,
    collectionName,
    artworkUrl100: "https://example.test/100x100bb.jpg",
    trackViewUrl: `https://music.example.test/${trackId}`,
  };
}

test("extracts a NetEase song link from surrounding share text and keeps its direct result", async () => {
  const calls = [];
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    calls.push(url);
    if (url.hostname === "music.163.com") {
      return jsonResponse({ songs: [{
        id: 1234567,
        name: "山海",
        ar: [{ name: "草东没有派对" }],
        al: { name: "丑奴儿", picUrl: "https://img.example.test/cover.jpg" },
        publishTime: 1430000000000,
      }] });
    }
    if (url.hostname === "itunes.apple.com") return jsonResponse({ results: [] });
    throw new Error("Unexpected URL: " + rawUrl);
  };

  const songs = await searchMusic("分享这首歌：https://music.163.com/#/song?id=1234567 复制此消息", { fetcher });
  assert.equal(songs[0].title, "山海");
  assert.equal(songs[0].artist, "草东没有派对");
  assert.equal(songs[0].platform, "NETEASE");
  assert.equal(songs[0].id, "netease:1234567");
  assert.equal(calls.filter((url) => url.hostname === "itunes.apple.com").length > 0, true);
});

test("keeps QQ song detail as a selectable result when iTunes has no match", async () => {
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname === "c.y.qq.com") {
      return jsonResponse({ data: [{
        songmid: "003abcdEFG12",
        songname: "晴天",
        singer: [{ name: "周杰伦" }],
        albumname: "叶惠美",
        albummid: "004abc123",
      }] });
    }
    if (url.hostname === "itunes.apple.com") return jsonResponse({ results: [] });
    throw new Error("Unexpected URL: " + rawUrl);
  };

  const songs = await searchMusic("QQ音乐分享 https://y.qq.com/n/ryqq/songDetail/003abcdEFG12?ADTAG=share", { fetcher });
  assert.equal(songs[0].title, "晴天");
  assert.equal(songs[0].artist, "周杰伦");
  assert.equal(songs[0].platform, "QQ");
  assert.match(songs[0].trackUrl, /songDetail\/003abcdEFG12/u);
});

test("splits an explicit title and artist and ranks their matching song first", async () => {
  const requested = [];
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname !== "itunes.apple.com") throw new Error("Unexpected URL: " + rawUrl);
    const params = url.searchParams;
    requested.push({ term: params.get("term"), attribute: params.get("attribute") });
    const matching = params.get("attribute") === "songTerm" && params.get("term") === "Bohemian Rhapsody";
    return jsonResponse({ results: matching ? [itunesTrack(1, "Bohemian Rhapsody", "Queen", "A Night at the Opera")] : [] });
  };

  const songs = await searchMusic("Bohemian Rhapsody - Queen", { fetcher });
  assert.equal(songs[0].title, "Bohemian Rhapsody");
  assert.equal(songs[0].artist, "Queen");
  assert.ok(requested.some((entry) => entry.attribute === "songTerm" && entry.term === "Bohemian Rhapsody"));
  assert.ok(requested.some((entry) => entry.attribute === "artistTerm" && entry.term === "Queen"));
});

test("tries title/artist token splits for an undelimited query", async () => {
  const requested = [];
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname !== "itunes.apple.com") throw new Error("Unexpected URL: " + rawUrl);
    const params = url.searchParams;
    requested.push({ term: params.get("term"), attribute: params.get("attribute") });
    const matching = params.get("attribute") === "songTerm" && params.get("term") === "Wonderwall";
    return jsonResponse({ results: matching ? [itunesTrack(2, "Wonderwall", "Oasis", "(What's the Story) Morning Glory?")] : [] });
  };

  const songs = await searchMusic("Wonderwall Oasis", { fetcher });
  assert.equal(songs[0].title, "Wonderwall");
  assert.equal(songs[0].artist, "Oasis");
  assert.ok(requested.some((entry) => entry.attribute === "songTerm" && entry.term === "Wonderwall"));
  assert.ok(requested.some((entry) => entry.attribute === "artistTerm" && entry.term === "Oasis"));
});

test("returns more than the old 15-result cap", async () => {
  const tracks = Array.from({ length: 24 }, (_, index) => itunesTrack(index + 10, `Track ${index + 1}`, "Example Band", `Album ${index + 1}`));
  const fetcher = async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname !== "itunes.apple.com") throw new Error("Unexpected URL: " + rawUrl);
    return jsonResponse({ results: url.searchParams.has("attribute") ? [] : tracks });
  };

  const songs = await searchMusic("Example Band", { fetcher });
  assert.equal(songs.length, 24);
  assert.ok(songs.length > 15);
});

test("rejects a short-link redirect to an untrusted host", async () => {
  const fetcher = async () => jsonResponse(null, {
    status: 302,
    headers: { location: "https://attacker.example/collect" },
  });

  await assert.rejects(
    searchMusic("https://163cn.tv/short", { fetcher }),
    /不支持的地址/u,
  );
});
