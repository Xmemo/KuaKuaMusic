import test from "node:test";
import assert from "node:assert/strict";
import { createRegisteredWebResearchBackend } from "../server/v2/registeredWebResearch.mjs";

function eventStream(value) {
  const event = (payload) => "data: " + JSON.stringify(payload) + "\n\n";
  return new Response(
    event({ choices: [{ delta: { content: "Research results: " + JSON.stringify(value) + " end" } }] }) +
      event({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
      "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function proposal(index) {
  return {
    title: "Source " + index,
    author: null,
    publisher: "Test publisher",
    sourceType: "analysis",
    url: "https://example.test/source-" + index,
    versionScope: "the composition",
    excerpts: [{
      text: "A verified example excerpt that is long enough.",
      locator: "paragraph 1",
      topics: ["culture"],
    }],
  };
}

test("registered-web discovers with Qwen native search and hard-caps page reads", async () => {
  const song = { title: "Song", artist: "Artist", album: null, releaseYear: null };
  const plan = {
    song: {
      title: song.title,
      artist: song.artist,
      album: song.album,
      releaseYear: song.releaseYear,
      versionScope: "selected catalog item: Song — Artist",
      identityStatus: "unresolved",
      candidates: [],
      musicBrainzRecordingId: null,
      musicBrainzWorkId: null,
      musicBrainzReleaseId: null,
    },
    questions: [],
    sources: Array.from({ length: 7 }, (_, index) => proposal(index + 1)),
    unknowns: ["No verified production source found."],
  };
  let requestBody;
  let registered;
  let fetchCalls = 0;
  const backend = createRegisteredWebResearchBackend({
    selection: { provider: "dashscope", model: "qwen3.8-omni-flash" },
    env: { DASHSCOPE_API_KEY: "test-key", DASHSCOPE_BASE_URL: "https://dashscope.test/v1" },
    fetcher: async (url, options) => {
      fetchCalls++;
      assert.equal(url, "https://dashscope.test/v1/chat/completions");
      requestBody = JSON.parse(options.body);
      return eventStream(plan);
    },
    register: async (proposals) => {
      registered = proposals;
      return { sources: [], unknowns: [] };
    },
  });

  const result = await backend.discover(song);
  assert.equal(fetchCalls, 1);
  assert.equal(requestBody.model, "qwen3.8-omni-flash");
  assert.equal(requestBody.enable_search, true);
  assert.deepEqual(requestBody.search_options, {
    search_strategy: "agent",
    forced_search: true,
  });
  assert.equal(requestBody.stream, true);
  assert.equal("response_format" in requestBody, false);
  assert.match(requestBody.messages[1].content, /at most 3 web searches/iu);
  assert.ok(requestBody.messages[1].content.length < 12000, "Research discovery prompt should omit unrelated legacy schema definitions");
  assert.equal(registered.length, 5);
  assert.equal(result.sources.length, 0);
  assert.deepEqual(result.unknowns, ["No verified production source found."]);
});

test("registered-web does not silently fall back to another model provider", () => {
  assert.throws(
    () => createRegisteredWebResearchBackend({
      selection: { provider: "codex-cli", model: "gpt-6-luna" },
    }),
    { code: "V2_WEB_SEARCH_PROVIDER_MISMATCH" },
  );
});
