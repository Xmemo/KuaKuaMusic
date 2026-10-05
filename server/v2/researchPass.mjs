import crypto from "node:crypto";
import { AppError, invariant } from "../errors.mjs";
import { validateContract } from "../schemaValidation.mjs";
import { createStructuredTextProvider } from "./textProvider.mjs";
import { createRegisteredWebResearchBackend } from "./registeredWebResearch.mjs";

const serialize = (value) => JSON.stringify(value, null, 2);

function evidenceIndex(sources) {
  return new Map(
    sources.flatMap((source) =>
      source.excerpts.map((excerpt) => [
        excerpt.id,
        { excerpt, source },
      ]),
    ),
  );
}

function synthesisPrompt(song, sources, discoveryUnknowns) {
  return [
    "You are the Research Pass synthesizer for MusicLearning2026 v2.",
    "You did NOT hear the audio. Do not claim you listened, measured BPM, identified chords by ear, or observed a timestamp.",
    "Use ONLY the registered source excerpts supplied below for song/work-specific findings.",
    "Return concise findings that are actually supported by their evidenceIds. Do not cite a source ID when an excerpt ID is required.",
    "Each finding must use one of: identity,culture,harmony,rhythm,timbre,arrangement,structure,production.",
    "scope=recording only when the excerpt clearly identifies the exact selected recording; otherwise use work or source_version.",
    "versionScope must match the registered source carrying the cited excerpt. Do not merge evidence from incompatible version scopes into one finding.",
    "If material is sparse, preserve that as unknown instead of filling gaps with genre knowledge.",
    "SUMMARY can describe what the registered material covers, but must not add new song facts.",
    "SONG:\n" + serialize(song),
    "REGISTERED SOURCES:\n" + serialize(sources),
    "DISCOVERY UNKNOWNS:\n" + serialize(discoveryUnknowns),
  ].join("\n\n");
}

export function createResearchPass({
  selection,
  backendName = "registered-web",
  env = process.env,
  fetcher = fetch,
  discovery,
} = {}) {
  const provider = createStructuredTextProvider(selection, { env, fetcher });
  const registered =
    discovery || createRegisteredWebResearchBackend();

  async function run(
    song,
    {
      existingSources = [],
      guidedByObservationIds = [],
      targetedQuestions = [],
      signal,
      onProgress,
    } = {},
  ) {
    if (backendName !== "registered-web" && backendName !== "codex-web") {
      throw new AppError(
        "Research backend '" +
          backendName +
          "' 尚未实现可登记来源的 v2 adapter。",
        "V2_RESEARCH_BACKEND_NOT_IMPLEMENTED",
        501,
      );
    }

    // First-pass independence is enforced structurally: no observation object is
    // accepted here. Targeted follow-up can carry only explicit IDs/questions.
    const discovered = await registered.discover(song, {
      existing: existingSources,
      targetedQuestions,
      signal,
      onProgress,
    });

    onProgress?.({
      stage: targetedQuestions.length ? "targeted_research" : "researching",
      label: "正在整理已登记的乐评与背景资料",
    });

    const draft = await provider.generateJson({
      schemaName: "v2-research-draft",
      prompt: synthesisPrompt(song, discovered.sources, discovered.unknowns),
      signal,
    });

    const evidence = evidenceIndex(discovered.sources);
    const findingIds = new Set();
    for (const finding of draft.findings) {
      invariant(
        finding.id.trim() && !findingIds.has(finding.id),
        "Research finding ID 缺失或重复。",
      );
      findingIds.add(finding.id);
      invariant(
        finding.evidenceIds.length > 0,
        "Research finding 必须引用已登记片段。",
      );
      const versions = new Set();
      for (const id of finding.evidenceIds) {
        const item = evidence.get(id);
        invariant(item, "Research finding 引用了不存在的片段。");
        invariant(
          item.excerpt.topics.includes(finding.topic),
          "Research finding 的 topic 不在引用片段支持范围内。",
        );
        versions.add(item.source.versionScope);
      }
      invariant(
        versions.size === 1 && versions.has(finding.versionScope),
        "Research finding 的版本范围与引用来源不一致。",
      );
    }

    const artifact = {
      schemaVersion: "2.0",
      researchRunId: crypto.randomUUID(),
      songId: song.songId,
      createdAt: new Date().toISOString(),
      provider: {
        name: selection.provider,
        model: selection.model,
      },
      backend: backendName,
      guidedByObservationIds: [...guidedByObservationIds],
      sourceIds: discovered.sources.map((source) => source.id),
      summary: draft.summary,
      findings: draft.findings,
      unknowns: [...new Set([...draft.unknowns, ...discovered.unknowns])],
    };

    return {
      artifact: validateContract("v2-research-artifact", artifact),
      sources: discovered.sources,
    };
  }

  return Object.freeze({ run });
}
