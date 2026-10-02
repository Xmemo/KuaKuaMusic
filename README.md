# 夸夸音乐 / MusicLearning2026

**输入歌曲 → 有依据的结构化分析 → 选择一个分析点深入了解 → Strudel Studio 实验。**

产品基线仍是 [PRD v0.3 冻结版](docs/MUSICLEARNING2026_PRD_V0.3_FROZEN.md)。本轮实现和验收范围见 [技术架构 v1.1](docs/TECHNICAL_ARCHITECTURE_V1.1.md)。

默认页面已使用新架构：动态分析模块、具体问题深挖、来源片段、研究历史、Studio A/B 修改预览和保存。走心 / 上头 / 懂行只用于整首歌总体观感。

## 本机运行

需要 **Node.js 22+**，以及已经安装并登录的 Codex CLI。

```bash
npm ci
cp .env.example .env.local
codex --version
codex login status
npm run dev
```

打开 `http://127.0.0.1:3000`。前端和 API 仅绑定本机回环地址。Bridge 忽略用户级配置，保留本机登录凭据，并通过每次 `codex exec` 的配置参数显式启用网页研究和公开 MusicBrainz MCP（`server/researchConfig.mjs`）。应用启动无需修改本机的项目信任设置。`.codex/config.toml` 仍可用于交互式 Codex 会话。

来源读取会校验并固定公开 IP。若本机代理返回 `198.18/15` 的合成 DNS 地址，读取器通过固定 Cloudflare DNS-over-HTTPS 服务查询真实公开 IPv4，再执行相同的地址校验和连接固定；其他私网、保留地址以及不安全跳转仍拒绝读取。

网页研究、资料读取和逐条审核可能需要数分钟，可取消。资料少时不会硬填歌曲事实；可以继续提出具体问题，使用明确标注的通用理论与教学实验。

## 当前可用范围

- 服务端读取公开 HTML / JSON / 纯文本，登记在原文中找到的片段和内容哈希；不可读取的资料保留为未知。
- 身份、判断和观感进行 Agent 内部审核；结构、来源归属、引用存在性、主题范围和版本一致性由服务端校验。
- 每次分析得到独立 `analysisId`。深挖追加历史，来源累计合并，Studio 保存代码、速度、循环拍数与来源类型。
- 搜索列表可逐页展开全部返回候选。当前最多返回 180 个可访问的平台/iTunes 候选，不能保证覆盖整个乐队曲库或全部同名歌曲。
- Studio 支持 A/B 预览、手动编辑、AI 建议、应用、撤销、重做、保存与 Strudel 代码导出。
- **内置播放和动态 Strudel visual feedback 尚未接入**：遵循项目的许可决策门槛，未安装 `@strudel/*`。可将导出代码粘贴至 [Strudel 编辑器](https://strudel.cc/) 试听；导出会带上当前版本的速度设置。

具体许可建议、发布变更与权利人待确认项见 [Strudel 许可决策](docs/STRUDEL_LICENSE_DECISION.md)。

“片段在资料中存在”不等于“判断必然正确”。语义审核由模型执行，可能误判；来源、片段、审核记录与未知部分一起保存，便于复查。V1 没有音频输入，不声称已听取或测量原曲。

## 本机 API

先 `GET /api/agent/session` 获取当前服务的会话 token；后续 `/api/agent/*` 请求携带 `X-Music-Learning-Token`。接口拒绝外部 Origin 和不匹配的 Host。

| 接口 | 用途 |
| --- | --- |
| `GET /api/agent/health` | CLI、登录、项目配置及 MCP 初始化/工具列表检查 |
| `POST /api/agent/analyze` | `{song, userPerception?}` → 保存后的分析 |
| `POST /api/agent/deep-dive` | `{analysisId, analysisItemId, question?}` → 保存后的深挖 |
| `GET /api/agent/analyses` | 研究历史 |
| `GET /api/agent/analyses/:analysisId` | 完整 Evidence Package |
| `POST /api/agent/analyses/:analysisId/deep-dives/:deepDiveId/studio` | `{session}` → 保存实验 |
| `POST /api/agent/studio/propose` | `{analysisId, deepDiveId, sessionId, baseRevisionId, question}` → 建议，不自动应用 |

深挖不接受客户端提交的完整分析对象。没有模块时，使用 `analysisItemId: "question"` 并填写具体问题。

## 保存与验证

默认记录位置为 `.music-learning/evidence/<analysisId>/package.json`，不提交 Git。`MUSIC_LEARNING_PERSIST=0` 使用临时内存保存；页面会提示重启后丢失。可用 `MUSIC_LEARNING_EVIDENCE_DIR` 指定位置。旧版按歌曲键保存的文件仍保留，本轮没有自动迁移或删除；新历史列表只读取 v1.1 的 UUID 记录。

```bash
npm run schemas:generate  # 修改 contracts.mjs 后更新生成的 Schema
npm run verify            # TypeScript、Node 回归测试、生产构建
```

测试使用明确标注的合成案例，验证结构、证据边界、不可覆盖的分析快照、累计来源、并发写入、回环保护、取消、CLI 超时和 Studio 版本恢复。它们不替代用户 Mac 上真实 Codex + MusicBrainz + 网页研究的验收。

## 兼容与部署

歌曲搜索仍由 `/api/music/search` 提供。旧 UI 和 Agnes 本机 API 默认关闭；确有兼容需求时分别设置 `VITE_ENABLE_LEGACY_UI=1`、`MUSIC_LEARNING_ENABLE_LEGACY=1`，再访问 `/?legacy=1`。

新架构使用本机 Codex 和本地记录。Vercel 可验证前端构建和部署，不能代替本机 Agent 运行环境。公开部署的访问者会看到本机服务连接提示；本轮不把本机接口暴露到公网。
