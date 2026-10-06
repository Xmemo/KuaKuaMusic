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

test("YouTube query plan tries title plus album, then title alone, then artist", () => {
  const queries = buildYouTubeQueries(song);
  assert.match(queries[0], /^Antagonistic .*Pacific Dreams/);
  assert.equal(queries[1], "Antagonistic");
  assert.match(queries[2], /Varlan/);
});

test("a confident title-only result ends search early and outranks unrelated title matches", async () => {
  const calls = [];
  const provider = createYouTubeAudioProvider({
    env: { MUSIC_YTDLP_BIN: "yt-dlp" },
    runner: async (_exe, args) => {
      const query = args.at(-1);
      calls.push(query);
      if (query.includes("Pacific Dreams")) return { stdout: JSON.stringify({ entries: [] }) };
      return {
        stdout: JSON.stringify({ entries: [
          {
            id: "correct",
            title: "Antagonistic",
            channel: "Varlan - Topic",
            duration: 178,
            channel_is_verified: true,
          },
          {
            id: "workout",
            title: "Arm antagonist drop set",
            channel: "Marius Varlan",
            duration: 178,
          },
        ] }),
      };
    },
  });

  const candidates = await provider.search(song);
  assert.deepEqual(calls, [
    "ytsearch10:Antagonistic Pacific Dreams 88.9 | Cyberpunk 2077 · NETEASE",
    "ytsearch10:Antagonistic",
  ]);
  assert.equal(candidates[0].sourceId, "correct");
  assert.equal(candidates.some((candidate) => candidate.sourceId === "workout"), true);
});
