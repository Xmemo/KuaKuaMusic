import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";

function required(value, label) {
  const result = String(value || "").trim();
  if (!result) {
    throw new AppError(label + " 未配置。", "V2_PROVIDER_CONFIG_MISSING", 503);
  }
  return result;
}

function extractTextContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof item?.text === "string"
            ? item.text
            : "",
      )
      .join("")
      .trim();
  }
  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(
      "Qwen Listen 返回的内容不是有效 JSON。",
      "V2_LISTEN_INVALID_JSON",
      502,
    );
  }
}

function mimeFor(file) {
  const ext = path.extname(file).toLocaleLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a" || ext === ".aac") return "audio/mp4";
  return "audio/mpeg";
}

function formatFor(file) {
  const ext = path.extname(file).replace(".", "").toLocaleLowerCase();
  return ["wav", "mp3", "aac"].includes(ext) ? ext : "mp3";
}

function listenPrompt(song, correction = "") {
  return [
    "You are the Listen Pass for MusicLearning2026.",
    "Listen to the supplied recording independently. Do not use web search, reviews, biographies, release history, or remembered external facts.",
    "Return JSON only. This is an observation document, not a review.",
    "Describe only what can reasonably be heard in this audio. Timestamps are seconds from the beginning.",
    "Do not pretend to have an exact score or transcription. BPM, key and meter belong only in estimatedParameters and must include confidence.",
    "Do not explain why listeners feel an emotion; save causal interpretation for a later Critic pass.",
    "If a dimension is uncertain, omit observations in that dimension and add an uncertainty.",
    "Required JSON keys:",
    "globalProfile {styleTags[], moodTags[], overallCharacter, confidence};",
    "timeline {durationSec, sections[]}; each section has id,startSec,endSec,label,description,confidence;",
    "observations[]; each has id,category,statement,startSec,endSec,tags[],confidence,precision;",
    "notableMoments[]; each has id,startSec,endSec,salience,title,observationIds[];",
    "estimatedParameters {bpm:{value,confidence},key:{value,confidence},meter:{value,confidence}};",
    "uncertainties[]; each has topic,text.",
    "Allowed observation categories: rhythm,harmony,melody,timbre,arrangement,structure,production,energy.",
    "Allowed precision: global,section,time_localized.",
    "Allowed section labels: intro_like,verse_like,chorus_like,build,transition,break,climax,outro_like,other,unknown.",
    "Song label supplied by the catalog (only for orientation, not as evidence): " +
      JSON.stringify({
        title: song.title,
        artist: song.artist,
        album: song.album,
      }),
    correction,
  ]
    .filter(Boolean)
    .join("\n");
}

export function createDashScopeAudioProvider({
  env = process.env,
  fetcher = fetch,
} = {}) {
  const apiKey = () => required(env.DASHSCOPE_API_KEY, "DASHSCOPE_API_KEY");
  const baseUrl = String(
    env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  ).replace(/\/$/u, "");
  const uploadUrl =
    env.DASHSCOPE_UPLOAD_URL ||
    "https://dashscope.aliyuncs.com/api/v1/uploads";

  async function uploadTemporary(audioPath, model, signal) {
    const policyEndpoint = new URL(uploadUrl);
    policyEndpoint.searchParams.set("action", "getPolicy");
    policyEndpoint.searchParams.set("model", model);
    const policyResponse = await fetcher(policyEndpoint, {
      method: "GET",
      signal,
      headers: {
        Authorization: "Bearer " + apiKey(),
        "Content-Type": "application/json",
      },
    });
    const policyPayload = await policyResponse.json().catch(() => null);
    if (!policyResponse.ok || !policyPayload?.data) {
      throw new AppError(
        "DashScope 临时音频上传凭据获取失败。",
        "V2_DASHSCOPE_UPLOAD_POLICY_FAILED",
        502,
      );
    }

    const policy = policyPayload.data;
    const buffer = await fs.readFile(audioPath);
    const maxBytes = Number(policy.max_file_size_mb || 0) * 1024 * 1024;
    if (maxBytes > 0 && buffer.byteLength > maxBytes) {
      throw new AppError(
        "分析音频超过 DashScope 当前临时上传限制。",
        "V2_AUDIO_TOO_LARGE",
        413,
      );
    }

    const filename = path.basename(audioPath);
    const key = String(policy.upload_dir).replace(/\/$/u, "") + "/" + filename;
    const form = new FormData();
    form.append("OSSAccessKeyId", policy.oss_access_key_id);
    form.append("Signature", policy.signature);
    form.append("policy", policy.policy);
    form.append("x-oss-object-acl", policy.x_oss_object_acl);
    form.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
    form.append("key", key);
    form.append("success_action_status", "200");
    form.append(
      "file",
      new Blob([buffer], { type: mimeFor(audioPath) }),
      filename,
    );

    const uploadResponse = await fetcher(policy.upload_host, {
      method: "POST",
      signal,
      body: form,
    });
    if (!uploadResponse.ok) {
      throw new AppError(
        "DashScope 临时音频上传失败。",
        "V2_DASHSCOPE_UPLOAD_FAILED",
        502,
      );
    }
    return "oss://" + key;
  }

  async function requestObservation({
    audioUrl,
    audioPath,
    model,
    song,
    correction,
    signal,
  }) {
    const response = await fetcher(baseUrl + "/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: "Bearer " + apiKey(),
        "Content-Type": "application/json",
        "X-DashScope-OssResourceResolve": "enable",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: audioUrl,
                  format: formatFor(audioPath),
                },
              },
              { type: "text", text: listenPrompt(song, correction) },
            ],
          },
        ],
        modalities: ["text"],
        response_format: { type: "json_object" },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AppError(
        "Qwen Listen 调用失败。" +
          (payload?.error?.message ? " " + payload.error.message : ""),
        "V2_DASHSCOPE_LISTEN_FAILED",
        502,
      );
    }
    const text = extractTextContent(payload);
    if (!text) {
      throw new AppError(
        "Qwen Listen 没有返回文本结果。",
        "V2_DASHSCOPE_EMPTY_RESPONSE",
        502,
      );
    }
    return parseJson(text);
  }

  async function listen({
    audioPath,
    song,
    mediaRevisionId,
    model,
    signal,
  }) {
    const audioUrl = await uploadTemporary(audioPath, model, signal);
    let raw = await requestObservation({
      audioUrl,
      audioPath,
      model,
      song,
      signal,
    });

    const build = (value) => ({
      schemaVersion: "2.0",
      listenRunId: crypto.randomUUID(),
      songId: song.songId,
      mediaRevisionId,
      createdAt: new Date().toISOString(),
      provider: {
        name: "dashscope",
        model,
        promptVersion: "listen-v2.0.0",
      },
      globalProfile: value.globalProfile,
      timeline: value.timeline,
      observations: value.observations,
      notableMoments: value.notableMoments,
      estimatedParameters: value.estimatedParameters,
      uncertainties: value.uncertainties,
    });

    try {
      return validateContract("v2-music-observation", build(raw));
    } catch (error) {
      raw = await requestObservation({
        audioUrl,
        audioPath,
        model,
        song,
        signal,
        correction:
          "Your previous JSON failed the required contract. Return the complete JSON object again with every required key and no extra prose.",
      });
      return validateContract("v2-music-observation", build(raw));
    }
  }

  return Object.freeze({ listen, uploadTemporary });
}
