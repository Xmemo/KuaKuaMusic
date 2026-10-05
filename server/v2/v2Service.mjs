import fs from "node:fs/promises";
import { AppError, invariant } from "../errors.mjs";
import {
  resolveProviderPlan,
  providerHealthSummary,
} from "../../music-learning/v2/providerRegistry.mjs";
import { createSongLibrary, deriveCatalogIdentityKey } from "./songLibrary.mjs";
import { createYouTubeAudioProvider } from "./youtubeAudioProvider.mjs";
import {
  createDashScopeAudioProvider,
  DASHSCOPE_LISTEN_PROMPT_VERSION,
} from "./dashscopeAudioProvider.mjs";
import { runProcess } from "./processRunner.mjs";
import { createResearchPass, RESEARCH_PROMPT_VERSION } from "./researchPass.mjs";
import { validateMusicObservation } from "./observationValidation.mjs";
import { createCriticPass } from "./criticPass.mjs";
import { createCreativePass } from "./creativePass.mjs";
import { creativeBlueprintToStrudelPlan } from "./creativeStrudelBridge.mjs";
import { createStrudelSeedPass } from "./strudelSeedPass.mjs";
import { getAgentHealth } from "../agentHealth.mjs";
import { createV2Preflight } from "./preflight.mjs";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function warningFrom(error, stage) {
  return {
    stage,
    code: error instanceof AppError ? error.code : "V2_STAGE_FAILED",
    message:
      error instanceof AppError
        ? error.message
        : stage + " 阶段未能完成。",
  };
}

export function createV2Service({
  env = process.env,
  fetcher = fetch,
  runner = runProcess,
  agentHealth = getAgentHealth,
} = {}) {
  const providerPlan = resolveProviderPlan(env);
  const health = createV2Preflight({ env, plan: providerPlan, runner, agentHealth });
  const library = createSongLibrary({
    root: env.MUSIC_LIBRARY_DIR,
  });
  const youtube = createYouTubeAudioProvider({ env, runner });
  const researchPass = createResearchPass({
    selection: providerPlan.research,
    backendName: providerPlan.research.backend,
    env,
    fetcher,
  });
  const criticPass = createCriticPass({
    selection: providerPlan.critic,
    env,
    fetcher,
  });
  const creativePass = createCreativePass({
    selection: providerPlan.creative,
    env,
    fetcher,
  });
  const strudelSeedPass = createStrudelSeedPass({
    selection: providerPlan.creative,
    env,
    fetcher,
  });
  const researchCacheMs =
    positiveNumber(env.MUSIC_RESEARCH_CACHE_TTL_HOURS, 168) *
    60 *
    60 *
    1000;

  function listenProvider(selection) {
    if (selection.provider === "dashscope") {
      return createDashScopeAudioProvider({ env, fetcher });
    }
    throw new AppError(
      "Listen Provider '" +
        selection.provider +
        "' 已在架构中注册，但当前 adapter 尚未实现。",
      "V2_PROVIDER_NOT_IMPLEMENTED",
      501,
    );
  }

  function listenPromptVersion(selection) {
    if (selection.provider === "dashscope")
      return DASHSCOPE_LISTEN_PROMPT_VERSION;
    return null;
  }

  async function mediaFilesExist(media) {
    try {
      await Promise.all([
        fs.access(media.sourcePath),
        fs.access(media.analysisPath),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function materialize(
    {
      song,
      selectedSourceId = null,
      forceRematch = false,
    } = {},
    { signal, onProgress } = {},
  ) {
    const pkg = await library.ensureSongPackage(song);
    const catalogIdentityKey = deriveCatalogIdentityKey(pkg.song);

    if (
      (!forceRematch || selectedSourceId) &&
      pkg.manifest.currentMediaRevisionId
    ) {
      try {
        const current = await library.getCurrentMedia(pkg.song.songId);
        if (current.media.catalogIdentityKey === catalogIdentityKey &&
          Number.isFinite(current.media.durationSec) && current.media.durationSec > 0 &&
          await mediaFilesExist(current.media)) {
          if (selectedSourceId && current.media.acquisition.requiresSanityCheck &&
            current.media.acquisition.sourceId === selectedSourceId) {
            current.media.acquisition.matchDecision = "manual_selected";
            current.media.acquisition.requiresSanityCheck = false;
            current.manifest = await library.commitMediaRevision(pkg.song.songId, current.media);
          } else if (!selectedSourceId && current.media.acquisition.requiresSanityCheck) {
            return { status: "confirmation_required", reused: false, songId: pkg.song.songId, song: pkg.song,
              reason: current.media.identityWarning, candidates: [current.media.candidate] };
          }
          if (!current.media.acquisition.requiresSanityCheck &&
            (!selectedSourceId || current.media.acquisition.sourceId === selectedSourceId)) {
            onProgress?.({
              stage: "acquiring_audio",
              label: "已找到本地歌曲音频，直接复用",
            });
            return {
              status: "ready",
              reused: true,
              songId: pkg.song.songId,
              song: pkg.song,
              media: current.media,
              manifest: current.manifest,
            };
          }
        }
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code !== "V2_AUDIO_NOT_READY"
        ) throw error;
      }
    }

    const candidates = await youtube.search(pkg.song, { signal, onProgress });
    if (!candidates.length) {
      throw new AppError(
        "没有找到可供确认的 YouTube 音源候选。",
        "V2_AUDIO_SOURCE_NOT_FOUND",
        404,
      );
    }

    const match = youtube.choose(pkg.song, candidates);
    let selected = forceRematch && !selectedSourceId ? null : match.selected;
    let decision = forceRematch && !selectedSourceId ? "manual_required" : match.decision;
    let requiresSanityCheck = match.requiresSanityCheck;

    if (selectedSourceId) {
      selected =
        match.candidates.find(
          (candidate) => candidate.sourceId === selectedSourceId,
        ) ||
        candidates.find(
          (candidate) => candidate.sourceId === selectedSourceId,
        ) ||
        null;
      if (!selected) {
        throw new AppError(
          "所选音源已不在当前 YouTube 候选中，请重新选择。",
          "V2_AUDIO_SOURCE_STALE",
          409,
        );
      }
      if (selected.matchScore == null) {
        selected = youtube.choose(pkg.song, [selected]).candidates[0];
      }
      decision = "manual_selected";
      requiresSanityCheck = false;
    }

    if (!selected) {
      onProgress?.({
        stage: "awaiting_source_confirmation",
        label: "找到了多个可能版本，需要确认音源",
      });
      return {
        status: "confirmation_required",
        reused: false,
        songId: pkg.song.songId,
        song: pkg.song,
        candidates: match.candidates,
      };
    }

    const revision = await library.allocateMediaRevision(pkg.song.songId);
    const acquired = await youtube.acquire(selected, {
      destinationDir: revision.dir,
      decision,
      matchScore: selected.matchScore,
      requiresSanityCheck,
      signal,
      onProgress,
    });
    const createdAt = new Date().toISOString();
    const media = {
      mediaRevisionId: revision.mediaRevisionId,
      createdAt,
      acquisition: {
        ...acquired.acquisition,
        sha256: acquired.sha256,
      },
      sourcePath: acquired.sourcePath,
      analysisPath: acquired.analysisPath,
      analysisMimeType: acquired.analysisMimeType,
      durationSec: acquired.durationSec,
      catalogIdentityKey,
      catalogSong: pkg.song,
      candidate: { ...selected, durationSec: acquired.durationSec },
    };
    const durationMismatch = pkg.song.durationSec && Math.abs(acquired.durationSec - pkg.song.durationSec) >
      Math.max(10, pkg.song.durationSec * 0.05);
    if (durationMismatch) {
      media.identityWarning = "所选目录时长为 " + Math.round(pkg.song.durationSec) + " 秒，本地音源实测为 " +
        Math.round(acquired.durationSec) + " 秒，请确认这是要分析的版本。";
      if (decision !== "manual_selected") media.acquisition.requiresSanityCheck = true;
    }
    const manifest = await library.commitMediaRevision(
      pkg.song.songId,
      media,
    );
    if (media.acquisition.requiresSanityCheck) return {
      status: "confirmation_required", reused: false, songId: pkg.song.songId, song: pkg.song,
      reason: media.identityWarning, candidates: [media.candidate],
    };
    return {
      status: "ready",
      reused: false,
      songId: pkg.song.songId,
      song: pkg.song,
      media,
      manifest,
    };
  }

  async function listen(
    { songId, force = false } = {},
    { signal, onProgress, onCacheHit } = {},
  ) {
    if (!songId) {
      throw new AppError("songId 不能为空。", "V2_INVALID_ID", 400);
    }
    const { manifest, media } = await library.getCurrentMedia(songId);
    invariant(!media.acquisition.requiresSanityCheck, "请先确认音源版本后再调用 Listen。", "V2_AUDIO_SOURCE_CONFIRMATION_REQUIRED", 409);
    invariant(media.catalogIdentityKey === deriveCatalogIdentityKey(manifest.song),
      "当前音源与所选目录版本不一致，请重新匹配音源。", "V2_AUDIO_VERSION_MISMATCH", 409);
    const selection = providerPlan.listen;
    const promptVersion = listenPromptVersion(selection);

    if (!force && promptVersion) {
      const cached = await library.findReusableObservation(songId, {
        mediaRevisionId: media.mediaRevisionId,
        provider: selection.provider,
        model: selection.model,
        promptVersion,
      });
      if (cached) {
        validateMusicObservation(cached, { durationSec: media.durationSec });
        onCacheHit?.();
        onProgress?.({
          stage: "listening",
          label: "已找到同一音频与模型的 Listen 记录，直接复用",
        });
        return cached;
      }
    }

    onProgress?.({
      stage: "listening",
      label: "正在独立听这首歌",
    });
    const provider = listenProvider(selection);
    const observation = await provider.listen({
      audioPath: media.analysisPath,
      song: media.catalogSong || manifest.song,
      mediaRevisionId: media.mediaRevisionId,
      durationSec: media.durationSec,
      model: selection.model,
      signal,
    });
    await library.saveObservation(songId, observation);
    return observation;
  }

  async function research(
    { songId, force = false } = {},
    { signal, onProgress } = {},
  ) {
    if (!songId) {
      throw new AppError("songId 不能为空。", "V2_INVALID_ID", 400);
    }
    const manifest = await library.loadManifest(songId);
    const selection = providerPlan.research;

    if (!force && researchCacheMs > 0) {
      const cached = await library.findReusableResearch(songId, {
        provider: selection.provider,
        model: selection.model,
        backend: selection.backend,
        maxAgeMs: researchCacheMs,
        catalogIdentityKey: deriveCatalogIdentityKey(manifest.song),
        promptVersion: RESEARCH_PROMPT_VERSION,
      });
      if (cached) {
        onProgress?.({
          stage: "researching",
          label: "已找到近期 Research 记录，直接复用",
        });
        return {
          ...cached,
          reused: true,
        };
      }
    }

    const result = await researchPass.run(manifest.song, {
      signal,
      onProgress,
    });
    await library.saveResearch(songId, result.artifact, result.sources, {
      catalogIdentityKey: deriveCatalogIdentityKey(manifest.song), promptVersion: RESEARCH_PROMPT_VERSION,
    });
    return { ...result, reused: false };
  }

  async function optionalArtifact(loader) {
    try {
      return await loader();
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "V2_ARTIFACT_NOT_READY"
      ) return null;
      throw error;
    }
  }

  async function critic(
    {
      songId,
      listenRunId = undefined,
      researchRunId = undefined,
    } = {},
    { signal, onProgress } = {},
  ) {
    if (!songId) {
      throw new AppError("songId 不能为空。", "V2_INVALID_ID", 400);
    }
    const manifest = await library.loadManifest(songId);
    const observation =
      listenRunId === null
        ? null
        : await optionalArtifact(() =>
            library.loadObservation(songId, listenRunId || null),
          );
    const researchRecord =
      researchRunId === null
        ? null
        : await optionalArtifact(() =>
            library.loadResearch(songId, researchRunId || null),
          );
    if (observation) invariant(observation.mediaRevisionId === manifest.currentMediaRevisionId,
      "Critic 的 Listen 记录不属于当前音源版本。", "V2_AUDIO_VERSION_MISMATCH", 409);
    if (researchRecord) invariant(researchRecord.catalogIdentityKey === deriveCatalogIdentityKey(manifest.song),
      "Critic 的 Research 记录不属于当前所选目录版本。", "V2_RESEARCH_VERSION_MISMATCH", 409);
    const analysis = await criticPass.run(manifest.song, {
      observation,
      research: researchRecord?.artifact || null,
      sources: researchRecord?.sources || [],
      signal,
      onProgress,
    });
    await library.saveAnalysis(songId, analysis);
    return {
      analysis,
      observation,
      research: researchRecord?.artifact || null,
      sources: researchRecord?.sources || [],
    };
  }

  async function creative(
    { songId, analysisId = null, listenRunId = null } = {},
    { signal, onProgress } = {},
  ) {
    if (!songId) {
      throw new AppError("songId 不能为空。", "V2_INVALID_ID", 400);
    }
    const manifest = await library.loadManifest(songId);
    const analysis = await library.loadAnalysis(songId, analysisId);
    const resolvedListenRunId = listenRunId || analysis.listenRunId;
    if (!resolvedListenRunId) {
      throw new AppError(
        "Creative Blueprint 需要 Audio Observation；本轮只有 Research，已跳过 Studio。",
        "V2_AUDIO_OBSERVATION_REQUIRED",
        409,
      );
    }
    const observation = await library.loadObservation(
      songId,
      resolvedListenRunId,
    );
    invariant(analysis.listenRunId === resolvedListenRunId,
      "Creative 的观察必须属于所选分析快照。", "V2_AUDIO_VERSION_MISMATCH", 409);
    const { media } = await library.getCurrentMedia(songId);
    invariant(observation.mediaRevisionId === media.mediaRevisionId &&
      media.catalogIdentityKey === deriveCatalogIdentityKey(manifest.song),
      "所选分析快照与当前目录或音源版本不一致，请先重新分析当前版本。", "V2_AUDIO_VERSION_MISMATCH", 409);
    const blueprint = await creativePass.run(manifest.song, {
      observation,
      analysis,
      signal,
      onProgress,
    });
    await library.saveBlueprint(songId, blueprint);
    const strudelPlan = creativeBlueprintToStrudelPlan(blueprint);
    const studioSeed = await strudelSeedPass.run(
      {
        song: manifest.song,
        observation,
        analysis,
        blueprint,
        plan: strudelPlan,
      },
      { signal, onProgress },
    );
    if (studioSeed) await library.saveStudioSeed(songId, studioSeed);
    return {
      blueprint,
      strudelPlan,
      studioSeed,
    };
  }

  async function analyze(
    {
      song,
      selectedSourceId = null,
      forceRematch = false,
      forceListen = false,
      forceResearch = false,
    } = {},
    { signal, onProgress } = {},
  ) {
    const materialized = await materialize(
      { song, selectedSourceId, forceRematch },
      { signal, onProgress },
    );
    if (materialized.status === "confirmation_required") {
      return materialized;
    }

    const songId = materialized.songId;
    let listenReused = false;
    const [listenResult, researchResult] = await Promise.allSettled([
      listen(
        { songId, force: forceListen },
        { signal, onProgress, onCacheHit: () => { listenReused = true; } },
      ),
      research(
        { songId, force: forceResearch },
        { signal, onProgress },
      ),
    ]);
    signal?.throwIfAborted();

    const observation =
      listenResult.status === "fulfilled" ? listenResult.value : null;
    const researchRecord =
      researchResult.status === "fulfilled" ? researchResult.value : null;
    const warnings = [];
    if (listenResult.status === "rejected")
      warnings.push(warningFrom(listenResult.reason, "listen"));
    if (researchResult.status === "rejected")
      warnings.push(warningFrom(researchResult.reason, "research"));

    if (!observation && !researchRecord) {
      throw new AppError(
        "Listen 与 Research 都未能完成。" + warnings.map((item) => item.stage + "：" + item.message).join("；"),
        "V2_PRIMARY_PASSES_FAILED",
        502,
      );
    }

    const criticResult = await critic(
      {
        songId,
        listenRunId: observation?.listenRunId ?? null,
        researchRunId: researchRecord?.artifact?.researchRunId ?? null,
      },
      { signal, onProgress },
    );

    let creativeResult = null;
    if (observation) {
      try {
        creativeResult = await creative(
          {
            songId,
            analysisId: criticResult.analysis.analysisId,
            listenRunId: observation.listenRunId,
          },
          { signal, onProgress },
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        warnings.push(warningFrom(error, "creative"));
      }
    }

    onProgress?.({
      stage: "complete",
      label: warnings.length ? "分析完成，部分辅助阶段降级" : "分析完成",
    });

    return {
      status: warnings.length ? "partial" : "complete",
      songId,
      materialization: {
        reused: Boolean(materialized.reused),
        mediaRevisionId: materialized.media.mediaRevisionId,
        source: {
          sourceId: materialized.media.acquisition.sourceId,
          url: materialized.media.acquisition.sourceUrl,
          title: materialized.media.acquisition.sourceTitle,
          channel: materialized.media.acquisition.channel,
          durationSec: materialized.media.durationSec,
          matchScore: materialized.media.acquisition.matchScore,
          decision: materialized.media.acquisition.matchDecision,
        },
        identityWarning: materialized.media.identityWarning || null,
      },
      cache: { audio: Boolean(materialized.reused), listen: listenReused, research: Boolean(researchRecord?.reused) },
      observation,
      research: researchRecord?.artifact || null,
      sources: researchRecord?.sources || [],
      analysis: criticResult.analysis,
      creative: creativeResult,
      warnings,
    };
  }

  return Object.freeze({
    providerPlan: () => providerHealthSummary(providerPlan),
    health,
    materialize,
    listen,
    research,
    critic,
    creative,
    analyze,
    libraryRoot: library.root,
  });
}
