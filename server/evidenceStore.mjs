import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, invariant } from "./errors.mjs";
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const memory = new Map(),
  locks = new Map();
const root = () =>
  process.env.MUSIC_LEARNING_EVIDENCE_DIR
    ? path.resolve(process.env.MUSIC_LEARNING_EVIDENCE_DIR)
    : path.join(REPO_ROOT, ".music-learning", "evidence");
const persistent = () => process.env.MUSIC_LEARNING_PERSIST !== "0";
export function requireId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  )
    throw new AppError("研究记录 ID 无效。");
  return value;
}
const target = (id) => path.join(root(), requireId(id), "package.json");
async function atomicWrite(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + "." + crypto.randomUUID() + ".tmp";
  try {
    const handle = await fs.open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}
async function writePackage(record) {
  if (persistent()) await atomicWrite(target(record.analysisId), record);
  else memory.set(record.analysisId, structuredClone(record));
}
export async function loadEvidencePackage(id) {
  requireId(id);
  if (!persistent()) {
    const value = memory.get(id);
    if (value) return structuredClone(value);
  } else {
    try {
      return JSON.parse(await fs.readFile(target(id), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new AppError(
    "研究记录不存在，或临时记录已随服务重启清除。",
    "ANALYSIS_NOT_FOUND",
    404,
  );
}
async function serialized(id, operation) {
  const previous = locks.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  locks.set(id, current);
  try {
    return await current;
  } finally {
    if (locks.get(id) === current) locks.delete(id);
  }
}
function mergeSources(existing, additions) {
  const sources = new Map(existing.map((s) => [s.id, s]));
  for (const source of additions) {
    const previous = sources.get(source.id);
    if (!previous) {
      sources.set(source.id, source);
      continue;
    }
    invariant(
      previous.url === source.url &&
        previous.documentHash === source.documentHash &&
        previous.versionScope === source.versionScope,
      "来源 ID 对应的资料不能被替换。",
    );
    const excerpts = new Map(previous.excerpts.map((e) => [e.id, e]));
    for (const excerpt of source.excerpts) {
      const old = excerpts.get(excerpt.id);
      invariant(
        !old || JSON.stringify(old) === JSON.stringify(excerpt),
        "支撑片段 ID 对应内容不能被替换。",
      );
      excerpts.set(excerpt.id, excerpt);
    }
    sources.set(source.id, { ...previous, excerpts: [...excerpts.values()] });
  }
  return [...sources.values()];
}
export async function persistAnalysis(analysis, evidenceReview = null) {
  const analysisId = crypto.randomUUID(),
    createdAt = new Date().toISOString();
  const record = {
    schemaVersion: "1.1",
    analysisId,
    createdAt,
    updatedAt: createdAt,
    persistent: persistent(),
    analysis,
    evidenceReview,
    sources: analysis.sources,
    deepDives: [],
    studioSessions: [],
  };
  await writePackage(record);
  return {
    schemaVersion: record.schemaVersion,
    analysisId,
    createdAt,
    persistent: record.persistent,
    analysis,
    evidenceReview,
  };
}
export async function persistDeepDive(
  analysisId,
  deepDive,
  question = null,
  evidenceReview = null,
) {
  return serialized(requireId(analysisId), async () => {
    const record = await loadEvidencePackage(analysisId);
    const saved = {
      deepDiveId: crypto.randomUUID(),
      analysisId,
      createdAt: new Date().toISOString(),
      question,
      deepDive,
      evidenceReview,
    };
    record.sources = mergeSources(record.sources, deepDive.sources);
    record.deepDives.push(saved);
    record.updatedAt = saved.createdAt;
    await writePackage(record);
    return saved;
  });
}
export async function persistStudioSession(analysisId, deepDiveId, session) {
  requireId(deepDiveId);
  return serialized(requireId(analysisId), async () => {
    const record = await loadEvidencePackage(analysisId);
    const dive = record.deepDives.find(
      (d) => d.deepDiveId === deepDiveId,
    )?.deepDive;
    invariant(
      dive?.studio.eligible && dive.studio.seed,
      "Studio 必须来自已保存的深挖实验。",
    );
    invariant(
      session &&
        typeof session === "object" &&
        session.analysisItemId === dive.analysisItemId,
      "Studio 归属不匹配。",
    );
    requireId(session.id);
    const previousEntry = record.studioSessions.find(
      (s) => s.session.id === session.id,
    );
    const previous = previousEntry?.session;
    invariant(
      !previousEntry || previousEntry.deepDiveId === deepDiveId,
      "实验不能更换所属深挖记录。",
    );
    invariant(
      (session.saveVersion ?? 0) === (previous?.saveVersion ?? 0),
      "实验已被另一页面保存，请恢复最新记录后再编辑。",
      "STALE_STUDIO_SAVE",
      409,
    );
    invariant(
      Array.isArray(session.revisions) &&
        session.revisions.length > 0 &&
        session.revisions.length <= 200,
      "Studio 历史无效或过长。",
    );
    invariant(
      Number.isInteger(session.revisionIndex) &&
        session.revisionIndex >= 0 &&
        session.revisionIndex < session.revisions.length,
      "Studio 当前版本无效。",
    );
    const seed = dive.studio.seed;
    const seen = new Set();
    const revisions = session.revisions.map((rev) => {
      requireId(rev.id);
      invariant(!seen.has(rev.id), "Studio revision ID 重复。");
      seen.add(rev.id);
      invariant(
        typeof rev.code === "string" &&
          rev.code.trim() &&
          rev.code.length <= 16000,
        "Studio 代码无效。",
      );
      const playback = rev.playback;
      invariant(
        playback &&
          Number.isFinite(playback.bpm) &&
          playback.bpm >= 20 &&
          playback.bpm <= 300 &&
          Number.isFinite(playback.beatsPerCycle) &&
          playback.beatsPerCycle > 0 &&
          playback.beatsPerCycle <= 32,
        "Studio 速度无效。",
      );
      invariant(
        playback.soundBank === seed.playback.soundBank &&
          playback.runtimeVersion === seed.playback.runtimeVersion,
        "当前实验必须保持音源及运行时约定。",
      );
      const original =
        rev.id === session.revisions[0].id &&
        rev.code === seed.code &&
        JSON.stringify(playback) === JSON.stringify(seed.playback);
      return {
        id: rev.id,
        code: rev.code,
        playback: { ...playback },
        label: String(rev.label || "编辑").slice(0, 200),
        createdAt: String(rev.createdAt || "").slice(0, 40),
        sourceType: original ? seed.sourceType : "user_version",
      };
    });
    invariant(
      revisions[0].code === seed.code &&
        JSON.stringify(revisions[0].playback) === JSON.stringify(seed.playback),
      "Studio 历史必须从原始 seed 开始。",
    );
    const stored = {
      id: session.id,
      saveVersion: (previous?.saveVersion ?? 0) + 1,
      analysisItemId: dive.analysisItemId,
      evidenceIds: seed.evidenceIds,
      explanation: seed.explanation,
      visualHints: seed.visualHints,
      experiment: seed.experiment,
      alternativeCode: seed.alternativeCode,
      revisions,
      revisionIndex: session.revisionIndex,
    };
    record.studioSessions = record.studioSessions.filter(
      (s) => s.session.id !== stored.id,
    );
    record.studioSessions.push({ deepDiveId, session: stored });
    record.updatedAt = new Date().toISOString();
    await writePackage(record);
    return stored;
  });
}
export async function listAnalyses() {
  let packages;
  if (!persistent()) packages = [...memory.values()];
  else {
    let entries;
    try {
      entries = await fs.readdir(root(), { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    packages = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && /^[0-9a-f-]{36}$/i.test(e.name))
        .map(async (e) => {
          try {
            return await loadEvidencePackage(e.name);
          } catch {
            return null;
          }
        }),
    );
  }
  return packages
    .filter(Boolean)
    .map((p) => ({
      analysisId: p.analysisId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      song: p.analysis.song,
      deepDiveCount: p.deepDives.length,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
