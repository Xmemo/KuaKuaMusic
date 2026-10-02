// Explicit per-process settings also work in a fresh, untrusted checkout.
// Only this public metadata service is added to the research child process.
export const MUSICBRAINZ_MCP_URL = "https://musicbrainz.caseyjhand.com/mcp";
export const researchConfigArgs = () => [
  "-c", 'approval_policy="never"',
  "-c", 'web_search="live"',
  "-c", "mcp_servers.musicbrainz.url=" + JSON.stringify(MUSICBRAINZ_MCP_URL),
];
