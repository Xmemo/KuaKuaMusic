import fs from "node:fs/promises";
import crypto from "node:crypto";
import { AppError } from "../errors.mjs";
import { getContract, validateContract } from "../schemaValidation.mjs";
import { createMusicAnalysisAgentRunner } from "./agentRunner.mjs";
import { getMusicAnalysisAgentConfig } from "./agentConfig.mjs";
import { createAnalysisWorkspace } from "./workspace.mjs";
import { validateV3AnalysisDraft } from "./analysisValidation.mjs";

function productPrompt(song, media) {
  return [
    "Use the music-analysis skill in this workspace.",
    "",
    "Analyze the specific local recording at input/audio.mp3.",
    "Read task.json for catalog identity and measured duration.",
    "",
    "IMPORTANT WORKFLOW:",
    "1. Complete independent listening before external research.",
    "2. If the workspace is writable, create phase-a-observation.json before any web/browser search.",
    "3. Run local measurements only when a precise claim materially improves the analysis.",
    "4. Then research external context using native search/browser capabilities available to the host.",
    "5. Do not use MCP tools. Do not depend on any plugin or external extension.",
    "6. Finish by returning only the structured object required by output.schema.json.",
    "",
    "KuaKuaMusic PRODUCT OUTPUT:",
    "- overall.hook: one concise whole-song hook.",
    "- overall.emo / hype / pro: three genuinely different renderings of the same supported analysis (走心 / 上头 / 懂行).",
    "- observations: direct audio perception only.",
    "- measurements: only analyses that were actually executed. artifactPath, if present, must be relative to this workspace.",
    "- externalEvidence: only real pages you actually opened/read; preserve exact URL and a short supporting excerpt.",
    "- interpretations: connect concrete evidence/observation/measurement to musical mechanism and plausible listener effect.",
    "- modules: dynamic categories; do not force empty categories.",
    "- unknowns: preserve unresolved questions.",
    "",
    "CREATIVE EXPERIMENT:",
    "- Only mark eligible=true when one supported mechanism is worth learning by changing one musical variable.",
    "- This is a learning reconstruction, never an original-song transcription.",
    "- code and alternativeCode must use small safe Strudel expressions with built-in sounds only.",
    '- Safe examples: s("bd ~ sd ~"); stack(s("bd ~ sd ~"), s("hh*4").gain(0.3)); note("c3 ~ g3 ~").s("sine").',
    "- Do not use imports, network/browser APIs, external sample banks, setcpm, async code, or arbitrary JavaScript.",
    "- If no good experiment exists, eligible=false and both code fields must be null.",
    "",
    "IDENTITY CONTEXT (orientation only, not evidence):",
    JSON.stringify(
      {
        title: song.title,
        artist: song.artist,
        album: song.album,
        releaseYear: song.releaseYear,
        durationSec: media.durationSec,
      },
      null,
      2,
    ),
  ].join("\n");
}

function isMcpTool(name) {
  return /(^|[_:/.-])mcp([_:/.-]|$)/iu.test(String(name || ""));
}

function nullableToken(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createMusicAnalysisAgent({
  env = process.env,
  runner = createMusicAnalysisAgentRunner({ env }),
} = {}) {
  const config = getMusicAnalysisAgentConfig(env);

  async function analyze(
    { libraryRoot, song, media },
    { signal, onProgress } = {},
  ) {
    onProgress?.({
      stage: "agent_analysis",
      label: "正在准备单 Agent 音乐分析工作区",
    });

    const workspace = await createAnalysisWorkspace({
      libraryRoot,
      song,
      media,
      schema: getContract("v3-analysis-draft"),
      skillName: config.skill.name,
    });

    onProgress?.({
      stage: "agent_analysis",
      label: "音乐分析 Agent 正在独立听歌、按需测量并查阅资料",
    });

    const run = await runner.run({
      workspace,
      prompt: productPrompt(song, media),
      signal,
      onProgress,
    });

    const mcpTools = (run.toolsUsed || []).filter(isMcpTool);
    if (mcpTools.length) {
      throw new AppError(
        "本轮音乐分析依赖了 MCP 工具：" + mcpTools.join(", "),
        "V3_MCP_DEPENDENCY_FORBIDDEN",
        422,
      );
    }

    const checkpointExists = await fs
      .access(workspace.checkpointPath)
      .then(() => true)
      .catch(() => false);

    if (!checkpointExists) {
      throw new AppError(
        "音乐分析 Agent 没有留下独立 Listen checkpoint；为避免研究结果污染听感，本轮结果不接受。",
        "V3_LISTEN_CHECKPOINT_MISSING",
        422,
      );
    }

    const draft = await validateV3AnalysisDraft(run.structuredOutput, {
      durationSec: media.durationSec,
      workspaceRoot: workspace.root,
    });

    const artifact = {
      schemaVersion: "3.0",
      analysisId: workspace.analysisId,
      songId: song.songId,
      mediaRevisionId: media.mediaRevisionId,
      createdAt: new Date().toISOString(),
      agent: {
        runner: runner.name,
        model: runner.model,
        effort: runner.effort,
        skill: config.skill,
        conversationId: run.conversationId || null,
        toolsUsed: run.toolsUsed || [],
        usage: {
          inputTokens: nullableToken(run.usage?.input_tokens),
          outputTokens: nullableToken(run.usage?.output_tokens),
          thinkingTokens: nullableToken(run.usage?.thinking_tokens),
          cacheReadTokens: nullableToken(run.usage?.cache_read_tokens),
          totalTokens: nullableToken(run.usage?.total_tokens),
        },
        protocolChecks: {
          listenCheckpointExists: true,
          noMcpDependency: true,
        },
      },
      ...draft,
    };

    validateContract("v3-analysis-artifact", artifact);
    await fs.writeFile(
      workspace.root + "/analysis.json",
      JSON.stringify(artifact, null, 2) + "\n",
      "utf8",
    );

    return {
      artifact,
      runDirectory: workspace.root,
    };
  }

  return Object.freeze({
    analyze,
    describe: () => ({
      architecture: "single-agent-skill",
      runner: runner.name,
      model: runner.model,
      effort: runner.effort,
      skill: config.skill,
    }),
  });
}
