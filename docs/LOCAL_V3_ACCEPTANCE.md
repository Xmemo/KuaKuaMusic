# MusicLearning2026 v3 本机验收

> 目标：验证 **Single Agent + Generic Music Analysis Skill** 是否真的比 v2 多 Provider pipeline 更简单，同时保持或提高音乐分析质量。

## 0. 验收边界

本轮不验证“某个 JSON schema 能不能通过”，CI 已经负责。

本轮真正回答：

1. 当前 Runner 能不能真正理解本地 MP3；
2. 通用 Skill 是否能稳定执行“先听后搜”；
3. Agent 会不会只在有价值时运行本地测量，而不是机械 DSP checklist；
4. 精确 BPM/key/能量等是否真的有 measurement；
5. Research 是否能找到并阅读真实材料；
6. 最终解释是否比 v2 更自然、有歌曲特异性；
7. Creative Experiment 是否能从前面的解释自然落到 Strudel。

## 1. 切到 v3 分支

```bash
git fetch origin
git switch arch/music-learning-v3-single-agent-skill-2026-10-07
git pull --ff-only
npm ci
```

## 2. 本地依赖

```bash
agy --version
agy models
yt-dlp --version
ffmpeg -version
ffprobe -version
```

确认 `agy models` 中存在当前配置的模型，例如：

```
gemini-3.8-flash-high
```

Antigravity CLI 需要已经完成本机登录。

可以先做一个无音乐的 headless smoke test：

```bash
agy -p "Reply with exactly OK" \
  --model gemini-3.8-flash-high \
  --effort high \
  --output-format json
```

应正常返回 SUCCESS。

## 3. .env.local

v3 验收时建议明确关闭 v2 Beta，避免同时初始化两套后端：

```bash
MUSIC_V3_ENABLED=1
VITE_MUSIC_V3_ENABLED=1

MUSIC_V2_ENABLED=0
VITE_MUSIC_V2_ENABLED=0

MUSIC_ANALYSIS_RUNNER=antigravity-cli
MUSIC_ANALYSIS_CLI_BIN=agy
MUSIC_ANALYSIS_MODEL=gemini-3.8-flash-high
MUSIC_ANALYSIS_EFFORT=high
MUSIC_ANALYSIS_TIMEOUT_MS=1200000
MUSIC_ANALYSIS_PRINT_TIMEOUT=20m
MUSIC_ANALYSIS_AUTO_APPROVE=1
```

不要把任何 API Key 写进仓库。

当前 Antigravity adapter 默认只把 PATH/HOME/locale/proxy 等必要环境传给子进程，不把 DashScope/OpenAI 等 API secrets 暴露给 Agent shell。

## 4. 启动

```bash
npm run dev
```

打开：

```
http://127.0.0.1:3000
```

页面顶部应显示：

> **Single-Agent v3 Beta**

## 5. 第一首：VARLAN — Antagonistic

这是首选 benchmark，因为已经有一次高质量 Gemini 分析可作参照。

重点观察：

### A. Recording Materializer

- YouTube 预览版本是否正确；
- 确认后是否下载到 Local Song Package；
- 实际时长是否约 2:45；
- 不要出现 cover/remix/slowed 等错误版本。

### B. Listen-first checkpoint

分析完成后检查：

```
.music-learning/library/<song-id>/agent-runs/<analysis-id>/phase-a-observation.json
```

它必须存在。

重点看：

- 是否已经记录了歌曲特异的结构/音色/节奏变化；
- 是否包含近似时间点；
- 不应出现从网页复制来的 credits/评论；
- 不应在没测量前写“108.80 BPM”“F minor 0.961”之类精确结果。

### C. Measurement

检查：

```
.../agent-runs/<analysis-id>/measurements/
```

不是要求目录必须很多文件，而是：

> 如果最终 Artifact 出现精确 measurement，必须能解释它实际用了什么方法。

理想状态：

- Agent 听到值得验证的问题；
- 才写 Python / 调 ffmpeg / 运行计算；
- measurement 记录 method / confidence / alternatives；
- 如果保存 artifactPath，对应文件真实存在。

特别观察之前 Gemini 曾得到的：

- tempo ≈ 108.8 BPM；
- F minor key estimate；
- 00:35 / 00:53 / 01:10 / 02:02 / 02:10 / 02:37 一类变化点。

**不要要求新架构机械复现完全相同的数字。** 重点是方法是否有意义、结果是否可信、语言是否不过度自信。

### D. Research

检查最终 `externalEvidence`：

- 是否真的有 URL；
- 是否是打开/阅读后的资料，而不是 search snippet；
- 如果没有可靠乐评，是否敢于返回少量/空 evidence；
- 是否没有因为资料少就把 genre prior 冒充歌曲事实。

### E. Interpretation

重点判断：

- 能否自然把“听到的 + 测到的 + 查到的”合起来；
- 是否明显减少 v2 那种 pipeline/citation glue；
- 是否有真正歌曲特异性的解释；
- 走心 / 上头 / 懂行是否是三个不同视角，而不是改写同一句。

### F. Creative Experiment

如果出现：

- 应明确是 learning reconstruction；
- A/B 尽量只改一个变量；
- 实验变量能反查到 interpretation；
- Strudel A/B 都能播放；
- 不能假装是原曲精确扒谱。

如果模型判断本曲没有适合的教学实验，`eligible=false` 也是合格结果。

## 6. 第二首：Battlefield 4 — Warsaw Theme

这首用来检查 Skill 是否能泛化，不是只适配 Antagonistic。

重点：

- 是否独立发现约 1:15 的显著结构变化；
- 是否主动研究游戏配乐/创作者语境；
- 是否能区分原 Battlefield 主题历史与 BF4 这个具体录音；
- 是否避免因为网上某篇乐评提到 1:15，就反向伪装成自己“听到了”。

## 7. 检查最终 Artifact

路径：

```
.music-learning/library/<song-id>/agent-runs/<analysis-id>/analysis.json
```

重点四层：

```
observations
measurements
externalEvidence
interpretations
```

检查：

- interpretation 引用的 ID 都存在；
- exact timestamp 不超过真实时长；
- measurement 不是纯文字冒充的；
- source URL 可打开；
- `agent.toolsUsed` 里没有 MCP tool；
- `protocolChecks.listenCheckpointCompleted = true`；
- `protocolChecks.noMcpDependency = true`。

## 8. 第二次分析同一首歌

v3 当前设计：

- **本地录音可以复用**；
- **Agent 分析默认重新运行**。

这是故意的。

当前先比较 Agent 在同一 Skill 下的稳定性，而不是过早把第一次分析永远缓存成真相。

记录：

- 两轮核心 observation 是否一致；
- 精确 measurement 是否大体稳定；
- Research 来源是否明显飘移；
- 最重要的 2–3 个解释是否稳定；
- 是否每轮都“重新发明一套无关 DSP”。

如果漂移很大，再决定是否要把常用 measurement 方法固化为 Skill resource。

## 9. 通过标准

### Architecture Pass

- 一套 Skill；
- 一个 Agent Runner；
- 没有 v2 四 Provider 主链；
- 没有 MCP 依赖；
- Local Song Package / Studio 安全层继续可用。

### Quality Pass

至少两首 benchmark 都满足：

- song-specific；
- timestamp 基本可靠；
- precise claim 有 measurement；
- Research 不编造；
- interpretation 有音乐机制；
- uncertainty 合理；
- Creative 不伪装成原曲转录。

### Simplicity Pass

如果最终发现为了让 Single Agent 工作，我们又需要重新写大量：

- Listen Pass；
- Research Pass；
- Critic Pass；
- Creative Pass；

则本次 v3 收敛失败，应回看模型/Runner 能力，而不是继续堆 orchestration。

## 10. 出错时给什么

如果需要继续修，请保留以下任一信息：

- 页面错误原文；
- 终端最后约 30–50 行；
- `analysis-id` 对应工作区里的 `phase-a-observation.json`；
- `analysis.json`；
- 最有问题的 1–3 段分析结果。

不要提供任何 API Key、登录 token 或其他凭据。
