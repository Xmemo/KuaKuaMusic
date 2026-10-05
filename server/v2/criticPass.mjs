import crypto from "node:crypto";
import { AppError, invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";
import { createStructuredTextProvider } from "./textProvider.mjs";
import { validateTimedCue } from "./observationValidation.mjs";

const serialize = (value) => JSON.stringify(value, null, 2);

function sourceEvidenceIds(sources) {
  return new Set(
    (sources || []).flatMap((source) =>
      source.excerpts.map((excerpt) => excerpt.id),
    ),
  );
}

export function validateCriticReferences(
  draft,
  { observation = null, sources = [] } = {},
) {
  const observationIds = new Set(
    observation?.observations?.map((item) => item.id) || [],
  );
  const evidenceIds = sourceEvidenceIds(sources);
  const interpretationIds = new Set();

  for (const item of draft.interpretations) {
    invariant(
      item.id.trim() && !interpretationIds.has(item.id),
      "Critic interpretation ID 缺失或重复。",
    );
    interpretationIds.add(item.id);
    invariant(
      item.observationIds.length + item.evidenceIds.length > 0,
      "歌曲解释必须至少依赖一个听觉观察或外部资料片段。",
    );
    for (const id of item.observationIds)
      invariant(observationIds.has(id), "Critic 引用了不存在的听觉观察。");
    for (const id of item.evidenceIds)
      invariant(evidenceIds.has(id), "Critic 引用了不存在的外部资料片段。");
  }

  for (const expression of Object.values(draft.overallVibe)) {
    invariant(expression.text.trim(), "总体概括不能为空。");
    invariant(
      expression.interpretationIds.length > 0,
      "总体概括必须指向已有解释。",
    );
    for (const id of expression.interpretationIds)
      invariant(
        interpretationIds.has(id),
        "总体概括引用了不存在的解释。",
      );
  }

  const moduleIds = new Set();
  const byInterpretation = new Map(
    draft.interpretations.map((item) => [item.id, item]),
  );
  for (const module of draft.modules) {
    invariant(
      module.id.trim() && !moduleIds.has(module.id),
      "Critic module ID 缺失或重复。",
    );
    moduleIds.add(module.id);
    invariant(
      module.interpretationIds.length > 0,
      "Critic 模块必须引用至少一个解释。",
    );
    for (const id of module.interpretationIds) {
      const interpretation = byInterpretation.get(id);
      invariant(interpretation, "Critic 模块引用了不存在的解释。");
      invariant(
        interpretation.category === module.category,
        "Critic 模块不能把不同类别的解释混成同一事实。",
      );
    }
    for (const cue of module.listeningCues) {
      for (const id of cue.observationIds)
        invariant(observationIds.has(id), "听歌线索引用了不存在的观察。");
      for (const id of cue.evidenceIds)
        invariant(evidenceIds.has(id), "听歌线索引用了不存在的资料片段。");
      if (cue.startSec !== null || cue.endSec !== null) {
        invariant(
          cue.startSec !== null &&
            cue.endSec !== null &&
            cue.endSec >= cue.startSec,
          "带时间范围的听歌线索必须提供有效起止秒数。",
        );
        invariant(
          cue.observationIds.length > 0,
          "精确时间听歌线索必须有 Audio Observation 支持。",
        );
        validateTimedCue(cue, observation);
      }
    }
  }
  return draft;
}

function criticPrompt(song, observation, research, sources) {
  return [
    "You are the Critic Pass for MusicLearning2026 v2. Write in Simplified Chinese except proper names.",
    "Your job is to explain why THIS recording is musically interesting by combining independent audio observations with registered external research.",
    "Never rewrite a style prior or general genre stereotype as a fact about this song.",
    "AUDIO OBSERVATIONS are first-hand machine observations, not exact score/transcription measurements. Preserve their uncertainty and timestamps.",
    "RESEARCH FINDINGS are external claims and may only use the registered excerpt evidenceIds already provided.",
    "Preserve each finding's scope and versionScope in your text: work-level background stays valid even if the recording is uncertain; source-version details must name that version and must not silently become facts about the selected recording. Keep relevant input unknowns visible.",
    "GENERAL PRINCIPLES may explain mechanisms such as repetition, contrast, density, register or timbre. Put those principles only in generalPrinciples; they do not need a song-specific citation, but they cannot introduce a new song fact.",
    "Every interpretation must reference at least one valid observationId or evidenceId. Prefer both when independent listening and human/external material converge.",
    "Do not invent BPM, exact chords, instruments, plugins or production processes that are absent from the inputs.",
    "Create dynamic modules only where there is something worth explaining. Allowed categories: culture,rhythm,harmony,melody,timbre,arrangement,structure,production,energy.",
    "Each module must reference interpretations of the same category.",
    "Listening cues should tell the user where/what to hear. A cue with exact startSec/endSec must cite at least one time-localized Audio Observation.",
    "Overall hook/走心(emo)/上头(hype)/懂行(pro) should be genuinely different expressions but each must list the interpretationIds it uses.",
    "studioPotential is none,rhythm,harmony,arrangement,mixed. Mark it only when the explained mechanism could become a useful learning reconstruction.",
    "Return the complete v2-critic-draft JSON and nothing else.",
    "SONG:\n" + serialize(song),
    "AUDIO OBSERVATION:\n" + serialize(observation),
    "RESEARCH ARTIFACT:\n" + serialize(research),
    "REGISTERED SOURCES:\n" + serialize(sources),
  ].join("\n\n");
}

export function createCriticPass({
  selection,
  env = process.env,
  fetcher = fetch,
} = {}) {
  const provider = createStructuredTextProvider(selection, { env, fetcher });

  async function run(
    song,
    {
      observation = null,
      research = null,
      sources = [],
      signal,
      onProgress,
    } = {},
  ) {
    if (!observation && !research) {
      throw new AppError(
        "Critic 至少需要 Listen 或 Research 其中一项。",
        "V2_ARTIFACT_NOT_READY",
        409,
      );
    }
    onProgress?.({
      stage: "critic",
      label: "正在把听到的内容与外部资料结合",
    });

    let draft = await provider.generateJson({
      schemaName: "v2-critic-draft",
      prompt: criticPrompt(song, observation, research, sources),
      signal,
    });
    try { validateCriticReferences(draft, { observation, sources }); }
    catch (error) {
      if (signal?.aborted) throw error;
      draft = await provider.generateJson({ schemaName: "v2-critic-draft", signal,
        prompt: criticPrompt(song, observation, research, sources) + "\n\nRepair this validation error: " + error.message +
          "\nUse null cue timestamps unless time-localized observations cover the entire cue range. Previous draft:\n" + serialize(draft) });
      validateCriticReferences(draft, { observation, sources });
    }

    const analysis = {
      schemaVersion: "2.0",
      analysisId: crypto.randomUUID(),
      songId: song.songId,
      listenRunId: observation?.listenRunId || null,
      researchRunId: research?.researchRunId || null,
      createdAt: new Date().toISOString(),
      provider: {
        name: selection.provider,
        model: selection.model,
      },
      ...draft,
    };
    return validateContract("v2-critic-analysis", analysis);
  }

  return Object.freeze({ run });
}
