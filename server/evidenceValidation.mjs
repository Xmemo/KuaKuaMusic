import { validateContract } from "./schemaValidation.mjs";
import { invariant } from "./errors.mjs";

export function evidenceIndex(sources) {
  const sourceMap = new Map(),
    excerpts = new Map();
  for (const source of sources) {
    invariant(!sourceMap.has(source.id), "来源 ID 重复。");
    sourceMap.set(source.id, source);
    for (const excerpt of source.excerpts) {
      invariant(!excerpts.has(excerpt.id), "支撑片段 ID 重复。");
      excerpts.set(excerpt.id, { ...excerpt, source });
    }
  }
  return { sourceMap, excerpts };
}
function validateRegistry(sources, registry) {
  const canonical = new Map(registry.map((s) => [s.id, s]));
  for (const source of sources) {
    invariant(
      canonical.has(source.id) &&
        JSON.stringify(canonical.get(source.id)) === JSON.stringify(source),
      "来源必须来自服务端读取记录。",
    );
  }
}
const statusForKind = {
  external_evidence: "supported",
  user_perception: "interpreted",
  ai_interpretation: "interpreted",
  general_theory: "general",
  unknown: "unknown",
};
function validateClaims(claims, index, song, used = new Set()) {
  for (const claim of claims) {
    invariant(claim.id.trim() && !used.has(claim.id), "判断 ID 缺失或重复。");
    used.add(claim.id);
    invariant(claim.text.trim(), "判断内容为空。");
    invariant(
      statusForKind[claim.kind] === claim.status,
      "判断类型与状态不一致：" + claim.id,
    );
    if (claim.kind === "external_evidence")
      invariant(claim.evidenceIds.length > 0, "歌曲事实缺少支撑片段。");
    if (claim.kind === "general_theory")
      invariant(claim.versionScope === "general" && claim.scope.level === "general", "通用理论必须标为 general。");
    invariant(claim.scope.label.trim(), "判断必须说明适用对象。");
    if (claim.kind === "external_evidence")
      invariant(claim.scope.level !== "general", "外部事实必须标明来源适用对象。");
    for (const id of claim.evidenceIds) {
      const excerpt = index.excerpts.get(id);
      invariant(excerpt, "判断引用的支撑片段不存在。");
      invariant(
        excerpt.topics.includes(claim.topic),
        "片段的支持范围不包含该判断。",
      );
      if (claim.scope.level !== "general")
        invariant(excerpt.source.versionScope === claim.versionScope, "资料与判断的版本范围不匹配。");
    }
    if (claim.scope.level === "recording" && claim.topic !== "identity") {
      invariant(
        song.identityStatus === "resolved",
        "录音版本未确定时不能确认录音专属判断。",
      );
      invariant(
        claim.versionScope === song.versionScope && claim.scope.label === song.versionScope,
        "判断不适用于当前录音版本。",
      );
    }
    if (claim.scope.level === "work")
      invariant(claim.versionScope !== "general", "作品判断必须保留来源范围。");
    if (claim.scope.level === "source_version")
      invariant(claim.scope.label === claim.versionScope, "来源版本判断必须显示来源所述范围。");
  }
  for (const claim of claims)
    for (const id of claim.prerequisiteClaimIds)
      invariant(used.has(id) && id !== claim.id, "判断引用的前提不存在。");
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  for (const claim of claims)
    if (claim.kind === "ai_interpretation")
      invariant(
        claim.prerequisiteClaimIds.length > 0 &&
          claim.prerequisiteClaimIds.every((id) => claimById.has(id)),
        "解释与推断必须指明其依据。",
      );
  return used;
}
export function validateSongAnalysisIntegrity(analysis, registry = []) {
  validateContract("song-analysis", analysis);
  validateRegistry(analysis.sources, registry);
  const index = evidenceIndex(analysis.sources),
    used = new Set(),
    moduleIds = new Set();
  invariant(analysis.song.versionScope.trim(), "歌曲版本范围不能为空。");
  if (analysis.song.identityStatus === "ambiguous")
    invariant(
      analysis.song.candidates.length >= 2,
      "版本歧义需要至少两个候选。",
    );
  for (const module of analysis.modules) {
    invariant(
      module.id.trim() && !moduleIds.has(module.id),
      "分析点 ID 缺失或重复。",
    );
    moduleIds.add(module.id);
    invariant(module.claims.length > 0, "分析点必须包含判断或通用理论。");
    for (const id of [...module.summaryClaimIds, ...module.explanationClaimIds])
      invariant(module.claims.some((claim) => claim.id === id), "模块说明引用了其他模块或不存在的判断。");
    for (const cue of module.listeningCues) {
      for (const id of cue.claimIds)
        invariant(module.claims.some((claim) => claim.id === id), "听歌线索引用了不存在的模块判断。");
      if (cue.scope === "recording")
        invariant(cue.claimIds.some((id) => module.claims.some((claim) => claim.id === id && claim.scope.level === "recording")), "录音听歌线索需要录音范围的依据。");
      if (cue.scope === "source_version")
        invariant(cue.claimIds.some((id) => module.claims.some((claim) => claim.id === id && claim.scope.level === "source_version")), "来源版本听歌线索需要来源版本范围的依据。");
    }
  }
  validateClaims(analysis.modules.flatMap((module) => module.claims), index, analysis.song, used);
  for (const expression of Object.values(analysis.overallVibe)) {
    for (const id of expression.claimIds)
      invariant(used.has(id), "总体观感引用了不存在的判断。");
    if (expression.text.trim())
      invariant(
        expression.claimIds.length > 0 || used.size === 0,
        "总体观感需要标出解释依据。",
      );
  }
  const coreCategories = ["culture", "harmony", "rhythm", "timbre"];
  invariant(analysis.coverage.length === coreCategories.length, "四个核心维度都必须有覆盖状态。");
  const coverageSeen = new Set();
  for (const entry of analysis.coverage) {
    invariant(coreCategories.includes(entry.category) && !coverageSeen.has(entry.category), "核心维度重复或无效。");
    coverageSeen.add(entry.category);
    for (const id of entry.moduleIds)
      invariant(analysis.modules.some((module) => module.id === id && module.category === entry.category && module.claims.some((claim) => claim.topic !== "identity" && ["external_evidence", "ai_interpretation", "user_perception"].includes(claim.kind))), "维度状态引用了不匹配或只有通用理论的模块。");
    if (entry.status === "analyzed")
      invariant(entry.moduleIds.some((id) => analysis.modules.find((module) => module.id === id)?.claims.some((claim) => claim.topic !== "identity" && ["external_evidence", "ai_interpretation", "user_perception"].includes(claim.kind))), "纯通用指导或身份资料不能标为已分析。");
    else invariant(entry.moduleIds.length === 0, "资料不足或听歌指导不能挂载为歌曲分析模块。");
  }
  const analyzedDimensions = analysis.coverage.filter((entry) => entry.status === "analyzed").length;
  invariant(
    (analysis.completionStatus === "complete" && analyzedDimensions === 4) ||
      (analysis.completionStatus === "partial" && analyzedDimensions > 0) ||
      (analysis.completionStatus === "insufficient" && analyzedDimensions === 0),
    "分析完成状态与四维覆盖不匹配。",
  );
  return analysis;
}
export function validateDeepDiveIntegrity(
  deepDive,
  analysis,
  expectedId,
  registry = [],
) {
  validateContract("deep-dive", deepDive);
  validateRegistry(deepDive.sources, registry);
  invariant(
    deepDive.analysisItemId === expectedId,
    "深挖结果与所选分析点不一致。",
  );
  const index = evidenceIndex(deepDive.sources);
  const used = validateClaims(deepDive.claims, index, analysis.song);
  for (const cue of deepDive.listeningCues) {
    for (const id of cue.claimIds)
      invariant(used.has(id), "聆听提示引用了不存在的判断。");
    if (cue.scope === "recording") {
      invariant(
        cue.claimIds.length > 0 &&
          cue.claimIds.some(
            (id) =>
              deepDive.claims.find((c) => c.id === id)?.kind ===
              "external_evidence",
          ),
        "原曲聆听提示需要歌曲专属依据。",
      );
    }
    if (cue.scope === "source_version")
      invariant(
        cue.claimIds.some((id) => deepDive.claims.find((claim) => claim.id === id)?.scope.level === "source_version"),
        "来源版本聆听提示需要来源版本范围的依据。",
      );
  }
  const { studio } = deepDive;
  if (!studio.eligible) {
    invariant(
      studio.potential === "none" && studio.seed === null,
      "Studio 不适用时不能附带实验。",
    );
    return deepDive;
  }
  invariant(
    studio.potential !== "none" && studio.seed,
    "Studio 实验缺少 seed。",
  );
  const seed = studio.seed;
  invariant(
    seed.code.trim() && seed.alternativeCode.trim(),
    "实验需要 A/B 两个版本。",
  );
  invariant(
    seed.code.length <= 16000 && seed.alternativeCode.length <= 16000,
    "实验代码过长。",
  );
  invariant(
    seed.playback.bpm >= 20 &&
      seed.playback.bpm <= 300 &&
      seed.playback.beatsPerCycle > 0 &&
      seed.playback.beatsPerCycle <= 32,
    "实验速度或循环拍数无效。",
  );
  invariant(
    seed.experiment.variable.trim() &&
      seed.experiment.constants.length &&
      seed.experiment.listenFor.length &&
      seed.experiment.limitation.trim(),
    "实验需要变量、控制条件、聆听目标和边界说明。",
  );
  for (const id of seed.evidenceIds)
    invariant(index.excerpts.has(id), "Studio 引用了不存在的片段。");
  if (seed.sourceType === "source_transcription") {
    invariant(
      analysis.song.identityStatus === "resolved",
      "版本未确定时不能标为原曲转录。",
    );
    invariant(
      seed.evidenceIds.some((id) => {
        const source = index.excerpts.get(id)?.source;
        return (
          ["score", "transcription"].includes(source?.sourceType) &&
          source.versionScope === analysis.song.versionScope
        );
      }),
      "原曲转录需要适用当前版本的谱例或转录依据。",
    );
  }
  return deepDive;
}
