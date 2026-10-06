import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { AppError } from "../errors.mjs";

function safeChildEnv(source = process.env) {
  const allow = new Set([
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "TERM",
    "COLORTERM",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allow.has(key)),
  );
}

function isMcpTool(name) {
  return /(^|[_:/.-])mcp([_:/.-]|$)/iu.test(String(name || ""));
}

function progressForTool(name) {
  const value = String(name || "").toLowerCase();
  if (/search|browser|web/u.test(value))
    return {
      stage: "agent_research",
      label: "音乐分析 Agent 正在查找并阅读外部资料",
    };
  if (/run_command|terminal|shell|python/u.test(value))
    return {
      stage: "agent_measurement",
      label: "音乐分析 Agent 正在验证需要精确测量的内容",
    };
  if (/write|file/u.test(value))
    return {
      stage: "agent_analysis",
      label: "音乐分析 Agent 正在整理中间分析记录",
    };
  return {
    stage: "agent_analysis",
    label: "音乐分析 Agent 正在调用工具",
  };
}

export function createAntigravityRunner({
  config,
  env = process.env,
  spawnImpl = spawn,
} = {}) {
  async function run({
    workspace,
    prompt,
    signal,
    onProgress,
  }) {
    const antigravitySkillDir = path.join(
      workspace.root,
      ".agents",
      "skills",
      config.skill.name,
    );
    await fs.mkdir(antigravitySkillDir, { recursive: true });
    await fs.copyFile(
      workspace.skillPath,
      path.join(antigravitySkillDir, "SKILL.md"),
    );

    return await new Promise((resolve, reject) => {
      const args = [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--json-schema",
        "output.schema.json",
        "--model",
        config.model,
        "--effort",
        config.effort,
        "--print-timeout",
        config.printTimeout,
        "--sandbox",
      ];
      if (config.autoApprove) args.push("--dangerously-skip-permissions");

      let settled = false;
      let stdoutBuffer = "";
      let stderr = "";
      let timer = null;
      let finalResult = null;
      const toolsUsed = new Set();
      const toolEvents = [];

      const child = spawnImpl(config.command, args, {
        cwd: workspace.root,
        env: safeChildEnv(env),
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
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
          new AppError(
            "音乐分析 Agent 已取消。",
            "V3_AGENT_ABORTED",
            499,
          ),
        );
      };

      const consumeLine = (line) => {
        const trimmed = String(line || "").trim();
        if (!trimmed) return;
        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          return;
        }

        if (event.event === "step_update") {
          const step = event.step_update || {};
          if (step.step_type === "tool" && step.state === "DONE") {
            const toolName = String(step.tool_name || step.tool_info?.name || "");
            if (toolName) toolsUsed.add(toolName);
            toolEvents.push({
              stepIndex: step.step_index ?? null,
              toolName,
              toolInfo: step.tool_info || null,
            });
            onProgress?.(progressForTool(toolName));
          }
        }
        if (event.event === "result") finalResult = event.result || null;
      };

      child.stdout?.on("data", (chunk) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/u);
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) consumeLine(line);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (Buffer.byteLength(stderr) > 2 * 1024 * 1024)
          stderr = stderr.slice(-1024 * 1024);
      });

      child.once("error", (error) => {
        finish(
          reject,
          new AppError(
            error?.code === "ENOENT"
              ? "未找到音乐分析 Runner 命令：" + config.command
              : "无法启动音乐分析 Runner。",
            error?.code === "ENOENT"
              ? "V3_RUNNER_UNAVAILABLE"
              : "V3_RUNNER_START_FAILED",
            503,
          ),
        );
      });

      child.once("close", (code) => {
        if (settled) return;
        if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);

        if (code !== 0 || !finalResult) {
          finish(
            reject,
            new AppError(
              "音乐分析 Agent 未能完成。" +
                (stderr.trim() ? " " + stderr.trim().slice(-600) : ""),
              "V3_AGENT_FAILED",
              502,
            ),
          );
          return;
        }
        if (finalResult.status !== "SUCCESS") {
          finish(
            reject,
            new AppError(
              "音乐分析 Agent 返回状态 " +
                String(finalResult.status || "UNKNOWN") +
                (finalResult.error ? "：" + finalResult.error : ""),
              "V3_AGENT_FAILED",
              502,
            ),
          );
          return;
        }
        if (!finalResult.structured_output) {
          finish(
            reject,
            new AppError(
              "音乐分析 Agent 没有返回结构化结果。",
              "V3_AGENT_EMPTY_OUTPUT",
              502,
            ),
          );
          return;
        }

        const mcpTools = [...toolsUsed].filter(isMcpTool);
        if (mcpTools.length) {
          finish(
            reject,
            new AppError(
              "本轮音乐分析意外依赖 MCP 工具：" + mcpTools.join(", "),
              "V3_MCP_DEPENDENCY_FORBIDDEN",
              422,
            ),
          );
          return;
        }

        finish(resolve, {
          structuredOutput: finalResult.structured_output,
          conversationId: finalResult.conversation_id || null,
          usage: finalResult.usage || {},
          toolsUsed: [...toolsUsed],
          toolEvents,
        });
      });

      timer = setTimeout(() => {
        terminate();
        finish(
          reject,
          new AppError(
            "音乐分析 Agent 执行超时。",
            "V3_AGENT_TIMEOUT",
            504,
          ),
        );
      }, config.timeoutMs);

      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  return Object.freeze({
    name: "antigravity-cli",
    model: config.model,
    effort: config.effort,
    run,
  });
}
