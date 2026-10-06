const VARIANT_TERMS = Object.freeze([
  "cover",
  "karaoke",
  "slowed",
  "sped up",
  "nightcore",
  "reverb",
  "8d",
  "fanmade",
  "remake",
  "live",
  "extended",
  "remix",
]);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeMusicText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalizeMusicText(value).split(/\s+/u).filter(Boolean));
}

export function textSimilarity(left, right) {
  const a = normalizeMusicText(left);
  const b = normalizeMusicText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const at = tokens(a);
  const bt = tokens(b);
  const intersection = [...at].filter((token) => bt.has(token)).length;
  const union = new Set([...at, ...bt]).size;
  return union ? intersection / union : 0;
}

function durationSimilarity(target, candidate) {
  if (!Number.isFinite(target) || !Number.isFinite(candidate) || target <= 0 || candidate <= 0) return null;
  const delta = Math.abs(target - candidate);
  if (delta <= 2) return 1;
  if (delta <= 5) return 0.9;
  if (delta <= 10) return 0.72;
  if (delta <= 20) return 0.42;
  if (delta <= 40) return 0.16;
  return 0;
}

function authorityScore(candidate) {
  if (candidate.isOfficial) return 1;
  if (candidate.isTopic) return 0.95;
  if (candidate.isPublisher) return 0.88;
  return 0.35;
}

function variantPenalty(targetTitle, candidateTitle) {
  const target = normalizeMusicText(targetTitle);
  const candidate = normalizeMusicText(candidateTitle);
  let hits = 0;
  for (const term of VARIANT_TERMS) {
    const normalized = normalizeMusicText(term);
    if (candidate.includes(normalized) && !target.includes(normalized)) hits += 1;
  }
  return Math.min(0.3, hits * 0.12);
}

export function scoreAudioCandidate(song, candidate) {
  const title = textSimilarity(song.title, candidate.title);
  const artist = textSimilarity(
    song.artist,
    candidate.artistHint || candidate.title + " " + candidate.channel,
  );
  const duration = durationSimilarity(song.durationSec, candidate.durationSec);
  const albumVersion =
    song.album && candidate.albumHint
      ? textSimilarity(song.album, candidate.albumHint)
      : null;
  const authority = authorityScore(candidate);
  const penalty = variantPenalty(song.title, candidate.title);

  const parts = [
    [title, 0.35],
    [artist, 0.25],
    [duration, 0.2],
    [albumVersion, 0.1],
    [authority, 0.1],
  ].filter(([value]) => value !== null);

  const weight = parts.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  const weighted =
    weight > 0
      ? parts.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) /
        weight
      : 0;

  return {
    ...candidate,
    matchScore: Number(clamp(weighted - penalty).toFixed(4)),
    scoreParts: {
      title: Number(title.toFixed(4)),
      artist: Number(artist.toFixed(4)),
      duration: duration === null ? null : Number(duration.toFixed(4)),
      albumVersion:
        albumVersion === null ? null : Number(albumVersion.toFixed(4)),
      authority: Number(authority.toFixed(4)),
      variantPenalty: penalty,
    },
  };
}

export function chooseAudioSource(song, candidates) {
  const scored = (candidates || [])
    .map((candidate) => scoreAudioCandidate(song, candidate))
    .sort((a, b) => b.matchScore - a.matchScore);

  // A high artist/channel resemblance must not make an unrelated video title
  // look like a plausible song recording (for example, "Varlan" matching a
  // workout video uploaded by "Marius Varlan"). Keep weak results out of the
  // confirmation UI; manual confirmation is for plausible recording variants.
  const plausible = scored.filter((candidate) => {
    const titleAndArtistAgree =
      candidate.matchScore >= 0.65 &&
      candidate.scoreParts.title >= 0.35 &&
      candidate.scoreParts.artist >= 0.35;
    // Catalog artist credits can be aliases or deliberately obfuscated. Keep
    // an exact-title Topic/publisher upload as a manual-only possibility when
    // artist metadata is absent; it can never become auto_high on title alone.
    const strongTitleFromMusicChannel =
      candidate.scoreParts.title >= 0.9 &&
      candidate.matchScore >= 0.45 &&
      (candidate.isTopic || candidate.isOfficial || candidate.isPublisher);
    return titleAndArtistAgree || strongTitleFromMusicChannel;
  });
  const best = plausible[0] || null;
  const second = plausible[1] || null;
  if (!best) {
    return {
      decision: "manual_required",
      requiresSanityCheck: false,
      selected: null,
      candidates: [],
    };
  }

  const gap = second ? best.matchScore - second.matchScore : best.matchScore;
  if (best.matchScore >= 0.88 && gap >= 0.08) {
    return {
      decision: "auto_high",
      requiresSanityCheck: false,
      selected: best,
      candidates: plausible.slice(0, 10),
    };
  }
  if (best.matchScore >= 0.75 && gap >= 0.05) {
    return {
      decision: "manual_required",
      requiresSanityCheck: true,
      selected: null,
      candidates: plausible.slice(0, 3),
    };
  }
  return {
    decision: "manual_required",
    requiresSanityCheck: false,
    selected: null,
    candidates: plausible.slice(0, 3),
  };
}

export const audioMatchThresholds = Object.freeze({
  minimumCandidateScore: 0.65,
  minimumTitleSimilarity: 0.35,
  minimumArtistSimilarity: 0.35,
  manualTitleFloor: 0.45,
  strongTitleSimilarity: 0.9,
  high: 0.88,
  highGap: 0.08,
  medium: 0.75,
  mediumGap: 0.05,
});
