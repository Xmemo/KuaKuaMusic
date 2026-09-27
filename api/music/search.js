import { searchMusic } from "../../server/musicSearch.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const query = req.query && typeof req.query.q === "string"
    ? req.query.q
    : new URL(req.url || "/", "http://localhost").searchParams.get("q") || "";

  try {
    const songs = await searchMusic(query);
    return res.status(200).json({ songs });
  } catch (error) {
    console.warn("[music-search] " + (error.message || "search failed"));
    return res.status(error.statusCode || 502).json({
      error: error.message || "歌曲搜索失败，请稍后重试。",
    });
  }
}
