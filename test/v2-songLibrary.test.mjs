import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSongLibrary,
  deriveSongId,
} from "../server/v2/songLibrary.mjs";

test("song package id stays stable across album/year/platform metadata", () => {
  const first = deriveSongId({
    title: "Battlefield 4 Warsaw Theme",
    artist: "Rami",
    album: "Battlefield 4",
    releaseYear: "2013",
  });
  const second = deriveSongId({
    title: "Battlefield 4 Warsaw Theme",
    artist: "Rami",
    album: "Battlefield 4 Original Soundtrack",
    releaseYear: "2014",
  });
  assert.equal(first, second);
});

test("media revisions are append-only and current revision advances", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v2-library-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const library = createSongLibrary({ root });
  const pkg = await library.ensureSongPackage({
    title: "Test Song",
    artist: "Test Artist",
    album: "Album A",
    releaseYear: "2026",
    durationSec: 180,
    platform: "NETEASE",
    trackUrl: "https://example.invalid/song",
  });

  const first = await library.allocateMediaRevision(pkg.song.songId);
  await library.commitMediaRevision(pkg.song.songId, {
    mediaRevisionId: first.mediaRevisionId,
    createdAt: "2026-10-05T00:00:00.000Z",
    acquisition: {
      provider: "test",
      sourceId: "a",
      sourceUrl: "https://example.invalid/a",
      sourceTitle: "A",
      channel: "Test",
      durationSec: 180,
      matchScore: 1,
      matchDecision: "auto_high",
      requiresSanityCheck: false,
      downloadedAt: "2026-10-05T00:00:00.000Z",
      sha256: "hash-a",
    },
    sourcePath: path.join(first.dir, "source.wav"),
    analysisPath: path.join(first.dir, "analysis.mp3"),
    analysisMimeType: "audio/mpeg",
    durationSec: 180,
  });

  const second = await library.allocateMediaRevision(pkg.song.songId);
  const manifest = await library.commitMediaRevision(pkg.song.songId, {
    mediaRevisionId: second.mediaRevisionId,
    createdAt: "2026-10-05T01:00:00.000Z",
    acquisition: {
      provider: "test",
      sourceId: "b",
      sourceUrl: "https://example.invalid/b",
      sourceTitle: "B",
      channel: "Test",
      durationSec: 181,
      matchScore: 0.9,
      matchDecision: "manual_selected",
      requiresSanityCheck: false,
      downloadedAt: "2026-10-05T01:00:00.000Z",
      sha256: "hash-b",
    },
    sourcePath: path.join(second.dir, "source.wav"),
    analysisPath: path.join(second.dir, "analysis.mp3"),
    analysisMimeType: "audio/mpeg",
    durationSec: 181,
  });

  assert.equal(manifest.mediaRevisions.length, 2);
  assert.equal(manifest.currentMediaRevisionId, second.mediaRevisionId);
  assert.equal(manifest.mediaRevisions[0].sha256, "hash-a");
  assert.equal(manifest.mediaRevisions[1].sha256, "hash-b");
});


test("Listen cache key includes media revision, provider, model and prompt version", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v2-listen-cache-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = createSongLibrary({ root });
  const pkg = await library.ensureSongPackage({
    title: "Cache Song",
    artist: "Cache Artist",
  });
  const revision = await library.allocateMediaRevision(pkg.song.songId);
  await library.commitMediaRevision(pkg.song.songId, {
    mediaRevisionId: revision.mediaRevisionId,
    createdAt: new Date().toISOString(),
    acquisition: {
      provider: "test",
      sourceId: "x",
      sourceUrl: "https://example.invalid/x",
      sourceTitle: "X",
      channel: "Test",
      durationSec: 120,
      matchScore: 1,
      matchDecision: "auto_high",
      requiresSanityCheck: false,
      downloadedAt: new Date().toISOString(),
      sha256: "hash-x",
    },
    sourcePath: path.join(revision.dir, "source.wav"),
    analysisPath: path.join(revision.dir, "analysis.mp3"),
    analysisMimeType: "audio/mpeg",
    durationSec: 120,
  });

  const observation = {
    schemaVersion: "2.0",
    listenRunId: "listen-run-1",
    songId: pkg.song.songId,
    mediaRevisionId: revision.mediaRevisionId,
    createdAt: new Date().toISOString(),
    provider: {
      name: "dashscope",
      model: "qwen3.5-omni-plus",
      promptVersion: "listen-v2.0.0",
    },
    globalProfile: {
      styleTags: [],
      moodTags: [],
      overallCharacter: "test",
      confidence: 1,
    },
    timeline: { durationSec: 120, sections: [] },
    observations: [],
    notableMoments: [],
    estimatedParameters: {
      bpm: { value: null, confidence: 0 },
      key: { value: null, confidence: 0 },
      meter: { value: null, confidence: 0 },
    },
    uncertainties: [],
  };
  await library.saveObservation(pkg.song.songId, observation);

  assert.equal(
    (
      await library.findReusableObservation(pkg.song.songId, {
        mediaRevisionId: revision.mediaRevisionId,
        provider: "dashscope",
        model: "qwen3.5-omni-plus",
        promptVersion: "listen-v2.0.0",
      })
    )?.listenRunId,
    "listen-run-1",
  );
  assert.equal(
    await library.findReusableObservation(pkg.song.songId, {
      mediaRevisionId: revision.mediaRevisionId,
      provider: "dashscope",
      model: "another-model",
      promptVersion: "listen-v2.0.0",
    }),
    null,
  );
});

test("Research cache respects provider/model/backend and TTL", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v2-research-cache-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = createSongLibrary({ root });
  const pkg = await library.ensureSongPackage({
    title: "Research Song",
    artist: "Research Artist",
  });
  const artifact = {
    schemaVersion: "2.0",
    researchRunId: "research-run-1",
    songId: pkg.song.songId,
    createdAt: new Date().toISOString(),
    provider: { name: "dashscope", model: "qwen3.5-omni-plus" },
    backend: "registered-web",
    guidedByObservationIds: [],
    sourceIds: [],
    summary: "test",
    findings: [],
    unknowns: [],
  };
  await library.saveResearch(pkg.song.songId, artifact, []);

  assert.equal(
    (
      await library.findReusableResearch(pkg.song.songId, {
        provider: "dashscope",
        model: "qwen3.5-omni-plus",
        backend: "registered-web",
        maxAgeMs: 60_000,
      })
    )?.artifact?.researchRunId,
    "research-run-1",
  );
  assert.equal(
    await library.findReusableResearch(pkg.song.songId, {
      provider: "dashscope",
      model: "other-model",
      backend: "registered-web",
      maxAgeMs: 60_000,
    }),
    null,
  );
});

test("Studio seeds persist as independent immutable artifacts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v2-studio-seed-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = createSongLibrary({ root });
  const pkg = await library.ensureSongPackage({
    title: "Studio Song",
    artist: "Studio Artist",
  });
  const seed = {
    schemaVersion: "2.0",
    studioSeedId: "studio-seed-1",
    blueprintId: "blueprint-1",
    songId: pkg.song.songId,
    analysisId: "analysis-1",
    sourceType: "learning_reconstruction",
    sourceObservationIds: ["obs-1"],
    sourceInterpretationIds: ["int-1"],
    code: 's("bd ~ sd ~")',
    alternativeCode: 's("bd hh sd hh")',
    explanation: "test",
    visualHints: ["punchcard"],
    playback: {
      bpm: 120,
      beatsPerCycle: 4,
      soundBank: "kua-synth-v1",
      runtimeVersion: "test-runtime",
    },
    experiment: {
      question: "test",
      variable: "rhythmic_density",
      baseline: "sparse",
      changed: "dense",
      constants: ["tempo"],
      listenFor: ["density"],
      limitation: "learning reconstruction",
    },
  };
  const manifest = await library.saveStudioSeed(pkg.song.songId, seed);
  assert.ok(manifest.studioSeedIds.includes("studio-seed-1"));
  assert.deepEqual(
    await library.loadStudioSeed(pkg.song.songId, "studio-seed-1"),
    seed,
  );
});
