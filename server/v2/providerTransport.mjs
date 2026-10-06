import { AppError } from "../errors.mjs";

const contentText = (content) => typeof content === "string" ? content :
  Array.isArray(content) ? content.map((item) => typeof item === "string" ? item : item?.text || "").join("") : "";

export function providerSignal(signal, timeoutMs = 300000) {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

export async function readProviderText(response) {
  if (!response.body?.getReader || response.headers?.get("content-type")?.includes("application/json")) {
    const payload = await response.json();
    if (payload?.error) throw new AppError("模型返回了错误响应。", "V2_PROVIDER_FAILED", 502);
    return contentText(payload?.choices?.[0]?.message?.content).trim();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", bytes = 0, ended = false;
  const consume = (line) => {
    if (!line.trim().startsWith("data:")) return;
    const data = line.trim().slice(5).trim();
    if (!data) return;
    if (data === "[DONE]") { ended = true; return; }
    let payload;
    try { payload = JSON.parse(data); } catch {
      throw new AppError("模型返回了损坏的流式数据。", "V2_PROVIDER_INVALID_STREAM", 502);
    }
    if (payload.error) throw new AppError("模型流式调用失败。", "V2_PROVIDER_FAILED", 502);
    if (payload?.choices?.[0]?.finish_reason === "length")
      throw new AppError("模型输出被截断，请缩短请求后重试。", "V2_PROVIDER_TRUNCATED", 502);
    text += contentText(payload?.choices?.[0]?.delta?.content);
  };
  try {
    while (!ended) {
      const { value, done } = await reader.read();
      bytes += value?.byteLength || 0;
      if (bytes > 4 * 1024 * 1024) throw new AppError("模型响应超过大小限制。", "V2_PROVIDER_OUTPUT_LIMIT", 502);
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() || "";
      for (const line of lines) consume(line);
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
    return text.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
