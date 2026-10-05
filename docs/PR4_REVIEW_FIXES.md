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

- Node.js 24.19.0（项目要求 >=22）：schema 生成无漂移、TypeScript、**97 项测试**、生产构建通过。
- `VITE_MUSIC_V2_ENABLED=1` 的生产构建通过。
- 模拟 Provider 的请求协议、格式修复、语义修复、两轮缓存复用、独立分析与 Studio 快照链路通过。这些测试不评价模型的音乐听觉或文案质量。
- 本机合成测试音频：实际 ffmpeg 转码、ffprobe 测量、SHA-256 检查通过；实测 MP3 时长 1.541224 秒。没有 YouTube 下载或付费模型请求。
- Mac 真实浏览器：v2 页面加载；实际歌曲搜索将 `Battlefield 4 "Warsaw" Theme — Rami & Reyan` 列为首项；依赖提示正确显示 yt-dlp 与 DashScope Key 缺失，ffmpeg/ffprobe/Codex 登录/MusicBrainz 可用。
- 390 像素窄屏：准备状态和搜索入口可读，页面没有横向溢出。结果页的引用、缓存、四维入口、版本限制、切换和取消另有 DOM 回归测试。
- 生产构建仍有现有 Strudel bundle 大于 500 kB 的体积提示；构建成功。

## 尚需真实验收

本次按用户要求先完成代码修复。本机缺少有效配置的 DashScope Key 与 yt-dlp，未运行真实 YouTube → Qwen Listen → Research → Critic → Strudel 全链路。因此，以下事项尚未证明：正确录音下载、Qwen 秒级观察的准确度、三种概括和技术解释的内容质量、生成 A/B 实际只改变所声明的音乐变量。

AST 与运行时安全校验检查执行边界、A/B 的程序差异及变量名称归属；它们不能证明听觉机制正确。内容级自动版本核对也尚未实现，目前采用人工确认与实际时长检查。

按 `docs/LOCAL_V2_ACCEPTANCE.md` 完成真实歌曲验收后，再考虑默认路径切换、合并与正式发布。
