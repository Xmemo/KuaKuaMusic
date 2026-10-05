import { spawn } from "node:child_process";
import { AppError } from "../errors.mjs";

export function runProcess(
  command,
  args,
  {
    signal,
    cwd,
    timeoutMs = 180000,
    maxOutputBytes = 4 * 1024 * 1024,
  } = {},
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;

    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };

    const terminate = () => {
      if (child.exitCode == null) child.kill("SIGTERM");
    };

    const onAbort = () => {
      terminate();
      finish(
        reject,
        new AppError("本地音频处理已取消。", "V2_ABORTED", 499),
      );
    };

    const append = (kind, chunk) => {
      const text = chunk.toString("utf8");
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > maxOutputBytes) {
        terminate();
        finish(
          reject,
          new AppError(
            "本地音频工具输出超过安全上限。",
            "V2_TOOL_OUTPUT_LIMIT",
            502,
          ),
        );
        return;
      }
      if (kind === "stdout") stdout += text;
      else stderr += text;
    };

    child.stdout?.on("data", (chunk) => append("stdout", chunk));
    child.stderr?.on("data", (chunk) => append("stderr", chunk));

    child.once("error", (error) => {
      const missing = error?.code === "ENOENT";
      finish(
        reject,
        new AppError(
          missing
            ? "缺少本地工具 " + command + "，请先安装后再启用 v2 音频流程。"
            : "无法启动本地音频工具 " + command + "。",
          missing ? "V2_TOOL_UNAVAILABLE" : "V2_TOOL_START_FAILED",
          503,
        ),
      );
    });

    child.once("close", (code, processSignal) => {
      if (settled) return;
      if (code === 0) {
        finish(resolve, { stdout, stderr, code: 0 });
        return;
      }
      finish(
        reject,
        new AppError(
          "本地音频工具执行失败（" +
            command +
            "，退出码 " +
            String(code ?? processSignal ?? "unknown") +
            "）。",
          "V2_TOOL_FAILED",
          502,
        ),
      );
    });

    const timer = setTimeout(() => {
      terminate();
      finish(
        reject,
        new AppError(
          "本地音频工具执行超时：" + command,
          "V2_TOOL_TIMEOUT",
          504,
        ),
      );
    }, timeoutMs);

    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}
