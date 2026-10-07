import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bus = path.join(
  repoRoot,
  "tools",
  "music-workflow",
  "session_bus.py",
);

function run(args, cwd = repoRoot) {
  return spawnSync("python3", [bus, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

test("session bus registers, claims queued browser work, completes, and returns to waiting", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-session-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runsRoot = path.join(root, "runs");
  const sessionRoot = path.join(root, "session");
  const runDir = path.join(runsRoot, "run-001");
  const requestFile = path.join(runDir, "browser-request.json");

  await writeJson(requestFile, {
    schemaVersion: "4.0",
    requestId: "request-001",
    kind: "analysis",
    runId: "run-001",
    status: "queued",
    interpretationId: null,
    queuedAt: "2026-10-07T12:00:00.000Z",
    createdAt: "2026-10-07T12:00:00.000Z",
    claimedAt: null,
    claimedBySessionId: null,
    completedAt: null,
    error: null,
  });

  const registered = run([
    "--session-root",
    sessionRoot,
    "register",
    "--session-id",
    "session-001",
  ]);
  assert.equal(registered.status, 0, registered.stderr);
  assert.equal(JSON.parse(registered.stdout).status, "waiting");

  const waited = run([
    "--session-root",
    sessionRoot,
    "wait",
    "--runs-root",
    runsRoot,
    "--timeout",
    "1",
  ]);
  assert.equal(waited.status, 0, waited.stderr);
  const claimed = JSON.parse(waited.stdout);
  assert.equal(claimed.kind, "analysis");
  assert.equal(claimed.requestId, "request-001");
  assert.equal(claimed.runId, "run-001");
  assert.equal(claimed.requestFile, requestFile);

  const requestAfterClaim = JSON.parse(await fs.readFile(requestFile, "utf8"));
  assert.equal(requestAfterClaim.status, "claimed");
  assert.equal(requestAfterClaim.claimedBySessionId, "session-001");

  const processing = JSON.parse(
    await fs.readFile(path.join(sessionRoot, "orchestrator.json"), "utf8"),
  );
  assert.equal(processing.status, "processing");
  assert.equal(processing.activeRunId, "run-001");
  assert.equal(processing.activeKind, "analysis");

  const completed = run([
    "--session-root",
    sessionRoot,
    "complete",
    "--request-file",
    requestFile,
    "--status",
    "completed",
  ]);
  assert.equal(completed.status, 0, completed.stderr);

  const requestAfterComplete = JSON.parse(
    await fs.readFile(requestFile, "utf8"),
  );
  assert.equal(requestAfterComplete.status, "completed");
  assert.equal(typeof requestAfterComplete.completedAt, "string");

  const waiting = JSON.parse(
    await fs.readFile(path.join(sessionRoot, "orchestrator.json"), "utf8"),
  );
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.activeRunId, null);
  assert.equal(waiting.activeKind, null);
});

test("session bus returns idle_timeout without inventing work", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v4-idle-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runsRoot = path.join(root, "runs");
  const sessionRoot = path.join(root, "session");
  await fs.mkdir(runsRoot, { recursive: true });

  const waited = run([
    "--session-root",
    sessionRoot,
    "wait",
    "--runs-root",
    runsRoot,
    "--timeout",
    "0.05",
    "--poll-sec",
    "0.01",
    "--heartbeat-sec",
    "0.01",
  ]);
  assert.equal(waited.status, 0, waited.stderr);
  const payload = JSON.parse(waited.stdout);
  assert.equal(payload.kind, "idle_timeout");

  const session = JSON.parse(
    await fs.readFile(path.join(sessionRoot, "orchestrator.json"), "utf8"),
  );
  assert.equal(session.status, "waiting");
});
