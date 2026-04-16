import { KwaKwaState, PraiseContent, SongMetadata } from "../types";

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_API_BASE_URL || "";

type ProxyResponse = {
  text?: string;
  error?: string;
};

const parseJsonFromModel = (raw: string): any => {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
};

const callZhipuForJson = async (prompt: string, temperature = 0.5) => {
  const response = await fetch(`${BACKEND_BASE_URL}/api/zhipu/json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      temperature,
    }),
  });

  if (!response.ok) {
    let errorText = "";
    try {
      const err = (await response.json()) as ProxyResponse;
      errorText = err.error || "";
    } catch {
      errorText = await response.text();
    }
    throw new Error(`Proxy request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ProxyResponse;
  const text = data.text || "{}";
  return parseJsonFromModel(text);
};

const fetchItunesData = async (title: string, artist: string) => {
  try {
    const query = `${title} ${artist}`;
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`
    );
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      return {
        coverUrl: track.artworkUrl100.replace("100x100", "600x600"),
        previewUrl: track.previewUrl,
        album: track.collectionName,
        genre: track.primaryGenreName,
        year: track.releaseDate ? track.releaseDate.substring(0, 4) : "",
      };
    }
  } catch (e) {
    console.warn("iTunes API failed", e);
  }
  return null;
};

export const identifySong = async (query: string): Promise<SongMetadata> => {
  try {
    const aiData = await callZhipuForJson(
      `Identify the song from this query: "${query}".
Return JSON:
{
  "title": "official song title",
  "artist": "official artist name",
  "genre": "optional genre",
  "album": "optional album"
}`
    );

    const title = (aiData.title || query).toString();
    const artist = (aiData.artist || "Unknown Artist").toString();
    const itunesData = await fetchItunesData(title, artist);
    const coverUrl =
      itunesData?.coverUrl || `https://picsum.photos/seed/${encodeURIComponent(title + artist)}/400/400`;

    return {
      title,
      artist,
      genre: itunesData?.genre || aiData.genre || "Pop",
      album: itunesData?.album || aiData.album,
      coverUrl,
    };
  } catch (error) {
    console.error("Error identifying song:", error);
    throw new Error("KwaKwa couldn't identify this track.");
  }
};

const DEFAULT_PRAISE: PraiseContent = {
  hook: "這首歌有讓人上頭的潛力",
  colorHex: "#22D3EE",
  kwaKwaState: KwaKwaState.HYPE,
  isBadSong: false,
  modes: {
    emo: "旋律有情緒張力，能把人慢慢帶進歌裡。",
    hype: "節奏抓耳，副歌有明確記憶點。",
    pro: "編曲層次清楚，核心動機重複策略合理。",
  },
  deepDive: {
    culture: {
      title: "文化脈絡",
      publicText: "它像是把熟悉的流行語彙重新排版。",
      geekText: "Arrangement and hook phrasing align with mainstream pop trope design for memorability.",
    },
    harmony: {
      title: "和聲",
      publicText: "和弦推進穩定，情緒轉場自然。",
      geekText: "Progression stays in a functional tonal center with predictable cadential pull.",
    },
    rhythm: {
      title: "節奏",
      publicText: "律動重心清楚，身體會自然跟著擺。",
      geekText: "Kick-snare framework and syncopated accents establish consistent groove expectation.",
    },
    timbre: {
      title: "音色",
      publicText: "主音色辨識度高，聽感乾淨。",
      geekText: "Mid-high presence is emphasized while low-end remains controlled for vocal focus.",
    },
  },
};

export const analyzeSong = async (song: SongMetadata): Promise<PraiseContent> => {
  try {
    const prompt = `
Act as "夸夸音乐". Analyze "${song.title}" by "${song.artist}" (${song.genre || "Pop"}).
Output language: Traditional Chinese (繁體中文).
Return only valid JSON with this shape:
{
  "hook": "string",
  "colorHex": "#RRGGBB",
  "kwaKwaState": "HYPE|EMO|PRO|AWKWARD",
  "isBadSong": true_or_false,
  "modes": { "emo": "string", "hype": "string", "pro": "string" },
  "deepDive": {
    "culture": { "title": "string", "publicText": "string", "geekText": "string" },
    "harmony": { "title": "string", "publicText": "string", "geekText": "string" },
    "rhythm": { "title": "string", "publicText": "string", "geekText": "string" },
    "timbre": { "title": "string", "publicText": "string", "geekText": "string" }
  }
}
Rules:
1) If song is generic or low-effort, set isBadSong = true and kwaKwaState = AWKWARD.
2) deepDive.geekText must be technical and specific (music theory / production terms).
3) Do not include markdown, comments, or extra keys outside the JSON object.
`;

    const result = await callZhipuForJson(prompt, 0.7);

    const merged: PraiseContent = {
      ...DEFAULT_PRAISE,
      ...result,
      modes: {
        ...DEFAULT_PRAISE.modes,
        ...(result?.modes || {}),
      },
      deepDive: {
        culture: {
          ...DEFAULT_PRAISE.deepDive.culture,
          ...(result?.deepDive?.culture || {}),
        },
        harmony: {
          ...DEFAULT_PRAISE.deepDive.harmony,
          ...(result?.deepDive?.harmony || {}),
        },
        rhythm: {
          ...DEFAULT_PRAISE.deepDive.rhythm,
          ...(result?.deepDive?.rhythm || {}),
        },
        timbre: {
          ...DEFAULT_PRAISE.deepDive.timbre,
          ...(result?.deepDive?.timbre || {}),
        },
      },
    };

    const state = (merged.kwaKwaState || "").toString().toUpperCase();
    const validStates = Object.values(KwaKwaState);
    merged.kwaKwaState = validStates.includes(state as KwaKwaState)
      ? (state as KwaKwaState)
      : DEFAULT_PRAISE.kwaKwaState;

    if (merged.isBadSong) {
      merged.kwaKwaState = KwaKwaState.AWKWARD;
    }

    return merged;
  } catch (error) {
    console.error("Error analyzing song:", error);
    throw new Error("KwaKwa is malfunctioning.");
  }
};
