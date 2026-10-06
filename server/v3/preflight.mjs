import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { getMusicAnalysisAgentConfig } from "./agentConfig.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function probe(command, args = ["--version"], timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = spawn(command, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      finish(false);
      return;
    }
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
    timer = setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGTERM");
      finish(false);
    }, timeoutMs);
  });
}

export function createV3Preflight({ env = process.env } = {}) {
  const config = getMusicAnalysisAgentConfig(env);
  let cached = null;

  async function health({ refresh = false } = {}) {
    if (cached && !refresh) return cached;

    const skillPath = path.join(
      repoRoot,
      ".agents",
      "skills",
      config.skill.name,
      "SKILL.md",
    );
    const [
      runnerAvailable,
      ytDlpAvailable,
      ffmpegAvailable,
      ffprobeAvailable,
      skillAvailable,
    ] = await Promise.all([
      probe(config.command),
      probe(env.MUSIC_YTDLP_BIN || "yt-dlp"),
      probe(env.MUSIC_FFMPEG_BIN || "ffmpeg"),
      probe(env.MUSIC_FFPROBE_BIN || "ffprobe"),
      fs.access(skillPath).then(() => true).catch(() => false),
    ]);

    const dependencies = {
      runner: runnerAvailable,
      ytDlp: ytDlpAvailable,
      ffmpeg: ffmpegAvailable,
      ffprobe: ffprobeAvailable,
      skill: skillAvailable,
    };
    cached = {
      ok: Object.values(dependencies).every(Boolean),
      architecture: "single-agent-skill",
      runner: config.runner,
      model: config.model,
      effort: config.effort,
      skill: config.skill,
      dependencies,
    };
    return cached;
  }

  return Object.freeze({ health });
}
