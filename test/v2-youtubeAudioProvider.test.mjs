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

test("YouTube query plan uses title plus album, then title plus artist", () => {
  const queries = buildYouTubeQueries(song);
  assert.match(queries[0], /^Antagonistic .*Pacific Dreams/);
  assert.equal(queries[1], "Antagonistic Varlan");
  assert.deepEqual(buildYouTubeQueries({ title: song.title, artist: song.artist, album: null }), [
    "Antagonistic",
    "Antagonistic Varlan",
  ]);
});

test("YouTube runs the two permitted query variants and merges their previews", async () => {
  const calls = [];
  const provider = createYouTubeAudioProvider({
    env: { MUSIC_YTDLP_BIN: "yt-dlp" },
    runner: async (_exe, args) => {
      const query = args.at(-1);
      calls.push(query);
      return {
        stdout: JSON.stringify({ entries: [
          {
            id: query.includes("Pacific Dreams") ? "album-result" : "artist-result",
            title: "Antagonistic",
            channel: query.includes("Pacific Dreams") ? "Pacific Dreams - Topic" : "Varlan - Topic",
            duration: 178,
            channel_is_verified: true,
          },
        ] }),
      };
    },
  });

  const candidates = await provider.search(song);
  assert.deepEqual(calls, [
    "ytsearch10:Antagonistic Pacific Dreams 88.9 | Cyberpunk 2077 · NETEASE",
    "ytsearch10:Antagonistic Varlan",
  ]);
  assert.deepEqual(new Set(candidates.map((candidate) => candidate.sourceId)), new Set(["album-result", "artist-result"]));
});
