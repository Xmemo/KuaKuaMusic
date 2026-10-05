import type { SongMetadata } from "../types";
import type { EvidenceSource } from "../music-learning/types";
import type {
  CanonicalSong,
  CreativeBlueprint,
  MusicObservationDocument,
  ResearchArtifact,
  ScoredAudioSourceCandidate,
  V2CriticAnalysis,
  V2PipelineStage,
  V2StudioSeed,
} from "../music-learning/v2/types";

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
        return payload.token as string;
      })
      .catch((error) => {
        session = null;
        throw error;
      });
  return session;
}

export interface V2Progress {
  stage: V2PipelineStage;
  label: string;
}

export interface V2StrudelPlan {
  eligible: boolean;
  sourceType: "learning_reconstruction";
  blueprintId: string | null;
  sourceObservationIds: string[];
  sourceInterpretationIds: string[];
  variables: Array<{
    id: string;
    type: string;
    baseline: string;
    variation: string;
    sourceObservationIds: string[];
    operations: string[];
    visualHints: string[];
  }>;
  visualHints: string[];
  reason: string;
}

export interface V2CreativeResult {
  blueprint: CreativeBlueprint;
  strudelPlan: V2StrudelPlan;
  studioSeed: V2StudioSeed | null;
}

export interface V2PipelineWarning {
  stage: string;
  code: string;
  message: string;
}

export type V2AnalyzeResponse =
  | {
      status: "confirmation_required";
      reused: false;
      songId: string;
      song: CanonicalSong;
      candidates: ScoredAudioSourceCandidate[];
    }
  | {
      status: "complete" | "partial";
      songId: string;
      materialization: {
        reused: boolean;
        mediaRevisionId: string;
      };
      observation: MusicObservationDocument | null;
      research: ResearchArtifact | null;
      sources: EvidenceSource[];
      analysis: V2CriticAnalysis;
      creative: V2CreativeResult | null;
      warnings: V2PipelineWarning[];
    };

async function requestV2WithProgress(
  body: unknown,
  signal?: AbortSignal,
  onProgress?: (progress: V2Progress) => void,
  retry = true,
): Promise<V2AnalyzeResponse> {
  const token = await getSession();
  const response = await fetch(BASE + "/api/agent/v2/analyze", {
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
    return requestV2WithProgress(body, signal, onProgress, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error || "v2 本机分析服务暂不可用，请检查运行配置。",
    );
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const payload = await response.json().catch(() => null);
    if (!payload) throw new Error("v2 服务返回了空数据。");
    return payload as V2AnalyzeResponse;
  }
  if (!response.body) throw new Error("v2 分析进度连接不可用。");

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
        if (event === "progress") onProgress?.(payload as V2Progress);
        else if (event === "error")
          throw new Error(payload.error || "v2 分析未能完成。");
        else if (event === "result") return payload as V2AnalyzeResponse;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  throw new Error("v2 分析连接中断，未收到完整结果。");
}

export function analyzeSongV2(
  song: SongMetadata,
  {
    selectedSourceId = null,
    forceRematch = false,
    forceListen = false,
    forceResearch = false,
  }: {
    selectedSourceId?: string | null;
    forceRematch?: boolean;
    forceListen?: boolean;
    forceResearch?: boolean;
  } = {},
  signal?: AbortSignal,
  onProgress?: (progress: V2Progress) => void,
) {
  return requestV2WithProgress(
    {
      song,
      selectedSourceId,
      forceRematch,
      forceListen,
      forceResearch,
    },
    signal,
    onProgress,
  );
}
