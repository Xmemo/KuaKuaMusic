import { checkCodexAvailable, runCodexCommand } from "./codexBridge.mjs";
let cached = null,
  pending = null;
function parseRpc(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  const line = text
    .split("\n")
    .find((line) => line.startsWith("data:") && line.includes('"jsonrpc"'));
  return line ? JSON.parse(line.slice(5).trim()) : null;
}
export async function probeMusicBrainz(fetcher = fetch) {
  const url = "https://musicbrainz.caseyjhand.com/mcp";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const send = async (body) => {
    const result = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) throw new Error("MCP unavailable");
    const session = result.headers.get("mcp-session-id");
    if (session) headers["Mcp-Session-Id"] = session;
    return result.status === 202 ? null : parseRpc(await result.text());
  };
  try {
    const initialized = await send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "MusicLearning2026", version: "1.1" },
      },
    });
    if (!initialized?.result?.protocolVersion) return "unavailable";
    headers["MCP-Protocol-Version"] = initialized.result.protocolVersion;
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const tools = await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    return tools?.result?.tools?.length ? "ready" : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    if (headers["Mcp-Session-Id"])
      await fetcher(url, {
        method: "DELETE",
        headers,
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
  }
}
export async function getAgentHealth({ refresh = false } = {}) {
  if (!refresh && cached && Date.now() - cached.at < 30000) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const cli = await checkCodexAvailable();
    const [login, configuration, musicBrainz] = await Promise.all([
      cli.available
        ? runCodexCommand(["login", "status"]).catch(() => null)
        : null,
      cli.available
        ? runCodexCommand([
            "--ignore-user-config",
            "mcp",
            "list",
            "--json",
          ]).catch(() => null)
        : null,
      probeMusicBrainz(),
    ]);
    let configured = false;
    try {
      const value = JSON.parse(configuration?.stdout || "null");
      configured = JSON.stringify(value).includes(
        "musicbrainz.caseyjhand.com/mcp",
      );
    } catch {}
    const value = {
      ok: cli.available && login?.code === 0 && configured,
      codexAvailable: cli.available,
      codexVersion: cli.version,
      authentication: login?.code === 0 ? "ready" : "unavailable",
      projectConfiguration: configured ? "loaded" : "unverified",
      musicBrainz,
      webResearch: "unverified",
      strudelRuntime: "license_pending",
    };
    cached = { at: Date.now(), value };
    return value;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
