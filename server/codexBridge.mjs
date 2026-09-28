import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 512 * 1024;

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function schemaPath(relativePath) {
  return path.resolve(REPO_ROOT, relativePath);
}

export function getCodexBridgeConfig() {
  return {
    bin: process.env.CODEX_BIN || "codex",
    model: process.env.CODEX_MODEL || "",
    timeoutMs: numericEnv("CODEX_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxStdoutBytes: numericEnv("CODEX_MAX_STDOUT_BYTES", DEFAULT_MAX_STDOUT_BYTES),
    maxStderrBytes: numericEnv("CODEX_MAX_STDERR_BYTES", DEFAULT_MAX_STDERR_BYTES),
    cwd: REPO_ROOT,
  };
}

export async function runCodexStructured({ prompt, outputSchema }) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Codex prompt is empty.");
  }
  if (typeof outputSchema !== "string" || !outputSchema.trim()) {
    throw new Error("Codex output schema is missing.");
  }

  const config = getCodexBridgeConfig();
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-schema",
    outputSchema,
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  // "-" tells codex exec to read the prompt from stdin.
  args.push("-");

  return new Promise((resolve, reject) => {
    const child = spawn(config.bin, args, {
      cwd: config.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let killedForSize = false;

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finishReject(new Error("Codex analysis timed out after " + config.timeoutMs + " ms."));
    }, config.timeoutMs);

    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        finishReject(
          new Error(
            "Codex CLI was not found. Install/login to Codex CLI or set CODEX_BIN to the executable path.",
          ),
        );
        return;
      }
      finishReject(error instanceof Error ? error : new Error(String(error)));
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > config.maxStdoutBytes) {
        killedForSize = true;
        child.kill("SIGTERM");
      }
    });

    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr, "utf8") < config.maxStderrBytes) {
        stderr += chunk.toString("utf8");
      }
    });

    child.on("close", (code, signal) => {
      if (killedForSize) {
        finishReject(new Error("Codex output exceeded the configured size limit."));
        return;
      }
      if (settled) return;

      if (code !== 0) {
        const details = stderr.trim().slice(-4000);
        finishReject(
          new Error(
            "Codex exited with " + String(code) +
              (signal ? " (" + signal + ")" : "") +
              (details ? ": " + details : ""),
          ),
        );
        return;
      }

      const raw = stdout.trim();
      if (!raw) {
        finishReject(new Error("Codex returned an empty structured response."));
        return;
      }

      try {
        finishResolve(JSON.parse(raw));
      } catch (error) {
        finishReject(
          new Error(
            "Codex returned invalid JSON despite the output schema: " +
              (error instanceof Error ? error.message : String(error)),
          ),
        );
      }
    });

    child.stdin.on("error", () => {
      // The child may close stdin during shutdown; close handling reports the real outcome.
    });
    child.stdin.end(prompt);
  });
}
