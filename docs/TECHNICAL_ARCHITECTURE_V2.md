# MusicLearning2026 技术架构 v2.0

> 状态：目标架构已冻结，v2 后端主链已实现并由 feature flag 隔离。当前 `a3fe921` / v1.2 仍是默认用户路径；在真实 Mac 音频链路验收前，不替换现有默认 `/api/agent/analyze`。

## 1. 核心判断

v2.0 将歌曲本身重新设为第一手材料：

**Search → Materialize → Listen → Research → Critic → Deep Dive → Creative Blueprint → Strudel Experiment**

四条冻结原则：

1. **音频是歌曲特异性分析的第一手材料。** 网页资料不再承担“替代听歌”的职责。
2. **Research 与 Listen 独立执行。** 第一轮 Research 不读取 Listen 结果，避免乐评污染模型的独立听觉观察。
3. **模型是 Provider，不是架构。** Listen、Research、Critic、Creative 四个角色分别配置，可独立切换 DashScope、SiliconFlow、Codex CLI 或未来本地模型。
4. **分析最终产物不只是文章。** Song-specific Observation 必须能够继续映射为 Creative Blueprint，再转成可执行 Strudel 教学实验。

## 2. 总体结构

```
Song Search (保留 v1.2)
        │
        ▼
Local Song Materializer
        │
        ├─ Audio Source Resolver
        ├─ Candidate Matcher
        ├─ Acquisition Adapter
        ├─ Normalizer / Cache
        └─ Acquisition Provenance
        │
        ▼
Local Song Package
        │
   ┌────┴──────────────┐
   │                   │
   ▼                   ▼
Listen Pass       Research Pass
Audio Provider    Research Backend + Text Provider
   │                   │
   ▼                   ▼
Observation       Research Artifact
   │                   │
   └────────┬──────────┘
            ▼
        Critic Pass
      Text Provider
            │
            ▼
         Analysis
            │
      ┌─────┴──────┐
      ▼            ▼
  Deep Dive   Creative Blueprint
                   │
                   ▼
             Strudel Adapter
                   │
                   ▼
            A/B Learning Experiment
```

## 3. 与 a3fe921 的关系

### 保留

- 现有歌曲搜索和网易云 / QQ / Apple / Spotify / YouTube 链接解析。
- React 页面、SSE 进度、历史恢复、来源展示、Deep Dive 与 Strudel Studio。
- Source Registry 的 URL、正文片段、哈希、retrievedAt 和版本范围。
- analysisId / deepDiveId / Studio revision 的不可覆盖历史原则。
- Strudel 的 `source_transcription / learning_reconstruction / user_version` provenance。

### 退出主路径

v1.2 的核心假设“歌曲专属音乐判断首先必须由网页摘录支持”退出主路径。v2.0 改为：

- `audio_observation`：模型独立听音频得到，必须带时间范围、模型和置信度。
- `external_evidence`：网页、采访、乐评、官方资料。
- `general_theory`：通用音乐原理。
- `ai_interpretation`：基于前述材料形成的解释。

网页不需要证明每一条通用音乐原理；Audio Observation 也不能冒充精确乐谱或转录。

## 4. Local Song Materializer

### 4.1 Canonical Song

现有 SongMetadata 继续作为搜索结果，但 materializer 使用更稳定的 CanonicalSong，并补充可用时长：

```ts
{
  title,
  artist,
  album?,
  releaseYear?,
  durationSec?,
  sourcePlatform?,
  sourceTrackUrl?
}
```

iTunes 的 `trackTimeMillis` 应在迁移时保存，以提高音源匹配质量。

### 4.2 Audio Source Resolver

默认实现目标为 YouTube resolver，但业务层只依赖 `AudioSourceProvider`。未来可以替换为 Local File、授权音源或其他来源。

搜索最多取 5–10 个候选，查询优先：

- `"{title}" "{artist}"`
- `"{title}" "{artist}" official`
- `"{title}" "{artist}" audio`
- 有 album 时增加 `"{title}" "{artist}" "{album}"`

不允许“取第一条直接使用”。

### 4.3 Candidate Match

第一版固定五类信号：

| 因子 | 基准权重 |
| --- | ---: |
| 标题 | 35% |
| 艺人 | 25% |
| 时长 | 20% |
| 专辑 / 版本 | 10% |
| Channel authority | 10% |

缺少时长或专辑时，对实际可用信号重新归一化，不因为元数据缺失自动判低分。

候选标题包含而目标标题不包含以下变体时扣分：`cover / karaoke / slowed / sped up / nightcore / reverb / 8D / fanmade / remake / live / extended / remix`。如果目标本身就是该版本，不扣分。

Channel authority 优先：官方艺人频道、Topic、发行商/厂牌、游戏发行方等。

YouTube 查询最多 3 轮。目录带专辑时先查「歌名 + 专辑」，再查纯歌名，最后才加艺人名；没有专辑时查纯歌名、歌名 + 艺人、歌名 + 艺人 + `official audio`。若已有候选达到高置信自动阈值则提前结束，否则合并并按匹配分重排结果。这样避免版权别名艺人名把搜索带偏。

### 4.4 自动 / 人工阈值

- `best >= 0.88` 且领先第二名 `>= 0.08`：**高置信自动选择**。
- `best >= 0.75` 且领先第二名 `>= 0.05`：**先人工确认，再下载和 Listen**；尚未实现内容级自动版本核对，因此不自动放行。
- 其他情况：只从可置信候选中显示 Top 3。普通候选须标题相似度至少 `0.35`、艺人相似度至少 `0.35` 且综合分至少 `0.65`；标题强匹配（标题相似度至少 `0.9`、综合分至少 `0.45`）可作为**仅供人工核对**的候选，以容纳版权别名或错误艺人元数据，不据此自动选择。低标题相关度的候选不会因为艺人名碰巧相同就显示。
- 下载后由 ffprobe 实测分析音频时长。与目录时长相差超过 `max(10 秒, 5%)` 的自动匹配先暂停，用户确认后才可 Listen；人工已选版本保留警示。更换音源创建新的 media revision，确认同一个待确认下载可以复用该 revision。
- 选中目录歌曲后收起长目录列表；匹配完成后显示候选或明确的无可信匹配状态，并可返回目录切换版本。
- 自动音源的标题、频道、链接、时长和匹配分数始终可检查；「更换音源」重新列出候选。匹配分数不是正确版本的概率。

### 4.4.1 录音缓存与结果边界

- Song Package 仍按 title + artist 聚合，media 保存独立的目录身份快照。
- 音频缓存必须匹配 title、artist、album、releaseYear、有效 durationSec、sourcePlatform、sourceTrackUrl 的身份摘要，且音频文件仍存在。
- Listen 按 media revision、provider、model、promptVersion 复用；Research 另校验目录身份摘要、promptVersion 和 TTL，旧缺少这些字段的缓存重新生成。
- Listen/Research 同时保存时，manifest 的读取、修改、写入在本机单个 API 进程中串行化；原子替换仅保证单文件落盘。当前不支持多个 API 进程同时写同一 library。
- Listen 的 sections、observations、notableMoments 检查范围、重复 ID 和引用；显著时刻必须由局部观察覆盖。Critic 精确时间线索必须位于实测时长内，且由 time_localized 观察覆盖。
- DashScope 文本和音频请求使用 SSE；JSON Object 模式仍发送完整合同形状并在本机校验。格式失败最多补一次；Listen 与 Critic 另外对语义验证失败补一次。鉴权、网络和取消不作为格式修复重试。
- 页面预检包括 yt-dlp、ffmpeg、ffprobe、所选 Provider 的密钥是否配置，以及 registered-web 需要的 Codex CLI/登录/MusicBrainz。预检不调用付费模型。

### 4.5 Acquisition Provenance

每次 acquisition 至少保存：

```json
{
  "provider": "youtube",
  "sourceId": "...",
  "sourceUrl": "...",
  "sourceTitle": "...",
  "channel": "...",
  "durationSec": 0,
  "matchScore": 0,
  "matchDecision": "auto_high",
  "downloadedAt": "...",
  "sha256": "..."
}
```

音频文件永不提交 Git，不提供公开下载 URL。Audio acquisition 必须保持 adapter 边界；产品公开化前需重新确认具体来源和授权路径。

## 5. Local Song Package

目标目录：

```
.music-learning/library/<song-id>/
├── manifest.json
├── identity.json
├── media/
│   └── <media-revision-id>/
│       ├── media.json
│       ├── acquisition.json
│       ├── source.*
│       └── analysis.*
├── observations/
│   └── <listen-run-id>.json
├── research/
│   └── <research-run-id>.json
├── analyses/
│   └── <analysis-id>.json
├── creative/
│   └── <blueprint-id>.json
├── deep-dives/
└── studio/
```

Song Package 的稳定 ID 以规范化后的 title + artist 为主；album/year 是身份元数据，不参与默认 package key，避免网易云、QQ、Apple 的目录差异把同一首歌拆成多个本地包。具体录音/母带/现场版本由 media revision 与 acquisition provenance 区分。

所有 artifact 均新增版本，不覆盖历史。当前实现按 `mediaRevisionId + Listen provider + model + promptVersion` 复用 Listen 结果；模型、Prompt 或 media revision 改变时产生新的 observation run。Independent Research 按 provider/model/backend + TTL 复用，默认 TTL 为 168 小时。

## 6. Provider Architecture

业务层禁止直接调用 `callQwen()`、`callSiliconFlow()` 或 `codex exec`。

角色：

- **Listen Provider**：必须支持 audio understanding + structured output。
- **Research Text Provider**：整理检索材料；搜索能力由 Research Backend 独立提供。
- **Critic Provider**：Observation + Research → Analysis。
- **Creative Provider**：Analysis / Observation → Creative Blueprint。

Research Backend 独立配置：

- `registered-web`：**当前已实现，默认。** 第一版用现有 Codex Web discovery 找资料，再由 Source Registry 读取正文、定位 excerpt、登记 hash；之后由所选 Research Text Provider（默认 Qwen）整理成 ResearchArtifact。
- `provider-native`：预留。未来可直接使用支持原生 Web Search 且能满足 provenance 要求的模型；当前未启用，因为仅“模型说它搜过”不能替代现有 URL/excerpt/hash 记录。
- `codex-web`：已定义为 Codex 端到端 Research 模式；使用时要求 `MUSIC_RESEARCH_PROVIDER=codex-cli`。

默认 v2 开发配置：

```
Listen    = DashScope / qwen3.8-omni-flash
Research  = DashScope / qwen3.8-omni-flash + registered-web
Critic    = DashScope / qwen3.8-omni-flash
Creative  = DashScope / qwen3.8-omni-flash
```

未来只改配置即可形成：

```
Listen    = SiliconFlow / Qwen Omni
Research  = Codex CLI + registered-web 或 codex-web
Critic    = Codex CLI / GPT
Creative  = 任意支持结构化文本的模型
```

Provider capability 至少区分：

- `audioUnderstanding`
- `structuredText`
- `nativeWebSearch`
- `localExecution`

`provider-native` Research 只有在 Provider 声明 `nativeWebSearch` 时允许。

## 7. Listen Pass / MusicObservationDocument

Listen 第一轮只得到音频、title、artist、album 等最小身份，不读取乐评、不启用 Web Search。

目的：记录“听到了什么”，不是直接写乐评。

### 7.1 Global Profile

- styleTags
- moodTags
- overallCharacter
- confidence

这些仍然属于 `audio_observation`，不是数据库事实。

### 7.2 Timeline

每个 section：

- id
- startSec / endSec
- label
- description
- confidence

label 允许 `intro_like / verse_like / chorus_like / build / transition / break / climax / outro_like / other / unknown`，不强迫器乐作品套 Verse/Chorus。

### 7.3 Song-specific Observation

类别：

- rhythm
- harmony
- melody
- timbre
- arrangement
- structure
- production
- energy

每条至少：

- id
- category
- statement
- startSec / endSec（整曲观察可为空）
- tags
- confidence
- precision：`global / section / time_localized`

没有把握时可以没有该类别，不再强制四格填满。

### 7.4 Notable Moments

用于产品最关键的“这里一定要听”：

- startSec / endSec
- salience
- title
- observationIds

### 7.5 Estimated Parameters

Audio LLM 可以估计 BPM / key / meter，但必须放在 `estimatedParameters`，不得叫 measurement。

未来专门 MIR 模型输出的结果可另记为 `machine_measurement`，两者不可混淆。

### 7.6 Uncertainty

Listen 必须主动输出 uncertainty，例如“完整混音下无法可靠判断具体和弦进行”。

### 7.7 Listen 禁令

- 不使用网页事实补写听觉观察。
- 不把推测和弦、音符写成精确转录。
- 不写最终因果乐评；“为什么会让人怎样感受”留给 Critic。

## 8. Research Pass

第一轮 Research 不读取 Listen artifact，以保证独立性。代码层进一步拆成两个职责：

1. **Research Backend**：发现并真实读取资料，产生可追溯的 registered sources。
2. **Research Text Provider**：只读取已登记 excerpt，形成 ResearchArtifact findings；每条 finding 必须引用真实 evidenceId。

默认 `registered-web` 因而仍保留 v1.2 已验证的网页读取安全边界，同时不把 Critic/Creative 继续绑死在 Codex。

继续优先登记：

- 官方 credits
- 创作者 / 制作人采访
- 专业乐评
- 制作 breakdown
- 历史与文化语境
- 谱例 / 转录（如存在）

第一轮完成后，如果 Listen 发现了非常显著而 Research 未覆盖的时刻，可有一轮 targeted follow-up。该轮必须标记 `guidedByObservationIds`，不能冒充独立 corroboration。

## 9. Critic Pass

Critic 的每条 interpretation 必须引用已有 Audio Observation 或外部 evidence；走心 / 上头 / 懂行也保存 `interpretationIds`，避免总体文案成为新的无来源事实层。

输入：

- Canonical Song
- MusicObservationDocument
- Research Artifact
- 可选 Style Prior / General Music Knowledge

输出仍可呈现走心 / 上头 / 懂行以及动态音乐模块，但 provenance 必须保持四层：

1. Audio Observation：我听到了什么。
2. External Evidence：别人/资料说了什么。
3. General Theory：音乐学上通常怎么解释。
4. Interpretation：因此如何理解这首歌。

Research 不允许改写原始 Listen artifact；只能 confirm、contradict、add context、add interpretation。

## 10. Deep Dive

Deep Dive 可以对目标时间区间做 re-listen。输入应包括：

- 原始音频引用
- 当前 Observation
- 当前 Research
- 用户问题

必要时增加 targeted research。Deep Dive 新观察保存为新 artifact 或明确追加记录，不能静默改写旧 Listen run。

## 11. Creative Blueprint

分析与 Studio 之间增加正式中间层；当前实现先生成 deterministic `StrudelPlan`，只把已支持的变量映射到 Strudel operation / visual hint；再由 Creative Provider 生成 A/B pattern，并通过现有 `runtimePolicy` 的 JavaScript/密度/播放约束校验。服务端强制 sourceType=`learning_reconstruction`：



**Observation → Interpretation → Creative Blueprint → StrudelPlan → Validated Studio Seed → Strudel Runtime**

Blueprint 不是原曲转录，而是“哪些有依据的音乐机制可以变成可操作变量”。

第一版支持变量：

- tempo
- rhythmic_density
- subdivision
- syncopation
- layer_entry
- register
- motif_repetition
- harmonic_rhythm
- texture_density
- filter_motion
- timbre_brightness

抽象情绪（如 nostalgic / heroic / dark）不能直接映射；必须先由 Critic/Creative Provider落到可操作的音乐变量。

每个 Blueprint 必须记录：

- `sourceObservationIds`
- `sourceInterpretationIds`
- variables
- preserve
- listenFor
- limitations

## 12. Strudel 边界

所有没有可靠谱面/转录依据的实验默认仍为 `learning_reconstruction`。

Creative Blueprint 映射示例：

| Observation / mechanism | Blueprint variable | Strudel |
| --- | --- | --- |
| repetition | motif_repetition | sequence |
| rhythmic density | rhythmic_density | subdivision / fast |
| layer entry | layer_entry | stack |
| tempo | tempo | setcpm |
| register | register | octave / note range |
| harmonic rhythm | harmonic_rhythm | chord-change pattern |
| texture density | texture_density | layer count |
| filter movement | filter_motion | filter parameters |

Studio Seed 保存 `blueprintId + sourceObservationIds + sourceInterpretationIds`，使用户能从一个实验反查“为什么让我改这个变量”。生成的 code / alternativeCode 必须通过现有 `validateStudioCode`；不允许外部 sample bank、网络访问、任意 JavaScript 或把估计内容标为原曲转录。

## 13. 进度状态

v2 SSE 建议：

- `resolving_audio`：寻找匹配音源
- `awaiting_source_confirmation`：需要用户确认版本
- `acquiring_audio`：准备本地音频
- `listening`：独立听歌
- `researching`：检索乐评与背景
- `targeted_research`：针对显著观察补查
- `critic`：综合分析
- `creative_blueprint`：生成可实验变量
- `complete`

## 14. 失败降级

- 找不到可靠音源：允许用户选择候选或提供本地文件。
- Listen 失败：可继续 Research-only，但明确标记“本轮未完成音频分析”。
- Research 稀少：Audio + General Theory 仍可形成解释，但外部资料覆盖应明确不足。
- Research 失败：允许 Audio-only analysis。
- Creative Blueprint 失败：分析仍然可用，不强迫出现 Studio。

## 15. 本地与云端边界

“Local Song Package”表示获取、缓存和 artifact 保存在本地；使用 DashScope / SiliconFlow 作为 Listen Provider 时，分析音频仍会临时发送到云端模型。

未来完全本地化只需替换 AudioUnderstandingProvider，不改变上层合同。

## 16. 迁移计划

### P0 — 代码已实现，等待真实 E2E

1. Song Package 与 matcher。
2. Provider Registry 与 role-based config。
3. MusicObservationDocument v2 contract。
4. DashScope Listen adapter + 临时上传。
5. registered-web 独立 Research Pass + Source Registry。
6. Critic：Observation + Research → Critic Analysis。
7. Creative Blueprint → StrudelPlan → validated A/B Studio Seed。
8. 一键 `POST /api/agent/v2/analyze`、本地复用与 Listen/Research 单边失败降级。
9. **待办 Gate：在真实 Mac 上完成至少一首歌曲 E2E，再决定默认前端切换。**

### P1

- YouTube resolver 的真实候选搜索、人工版本确认与下载后时长校验；内容级自动版本核对尚待实现。
- Local File Provider。
- Deep Dive re-listen。
- Style Prior / Music Description Corpus。
- Flash / SiliconFlow 成本 benchmark。

### P2

- Chord / beat / transcription 等专门 MIR 工具，只在 Omni benchmark 证明确实有缺口后加入。
- 完全本地 Audio LLM。
- 更精细的 automatic transcription → source_transcription 流程。

## 17. 第一轮验收 Gate

在默认路由切到 v2 前必须完成：

1. 同一歌曲能稳定 materialize 为同一个 Song Package / media revision。
2. matcher 的高、中、人工三档行为有自动测试。
3. Listen 不读取 Research，Research 第一轮不读取 Listen。
4. Observation 有真实 timestamp，且 uncertainty 不为空时能被保留。
5. Research 与 Listen 对同一时刻独立收敛时，Critic 能保留两种 provenance。
6. Blueprint 只能引用存在的 observation / interpretation。
7. Strudel 未经转录支持时保持 `learning_reconstruction`。
8. 切换 Provider 只改配置与 adapter，不修改 pipeline 业务代码。
