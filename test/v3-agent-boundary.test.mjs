import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMusicAnalysisAgentRunner } from "../server/v3/agentRunner.mjs";
import { createMusicAnalysisAgent } from "../server/v3/musicAnalysisAgent.mjs";

function draft() {
  return {
    overall: {
      hook: "Hook",
      emo: "Emo",
      hype: "Hype",
      pro: "Pro",
      overallCharacter: "Character",
    },
    observations: [
      {
        id: "obs-1",
        category: "timbre",
        text: "A bright layer enters later.",
        startSec: 10,
        endSec: 20,
        confidence: 0.8,
      },
    ],
    measurements: [],
    externalEvidence: [],
    interpretations: [
      {
        id: "int-1",
        category: "timbre",
        text: "The added layer increases surface contrast.",
        observationIds: ["obs-1"],
        measurementIds: [],
        evidenceIds: [],
        generalPrinciples: ["Contrast increases salience."],
      },
    ],
    modules: [
      {
        id: "mod-1",
        category: "timbre",
        title: "Surface contrast",
        summary: "A new layer changes the texture.",
        interpretationIds: ["int-1"],
        listeningCues: [
          { text: "Listen for the new layer.", startSec: 10, endSec: 20 },
        ],
        unknowns: [],
      },
    ],
    unknowns: [],
    creativeExperiment: {
      eligible: false,
      mechanism: "",
      sourceInterpretationIds: [],
      variable: "",
      baseline: "",
      changed: "",
      constants: [],
      listenFor: [],
      code: null,
      alternativeCode: null,
      visualHints: [],
      limitation: "No experiment.",
    },
  };
}

test("future runner can plug in without changing the generic skill or pipeline", () => {
  const marker = {};
  const runner = createMusicAnalysisAgentRunner({
    config: {
      runner: "future-omni",
      command: "future",
      model: "future-music-model",
      effort: "adaptive",
      timeoutMs: 1,
      printTimeout: "1m",
      autoApprove: false,
      skill: { name: "music-analysis", version: "1.0.0" },
    },
    factories: {
      "future-omni": () => marker,
    },
  });
  assert.equal(runner, marker);
});

test("single agent persists generic runner metadata and requires Listen checkpoint", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-agent-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const audio = path.join(root, "audio.mp3");
  await fs.writeFile(audio, "fake-audio");

  const runner = {
    name: "future-omni",
    model: "future-music-model",
    effort: "adaptive",
    async run({ workspace }) {
      await fs.writeFile(
        workspace.checkpointPath,
        JSON.stringify({ independentListening: true }),
      );
      return {
        structuredOutput: draft(),
        conversationId: "conversation-1",
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        toolsUsed: ["audio_reader", "web_search"],
      };
    },
  };

  const agent = createMusicAnalysisAgent({
    env: {
      MUSIC_ANALYSIS_RUNNER: "future-omni",
      MUSIC_ANALYSIS_MODEL: "future-music-model",
      MUSIC_ANALYSIS_EFFORT: "adaptive",
    },
    runner,
  });
  const result = await agent.analyze({
    libraryRoot: root,
    song: {
      songId: "song-1",
      title: "Song",
      artist: "Artist",
      album: null,
      releaseYear: null,
    },
    media: {
      mediaRevisionId: "media-1",
      analysisPath: audio,
      durationSec: 60,
      acquisition: {},
    },
  });

  assert.equal(result.artifact.agent.runner, "future-omni");
  assert.equal(result.artifact.agent.model, "future-music-model");
  assert.equal(result.artifact.agent.skill.name, "music-analysis");
  assert.equal(result.artifact.agent.protocolChecks.listenCheckpointExists, true);
  assert.equal(result.artifact.agent.protocolChecks.noMcpDependency, true);
});

test("generic agent rejects MCP dependency even from a future runner", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-mcp-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const audio = path.join(root, "audio.mp3");
  await fs.writeFile(audio, "fake-audio");

  const runner = {
    name: "future-omni",
    model: "future",
    effort: "adaptive",
    async run({ workspace }) {
      await fs.writeFile(workspace.checkpointPath, "{}");
      return {
        structuredOutput: draft(),
        conversationId: null,
        usage: {},
        toolsUsed: ["mcp__musicbrainz__lookup"],
      };
    },
  };
  const agent = createMusicAnalysisAgent({
    env: { MUSIC_ANALYSIS_RUNNER: "future-omni" },
    runner,
  });
  await assert.rejects(
    () =>
      agent.analyze({
        libraryRoot: root,
        song: {
          songId: "song-1",
          title: "Song",
          artist: "Artist",
          album: null,
          releaseYear: null,
        },
        media: {
          mediaRevisionId: "media-1",
          analysisPath: audio,
          durationSec: 60,
          acquisition: {},
        },
      }),
    /MCP/,
  );
});
