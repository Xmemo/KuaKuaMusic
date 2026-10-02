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
      invariant(claim.versionScope === "general", "通用理论必须标为 general。");
    for (const id of claim.evidenceIds) {
      const excerpt = index.excerpts.get(id);
      invariant(excerpt, "判断引用的支撑片段不存在。");
      invariant(
        excerpt.topics.includes(claim.topic),
        "片段的支持范围不包含该判断。",
      );
      invariant(
        claim.versionScope === "general" ||
          excerpt.source.versionScope === claim.versionScope,
        "资料与判断的版本范围不匹配。",
      );
    }
    if (
      claim.kind === "external_evidence" &&
      claim.topic !== "identity" &&
      claim.versionScope !== "general"
    ) {
      invariant(
        song.identityStatus === "resolved",
        "版本未确定时不能确认歌曲专属技术判断。",
      );
      invariant(
        claim.versionScope === song.versionScope,
        "判断不适用于当前选择的版本。",
      );
    }
  }
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
    validateClaims(module.claims, index, analysis.song, used);
    // The rendered summary cannot introduce an extra factual paragraph.
    invariant(
      module.summary ===
        module.claims
          .slice(0, 2)
          .map((c) => c.text)
          .join("\n"),
      "模块摘要必须由已有判断组成。",
    );
  }
  for (const expression of Object.values(analysis.overallVibe)) {
    for (const id of expression.claimIds)
      invariant(used.has(id), "总体观感引用了不存在的判断。");
    if (expression.text.trim())
      invariant(
        expression.claimIds.length > 0 || used.size === 0,
        "总体观感需要标出解释依据。",
      );
  }
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
