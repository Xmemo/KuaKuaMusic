import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.mjs";
import { DEFAULT_REASONING_EFFORT, DEFAULT_RESEARCH_MODEL, researchConfigArgs } from "./researchConfig.mjs";
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const positive = (name, fallback) =>
  Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;
export const schemaPath = (relative) => path.resolve(REPO_ROOT, relative);
export function getCodexBridgeConfig() {
  return {
    bin: process.env.CODEX_BIN || "codex",
    model: process.env.CODEX_MODEL?.trim() || DEFAULT_RESEARCH_MODEL,
    reasoningEffort: process.env.CODEX_REASONING_EFFORT?.trim() || DEFAULT_REASONING_EFFORT,
    timeoutMs: positive("CODEX_TIMEOUT_MS", 360000),
    researchTimeoutMs: positive("CODEX_RESEARCH_TIMEOUT_MS", 720000),
    maxStdoutBytes: positive("CODEX_MAX_STDOUT_BYTES", 2 * 1024 * 1024),
    maxStderrBytes: positive("CODEX_MAX_STDERR_BYTES", 512 * 1024),
    cwd: REPO_ROOT,
  };
}
function childEnvironment() {
  return Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USERPROFILE",
      "TMPDIR",
      "TEMP",
      "LANG",
      "LC_ALL",
      "CODEX_HOME",
      "CODEX_API_KEY",
      "OPENAI_API_KEY",
      "HTTPS_PROXY",
      "HTTP_PROXY",
      "NO_PROXY",
    ]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}
function stopChild(child) {
  const kill = (signal) => {
    try {
      if (process.platform !== "win32" && child.pid)
        process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {}
  };
  kill("SIGTERM");
  const escalation = setTimeout(() => kill("SIGKILL"), 1000);
  escalation.unref();
  child.once("close", () => clearTimeout(escalation));
}
export function runCodexCommand(
  args,
  { prompt, signal, timeoutMs = 5000, maxBytes = 65536 } = {},
) {
  const config = getCodexBridgeConfig();
  const schemaIndex = args.indexOf("--output-schema");
  const schemaName = schemaIndex >= 0 ? path.basename(args[schemaIndex + 1] || "") : "";
  const timeoutMessage = schemaName === "research-plan.schema.json"
    ? "资料检索超时，本次没有保存分析；可以重试。"
    : "分析步骤响应超时，本次没有保存半成品；可以重试。";
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError("请求已取消。", "CANCELLED", 499));
      return;
    }
    const child = spawn(config.bin, args, {
      cwd: config.cwd,
      env: childEnvironment(),
      stdio: [prompt ? "pipe" : "ignore", "pipe", "pipe"],
      shell: false,
      detached: process.platform !== "win32",
    });
    const outputDecoder = new StringDecoder("utf8");
    let stdout = "",
      stderr = "",
      stdoutBytes = 0,
      stderrBytes = 0,
      done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => {
      stopChild(child);
      finish(new AppError("请求已取消。", "CANCELLED", 499));
    };
    const timer = setTimeout(() => {
      stopChild(child);
      finish(
        new AppError(timeoutMessage, "AGENT_TIMEOUT", 504),
      );
    }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (error) =>
      finish(
        new AppError(
          error.code === "ENOENT"
            ? "未找到 Codex CLI，请在本机安装并登录。"
            : "无法启动 Codex CLI。",
          "CODEX_UNAVAILABLE",
          503,
        ),
      ),
    );
    child.stdout.on("data", (chunk) => {
      if (done) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBytes) {
        stopChild(child);
        finish(new AppError("Agent 输出超过上限。", "AGENT_OUTPUT_LIMIT", 502));
        return;
      }
      stdout += outputDecoder.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (done || stderrBytes >= config.maxStderrBytes) return;
      const kept = chunk.subarray(0, config.maxStderrBytes - stderrBytes);
      stderrBytes += kept.length;
      stderr += kept.toString("utf8");
    });
    child.on("close", (code) => {
      stdout += outputDecoder.end();
      finish(null, { code, stdout, stderr });
    });
    if (prompt) {
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
    }
  });
}
export async function checkCodexAvailable() {
  try {
    const result = await runCodexCommand(["--version"]);
    return {
      available: result.code === 0,
      version: result.code === 0 ? result.stdout.trim() : null,
    };
  } catch {
    return { available: false, version: null };
  }
}
export function classifyCodexFailure(stderr) {
  // Only inspect the terminal error, not arbitrary text returned by research tools.
  const terminal = String(stderr).split(/\nERROR:/).at(-1);
  if (!/(?:^ERROR:|\nERROR:)/.test(String(stderr))) return "AGENT_FAILED";
  if (/usage limit|rate limit|quota|too many requests|\b429\b/i.test(terminal))
    return "AGENT_RATE_LIMIT";
  if (/unauthorized|authentication|token.{0,40}expired|\b401\b/i.test(terminal))
    return "AGENT_AUTH";
  if (/model.{0,80}(not supported|not found|does not exist|unavailable)/i.test(terminal))
    return "AGENT_MODEL";
  if (/stream disconnected|error sending request|connection reset|connection refused|network|timed out|failed to connect/i.test(terminal))
    return "AGENT_NETWORK";
  if (/required MCP|MCP.{0,80}(failed|unavailable)/i.test(terminal))
    return "AGENT_MCP";
  return "AGENT_FAILED";
}
const failureMessages = {
  AGENT_RATE_LIMIT: "Codex 的使用额度或请求频率已达上限，请在额度恢复后重试。",
  AGENT_AUTH: "Codex 登录已失效，请在本机重新登录后重试。",
  AGENT_MODEL: "当前 Codex 模型不可用，请检查 CODEX_MODEL 设置。",
  AGENT_NETWORK: "连接 Codex 模型服务时中断，请检查本机网络或代理后重试。",
  AGENT_MCP: "MusicBrainz 工具连接失败，请稍后重试。",
  AGENT_FAILED: "Codex 未完成本次研究。请重试；若再次失败，可用错误编号定位服务日志。",
};
export async function runCodexStructured({ prompt, outputSchema, signal }) {
  if (!prompt?.trim() || !outputSchema?.trim())
    throw new AppError("Agent 请求缺少指令或结构契约。");
  const config = getCodexBridgeConfig();
  const args = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--sandbox",
    "read-only",
    ...researchConfigArgs(),
    "-c", "model_reasoning_effort=" + JSON.stringify(config.reasoningEffort),
    "--output-schema",
    outputSchema,
  ];
  if (config.model) args.push("--model", config.model);
  args.push("-");
  const result = await runCodexCommand(args, {
    prompt,
    signal,
    timeoutMs: path.basename(outputSchema) === "research-plan.schema.json"
      ? config.researchTimeoutMs : config.timeoutMs,
    maxBytes: config.maxStdoutBytes,
  });
  if (result.code !== 0) {
    const code = classifyCodexFailure(result.stderr);
    const id = randomUUID();
    console.warn(JSON.stringify({ event: "research_failed", id, stage: path.basename(outputSchema), code, exitCode: result.code, model: config.model }));
    throw new AppError(
      failureMessages[code] + "（错误编号：" + id + "）",
      code,
      502,
    );
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new AppError(
      "Codex 未返回有效的结构化数据。",
      "AGENT_INVALID_JSON",
      502,
    );
  }
}
