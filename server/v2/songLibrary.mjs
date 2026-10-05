import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "../errors.mjs";

function cleanText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function slug(value) {
  const normalized = cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return normalized || "song";
}

function stableSongKey(song) {
  // The Song Package is the cross-platform song-level container.
  // Album/year differences belong to identity snapshots and media revisions,
  // otherwise the same selected song fragments into separate local packages.
  return [
    cleanText(song.title).toLocaleLowerCase(),
    cleanText(song.artist).toLocaleLowerCase(),
  ].join("|");
}

export function deriveSongId(song) {
  const hash = crypto
    .createHash("sha256")
    .update(stableSongKey(song))
    .digest("hex")
    .slice(0, 10);
  return slug(song.title + "-" + song.artist) + "--" + hash;
}

function assertId(value, label) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,160}$/u.test(String(value || ""))) {
    throw new AppError(label + " 无效。", "V2_INVALID_ID", 400);
  }
  return String(value);
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + crypto.randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export function createSongLibrary({
  root = process.env.MUSIC_LIBRARY_DIR ||
    path.resolve(".music-learning", "library"),
} = {}) {
  const libraryRoot = path.resolve(root);

  function songDir(songId) {
    return path.join(libraryRoot, assertId(songId, "songId"));
  }

  function canonicalizeSong(song) {
    const title = cleanText(song?.title);
    const artist = cleanText(song?.artist);
    if (!title || !artist) {
      throw new AppError(
        "v2 需要明确的歌曲标题和艺人。",
        "V2_INVALID_SONG",
        400,
      );
    }
    const base = {
      title,
      artist,
      album: cleanText(song.album) || null,
      releaseYear: cleanText(song.releaseYear) || null,
      durationSec: Number.isFinite(Number(song.durationSec))
        ? Number(song.durationSec)
        : null,
      sourcePlatform: cleanText(song.platform) || null,
      sourceTrackUrl: cleanText(song.trackUrl) || null,
    };
    return { songId: deriveSongId(base), ...base };
  }

  async function ensureSongPackage(songInput) {
    const song = canonicalizeSong(songInput);
    const dir = songDir(song.songId);
    await fs.mkdir(path.join(dir, "media"), { recursive: true });
    await fs.mkdir(path.join(dir, "observations"), { recursive: true });
    await fs.mkdir(path.join(dir, "research"), { recursive: true });
    await fs.mkdir(path.join(dir, "analyses"), { recursive: true });
    await fs.mkdir(path.join(dir, "creative"), { recursive: true });
    await fs.mkdir(path.join(dir, "deep-dives"), { recursive: true });
    await fs.mkdir(path.join(dir, "studio"), { recursive: true });

    const manifestPath = path.join(dir, "manifest.json");
    let manifest;
    try {
      manifest = await readJson(manifestPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const now = new Date().toISOString();
      manifest = {
        schemaVersion: "2.0",
        song,
        currentMediaRevisionId: null,
        mediaRevisions: [],
        observationRunIds: [],
        researchRunIds: [],
        analysisIds: [],
        blueprintIds: [],
        studioSeedIds: [],
        updatedAt: now,
      };
      await writeJsonAtomic(manifestPath, manifest);
    }
    manifest = {
      ...manifest,
      mediaRevisions: manifest.mediaRevisions || [],
      observationRunIds: manifest.observationRunIds || [],
      researchRunIds: manifest.researchRunIds || [],
      analysisIds: manifest.analysisIds || [],
      blueprintIds: manifest.blueprintIds || [],
      studioSeedIds: manifest.studioSeedIds || [],
    };
    await writeJsonAtomic(manifestPath, manifest);
    await writeJsonAtomic(path.join(dir, "identity.json"), song);
    return { dir, song, manifest };
  }

  async function allocateMediaRevision(songId) {
    const mediaRevisionId = crypto.randomUUID();
    const dir = path.join(
      songDir(songId),
      "media",
      assertId(mediaRevisionId, "mediaRevisionId"),
    );
    await fs.mkdir(dir, { recursive: true });
    return { mediaRevisionId, dir };
  }

  async function loadManifest(songId) {
    return readJson(path.join(songDir(songId), "manifest.json"));
  }

  async function commitMediaRevision(songId, media) {
    assertId(media.mediaRevisionId, "mediaRevisionId");
    const dir = path.join(songDir(songId), "media", media.mediaRevisionId);
    await writeJsonAtomic(path.join(dir, "media.json"), media);
    await writeJsonAtomic(
      path.join(dir, "acquisition.json"),
      media.acquisition,
    );

    const manifest = await loadManifest(songId);
    if (!manifest.mediaRevisions.some(
      (item) => item.mediaRevisionId === media.mediaRevisionId,
    )) {
      manifest.mediaRevisions.push({
        mediaRevisionId: media.mediaRevisionId,
        createdAt: media.createdAt,
        sha256: media.acquisition.sha256,
      });
    }
    manifest.currentMediaRevisionId = media.mediaRevisionId;
    manifest.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(songDir(songId), "manifest.json"), manifest);
    return manifest;
  }

  async function getCurrentMedia(songId) {
    const manifest = await loadManifest(songId);
    if (!manifest.currentMediaRevisionId) {
      throw new AppError(
        "这首歌还没有可用于分析的本地音频。",
        "V2_AUDIO_NOT_READY",
        409,
      );
    }
    const media = await readJson(
      path.join(
        songDir(songId),
        "media",
        manifest.currentMediaRevisionId,
        "media.json",
      ),
    );
    return { manifest, media };
  }

  async function appendManifestId(songId, field, value) {
    const manifest = await loadManifest(songId);
    if (!manifest[field].includes(value)) manifest[field].push(value);
    manifest.updatedAt = new Date().toISOString();
    await writeJsonAtomic(path.join(songDir(songId), "manifest.json"), manifest);
    return manifest;
  }

  function latestId(values, label) {
    const value = values.at(-1);
    if (!value) {
      throw new AppError(
        "这首歌还没有可用的" + label + "。",
        "V2_ARTIFACT_NOT_READY",
        409,
      );
    }
    return value;
  }

  async function saveObservation(songId, document) {
    assertId(document.listenRunId, "listenRunId");
    await writeJsonAtomic(
      path.join(songDir(songId), "observations", document.listenRunId + ".json"),
      document,
    );
    return appendManifestId(songId, "observationRunIds", document.listenRunId);
  }

  async function loadObservation(songId, listenRunId = null) {
    const manifest = await loadManifest(songId);
    const id = assertId(
      listenRunId || latestId(manifest.observationRunIds, "Listen 记录"),
      "listenRunId",
    );
    return readJson(path.join(songDir(songId), "observations", id + ".json"));
  }

  async function saveResearch(songId, artifact, sources) {
    assertId(artifact.researchRunId, "researchRunId");
    await writeJsonAtomic(
      path.join(songDir(songId), "research", artifact.researchRunId + ".json"),
      { artifact, sources },
    );
    return appendManifestId(songId, "researchRunIds", artifact.researchRunId);
  }

  async function loadResearch(songId, researchRunId = null) {
    const manifest = await loadManifest(songId);
    const id = assertId(
      researchRunId || latestId(manifest.researchRunIds, "Research 记录"),
      "researchRunId",
    );
    return readJson(path.join(songDir(songId), "research", id + ".json"));
  }

  async function saveAnalysis(songId, analysis) {
    assertId(analysis.analysisId, "analysisId");
    await writeJsonAtomic(
      path.join(songDir(songId), "analyses", analysis.analysisId + ".json"),
      analysis,
    );
    return appendManifestId(songId, "analysisIds", analysis.analysisId);
  }

  async function loadAnalysis(songId, analysisId = null) {
    const manifest = await loadManifest(songId);
    const id = assertId(
      analysisId || latestId(manifest.analysisIds, "Critic 分析"),
      "analysisId",
    );
    return readJson(path.join(songDir(songId), "analyses", id + ".json"));
  }

  async function saveBlueprint(songId, blueprint) {
    assertId(blueprint.blueprintId, "blueprintId");
    await writeJsonAtomic(
      path.join(songDir(songId), "creative", blueprint.blueprintId + ".json"),
      blueprint,
    );
    return appendManifestId(songId, "blueprintIds", blueprint.blueprintId);
  }

  async function loadBlueprint(songId, blueprintId = null) {
    const manifest = await loadManifest(songId);
    const id = assertId(
      blueprintId || latestId(manifest.blueprintIds, "Creative Blueprint"),
      "blueprintId",
    );
    return readJson(path.join(songDir(songId), "creative", id + ".json"));
  }

  async function saveStudioSeed(songId, seed) {
    assertId(seed.studioSeedId, "studioSeedId");
    await writeJsonAtomic(
      path.join(songDir(songId), "studio", seed.studioSeedId + ".json"),
      seed,
    );
    return appendManifestId(songId, "studioSeedIds", seed.studioSeedId);
  }

  async function loadStudioSeed(songId, studioSeedId = null) {
    const manifest = await loadManifest(songId);
    const id = assertId(
      studioSeedId || latestId(manifest.studioSeedIds || [], "Studio Seed"),
      "studioSeedId",
    );
    return readJson(path.join(songDir(songId), "studio", id + ".json"));
  }

  return Object.freeze({
    root: libraryRoot,
    canonicalizeSong,
    ensureSongPackage,
    allocateMediaRevision,
    commitMediaRevision,
    loadManifest,
    getCurrentMedia,
    saveObservation,
    loadObservation,
    saveResearch,
    loadResearch,
    saveAnalysis,
    loadAnalysis,
    saveBlueprint,
    loadBlueprint,
    saveStudioSeed,
    loadStudioSeed,
  });
}
