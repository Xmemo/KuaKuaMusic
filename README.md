# 夸夸音乐 / MusicLearning2026

**输入歌曲 → 有依据的结构化分析 → 选择一个分析点深入了解 → Strudel Studio 实验。**

产品基线仍是 [PRD v0.3 冻结版](docs/MUSICLEARNING2026_PRD_V0.3_FROZEN.md)。**目标架构已升级为 [Audio-first v2.0](docs/TECHNICAL_ARCHITECTURE_V2.md)**：歌曲将先实体化为本地 Song Package，由可替换的 Audio Provider 独立 Listen，再独立 Research，最后 Critic 综合并生成可映射到 Strudel 的 Creative Blueprint。

> 迁移状态：v2.0 已冻结并开始搭骨架；当前默认 `/api/agent/analyze` 仍运行 v1.2，直到真实音频链路在本机验收通过。v1.2 文档见 [技术架构 v1.2](docs/TECHNICAL_ARCHITECTURE_V1.2.md)，底层服务与保存边界见 [v1.1](docs/TECHNICAL_ARCHITECTURE_V1.1.md)。

## v2.0 目标流水线

```
Search → Materialize → Listen → Research → Critic → Deep Dive
                                              ↓
                                      Creative Blueprint
                                              ↓
                                      Strudel Experiment
```

v2 不把 Qwen、SiliconFlow 或 Codex 写死进业务层。Listen / Research / Critic / Creative 四个角色分别配置 Provider；默认先用 DashScope `qwen3.5-omni-plus`，Research 默认继续使用可登记 URL / excerpt / hash 的 `registered-web`。后续可以只改配置，把部分角色切到 SiliconFlow、Codex CLI 或未来本地模型。

## 本机运行

当前 v1.2 运行需要 **Node.js 22+**，以及已经安装并登录的 Codex CLI。

```bash
npm ci
cp .env.example .env.local
codex --version
codex login status
npm run dev
```

打开 `http://127.0.0.1:3000`。前端和 API 仅绑定本机回环地址。

v2 Provider 配置已加入 `.env.example`，但 `MUSIC_V2_ENABLED=0` 默认关闭；在 audio acquisition、DashScope Listen adapter 和真实 Song Package E2E 完成前，不会替换可工作的 v1.2 路径。

## 当前 v1.2 可用范围

- 支持歌曲搜索、网易云 / QQ / Apple / Spotify / YouTube 链接解析。
- 网页来源读取会登记 URL、正文片段、哈希和检索时间。
- 每次分析得到独立 `analysisId`；Deep Dive 追加历史；Studio 保存修订。
- Studio 支持 A/B 预览、手动编辑、AI 建议、撤销/重做、保存、恢复和 Strudel 播放。
- 当前默认分析仍是 evidence-first 且没有音频输入；这条限制只描述现行 v1.2 runtime，不描述 v2 目标。

## v2 新增的核心合同

代码位于 `music-learning/v2/`：

- `types.ts`：Song Package、MusicObservationDocument、Provider Plan、Creative Blueprint。
- `providerRegistry.mjs`：角色化 Provider 与 capability 校验。
- `sourceMatcher.mjs`：音源候选评分和自动/人工选择阈值。
- `contracts.mjs`：v2 Song Package / Observation / Creative Blueprint JSON Schema 来源。

v2 schemas 会和现有 schemas 一起通过：

```bash
npm run schemas:generate
```

生成。

## Provider 角色

默认配置：

```
Listen    = dashscope / qwen3.5-omni-plus
Research  = dashscope / qwen3.5-omni-plus + registered-web
Critic    = dashscope / qwen3.5-omni-plus
Creative  = dashscope / qwen3.5-omni-plus
```

可以独立切换，例如未来：

```
Listen    = siliconflow / Qwen Omni
Research  = codex-cli / GPT + registered-web
Critic    = codex-cli / GPT
Creative  = cheaper structured-text model
```

Codex CLI 目前在 v2 registry 中声明为 text/research provider，不声明 audio capability，因此不会误被选作 Listen。

## 保存与验证

v1.2 默认记录仍在 `.music-learning/evidence/`。v2 Song Package 目标目录为 `.music-learning/library/`，两者均不提交 Git。

```bash
npm run schemas:generate
npm run verify
```

新增回归覆盖 v2 source matcher 和 provider switching。自动测试不能代替真实音频的本机验收。

## 兼容与部署

歌曲搜索仍由 `/api/music/search` 提供。旧 UI 和 Agnes 本机 API 默认关闭；确有兼容需求时分别设置 `VITE_ENABLE_LEGACY_UI=1`、`MUSIC_LEARNING_ENABLE_LEGACY=1`。

v2 的 Local Song Package 代表音频与 artifact 缓存在本机；如果 Listen Provider 选择 DashScope 或 SiliconFlow，音频仍会发送到对应云端模型。完全本地化将通过替换 AudioUnderstandingProvider 实现，不改变上层 pipeline。
