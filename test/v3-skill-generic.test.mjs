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
    "FFmpeg",
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      "generic skill should not contain " + forbidden,
    );
  }

  assert.match(text, /model-agnostic and host-agnostic/i);
  assert.match(text, /Four evidence classes/);
  assert.match(text, /Observation rules/);
  assert.match(text, /Measurement rules/);
  assert.match(text, /External evidence rules/);
  assert.match(text, /Interpretation rules/);
  assert.match(text, /Minimum-basis policy/);
  assert.match(text, /global_gain/);
  assert.match(text, /does not define an execution pipeline/i);
});
