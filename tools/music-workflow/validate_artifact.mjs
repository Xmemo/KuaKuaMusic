#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import { validateStudioCode } from "../../studio/runtimePolicy.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function fail(message) {
  const error = new Error(message);
  error.code = "WORKFLOW_V4_VALIDATION_FAILED";
  throw error;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function ids(items, label) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.id) fail(label + " contains an item without id");
    if (map.has(item.id)) fail(label + " contains duplicate id: " + item.id);
    map.set(item.id, item);
  }
  return map;
}

function assertRefs(values, available, label) {
  for (const value of values || []) {
    if (!available.has(value)) fail(label + " references missing id: " + value);
  }
}

function assertRange(start, end, duration, label) {
  if (start == null && end == null) return;
  if (start == null || end == null)
    fail(label + " must provide both startSec and endSec or neither");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start)
    fail(label + " has invalid time range");
  if (Number.isFinite(duration) && end > duration + 1)
    fail(label + " exceeds measured audio duration");
}

function assertStatusError(value, label) {
  if (value.status === "failed" && !String(value.error || "").trim())
    fail(label + " failed artifact must include an error");
  if (value.status === "complete" && value.error != null)
    fail(label + " complete artifact must have error=null");
}

async function loadSchema(kind) {
  const file = path.join(ROOT, "schemas", "workflow-v4", kind + ".schema.json");
  return readJson(file);
}

async function validateSchema(kind, value) {
  const schema = await loadSchema(kind);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    const message = (validate.errors || [])
      .slice(0, 8)
      .map((error) => (error.instancePath || "/") + " " + error.message)
      .join("; ");
    fail(kind + " schema validation failed: " + message);
  }
}

function validateDsp(value) {
  assertStatusError(value, "DSP");
  const methodIds = ids(value.methods, "DSP methods");
  const measurementIds = ids(value.measurements, "DSP measurements");
  const duration = value.sourceAudio?.durationSec;

  if (value.status === "complete") {
    if (!Number.isFinite(duration) || duration <= 0)
      fail("complete DSP artifact requires measured duration");
    if (!value.rmsTimeline.length)
      fail("complete DSP artifact requires an RMS timeline");
  }

  for (const item of value.rmsTimeline) {
    assertRange(item.startSec, item.endSec, duration, "RMS timeline item");
  }

  for (const item of value.measurements) {
    if (!methodIds.has(item.methodId))
      fail("measurement " + item.id + " references missing method " + item.methodId);
    assertRange(item.startSec, item.endSec, duration, "measurement " + item.id);
  }

  for (const point of value.changePoints) {
    if (!measurementIds.has(point.id))
      fail("RMS change point " + point.id + " must have a normalized measurement with the same id");
    if (Number.isFinite(duration) && point.atSec > duration + 1)
      fail("RMS change point " + point.id + " exceeds measured audio duration");
  }
}

function validateListen(value) {
  assertStatusError(value, "Listen");
  const observationIds = ids(value.observations, "Listen observations");
  const momentIds = ids(value.notableMoments, "Listen notable moments");
  void momentIds;
  const duration = value.audioDurationSec;

  if (value.status === "complete") {
    if (!value.observations.length)
      fail("complete Listen artifact requires at least one observation");
    if (!String(value.overallCharacter || "").trim())
      fail("complete Listen artifact requires overallCharacter");
  }

  for (const item of value.observations) {
    if (item.precision === "global") {
      if (item.startSec != null || item.endSec != null)
        fail("global observation " + item.id + " must not carry a precise time range");
    } else {
      assertRange(item.startSec, item.endSec, duration, "observation " + item.id);
    }
  }

  for (const item of value.notableMoments) {
    assertRange(item.startSec, item.endSec, duration, "notable moment " + item.id);
    assertRefs(item.observationIds, observationIds, "notable moment " + item.id);
  }
}

function validateResearch(value) {
  assertStatusError(value, "Research");
  const sourceIds = ids(value.sources, "Research sources");
  ids(value.findings, "Research findings");

  for (const source of value.sources) {
    let url;
    try {
      url = new URL(source.url);
    } catch {
      fail("research source " + source.id + " has invalid URL");
    }
    if (!["http:", "https:"].includes(url.protocol))
      fail("research source " + source.id + " must use http/https");
    if (!String(source.excerpt || "").trim())
      fail("research source " + source.id + " requires supporting excerpt/paraphrase");
  }

  for (const finding of value.findings) {
    if (!finding.sourceIds.length)
      fail("research finding " + finding.id + " must reference at least one source");
    assertRefs(finding.sourceIds, sourceIds, "research finding " + finding.id);
  }
}

async function validateAnalysis(value, runDir) {
  const interpretationIds = ids(value.interpretations, "Analysis interpretations");
  ids(value.modules, "Analysis modules");

  let listen = null;
  let dsp = null;
  let research = null;

  if (runDir) {
    const readOptional = async (name) => {
      try {
        return await readJson(path.join(runDir, name));
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
      }
    };
    [listen, dsp, research] = await Promise.all([
      readOptional("listen.json"),
      readOptional("dsp.json"),
      readOptional("research.json"),
    ]);
  }

  const observationIds = ids(listen?.observations || [], "Available observations");
  const measurementIds = ids(dsp?.measurements || [], "Available measurements");
  const evidenceIds = ids(research?.findings || [], "Available research findings");

  const expected = {
    listen: listen?.status || "missing",
    dsp: dsp?.status || "missing",
    research: research?.status || "missing",
  };
  if (runDir) {
    for (const key of Object.keys(expected)) {
      if (value.inputStatus[key] !== expected[key])
        fail(
          "analysis inputStatus." +
            key +
            "=" +
            value.inputStatus[key] +
            " but run artifact status is " +
            expected[key],
        );
    }
  }

  if (value.inputStatus.listen !== "complete")
    fail("final music analysis requires a complete Listen artifact");

  const optionalFailure =
    value.inputStatus.dsp !== "complete" || value.inputStatus.research !== "complete";
  if (optionalFailure && value.status === "complete")
    fail("analysis must be partial when DSP or Research is unavailable");

  const duration =
    dsp?.sourceAudio?.durationSec ?? listen?.audioDurationSec ?? null;

  for (const item of value.interpretations) {
    assertRefs(item.observationIds, observationIds, "interpretation " + item.id);
    assertRefs(item.measurementIds, measurementIds, "interpretation " + item.id);
    assertRefs(item.evidenceIds, evidenceIds, "interpretation " + item.id);
    if (
      item.observationIds.length +
        item.measurementIds.length +
        item.evidenceIds.length ===
      0
    )
      fail("interpretation " + item.id + " has no recording/source basis");
  }

  for (const module of value.modules) {
    assertRefs(module.interpretationIds, interpretationIds, "module " + module.id);
    for (const cue of module.listeningCues)
      assertRange(cue.startSec, cue.endSec, duration, "listening cue in " + module.id);
  }

  const studio = value.studioPotential;
  assertRefs(
    studio.sourceInterpretationIds,
    interpretationIds,
    "studioPotential",
  );
  if (studio.eligible) {
    if (!studio.sourceInterpretationIds.length)
      fail("eligible studioPotential requires a source interpretation");
    for (const field of ["mechanism", "variable", "baseline", "changed", "limitation"]) {
      if (!String(studio[field] || "").trim())
        fail("eligible studioPotential missing " + field);
    }
    if (!studio.listenFor.length)
      fail("eligible studioPotential requires listenFor");
  }
}

async function validateStudio(value, runDir) {
  if (value.sourceType !== "learning_reconstruction")
    fail("Studio sourceType must remain learning_reconstruction");

  if (value.code.replace(/\s+/gu, "") === value.alternativeCode.replace(/\s+/gu, ""))
    fail("Studio A/B code must differ beyond whitespace");

  validateStudioCode(value.code);
  validateStudioCode(value.alternativeCode);

  if (runDir) {
    const analysis = await readJson(path.join(runDir, "analysis.json"));
    const interpretationIds = ids(
      analysis.interpretations,
      "Analysis interpretations",
    );
    assertRefs(
      value.sourceInterpretationIds,
      interpretationIds,
      "Studio artifact",
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const kind = String(args.kind || "");
  const file = args.file ? path.resolve(String(args.file)) : null;
  const runDir = args["run-dir"] ? path.resolve(String(args["run-dir"])) : null;

  if (!["dsp", "listen", "research", "analysis", "studio"].includes(kind))
    fail("--kind must be dsp|listen|research|analysis|studio");
  if (!file) fail("--file is required");

  const value = await readJson(file);
  await validateSchema(kind, value);

  if (kind === "dsp") validateDsp(value);
  if (kind === "listen") validateListen(value);
  if (kind === "research") validateResearch(value);
  if (kind === "analysis") await validateAnalysis(value, runDir);
  if (kind === "studio") await validateStudio(value, runDir);

  process.stdout.write(
    JSON.stringify({ ok: true, kind, file }) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(String(error?.message || error) + "\n");
  process.exitCode = 1;
});
