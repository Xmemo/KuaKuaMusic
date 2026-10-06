# 夸夸音乐 / MusicLearning2026

**输入歌曲 → 本地录音实体化 → AI 真正听歌/按需测量/查资料 → 有依据的解释 → Strudel 学习实验。**

产品基线仍是 [PRD v0.3 冻结版](docs/MUSICLEARNING2026_PRD_V0.3_FROZEN.md)。

当前新的目标架构是：

> **[v3 Single Agent + Generic Music Analysis Skill](docs/TECHNICAL_ARCHITECTURE_V3.md)**

v3 从 PR #4 / v2 的稳定成果上继续收敛：保留歌曲搜索、YouTube 预览、本地 Song Package、media revision、缓存和 Strudel 安全层；不再把音乐理解拆成 Listen / Research / Critic / Creative 四个模型 Provider。

## v3 核心流水线

```
Search
  ↓
Recording Materializer
  ↓
Local Song Package
  ↓
MusicAnalysisAgent
  ├─ Generic music-analysis Skill
  ├─ Listen first
  ├─ Measure when useful
  ├─ Research after checkpoint
  └─ Synthesize
  ↓
Unified Analysis Artifact
  ├─ observation
  ├─ measurement
  ├─ externalEvidence
  └─ interpretation
  ↓
optional Creative Experiment
  ↓
server-validated Strudel A/B
```

第一版 Runner 是 **Antigravity CLI**，默认模型配置为 `gemini-3.8-flash-high`。这只是当前实现，不属于 Skill 或 Artifact 的固定假设。

## 通用 Music Analysis Skill

Canonical Skill：

```
.agents/skills/music-analysis/SKILL.md
```

它只定义音乐分析方法论，不出现：

- Gemini / Antigravity
- Qwen / DashScope / SiliconFlow
- KuaKuaMusic UI
- Strudel

因此未来替换为其他支持音频、工具和搜索的多模态 Agent 时，Skill 无需重写。

核心规则：

- **先听后搜**；
- 精确数值必须来自真正执行的 measurement；
- DSP/算法结果仍然是 estimator，不允许写成“100% 真相”；
- 搜索 snippet 不算证据；
- observation / measurement / external_evidence / interpretation 分开；
- 不依赖 MCP；
- 不强制每首歌跑固定 DSP checklist。

## v3 Runner Boundary

业务层只依赖一个很薄的 Runner 接口。

当前：

```
MUSIC_ANALYSIS_RUNNER=antigravity-cli
MUSIC_ANALYSIS_MODEL=gemini-3.8-flash-high
MUSIC_ANALYSIS_EFFORT=high
```

Antigravity 专用逻辑只在：

```
server/v3/antigravityRunner.mjs
```

负责：

- workspace Skill 映射；
- headless CLI；
- structured output；
- stream-json/tool telemetry；
- sandbox / permissions；
- usage / conversation metadata。

未来添加第二个 Runner 不需要修改 Skill、v3 Schema 或 Song Package。

## 本地 Song Package

v3 继续复用 v2 已验证的录音准备层：

```
.music-learning/library/<song-id>/
├── identity.json
├── media/
│   └── <media-revision-id>/
│       ├── acquisition.json
│       ├── source.*
│       └── analysis.mp3
└── agent-runs/
    └── <analysis-id>/
        ├── input/audio.mp3
        ├── skill/SKILL.md
        ├── work/
        ├── measurements/
        ├── task.json
        ├── output.schema.json
        ├── phase-a-observation.json
        └── analysis.json
```

录音和分析工作区均不提交 Git。

## v3 本机运行

需要：

- Node.js 22+
- `yt-dlp`
- `ffmpeg`
- `ffprobe`
- 当前选择的 Agent Runner

第一版 Runner：

```bash
agy --version
agy models
```

并确保 Antigravity CLI 已完成本机登录。

启用：

```bash
MUSIC_V3_ENABLED=1
VITE_MUSIC_V3_ENABLED=1

MUSIC_ANALYSIS_RUNNER=antigravity-cli
MUSIC_ANALYSIS_CLI_BIN=agy
MUSIC_ANALYSIS_MODEL=gemini-3.8-flash-high
MUSIC_ANALYSIS_EFFORT=high
```

然后：

```bash
npm ci
npm run dev
```

打开：

```
http://127.0.0.1:3000
```

页面应显示 **Single-Agent v3 Beta**。

## v3 本机 API

设置 `MUSIC_V3_ENABLED=1` 后：

| 接口 | 用途 |
| --- | --- |
| `POST /api/agent/v3/analyze` | 录音确认/复用 → 单 Agent 完整音乐调查 → Artifact → optional Studio |
| `POST /api/agent/v3/materialize` | 只准备或确认本地录音 |
| `GET /api/agent/v3/runner` | 查看当前架构/Skill 标识 |

默认 v1/v2 路由仍然保留。

## Server-side Validation

大模型负责调查与解释，但不是最后的真相裁判。

服务端继续检查：

- Schema；
- observation / measurement / evidence / interpretation ID 引用；
- 时间范围是否超出真实录音；
- measurement artifactPath 是否真实存在且没有越过工作区；
- external evidence URL；
- Listen checkpoint 是否存在；
- 是否意外使用 MCP；
- Strudel 代码安全；
- A/B 是否只有格式差异。

## v1 / v2 状态

### v1.2

仍保留现有 evidence-first 默认路径与历史数据。

### v2

[TECHNICAL_ARCHITECTURE_V2.md](docs/TECHNICAL_ARCHITECTURE_V2.md) 继续保留，作为：

- Audio-first 多 Provider 架构实验；
- Song Package / YouTube / Qwen Omni / Research / Critic / Creative 的工程验证；
- v3 的重要前置探索。

v3 真实音乐质量通过验收前，不删除 v2 代码。

## 验证

```bash
npm run schemas:generate
npm run verify
```

CI 会额外检查 generated schema 是否和 contracts 漂移。

代码回归只能证明协议和边界；不能证明一个模型真的“懂音乐”。v3 最终 Gate 是用真实录音进行内容质量 benchmark。

首轮建议：

- **VARLAN — Antagonistic**
- **Battlefield 4 — Warsaw Theme**

重点比较：

- 秒级 observation；
- Agent 是否只在值得的时候跑 DSP；
- measurement 是否真正有计算依据；
- external research 是否足够扎实；
- 最终解释是否比 v2 更自然、更有音乐洞察；
- Creative Experiment 是否真的对应前面的机制。
