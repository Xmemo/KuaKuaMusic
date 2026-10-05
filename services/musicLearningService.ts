import type { SongMetadata } from "../types";
import type {
  AgentHealth,
  AnalysisHistoryItem,
  EvidencePackage,
  StoredAnalysis,
  StoredDeepDive,
} from "../music-learning/types";
import type { StudioProposal, StudioSession } from "../studio/strudelStudio";
const BASE = (import.meta.env?.VITE_BACKEND_API_BASE_URL || "").replace(
  /\/$/,
  "",
);
let session: Promise<string> | null = null;
async function getSession(): Promise<string> {
  if (!session)
    session = fetch(BASE + "/api/agent/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("请在本机启动 MusicLearning 服务后使用。");
        const payload = await response.json();
        if (!payload.token) throw new Error("本机会话不可用。");
        return payload.token;
      })
      .catch((error) => {
        session = null;
        throw error;
      });
  return session;
}
async function request<T>(
  path: string,
  {
    body,
    signal,
    retry = true,
  }: { body?: unknown; signal?: AbortSignal; retry?: boolean } = {},
): Promise<T> {
  const token = await getSession();
  const response = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Music-Learning-Token": token,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  if (response.status === 401 && retry) {
    session = null;
    return request(path, { body, signal, retry: false });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      payload?.error || "本机研究服务暂不可用，请确认服务已启动。",
    );
  if (!payload) throw new Error("本机服务返回了空数据。");
  return payload as T;
}
export const analyzeSongWithEvidence = (
  song: SongMetadata & { selectedVersion?: string },
  userPerception = "",
  signal?: AbortSignal,
  onProgress?: (progress: AnalysisProgress) => void,
) => analyzeWithProgress({ song, userPerception }, signal, onProgress);
export interface AnalysisProgress {
  operation?: "analysis" | "deep_dive";
  stage: "research" | "draft" | "review" | "supplement" | "compose" | "copy_review" | "complete";
  round: number;
  label: string;
}
async function requestWithProgress<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  onProgress?: (progress: AnalysisProgress) => void,
  retry = true,
): Promise<T> {
  const token = await getSession();
  const response = await fetch(BASE + path, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      "X-Music-Learning-Token": token,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401 && retry) {
    session = null;
    return requestWithProgress(path, body, signal, onProgress, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "本机研究服务暂不可用，请确认服务已启动。");
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const payload = await response.json().catch(() => null);
    if (!payload) throw new Error("本机服务返回了空数据。");
    return payload as T;
  }
  if (!response.body) throw new Error("研究进度连接不可用。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = frame.match(/^data:\s*(.+)$/m)?.[1];
      if (event && data) {
        const payload = JSON.parse(data);
        if (event === "progress") onProgress?.(payload as AnalysisProgress);
        else if (event === "error") throw new Error(payload.error || "研究未能完成。");
        else if (event === "result") return payload as T;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  throw new Error("研究连接中断，未收到完整结果。");
}
async function analyzeWithProgress(
  body: unknown,
  signal?: AbortSignal,
  onProgress?: (progress: AnalysisProgress) => void,
  retry = true,
): Promise<StoredAnalysis> {
  return requestWithProgress<StoredAnalysis>(
    "/api/agent/analyze",
    body,
    signal,
    onProgress,
    retry,
  );
}
export const deepDiveAnalysisItem = (
  analysisId: string,
  analysisItemId: string,
  question = "",
  signal?: AbortSignal,
  onProgress?: (progress: AnalysisProgress) => void,
) =>
  requestWithProgress<StoredDeepDive>(
    "/api/agent/deep-dive",
    { analysisId, analysisItemId, question },
    signal,
    (progress) => onProgress?.({ ...progress, operation: "deep_dive" }),
  );
export const getMusicLearningAgentHealth = () =>
  request<AgentHealth>("/api/agent/health");
export const listSavedAnalyses = () =>
  request<AnalysisHistoryItem[]>("/api/agent/analyses");
export const loadSavedAnalysis = (analysisId: string) =>
  request<EvidencePackage>(
    "/api/agent/analyses/" + encodeURIComponent(analysisId),
  );
export const saveStudioSession = (
  analysisId: string,
  deepDiveId: string,
  value: StudioSession,
) =>
  request<StudioSession>(
    "/api/agent/analyses/" +
      encodeURIComponent(analysisId) +
      "/deep-dives/" +
      encodeURIComponent(deepDiveId) +
      "/studio",
    { body: { session: value } },
  );
export const proposeStudioEdit = (
  analysisId: string,
  deepDiveId: string,
  sessionId: string,
  baseRevisionId: string,
  question: string,
  signal?: AbortSignal,
) =>
  request<StudioProposal>("/api/agent/studio/propose", {
    body: { analysisId, deepDiveId, sessionId, baseRevisionId, question },
    signal,
  });
