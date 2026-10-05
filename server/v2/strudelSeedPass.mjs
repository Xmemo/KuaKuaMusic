import crypto from "node:crypto";
import { parse } from "acorn";
import { AppError, invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";
import { createStructuredTextProvider } from "./textProvider.mjs";
import {
  validateStudioCode,
  validateRuntimePlayback,
} from "../../studio/runtimePolicy.mjs";
import {
  STRUDEL_RUNTIME_VERSION,
  STRUDEL_SOUND_BANK,
} from "../../studio/runtimeConfig.mjs";

const serialize = (value) => JSON.stringify(value, null, 2);
const ALLOWED_VISUALS = new Set([
  "pianoroll",
  "punchcard",
  "spiral",
  "scope",
  "spectrum",
  "pitchwheel",
]);

function experimentBpm(observation) {
  const estimate = observation?.estimatedParameters?.bpm;
  const value = Number(estimate?.value);
  if (
    Number.isFinite(value) &&
    value >= 20 &&
    value <= 300 &&
    Number(estimate?.confidence) >= 0.5
  ) {
    return Math.round(value);
  }
  return 120;
}

function seedPrompt(blueprint, plan, correction = "") {
  return [
    "You are the Strudel Seed Pass for MusicLearning2026 v2.",
    "Create a small A/B learning reconstruction from the supplied Creative Blueprint. This is NOT a transcription of the original recording.",
    "Return JSON only for v2-studio-seed-draft.",
    "code is the baseline Strudel pattern; alternativeCode is the changed condition. Keep the experiment small enough that the musical variable can be heard clearly.",
    "Use only Strudel musical expressions supported by the app. Do not write setcpm, imports, network calls, browser APIs, async code, external sample banks, or arbitrary JavaScript.",
    "Allowed built-in sounds: bd,sd,hh,oh,cp,sine,triangle,sawtooth,square.",
    "Safe examples of the intended language: s(\"bd ~ sd ~\"); stack(s(\"bd ~ sd ~\"), s(\"hh*4\").gain(0.3)); note(\"c3 ~ g3 ~\").s(\"sine\").",
    "Use only mechanisms represented in STRUDEL PLAN. Do not infer exact original notes, chords, instruments, or production settings.",
    "visualHints must be a subset of the visual hints supplied by STRUDEL PLAN.",
    "experiment.variable names the changed mechanism; constants state what remains fixed; limitation must explicitly say this is a learning reconstruction rather than the original transcription.",
    "experiment.variable must be the exact type of ONE variable in STRUDEL PLAN. Change only that variable and preserve other conditions. For tempo, apply the same fast/slow ratio to the whole pattern; the player base BPM is shared.",
    "BLUEPRINT:\n" + serialize(blueprint),
    "STRUDEL PLAN:\n" + serialize(plan),
    correction,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function validateDraft(draft, plan) {
  try {
    validateStudioCode(draft.code);
    validateStudioCode(draft.alternativeCode);
  } catch (error) {
    throw new AppError(
      "生成的 Strudel 教学乐句未通过运行时安全校验：" +
        String(error?.message || error),
      "V2_STUDIO_SEED_INVALID_CODE",
      422,
    );
  }
  invariant(
    JSON.stringify(parse(draft.code, { ecmaVersion: 2022 }), (key, value) => ["start", "end", "raw"].includes(key) ? undefined : value) !==
      JSON.stringify(parse(draft.alternativeCode, { ecmaVersion: 2022 }), (key, value) => ["start", "end", "raw"].includes(key) ? undefined : value),
    "Studio A/B 两个条件不能完全相同。",
  );
  invariant(plan.variables.some((item) => item.type === draft.experiment.variable),
    "Studio A/B 的变量必须是 Blueprint 中定义的一个变量类型。");
  const allowed = new Set(plan.visualHints || []);
  for (const hint of draft.visualHints) {
    invariant(ALLOWED_VISUALS.has(hint), "Studio visual hint 无效。");
    invariant(
      allowed.has(hint),
      "Studio Seed 不能使用 Blueprint 未映射出的 visual hint。",
    );
  }
  invariant(
    draft.experiment.listenFor.length > 0 &&
      draft.experiment.constants.length > 0 &&
      draft.experiment.variable.trim() &&
      draft.experiment.limitation.trim(),
    "Studio Seed 需要变量、控制条件、聆听目标和边界说明。",
  );
  return draft;
}

export function createStrudelSeedPass({
  selection,
  env = process.env,
  fetcher = fetch,
} = {}) {
  const provider = createStructuredTextProvider(selection, { env, fetcher });

  async function run(
    { song, observation, analysis, blueprint, plan },
    { signal, onProgress } = {},
  ) {
    if (!blueprint?.studioEligible || !plan?.eligible) return null;
    onProgress?.({
      stage: "creative_blueprint",
      label: "正在生成可播放的 Strudel A/B 教学实验",
    });

    const generate = async (correction = "") => {
      const draft = await provider.generateJson({
        schemaName: "v2-studio-seed-draft",
        prompt: seedPrompt(blueprint, plan, correction),
        signal,
      });
      return validateDraft(draft, plan);
    };

    let draft;
    try {
      draft = await generate();
    } catch (error) {
      if (signal?.aborted || !["V2_STUDIO_SEED_INVALID_CODE", "EVIDENCE_INTEGRITY"].includes(error.code)) throw error;
      draft = await generate(
        "The previous attempt failed app validation. Generate a simpler pattern using only the allowed built-in sounds and supported Strudel musical expressions. Do not repeat the invalid construct.",
      );
    }

    const playback = {
      bpm: experimentBpm(observation),
      beatsPerCycle: 4,
      soundBank: STRUDEL_SOUND_BANK,
      runtimeVersion: STRUDEL_RUNTIME_VERSION,
    };
    validateRuntimePlayback(playback);

    const seed = {
      schemaVersion: "2.0",
      studioSeedId: crypto.randomUUID(),
      blueprintId: blueprint.blueprintId,
      songId: song.songId,
      analysisId: analysis.analysisId,
      sourceType: "learning_reconstruction",
      sourceObservationIds: [...blueprint.sourceObservationIds],
      sourceInterpretationIds: [...blueprint.sourceInterpretationIds],
      ...draft,
      playback,
    };
    return validateContract("v2-studio-seed", seed);
  }

  return Object.freeze({ run });
}
