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
