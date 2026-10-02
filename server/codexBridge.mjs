import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.mjs";
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
    model: process.env.CODEX_MODEL || "",
    timeoutMs: positive("CODEX_TIMEOUT_MS", 180000),
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
        new AppError("资料研究超时，请缩小问题或重试。", "AGENT_TIMEOUT", 504),
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
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="live"',
    "--output-schema",
    outputSchema,
  ];
  if (config.model) args.push("--model", config.model);
  args.push("-");
  const result = await runCodexCommand(args, {
    prompt,
    signal,
    timeoutMs: config.timeoutMs,
    maxBytes: config.maxStdoutBytes,
  });
  if (result.code !== 0)
    throw new AppError(
      "Codex 研究失败，请检查登录、项目信任状态与 MCP 配置。",
      "AGENT_FAILED",
      502,
    );
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
