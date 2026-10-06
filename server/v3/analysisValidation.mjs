import fs from "node:fs/promises";
import path from "node:path";
import { AppError, invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";
import { validateStudioCode } from "../../studio/runtimePolicy.mjs";

function uniqueIndex(items, label) {
  const map = new Map();
  for (const item of items || []) {
    invariant(item?.id, label + " 缺少 id。", "V3_INVALID_ARTIFACT", 422);
    invariant(
      !map.has(item.id),
      label + " 出现重复 id：" + item.id,
      "V3_INVALID_ARTIFACT",
      422,
    );
    map.set(item.id, item);
  }
  return map;
}

function validateRange(start, end, duration, label) {
  if (start === null && end === null) return;
  invariant(
    start !== null && end !== null,
    label + " 的时间范围必须同时包含 start/end。",
    "V3_INVALID_TIMESTAMP",
    422,
  );
  invariant(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end >= start &&
      (!Number.isFinite(duration) || end <= duration + 1),
    label + " 的时间范围超出本地音频。",
    "V3_INVALID_TIMESTAMP",
    422,
  );
}

function safeRelative(value) {
  const normalized = path.normalize(String(value || ""));
  return (
    normalized &&
    !path.isAbsolute(normalized) &&
    normalized !== ".." &&
    !normalized.startsWith(".." + path.sep)
  );
}

export async function validateV3AnalysisDraft(
  value,
  {
    durationSec,
    workspaceRoot,
  } = {},
) {
  const draft = validateContract("v3-analysis-draft", value);
  const observations = uniqueIndex(draft.observations, "observation");
  const measurements = uniqueIndex(draft.measurements, "measurement");
  const evidence = uniqueIndex(draft.externalEvidence, "external evidence");
  const interpretations = uniqueIndex(draft.interpretations, "interpretation");

  for (const item of draft.observations)
    validateRange(
      item.startSec,
      item.endSec,
      durationSec,
      "observation " + item.id,
    );

  for (const item of draft.measurements) {
    validateRange(
      item.startSec,
      item.endSec,
      durationSec,
      "measurement " + item.id,
    );
    if (item.artifactPath) {
      invariant(
        safeRelative(item.artifactPath),
        "measurement artifactPath 必须是工作区内相对路径。",
        "V3_INVALID_MEASUREMENT_ARTIFACT",
        422,
      );
      const absolute = path.join(workspaceRoot, item.artifactPath);
      invariant(
        absolute.startsWith(path.resolve(workspaceRoot) + path.sep),
        "measurement artifactPath 越过工作区边界。",
        "V3_INVALID_MEASUREMENT_ARTIFACT",
        422,
      );
      try {
        await fs.access(absolute);
      } catch {
        throw new AppError(
          "measurement " + item.id + " 引用了不存在的测量文件。",
          "V3_INVALID_MEASUREMENT_ARTIFACT",
          422,
        );
      }
    }
  }

  for (const item of draft.externalEvidence) {
    let url;
    try {
      url = new URL(item.url);
    } catch {
      throw new AppError(
        "external evidence " + item.id + " 的 URL 无效。",
        "V3_INVALID_EVIDENCE_URL",
        422,
      );
    }
    invariant(
      url.protocol === "https:" || url.protocol === "http:",
      "external evidence 仅允许 http/https URL。",
      "V3_INVALID_EVIDENCE_URL",
      422,
    );
  }

  for (const item of draft.interpretations) {
    for (const id of item.observationIds)
      invariant(
        observations.has(id),
        "interpretation " + item.id + " 引用了不存在的 observation：" + id,
        "V3_INVALID_REFERENCE",
        422,
      );
    for (const id of item.measurementIds)
      invariant(
        measurements.has(id),
        "interpretation " + item.id + " 引用了不存在的 measurement：" + id,
        "V3_INVALID_REFERENCE",
        422,
      );
    for (const id of item.evidenceIds)
      invariant(
        evidence.has(id),
        "interpretation " + item.id + " 引用了不存在的 evidence：" + id,
        "V3_INVALID_REFERENCE",
        422,
      );
    invariant(
      item.observationIds.length +
        item.measurementIds.length +
        item.evidenceIds.length >
        0 ||
        item.generalPrinciples.length > 0,
      "interpretation " + item.id + " 没有任何分析依据。",
      "V3_INVALID_REFERENCE",
      422,
    );
  }

  for (const module of draft.modules) {
    for (const id of module.interpretationIds)
      invariant(
        interpretations.has(id),
        "module " + module.id + " 引用了不存在的 interpretation：" + id,
        "V3_INVALID_REFERENCE",
        422,
      );
    for (const cue of module.listeningCues)
      validateRange(
        cue.startSec,
        cue.endSec,
        durationSec,
        "listening cue in " + module.id,
      );
  }

  const experiment = draft.creativeExperiment;
  for (const id of experiment.sourceInterpretationIds)
    invariant(
      interpretations.has(id),
      "creative experiment 引用了不存在的 interpretation：" + id,
      "V3_INVALID_REFERENCE",
      422,
    );

  if (experiment.eligible) {
    invariant(
      experiment.sourceInterpretationIds.length > 0,
      "可执行实验必须引用至少一个 interpretation。",
      "V3_INVALID_EXPERIMENT",
      422,
    );
    invariant(
      experiment.code && experiment.alternativeCode,
      "可执行实验缺少 A/B Strudel code。",
      "V3_INVALID_EXPERIMENT",
      422,
    );
    validateStudioCode(experiment.code);
    validateStudioCode(experiment.alternativeCode);
    invariant(
      experiment.code.replace(/\s+/gu, "") !==
        experiment.alternativeCode.replace(/\s+/gu, ""),
      "A/B Strudel 实验不能只有格式差异。",
      "V3_INVALID_EXPERIMENT",
      422,
    );
    invariant(
      experiment.variable.trim() &&
        experiment.baseline.trim() &&
        experiment.changed.trim() &&
        experiment.listenFor.length > 0 &&
        experiment.limitation.trim(),
      "可执行实验缺少变量、A/B 条件、聆听目标或边界说明。",
      "V3_INVALID_EXPERIMENT",
      422,
    );
  } else {
    invariant(
      experiment.code === null && experiment.alternativeCode === null,
      "不可执行实验不得携带 Strudel code。",
      "V3_INVALID_EXPERIMENT",
      422,
    );
  }

  return draft;
}
