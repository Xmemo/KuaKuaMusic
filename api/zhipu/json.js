// Vercel Serverless Function for Zhipu AI JSON response
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey || apiKey === "PLACEHOLDER_API_KEY") {
    return res.status(500).json({ error: "Server missing ZHIPU_API_KEY" });
  }

  const { prompt, temperature = 0.5 } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  const ZHIPU_MODEL = process.env.ZHIPU_MODEL || "glm-4.7-flash";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 300s timeout

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
    return res.status(200).json({ text });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Zhipu request timeout"
        : "Proxy request failed";
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
}
