export type EvidenceKind =
  | "external_evidence"
  | "user_perception"
  | "machine_observation"
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

export type StudioPotential = "none" | "rhythm" | "harmony" | "both";

export type VisualHint =
  | "pianoroll"
  | "punchcard"
  | "spiral"
  | "scope"
  | "spectrum"
  | "pitchwheel";

export interface EvidenceClaim {
  id: string;
  kind: EvidenceKind;
  status: ClaimStatus;
  text: string;
  sourceIds: string[];
  versionScope: string;
  reasoningNote: string | null;
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
  url: string | null;
  supports: string[];
  versionScope: string;
  evidenceNote: string | null;
}

export interface ResolvedSong {
  title: string;
  artist: string;
  album: string | null;
  releaseYear: string | null;
  versionScope: string;
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

export interface SongAnalysis {
  song: ResolvedSong;
  userPerception: string | null;
  overallVibe: {
    hook: string;
    emo: string;
    hype: string;
    pro: string;
  };
  modules: AnalysisItem[];
  sources: EvidenceSource[];
  unknowns: string[];
}

export interface StudioSeed {
  sourceType: "source_transcription" | "learning_reconstruction";
  sourceIds: string[];
  code: string;
  explanation: string;
  visualHints: VisualHint[];
}

export interface DeepDive {
  analysisItemId: string;
  title: string;
  sources: EvidenceSource[];
  confirmed: Array<{
    text: string;
    sourceIds: string[];
    versionScope: string;
  }>;
  sourceSupport: Array<{
    sourceId: string;
    supports: string;
    limitations: string | null;
  }>;
  interpretation: string;
  generalTheory: Array<{
    concept: string;
    explanation: string;
  }>;
  conflicts: string[];
  unknowns: string[];
  listeningCues: string[];
  studio: {
    eligible: boolean;
    potential: StudioPotential;
    reason: string;
    seed: StudioSeed | null;
  };
}
