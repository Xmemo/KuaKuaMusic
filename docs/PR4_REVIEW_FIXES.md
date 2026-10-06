# PR #4 审核修复记录

日期：2026-10-05。审核基线：`08a5d14750973e94747799dec6b9b67bfa24cf6d`。

## 已修复

| 问题 | 修复与验证 |
| --- | --- |
| 音频下载后调用 `crypto.createHash` 中断 | 显式导入 node:crypto；检查下载文件哈希；用实际 ffmpeg/ffprobe 对本机合成测试音频完成转码和时长测量 |
| 默认 Qwen Omni 文本角色使用非流式请求 | DashScope 请求使用 SSE；统一处理分块 UTF-8、错误事件和输出截断；保留 JSON 响应兼容 |
| JSON Object 未提供完整字段合同 | 提示附完整 schema，校验后最多修复一次；Listen/Critic 的时间或引用语义失败可另修复一次；鉴权、网络、取消不重试为格式修复 |
| 同名歌曲的不同录音复用旧音频 | media 保存目录身份摘要和快照；专辑、年份、有效时长、平台或链接变化会重新匹配；Research 缓存同步隔离，旧提示版本重新生成 |
| Listen/Research 并发写 manifest 丢失索引 | 单 API 进程共用更新队列；两个 library 实例同时保存 30 个 Listen + 30 个 Research 记录，60 个索引全部保留 |
| 越界时间戳、错误引用及全局观察支撑精确线索 | 按实际音频时长检查范围、重复 ID、显著时刻引用和覆盖；Critic 精确线索必须有局部定位观察覆盖；跨版本 Critic/Creative 组合拒绝 |
| 中置信匹配缺少实际核对，音源信息不可见 | 中置信先确认；自动匹配下载后时长差异超过阈值先暂停；候选可打开核对；结果展示音源、实测时长、匹配分数、版本警示与更换入口 |

另外补充本机依赖预检、三项缓存复用显示、四维状态、资料范围和未知项展示；搜索可取消，超过 60 条候选可继续展开。Strudel 使用允许的 fast/slow 进行 tempo 实验，拒绝仅空格/引号不同的 A/B 和不在 Blueprint 中的变量。

## 验证结果

- Node.js 24.19.0（项目要求 >=22）：schema 生成无漂移、TypeScript、**102 项测试**、生产构建通过。
- `VITE_MUSIC_V2_ENABLED=1` 的生产构建通过。
- 模拟 Provider 的请求协议、格式修复、语义修复、两轮缓存复用、独立分析与 Studio 快照链路通过。这些测试不评价模型的音乐听觉或文案质量。
- 本机合成测试音频：实际 ffmpeg 转码、ffprobe 测量、SHA-256 检查通过；实测 MP3 时长 1.541224 秒。
- Mac 真实浏览器：v2 页面加载；实际歌曲搜索将 `Battlefield 4 "Warsaw" Theme — Rami & Reyan` 列为首项；依赖预检确认 yt-dlp、ffmpeg、ffprobe、DashScope Key、Codex CLI 与 MusicBrainz 可用。
- 390 像素窄屏：准备状态和搜索入口可读，页面没有横向溢出。结果页的引用、缓存、四维入口、版本限制、切换和取消另有 DOM 回归测试。
- 生产构建仍有现有 Strudel bundle 大于 500 kB 的体积提示；构建成功。

## 真实 Mac 验收：2026-10-06

### 已实际运行

- 本机真实搜索找到 `Battlefield 4 "Warsaw" Theme — Rami & Reyan`，并完成 YouTube 下载、ffmpeg 转码和 ffprobe 测量。
- 选中的音源是 [Rami Battlefield 4 "Warsaw" Theme](https://www.youtube.com/watch?v=_xIC576oHNY)，频道 `jack FZL`，实测 157.44 秒，匹配分数 65%，由人工确认。该频道不是官方频道，页面无说明；因此只证明标题相符，未证明它是发行母带或官方录音。
- `qwen3.5-omni-plus` 成功保存了 6 条 Audio Observation、5 个段落和两个显著时刻（46–55 秒、77–85 秒）。一个没有局部观察覆盖的显著时刻被剔除，其余观察保留。听觉结果提出了稳定四四拍、失真贝斯、层次渐进和约 77 秒旋律进入；和声未知。这是模型观察，未由独立乐谱或可靠制作资料交叉核实。
- Research 确实完成了一轮，但登记结果为 **0 个来源、0 条发现**。记录列出录音身份与年份的未决差异，并明确没有可访问资料支持文化背景、和声或制作细节。UI 因此没有展示来源引用；本次文化与技术资料验收不通过。
- Critic 曾生成 3 个不同侧重的概括和 7 条解释，但模块跨类别引用未通过校验；旧逻辑把模块全部移除。Studio 随后因变量引用未列入 Blueprint 总来源而失败，未产出可播放的 A/B Seed。真实内容链路因此没有通过验收。

### 本轮修复与当前阻挡

- YouTube 搜索改用扁平候选元数据，避免一个不可用视频让整组搜索失败。
- Listen 只剔除没有局部观察支撑的显著时刻；有效观察保留。
- Critic 跨类别模块现在按通过证据审核的解释拆分，模块只复用相应解释文本；空证据时不再调用 Critic，并向 UI 返回 Listen/Research 失败原因。
- Creative 自动把变量已经引用的观察 ID 加入 Blueprint 总来源列表，不扩大变量的证据范围。
- 上述修复已由 TypeScript、生产构建和 **102 项测试**验证。新的在线 Critic/Creative 修复尚未得到真实模型确认：重新运行时，DashScope 返回 `Access denied, please make sure your account is in good standing`，页面链接指向逾期账单错误。官方说明要求在阿里云费用中心核对欠费/余额；若账户无欠费，再核对 API Key 是否属于当前账号。[阿里云错误码说明](https://help.aliyun.com/zh/model-studio/error-code#overdue-payment)

**真实内容验收状态：未通过。** 账号恢复后，用缓存的本地音频重新分析即可继续；无需再次下载。届时仍需确认音源版本、Research 是否能登记可读资料、Critic 模块质量和 Studio A/B 是否实际播放。不得据本地自动化测试宣称分析效果达标。

AST 与运行时安全校验检查执行边界、A/B 的程序差异及变量名称归属；它们不能证明听觉机制正确。未完成真实内容验收前，不切换默认路径、不合并、不发布。
