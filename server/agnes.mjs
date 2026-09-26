function getAgnesBaseUrl() {
  return (process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1").replace(/\/+$/, "");
}

function getAgnesModel() {
  return process.env.AGNES_MODEL || "agnes-2.5-flash";
}
const requestBuckets = new Map();

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function clientId(req) {
  const forwarded = req.headers && req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function allowRequest(req) {
  const now = Date.now();
  const id = clientId(req);
  const bucket = requestBuckets.get(id);
  if (!bucket || now >= bucket.expiresAt) {
    requestBuckets.set(id, { count: 1, expiresAt: now + 60_000 });
  } else {
    bucket.count += 1;
    if (bucket.count > 20) return false;
  }
  if (requestBuckets.size > 3000) {
    for (const [key, value] of requestBuckets) {
      if (now >= value.expiresAt) requestBuckets.delete(key);
    }
  }
  return true;
}

async function callAgnes({ prompt, jsonMode = false, temperature = 0.7 }) {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw appError(
      "服务器尚未配置 AgnesAI API Key。请在 Vercel 环境变量中添加 AGNES_API_KEY 后重新部署。",
      503,
      "MISSING_AGNES_API_KEY"
    );
  }

  const model = getAgnesModel();
  const baseUrl = getAgnesBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: jsonMode ? 3500 : 1200,
        stream: false,
        messages: [
          {
            role: "system",
            content: jsonMode
              ? "你是谨慎、准确的音乐评论助手。只依据输入信息分析，不要声称实际播放或听过音频。缺少依据时清楚标明推测；不要编造具体调式、和弦、BPM、频段或录音细节。严格只输出用户要求的有效 JSON，不要输出 Markdown。"
              : "你是夸夸音乐里的音乐问答助手。用自然中文回答用户关于曲目或音乐听感的问题，结合已提供的曲目信息和分析。不要声称实际播放或听过音频；缺少可靠依据时说明不确定或推测。回答清楚、具体，不要捏造歌词或制作细节。",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[agnes] provider returned status " + response.status);
      if (response.status === 401 || response.status === 403) {
        throw appError("AgnesAI API Key 无效或当前账号没有访问权限。", 502, "AGNES_AUTH_FAILED");
      }
      if (response.status === 429) {
        throw appError("AgnesAI 请求频率或额度已达上限，请稍后再试。", 429, "AGNES_RATE_LIMITED");
      }
      if (response.status >= 500) {
        throw appError("AgnesAI 暂时不可用，请稍后重试。", 502, "AGNES_UPSTREAM_UNAVAILABLE");
      }
      throw appError("AgnesAI 未接受这次请求（HTTP " + response.status + "）。", 502, "AGNES_REQUEST_REJECTED");
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";
    const text = Array.isArray(content)
      ? content.map((part) => typeof part === "string" ? part : part && part.text ? part.text : "").join("")
      : String(content || "");
    if (!text.trim()) throw appError("AgnesAI 返回了空内容，请重试。", 502, "AGNES_EMPTY_RESPONSE");
    return text;
  } catch (error) {
    if (error && error.statusCode) throw error;
    if (error && error.name === "AbortError") {
      throw appError("歌曲分析等待超时，请稍后重试。", 504, "AGNES_TIMEOUT");
    }
    throw appError("暂时无法连接 AgnesAI，请稍后重试。", 502, "AGNES_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
  }
  if (!allowRequest(req)) {
    return res.status(429).json({ error: "请求太频繁了，请一分钟后再试。", code: "APP_RATE_LIMITED" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prompt = body.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt 不能为空。", code: "INVALID_PROMPT" });
  }
  if (prompt.length > 16_000) {
    return res.status(400).json({ error: "问题内容过长，请缩短后重试。", code: "PROMPT_TOO_LONG" });
  }
  const temperature = Number.isFinite(Number(body.temperature))
    ? Math.min(1, Math.max(0, Number(body.temperature)))
    : 0.7;

  try {
    const text = await callAgnes({
      prompt: prompt.trim(),
      jsonMode: body.jsonMode === true,
      temperature,
    });
    return res.status(200).json({ text, model: getAgnesModel() });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      error: error.message || "AgnesAI 请求失败。",
      code: error.code || "AGNES_REQUEST_FAILED",
    });
  }
}
