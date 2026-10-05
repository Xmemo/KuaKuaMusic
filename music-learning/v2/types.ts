export type ProviderRole = "listen" | "research" | "critic" | "creative";
export type ResearchBackend = "registered-web" | "provider-native" | "codex-web";

export interface ProviderCapabilities {
  audioUnderstanding: boolean;
  structuredText: boolean;
  nativeWebSearch: boolean;
  localExecution: boolean;
}

export interface ProviderSelection {
  role: ProviderRole;
  provider: string;
  model: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderPlan {
  listen: ProviderSelection;
  research: ProviderSelection & { backend: ResearchBackend };
  critic: ProviderSelection;
  creative: ProviderSelection;
}

export interface CanonicalSong {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: string | null;
  durationSec: number | null;
  sourcePlatform: string | null;
  sourceTrackUrl: string | null;
}

export interface AudioSourceCandidate {
  sourceId: string;
  url: string;
  title: string;
  artistHint: string | null;
  albumHint: string | null;
  channel: string;
  durationSec: number | null;
  isOfficial: boolean;
  isTopic: boolean;
  isPublisher: boolean;
}

export type AudioMatchDecision =
  | "auto_high"
  | "auto_medium"
  | "manual_required"
  | "manual_selected";

export interface ScoredAudioSourceCandidate extends AudioSourceCandidate {
  matchScore: number;
  scoreParts: {
    title: number;
    artist: number;
    duration: number | null;
    albumVersion: number | null;
    authority: number;
    variantPenalty: number;
  };
}

export interface AudioMatchResult {
  decision: AudioMatchDecision;
  requiresSanityCheck: boolean;
  selected: ScoredAudioSourceCandidate | null;
  candidates: ScoredAudioSourceCandidate[];
}

export interface AcquisitionRecord {
  provider: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  channel: string;
  durationSec: number | null;
  matchScore: number;
  matchDecision: AudioMatchDecision;
  requiresSanityCheck: boolean;
  downloadedAt: string;
  sha256: string;
}

export interface MediaRevision {
  mediaRevisionId: string;
  createdAt: string;
  acquisition: AcquisitionRecord;
  sourcePath: string;
  analysisPath: string;
  analysisMimeType: string;
  durationSec: number | null;
}

export interface SongPackageManifest {
  schemaVersion: "2.0";
  song: CanonicalSong;
  currentMediaRevisionId: string | null;
  mediaRevisions: Array<{
    mediaRevisionId: string;
    createdAt: string;
    sha256: string;
  }>;
  observationRunIds: string[];
  researchRunIds: string[];
  analysisIds: string[];
  blueprintIds: string[];
  studioSeedIds: string[];
  updatedAt: string;
}

export type MusicObservationCategory =
  | "rhythm"
  | "harmony"
  | "melody"
  | "timbre"
  | "arrangement"
  | "structure"
  | "production"
  | "energy";

export type ObservationPrecision = "global" | "section" | "time_localized";

export type SectionLabel =
  | "intro_like"
  | "verse_like"
  | "chorus_like"
  | "build"
  | "transition"
  | "break"
  | "climax"
  | "outro_like"
  | "other"
  | "unknown";

export interface TimelineSection {
  id: string;
  startSec: number;
  endSec: number;
  label: SectionLabel;
  description: string;
  confidence: number;
}

export interface AudioObservation {
  id: string;
  category: MusicObservationCategory;
  statement: string;
  startSec: number | null;
  endSec: number | null;
  tags: string[];
  confidence: number;
  precision: ObservationPrecision;
}

export interface NotableMoment {
  id: string;
  startSec: number;
  endSec: number;
  salience: number;
  title: string;
  observationIds: string[];
}

export interface EstimatedParameter {
  value: string | number | null;
  confidence: number;
}

export interface MusicObservationDocument {
  schemaVersion: "2.0";
  listenRunId: string;
  songId: string;
  mediaRevisionId: string;
  createdAt: string;
  provider: {
    name: string;
    model: string;
    promptVersion: string;
  };
  globalProfile: {
    styleTags: string[];
    moodTags: string[];
    overallCharacter: string;
    confidence: number;
  };
  timeline: {
    durationSec: number | null;
    sections: TimelineSection[];
  };
  observations: AudioObservation[];
  notableMoments: NotableMoment[];
  estimatedParameters: {
    bpm: EstimatedParameter;
    key: EstimatedParameter;
    meter: EstimatedParameter;
  };
  uncertainties: Array<{
    topic: MusicObservationCategory | "identity" | "other";
    text: string;
  }>;
}

export type ResearchTopic =
  | "identity"
  | "culture"
  | "harmony"
  | "rhythm"
  | "timbre"
  | "arrangement"
  | "structure"
  | "production";

export interface ResearchFinding {
  id: string;
  topic: ResearchTopic;
  text: string;
  evidenceIds: string[];
  scope: "work" | "source_version" | "recording";
  versionScope: string;
}

export interface ResearchArtifact {
  schemaVersion: "2.0";
  researchRunId: string;
  songId: string;
  createdAt: string;
  provider: { name: string; model: string };
  backend: ResearchBackend;
  guidedByObservationIds: string[];
  sourceIds: string[];
  summary: string;
  findings: ResearchFinding[];
  unknowns: string[];
}

export type CriticCategory = "culture" | MusicObservationCategory;

export interface CriticInterpretation {
  id: string;
  category: CriticCategory;
  text: string;
  observationIds: string[];
  evidenceIds: string[];
  generalPrinciples: string[];
}

export interface CriticModule {
  id: string;
  category: CriticCategory;
  title: string;
  summary: string;
  interpretationIds: string[];
  listeningCues: Array<{
    text: string;
    startSec: number | null;
    endSec: number | null;
    observationIds: string[];
    evidenceIds: string[];
  }>;
  unknowns: string[];
  expandable: boolean;
  studioPotential: "none" | "rhythm" | "harmony" | "arrangement" | "mixed";
}

export interface V2CriticAnalysis {
  schemaVersion: "2.0";
  analysisId: string;
  songId: string;
  listenRunId: string | null;
  researchRunId: string | null;
  createdAt: string;
  provider: { name: string; model: string };
  overallVibe: {
    hook: { text: string; interpretationIds: string[] };
    emo: { text: string; interpretationIds: string[] };
    hype: { text: string; interpretationIds: string[] };
    pro: { text: string; interpretationIds: string[] };
  };
  interpretations: CriticInterpretation[];
  modules: CriticModule[];
  unknowns: string[];
}

export type CreativeVariableType =
  | "tempo"
  | "rhythmic_density"
  | "subdivision"
  | "syncopation"
  | "layer_entry"
  | "register"
  | "motif_repetition"
  | "harmonic_rhythm"
  | "texture_density"
  | "filter_motion"
  | "timbre_brightness";

export interface CreativeVariable {
  id: string;
  type: CreativeVariableType;
  baseline: string;
  variation: string;
  sourceObservationIds: string[];
}

export interface CreativeBlueprint {
  schemaVersion: "2.0";
  blueprintId: string;
  songId: string;
  analysisId: string;
  title: string;
  concept: string;
  sourceObservationIds: string[];
  sourceInterpretationIds: string[];
  variables: CreativeVariable[];
  preserve: string[];
  listenFor: string[];
  limitations: string[];
  studioEligible: boolean;
}


export type V2VisualHint =
  | "pianoroll"
  | "punchcard"
  | "spiral"
  | "scope"
  | "spectrum"
  | "pitchwheel";

export interface V2StudioSeed {
  schemaVersion: "2.0";
  studioSeedId: string;
  blueprintId: string;
  songId: string;
  analysisId: string;
  sourceType: "learning_reconstruction";
  sourceObservationIds: string[];
  sourceInterpretationIds: string[];
  code: string;
  alternativeCode: string;
  explanation: string;
  visualHints: V2VisualHint[];
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

export type V2PipelineStage =
  | "resolving_audio"
  | "awaiting_source_confirmation"
  | "acquiring_audio"
  | "listening"
  | "researching"
  | "targeted_research"
  | "critic"
  | "creative_blueprint"
  | "complete";
