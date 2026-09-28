import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, ".music-learning", "evidence");

function safeSegment(value) {
  return String(value || "unknown")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function stableSongKey(analysis) {
  const mbid = analysis?.song?.musicBrainzRecordingId;
  if (mbid) return "mbid-" + safeSegment(mbid);

  const raw = [
    analysis?.song?.artist || "",
    analysis?.song?.title || "",
    analysis?.song?.versionScope || "",
  ].join("|");
  const digest = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return safeSegment(analysis?.song?.artist) + "-" + safeSegment(analysis?.song?.title) + "-" + digest;
}

function evidenceRoot() {
  return process.env.MUSIC_LEARNING_EVIDENCE_DIR
    ? path.resolve(process.env.MUSIC_LEARNING_EVIDENCE_DIR)
    : DEFAULT_ROOT;
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function persistAnalysis(analysis) {
  if (process.env.MUSIC_LEARNING_PERSIST === "0") return null;
  const key = stableSongKey(analysis);
  const root = path.join(evidenceRoot(), key);

  await writeJson(path.join(root, "metadata.json"), {
    song: analysis.song,
    userPerception: analysis.userPerception ?? null,
    updatedAt: new Date().toISOString(),
  });
  await writeJson(path.join(root, "sources.json"), analysis.sources || []);
  await writeJson(path.join(root, "analysis.json"), analysis);
  return { key, root };
}

export async function persistDeepDive(analysis, deepDive) {
  if (process.env.MUSIC_LEARNING_PERSIST === "0") return null;
  const key = stableSongKey(analysis);
  const itemId = safeSegment(deepDive?.analysisItemId || "deep-dive");
  const target = path.join(evidenceRoot(), key, "deep-dives", itemId + ".json");
  await writeJson(target, {
    ...deepDive,
    savedAt: new Date().toISOString(),
  });
  return { key, target };
}
