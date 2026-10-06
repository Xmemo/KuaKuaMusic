# MusicLearning2026 v2 本机端到端验收

> 目标：验证真实链路 **搜索歌曲 → YouTube 匹配 → 本地音频 → Qwen Listen → independent Research → Critic → Creative Blueprint → Strudel A/B**。  
> 在本验收通过前，不把 v2 设为默认用户路径。

## 1. 准备分支

使用 Node.js 22 或更新版本，先用 `node --version` 确认。

```bash
git fetch origin
git switch arch/music-learning-v2-audio-first-2026-10-05
git pull --ff-only
npm ci
```

## 2. 检查本地音频工具

```bash
yt-dlp --version
ffmpeg -version
ffprobe -version
```

如果命令不存在，再按你机器现有的软件管理方式安装；不要为了本次测试修改系统代理、浏览器 Cookie 或 YouTube 登录状态。

可通过 `MUSIC_YTDLP_BIN`、`MUSIC_FFMPEG_BIN`、`MUSIC_FFPROBE_BIN` 指定已有工具的绝对路径。

## 3. 配置 .env.local

不要把 API Key 发到聊天、GitHub 或提交记录。

在现有 `.env.local` 中确认：

```bash
MUSIC_V2_ENABLED=1
VITE_MUSIC_V2_ENABLED=1

MUSIC_LISTEN_PROVIDER=dashscope
MUSIC_LISTEN_MODEL=qwen3.8-omni-flash
MUSIC_RESEARCH_PROVIDER=dashscope
MUSIC_RESEARCH_MODEL=qwen3.8-omni-flash
MUSIC_RESEARCH_BACKEND=registered-web
MUSIC_CRITIC_PROVIDER=dashscope
MUSIC_CRITIC_MODEL=qwen3.8-omni-flash
MUSIC_CREATIVE_PROVIDER=dashscope
MUSIC_CREATIVE_MODEL=qwen3.8-omni-flash

DASHSCOPE_API_KEY=<你的 Key>
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_UPLOAD_URL=https://dashscope.aliyuncs.com/api/v1/uploads
```

默认 Research 缓存为 168 小时。首次验收不用改。

`registered-web` 由本机 Codex CLI 读取网页并登记片段，再交给所选 Research 模型整理；配置 DashScope Key 之后仍需 **Codex CLI 已登录、项目 exec 配置可用、MusicBrainz MCP 可用及网页网络访问**。启动后查看页面「本机准备状态」，它只检查依赖及密钥是否配置，不证明密钥有效或歌曲内容质量达标。

## 4. 启动

```bash
npm run dev
```

打开：

```
http://127.0.0.1:3000
```

页面标题应显示 **Audio-first v2 Beta**。

## 5. 首选验收歌曲

优先测试：

**Battlefield 4 “Warsaw” Theme — Rami**

原因：这首歌正是促成 v2 架构改变的案例，已有一轮旧版/证据版结果可对照，而且存在明确的约 1:15 结构转折讨论。

## 6. 第一次运行要观察什么

### A. YouTube Materialize

确认：

- 自动选到的不是 cover / live / remix / slowed / extended 等错误版本；
- 中等置信度及相近候选均先展示 Top 3，让用户打开音源确认；
- 下载后用 ffprobe 实测时长，若与目录相差超过 10 秒或 5%（取较大值），在 Listen 前暂停确认；人工选定的版本仍显示时长差异说明；
- 结果页展示实际音源的标题、频道、链接、实测时长与匹配分数；「更换音源」可重新选择；
- 选定后本地出现：
  `.music-learning/library/<song-id>/media/<media-revision-id>/`
- 目录中有 acquisition metadata、source audio 和 `analysis.mp3`。

### B. Listen Pass

重点看：

- 是否产生真正的秒级 observation；
- 约 1:15 的显著变化是否能被独立指出；
- rhythm / timbre / arrangement / structure 等描述是否有歌曲特异性；
- 不确定的和弦、调性、制作技术是否真的进入 uncertainty，而不是装作确定；
- 不应出现“某乐评说”“采访中提到”等 Research 信息。

### C. Research Pass

确认：

- Research 不复述 Listen 的 timestamp 作为自己发现；
- 页面有真实来源；
- 本地 Research artifact 中保留 source / excerpt / hash；
- 资料少时允许少，而不是用风格常识伪造歌曲事实。

### D. Critic

重点判断内容质量，而不是只看 schema：

- 是否比 v1.2 更像“有见解的乐评”；
- 是否能把 Audio Observation、外部资料和通用音乐原理自然连接；
- 三种总体概括是否真的不同；
- 是否避免“把一般风格特征说成本曲已确认事实”；
- 秒级听歌提示是否来自 Audio Observation。
- 超出实际音频、倒置的时间范围、不存在的观察引用必须被拒绝；精确线索不能仅引用全局观察。
- 作品背景、来源所谈版本与所选录音的适用范围明确，资料缺口可见。

### E. Creative / Strudel

确认：

- 有适合实验的机制时才出现 Creative Blueprint；
- Blueprint 的变量确实来自前面分析，比如 rhythmic density / layer entry；
- Studio 明确显示为 `learning_reconstruction`；
- A / B 都能在内置 Strudel Player 播放；
- A/B 的差别确实对应 Blueprint 所说的变量；
- 不应声称代码是原曲精确鼓点/和弦/扒谱。

## 7. 第二次运行：验证缓存

不改歌曲、不强制刷新，再分析一次。

应观察到：

- 本地音频直接复用，不重新下载；
- 相同 media revision + Listen model + prompt version 时复用 Listen；
- 近期 independent Research 默认复用；
- 页面分别显示音频、Listen、Research 是否复用；
- 再选同名歌曲的不同专辑、时长或平台链接时，必须重新匹配；原 media revision 和分析 artifact 保留；
- Critic / Creative 可以重新生成，因为它们是解释与创作层。

当前 manifest 更新在单个本机 API 进程内串行化，避免 Listen/Research 并发保存丢失索引。不要启动两个 API 进程同时写同一个 library 目录。

## 8. 验收结果

### 通过

满足：

1. 音源正确；
2. Listen 有明显歌曲特异性且 timestamp 基本可信；
3. Research 独立；
4. Critic 内容质量明显优于仅引用资料的 v1.2；
5. provenance 没混淆；
6. Strudel A/B 可播放且实验变量与分析一致；
7. 第二次运行缓存符合预期。

### 不通过

不要只回复“结果不好”。请优先保留下面任一信息：

- 页面错误原文；
- 终端最后约 30 行错误；
- 错误发生阶段（Materialize / Listen / Research / Critic / Creative / Studio）；
- 如果是内容质量问题，贴最有问题的 1–3 段输出。

不要粘贴 API Key。

## 9. 验收之后再做

只有真实 E2E 通过后，才进入下一 Gate：

- 把 v2 接成默认分析路径；
- 决定旧 v1.2 history 如何保留/迁移；
- 增加 Deep Dive re-listen；
- 再 benchmark SiliconFlow / cheaper model，优化成本。
