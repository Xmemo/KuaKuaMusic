import type {
  LearningExperiment,
  PlaybackState,
  StudioSeed,
  VisualHint,
} from "../music-learning/types";
export interface StudioValidationResult {
  ok: boolean;
  message?: string;
}
export interface StrudelStudioAdapter {
  getPattern(): string;
  setPattern(code: string): Promise<void>;
  play(): Promise<void>;
  stop(): Promise<void>;
  setPlayback(value: PlaybackState): Promise<void>;
  validate(code: string): Promise<StudioValidationResult>;
  dispose(): Promise<void>;
}
export type StudioSourceType =
  "source_transcription" | "learning_reconstruction" | "user_version";
export interface StudioRevision {
  id: string;
  code: string;
  playback: PlaybackState;
  label: string;
  sourceType: StudioSourceType;
  createdAt: string;
}
export interface StudioSession {
  saveVersion: number;
  id: string;
  analysisItemId: string;
  evidenceIds: string[];
  explanation: string;
  visualHints: VisualHint[];
  experiment: LearningExperiment;
  alternativeCode: string;
  revisions: StudioRevision[];
  revisionIndex: number;
}
export interface StudioProposal {
  baseRevisionId: string;
  code: string;
  playback: PlaybackState;
  explanation: string;
}
export function createStudioSession(
  analysisItemId: string,
  seed: StudioSeed,
): StudioSession {
  return {
    id: crypto.randomUUID(),
    saveVersion: 0,
    analysisItemId,
    evidenceIds: [...seed.evidenceIds],
    explanation: seed.explanation,
    visualHints: [...seed.visualHints],
    experiment: seed.experiment,
    alternativeCode: seed.alternativeCode,
    revisions: [
      {
        id: crypto.randomUUID(),
        code: seed.code,
        playback: { ...seed.playback },
        label: "原始实验",
        sourceType: seed.sourceType,
        createdAt: new Date().toISOString(),
      },
    ],
    revisionIndex: 0,
  };
}
export const currentStudioRevision = (session: StudioSession) =>
  session.revisions[session.revisionIndex];
export const currentStudioCode = (session: StudioSession) =>
  currentStudioRevision(session)?.code || "";
export const currentStudioSourceType = (
  session: StudioSession,
): StudioSourceType =>
  currentStudioRevision(session)?.sourceType || "learning_reconstruction";
export function proposeStudioChange(
  session: StudioSession,
  code: string,
  playback = currentStudioRevision(session).playback,
  explanation = "修改实验",
): StudioProposal {
  return {
    baseRevisionId: currentStudioRevision(session).id,
    code,
    playback: { ...playback },
    explanation,
  };
}
export function applyStudioProposal(
  session: StudioSession,
  proposal: StudioProposal,
): StudioSession {
  const current = currentStudioRevision(session);
  if (proposal.baseRevisionId !== current.id)
    throw new Error("建议基于旧版本，请按当前版本重新预览。");
  if (!proposal.code.trim() || proposal.code.length > 16000)
    throw new Error("代码为空或过长。");
  if (
    !Number.isFinite(proposal.playback.bpm) ||
    !Number.isFinite(proposal.playback.beatsPerCycle) ||
    proposal.playback.bpm < 20 ||
    proposal.playback.bpm > 300 ||
    proposal.playback.beatsPerCycle <= 0 ||
    proposal.playback.beatsPerCycle > 32
  )
    throw new Error("速度或每循环拍数无效。");
  if (
    proposal.playback.soundBank !== current.playback.soundBank ||
    proposal.playback.runtimeVersion !== current.playback.runtimeVersion
  )
    throw new Error("当前实验必须保持音源及运行时约定。");
  if (
    proposal.code.trim() === current.code.trim() &&
    JSON.stringify(proposal.playback) === JSON.stringify(current.playback)
  )
    return session;
  const kept = session.revisions.slice(0, session.revisionIndex + 1);
  if (kept.length >= 200)
    throw new Error("当前实验历史已达到 200 条，请导出后创建新实验。");
  return {
    ...session,
    revisions: [
      ...kept,
      {
        id: crypto.randomUUID(),
        code: proposal.code.trim(),
        playback: { ...proposal.playback },
        label: proposal.explanation,
        sourceType: "user_version",
        createdAt: new Date().toISOString(),
      },
    ],
    revisionIndex: kept.length,
  };
}
export const applyStudioCode = (
  session: StudioSession,
  code: string,
  label = "用户编辑",
) =>
  applyStudioProposal(
    session,
    proposeStudioChange(session, code, undefined, label),
  );
export const undoStudio = (session: StudioSession) =>
  session.revisionIndex <= 0
    ? session
    : { ...session, revisionIndex: session.revisionIndex - 1 };
export const redoStudio = (session: StudioSession) =>
  session.revisionIndex >= session.revisions.length - 1
    ? session
    : { ...session, revisionIndex: session.revisionIndex + 1 };
export const resetStudioToSeed = (session: StudioSession) => ({
  ...session,
  revisionIndex: 0,
});
export const studioAgentContext = (session: StudioSession) => ({
  analysisItemId: session.analysisItemId,
  baseRevisionId: currentStudioRevision(session).id,
  sourceType: currentStudioSourceType(session),
  evidenceIds: session.evidenceIds,
  experiment: session.experiment,
  currentPattern: currentStudioCode(session),
  playback: currentStudioRevision(session).playback,
});
export function strudelExport(revision: StudioRevision): string {
  return (
    "// MusicLearning2026: " +
    revision.sourceType +
    "\nsetcpm(" +
    revision.playback.bpm +
    "/" +
    revision.playback.beatsPerCycle +
    ");\n" +
    revision.code
  );
}
export function previewStudioDiff(
  session: StudioSession,
  proposal: StudioProposal,
) {
  return {
    before: currentStudioRevision(session),
    after: { code: proposal.code, playback: proposal.playback },
    stale: proposal.baseRevisionId !== currentStudioRevision(session).id,
  };
}
