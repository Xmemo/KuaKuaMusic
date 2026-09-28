import type { StudioSeed, VisualHint } from "../music-learning/types";

export interface StudioValidationResult {
  ok: boolean;
  message?: string;
}

export interface StrudelStudioAdapter {
  getPattern(): string;
  setPattern(code: string): Promise<void>;
  play(): Promise<void>;
  stop(): Promise<void>;
  setTempo(value: number): Promise<void>;
  validate(code: string): Promise<StudioValidationResult>;
}

export type StudioSourceType =
  | "source_transcription"
  | "learning_reconstruction"
  | "user_version";

export interface StudioRevision {
  id: string;
  code: string;
  label: string;
  createdAt: string;
}

export interface StudioSession {
  id: string;
  analysisItemId: string;
  sourceType: StudioSourceType;
  sourceIds: string[];
  explanation: string;
  visualHints: VisualHint[];
  revisions: StudioRevision[];
  revisionIndex: number;
}

function makeId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return prefix + "-" + randomPart;
}

export function createStudioSession(
  analysisItemId: string,
  seed: StudioSeed,
): StudioSession {
  const initialRevision: StudioRevision = {
    id: makeId("rev"),
    code: seed.code,
    label: "Initial " + seed.sourceType,
    createdAt: new Date().toISOString(),
  };

  return {
    id: makeId("studio"),
    analysisItemId,
    sourceType: seed.sourceType,
    sourceIds: [...seed.sourceIds],
    explanation: seed.explanation,
    visualHints: [...seed.visualHints],
    revisions: [initialRevision],
    revisionIndex: 0,
  };
}

export function currentStudioCode(session: StudioSession): string {
  return session.revisions[session.revisionIndex]?.code || "";
}

export function applyStudioCode(
  session: StudioSession,
  code: string,
  label = "User change",
): StudioSession {
  const nextCode = code.trim();
  if (!nextCode || nextCode === currentStudioCode(session).trim()) return session;

  const kept = session.revisions.slice(0, session.revisionIndex + 1);
  const nextRevision: StudioRevision = {
    id: makeId("rev"),
    code: nextCode,
    label,
    createdAt: new Date().toISOString(),
  };

  return {
    ...session,
    sourceType: "user_version",
    revisions: [...kept, nextRevision],
    revisionIndex: kept.length,
  };
}

export function undoStudio(session: StudioSession): StudioSession {
  if (session.revisionIndex <= 0) return session;
  return { ...session, revisionIndex: session.revisionIndex - 1 };
}

export function redoStudio(session: StudioSession): StudioSession {
  if (session.revisionIndex >= session.revisions.length - 1) return session;
  return { ...session, revisionIndex: session.revisionIndex + 1 };
}

export function resetStudioToSeed(session: StudioSession): StudioSession {
  return { ...session, revisionIndex: 0 };
}

export function studioAgentContext(session: StudioSession) {
  return {
    analysisItemId: session.analysisItemId,
    sourceType: session.sourceType,
    sourceIds: session.sourceIds,
    explanation: session.explanation,
    visualHints: session.visualHints,
    currentPattern: currentStudioCode(session),
  };
}
