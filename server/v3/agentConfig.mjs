export const MUSIC_ANALYSIS_SKILL = Object.freeze({
  name: "music-analysis",
  version: "1.0.0",
});

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function getMusicAnalysisAgentConfig(env = process.env) {
  return Object.freeze({
    runner: String(env.MUSIC_ANALYSIS_RUNNER || "antigravity-cli").trim(),
    command: String(env.MUSIC_ANALYSIS_CLI_BIN || "agy").trim(),
    model: String(
      env.MUSIC_ANALYSIS_MODEL || "gemini-3.8-flash-high",
    ).trim(),
    effort: String(env.MUSIC_ANALYSIS_EFFORT || "high").trim(),
    timeoutMs: integer(env.MUSIC_ANALYSIS_TIMEOUT_MS, 20 * 60 * 1000),
    printTimeout: String(env.MUSIC_ANALYSIS_PRINT_TIMEOUT || "20m").trim(),
    autoApprove:
      String(env.MUSIC_ANALYSIS_AUTO_APPROVE || "1").trim() !== "0",
    skill: MUSIC_ANALYSIS_SKILL,
  });
}
