import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = Number(process.env.PROXY_PORT || process.env.PORT || 8787);
const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || "glm-4.7-flash";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/zhipu/json", async (req, res) => {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey || apiKey === "PLACEHOLDER_API_KEY") {
    return res.status(500).json({ error: "Server missing ZHIPU_API_KEY" });
  }

  const { prompt, temperature = 0.5 } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }
  if (prompt.length > 12000) {
    return res.status(400).json({ error: "prompt is too long" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ZHIPU_MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a strict JSON generator. Reply with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({
        error: `Zhipu provider error (${response.status})`,
        detail: errorText.slice(0, 500),
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "{}";
    return res.json({ text });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Zhipu request timeout"
        : "Proxy request failed";
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`[proxy] Zhipu proxy listening on http://127.0.0.1:${PORT}`);
});
