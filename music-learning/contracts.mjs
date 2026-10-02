// Single schema source for public contracts and Codex structured drafts.
const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const list = (items) => ({ type: "array", items });
const choice = (values) => ({ type: "string", enum: values });
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const ref = (name) => ({ $ref: "#/$defs/" + name });
export const topics = [
  "identity",
  "culture",
  "harmony",
  "rhythm",
  "timbre",
  "arrangement",
  "structure",
  "production",
];
const sourceTypes = [
  "musicbrainz",
  "official",
  "interview",
  "credits",
  "analysis",
  "score",
  "transcription",
  "reference",
  "other",
];
const potential = choice(["none", "rhythm", "harmony", "both"]);
const definitions = {
  candidate: object({
    id: text,
    title: text,
    artist: text,
    versionScope: text,
    recordingId: nullableText,
    reason: text,
  }),
  song: object({
    title: text,
    artist: text,
    album: nullableText,
    releaseYear: nullableText,
    versionScope: text,
    identityStatus: choice(["resolved", "ambiguous", "unresolved"]),
    candidates: list(ref("candidate")),
    musicBrainzRecordingId: nullableText,
    musicBrainzWorkId: nullableText,
    musicBrainzReleaseId: nullableText,
  }),
  excerpt: object({
    id: text,
    text,
    locator: text,
    topics: list(choice(topics)),
  }),
  source: object({
    id: text,
    title: text,
    author: nullableText,
    publisher: nullableText,
    sourceType: choice(sourceTypes),
    url: text,
    versionScope: text,
    documentHash: text,
    retrievedAt: text,
    excerpts: list(ref("excerpt")),
  }),
  proposedSource: object({
    title: text,
    author: nullableText,
    publisher: nullableText,
    sourceType: choice(sourceTypes),
    url: text,
    versionScope: text,
    excerpts: list(
      object({ text, locator: text, topics: list(choice(topics)) }),
    ),
  }),
  claim: object({
    id: text,
    kind: choice([
      "external_evidence",
      "user_perception",
      "ai_interpretation",
      "general_theory",
      "unknown",
    ]),
    status: choice(["supported", "interpreted", "general", "unknown"]),
    text,
    evidenceIds: list(text),
    versionScope: text,
    topic: choice(topics),
    reasoningNote: nullableText,
  }),
  expression: object({ text, claimIds: list(text) }),
  module: object({
    id: text,
    category: choice(topics.slice(1)),
    title: text,
    summary: text,
    claims: list(ref("claim")),
    unknowns: list(text),
    expandable: { type: "boolean" },
    studioPotential: potential,
  }),
  playback: object({
    bpm: { type: "number" },
    beatsPerCycle: { type: "number" },
    soundBank: text,
    runtimeVersion: text,
  }),
  experiment: object({
    question: text,
    variable: text,
    baseline: text,
    changed: text,
    constants: list(text),
    listenFor: list(text),
    limitation: text,
  }),
  seed: object({
    sourceType: choice(["source_transcription", "learning_reconstruction"]),
    evidenceIds: list(text),
    code: text,
    alternativeCode: text,
    explanation: text,
    visualHints: list(
      choice([
        "pianoroll",
        "punchcard",
        "spiral",
        "scope",
        "spectrum",
        "pitchwheel",
      ]),
    ),
    playback: ref("playback"),
    experiment: ref("experiment"),
  }),
};
const analysisProperties = {
  song: ref("song"),
  userPerception: nullableText,
  overallVibe: object({
    hook: ref("expression"),
    emo: ref("expression"),
    hype: ref("expression"),
    pro: ref("expression"),
  }),
  modules: list(ref("module")),
  unknowns: list(text),
};
const deepDiveProperties = {
  analysisItemId: text,
  title: text,
  claims: list(ref("claim")),
  generalTheory: list(object({ concept: text, explanation: text })),
  conflicts: list(text),
  unknowns: list(text),
  listeningCues: list(
    object({
      text,
      claimIds: list(text),
      scope: choice(["recording", "general"]),
    }),
  ),
  studio: object({
    eligible: { type: "boolean" },
    potential,
    reason: text,
    seed: { anyOf: [{ type: "null" }, ref("seed")] },
  }),
};
function schema(title, properties) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    ...object(properties),
    $defs: definitions,
  };
}
export const contracts = {
  "studio-proposal": schema("MusicLearning2026 Studio proposal", {
    baseRevisionId: text,
    code: text,
    playback: ref("playback"),
    explanation: text,
  }),
  "evidence-review": schema("MusicLearning2026 source-specific review", {
    claims: list(
      object({
        claimId: text,
        verdict: choice(["supports", "insufficient", "conflicts"]),
        reason: text,
      }),
    ),
    expressions: object({
      hook: { type: "boolean" },
      emo: { type: "boolean" },
      hype: { type: "boolean" },
      pro: { type: "boolean" },
    }),
    identitySupported: { type: "boolean" },
    transcriptionSupported: { type: "boolean" },
  }),
  "research-plan": schema("MusicLearning2026 research plan", {
    song: ref("song"),
    questions: list(text),
    sources: list(ref("proposedSource")),
    unknowns: list(text),
  }),
  "analysis-draft": schema(
    "MusicLearning2026 analysis draft",
    analysisProperties,
  ),
  "song-analysis": schema("MusicLearning2026 SongAnalysis v1.1", {
    ...analysisProperties,
    sources: list(ref("source")),
  }),
  "deep-dive-draft": schema(
    "MusicLearning2026 deep dive draft",
    deepDiveProperties,
  ),
  "deep-dive": schema("MusicLearning2026 DeepDive v1.1", {
    ...deepDiveProperties,
    sources: list(ref("source")),
  }),
};
