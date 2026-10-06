import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseAudioSource,
  scoreAudioCandidate,
} from "../music-learning/v2/sourceMatcher.mjs";

const song = {
  title: "Battlefield 4 Warsaw Theme",
  artist: "Rami",
  album: "Battlefield 4 Original Soundtrack",
  durationSec: 205,
};

function candidate(overrides = {}) {
  return {
    sourceId: "yt-1",
    url: "https://www.youtube.com/watch?v=test",
    title: "Battlefield 4 Warsaw Theme",
    artistHint: "Rami",
    albumHint: "Battlefield 4 Original Soundtrack",
    channel: "EA Games Soundtracks - Topic",
    durationSec: 205,
    isOfficial: false,
    isTopic: true,
    isPublisher: false,
    ...overrides,
  };
}

test("exact official/topic candidate receives a high score", () => {
  const scored = scoreAudioCandidate(song, candidate());
  assert.ok(scored.matchScore >= 0.88);
});

test("undesired remix variant is penalized", () => {
  const original = scoreAudioCandidate(song, candidate()).matchScore;
  const remix = scoreAudioCandidate(
    song,
    candidate({ title: "Battlefield 4 Warsaw Theme Remix" }),
  ).matchScore;
  assert.ok(original > remix);
});

test("high confidence candidate can be selected automatically", () => {
  const result = chooseAudioSource(song, [
    candidate(),
    candidate({
      sourceId: "yt-2",
      title: "Battlefield 4 Theme Cover",
      channel: "Fan Channel",
      artistHint: "Unknown",
      albumHint: null,
      durationSec: 260,
      isTopic: false,
    }),
  ]);
  assert.equal(result.decision, "auto_high");
  assert.equal(result.selected?.sourceId, "yt-1");
});

test("close candidates require manual confirmation", () => {
  const a = candidate({ sourceId: "a", isTopic: false, isOfficial: false });
  const b = candidate({
    sourceId: "b",
    channel: "Another Channel",
    isTopic: false,
    isOfficial: false,
  });
  const result = chooseAudioSource(song, [a, b]);
  assert.equal(result.decision, "manual_required");
  assert.equal(result.selected, null);
  assert.equal(result.candidates.length, 2);
});

test("unrelated videos with an artist-name substring are not presented as source matches", () => {
  const result = chooseAudioSource(
    { title: "Antagonistic", artist: "Varlan", album: "Pacific Dreams 88.9", durationSec: null },
    [{
      sourceId: "workout-1",
      title: "Arm antagonist drop set",
      artistHint: "Marius Varlan",
      channel: "Marius Varlan",
      durationSec: 178,
      isOfficial: false,
      isTopic: false,
      isPublisher: false,
    }],
  );

  assert.equal(result.selected, null);
  assert.deepEqual(result.candidates, []);
});

test("an exact-title recording remains a manual option when catalog artist metadata is unreliable", () => {
  const result = chooseAudioSource(
    { title: "Antagonistic", artist: "Varlan", album: "Pacific Dreams 88.9", durationSec: 178 },
    [{
      sourceId: "topic-title-match",
      title: "Antagonistic",
      artistHint: null,
      channel: "Lakeshore Records",
      durationSec: 195,
      isOfficial: false,
      isTopic: false,
      isPublisher: false,
    }],
  );

  assert.equal(result.decision, "manual_required");
  assert.equal(result.selected, null);
  assert.equal(result.candidates[0].sourceId, "topic-title-match");
});
