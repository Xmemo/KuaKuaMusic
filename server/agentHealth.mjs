import { checkCodexAvailable, getCodexBridgeConfig, runCodexCommand } from "./codexBridge.mjs";
import { MUSICBRAINZ_MCP_URL } from "./researchConfig.mjs";
import { STRUDEL_RUNTIME_VERSION } from "../studio/runtimeConfig.mjs";
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
  const url = MUSICBRAINZ_MCP_URL;
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
        clientInfo: { name: "MusicLearning2026", version: "1.2" },
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
        ? runCodexCommand(["exec", "--help"]).catch(() => null)
        : null,
      probeMusicBrainz(),
    ]);
    const configured = configuration?.code === 0 &&
      ["--ignore-user-config", "--output-schema"].every((flag) =>
        configuration.stdout.includes(flag));
    const value = {
      ok: cli.available && login?.code === 0 && configured && musicBrainz === "ready",
      codexAvailable: cli.available,
      codexVersion: cli.version,
      model: getCodexBridgeConfig().model,
      reasoningEffort: getCodexBridgeConfig().reasoningEffort,
      authentication: login?.code === 0 ? "ready" : "unavailable",
      projectConfiguration: configured ? "explicit" : "unverified",
      musicBrainz,
      webResearch: "unverified",
      strudelRuntime: "bundled",
      strudelRuntimeVersion: STRUDEL_RUNTIME_VERSION,
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
