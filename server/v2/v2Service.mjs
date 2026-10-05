import { AppError } from "../errors.mjs";
import { resolveProviderPlan, providerHealthSummary } from "../../music-learning/v2/providerRegistry.mjs";
import { createSongLibrary } from "./songLibrary.mjs";
import { createYouTubeAudioProvider } from "./youtubeAudioProvider.mjs";
import { createDashScopeAudioProvider } from "./dashscopeAudioProvider.mjs";
import { runProcess } from "./processRunner.mjs";

export function createV2Service({
  env = process.env,
  fetcher = fetch,
  runner = runProcess,
} = {}) {
  const providerPlan = resolveProviderPlan(env);
  const library = createSongLibrary({
    root: env.MUSIC_LIBRARY_DIR,
  });
  const youtube = createYouTubeAudioProvider({ env, runner });

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

  async function materialize(
    { song, selectedSourceId = null } = {},
    { signal, onProgress } = {},
  ) {
    const pkg = await library.ensureSongPackage(song);
    const candidates = await youtube.search(pkg.song, { signal, onProgress });
    if (!candidates.length) {
      throw new AppError(
        "没有找到可供确认的 YouTube 音源候选。",
        "V2_AUDIO_SOURCE_NOT_FOUND",
        404,
      );
    }

    let match = youtube.choose(pkg.song, candidates);
    let selected = match.selected;
    let decision = match.decision;
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
      durationSec: selected.durationSec,
    };
    const manifest = await library.commitMediaRevision(pkg.song.songId, media);
    return {
      status: "ready",
      songId: pkg.song.songId,
      song: pkg.song,
      media,
      manifest,
    };
  }

  async function listen(
    { songId } = {},
    { signal, onProgress } = {},
  ) {
    if (!songId) {
      throw new AppError("songId 不能为空。", "V2_INVALID_ID", 400);
    }
    const { manifest, media } = await library.getCurrentMedia(songId);
    onProgress?.({
      stage: "listening",
      label: "正在独立听这首歌",
    });
    const selection = providerPlan.listen;
    const provider = listenProvider(selection);
    const observation = await provider.listen({
      audioPath: media.analysisPath,
      song: manifest.song,
      mediaRevisionId: media.mediaRevisionId,
      model: selection.model,
      signal,
    });
    await library.saveObservation(songId, observation);
    return observation;
  }

  return Object.freeze({
    providerPlan: () => providerHealthSummary(providerPlan),
    materialize,
    listen,
    libraryRoot: library.root,
  });
}
