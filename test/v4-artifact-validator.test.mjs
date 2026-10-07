import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const validator = path.join(
  repoRoot,
  "tools",
  "music-workflow",
  "validate_artifact.mjs",
);

async function write(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

function run(kind, file, runDir) {
  const args = [validator, "--kind", kind, "--file", file];
  if (runDir) args.push("--run-dir", runDir);
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function artifacts() {
  const dsp = {
    schemaVersion: "4.0",
    status: "complete",
    error: null,
    sourceAudio: {
      path: "/tmp/test.wav",
      durationSec: 60,
      nativeSampleRateHz: 48000,
      channels: 2,
    },
    analysisPcm: {
      sampleRateHz: 48000,
      channels: 1,
      sampleFormat: "f32le",
      rmsWindowSec: 0.5,
    },
    loudness: {
      integratedLufs: -11.2,
      loudnessRangeLu: 4.0,
      truePeakDbfs: -0.8,
      method: "ffmpeg ebur128=peak=true",
    },
    rmsTimeline: [
      { startSec: 0, endSec: 0.5, rmsDbfs: -18.2 },
      { startSec: 0.5, endSec: 1, rmsDbfs: -17.9 },
    ],
    measurements: [
      {
        id: "measure-lufs-001",
        kind: "integrated_loudness",
        class: "deterministic_acoustic",
        value: -11.2,
        unit: "LUFS",
        methodId: "method-loudness-001",
        startSec: null,
        endSec: null,
        notes: [],
      },
    ],
    changePoints: [],
    methods: [
      {
        id: "method-loudness-001",
        kind: "integrated_loudness_lra_true_peak",
        method: "ffmpeg ebur128=peak=true",
        parameters: {},
        class: "deterministic_acoustic",
      },
    ],
    warnings: [],
  };

  const listen = {
    schemaVersion: "4.0",
    status: "complete",
    error: null,
    audioDurationSec: 60,
    overallCharacter: "A restrained electronic track with a later density lift.",
    observations: [
      {
        id: "obs-001",
        category: "rhythm",
        text: "A denser upper rhythmic layer enters in the middle section.",
        startSec: 20,
        endSec: 35,
        confidence: 0.85,
        precision: "time_localized",
      },
    ],
    notableMoments: [
      {
        id: "moment-001",
        title: "Density lift",
        startSec: 20,
        endSec: 35,
        observationIds: ["obs-001"],
      },
    ],
    uncertainties: [],
  };

  const research = {
    schemaVersion: "4.0",
    status: "complete",
    error: null,
    sources: [
      {
        id: "src-001",
        title: "Official release page",
        url: "https://example.com/release",
        publisher: "Example",
        sourceClass: "primary",
        excerpt: "The track appears on the official release.",
      },
    ],
    findings: [
      {
        id: "finding-001",
        topic: "release",
        text: "The track is listed on the official release.",
        sourceIds: ["src-001"],
        scope: "recording",
        confidence: 0.95,
      },
    ],
    unknowns: [],
  };

  const analysis = {
    schemaVersion: "4.0",
    status: "complete",
    inputStatus: {
      listen: "complete",
      dsp: "complete",
      research: "complete",
    },
    overall: {
      hook: "Stable frame, denser surface.",
      emo: "The track tightens without losing its cold restraint.",
      hype: "It gets more urgent by adding events rather than simply speeding up.",
      pro: "Surface rhythmic density rises over a stable temporal frame.",
      overallCharacter: "Controlled electronic tension with a mid-track density lift.",
    },
    interpretations: [
      {
        id: "int-001",
        category: "rhythm",
        text: "The perceived urgency is consistent with the denser rhythmic layer heard over a stable frame.",
        observationIds: ["obs-001"],
        measurementIds: ["measure-lufs-001"],
        evidenceIds: ["finding-001"],
        generalPrinciples: ["Greater event density can increase perceived urgency."],
      },
    ],
    modules: [
      {
        id: "module-001",
        category: "rhythm",
        title: "Density without a new tempo",
        summary: "The surface gets busier while continuity remains.",
        interpretationIds: ["int-001"],
        listeningCues: [
          { text: "Compare the upper rhythmic layer.", startSec: 20, endSec: 35 },
        ],
        unknowns: [],
      },
    ],
    unknowns: [],
    studioPotential: {
      eligible: true,
      mechanism: "rhythmic density",
      sourceInterpretationIds: ["int-001"],
      variable: "rhythmic_density",
      baseline: "sparse upper layer",
      changed: "denser upper layer",
      listenFor: ["urgency without a tempo change"],
      limitation: "Learning reconstruction only.",
    },
    warnings: [],
  };

  const studio = {
    schemaVersion: "4.0",
    sourceType: "learning_reconstruction",
    analysisId: "analysis-001",
    sourceInterpretationIds: ["int-001"],
    question: "How does rhythmic density change urgency?",
    variable: "rhythmic_density",
    baseline: "sparse",
    changed: "dense",
    constants: ["tempo", "kick/snare frame"],
    listenFor: ["surface urgency"],
    limitation: "This is a learning reconstruction, not the original transcription.",
    code: 's("bd ~ sd ~")',
    alternativeCode: 'stack(s("bd ~ sd ~"), s("hh*4").gain(0.3))',
    visualHints: ["punchcard"],
  };

  return { dsp, listen, research, analysis, studio };
}

test("v4 validator accepts a complete cross-referenced run", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-run-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const all = artifacts();

  for (const name of ["dsp", "listen", "research", "analysis", "studio"]) {
    await write(path.join(dir, name + ".json"), all[name]);
  }

  for (const name of ["dsp", "listen", "research"]) {
    const result = run(name, path.join(dir, name + ".json"));
    assert.equal(result.status, 0, result.stderr);
  }

  const analysisResult = run(
    "analysis",
    path.join(dir, "analysis.json"),
    dir,
  );
  assert.equal(analysisResult.status, 0, analysisResult.stderr);

  const studioResult = run("studio", path.join(dir, "studio.json"), dir);
  assert.equal(studioResult.status, 0, studioResult.stderr);
});

test("v4 final validator rejects dangling provenance", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-badref-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const all = artifacts();
  all.analysis.interpretations[0].measurementIds = ["missing-measurement"];

  for (const name of ["dsp", "listen", "research", "analysis"]) {
    await write(path.join(dir, name + ".json"), all[name]);
  }

  const result = run("analysis", path.join(dir, "analysis.json"), dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing id: missing-measurement/);
});

test("v4 Listen validator rejects global observations with fake precise timestamps", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-global-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { listen } = artifacts();
  listen.observations[0].precision = "global";
  await write(path.join(dir, "listen.json"), listen);

  const result = run("listen", path.join(dir, "listen.json"));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /global observation/);
});

test("v4 Studio validator rejects unsafe generated JavaScript", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-studio-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const all = artifacts();
  all.studio.code = 'fetch("https://example.com")';

  await write(path.join(dir, "analysis.json"), all.analysis);
  await write(path.join(dir, "studio.json"), all.studio);

  const result = run("studio", path.join(dir, "studio.json"), dir);
  assert.notEqual(result.status, 0);
});
