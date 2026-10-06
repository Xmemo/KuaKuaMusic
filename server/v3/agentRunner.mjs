import { AppError } from "../errors.mjs";
import { createAntigravityRunner } from "./antigravityRunner.mjs";
import { getMusicAnalysisAgentConfig } from "./agentConfig.mjs";

export function createMusicAnalysisAgentRunner({
  env = process.env,
  config = getMusicAnalysisAgentConfig(env),
  factories = {},
} = {}) {
  const factory =
    factories[config.runner] ||
    (config.runner === "antigravity-cli"
      ? (options) => createAntigravityRunner(options)
      : null);

  if (!factory) {
    throw new AppError(
      "未实现音乐分析 Runner：" + config.runner,
      "V3_RUNNER_NOT_IMPLEMENTED",
      501,
    );
  }

  return factory({ config, env });
}
