import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import agnesHandler from "../api/agnes/chat.js";
import musicSearchHandler from "../api/music/search.js";
import { checkCodexAvailable } from "./codexBridge.mjs";
import { analyzeSongWithAgent, deepDiveWithAgent } from "./musicLearningAgent.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PROXY_PORT || process.env.PORT || 8787);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "512kb" }));

app.get("/health", async (_req, res) => {
  const codex = await checkCodexAvailable();
  res.json({
    ok: true,
    legacyAgnesConfigured: Boolean(process.env.AGNES_API_KEY),
    codexAvailable: codex.available,
    codexVersion: codex.version,
  });
});

app.get("/api/agent/health", async (_req, res) => {
  const codex = await checkCodexAvailable();
  res.status(codex.available ? 200 : 503).json({
    ok: codex.available,
    codexAvailable: codex.available,
    codexVersion: codex.version,
    musicBrainzConfigured: true,
  });
});

app.post("/api/agent/analyze", async (req, res) => {
  try {
    const analysis = await analyzeSongWithAgent(req.body);
    res.status(200).json(analysis);
  } catch (error) {
    console.error("[music-learning/analyze]", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "MusicLearning analysis failed.",
      code: "MUSIC_LEARNING_ANALYSIS_FAILED",
    });
  }
});

app.post("/api/agent/deep-dive", async (req, res) => {
  try {
    const deepDive = await deepDiveWithAgent(req.body);
    res.status(200).json(deepDive);
  } catch (error) {
    console.error("[music-learning/deep-dive]", error);
    res.status(502).json({
      error: error instanceof Error ? error.message : "MusicLearning deep dive failed.",
      code: "MUSIC_LEARNING_DEEP_DIVE_FAILED",
    });
  }
});

// Transitional compatibility paths. The frozen MusicLearning2026 architecture
// uses /api/agent/*; Agnes remains only until the current UI is migrated.
app.all("/api/agnes/chat", agnesHandler);
app.all("/api/music/search", musicSearchHandler);

app.listen(PORT, () => {
  console.log("[proxy] KuaKuaMusic local API listening on http://127.0.0.1:" + PORT);
});
