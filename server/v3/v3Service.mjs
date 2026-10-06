import fs from "node:fs/promises";
import { AppError, invariant } from "../errors.mjs";
import {
  createSongLibrary,
  deriveCatalogIdentityKey,
} from "../v2/songLibrary.mjs";
import { createYouTubeAudioProvider } from "../v2/youtubeAudioProvider.mjs";
import { createMusicAnalysisAgent } from "./musicAnalysisAgent.mjs";
import {
  STRUDEL_RUNTIME_VERSION,
  STRUDEL_SOUND_BANK,
} from "../../studio/runtimeConfig.mjs";
import { validateRuntimePlayback } from "../../studio/runtimePolicy.mjs";
import { createV3Preflight } from "./preflight.mjs";

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

function measuredBpm(artifact) {
  const candidate = artifact.measurements.find(
    (item) =>
      /(^|[_ -])(tempo|bpm)($|[_ -])/iu.test(item.kind) &&
      typeof item.value === "number" &&
      item.value >= 20 &&
      item.value <= 300 &&
      item.confidence >= 0.5,
  );
  return candidate ? Math.round(candidate.value) : 120;
}

function studioFromArtifact(artifact) {
  const experiment = artifact.creativeExperiment;
  if (!experiment.eligible) return null;
  const playback = {
    bpm: measuredBpm(artifact),
    beatsPerCycle: 4,
    soundBank: STRUDEL_SOUND_BANK,
    runtimeVersion: STRUDEL_RUNTIME_VERSION,
  };
  validateRuntimePlayback(playback);
  return {
    sourceType: "learning_reconstruction",
    analysisId: artifact.analysisId,
    sourceInterpretationIds: [...experiment.sourceInterpretationIds],
    code: experiment.code,
    alternativeCode: experiment.alternativeCode,
    visualHints: experiment.visualHints,
    playback,
    experiment: {
      question: experiment.mechanism,
      variable: experiment.variable,
      baseline: experiment.baseline,
      changed: experiment.changed,
      constants: experiment.constants,
      listenFor: experiment.listenFor,
      limitation: experiment.limitation,
    },
  };
}

export function createV3Service({
  env = process.env,
  runner,
} = {}) {
  const library = createSongLibrary({
    root: env.MUSIC_LIBRARY_DIR,
  });
  const youtube = createYouTubeAudioProvider({ env });
  const agent = createMusicAnalysisAgent({ env, ...(runner ? { runner } : {}) });
  const preflight = createV3Preflight({ env });

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
        const reusable =
          current.media.catalogIdentityKey === catalogIdentityKey &&
          Number.isFinite(current.media.durationSec) &&
          current.media.durationSec > 0 &&
          (await mediaFilesExist(current.media));

        if (reusable) {
          const acquisition = current.media.acquisition;
          const candidate = current.media.candidate || {
            sourceId: acquisition.sourceId,
            url: acquisition.sourceUrl,
            title: acquisition.sourceTitle,
            artistHint: null,
            albumHint: null,
            channel: acquisition.channel,
            durationSec: acquisition.durationSec,
            isOfficial: false,
            isTopic: false,
            isPublisher: false,
            matchScore: acquisition.matchScore,
            scoreParts: {
              title: 0,
              artist: 0,
              duration: null,
              albumVersion: null,
              authority: 0,
              variantPenalty: 0,
            },
          };

          if (!selectedSourceId) {
            return {
              status: "confirmation_required",
              reused: false,
              songId: pkg.song.songId,
              song: pkg.song,
              reason:
                current.media.identityWarning ||
                "发现本机已缓存音源。请先确认要分析的录音版本。",
              candidates: [candidate],
            };
          }

          if (
            acquisition.sourceId === selectedSourceId &&
            acquisition.requiresSanityCheck
          ) {
            current.media.acquisition.matchDecision = "manual_selected";
            current.media.acquisition.requiresSanityCheck = false;
            current.manifest = await library.commitMediaRevision(
              pkg.song.songId,
              current.media,
            );
          }

          if (
            current.media.acquisition.sourceId === selectedSourceId &&
            !current.media.acquisition.requiresSanityCheck
          ) {
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
        )
          throw error;
      }
    }

    let selected = null;
    let candidates = [];

    if (selectedSourceId) {
      selected = await youtube.resolveSelected(pkg.song, selectedSourceId, {
        signal,
        onProgress,
      });
    } else {
      candidates = await youtube.search(pkg.song, { signal, onProgress });
    }

    if (!selected) {
      const previews = candidates
        .filter((candidate) => candidate.scoreParts.title >= 0.35)
        .sort(
          (left, right) =>
            right.scoreParts.title - left.scoreParts.title ||
            right.matchScore - left.matchScore,
        )
        .slice(0, 5);
      onProgress?.({
        stage: "awaiting_source_confirmation",
        label: "音源预览已准备好，请选择一个版本",
      });
      return {
        status: "confirmation_required",
        reused: false,
        songId: pkg.song.songId,
        song: pkg.song,
        candidates: previews,
        reason: previews.length
          ? undefined
          : "没有找到足够接近的音源预览，请尝试另一个目录版本。",
      };
    }

    const revision = await library.allocateMediaRevision(pkg.song.songId);
    const acquired = await youtube.acquire(selected, {
      destinationDir: revision.dir,
      decision: "manual_selected",
      matchScore: selected.matchScore,
      requiresSanityCheck: false,
      signal,
      onProgress,
    });

    const media = {
      mediaRevisionId: revision.mediaRevisionId,
      createdAt: new Date().toISOString(),
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

    const durationMismatch =
      pkg.song.durationSec &&
      Math.abs(acquired.durationSec - pkg.song.durationSec) >
        Math.max(10, pkg.song.durationSec * 0.05);

    if (durationMismatch) {
      media.identityWarning =
        "所选目录时长为 " +
        Math.round(pkg.song.durationSec) +
        " 秒，本地音源实测为 " +
        Math.round(acquired.durationSec) +
        " 秒，请确认这是要分析的版本。";
      media.acquisition.requiresSanityCheck = true;
    }

    const manifest = await library.commitMediaRevision(
      pkg.song.songId,
      media,
    );

    if (media.acquisition.requiresSanityCheck) {
      return {
        status: "confirmation_required",
        reused: false,
        songId: pkg.song.songId,
        song: pkg.song,
        reason: media.identityWarning,
        candidates: [media.candidate],
      };
    }

    return {
      status: "ready",
      reused: false,
      songId: pkg.song.songId,
      song: pkg.song,
      media,
      manifest,
    };
  }

  async function analyze(
    {
      song,
      selectedSourceId = null,
      forceRematch = false,
    } = {},
    context = {},
  ) {
    const materialized = await materialize(
      { song, selectedSourceId, forceRematch },
      context,
    );
    if (materialized.status === "confirmation_required")
      return materialized;

    invariant(
      !materialized.media.acquisition.requiresSanityCheck,
      "请先确认音源版本后再开始分析。",
      "V3_AUDIO_SOURCE_CONFIRMATION_REQUIRED",
      409,
    );

    const result = await agent.analyze(
      {
        libraryRoot: library.root,
        song: materialized.song,
        media: materialized.media,
      },
      context,
    );

    context.onProgress?.({
      stage: "complete",
      label: "单 Agent 音乐分析完成",
    });

    return {
      status: "complete",
      songId: materialized.songId,
      materialization: {
        reused: Boolean(materialized.reused),
        mediaRevisionId: materialized.media.mediaRevisionId,
      },
      analysis: result.artifact,
      studio: studioFromArtifact(result.artifact),
    };
  }

  return Object.freeze({
    analyze,
    materialize,
    runner: agent.describe,
    health: preflight.health,
    libraryRoot: library.root,
  });
}
