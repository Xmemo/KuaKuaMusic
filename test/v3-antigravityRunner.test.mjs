import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createAntigravityRunner } from "../server/v3/antigravityRunner.mjs";

function fakeSpawn(events, { exitCode = 0 } = {}) {
  return (_command, _args, _options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 143;
      child.emit("close", 143);
    };

    queueMicrotask(() => {
      for (const event of events)
        child.stdout.write(JSON.stringify(event) + "\n");
      child.stdout.end();
      child.stderr.end();
      child.exitCode = exitCode;
      child.emit("close", exitCode);
    });
    return child;
  };
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-agy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const skillPath = path.join(root, "skill.md");
  await fs.writeFile(skillPath, "# Generic skill");
  return { root, skillPath };
}

const config = {
  command: "agy",
  model: "gemini-3.8-flash-high",
  effort: "high",
  printTimeout: "20m",
  timeoutMs: 10_000,
  autoApprove: true,
  skill: { name: "music-analysis", version: "1.0.0" },
};

test("adapter parses structured output and records tool names", async (t) => {
  const ws = await workspace(t);
  const spawnImpl = fakeSpawn([
    {
      event: "step_update",
      step_update: {
        step_index: 2,
        state: "DONE",
        step_type: "tool",
        tool_name: "run_command",
        tool_info: { name: "run_command", parameters: {}, output: "ok" },
      },
    },
    {
      event: "result",
      result: {
        conversation_id: "c-1",
        status: "SUCCESS",
        structured_output: { hello: "world" },
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
    },
  ]);
  const runner = createAntigravityRunner({
    config,
    spawnImpl,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  const result = await runner.run({
    workspace: ws,
    prompt: "test",
  });
  assert.deepEqual(result.structuredOutput, { hello: "world" });
  assert.equal(result.conversationId, "c-1");
  assert.deepEqual(result.toolsUsed, ["run_command"]);
  assert.equal(result.usage.total_tokens, 15);

  const staged = await fs.readFile(
    path.join(
      ws.root,
      ".agents",
      "skills",
      "music-analysis",
      "SKILL.md",
    ),
    "utf8",
  );
  assert.equal(staged, "# Generic skill");
});

test("adapter rejects a terminal non-success result", async (t) => {
  const ws = await workspace(t);
  const runner = createAntigravityRunner({
    config,
    spawnImpl: fakeSpawn([
      {
        event: "result",
        result: {
          conversation_id: "c-2",
          status: "ERROR",
          error: "model failed",
        },
      },
    ]),
  });
  await assert.rejects(
    () => runner.run({ workspace: ws, prompt: "test" }),
    /状态 ERROR/,
  );
});
