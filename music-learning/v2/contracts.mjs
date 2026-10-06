const string = { type: "string" };
const nullableNumber = { type: ["number", "null"] };
const nullableString = { type: ["string", "null"] };
const number01 = { type: "number", minimum: 0, maximum: 1 };
const array = (items) => ({ type: "array", items });
const choice = (values) => ({ type: "string", enum: values });
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const categoryValues = [
  "rhythm",
  "harmony",
  "melody",
  "timbre",
  "arrangement",
  "structure",
  "production",
  "energy",
];
const category = choice(categoryValues);
const criticCategory = choice(["culture", ...categoryValues]);
const researchTopic = choice([
  "identity",
  "culture",
  "harmony",
  "rhythm",
  "timbre",
  "arrangement",
  "structure",
  "production",
]);
const creativeVariableType = choice([
  "tempo",
  "rhythmic_density",
  "subdivision",
  "syncopation",
  "layer_entry",
  "register",
  "motif_repetition",
  "harmonic_rhythm",
  "texture_density",
  "filter_motion",
  "timbre_brightness",
]);

const observation = object({
  id: string,
  category,
  statement: string,
  startSec: nullableNumber,
  endSec: nullableNumber,
  tags: array(string),
  confidence: number01,
  precision: choice(["global", "section", "time_localized"]),
});

const timelineSection = object({
  id: string,
  startSec: { type: "number", minimum: 0 },
  endSec: { type: "number", minimum: 0 },
  label: choice([
    "intro_like",
    "verse_like",
    "chorus_like",
    "build",
    "transition",
    "break",
    "climax",
    "outro_like",
    "other",
    "unknown",
  ]),
  description: string,
  confidence: number01,
});

const estimatedParameter = object({
  value: { type: ["string", "number", "null"] },
  confidence: number01,
});

const researchFinding = object({
  id: string,
  topic: researchTopic,
  text: string,
  evidenceIds: array(string),
  scope: choice(["work", "source_version", "recording"]),
  versionScope: string,
});

const criticInterpretation = object({
  id: string,
  category: criticCategory,
  text: string,
  observationIds: array(string),
  evidenceIds: array(string),
  generalPrinciples: array(string),
});

const criticModule = object({
  id: string,
  category: criticCategory,
  title: string,
  summary: string,
  interpretationIds: array(string),
  listeningCues: array(
    object({
      text: string,
      startSec: nullableNumber,
      endSec: nullableNumber,
      observationIds: array(string),
      evidenceIds: array(string),
    }),
  ),
  unknowns: array(string),
  expandable: { type: "boolean" },
  studioPotential: choice(["none", "rhythm", "harmony", "arrangement", "mixed"]),
});

const overviewExpression = object({
  text: string,
  interpretationIds: array(string),
});
const overallVibe = object({
  hook: overviewExpression,
  emo: overviewExpression,
  hype: overviewExpression,
  pro: overviewExpression,
});

const criticDraft = {
  overallVibe,
  interpretations: array(criticInterpretation),
  modules: array(criticModule),
  unknowns: array(string),
};

const visualHint = choice([
  "pianoroll",
  "punchcard",
  "spiral",
  "scope",
  "spectrum",
  "pitchwheel",
]);

const studioExperiment = object({
  question: string,
  variable: string,
  baseline: string,
  changed: string,
  constants: array(string),
  listenFor: array(string),
  limitation: string,
});

const studioSeedDraft = {
  code: string,
  alternativeCode: string,
  explanation: string,
  visualHints: array(visualHint),
  experiment: studioExperiment,
};

const creativeVariable = object({
  id: string,
  type: creativeVariableType,
  baseline: string,
  variation: string,
  sourceObservationIds: array(string),
});

const creativeDraft = {
  title: string,
  concept: string,
  sourceObservationIds: array(string),
  sourceInterpretationIds: array(string),
  variables: array(creativeVariable),
  preserve: array(string),
  listenFor: array(string),
  limitations: array(string),
  studioEligible: { type: "boolean" },
};

export const v2Contracts = {
  "v2-music-observation": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 MusicObservationDocument v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      listenRunId: string,
      songId: string,
      mediaRevisionId: string,
      createdAt: string,
      provider: object({
        name: string,
        model: string,
        promptVersion: string,
      }),
      globalProfile: object({
        styleTags: array(string),
        moodTags: array(string),
        overallCharacter: string,
        confidence: number01,
      }),
      timeline: object({
        durationSec: nullableNumber,
        sections: array(timelineSection),
      }),
      observations: array(observation),
      notableMoments: array(
        object({
          id: string,
          startSec: { type: "number", minimum: 0 },
          endSec: { type: "number", minimum: 0 },
          salience: number01,
          title: string,
          observationIds: array(string),
        }),
      ),
      estimatedParameters: object({
        bpm: estimatedParameter,
        key: estimatedParameter,
        meter: estimatedParameter,
      }),
      uncertainties: array(
        object({
          topic: {
            anyOf: [category, choice(["identity", "other"])],
          },
          text: string,
        }),
      ),
    }),
  },

  "v2-song-package-manifest": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 SongPackageManifest v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      song: object({
        songId: string,
        title: string,
        artist: string,
        album: nullableString,
        releaseYear: nullableString,
        durationSec: nullableNumber,
        sourcePlatform: nullableString,
        sourceTrackUrl: nullableString,
      }),
      currentMediaRevisionId: nullableString,
      mediaRevisions: array(
        object({
          mediaRevisionId: string,
          createdAt: string,
          sha256: string,
        }),
      ),
      observationRunIds: array(string),
      researchRunIds: array(string),
      analysisIds: array(string),
      blueprintIds: array(string),
      studioSeedIds: array(string),
      updatedAt: string,
    }),
  },

  "v2-research-draft": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 ResearchDraft v2.0",
    ...object({
      summary: string,
      findings: array(researchFinding),
      unknowns: array(string),
    }),
  },

  "v2-research-artifact": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 ResearchArtifact v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      researchRunId: string,
      songId: string,
      createdAt: string,
      provider: object({ name: string, model: string }),
      backend: choice(["registered-web", "provider-native", "codex-web"]),
      guidedByObservationIds: array(string),
      sourceIds: array(string),
      summary: string,
      findings: array(researchFinding),
      unknowns: array(string),
    }),
  },

  "v2-critic-draft": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 CriticDraft v2.0",
    ...object(criticDraft),
  },

  "v2-critic-analysis": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 CriticAnalysis v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      analysisId: string,
      songId: string,
      listenRunId: nullableString,
      researchRunId: nullableString,
      createdAt: string,
      provider: object({ name: string, model: string }),
      ...criticDraft,
    }),
  },

  "v2-creative-draft": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 CreativeBlueprintDraft v2.0",
    ...object(creativeDraft),
  },

  "v2-creative-blueprint": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 CreativeBlueprint v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      blueprintId: string,
      songId: string,
      analysisId: string,
      ...creativeDraft,
    }),
  },

  "v2-studio-seed-draft": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 Strudel Studio Seed Draft v2.0",
    ...object(studioSeedDraft),
  },

  "v2-studio-seed": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 Strudel Studio Seed v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      studioSeedId: string,
      blueprintId: string,
      songId: string,
      analysisId: string,
      sourceType: { const: "learning_reconstruction" },
      sourceObservationIds: array(string),
      sourceInterpretationIds: array(string),
      ...studioSeedDraft,
      playback: object({
        bpm: { type: "number", minimum: 20, maximum: 300 },
        beatsPerCycle: { type: "number", minimum: 0.25, maximum: 32 },
        soundBank: string,
        runtimeVersion: string,
      }),
    }),
  },
};
