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

const category = choice([
  "rhythm",
  "harmony",
  "melody",
  "timbre",
  "arrangement",
  "structure",
  "production",
  "energy",
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
            anyOf: [
              category,
              choice(["identity", "other"]),
            ],
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
      updatedAt: string,
    }),
  },

  "v2-creative-blueprint": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 CreativeBlueprint v2.0",
    ...object({
      schemaVersion: { const: "2.0" },
      blueprintId: string,
      songId: string,
      analysisId: string,
      title: string,
      concept: string,
      sourceObservationIds: array(string),
      sourceInterpretationIds: array(string),
      variables: array(
        object({
          id: string,
          type: choice([
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
          ]),
          baseline: string,
          variation: string,
          sourceObservationIds: array(string),
        }),
      ),
      preserve: array(string),
      listenFor: array(string),
      limitations: array(string),
      studioEligible: { type: "boolean" },
    }),
  },
};
