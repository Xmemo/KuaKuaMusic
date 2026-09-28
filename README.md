# 夸夸音乐 / MusicLearning2026

当前产品方向已经冻结为：

> **输入歌曲 → 有依据的结构化分析 → 选择一个分析点深入了解 → Strudel Studio 动手实验**

完整产品定义见：

- `docs/MUSICLEARNING2026_PRD_V0.3_FROZEN.md`
- `docs/TECHNICAL_ARCHITECTURE_V1.md`

## 核心原则

- 用户第一次看到的正式歌曲分析就必须已经经过资料核验。
- 没有歌曲专属依据的判断，不为了填满模块而硬写。
- 走心 / 上头 / 懂行只用于**整首歌总体观感**；结构化模块统一使用证据化表达。
- 产品只有一个 AI Agent。搜索、MusicBrainz MCP、网页研究、核验和解释都是它的内部工具调用。
- Studio 已从 MIDI/piano-roll-first 改为 **Strudel-first**：代码是主要实验对象，视觉提示优先复用 Strudel 原生 visual feedback。
- source_transcription、learning_reconstruction、user_version 必须严格区分。

## 当前仓库状态

仓库仍保留旧版夸夸音乐 UI 和 Agnes 调用路径，便于不中断现有页面。

新的 MusicLearning2026 架构已经提供：

- 项目级 Codex 配置；
- MusicBrainz MCP；
- Evidence-first Agent 规则；
- schema-constrained Song Analysis；
- schema-constrained Deep Dive；
- 本地 Evidence Package；
- Strudel Studio adapter / revision contract；
- React 前端 API client；
- Express 本机 Agent endpoints。

UI 会按 Analysis → Deep Dive → Studio 的顺序迁移到新 contract。

## 本地运行

### 1. 前端依赖

需要 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env.local
```

### 2. Codex CLI

MusicLearning2026 的 canonical Agent path 使用本机 Codex CLI。

先确认：

```bash
codex --version
codex login status
```

Codex 只会在受信任项目中加载项目级 `.codex/config.toml`。本仓库已配置 MusicBrainz MCP：

```toml
[mcp_servers.musicbrainz]
url = "https://musicbrainz.caseyjhand.com/mcp"
```

可以用：

```bash
codex mcp list
```

确认 MusicBrainz 已被加载。

### 3. 启动

```bash
npm run dev
```

Vite 会把本地 `/api` 请求代理到端口 8787。

## Canonical local APIs

### Health

```
GET /api/agent/health
```

### Evidence-backed song analysis

```
POST /api/agent/analyze
```

Body:

```json
{
  "song": {
    "title": "Song",
    "artist": "Artist",
    "album": "Album",
    "releaseYear": "2020"
  },
  "userPerception": "副歌为什么突然感觉变宽？"
}
```

The server invokes `codex exec` with `schemas/song-analysis.schema.json`.

### Deep dive

```
POST /api/agent/deep-dive
```

Body contains the current SongAnalysis, the selected `analysisItemId`, and an optional user question.

The server invokes `codex exec` with `schemas/deep-dive.schema.json`.

## Evidence persistence

By default, local results are written under:

```
.music-learning/evidence/
```

This directory is gitignored.

Set `MUSIC_LEARNING_PERSIST=0` to disable persistence, or `MUSIC_LEARNING_EVIDENCE_DIR` to choose another location.

## Song search

The existing catalog search remains a discovery layer:

- input title / artist;
- paste supported public song links;
- show candidates;
- select a candidate before analysis.

The catalog result itself is **not** treated as proof for music-analysis claims. The Agent resolves identity/version again through the evidence workflow.

## Strudel Studio

The Studio contract lives in:

- `studio/README.md`
- `studio/strudelStudio.ts`

The product decision is Strudel-first, but this architecture PR deliberately does **not** add `@strudel/*` to `package.json`.

Reason: current Strudel packages are AGPL-licensed. The repository/distribution licensing decision must be explicit before bundling them. The adapter boundary lets the rest of the product ship independently of that decision.

## Transitional legacy API

These paths remain temporarily because the current UI still uses them:

- `GET /api/music/search?q=...`
- `POST /api/agnes/chat`

They are not the canonical MusicLearning2026 Agent architecture and should be removed after the UI migration.

## Vercel note

The existing Agnes-backed path can still run in the current Vercel-style deployment.

The new `/api/agent/*` path is **local-first** because it requires a local Codex executable, project MCP configuration, and local evidence storage. Do not assume the Vercel runtime provides Codex CLI.
