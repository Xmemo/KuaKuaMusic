import type { SongMetadata } from "../types";
import type { ScoredAudioSourceCandidate } from "../music-learning/v2/types";
import type { V4RunStatus } from "../music-learning/v4/types";

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
          throw new Error("请先启动本机 MusicLearning 服务。");
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

export interface V4Progress {
  stage: string;
  label: string;
}

export type V4PrepareResponse =
  | {
      status: "confirmation_required";
      reused: false;
      songId: string;
      song: SongMetadata & { songId: string };
      reason?: string;
      candidates: ScoredAudioSourceCandidate[];
    }
  | {
      status: "run_ready";
      reused: boolean;
      songId: string;
      song: SongMetadata & { songId: string };
      materialization: {
        mediaRevisionId: string;
        durationSec: number;
      };
      runId: string;
      runDir: string;
      antigravityPrompt: string;
    };

async function postWithSse<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
  onProgress?: (value: V4Progress) => void,
  retry = true,
): Promise<T> {
  const token = await getSession();
  const response = await fetch(BASE + url, {
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
    return postWithSse(url, body, signal, onProgress, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "v4 本机工作流请求失败。");
  }

  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return (await response.json()) as T;

  if (!response.body) throw new Error("v4 进度连接不可用。");
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
          throw new Error(payload.error || "v4 工作流准备失败。");
        else if (event === "result") return payload as T;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  throw new Error("v4 工作流连接中断。");
}

export function prepareV4Run(
  song: SongMetadata,
  options: {
    selectedSourceId?: string | null;
    forceRematch?: boolean;
  } = {},
  signal?: AbortSignal,
  onProgress?: (value: V4Progress) => void,
) {
  return postWithSse<V4PrepareResponse>(
    "/api/agent/v4/prepare",
    {
      song,
      selectedSourceId: options.selectedSourceId || null,
      forceRematch: Boolean(options.forceRematch),
    },
    signal,
    onProgress,
  );
}

export async function getV4RunStatus(
  runId: string,
  signal?: AbortSignal,
  retry = true,
): Promise<V4RunStatus> {
  const token = await getSession();
  const response = await fetch(
    BASE + "/api/agent/v4/runs/" + encodeURIComponent(runId),
    {
      cache: "no-store",
      headers: { "X-Music-Learning-Token": token },
      signal,
    },
  );
  if (response.status === 401 && retry) {
    session = null;
    return getV4RunStatus(runId, signal, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error || "无法读取 v4 分析进度。");
  return payload as V4RunStatus;
}

export async function requestV4Creative(
  runId: string,
  interpretationId: string,
  retry = true,
): Promise<{
  status: "creative_ready";
  runId: string;
  runDir: string;
  interpretationId: string;
  antigravityPrompt: string;
}> {
  const token = await getSession();
  const response = await fetch(
    BASE +
      "/api/agent/v4/runs/" +
      encodeURIComponent(runId) +
      "/creative-request",
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Music-Learning-Token": token,
      },
      body: JSON.stringify({ interpretationId }),
    },
  );
  if (response.status === 401 && retry) {
    session = null;
    return requestV4Creative(runId, interpretationId, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error || "无法准备 Studio 创作任务。");
  return payload;
}
