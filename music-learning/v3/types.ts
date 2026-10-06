export type V3MusicCategory =
  | "culture"
  | "rhythm"
  | "harmony"
  | "melody"
  | "timbre"
  | "arrangement"
  | "structure"
  | "production"
  | "energy";

export interface V3Observation {
  id: string;
  category: Exclude<V3MusicCategory, "culture">;
  text: string;
  startSec: number | null;
  endSec: number | null;
  confidence: number;
}

export interface V3Measurement {
  id: string;
  kind: string;
  value: string | number | null;
  unit: string | null;
  method: string;
  confidence: number;
  startSec: number | null;
  endSec: number | null;
  alternatives: Array<{
    value: string | number;
    confidence: number;
  }>;
  artifactPath: string | null;
  notes: string[];
}

export interface V3ExternalEvidence {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  excerpt: string;
  claim: string;
  scope: "work" | "recording" | "release" | "artist" | "general";
  confidence: number;
}

export interface V3Interpretation {
  id: string;
  category: V3MusicCategory;
  text: string;
  observationIds: string[];
  measurementIds: string[];
  evidenceIds: string[];
  generalPrinciples: string[];
}

export interface V3Module {
  id: string;
  category: V3MusicCategory;
  title: string;
  summary: string;
  interpretationIds: string[];
  listeningCues: Array<{
    text: string;
    startSec: number | null;
    endSec: number | null;
  }>;
  unknowns: string[];
}

export interface V3CreativeExperiment {
  eligible: boolean;
  mechanism: string;
  sourceInterpretationIds: string[];
  variable: string;
  baseline: string;
  changed: string;
  constants: string[];
  listenFor: string[];
  code: string | null;
  alternativeCode: string | null;
  visualHints: Array<
    "pianoroll" | "punchcard" | "spiral" | "scope" | "spectrum" | "pitchwheel"
  >;
  limitation: string;
}

export interface V3AnalysisDraft {
  overall: {
    hook: string;
    emo: string;
    hype: string;
    pro: string;
    overallCharacter: string;
  };
  observations: V3Observation[];
  measurements: V3Measurement[];
  externalEvidence: V3ExternalEvidence[];
  interpretations: V3Interpretation[];
  modules: V3Module[];
  unknowns: string[];
  creativeExperiment: V3CreativeExperiment;
}

export interface V3AnalysisArtifact extends V3AnalysisDraft {
  schemaVersion: "3.0";
  analysisId: string;
  songId: string;
  mediaRevisionId: string;
  createdAt: string;
  agent: {
    runner: "antigravity-cli";
    model: string;
    effort: "low" | "medium" | "high";
    skillVersion: string;
    conversationId: string | null;
    toolsUsed: string[];
    mcpToolsUsed: string[];
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      thinkingTokens: number | null;
      cacheReadTokens: number | null;
      totalTokens: number | null;
    };
    protocolChecks: {
      listenCheckpointExists: boolean;
    };
  };
}

export interface V3AgentRunResult {
  artifact: V3AnalysisArtifact;
  runDirectory: string;
}
