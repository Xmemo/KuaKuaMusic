export function createV2Preflight({ env, plan, runner, agentHealth }) {
  let cached, pending;
  const tool = async (id, label, binary, args) => {
    try {
      await runner(binary, args, { timeoutMs: 15000, maxOutputBytes: 64 * 1024 });
      return { id, label, status: "ready", message: "可用" };
    } catch { return { id, label, status: "missing", message: "未找到或无法运行，请安装或设置对应的 MUSIC_*_BIN。" }; }
  };
  return async ({ refresh = false } = {}) => {
    if (!refresh && cached && Date.now() - cached.at < 30000) return cached.value;
    if (pending) return pending;
    pending = (async () => {
      const checks = await Promise.all([
        tool("yt-dlp", "YouTube 音频工具", env.MUSIC_YTDLP_BIN || "yt-dlp", ["--version"]),
        tool("ffmpeg", "音频转码", env.MUSIC_FFMPEG_BIN || "ffmpeg", ["-version"]),
        tool("ffprobe", "实际音频时长", env.MUSIC_FFPROBE_BIN || "ffprobe", ["-version"]),
      ]);
      for (const [provider, name] of [["dashscope", "DASHSCOPE_API_KEY"], ["siliconflow", "SILICONFLOW_API_KEY"]]) {
        if (Object.values(plan).some((role) => role.provider === provider)) checks.push({ id: provider, label: name,
          status: env[name]?.trim() ? "ready" : "missing",
          message: env[name]?.trim() ? "已配置；有效性将在模型调用时检查。" : "请在本机 .env.local 配置，密钥不要发送到聊天或提交到 Git。" });
      }
      if (["registered-web", "codex-web"].includes(plan.research.backend) ||
        Object.values(plan).some((role) => role.provider === "codex-cli")) {
        const health = await agentHealth({ refresh }).catch(() => ({}));
        checks.push({ id: "codex", label: "Codex CLI 与登录", status: health.codexAvailable && health.authentication === "ready" &&
          health.projectConfiguration === "explicit" ? "ready" : "missing", message: "registered-web 的来源检索需要本机 Codex CLI、登录及支持的 exec 参数。" });
        checks.push({ id: "musicbrainz", label: "MusicBrainz MCP", status: health.musicBrainz === "ready" ? "ready" : "missing",
          message: "用于核对作品、创作者与录音身份；首次网页检索仍需网络访问。" });
      }
      const value = { ok: checks.every((item) => item.status === "ready"), checks };
      cached = { at: Date.now(), value };
      return value;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
