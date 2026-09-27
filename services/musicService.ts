import { KwaKwaState, PraiseContent, SongMetadata } from "../types";

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_API_BASE_URL || "";

type ApiResponse<T> = T & {
  error?: string;
  code?: string;
};

type ConversationTurn = {
  question: string;
  answer: string;
};

const parseJsonFromModel = (raw: string): any => {
  const cleaned = raw
    .replace(/^\x60{3}json\s*/i, "")
    .replace(/^\x60{3}\s*/i, "")
    .replace(/\s*\x60{3}$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Surface one actionable message instead of rendering a broken result.
      }
    }
  }
  throw new Error("AI 返回的分析格式不完整，请重新生成。");
};

async function callAgnes(prompt: string, options: { jsonMode?: boolean; temperature?: number } = {}) {
  let response: Response;
  try {
    response = await fetch(BACKEND_BASE_URL + "/api/agnes/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        jsonMode: options.jsonMode === true,
        temperature: options.temperature ?? 0.7,
      }),
    });
  } catch {
    throw new Error("无法连接分析服务，请检查网络后重试。");
  }

  const data = (await response.json().catch(() => ({}))) as ApiResponse<{ text?: string }>;
  if (!response.ok) {
    throw new Error(data.error || "分析服务请求失败（HTTP " + response.status + "）。");
  }
  if (!data.text || !data.text.trim()) throw new Error("分析服务返回了空内容，请重试。");
  return data.text;
}

export const searchSongs = async (query: string): Promise<SongMetadata[]> => {
  const response = await fetch(
    BACKEND_BASE_URL + "/api/music/search?q=" + encodeURIComponent(query.trim())
  );
  const data = (await response.json().catch(() => ({}))) as ApiResponse<{ songs?: SongMetadata[] }>;
  if (!response.ok) throw new Error(data.error || "歌曲搜索失败，请稍后重试。");
  return Array.isArray(data.songs) ? data.songs : [];
};

export const identifySong = async (query: string): Promise<SongMetadata> => {
  const songs = await searchSongs(query);
  if (!songs.length) throw new Error("没有找到相符歌曲，请试试「歌名 + 歌手」或粘贴歌曲链接。");
  return songs[0];
};

const DEFAULT_PRAISE: PraiseContent = {
  hook: "這首歌值得再多聽一次",
  colorHex: "#FACC15",
  kwaKwaState: KwaKwaState.HYPE,
  isBadSong: false,
  modes: {
    emo: "這首歌的情緒表達值得從旋律和演唱裡慢慢體會。",
    hype: "這首歌的節奏和段落變化可以繼續留意。",
    pro: "從編曲層次和旋律組織的角度，可以找到它的表達重點。",
  },
  deepDive: {
    culture: { title: "文化脈絡", publicText: "", geekText: "" },
    harmony: { title: "和聲", publicText: "", geekText: "" },
    rhythm: { title: "節奏", publicText: "", geekText: "" },
    timbre: { title: "音色", publicText: "", geekText: "" },
  },
};

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const analyzeSong = async (song: SongMetadata): Promise<PraiseContent> => {
  const prompt = [
    "請用繁體中文為《" + song.title + "》（" + song.artist + "）寫一份準確、具體、有溫度的音樂解讀。",
    "可用曲目信息：" + JSON.stringify({
      artist: song.artist,
      title: song.title,
      album: song.album || "",
      genre: song.genre || "",
      releaseYear: song.releaseYear || "",
    }),
    "",
    "重要：你沒有聽到這段音訊，只能依據曲目信息和你可靠掌握的公開知識作答。不要把推測寫成聽音結論；不確定具體和弦、調性、BPM、樂器或錄音細節時，請直接說明不確定，改為解釋可能的聽感與編曲作用。不要虛構歌詞、演奏者或製作信息。",
    "請保留三種夸歌文案和四個深入解讀板塊。文字具體但不重複：每種模式約 2 至 3 句；每個 deepDive 的 publicText 用容易理解的語言寫 2 句，geekText 寫 2 至 3 句；分析文化脈絡、和聲、節奏、音色。",
    "hook 是一句簡潔、有辨識度的開場。colorHex 使用有效的 #RRGGBB。kwaKwaState 只能是 HYPE、EMO、PRO、AWKWARD 之一。isBadSong 只有在資料無法支持任何可靠分析時才為 true。",
    "",
    "只返回有效 JSON，不要 Markdown，結構如下：",
    JSON.stringify({
      hook: "開場句",
      colorHex: "#RRGGBB",
      kwaKwaState: "HYPE|EMO|PRO|AWKWARD",
      isBadSong: false,
      modes: { emo: "走心", hype: "上頭", pro: "懂行" },
      deepDive: {
        culture: { title: "文化脈絡", publicText: "通俗說明", geekText: "專業說明；不確定時標注推測" },
        harmony: { title: "和聲", publicText: "通俗說明", geekText: "專業說明；不確定時標注推測" },
        rhythm: { title: "節奏", publicText: "通俗說明", geekText: "專業說明；不確定時標注推測" },
        timbre: { title: "音色", publicText: "通俗說明", geekText: "專業說明；不確定時標注推測" },
      },
    }),
  ].join("\n");

  try {
    const result = parseJsonFromModel(await callAgnes(prompt, { jsonMode: true, temperature: 0.65 }));
    const requiredSections = ["culture", "harmony", "rhythm", "timbre"];
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !isText(result.hook) ||
      !result.modes ||
      !isText(result.modes.emo) ||
      !isText(result.modes.hype) ||
      !isText(result.modes.pro) ||
      !result.deepDive ||
      requiredSections.some((key) =>
        !result.deepDive[key] ||
        !isText(result.deepDive[key].publicText) ||
        !isText(result.deepDive[key].geekText)
      )
    ) {
      throw new Error("AI 返回的分析内容不完整，请重新生成。");
    }
    const merged: PraiseContent = {
      ...DEFAULT_PRAISE,
      ...result,
      modes: { ...DEFAULT_PRAISE.modes, ...(result.modes || {}) },
      deepDive: {
        culture: { ...DEFAULT_PRAISE.deepDive.culture, ...(result.deepDive?.culture || {}) },
        harmony: { ...DEFAULT_PRAISE.deepDive.harmony, ...(result.deepDive?.harmony || {}) },
        rhythm: { ...DEFAULT_PRAISE.deepDive.rhythm, ...(result.deepDive?.rhythm || {}) },
        timbre: { ...DEFAULT_PRAISE.deepDive.timbre, ...(result.deepDive?.timbre || {}) },
      },
    };

    const sections = [merged.deepDive.culture, merged.deepDive.harmony, merged.deepDive.rhythm, merged.deepDive.timbre];
    if (
      !isText(merged.hook) ||
      !isText(merged.modes.emo) ||
      !isText(merged.modes.hype) ||
      !isText(merged.modes.pro) ||
      sections.some((section) => !isText(section.publicText) || !isText(section.geekText))
    ) {
      throw new Error("AI 返回的分析內容不完整，請重新生成。");
    }

    const state = String(merged.kwaKwaState || "").toUpperCase();
    const validStates = Object.values(KwaKwaState);
    merged.kwaKwaState = validStates.includes(state as KwaKwaState)
      ? (state as KwaKwaState)
      : DEFAULT_PRAISE.kwaKwaState;
    merged.colorHex = /^#[0-9a-f]{6}$/i.test(String(merged.colorHex))
      ? String(merged.colorHex)
      : DEFAULT_PRAISE.colorHex;
    merged.isBadSong = merged.isBadSong === true || String(merged.isBadSong).toLowerCase() === "true";
    if (merged.isBadSong) merged.kwaKwaState = KwaKwaState.AWKWARD;
    return merged;
  } catch (error) {
    throw error instanceof Error ? error : new Error("歌曲分析失敗，請重試。");
  }
};

export const askAboutSong = async (
  song: SongMetadata,
  analysis: PraiseContent,
  question: string,
  history: ConversationTurn[] = []
): Promise<string> => {
  const previous = history.slice(-4).map((turn) => ({
    question: turn.question.slice(0, 600),
    answer: turn.answer.slice(0, 1200),
  }));
  const prompt = [
    "用户正在查看这首歌的解读。请回答其问题，必要时纠正或补充分析；不要重复整份分析。",
    "曲目：" + JSON.stringify({
      title: song.title,
      artist: song.artist,
      album: song.album || "",
      genre: song.genre || "",
    }),
    "当前解读：" + JSON.stringify({
      hook: analysis.hook,
      modes: analysis.modes,
      deepDive: analysis.deepDive,
    }),
    "此前问答：" + JSON.stringify(previous),
    "用户问题：" + question.trim(),
  ].join("\n\n");
  return (await callAgnes(prompt, { temperature: 0.7 })).trim();
};
