import { registerSources } from "../sourceRegistry.mjs";
import { AppError } from "../errors.mjs";
import { createStructuredTextProvider } from "./textProvider.mjs";

const serialize = (value) => JSON.stringify(value, null, 2);

function researchIdentity(song) {
  return {
    title: song.title,
    artist: song.artist,
    album: song.album,
    releaseYear: song.releaseYear,
    versionScope: "selected catalog item: " + song.title + " — " + song.artist,
    identityStatus: "unresolved",
    candidates: [],
    musicBrainzRecordingId: null,
    musicBrainzWorkId: null,
    musicBrainzReleaseId: null,
  };
}

function discoveryPrompt(song, { targetedQuestions = [] } = {}) {
  return [
    "You are the web discovery backend for MusicLearning2026 v2.",
    "This pass has NO access to the audio observation. Its job is to independently find reliable public material about the selected song/work.",
    "Use the Qwen provider's built-in live web search. Do not use another model, tools, shell commands, personal files, or authenticated sources.",
    "Prefer official credits, creator/producer interviews, reputable music criticism, production breakdowns, and accessible score/transcription material.",
    "Search for song-specific or clearly work-specific material. General genre definitions are not a substitute for sources about this work.",
    "At most 3 web searches and 5 source-page reads. Return at most 5 source proposals.",
    "Every proposed excerpt must be a short contiguous passage actually seen on the source page, 12–600 characters, with a useful locator. The server will independently re-read the public page and reject excerpts it cannot verify.",
    "Search snippets, inaccessible paywalls and PDFs the server cannot read are not evidence. Find an accessible alternative or leave it unknown.",
    "Use topics only from identity,culture,harmony,rhythm,timbre,arrangement,structure,production.",
    "Use versionScope to state what the source actually discusses. Do not pretend the selected streaming/catalog result is an exact master if that is not established.",
    targetedQuestions.length
      ? "This is targeted follow-up research. Only investigate these questions: " +
        serialize(targetedQuestions)
      : "This is the independent first research pass. Cover the most useful cultural/background and musical/production evidence without seeing any Listen result.",
    "The research-plan song object should preserve this selected catalog identity and may remain unresolved at recording level:",
    serialize(researchIdentity(song)),
  ].join("\n");
}

export function createRegisteredWebResearchBackend({
  selection = { provider: "dashscope", model: "qwen3.8-omni-flash" },
  env = process.env,
  fetcher = fetch,
  register = registerSources,
} = {}) {
  if (selection.provider !== "dashscope") {
    throw new AppError(
      "registered-web 的原生联网搜索要求 DashScope Research Provider。",
      "V2_WEB_SEARCH_PROVIDER_MISMATCH",
      400,
    );
  }
  const provider = createStructuredTextProvider(selection, { env, fetcher });

  async function discover(
    song,
    {
      existing = [],
      signal,
      targetedQuestions = [],
      onProgress,
    } = {},
  ) {
    onProgress?.({
      stage: targetedQuestions.length ? "targeted_research" : "researching",
      label: targetedQuestions.length
        ? "正在针对关键听觉发现补查资料"
        : "正在独立查找乐评与背景资料",
    });

    const plan = await provider.generateJson({
      schemaName: "research-plan",
      prompt: discoveryPrompt(song, { targetedQuestions }),
      signal,
      webSearch: true,
    });

    const existingUrls = new Set(existing.map((source) => source.url));
    const proposals = (plan.sources || [])
      .filter((source) => !existingUrls.has(source.url))
      .slice(0, Math.max(0, Math.min(5, 10 - existing.length)));

    const registry = await register(proposals, {
      existing,
      signal,
    });

    if (signal?.aborted) {
      throw new AppError("请求已取消。", "CANCELLED", 499);
    }

    return {
      sources: registry.sources.slice(0, 10),
      unknowns: [
        ...(plan.unknowns || []),
        ...(registry.unknowns || []),
      ],
    };
  }

  return Object.freeze({ discover });
}
