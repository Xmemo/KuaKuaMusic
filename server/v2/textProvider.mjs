import { AppError } from "../errors.mjs";
import { getContract, validateContract } from "../schemaValidation.mjs";
import { providerSignal, readProviderText } from "./providerTransport.mjs";
import {
  runCodexStructured,
  schemaPath,
} from "../codexBridge.mjs";

function required(value, label) {
  const result = String(value || "").trim();
  if (!result) {
    throw new AppError(
      label + " 未配置。",
      "V2_PROVIDER_CONFIG_MISSING",
      503,
    );
  }
  return result;
}

function parseJson(text, provider) {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(
      provider + " 没有返回有效 JSON。",
      "V2_PROVIDER_INVALID_JSON",
      502,
    );
  }
}

async function openAiCompatibleJson({
  baseUrl,
  apiKey,
  model,
  prompt,
  schemaName,
  provider,
  fetcher,
  signal,
  extraHeaders = {},
  correction = "",
}) {
  const stream = provider === "DashScope";
  const schemaPrompt = prompt + "\n\nReturn a JSON object matching this complete JSON Schema. All required fields and enum values are mandatory:\n" +
    JSON.stringify(getContract(schemaName)) + (correction ? "\n\n" + correction : "");
  const response = await fetcher(
    String(baseUrl).replace(/\/$/u, "") + "/chat/completions",
    {
      method: "POST",
      signal: providerSignal(signal),
      headers: {
        Authorization: "Bearer " + required(apiKey, provider + " API Key"),
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Return one complete JSON object only. Do not use Markdown fences.",
          },
          { role: "user", content: schemaPrompt },
        ],
        response_format: { type: "json_object" },
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        ...(/omni/iu.test(model) ? { modalities: ["text"] } : {}),
      }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new AppError(
      provider +
        " 文本模型调用失败。" +
        (payload?.error?.message ? " " + payload.error.message : ""),
      "V2_PROVIDER_FAILED",
      502,
    );
  }
  const text = await readProviderText(response);
  if (!text) {
    throw new AppError(
      provider + " 没有返回文本结果。",
      "V2_PROVIDER_EMPTY_RESPONSE",
      502,
    );
  }
  try {
    return validateContract(schemaName, parseJson(text, provider));
  } catch (error) {
    if (signal?.aborted || correction || !["INVALID_CONTRACT", "V2_PROVIDER_INVALID_JSON"].includes(error.code)) throw error;
    return openAiCompatibleJson({ baseUrl, apiKey, model, prompt, schemaName, provider, fetcher, signal, extraHeaders,
      correction: "Repair the previous response. Validation error: " + error.message +
        "\nPrevious response (possibly truncated):\n" + text.slice(0, 16000) + "\nReturn the complete corrected JSON object." });
  }
}

export function createStructuredTextProvider(
  selection,
  {
    env = process.env,
    fetcher = fetch,
    codexRunner = runCodexStructured,
  } = {},
) {
  if (!selection?.provider || !selection?.model) {
    throw new AppError(
      "文本 Provider 选择无效。",
      "V2_PROVIDER_CONFIG_MISSING",
      503,
    );
  }

  async function generateJson({ schemaName, prompt, signal }) {
    if (!schemaName || !prompt?.trim()) {
      throw new AppError(
        "结构化文本请求缺少 schema 或 prompt。",
        "V2_INVALID_REQUEST",
        400,
      );
    }

    if (selection.provider === "codex-cli") {
      const value = await codexRunner({
        prompt,
        outputSchema: schemaPath("schemas/" + schemaName + ".schema.json"),
        signal,
        model: selection.model,
        researchEnabled: false,
      });
      return validateContract(schemaName, value);
    }

    if (selection.provider === "dashscope") {
      return openAiCompatibleJson({
        baseUrl:
          env.DASHSCOPE_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: env.DASHSCOPE_API_KEY,
        model: selection.model,
        prompt,
        schemaName,
        provider: "DashScope",
        fetcher,
        signal,
      });
    }

    if (selection.provider === "siliconflow") {
      return openAiCompatibleJson({
        baseUrl:
          env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
        apiKey: env.SILICONFLOW_API_KEY,
        model: selection.model,
        prompt,
        schemaName,
        provider: "SiliconFlow",
        fetcher,
        signal,
      });
    }

    throw new AppError(
      "文本 Provider '" + selection.provider + "' 尚未实现 adapter。",
      "V2_PROVIDER_NOT_IMPLEMENTED",
      501,
    );
  }

  return Object.freeze({
    selection,
    generateJson,
  });
}
