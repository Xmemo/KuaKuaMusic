import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { chooseAudioSource, normalizeMusicText, scoreAudioCandidate } from "../../music-learning/v2/sourceMatcher.mjs";
import { AppError } from "../errors.mjs";
import { runProcess } from "./processRunner.mjs";

function buildQueries(song) {
  const title = String(song.title || "").replace(/"/gu, "").trim();
  const artist = String(song.artist || "").replace(/"/gu, "").trim();
  const album = String(song.album || "").replace(/"/gu, "").trim();
  const values = album
    ? [[title, album].filter(Boolean).join(" "), title, [title, artist].filter(Boolean).join(" ")]
    : [
        title,
        [title, artist].filter(Boolean).join(" "),
        [title, artist, "official audio"].filter(Boolean).join(" "),
      ];
  return [...new Set(values)].slice(0, 3);
}

function mapEntry(entry, song) {
  const sourceId = String(entry.id || "").trim();
  if (!sourceId) return null;
  const channel = String(entry.channel || entry.uploader || "").trim();
  const artistHint = String(entry.artist || entry.creator || "").trim() || null;
  const artist = normalizeMusicText(song.artist);
  const normalizedChannel = normalizeMusicText(channel);
  const verified = Boolean(
    entry.channel_is_verified ||
      entry.channel_verified ||
      entry.uploader_is_verified,
  );
  const isTopic = /(?:^|\s)-?\s*topic$/iu.test(channel);
  const isOfficial =
    verified && artist && normalizedChannel.includes(artist);

  return {
    sourceId,
    url:
      String(entry.webpage_url || entry.original_url || "").trim() ||
      "https://www.youtube.com/watch?v=" + sourceId,
    title: String(entry.title || "").trim(),
    artistHint,
    albumHint: String(entry.album || "").trim() || null,
    channel,
    durationSec: Number.isFinite(Number(entry.duration)) && Number(entry.duration) > 0
      ? Number(entry.duration)
      : null,
    isOfficial,
    isTopic,
    isPublisher: false,
  };
}

async function sha256File(file) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function createYouTubeAudioProvider({
  env = process.env,
  runner = runProcess,
} = {}) {
  const ytDlp = env.MUSIC_YTDLP_BIN || "yt-dlp";
  const ffmpeg = env.MUSIC_FFMPEG_BIN || "ffmpeg";
  const ffprobe = env.MUSIC_FFPROBE_BIN || "ffprobe";

  async function search(song, { signal, onProgress } = {}) {
    const found = new Map();
    for (const query of buildQueries(song)) {
      onProgress?.({
        stage: "resolving_audio",
        label: "正在 YouTube 查找匹配音源",
        query,
      });
      const result = await runner(
        ytDlp,
        [
          "--dump-single-json",
          "--flat-playlist",
          "--skip-download",
          "--no-warnings",
          "--ignore-errors",
          "--playlist-end",
          "10",
          "ytsearch10:" + query,
        ],
        { signal, timeoutMs: 120000, maxOutputBytes: 8 * 1024 * 1024 },
      );
      const payload = JSON.parse(result.stdout || "{}");
      for (const entry of payload.entries || []) {
        const candidate = mapEntry(entry, song);
        if (candidate && !found.has(candidate.sourceId)) {
          found.set(candidate.sourceId, candidate);
        }
      }
      if (chooseAudioSource(song, [...found.values()]).decision === "auto_high") break;
    }
    return [...found.values()]
      .map((candidate) => scoreAudioCandidate(song, candidate))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
  }

  function choose(song, candidates) {
    return chooseAudioSource(song, candidates);
  }

  async function acquire(
    candidate,
    {
      destinationDir,
      decision,
      matchScore,
      requiresSanityCheck = false,
      signal,
      onProgress,
    },
  ) {
    await fs.mkdir(destinationDir, { recursive: true });
    onProgress?.({
      stage: "acquiring_audio",
      label: "正在下载并准备本地分析音频",
    });

    await runner(
      ytDlp,
      [
        "--no-playlist",
        "--no-warnings",
        "-f",
        "bestaudio/best",
        "-o",
        path.join(destinationDir, "source.%(ext)s"),
        candidate.url,
      ],
      { signal, timeoutMs: 300000, maxOutputBytes: 2 * 1024 * 1024 },
    );

    const entries = await fs.readdir(destinationDir);
    const sourceName = entries.find(
      (name) =>
        name.startsWith("source.") &&
        !name.endsWith(".part") &&
        !name.endsWith(".ytdl"),
    );
    if (!sourceName) {
      throw new AppError(
        "YouTube 音频已请求下载，但没有找到生成的本地文件。",
        "V2_AUDIO_DOWNLOAD_MISSING",
        502,
      );
    }

    const sourcePath = path.join(destinationDir, sourceName);
    const analysisPath = path.join(destinationDir, "analysis.mp3");
    await runner(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-b:a",
        "160k",
        analysisPath,
      ],
      { signal, timeoutMs: 180000, maxOutputBytes: 1024 * 1024 },
    );
    const probe = await runner(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "json", analysisPath],
      { signal, timeoutMs: 30000, maxOutputBytes: 1024 * 1024 });
    let durationSec;
    try { durationSec = Number(JSON.parse(probe.stdout || "{}").format?.duration); }
    catch { durationSec = NaN; }
    if (!Number.isFinite(durationSec) || durationSec <= 0)
      throw new AppError("无法确认本地音频的实际时长。", "V2_AUDIO_DURATION_INVALID", 422);

    return {
      sourcePath,
      analysisPath,
      analysisMimeType: "audio/mpeg",
      durationSec,
      sha256: await sha256File(sourcePath),
      acquisition: {
        provider: "youtube",
        sourceId: candidate.sourceId,
        sourceUrl: candidate.url,
        sourceTitle: candidate.title,
        channel: candidate.channel,
        durationSec: candidate.durationSec,
        matchScore,
        matchDecision: decision,
        requiresSanityCheck,
        downloadedAt: new Date().toISOString(),
      },
    };
  }

  return Object.freeze({ search, choose, acquire, buildQueries });
}

export { buildQueries as buildYouTubeQueries };
