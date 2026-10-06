import test from "node:test";
import assert from "node:assert/strict";
import {
  buildYouTubeQueries,
  createYouTubeAudioProvider,
} from "../server/v2/youtubeAudioProvider.mjs";

const song = {
  title: "Antagonistic",
  artist: "Varlan",
  album: "Pacific Dreams 88.9 | Cyberpunk 2077 · NETEASE",
  durationSec: 178,
};

test("YouTube query plan tries title plus artist before optional title plus album", () => {
  const queries = buildYouTubeQueries(song);
  assert.equal(queries[0], "Antagonistic Varlan");
  assert.match(queries[1], /^Antagonistic .*Pacific Dreams/);
  assert.deepEqual(buildYouTubeQueries({ title: song.title, artist: song.artist, album: null }), [
    "Antagonistic Varlan",
  ]);
});

test("YouTube falls back to the album query when the first three artist results are unsuitable", async () => {
  const calls = [];
  const provider = createYouTubeAudioProvider({
    env: { MUSIC_YTDLP_BIN: "yt-dlp" },
    runner: async (_exe, args) => {
      const query = args.at(-1);
      calls.push(query);
      return { stdout: JSON.stringify({ entries: query.includes("Pacific Dreams")
        ? [{ id: "album-result", title: "Antagonistic", channel: "Pacific Dreams - Topic", duration: 178 }]
        : [1, 2, 3].map((index) => ({
            id: "unrelated-" + index,
            title: "Unrelated video " + index,
            channel: "Unrelated channel",
            duration: 35,
          })) }) };
    },
  });

  const candidates = await provider.search(song);
  assert.deepEqual(calls, [
    "ytsearch10:Antagonistic Varlan",
    "ytsearch10:Antagonistic Pacific Dreams 88.9 | Cyberpunk 2077 · NETEASE",
  ]);
  assert.ok(candidates.some((candidate) => candidate.sourceId === "album-result"));
  assert.ok(candidates.some((candidate) => candidate.sourceId === "unrelated-1"));
});

test("YouTube skips the album fallback when a suitable match appears in the first three", async () => {
  const calls = [];
  const provider = createYouTubeAudioProvider({
    env: { MUSIC_YTDLP_BIN: "yt-dlp" },
    runner: async (_exe, args) => {
      const query = args.at(-1);
      calls.push(query);
      return { stdout: JSON.stringify({ entries: [
        { id: "weak-1", title: "Other song", channel: "Other", duration: 45 },
        { id: "weak-2", title: "Other song", channel: "Other", duration: 45 },
        { id: "artist-match", title: "Antagonistic", channel: "Varlan - Topic", duration: 178 },
        { id: "good-only-after-top-three", title: "Antagonistic", channel: "Varlan - Topic", duration: 178 },
      ] }) };
    },
  });

  const candidates = await provider.search(song);
  assert.deepEqual(calls, ["ytsearch10:Antagonistic Varlan"]);
  assert.ok(candidates.some((candidate) => candidate.sourceId === "artist-match"));
});
