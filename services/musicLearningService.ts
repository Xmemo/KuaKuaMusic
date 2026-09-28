import type { DeepDive, SongAnalysis } from "../music-learning/types";
import type { SongMetadata } from "../types";

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_API_BASE_URL || "";

type ErrorPayload = {
  error?: string;
  code?: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BACKEND_BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接本机 MusicLearning Agent，请确认本地服务和 Codex CLI 正在运行。");
  }

  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error || "MusicLearning Agent 请求失败（HTTP " + response.status + "）。");
  }
  return payload;
}

export async function analyzeSongWithEvidence(
  song: SongMetadata,
  userPerception = "",
): Promise<SongAnalysis> {
  return postJson<SongAnalysis>("/api/agent/analyze", {
    song: {
      title: song.title,
      artist: song.artist,
      album: song.album || null,
      releaseYear: song.releaseYear || null,
      trackUrl: song.trackUrl || null,
      platform: song.platform || null,
    },
    userPerception: userPerception.trim() || null,
  });
}

export async function deepDiveAnalysisItem(
  analysis: SongAnalysis,
  analysisItemId: string,
  question = "",
): Promise<DeepDive> {
  return postJson<DeepDive>("/api/agent/deep-dive", {
    analysis,
    analysisItemId,
    question: question.trim() || null,
  });
}

export async function getMusicLearningAgentHealth(): Promise<{
  ok: boolean;
  codexAvailable: boolean;
  musicBrainzConfigured: boolean;
}> {
  const response = await fetch(BACKEND_BASE_URL + "/api/agent/health");
  if (!response.ok) {
    throw new Error("无法读取 MusicLearning Agent 状态。");
  }
  return response.json();
}
