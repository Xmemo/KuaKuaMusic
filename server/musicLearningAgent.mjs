import { schemaPath, runCodexStructured } from "./codexBridge.mjs";
import { persistAnalysis, persistDeepDive } from "./evidenceStore.mjs";
import {
  validateSongAnalysisIntegrity,
  validateDeepDiveIntegrity,
} from "./evidenceValidation.mjs";

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object.");
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " is required.");
  }
  return value.trim();
}

function boundedText(value, max = 2000) {
  if (value == null) return null;
  return String(value).trim().slice(0, max) || null;
}

function serializeData(value) {
  return JSON.stringify(value, null, 2);
}

export async function analyzeSongWithAgent(input) {
  const payload = requireObject(input, "request body");
  const songInput = requireObject(payload.song, "song");

  const song = {
    title: requireText(songInput.title, "song.title").slice(0, 300),
    artist: requireText(songInput.artist, "song.artist").slice(0, 300),
    album: boundedText(songInput.album, 300),
    releaseYear: boundedText(songInput.releaseYear, 40),
    trackUrl: boundedText(songInput.trackUrl, 1000),
    platform: boundedText(songInput.platform, 80),
  };
  const userPerception = boundedText(payload.userPerception, 1200);

  const prompt = [
    "You are the MusicLearning2026 analysis Agent.",
    "",
    "Research the exact recording below and return ONLY JSON that conforms to the provided schema.",
    "Use the project AGENTS.md rules as mandatory policy.",
    "",
    "REQUIRED WORKFLOW:",
    "1. Resolve recording/work/release identity and version scope. Use the configured MusicBrainz MCP when relevant.",
    "2. Search and read web sources for song-specific claims MusicBrainz cannot support.",
    "3. Build claims from evidence. Do not start from a desired claim and hunt for a convenient citation.",
    "4. Never claim you listened to, measured, or decoded the audio. V1 has no audio input.",
    "5. Overall 走心/上头/懂行 are three phrasings of the same supported evidence set.",
    "6. Structured modules have ONE evidence-oriented style. Omit empty/unsupported modules.",
    "7. Every supported song-specific claim must map to source IDs that actually support it.",
    "8. Put unresolved facts in unknowns instead of guessing.",
    "9. Do not emit machine_observation in V1 because no audio-analysis engine is connected.",
    "",
    "SELECTED CATALOG CANDIDATE (input data, not verified evidence):",
    serializeData(song),
    "",
    "USER PERCEPTION / QUESTION (subjective input, not objective evidence):",
    userPerception ? serializeData(userPerception) : "null",
    "",
    "Keep the answer useful and concise enough for a music-learning UI.",
  ].join("\n");

  const analysis = await runCodexStructured({
    prompt,
    outputSchema: schemaPath("schemas/song-analysis.schema.json"),
  });

  validateSongAnalysisIntegrity(analysis);
  await persistAnalysis(analysis);
  return analysis;
}

export async function deepDiveWithAgent(input) {
  const payload = requireObject(input, "request body");
  const analysis = requireObject(payload.analysis, "analysis");
  const analysisItemId = requireText(payload.analysisItemId, "analysisItemId").slice(0, 200);
  const question = boundedText(payload.question, 1200);

  validateSongAnalysisIntegrity(analysis);

  const items = Array.isArray(analysis.modules) ? analysis.modules : [];
  const selectedItem = items.find((item) => item && item.id === analysisItemId);
  if (!selectedItem) {
    throw new Error("The selected analysis item was not found in the supplied analysis.");
  }

  const prompt = [
    "You are the MusicLearning2026 deep-dive Agent.",
    "",
    "Research ONE selected analysis item more deeply and return ONLY JSON that conforms to the provided schema.",
    "Use the project AGENTS.md rules as mandatory policy.",
    "",
    "A deep dive must add evidence or explanatory depth; do not merely rewrite the existing summary at greater length.",
    "Re-read the mapped sources when possible and perform targeted second-pass research when needed.",
    "Keep confirmed source facts, AI interpretation, and general theory separate.",
    "Return every second-pass source needed by this deep dive in the top-level sources array.",
    "The top-level sources array may include newly discovered sources and/or copies of reused sources from the current analysis.",
    "Every confirmed song-specific statement must have sourceIds resolvable from either the current analysis sources or the returned deep-dive sources.",
    "If a Studio experiment is useful, produce a small Strudel seed.",
    "Default its sourceType to learning_reconstruction unless a matching score/chord/transcription source supports the actual pattern.",
    "The seed should isolate the mechanism being taught and may include native visual hints such as _pianoroll, _punchcard, _spiral, _scope, _spectrum, or _pitchwheel.",
    "Do not claim the seed reproduces the original recording unless the evidence supports that.",
    "",
    "CURRENT VERIFIED ANALYSIS:",
    serializeData(analysis),
    "",
    "SELECTED ANALYSIS ITEM:",
    serializeData(selectedItem),
    "",
    "OPTIONAL USER FOLLOW-UP:",
    question ? serializeData(question) : "null",
  ].join("\n");

  const deepDive = await runCodexStructured({
    prompt,
    outputSchema: schemaPath("schemas/deep-dive.schema.json"),
  });

  validateDeepDiveIntegrity(deepDive, analysis, analysisItemId);
  await persistDeepDive(analysis, deepDive);
  return deepDive;
}
