# MusicLearning2026 技术架构 v3.0

> 状态：新目标架构。基于 PR #4 / commit `a3d7b7f` 另起分支验证。v2 保留为对照，不在本分支直接删除。

## 1. 为什么从 v2 收敛

v2 的核心是：

```
Materialize
→ Listen Provider
→ Research Backend + Provider
→ Critic Provider
→ Creative Provider
→ Strudel
```

这套设计解决了早期模型能力分散的问题，但当一个强多模态 Agent 已经可以：

- 直接理解完整音频；
- 使用本地文件；
- 调用 shell / Python / ffmpeg；
- 根据问题现场编写 DSP；
- 使用原生 Web Search / Browser；
- 阅读资料并综合推理；
- 输出结构化 JSON；

继续把音乐分析拆成四个模型角色会制造不必要的编排、prompt 传递、缓存和 provenance glue。

v3 的目标不是“把 Gemini 写死”，而是：

> **一个 Music Analysis Agent + 一个模型无关的 Music Analysis Skill + 一个稳定 Artifact。**

## 2. 冻结原则

1. **Skill 是模型无关的。** 不出现 Gemini、Qwen、Antigravity、DashScope、SiliconFlow、Strudel 或 KuaKuaMusic 专用工作流。
2. **Runner 是可替换的薄适配层。** 第一版是 Antigravity CLI；未来可换直接 Gemini API、其他 Omni、本地多模态 Agent。
3. **模型负责调查策略。** 什么时候只听、什么时候测量、什么时候搜资料，由 Agent 按 Skill 决定。
4. **代码只守边界。** 负责录音准备、工作区隔离、Schema、引用校验、时间范围、测量 artifact、Strudel 安全。
5. **不依赖 MCP。** v3 不配置也不要求 MusicBrainz/music21/Discogs 等 MCP。未来 Runner 如果意外使用 MCP，当前产品策略会拒绝该次结果。
6. **先听后搜。** 在外部研究前必须完成独立听觉 checkpoint。
7. **精确数字必须真测。** 如果写精确 BPM、RMS、key estimate 等，必须有实际执行的方法；算法结果仍然是估计。
8. **四类认识论保持分开：** observation / measurement / external_evidence / interpretation。
9. **实验仍是教学重构。** 未经可靠转录支持的 Strudel 只能标记 `learning_reconstruction`。

## 3. 总体结构

```
Song Search
    │
    ▼
Recording Materializer
YouTube preview → user/version confirmation → yt-dlp → ffmpeg
    │
    ▼
Local Song Package
    │
    ▼
┌──────────────────────────────────────┐
│        MusicAnalysisAgent            │
│                                      │
│  Generic music-analysis Skill        │
│       │                              │
│       ├─ Listen first                │
│       ├─ Measure when useful         │
│       ├─ Research after checkpoint   │
│       └─ Synthesize                  │
│                                      │
│  Runner adapter                      │
│  └─ Antigravity CLI (first impl.)    │
└───────────────────┬──────────────────┘
                    │
                    ▼
            V3 Analysis Artifact
       ┌────────────┼──────────────┐
       ▼            ▼              ▼
 observation   measurement   externalEvidence
       └────────────┼──────────────┘
                    ▼
              interpretation
                    │
                    ▼
         optional creativeExperiment
                    │
                    ▼
         server Strudel validation
                    │
                    ▼
              Studio A/B
```

## 4. 通用 Skill 与产品 Prompt 分离

Canonical Skill:

```
.agents/skills/music-analysis/SKILL.md
```

它只规定通用方法：

- Listen first；
- Measure only when useful；
- Research after listening checkpoint；
- Evidence / inference separation；
- uncertainty；
- claim minimum basis。

它不定义：

- 走心 / 上头 / 懂行；
- KuaKuaMusic 页面；
- Strudel；
- 某个模型或 CLI；
- 某个搜索引擎；
- MCP。

这些产品要求由 v3 的 product prompt + JSON Schema 定义。

## 5. Runner Boundary

业务层只依赖一个薄边界：

```ts
MusicAnalysisAgentRunner.run({
  workspace,
  prompt,
  signal,
  onProgress
}) → {
  structuredOutput,
  conversationId,
  usage,
  toolsUsed
}
```

Runner 必须暴露：

- `name`
- `model`
- `effort`

第一版：

```
runner = antigravity-cli
model = gemini-3.8-flash-high
effort = high
```

这只是当前实现，不属于 Skill 或 Artifact 的固定假设。

## 6. Antigravity Adapter

Antigravity 专用内容只存在于：

```
server/v3/antigravityRunner.mjs
```

负责：

- 把通用 `skill/SKILL.md` 映射到 Antigravity 的 `.agents/skills/`；
- headless `agy -p`；
- `--output-format stream-json`；
- `--json-schema output.schema.json`；
- model / effort；
- sandbox；
- tool telemetry；
- structured_output / usage / conversation_id 解析。

CLI 细节不允许进入 Music Analysis Skill。

## 7. 隔离工作区

每一轮分析：

```
.music-learning/library/<song-id>/agent-runs/<analysis-id>/
├── input/
│   └── audio.mp3
├── skill/
│   └── SKILL.md
├── work/
├── measurements/
├── task.json
├── output.schema.json
├── phase-a-observation.json
└── analysis.json
```

音频优先 hard-link，跨文件系统再 copy。

Agent cwd 被限制在本轮 workspace；产品代码、.env、API key 不放进 workspace。

## 8. Listen-first Protocol

Agent 在任何外部 Research 之前建立：

`phase-a-observation.json`

服务端在 run 结束后检查该文件；不存在则整轮结果拒绝。

它不是最终 Artifact，只是证明独立听感阶段确实落过 checkpoint，并便于后续调试。

## 9. Unified Artifact

最终 artifact 只有四个核心事实层：

### observation

模型直接感知录音。

### measurement

真正执行过的测量。保存：

- value / unit
- method
- confidence
- alternatives
- optional artifactPath
- notes

如果 artifactPath 不为空，服务端要求它是 workspace 内真实存在的文件。

### externalEvidence

必须有真实 http/https URL、title、claim、excerpt、scope。

### interpretation

只能引用存在的 observation / measurement / evidence ID，或明确列出 generalPrinciples。

上层还有：

- overall（hook / 走心 / 上头 / 懂行）
- dynamic modules
- unknowns
- optional creativeExperiment

## 10. DSP 策略

v3 **没有固定 DSP pipeline**。

错误方向：

```
每首歌 → tempo → key → RMS → spectrum → section → ...
```

正确方向：

```
Agent 听到/怀疑某个值得验证的问题
→ 选择合适方法
→ 运行 shell/Python/audio tool
→ 保存 measurement
→ 用 measurement 支撑解释
```

重复出现、稳定有价值的临时脚本，未来可以沉淀成 Skill resources，但不是 P0 前提。

## 11. Research 策略

v3 不再维护独立 Research Provider / Source Registry pipeline 作为主路径。

Agent 在 Listen checkpoint 后使用当前 Runner 提供的原生 Search/Browser。

输出必须把真正采用的材料写成 `externalEvidence`：

- exact URL
- source title
- publisher if known
- supporting excerpt
- supported claim
- scope

搜索 snippet 不算证据。

如果外部资料很少，允许 externalEvidence 为空。

## 12. Creative / Strudel

通用 Skill 不知道 Strudel。

KuaKuaMusic product prompt 可以要求一个 `creativeExperiment`。

Agent负责选择：

- mechanism
- variable
- A / B
- constants
- listenFor
- optional Strudel code

服务端仍然使用现有 Strudel runtime policy：

- 代码必须安全；
- A/B 不能只有格式差异；
- 不允许 imports/network/browser/external sample banks；
- sourceType 强制为 `learning_reconstruction`。

这样“创作意图”交给 Agent，“执行安全”留在代码。

## 13. 复用 v2 的部分

保留并复用：

- Song Search
- YouTube candidate resolver
- recording confirmation
- yt-dlp / ffmpeg / ffprobe
- Local Song Package
- media revision
- catalog identity check
- local media cache
- Strudel runtime safety
- StudioPlayer

暂时保留但 v3 主路径不使用：

- Provider Registry
- DashScope Listen adapter
- registered-web Research pipeline
- Critic Pass
- Creative Pass
- v2 多 Provider orchestration

等 v3 真实验收通过后再决定清理范围。

## 14. Feature Flags

```
MUSIC_V3_ENABLED=1
VITE_MUSIC_V3_ENABLED=1

MUSIC_ANALYSIS_RUNNER=antigravity-cli
MUSIC_ANALYSIS_CLI_BIN=agy
MUSIC_ANALYSIS_MODEL=gemini-3.8-flash-high
MUSIC_ANALYSIS_EFFORT=high
```

v1/v2 不因本分支自动删除。

## 15. 验收问题

v3 不以“代码能跑”作为最终 Gate，而要回答：

1. 同一个 Skill 能否在两首明显不同的歌上稳定工作？
2. Agent 是否真的先形成独立听感再搜索？
3. 是否会主动选择有价值的 DSP，而不是机械跑 checklist？
4. 精确数值是否真的来自 measurement？
5. 外部 Research 是否比 v2 更自然，同时仍保留 URL/claim/excerpt？
6. 是否明显减少 generic prose 和 pipeline glue？
7. 更换 Runner 后是否仍可沿用完全相同的 Skill 和 Artifact？
8. Creative experiment 是否仍能清楚映射前面的 interpretation？

建议首轮 benchmark：

- VARLAN — Antagonistic
- Battlefield 4 — Warsaw Theme
