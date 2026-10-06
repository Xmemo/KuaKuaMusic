import crypto from "node:crypto";
import { invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";
import { createStructuredTextProvider } from "./textProvider.mjs";

const serialize = (value) => JSON.stringify(value, null, 2);

export function validateCreativeReferences(
  draft,
  { observation, analysis },
) {
  const observationIds = new Set(
    observation?.observations?.map((item) => item.id) || [],
  );
  const interpretationIds = new Set(
    analysis?.interpretations?.map((item) => item.id) || [],
  );

  for (const id of draft.sourceObservationIds)
    invariant(
      observationIds.has(id),
      "Creative Blueprint 引用了不存在的听觉观察。",
    );
  for (const id of draft.sourceInterpretationIds)
    invariant(
      interpretationIds.has(id),
      "Creative Blueprint 引用了不存在的解释。",
    );

  const variableIds = new Set();
  for (const variable of draft.variables) {
    invariant(
      variable.id.trim() && !variableIds.has(variable.id),
      "Creative variable ID 缺失或重复。",
    );
    variableIds.add(variable.id);
    invariant(
      variable.sourceObservationIds.length > 0,
      "Creative variable 必须由具体 Audio Observation 支持。",
    );
    for (const id of variable.sourceObservationIds) {
      invariant(
        observationIds.has(id),
        "Creative variable 引用了不存在的听觉观察。",
      );
      invariant(
        draft.sourceObservationIds.includes(id),
        "Creative variable 的观察必须包含在 Blueprint 总体来源中。",
      );
    }
  }

  if (draft.studioEligible) {
    invariant(
      draft.variables.length > 0 &&
        draft.sourceObservationIds.length > 0 &&
        draft.sourceInterpretationIds.length > 0,
      "可进入 Studio 的 Blueprint 必须有观察、解释和可操作变量。",
    );
  }
  return draft;
}

export function includeVariableObservationSources(draft) {
  const sourceObservationIds = [
    ...new Set([
      ...draft.sourceObservationIds,
      ...draft.variables.flatMap((variable) => variable.sourceObservationIds),
    ]),
  ];
  if (sourceObservationIds.length === draft.sourceObservationIds.length)
    return draft;
  return { ...draft, sourceObservationIds };
}

function creativePrompt(song, observation, analysis) {
  return [
    "You are the Creative Pass for MusicLearning2026 v2.",
    "Turn supported musical mechanisms into a small learning experiment blueprint. Do NOT recreate or claim to transcribe the original recording.",
    "Every variable must be an executable musical dimension and cite one or more existing Audio Observation IDs.",
    "Allowed variable types: tempo,rhythmic_density,subdivision,syncopation,layer_entry,register,motif_repetition,harmonic_rhythm,texture_density,filter_motion,timbre_brightness.",
    "Do not map abstract words such as heroic, nostalgic, dark or exciting directly into code. First choose a concrete mechanism already grounded by the analysis.",
    "sourceInterpretationIds must refer to Critic interpretations that explain why the selected mechanism matters.",
    "baseline and variation should define a clean A/B contrast. preserve lists what should stay constant; listenFor states what the user should compare.",
    "If the analysis lacks a mechanism that can be represented honestly, set studioEligible=false and return no variables rather than inventing original-song details.",
    "This blueprint always leads to learning_reconstruction unless a separate verified transcription source is introduced later.",
    "Return the complete v2-creative-draft JSON and nothing else.",
    "SONG:\n" + serialize(song),
    "AUDIO OBSERVATION:\n" + serialize(observation),
    "CRITIC ANALYSIS:\n" + serialize(analysis),
  ].join("\n\n");
}

export function createCreativePass({
  selection,
  env = process.env,
  fetcher = fetch,
} = {}) {
  const provider = createStructuredTextProvider(selection, { env, fetcher });

  async function run(
    song,
    { observation, analysis, signal, onProgress } = {},
  ) {
    onProgress?.({
      stage: "creative_blueprint",
      label: "正在把分析转换成可实验的音乐变量",
    });
    const generated = await provider.generateJson({
      schemaName: "v2-creative-draft",
      prompt: creativePrompt(song, observation, analysis),
      signal,
    });
    const draft = includeVariableObservationSources(generated);
    validateCreativeReferences(draft, { observation, analysis });

    const blueprint = {
      schemaVersion: "2.0",
      blueprintId: crypto.randomUUID(),
      songId: song.songId,
      analysisId: analysis.analysisId,
      ...draft,
    };
    return validateContract("v2-creative-blueprint", blueprint);
  }

  return Object.freeze({ run });
}
