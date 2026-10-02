# Mac 本机验收记录

日期：2026-10-02。起始代码为 PR #3 的 `7f374987ada5c54bdda0ea0bcd7ac2aa297a08e4`；冻结 PRD 未改。

## 已修复

1. 健康检查使用了当前 CLI 不支持的 `codex --ignore-user-config mcp list`。改为检查受支持的 exec 参数，并通过每次研究进程的配置参数显式添加公开 MusicBrainz MCP。没有更改用户的持久信任设置。
2. 本机代理 DNS 返回 `198.18.*` 合成地址，导致网页证据读取被拒绝。仅在域名全部解析到 `198.18/15` 时，通过固定 Cloudflare DoH 服务查询真实公开地址，验证后固定连接地址。私网、混合私网答案、保留 IP 字面量仍拒绝。
3. 后端返回 180 个候选，页面只显示前 24 个。增加逐页展开、候选总数和曲库覆盖范围说明。
4. 后续研究没有收到已登记来源，也没有上一轮已保存的实验。增加服务端来源快照、最近两轮相同分析点的研究、当前已保存代码与速度；后续实验以保存版本为基线。
5. 更新现有依赖约束内的修复版本，审计从 11 项降到 0 项；未升级主版本或安装 Strudel runtime。

## 自动验证

- 使用 Node.js 24.19.0、npm 10.8.2；项目要求 Node.js 22+。
- `npm ci` 成功，审计 0 项。
- `npm run verify` 成功：类型检查、29 项回归测试、Vite 6.4.3 生产构建。
- 新回归覆盖显式 MCP 配置、CLI 健康检查、代理 DNS 回退的地址边界、搜索列表展开、来源复用、保存实验上下文与客户端伪造上下文的隔离。
- `git diff --check` 成功。

## 真实 Mac / Chrome 验证

本机前端 `http://127.0.0.1:3000`，API 绑定 `127.0.0.1:8787`。使用 xin 的 Chrome 页面操作并在页面确认结果。

| 检查 | 实际结果 |
| --- | --- |
| CLI / 登录 / MCP | health.ok=true；CLI 0.159.2；真实 `musicbrainz_get_recording` 调用完成，返回 Bohemian Rhapsody — Queen |
| 联合搜索 | `Bohemian Rhapsody + Queen` 返回 180 候选；展开后由 24 增至 48 个 |
| 分析 | 一次真实分析完成；独立 analysisId 为 `184d9316-ec3b-4e9c-a2f1-8dc0ac10f22e` |
| 资料 | 分析登记两份网页资料；第一轮深挖增加一本教材片段；后续累计三份，原 sourceIds 保留 |
| 深挖 | 两轮深入研究完成；另做一轮已保存实验连续性复验；三个独立 deepDiveId 全部保留 |
| Studio 保存 | 三个实验分别保存 102、110、110 BPM；A/B 应用和手动速度修改保留版本历史 |
| 刷新与重启 | 重启服务后刷新 Chrome、从研究历史恢复：代码、B 版本、速度与循环拍数正确 |
| 连续性 | 第三轮 seed 的 A 代码与第二轮当前已保存 B 代码逐字相同，保持 110 BPM 与 bd/sd/hh，只移动 hh 起音 |
| 不覆盖 | 分析及首轮深挖序列化 SHA-256 与后续操作前一致 |
| 窄屏 | 390×844 Chrome viewport；文档宽 384，无横向溢出；代码编辑、速度、保存操作可见 |

保存的研究位于本机 `.music-learning/evidence/<analysisId>/package.json`，未提交 Git。会话 token 和登录凭据未写入验收材料。

读取的资料：

- [KEF: Deconstructing Bohemian Rhapsody](https://us.kef.com/blogs/news/deconstructing-bohemian-rhapsody)
- [Brian May 访谈转载](https://brianmay.com/brian-news/2015/10/brian-may-on-40-years-of-bohemian-rhapsody-i-still-listen-to-it-in-the-car/)
- [Macalester: Texture](https://pressbooks.macalester.digital/multimodalmusicianship/chapter/texture/)

## 验收边界

该样例没有确认 Apple Music 条目的具体发行/混音/母带，身份保持 unresolved；未把通用实验当成原曲转录。V1 没有授权音频输入，未声称试听或测量原曲。

网易云 / QQ 分享文字提取、平台候选保留、短链安全边界通过合成回归测试；本轮未对用户实际分享链接做在线验收。当前曲库最多 180 个返回候选，不能保证全部作品或全部同名歌曲。

这是本机 Codex 后台验收。Vercel 构建检查不代表公开部署拥有本机研究进程；本轮没有合并 main 或发布 Production。

Strudel 内置播放、动态可视化和音源/代码执行未验收。AGENTS.md 要求先确定许可；[AGPL 发布方案](STRUDEL_LICENSE_DECISION.md) 已准备，等待权利人选择整套应用采用兼容许可，或继续使用独立官方编辑器。
