// Explicit per-process settings also work in a fresh, untrusted checkout.
// Only this public metadata service is added to the research child process.
export const MUSICBRAINZ_MCP_URL = "https://musicbrainz.caseyjhand.com/mcp";
export const DEFAULT_RESEARCH_MODEL = "gpt-6-luna";
export const DEFAULT_REASONING_EFFORT = "xhigh";
export const MUSICBRAINZ_RESEARCH_TOOLS = [
  "musicbrainz_search_entities",
  "musicbrainz_get_release",
  "musicbrainz_get_recording",
  "musicbrainz_get_work",
];
export const researchConfigArgs = () => [
  "-c", 'approval_policy="never"',
  "-c", 'web_search="live"',
  "-c", "mcp_servers.musicbrainz.url=" + JSON.stringify(MUSICBRAINZ_MCP_URL),
  "-c", "mcp_servers.musicbrainz.enabled_tools=" + JSON.stringify(MUSICBRAINZ_RESEARCH_TOOLS),
];
