export type EvidenceKind =
  | "external_evidence"
  | "user_perception"
  | "ai_interpretation"
  | "general_theory"
  | "unknown";
export type ClaimStatus = "supported" | "interpreted" | "general" | "unknown";
export type AnalysisCategory =
  | "culture"
  | "harmony"
  | "rhythm"
  | "timbre"
  | "arrangement"
  | "structure"
  | "production";
export type EvidenceTopic = "identity" | AnalysisCategory;
export type StudioPotential = "none" | "rhythm" | "harmony" | "both";
export type VisualHint =
  "pianoroll" | "punchcard" | "spiral" | "scope" | "spectrum" | "pitchwheel";
export interface EvidenceClaim {
  id: string;
  kind: EvidenceKind;
  status: ClaimStatus;
  text: string;
  evidenceIds: string[];
  versionScope: string;
  topic: EvidenceTopic;
  reasoningNote: string | null;
}
export interface EvidenceExcerpt {
  id: string;
  text: string;
  locator: string;
  topics: EvidenceTopic[];
}
export interface EvidenceSource {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  sourceType:
    | "musicbrainz"
    | "official"
    | "interview"
    | "credits"
    | "analysis"
    | "score"
    | "transcription"
    | "reference"
    | "other";
  url: string;
  versionScope: string;
  documentHash: string;
  retrievedAt: string;
  excerpts: EvidenceExcerpt[];
}
export interface RecordingCandidate {
  id: string;
  title: string;
  artist: string;
  versionScope: string;
  recordingId: string | null;
  reason: string;
}
export interface ResolvedSong {
  title: string;
  artist: string;
  album: string | null;
  releaseYear: string | null;
  versionScope: string;
  identityStatus: "resolved" | "ambiguous" | "unresolved";
  candidates: RecordingCandidate[];
  musicBrainzRecordingId: string | null;
  musicBrainzWorkId: string | null;
  musicBrainzReleaseId: string | null;
}
export interface AnalysisItem {
  id: string;
  category: AnalysisCategory;
  title: string;
  summary: string;
  claims: EvidenceClaim[];
  unknowns: string[];
  expandable: boolean;
  studioPotential: StudioPotential;
}
export interface OverviewExpression {
  text: string;
  claimIds: string[];
}
export interface SongAnalysis {
  song: ResolvedSong;
  userPerception: string | null;
  overallVibe: {
    hook: OverviewExpression;
    emo: OverviewExpression;
    hype: OverviewExpression;
    pro: OverviewExpression;
  };
  modules: AnalysisItem[];
  sources: EvidenceSource[];
  unknowns: string[];
}
export interface PlaybackState {
  bpm: number;
  beatsPerCycle: number;
  soundBank: string;
  runtimeVersion: string;
}
export interface LearningExperiment {
  question: string;
  variable: string;
  baseline: string;
  changed: string;
  constants: string[];
  listenFor: string[];
  limitation: string;
}
export interface StudioSeed {
  sourceType: "source_transcription" | "learning_reconstruction";
  evidenceIds: string[];
  code: string;
  alternativeCode: string;
  explanation: string;
  visualHints: VisualHint[];
  playback: PlaybackState;
  experiment: LearningExperiment;
}
export interface DeepDive {
  analysisItemId: string;
  title: string;
  claims: EvidenceClaim[];
  sources: EvidenceSource[];
  generalTheory: Array<{ concept: string; explanation: string }>;
  conflicts: string[];
  unknowns: string[];
  listeningCues: Array<{
    text: string;
    claimIds: string[];
    scope: "recording" | "general";
  }>;
  studio: {
    eligible: boolean;
    potential: StudioPotential;
    reason: string;
    seed: StudioSeed | null;
  };
}
export interface EvidenceReview {
  claims: Array<{
    claimId: string;
    verdict: "supports" | "insufficient" | "conflicts";
    reason: string;
  }>;
  expressions: Record<"hook" | "emo" | "hype" | "pro", boolean>;
  identitySupported: boolean;
  transcriptionSupported: boolean;
}
export interface StoredAnalysis {
  evidenceReview?: EvidenceReview | null;
  schemaVersion: "1.1";
  analysisId: string;
  createdAt: string;
  persistent: boolean;
  analysis: SongAnalysis;
}
export interface StoredDeepDive {
  evidenceReview?: EvidenceReview | null;
  deepDiveId: string;
  analysisId: string;
  createdAt: string;
  question: string | null;
  deepDive: DeepDive;
}
export interface AnalysisHistoryItem {
  analysisId: string;
  createdAt: string;
  updatedAt: string;
  song: ResolvedSong;
  deepDiveCount: number;
}
export interface EvidencePackage extends StoredAnalysis {
  updatedAt: string;
  sources: EvidenceSource[];
  deepDives: StoredDeepDive[];
  studioSessions: Array<{
    deepDiveId: string;
    session: import("../studio/strudelStudio").StudioSession;
  }>;
}
export interface AgentHealth {
  ok: boolean;
  codexAvailable: boolean;
  codexVersion: string | null;
  model: string;
  reasoningEffort: string;
  authentication: "ready" | "unavailable";
  projectConfiguration: "explicit" | "unverified";
  musicBrainz: "ready" | "unavailable";
  webResearch: "unverified";
  strudelRuntime: "not_installed";
}
