import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSongLibrary } from "../server/v2/songLibrary.mjs";
import { createV4BridgeService } from "../server/v4/v4BridgeService.mjs";

function candidate() {
  return {
    sourceId: "abc123XYZ",
    url: "https://www.youtube.com/watch?v=abc123XYZ",
    title: "Antagonistic",
    artistHint: "VARLAN",
    albumHint: null,
    channel: "VARLAN - Topic",
    durationSec: 165,
    isOfficial: false,
    isTopic: true,
    isPublisher: false,
    matchScore: 0.96,
    scoreParts: {
      title: 0.35,
      artist: 0.25,
      duration: 0.2,
      albumVersion: 0.08,
      authority: 0.08,
      variantPenalty: 0,
    },
  };
}

function youtubeMock() {
  const selected = candidate();
  return {
    async search() {
      return [selected];
    },
    async resolveSelected(_song, sourceId) {
      assert.equal(sourceId, selected.sourceId);
      return selected;
    },
    async acquire(_candidate, { destinationDir }) {
      await fs.mkdir(destinationDir, { recursive: true });
      const sourcePath = path.join(destinationDir, "source.webm");
      const analysisPath = path.join(destinationDir, "analysis.mp3");
      await fs.writeFile(sourcePath, "source-audio");
      await fs.writeFile(analysisPath, "analysis-audio");
      return {
        sourcePath,
        analysisPath,
        analysisMimeType: "audio/mpeg",
        durationSec: 165,
        sha256: "a".repeat(64),
        acquisition: {
          provider: "youtube",
          sourceId: selected.sourceId,
          sourceUrl: selected.url,
          sourceTitle: selected.title,
          channel: selected.channel,
          durationSec: selected.durationSec,
          matchScore: selected.matchScore,
          matchDecision: "manual_selected",
          requiresSanityCheck: false,
          downloadedAt: "2026-10-07T12:00:00.000Z",
        },
      };
    },
  };
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

test("v4 browser bridge materializes a selected recording and prepares an Antigravity run", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-bridge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const library = createSongLibrary({ root: path.join(root, "library") });
  const service = createV4BridgeService({
    library,
    youtube: youtubeMock(),
    runsRoot: path.join(root, "runs"),
    now: () => new Date("2026-10-07T12:00:00.000Z"),
  });
  const song = {
    id: "netease:123",
    title: "Antagonistic",
    artist: "VARLAN",
    album: "Cyberpunk Radio",
    durationSec: 165,
    platform: "NETEASE",
    trackUrl: "https://music.163.com/#/song?id=123",
  };

  const preview = await service.prepare({ song });
  assert.equal(preview.status, "confirmation_required");
  assert.equal(preview.candidates[0].sourceId, "abc123XYZ");

  const ready = await service.prepare({
    song,
    selectedSourceId: "abc123XYZ",
    forceRematch: true,
  });
  assert.equal(ready.status, "run_queued");
  assert.equal(typeof ready.requestId, "string");
  assert.equal(ready.session.online, false);
  assert.equal(
    await fs.readFile(path.join(ready.runDir, "input.mp3"), "utf8"),
    "analysis-audio",
  );

  const task = JSON.parse(
    await fs.readFile(path.join(ready.runDir, "task.json"), "utf8"),
  );
  assert.equal(task.requestedBy, "kua-browser-session");
  assert.equal(task.identity.title, "Antagonistic");
  assert.equal(task.identity.platform, "NETEASE");
  assert.equal(task.recording.durationSec, 165);

  const status = await service.status(ready.runId);
  assert.equal(status.summary.listen.state, "missing");
  assert.equal(status.summary.analysis.state, "missing");
  assert.equal(status.runDir, ready.runDir);
  assert.equal(status.requests.analysis.status, "queued");
  assert.equal(status.requests.analysis.requestId, ready.requestId);
  assert.equal(status.session.online, false);
});

test("v4 browser bridge observes Antigravity artifacts without invoking a model runtime", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-poll-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const library = createSongLibrary({ root: path.join(root, "library") });
  const service = createV4BridgeService({
    library,
    youtube: youtubeMock(),
    runsRoot: path.join(root, "runs"),
  });
  const song = {
    title: "Antagonistic",
    artist: "VARLAN",
    durationSec: 165,
    platform: "NETEASE",
  };

  const preview = await service.prepare({ song });
  const ready = await service.prepare({
    song,
    selectedSourceId: preview.candidates[0].sourceId,
    forceRematch: true,
  });

  await writeJson(path.join(ready.runDir, "listen.json"), {
    schemaVersion: "4.0",
    status: "complete",
    error: null,
    audioDurationSec: 165,
    overallCharacter: "Cold electronic tension.",
    observations: [],
    notableMoments: [],
    uncertainties: [],
  });
  await writeJson(path.join(ready.runDir, "analysis.json"), {
    schemaVersion: "4.0",
    status: "partial",
    inputStatus: { listen: "complete", dsp: "missing", research: "missing" },
    overall: {
      hook: "Hook",
      emo: "Emo",
      hype: "Hype",
      pro: "Pro",
      overallCharacter: "Character",
    },
    interpretations: [
      {
        id: "int-001",
        category: "rhythm",
        text: "Density increases.",
        observationIds: [],
        measurementIds: [],
        evidenceIds: [],
        generalPrinciples: [],
      },
      {
        id: "int-002",
        category: "timbre",
        text: "Texture brightens.",
        observationIds: [],
        measurementIds: [],
        evidenceIds: [],
        generalPrinciples: [],
      },
    ],
    modules: [],
    unknowns: [],
    studioPotential: {
      eligible: true,
      mechanism: "rhythmic density",
      sourceInterpretationIds: ["int-001"],
      variable: "rhythmic_density",
      baseline: "sparse",
      changed: "dense",
      listenFor: ["urgency"],
      limitation: "Learning reconstruction.",
    },
    warnings: [],
  });

  const polled = await service.status(ready.runId);
  assert.equal(polled.summary.listen.status, "complete");
  assert.equal(polled.summary.analysis.status, "partial");
  assert.equal(polled.artifacts.analysis.value.overall.hook, "Hook");

  const creative = await service.requestCreative(ready.runId, "int-001");
  assert.equal(creative.status, "creative_queued");
  assert.equal(typeof creative.requestId, "string");
  assert.equal(creative.interpretationId, "int-001");

  const request = JSON.parse(
    await fs.readFile(
      path.join(ready.runDir, "browser-creative-request.json"),
      "utf8",
    ),
  );
  assert.equal(request.interpretationId, "int-001");
  assert.equal(request.status, "queued");
  assert.equal(request.kind, "creative");
});

test("v4 creative request archives stale Studio output for another interpretation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-stale-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const library = createSongLibrary({ root: path.join(root, "library") });
  const service = createV4BridgeService({
    library,
    youtube: youtubeMock(),
    runsRoot: path.join(root, "runs"),
  });
  const song = {
    title: "Antagonistic",
    artist: "VARLAN",
    durationSec: 165,
  };
  const preview = await service.prepare({ song });
  const ready = await service.prepare({
    song,
    selectedSourceId: preview.candidates[0].sourceId,
    forceRematch: true,
  });

  await writeJson(path.join(ready.runDir, "analysis.json"), {
    interpretations: [{ id: "int-001" }, { id: "int-002" }],
  });
  await writeJson(path.join(ready.runDir, "studio.json"), {
    sourceInterpretationIds: ["int-001"],
  });

  await service.requestCreative(ready.runId, "int-002");

  await assert.rejects(
    fs.access(path.join(ready.runDir, "studio.json")),
  );
  const history = await fs.readdir(path.join(ready.runDir, "studio-history"));
  assert.equal(history.length, 1);
});
