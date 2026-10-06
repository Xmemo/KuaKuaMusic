import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AppError } from "../errors.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export async function createAnalysisWorkspace({
  libraryRoot,
  song,
  media,
  schema,
  skillName,
  analysisId = crypto.randomUUID(),
}) {
  if (!song?.songId || !media?.analysisPath)
    throw new AppError(
      "无法创建音乐分析工作区：歌曲或音频信息不完整。",
      "V3_WORKSPACE_INPUT_INVALID",
      422,
    );

  const root = path.join(
    path.resolve(libraryRoot),
    song.songId,
    "agent-runs",
    analysisId,
  );
  const inputDir = path.join(root, "input");
  const workDir = path.join(root, "work");
  const measurementsDir = path.join(root, "measurements");
  const skillDir = path.join(root, "skill");

  await Promise.all([
    fs.mkdir(inputDir, { recursive: true }),
    fs.mkdir(workDir, { recursive: true }),
    fs.mkdir(measurementsDir, { recursive: true }),
    fs.mkdir(skillDir, { recursive: true }),
  ]);

  const audioPath = path.join(inputDir, "audio.mp3");
  await fs.copyFile(media.analysisPath, audioPath);

  const skillSource = path.join(
    repoRoot,
    ".agents",
    "skills",
    skillName,
    "SKILL.md",
  );
  await fs.copyFile(skillSource, path.join(skillDir, "SKILL.md"));

  const schemaPath = path.join(root, "output.schema.json");
  await fs.writeFile(
    schemaPath,
    JSON.stringify(schema, null, 2) + "\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(root, "task.json"),
    JSON.stringify(
      {
        song,
        media: {
          mediaRevisionId: media.mediaRevisionId,
          durationSec: media.durationSec,
          sourceTitle: media.acquisition?.sourceTitle || null,
          sourceChannel: media.acquisition?.channel || null,
        },
        inputAudio: "input/audio.mp3",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return Object.freeze({
    analysisId,
    root,
    audioPath,
    schemaPath,
    checkpointPath: path.join(root, "phase-a-observation.json"),
    skillPath: path.join(skillDir, "SKILL.md"),
  });
}
