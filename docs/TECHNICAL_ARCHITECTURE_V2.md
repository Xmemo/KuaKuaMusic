# MusicLearning2026 技术架构 v2.0

> 状态：目标架构已冻结，运行时迁移中。当前 `a3fe921` / v1.2 仍是可运行基线；在真实音频链路验收前，不替换现有默认 `/api/agent/analyze`。

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

### 4.4 自动 / 人工阈值

- `best >= 0.88` 且领先第二名 `>= 0.08`：**高置信自动选择**。
- `best >= 0.75` 且领先第二名 `>= 0.05`：**中置信自动选择 + Listen 后 sanity check**。
- 其他情况：**显示 Top 3 让用户选择**。
- 后续 sanity check 发现时长、版本类型或内容明显冲突时，不覆盖记录，创建新的 media revision。

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
│   ├── acquisition.json
│   ├── source.*
│   └── analysis.*
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

所有 artifact 均新增版本，不覆盖历史。相同 media hash 可以复用 Listen 结果；模型或 prompt 版本改变时产生新的 observation run。

## 6. Provider Architecture

业务层禁止直接调用 `callQwen()`、`callSiliconFlow()` 或 `codex exec`。

角色：

- **Listen Provider**：必须支持 audio understanding + structured output。
- **Research Text Provider**：整理检索材料；搜索能力由 Research Backend 独立提供。
- **Critic Provider**：Observation + Research → Analysis。
- **Creative Provider**：Analysis / Observation → Creative Blueprint。

Research Backend 独立配置：

- `registered-web`：继续使用 v1.2 的读取、片段登记与哈希机制；默认。
- `provider-native`：未来可直接使用支持原生 Web Search 的模型。
- `codex-web`：未来可把 Codex CLI 作为研究执行器。

默认 v2 开发配置：

```
Listen    = DashScope / qwen3.5-omni-plus
Research  = DashScope / qwen3.5-omni-plus + registered-web
Critic    = DashScope / qwen3.5-omni-plus
Creative  = DashScope / qwen3.5-omni-plus
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

第一轮 Research 不读取 Listen artifact，以保证独立性。继续优先登记：

- 官方 credits
- 创作者 / 制作人采访
- 专业乐评
- 制作 breakdown
- 历史与文化语境
- 谱例 / 转录（如存在）

第一轮完成后，如果 Listen 发现了非常显著而 Research 未覆盖的时刻，可有一轮 targeted follow-up。该轮必须标记 `guidedByObservationIds`，不能冒充独立 corroboration。

## 9. Critic Pass

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

分析与 Studio 之间增加正式中间层：

**Observation → Interpretation → Creative Blueprint → Strudel**

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

Studio revision 需要继续保存 observation / interpretation / blueprint 的来源 ID，使用户能从一个实验反查“为什么让我改这个变量”。

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

### P0

1. Song Package 与 matcher。
2. Provider Registry 与 role-based config。
3. MusicObservationDocument v2 contract。
4. DashScope Listen adapter。
5. 现有 registered-web 改造成独立 Research Pass。
6. Critic：Observation + Research → 当前前端可读 Analysis。
7. Creative Blueprint contract + Strudel adapter mapping。
8. 在真实 Mac 上完成一首歌曲端到端验收后，再切默认 analyze route。

### P1

- YouTube resolver 的真实候选搜索与 source sanity check。
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
