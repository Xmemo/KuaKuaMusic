import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "../errors.mjs";
import {
  createSongLibrary,
  deriveCatalogIdentityKey,
} from "../v2/songLibrary.mjs";
import { createYouTubeAudioProvider } from "../v2/youtubeAudioProvider.mjs";

function clean(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function slug(value) {
  return (
    clean(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 56) || "track"
  );
}

function assertRunId(value) {
  const id = String(value || "");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,220}$/u.test(id))
    throw new AppError("v4 run ID 无效。", "V4_RUN_ID_INVALID", 400);
  return id;
}

function assertInterpretationId(value) {
  const id = String(value || "");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,220}$/u.test(id))
    throw new AppError(
      "分析点 ID 无效。",
      "V4_INTERPRETATION_ID_INVALID",
      400,
    );
  return id;
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

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

async function readJsonOptional(file) {
  try {
    return {
      state: "ready",
      value: JSON.parse(await fs.readFile(file, "utf8")),
      error: null,
    };
  } catch (error) {
    if (error?.code === "ENOENT")
      return { state: "missing", value: null, error: null };
    if (error instanceof SyntaxError)
      return {
        state: "writing",
        value: null,
        error: "JSON 正在写入或暂时不完整。",
      };
    throw error;
  }
}

function candidateFromMedia(media) {
  const acquisition = media.acquisition || {};
  return (
    media.candidate || {
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
    }
  );
}

function requestPayload({
  kind,
  runId,
  interpretationId = null,
  now,
}) {
  const timestamp = now().toISOString();
  return {
    schemaVersion: "4.0",
    requestId: crypto.randomUUID(),
    kind,
    runId,
    status: "queued",
    interpretationId,
    queuedAt: timestamp,
    createdAt: timestamp,
    claimedAt: null,
    claimedBySessionId: null,
    completedAt: null,
    error: null,
  };
}

function sessionView(record, currentTime = Date.now()) {
  if (!record) {
    return {
      status: "offline",
      online: false,
      sessionId: null,
      startedAt: null,
      updatedAt: null,
      activeRequestId: null,
      activeRunId: null,
      activeKind: null,
      lastError: null,
    };
  }

  const updatedMs = Date.parse(record.updatedAt || "");
  const ageMs = Number.isFinite(updatedMs) ? currentTime - updatedMs : Infinity;
  const freshWindowMs =
    record.status === "waiting"
      ? 15_000
      : record.status === "processing"
        ? 30 * 60_000
        : 0;
  const online =
    ["waiting", "processing"].includes(record.status) &&
    ageMs >= 0 &&
    ageMs <= freshWindowMs;

  return {
    status: online
      ? record.status
      : record.status === "stopped"
        ? "stopped"
        : "offline",
    online,
    sessionId: record.sessionId || null,
    startedAt: record.startedAt || null,
    updatedAt: record.updatedAt || null,
    activeRequestId: record.activeRequestId || null,
    activeRunId: record.activeRunId || null,
    activeKind: record.activeKind || null,
    lastError: record.lastError || null,
  };
}

async function createRun({
  runsRoot,
  song,
  media,
  now = () => new Date(),
}) {
  const time = now()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        song.songId,
        media.mediaRevisionId,
        media.acquisition?.sha256 || "",
        time,
        crypto.randomUUID(),
      ]),
    )
    .digest("hex")
    .slice(0, 8);
  const runId =
    slug(song.artist).slice(0, 28) +
    "--" +
    slug(song.title).slice(0, 38) +
    "--" +
    time +
    "--" +
    hash;
  const runDir = path.join(runsRoot, runId);
  await fs.mkdir(runDir, { recursive: false });
  const audioPath = path.join(runDir, "input.mp3");
  await fs.copyFile(media.analysisPath, audioPath);

  const task = {
    schemaVersion: "4.0",
    runId,
    createdAt: now().toISOString(),
    requestedBy: "kua-browser-session",
    identity: {
      songId: song.songId,
      title: song.title,
      artist: song.artist,
      album: song.album || null,
      year: song.releaseYear || null,
      platform: song.sourcePlatform || song.platform || null,
      trackUrl: song.sourceTrackUrl || song.trackUrl || null,
    },
    recording: {
      mediaRevisionId: media.mediaRevisionId,
      audioPath,
      durationSec: media.durationSec,
      acquisition: {
        provider: media.acquisition?.provider || null,
        sourceId: media.acquisition?.sourceId || null,
        sourceUrl: media.acquisition?.sourceUrl || null,
        sourceTitle: media.acquisition?.sourceTitle || null,
        channel: media.acquisition?.channel || null,
        matchScore: media.acquisition?.matchScore ?? null,
        sha256: media.acquisition?.sha256 || null,
      },
    },
    artifacts: {
      dsp: path.join(runDir, "dsp.json"),
      listen: path.join(runDir, "listen.json"),
      research: path.join(runDir, "research.json"),
      analysis: path.join(runDir, "analysis.json"),
      studio: path.join(runDir, "studio.json"),
    },
  };
  await writeJsonAtomic(path.join(runDir, "task.json"), task);

  const request = requestPayload({
    kind: "analysis",
    runId,
    now,
  });
  await writeJsonAtomic(path.join(runDir, "browser-request.json"), request);

  return {
    runId,
    runDir,
    audioPath,
    task,
    request,
  };
}

export function createV4BridgeService({
  env = process.env,
  library = createSongLibrary({ root: env.MUSIC_LIBRARY_DIR }),
  youtube = createYouTubeAudioProvider({ env }),
  runsRoot = path.resolve(
    env.MUSIC_V4_RUNS_DIR || path.join(".music-learning", "runs"),
  ),
  sessionRoot = path.resolve(
    env.MUSIC_V4_SESSION_DIR || path.join(".music-learning", "session"),
  ),
  now = () => new Date(),
} = {}) {
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
          const candidate = candidateFromMedia(current.media);

          if (!selectedSourceId) {
            return {
              status: "confirmation_required",
              reused: false,
              songId: pkg.song.songId,
              song: pkg.song,
              reason:
                current.media.identityWarning ||
                "发现本机已缓存音源。请确认要继续分析这个录音版本。",
              candidates: [candidate],
            };
          }

          if (
            current.media.acquisition.sourceId === selectedSourceId &&
            current.media.acquisition.requiresSanityCheck
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
              label: "已复用本机缓存录音",
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
        label: "音源预览已准备好，请确认录音版本",
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
        "目录曲目时长为 " +
        Math.round(pkg.song.durationSec) +
        " 秒，本地录音实测为 " +
        Math.round(acquired.durationSec) +
        " 秒。请再次确认这是要分析的版本。";
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

  async function sessionStatus() {
    const record = await readJsonOptional(
      path.join(sessionRoot, "orchestrator.json"),
    );
    return sessionView(record.value, now().getTime());
  }

  async function prepare(body = {}, context = {}) {
    const materialized = await materialize(body, context);
    if (materialized.status === "confirmation_required")
      return materialized;

    await fs.mkdir(runsRoot, { recursive: true });
    const run = await createRun({
      runsRoot,
      song: materialized.song,
      media: materialized.media,
      now,
    });
    context.onProgress?.({
      stage: "request_queued",
      label: "录音已准备好，分析任务已进入 Gemini 队列",
    });
    return {
      status: "run_queued",
      reused: Boolean(materialized.reused),
      songId: materialized.songId,
      song: materialized.song,
      materialization: {
        mediaRevisionId: materialized.media.mediaRevisionId,
        durationSec: materialized.media.durationSec,
      },
      runId: run.runId,
      runDir: run.runDir,
      requestId: run.request.requestId,
      session: await sessionStatus(),
    };
  }

  async function status(runIdInput) {
    const runId = assertRunId(runIdInput);
    const runDir = path.join(runsRoot, runId);
    if (!runDir.startsWith(runsRoot + path.sep))
      throw new AppError("v4 run 路径无效。", "V4_RUN_PATH_INVALID", 400);

    let task;
    try {
      task = JSON.parse(await fs.readFile(path.join(runDir, "task.json"), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT")
        throw new AppError("找不到这个 v4 run。", "V4_RUN_NOT_FOUND", 404);
      throw error;
    }

    const entries = await Promise.all(
      ["dsp", "listen", "research", "analysis", "studio"].map(async (kind) => {
        const record = await readJsonOptional(path.join(runDir, kind + ".json"));
        return [kind, record];
      }),
    );
    const artifacts = Object.fromEntries(entries);
    const summary = Object.fromEntries(
      entries.map(([kind, record]) => [
        kind,
        {
          state: record.state,
          status: record.value?.status || null,
          error: record.value?.error || record.error || null,
        },
      ]),
    );

    const [analysisRequest, creativeRequest] = await Promise.all([
      readJsonOptional(path.join(runDir, "browser-request.json")),
      readJsonOptional(path.join(runDir, "browser-creative-request.json")),
    ]);

    return {
      runId,
      runDir,
      task,
      session: await sessionStatus(),
      requests: {
        analysis: analysisRequest.value,
        creative: creativeRequest.value,
      },
      artifacts,
      summary,
    };
  }

  async function requestCreative(runIdInput, interpretationIdInput) {
    const runId = assertRunId(runIdInput);
    const interpretationId = assertInterpretationId(interpretationIdInput);
    const runDir = path.join(runsRoot, runId);
    const analysisRecord = await readJsonOptional(
      path.join(runDir, "analysis.json"),
    );
    if (analysisRecord.state !== "ready" || !analysisRecord.value)
      throw new AppError(
        "主分析尚未完成，暂时不能创建 Studio 实验。",
        "V4_ANALYSIS_NOT_READY",
        409,
      );
    const interpretations = analysisRecord.value.interpretations || [];
    if (!interpretations.some((item) => item.id === interpretationId))
      throw new AppError(
        "找不到这个分析点，请刷新后重试。",
        "V4_INTERPRETATION_NOT_FOUND",
        404,
      );

    const requestFile = path.join(runDir, "browser-creative-request.json");
    const existingRequest = await readJsonOptional(requestFile);
    if (
      existingRequest.state === "ready" &&
      existingRequest.value &&
      ["queued", "claimed"].includes(existingRequest.value.status) &&
      existingRequest.value.interpretationId === interpretationId
    ) {
      return {
        status: "creative_queued",
        runId,
        runDir,
        interpretationId,
        requestId: existingRequest.value.requestId,
        session: await sessionStatus(),
      };
    }

    const currentStudio = await readJsonOptional(path.join(runDir, "studio.json"));
    if (
      currentStudio.state === "ready" &&
      currentStudio.value &&
      !(currentStudio.value.sourceInterpretationIds || []).includes(interpretationId)
    ) {
      const historyDir = path.join(runDir, "studio-history");
      await fs.mkdir(historyDir, { recursive: true });
      const archived =
        now().toISOString().replace(/[:.]/gu, "-") + ".json";
      await fs.rename(
        path.join(runDir, "studio.json"),
        path.join(historyDir, archived),
      );
    }

    const request = requestPayload({
      kind: "creative",
      runId,
      interpretationId,
      now,
    });
    await writeJsonAtomic(requestFile, request);

    return {
      status: "creative_queued",
      runId,
      runDir,
      interpretationId,
      requestId: request.requestId,
      session: await sessionStatus(),
    };
  }

  return Object.freeze({
    prepare,
    materialize,
    status,
    sessionStatus,
    requestCreative,
    runsRoot,
    sessionRoot,
  });
}
