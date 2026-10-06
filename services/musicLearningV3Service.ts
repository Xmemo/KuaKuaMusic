import type { SongMetadata } from "../types";
import type { ScoredAudioSourceCandidate } from "../music-learning/v2/types";
import type { V3AnalysisArtifact } from "../music-learning/v3/types";

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

export interface V3Progress {
  stage: string;
  label: string;
}

export interface V3StudioResult {
  sourceType: "learning_reconstruction";
  analysisId: string;
  sourceInterpretationIds: string[];
  code: string;
  alternativeCode: string;
  visualHints: Array<
    "pianoroll" | "punchcard" | "spiral" | "scope" | "spectrum" | "pitchwheel"
  >;
  playback: {
    bpm: number;
    beatsPerCycle: number;
    soundBank: string;
    runtimeVersion: string;
  };
  experiment: {
    question: string;
    variable: string;
    baseline: string;
    changed: string;
    constants: string[];
    listenFor: string[];
    limitation: string;
  };
}

export type V3AnalyzeResponse =
  | {
      status: "confirmation_required";
      reused: false;
      songId: string;
      song: SongMetadata & { songId: string };
      reason?: string;
      candidates: ScoredAudioSourceCandidate[];
    }
  | {
      status: "complete";
      songId: string;
      materialization: {
        reused: boolean;
        mediaRevisionId: string;
      };
      analysis: V3AnalysisArtifact;
      studio: V3StudioResult | null;
    };

async function request(
  body: unknown,
  signal?: AbortSignal,
  onProgress?: (value: V3Progress) => void,
  retry = true,
): Promise<V3AnalyzeResponse> {
  const token = await getSession();
  const response = await fetch(BASE + "/api/agent/v3/analyze", {
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
    return request(body, signal, onProgress, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error || "v3 单 Agent 分析服务暂不可用。",
    );
  }

  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return (await response.json()) as V3AnalyzeResponse;

  if (!response.body) throw new Error("v3 分析进度连接不可用。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = frame.match(/^data:\s*(.+)$/m)?.[1];
      if (event && data) {
        const payload = JSON.parse(data);
        if (event === "progress") onProgress?.(payload);
        else if (event === "error")
          throw new Error(payload.error || "v3 分析未能完成。");
        else if (event === "result") return payload as V3AnalyzeResponse;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  throw new Error("v3 分析连接中断。");
}

export function analyzeSongV3(
  song: SongMetadata,
  options: {
    selectedSourceId?: string | null;
    forceRematch?: boolean;
  } = {},
  signal?: AbortSignal,
  onProgress?: (value: V3Progress) => void,
) {
  return request(
    {
      song,
      selectedSourceId: options.selectedSourceId || null,
      forceRematch: Boolean(options.forceRematch),
    },
    signal,
    onProgress,
  );
}
