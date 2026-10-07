# 夸夸音乐 / MusicLearning2026

**输入歌曲 → 准备正确录音 → AI 直接听歌 + 固定 DSP + 外部考据 → 有依据的音乐解释 → 可选 Strudel 学习实验。**

产品基线仍是 [PRD v0.3 冻结版](docs/MUSICLEARNING2026_PRD_V0.3_FROZEN.md)。

## 当前实验目标：Antigravity-native v4

当前分支把本地 Web 产品壳和 Antigravity-native 分析工作流重新接在一起：浏览器负责用户交互，后台主 Gemini 以 Session Mode 常驻并自动消费网页任务。

> **[MusicLearning Research Workflow v4 — Antigravity Native](docs/MUSIC_RESEARCH_WORKFLOW_V4.md)**

核心结构：

```
                         Main Gemini
                    Music Analysis Orchestrator
                              │
                 invoke_subagent × 3
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  Acoustic Analyst       Music Listener       Music Researcher
  fixed local DSP        native audio         web evidence
          │                   │                   │
          ▼                   ▼                   ▼
      dsp.json            listen.json         research.json
          └───────────────────┼───────────────────┘
                              ▼
                         Main Gemini
                           synthesis
                              │
                              ▼
                        analysis.json
                              │
                    user selects insight
                              │
                              ▼
                       Music Creative
                              │
                              ▼
                         studio.json
```

前三个专业子 Agent 并行执行。

## 为什么从 v3 改成这一版

v3 的 Single Agent 验证了强多模态模型的音乐理解能力，但一个长会话同时：

- 听完整音频；
- 自己想办法做 DSP；
- 写 Python；
- 搜索网页；
- 综合解释；
- 生成 Studio；

会导致上下文膨胀、工具循环过长、502 脆弱性以及错误测量方法。

v4 不放弃 Gemini/Antigravity，而是改变**分工方式**：

- **Acoustic Analyst**：只调用审核过的固定 DSP；
- **Listener**：只直接听录音；
- **Researcher**：只查外部资料；
- **Main Gemini**：只编排与综合；
- **Creative**：用户需要时再生成教学实验。

## 本地浏览器入口：Antigravity Session Mode

v4 现在的主产品路径不是“网页复制 prompt → Agent”，而是：

```
Antigravity 主 Gemini
        │
        ├── 启动 localhost
        ├── 注册 Session Mode
        └── 阻塞等待本地 request queue
                   ▲
                   │
       KuaKuaMusic Browser
                   │
      网易云 / QQ / 歌名输入
                   │
       analysis / creative request
```

第一次在 Antigravity 中选择：

`music-analysis-orchestrator`

然后让它：

> Start KuaKuaMusic Session Mode.

它会执行：

```bash
python3 tools/music-workflow/start_session.py
```

该脚本会自动：

- 启动 `npm run dev`（若尚未启动）；
- 强制启用 v4 Browser Bridge；
- 关闭 v2/v3 Beta runtime；
- 注册 `.music-learning/session/orchestrator.json`。

Antigravity 的 Browser 是官方内置 browser subagent，通过 `/browser` slash command 打开。因此第一次只需要在 Antigravity 中再执行一次：

```
/browser Open http://127.0.0.1:3000
```

**之后每首歌不再需要返回 Agent 对话框，也不需要复制任何 prompt。**

浏览器里的流程：

```
粘贴网易云 / QQ / 歌名
        ↓
歌曲身份解析
        ↓
YouTube 录音候选确认
        ↓
本地下载 / Song Package 复用
        ↓
analysis request → queued
        ↓
后台 Orchestrator 自动 claim
        ↓
DSP / Listener / Researcher 并行
        ↓
analysis.json
        ↓
浏览器自动更新分析结果
        ↓
「在 Studio 里试试」
        ↓
creative request → queued
        ↓
music-creative
        ↓
studio.json + Strudel A/B
```

网页会常驻显示后台 Gemini 状态：

- **在线等待**
- **正在分析**
- **正在创建 Studio**
- **未连接**

即使后台 Session 暂时离线，网页提交的任务也会保留在本地队列；Session 恢复后自动处理。

本地通信通过：

```
.music-learning/session/orchestrator.json
.music-learning/runs/<run>/browser-request.json
.music-learning/runs/<run>/browser-creative-request.json
```

实现。

这里没有：

- Node → `spawn agy`
- 每首歌的 prompt copy/paste
- 网页直接调用模型 API

浏览器只是控制面板；Antigravity 主 Gemini 是常驻工作进程。

## 通用 Music Analysis Skill

Canonical Skill：

```
.agents/skills/music-analysis/SKILL.md
```

它现在只定义通用认识论：

- observation；
- measurement；
- external evidence；
- interpretation；
- minimum claim basis；
- uncertainty。

它不定义：

- Gemini / Antigravity；
- FFmpeg；
- 子 Agent 拓扑；
- KuaKuaMusic UI；
- Strudel。

因此未来即使换多模态模型或运行宿主，核心 Skill 仍可复用。

## Antigravity Custom Agents

```
.agents/agents/
├── music-analysis-orchestrator/
├── music-acoustic-analyst/
├── music-listener/
├── music-researcher/
└── music-creative/
```

### Orchestrator

主 Agent。创建 run，一次并行启动 Acoustic / Listener / Researcher，最后综合。

### Acoustic Analyst

只能调用：

`tools/music-dsp/audio_metrics.py`

禁止现场重新发明 DSP。

### Listener

直接分析音频。

没有 Web / shell / Python 权限，也不读取 DSP/Research artifact。

### Researcher

只读取任务身份信息并使用 Web Search / URL reading。

不读取音频，也不读取 Listen/DSP artifact。

### Creative

只在用户明确要求“让我听听这个机制”时调用。

默认分析流程不生成 Strudel。

## Deterministic DSP P0

固定工具：

`tools/music-dsp/audio_metrics.py`

依赖：

- Python 3 标准库；
- ffmpeg；
- ffprobe。

当前只做：

- duration / native audio metadata；
- Integrated LUFS；
- Loudness Range；
- True Peak；
- decoded PCM fixed-window RMS dBFS；
- RMS step-change candidates。

**P0 不做 BPM / key / chords / form。**

这些属于 estimator，不是确定性物理量，后续必须经过独立算法选择与 benchmark 才能加入。

### 关键方法论边界

RMS 基于 FFmpeg 解码后的 PCM。

禁止使用 MP3 frame metadata、bitrate、quantizer、`global_gain` 等压缩编码字段推断波形响度或能量。

## 本地 run workspace

创建：

```bash
python3 tools/music-workflow/create_run.py \
  --audio "/path/to/Artist - Track.mp3"
```

生成：

```
.music-learning/runs/<run-id>/
├── input.mp3
├── task.json
├── dsp.json
├── listen.json
├── research.json
├── analysis.json
└── studio.json
```

`studio.json` 仅按需存在。

所有 run 目录均已加入 `.gitignore`。

## Artifact Contracts

```
schemas/workflow-v4/
├── dsp.schema.json
├── listen.schema.json
├── research.schema.json
├── analysis.schema.json
└── studio.schema.json
```

最终 `analysis.json` 的 interpretation 显式引用：

- Listen observation IDs；
- DSP measurement IDs；
- Research finding IDs。

Research finding 再引用具体 source IDs。

## Validation

独立 artifact：

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind listen \
  --file "<run>/listen.json"
```

最终跨 artifact 校验：

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind analysis \
  --file "<run>/analysis.json" \
  --run-dir "<run>"
```

Studio 还会继续调用现有 Strudel runtime policy。

## 在 Antigravity 里怎么用

1. 打开本仓库；
2. 在 Custom Agents 中选择 `music-analysis-orchestrator`；
3. 选择你要 benchmark 的 Gemini/model configuration；
4. 对主 Agent 说一次：

> Start KuaKuaMusic Session Mode.

5. 按 Agent 提示，在 Antigravity 中执行：

`/browser Open http://127.0.0.1:3000`

此后：

> **粘贴网易云 → 选录音 → 看分析 → 点 Studio**

全部在这个 Browser 页面里完成。

主 Agent会循环：

```
session_bus wait
    ↓
claim request
    ↓
process
    ↓
complete request
    ↓
session_bus wait
```

直到你明确要求它停止 Session Mode。

所有专业子 Agent 都是：

`model: inherit`

因此跟随主 Agent 当前的模型配置。

完整验收见：

> [LOCAL_V4_ACCEPTANCE.md](docs/LOCAL_V4_ACCEPTANCE.md)

## Verification

```bash
npm ci
npm run workflow:v4:dsp-selftest
npm run verify
```

CI 额外检查：

- DSP pure self-test；
- Agent 工具隔离；
- Skill 不被宿主/模型污染；
- artifact schema；
- cross-artifact provenance；
- timestamp bounds；
- unsafe Strudel rejection。

## Benchmark Gate

在重新封装回 Web App 前，至少验证：

1. **VARLAN — Antagonistic**
2. **Battlefield 4 — Warsaw Theme**

关注：

- 三个 specialist 是否真正并行；
- 总耗时与 token/tool 行为；
- Listen 是否歌曲特异；
- DSP 是否物理可信；
- Research 是否保守且扎实；
- final synthesis 是否自然；
- failed Research 是否可单独重跑；
- on-demand Studio 是否真正对应前面解释。

## 历史架构

- [v3 Single Agent + Generic Skill](docs/TECHNICAL_ARCHITECTURE_V3.md)：验证了强多模态模型的音乐理解与通用 Skill，但长程工具 Agent 成本/稳定性较差。
- [v2 Audio-first Multi-provider](docs/TECHNICAL_ARCHITECTURE_V2.md)：验证了 Local Song Package、Qwen Omni、Research/Critic/Creative 分层与 Strudel bridge。
- v1.2：保留早期 evidence-first Web App 基线与历史数据。

当前 v4 分支不删除这些实现；先验证研究工作流，再决定哪些代码值得重新产品化。
