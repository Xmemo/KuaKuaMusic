import test from "node:test";
import assert from "node:assert/strict";
import {
  readDashScopeStreamText,
} from "../server/v2/dashscopeAudioProvider.mjs";

test("DashScope SSE chunks are aggregated into one JSON string", async () => {
  const body = [
    'data: {"choices":[{"delta":{"content":"{\\\"global"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"Profile\\\":{}}"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  const response = new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  const text = await readDashScopeStreamText(response);
  assert.equal(text, '{"globalProfile":{}}');
});
