export type V4ArtifactState = "missing" | "writing" | "ready";

export interface V4DspMeasurement {
  id: string;
  kind: string;
  class: "deterministic_acoustic" | "derived_deterministic";
  value: number | string | null;
  unit: string | null;
  methodId: string;
  startSec: number | null;
  endSec: number | null;
  notes: string[];
}

export interface V4DspArtifact {
  schemaVersion: "4.0";
  status: "complete" | "failed";
  error: string | null;
  sourceAudio: {
    path: string;
    durationSec: number | null;
    nativeSampleRateHz: number | null;
    channels: number | null;
  };
  analysisPcm: {
    sampleRateHz: number;
    channels: 1;
    sampleFormat: "f32le";
    rmsWindowSec: number;
  };
  loudness: {
    integratedLufs: number | null;
    loudnessRangeLu: number | null;
    truePeakDbfs: number | null;
    method: string;
  };
  rmsTimeline: Array<{
    startSec: number;
    endSec: number;
    rmsDbfs: number;
  }>;
  measurements: V4DspMeasurement[];
  changePoints: Array<{
    id: string;
    atSec: number;
    beforeRmsDbfs: number;
    afterRmsDbfs: number;
    deltaDb: number;
    direction: "rise" | "fall";
    contextSec: number;
  }>;
  methods: Array<{
    id: string;
    kind: string;
    method: string;
    parameters: Record<string, unknown>;
    class: "deterministic_acoustic" | "derived_deterministic";
  }>;
  warnings: string[];
}

export interface V4ListenArtifact {
  schemaVersion: "4.0";
  status: "complete" | "failed";
  error: string | null;
  audioDurationSec: number | null;
  overallCharacter: string;
  observations: Array<{
    id: string;
    category:
      | "rhythm"
      | "harmony"
      | "melody"
      | "timbre"
      | "arrangement"
      | "structure"
      | "production"
      | "energy";
    text: string;
    startSec: number | null;
    endSec: number | null;
    confidence: number;
    precision: "global" | "section" | "time_localized";
  }>;
  notableMoments: Array<{
    id: string;
    title: string;
    startSec: number;
    endSec: number;
    observationIds: string[];
  }>;
  uncertainties: string[];
}

export interface V4ResearchArtifact {
  schemaVersion: "4.0";
  status: "complete" | "failed";
  error: string | null;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publisher: string | null;
    sourceClass: "primary" | "near_primary" | "editorial" | "community" | "other";
    excerpt: string;
  }>;
  findings: Array<{
    id: string;
    topic:
      | "identity"
      | "release"
      | "credits"
      | "culture"
      | "production"
      | "criticism"
      | "transcription"
      | "other";
    text: string;
    sourceIds: string[];
    scope: "recording" | "release" | "work" | "artist" | "general";
    confidence: number;
  }>;
  unknowns: string[];
}

export interface V4AnalysisArtifact {
  schemaVersion: "4.0";
  status: "complete" | "partial" | "failed";
  inputStatus: {
    listen: "complete" | "failed" | "missing";
    dsp: "complete" | "failed" | "missing";
    research: "complete" | "failed" | "missing";
  };
  overall: {
    hook: string;
    emo: string;
    hype: string;
    pro: string;
    overallCharacter: string;
  };
  interpretations: Array<{
    id: string;
    category:
      | "culture"
      | "rhythm"
      | "harmony"
      | "melody"
      | "timbre"
      | "arrangement"
      | "structure"
      | "production"
      | "energy";
    text: string;
    observationIds: string[];
    measurementIds: string[];
    evidenceIds: string[];
    generalPrinciples: string[];
  }>;
  modules: Array<{
    id: string;
    category:
      | "culture"
      | "rhythm"
      | "harmony"
      | "melody"
      | "timbre"
      | "arrangement"
      | "structure"
      | "production"
      | "energy";
    title: string;
    summary: string;
    interpretationIds: string[];
    listeningCues: Array<{
      text: string;
      startSec: number | null;
      endSec: number | null;
    }>;
    unknowns: string[];
  }>;
  unknowns: string[];
  studioPotential: {
    eligible: boolean;
    mechanism: string;
    sourceInterpretationIds: string[];
    variable: string;
    baseline: string;
    changed: string;
    listenFor: string[];
    limitation: string;
  };
  warnings: string[];
}

export interface V4StudioArtifact {
  schemaVersion: "4.0";
  sourceType: "learning_reconstruction";
  analysisId: string;
  sourceInterpretationIds: string[];
  question: string;
  variable: string;
  baseline: string;
  changed: string;
  constants: string[];
  listenFor: string[];
  limitation: string;
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
}

export interface V4ArtifactRecord<T> {
  state: V4ArtifactState;
  value: T | null;
  error: string | null;
}

export interface V4RunStatus {
  runId: string;
  runDir: string;
  task: {
    identity: {
      title: string;
      artist: string;
      album: string | null;
      year: string | null;
      platform: string | null;
      trackUrl: string | null;
    };
    recording: {
      mediaRevisionId: string;
      audioPath: string;
      durationSec: number;
    };
  };
  session: V4SessionStatus;
  requests: {
    analysis: V4QueuedRequest | null;
    creative: V4QueuedRequest | null;
  };
  summary: Record<
    "dsp" | "listen" | "research" | "analysis" | "studio",
    {
      state: V4ArtifactState;
      status: string | null;
      error: string | null;
    }
  >;
  artifacts: {
    dsp: V4ArtifactRecord<V4DspArtifact>;
    listen: V4ArtifactRecord<V4ListenArtifact>;
    research: V4ArtifactRecord<V4ResearchArtifact>;
    analysis: V4ArtifactRecord<V4AnalysisArtifact>;
    studio: V4ArtifactRecord<V4StudioArtifact>;
  };
}


export interface V4SessionStatus {
  status: "offline" | "waiting" | "processing" | "stopped";
  online: boolean;
  sessionId: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  activeRequestId: string | null;
  activeRunId: string | null;
  activeKind: "analysis" | "creative" | null;
  lastError: string | null;
}

export interface V4QueuedRequest {
  schemaVersion: "4.0";
  requestId: string;
  kind: "analysis" | "creative";
  runId: string;
  status: "queued" | "claimed" | "completed" | "failed";
  interpretationId: string | null;
  queuedAt: string;
  createdAt: string;
  claimedAt: string | null;
  claimedBySessionId: string | null;
  completedAt: string | null;
  error: string | null;
}
