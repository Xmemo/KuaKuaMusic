const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
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
  "culture",
  "rhythm",
  "harmony",
  "melody",
  "timbre",
  "arrangement",
  "structure",
  "production",
  "energy",
];
const observationCategory = choice(categoryValues.filter((value) => value !== "culture"));
const category = choice(categoryValues);
const visualHint = choice([
  "pianoroll",
  "punchcard",
  "spiral",
  "scope",
  "spectrum",
  "pitchwheel",
]);

const observation = object({
  id: string,
  category: observationCategory,
  text: string,
  startSec: nullableNumber,
  endSec: nullableNumber,
  confidence: number01,
});

const measurement = object({
  id: string,
  kind: string,
  value: { type: ["string", "number", "null"] },
  unit: nullableString,
  method: string,
  confidence: number01,
  startSec: nullableNumber,
  endSec: nullableNumber,
  alternatives: array(
    object({
      value: { type: ["string", "number"] },
      confidence: number01,
    }),
  ),
  artifactPath: nullableString,
  notes: array(string),
});

const evidence = object({
  id: string,
  title: string,
  url: string,
  publisher: nullableString,
  excerpt: string,
  claim: string,
  scope: choice(["work", "recording", "release", "artist", "general"]),
  confidence: number01,
});

const interpretation = object({
  id: string,
  category,
  text: string,
  observationIds: array(string),
  measurementIds: array(string),
  evidenceIds: array(string),
  generalPrinciples: array(string),
});

const module = object({
  id: string,
  category,
  title: string,
  summary: string,
  interpretationIds: array(string),
  listeningCues: array(
    object({
      text: string,
      startSec: nullableNumber,
      endSec: nullableNumber,
    }),
  ),
  unknowns: array(string),
});

const creativeExperiment = object({
  eligible: { type: "boolean" },
  mechanism: string,
  sourceInterpretationIds: array(string),
  variable: string,
  baseline: string,
  changed: string,
  constants: array(string),
  listenFor: array(string),
  code: nullableString,
  alternativeCode: nullableString,
  visualHints: array(visualHint),
  limitation: string,
});

const draftFields = {
  overall: object({
    hook: string,
    emo: string,
    hype: string,
    pro: string,
    overallCharacter: string,
  }),
  observations: array(observation),
  measurements: array(measurement),
  externalEvidence: array(evidence),
  interpretations: array(interpretation),
  modules: array(module),
  unknowns: array(string),
  creativeExperiment,
};

const usage = object({
  inputTokens: nullableNumber,
  outputTokens: nullableNumber,
  thinkingTokens: nullableNumber,
  cacheReadTokens: nullableNumber,
  totalTokens: nullableNumber,
});

export const v3Contracts = {
  "v3-analysis-draft": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 Single-Agent Analysis Draft v3.0",
    ...object(draftFields),
  },

  "v3-analysis-artifact": {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "MusicLearning2026 Single-Agent Analysis Artifact v3.0",
    ...object({
      schemaVersion: { const: "3.0" },
      analysisId: string,
      songId: string,
      mediaRevisionId: string,
      createdAt: string,
      agent: object({
        runner: string,
        model: string,
        effort: string,
        skill: object({ name: string, version: string }),
        conversationId: nullableString,
        toolsUsed: array(string),
        usage,
        protocolChecks: object({
          listenCheckpointExists: { type: "boolean" },
          noMcpDependency: { type: "boolean" },
        }),
      }),
      ...draftFields,
    }),
  },
};
