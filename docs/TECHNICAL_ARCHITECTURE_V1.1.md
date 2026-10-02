# MusicLearning2026 技术架构 v1.1

本轮修订保留 PRD v0.3 冻结基线和单 Agent 模型，将 v1 骨架接入实际页面，并修复证据归属、客户端信任和历史覆盖问题。

## 研究路径

React/Vite 调用本机 Express。一次研究由同一个 Codex Agent 分阶段完成：资料计划、基于服务端登记片段的解释、语义审核。MusicBrainz 负责 recording/work/release 身份；网页研究发现具体资料。阶段划分属于内部执行流程，不引入两个产品角色。

服务端自行读取公开来源，规范化正文，检查提议的短片段确实存在，再分配 source.id 和 excerpt.id。解释只能引用登记的 evidenceIds。读取器限制重定向、内容类型、大小和连接时间，验证并固定公开 IP；禁止访问本机、私网及携带凭据的 URL。MusicBrainz 登记片段只支持 identity 主题。

资料正文、用户输入和外部指令均为不可信数据。CLI 使用 read-only sandbox、非 shell 启动、输出限制、超时和可取消进程组；不读取 Agnes 凭据。

## 硬约束与语义审核

| 问题 | 本轮处理 |
| --- | --- |
| 模型返回不完整字段或额外字段 | AJV 严格执行 Schema；拒绝结果 |
| 引用没有读取过的资料 | 服务端登记来源和片段；拒绝伪造来源与悬空引用 |
| 身份资料被当成节奏依据 | identity-only 片段不能支撑 rhythm 等判断 |
| live 资料用于 studio 判断 | 来源、判断与所选版本范围必须一致 |
| 摘要引入新的事实 | 模块摘要由已有判断拼接 |
| 三种观感夹带新事实 | Agent 审核表达；失败时回退到已有判断 |
| 身份元数据没有依据 | 审核失败后清除未确认的专辑、年份和标识，降为未解决身份 |
| 原曲转录只有一个泛泛谱源 | 审核实际音符/节奏是否受支持；未核实降为教学演示 |

片段存在性、引用完整性和范围匹配是代码约束。自然语言是否足以支持结论、版本名称是否合理、A/B 是否确实只改变一个音乐变量，仍包含模型判断。不得把当前实现称作事实正确性的证明或完整 Evidence Graph 数据库。审核记录随研究保存，以便人工追溯。

所有生成契约定义在 music-learning/contracts.mjs，schemas/*.schema.json 由脚本生成，避免 CLI 与服务端 Schema 漂移。公开分析、内部草稿、Deep Dive、审核和 Studio 建议有各自 Schema。TypeScript 使用对应的前端类型；回归测试校验生成文件一致。

## 身份与资料不足时的流程

分析身份可为 resolved、ambiguous 或 unresolved。歧义显示候选，用户选择后进行新的分析。没有确认身份时不输出 supported 的歌曲专属技术事实。

没有可用歌曲模块时保留具体问题入口：analysisItemId="question"。通用机制、聆听练习和教学实验可以继续，但要明说不能由此确定原曲如何制作。这是对冻结用户流程的实施细化，没有新增音频测量能力。

## 保存模型

每次分析创建 UUID analysisId，原始分析快照保持不变。深挖使用服务端读取的快照，并创建独立 deepDiveId，相同分析点可以有多轮问题和资料。

一个 package 保存 analysis、累计 sources、deepDives、studioSessions 和审核记录。新增来源与旧来源合并；相同 ID 的内容不可替换。每个研究串行执行写操作，采用同目录临时文件、fsync 与 rename 一次替换整个 package，避免出现半份记录。此方案用于单进程本机服务，不是多进程数据库事务；未来若增加云端并发用户，需要重新选择持久化实现。

旧歌曲键目录不删除、不自动迁移。页面提供历史恢复和 JSON 导出；临时保存模式明确提示其生命周期。

## 本机运行边界

- Vite 与 Express 绑定 127.0.0.1，支持可配置端口。
- 检查 Host、Origin 与 Fetch Metadata；仅允许本应用的回环来源。
- /api/agent/session 提供当前进程生成的 token，研究和记录接口必须携带它。
- 同时只执行一个分析、深挖或 Studio 建议任务；并发请求得到 409。
- 客户端断开会取消当前任务。CLI 输出、每个调用时间及错误消息有边界。
- health 分别检查 CLI、登录状态、exec 配置参数支持和 MCP initialize/tools/list。研究进程通过共享配置参数显式启用公开 MusicBrainz MCP，无需更改用户的项目信任配置。网页研究可用性保持 unverified，不能从 CLI 版本推断。

默认超时是每次 Codex 调用 180 秒；研究包含多个调用，总时间可能达到数分钟。当前不提供跨服务重启的任务恢复、流式阶段进度或自动重试。已有成功保存的研究仍可恢复。

## Studio 实验与版本

每个 seed 保存问题、唯一变量、A/B 说明、保持一致的条件、聆听目标和实验边界。代码和 alternativeCode 都是教学实验对象；速度、beatsPerCycle、音源和运行时标识独立记录。

每次 revision 保存代码与完整 playback。AI 先读取已保存的当前版本，返回带 baseRevisionId 的 proposal；页面比较前后代码和速度，由用户应用。当前版本变化或预览之后草稿变化时，禁止应用旧建议。Undo/Redo 同时恢复速度和来源类型。

保存还检查 saveVersion，拒绝另一页面提交的旧记录，避免覆盖已保存的新历史。

服务端从原始 seed 重新确认来源类型，客户端不能把修改后的代码标成 source_transcription。新实验使用 soundBank=kua-synth-v1、runtimeVersion=core-1.2.6/webaudio-1.3.0。历史 default/unbound 实验映射到固定运行时，不改写保存内容。导出包含 setcpm(bpm/beatsPerCycle)，保持版本的时间条件。

**已实现：**编辑、预览 A/B、AI 建议、应用、撤销、重做、保存、恢复、导出；内置播放当前草稿、试听 A/B、停止、音量；Strudel 原生动态图。

**未实现：**录音渲染与音频文件导出。播放通过 StrudelStudioAdapter 接入固定版本包。先以 AST 白名单验证音乐表达式，再使用上游 transpiler/REPL；拒绝构造器、计算属性、宿主浏览器访问、网络、导入及任意 JavaScript 语句。播放前验证速度、运行时、音源与事件密度。只在用户点击时启动音频，停止会断开旧音轨和效果尾音，离开 Studio 会关闭音频上下文。原生视图使用上游 draw/webaudio 代码，音源为本项目合成的鼓音与内置振荡器。

AGPL 决策已经落实。构建包含 LICENSE、NOTICE、THIRD_PARTY_NOTICES.md、BUNDLED_LICENSES.txt，界面显示真实上游版权与运行版本对应源码入口。许可与本机播放验收见 [运行时验收记录](STRUDEL_RUNTIME_ACCEPTANCE_2026-10-02.md)。

## 验收范围

自动回归验证 Schema、悬空证据、错误主题/版本、不可读取片段、身份降级、通用教学入口、累计资料、分析不覆盖、Studio provenance、速度恢复、本机授权、并发任务、取消和 CLI 输出/超时。DOM 交互回归已覆盖深挖、保存后重新挂载恢复、速度与来源标签撤销、修改预览过期和 AI 建议不覆盖新草稿。

2026-10-02 已在 Mac 的 Chrome 完成真实分析、两轮深挖和一轮连续实验复验，保存、服务重启与刷新恢复、桌面及 390 像素窄屏验收。来源与当前已保存实验由服务端传给后续研究，客户端不能覆盖这份上下文。样例的具体发行/母带仍未核实，保留身份降级与通用教学标记。详情见 [本机验收记录](LOCAL_ACCEPTANCE_2026-10-02.md)。内置 Strudel 播放的后续接入与验收见运行时验收记录。
