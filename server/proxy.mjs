import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import agnesHandler from "../api/agnes/chat.js";
import musicSearchHandler from "../api/music/search.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PROXY_PORT || process.env.PORT || 8787);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.AGNES_API_KEY) });
});

app.all("/api/agnes/chat", agnesHandler);
app.all("/api/music/search", musicSearchHandler);

app.listen(PORT, () => {
  console.log("[proxy] Music and AgnesAI API listening on http://127.0.0.1:" + PORT);
});
