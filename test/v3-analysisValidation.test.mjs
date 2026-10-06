import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateV3AnalysisDraft } from "../server/v3/analysisValidation.mjs";

function draft() {
  return {
    overall: {
      hook: "A compact hook.",
      emo: "Emotional rendering.",
      hype: "Energetic rendering.",
      pro: "Technical rendering.",
      overallCharacter: "A restrained electronic piece.",
    },
    observations: [
      {
        id: "obs-1",
        category: "rhythm",
        text: "A stable pulse becomes denser around the middle.",
        startSec: 20,
        endSec: 40,
        confidence: 0.8,
      },
    ],
    measurements: [],
    externalEvidence: [],
    interpretations: [
      {
        id: "int-1",
        category: "rhythm",
        text: "Surface density increases over a stable frame.",
        observationIds: ["obs-1"],
        measurementIds: [],
        evidenceIds: [],
        generalPrinciples: ["Stable pulse can preserve continuity while density changes."],
      },
    ],
    modules: [
      {
        id: "mod-1",
        category: "rhythm",
        title: "Density without tempo change",
        summary: "The section gains urgency through added events.",
        interpretationIds: ["int-1"],
        listeningCues: [
          {
            text: "Compare the event density.",
            startSec: 20,
            endSec: 40,
          },
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
      limitation: "No experiment is necessary.",
    },
  };
}

test("valid unified draft passes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-valid-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(
    (await validateV3AnalysisDraft(draft(), {
      durationSec: 100,
      workspaceRoot: root,
    })).observations[0].id,
    "obs-1",
  );
});

test("dangling interpretation references are rejected", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-ref-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const value = draft();
  value.interpretations[0].observationIds = ["missing"];
  await assert.rejects(
    () =>
      validateV3AnalysisDraft(value, {
        durationSec: 100,
        workspaceRoot: root,
      }),
    /不存在的 observation/,
  );
});

test("timestamps outside the actual recording are rejected", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-time-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const value = draft();
  value.observations[0].endSec = 150;
  await assert.rejects(
    () =>
      validateV3AnalysisDraft(value, {
        durationSec: 100,
        workspaceRoot: root,
      }),
    /超出本地音频/,
  );
});

test("measurement artifact paths must resolve to real workspace files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-measure-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const value = draft();
  value.measurements.push({
    id: "measure-1",
    kind: "tempo_bpm",
    value: 108.8,
    unit: "BPM",
    method: "onset-envelope autocorrelation",
    confidence: 0.8,
    startSec: null,
    endSec: null,
    alternatives: [{ value: 217.6, confidence: 0.3 }],
    artifactPath: "measurements/tempo.json",
    notes: ["double-time candidate retained"],
  });
  value.interpretations[0].measurementIds = ["measure-1"];

  await assert.rejects(
    () =>
      validateV3AnalysisDraft(value, {
        durationSec: 100,
        workspaceRoot: root,
      }),
    /不存在的测量文件/,
  );

  await fs.mkdir(path.join(root, "measurements"), { recursive: true });
  await fs.writeFile(path.join(root, "measurements", "tempo.json"), "{}");
  await validateV3AnalysisDraft(value, {
    durationSec: 100,
    workspaceRoot: root,
  });
});

test("eligible creative experiment must pass Strudel runtime validation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v3-studio-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const value = draft();
  value.creativeExperiment = {
    eligible: true,
    mechanism: "event density",
    sourceInterpretationIds: ["int-1"],
    variable: "rhythmic_density",
    baseline: "sparse pulse",
    changed: "denser pulse",
    constants: ["tempo"],
    listenFor: ["urgency"],
    code: 's("bd ~ sd ~")',
    alternativeCode: 's("bd hh sd hh")',
    visualHints: ["punchcard"],
    limitation: "Learning reconstruction, not the original pattern.",
  };
  await validateV3AnalysisDraft(value, {
    durationSec: 100,
    workspaceRoot: root,
  });

  value.creativeExperiment.code = 'fetch("https://example.com")';
  await assert.rejects(
    () =>
      validateV3AnalysisDraft(value, {
        durationSec: 100,
        workspaceRoot: root,
      }),
    /不支持的 JavaScript 操作|fetch/i,
  );
});
