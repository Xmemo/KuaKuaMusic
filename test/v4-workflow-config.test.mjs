import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function read(relative) {
  return fs.readFile(new URL("../" + relative, import.meta.url), "utf8");
}

test("generic music-analysis skill stays model/host/product agnostic", async () => {
  const text = await read(".agents/skills/music-analysis/SKILL.md");
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
  assert.match(text, /observation/i);
  assert.match(text, /measurement/i);
  assert.match(text, /external evidence/i);
  assert.match(text, /interpretation/i);
  assert.match(text, /global_gain/);
});

test("orchestrator explicitly delegates three specialist branches concurrently", async () => {
  const text = await read(
    ".agents/agents/music-analysis-orchestrator/agent.md",
  );
  assert.match(text, /invoke_subagent/);
  assert.match(text, /concurrently in one/i);
  for (const name of [
    "music-acoustic-analyst",
    "music-listener",
    "music-researcher",
  ]) {
    assert.match(text, new RegExp(name));
  }
  assert.match(text, /model:\s*inherit/);
  assert.match(text, /music-creative/);
});

test("specialist toolsets enforce acoustic/listen/research isolation", async () => {
  const acoustic = await read(
    ".agents/agents/music-acoustic-analyst/agent.md",
  );
  const listener = await read(".agents/agents/music-listener/agent.md");
  const researcher = await read(
    ".agents/agents/music-researcher/agent.md",
  );

  assert.match(acoustic, /run_command/);
  assert.doesNotMatch(acoustic, /\n\s*- search_web/);
  assert.match(acoustic, /audio_metrics\.py/);
  assert.match(acoustic, /model:\s*inherit/);

  assert.doesNotMatch(listener, /\n\s*- run_command/);
  assert.doesNotMatch(listener, /\n\s*- search_web/);
  assert.match(listener, /model:\s*inherit/);
  assert.match(listener, /must \*\*not\*\* read:/i);

  assert.match(researcher, /\n\s*- search_web/);
  assert.match(researcher, /\n\s*- read_url_content/);
  assert.doesNotMatch(researcher, /\n\s*- run_command/);
  assert.match(researcher, /must \*\*not\*\* read:/i);
  assert.match(researcher, /model:\s*inherit/);
});

test("all specialist agents explicitly disable MCP configuration", async () => {
  for (const name of [
    "music-acoustic-analyst",
    "music-listener",
    "music-researcher",
    "music-creative",
  ]) {
    const text = await read(
      ".agents/agents/" + name + "/agent.md",
    );
    assert.match(text, /mcpServers:\s*\[\]/);
    assert.match(text, /subagent:\s*true/);
    assert.match(text, /mainAgent:\s*false/);
  }
});
