import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("music-analysis skill is not tied to a model, runner, or product runtime", async () => {
  const text = await fs.readFile(
    new URL("../.agents/skills/music-analysis/SKILL.md", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "Gemini",
    "Antigravity",
    "Qwen",
    "DashScope",
    "SiliconFlow",
    "KuaKuaMusic",
    "Strudel",
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      "generic skill should not contain " + forbidden,
    );
  }

  assert.match(text, /model-agnostic and host-agnostic/i);
  assert.match(text, /Phase A — Listen first/);
  assert.match(text, /Phase B — Measure only when useful/);
  assert.match(text, /Phase C — Research after the listening checkpoint/);
  assert.match(text, /No MCP server or plugin is required/);
});
