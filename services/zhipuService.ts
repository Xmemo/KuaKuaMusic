import { KwaKwaState, PraiseContent, SongMetadata } from "../types";

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_API_BASE_URL || "";

type ProxyResponse = {
  text?: string;
  error?: string;
};

const parseJsonFromModel = (raw: string): any => {
  try {
    // Attempt 1: Direct parse
    return JSON.parse(raw);
  } catch {
    console.warn("[zhipu] Direct parse failed, attempting regex extraction...");
  }

  // Attempt 2: Extract JSON from markdown or text
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const extracted = jsonMatch[0];
      return JSON.parse(extracted);
    } catch (e) {
      console.error("[zhipu] Regex extraction parse failed:", e);
    }
  }

  // Attempt 3: Strip common markdown tags and try again
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[zhipu] All parsing attempts failed. Raw text:", raw);
    throw new Error("Malformatted AI Response: Content could not be parsed as JSON.");
  }
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
    console.error(`[zhipu] API Error (${response.status}):`, errorText);
    throw new Error(`API Endpoint Error: ${response.status} - ${errorText || 'Unknown Connection Issue'}`);
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
Act as "夸夸音乐", a professional musicologist and charismatic music critic.
Analyze "${song.title}" by "${song.artist}" (${song.genre || "Pop"}).
Output language: Traditional Chinese (繁體中文).

Constraints:
1) BE EXTREMELY DETAILED. I need professional-grade music theory and production insights.
2) For each field in "deepDive", provide at least 2-3 substantial paragraphs.
3) "geekText" MUST be highly technical (discussing harmony, frequency range, sound design, rhythmic syncopation, etc.).
4) The overall tone should be sophisticated yet passionate.

Return only valid JSON with this shape:
{
  "hook": "a catchy opening sentence that captures the essence of the song",
  "colorHex": "#RRGGBB",
  "kwaKwaState": "HYPE|EMO|PRO|AWKWARD",
  "isBadSong": true_or_false,
  "modes": {
      "emo": "detailed emotional analysis (60+ words)",
      "hype": "detailed energy/rhythm analysis (60+ words)",
      "pro": "detailed production/composition analysis (60+ words)"
  },
  "deepDive": {
    "culture": { "title": "文化脈絡", "publicText": "accessible text", "geekText": "extremely detailed musicological technical text" },
    "harmony": { "title": "和聲", "publicText": "accessible text", "geekText": "extremely detailed musicological technical text" },
    "rhythm": { "title": "節奏", "publicText": "accessible text", "geekText": "extremely detailed musicological technical text" },
    "timbre": { "title": "音色", "publicText": "accessible text", "geekText": "extremely detailed musicological technical text" }
  }
}
Rules:
- If song is generic, set isBadSong = true.
- Do not include markdown, comments, or extra keys. No preamble. Valid JSON only.
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
