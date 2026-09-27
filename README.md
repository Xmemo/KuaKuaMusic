# 夸夸音乐

夸夸音乐根据歌曲资料生成走心、上头、懂行三种逐歌分析，并提供文化脉络、和声、节奏、音色四个深入解读板块。分析结果下方可以继续提问。

## 本地运行

需要 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 中设置服务端变量：

```env
AGNES_API_KEY=你的密钥
AGNES_MODEL=agnes-2.5-flash
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
```

启动前端和本地 API：

```bash
npm run dev
```

前端通过同源的 `/api/music/search` 与 `/api/agnes/chat` 访问后端。Vite 会把本地 `/api` 请求代理到端口 8787。

## 搜索行为

- 输入歌名或歌手名，直接搜索歌曲曲库并显示可选结果；搜索不依赖 AI。
- 粘贴公开 Apple Music、Spotify、YouTube、网易云音乐或 QQ 音乐歌曲链接时，服务端先读取歌曲信息，再匹配曲目。
- 曲库检索统一使用 iTunes Search API，不提供地区切换，也不在客户端硬编码地区代码。
- 选择搜索结果后才调用 AI 分析；AI 问答保留当前曲目和分析上下文。

## Vercel 部署

在 Vercel 项目 **Settings → Environment Variables** 中添加：

- `AGNES_API_KEY`：AgnesAI 密钥，仅服务端读取。
- `AGNES_MODEL`：可选，默认 `agnes-2.5-flash`。
- `AGNES_BASE_URL`：可选，默认 `https://apihub.agnes-ai.com/v1`。

将 `AGNES_API_KEY` 应用于 Production、Preview 环境，然后重新部署。不要将真实密钥写入源码、`.env.example` 或提交记录。

## API

- `GET /api/music/search?q=...`：检索曲目元数据。
- `POST /api/agnes/chat`：服务端调用 AgnesAI，支持结构化逐歌分析与歌曲追问。

开发环境也可单独运行 `npm run dev:api`。

