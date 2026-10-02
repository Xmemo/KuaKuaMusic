import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/proxy.mjs";
import { runCodexCommand, runCodexStructured } from "../server/codexBridge.mjs";
import { probeMusicBrainz, getAgentHealth } from "../server/agentHealth.mjs";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "music-local-test-"));
after(() => fs.rm(temp, { recursive: true, force: true }));
test("loopback boundary and session authorization block research before invocation; concurrent work and cancellation are bounded", async () => {
  let calls = 0,
    aborted = false,
    entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const app = createApp({
    port: 8787,
    analyze: async (_input, { signal }) => {
      calls++;
      entered();
      await new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    },
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  const request = (route, options = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        url + route,
        {
          method: options.method || "GET",
          signal: options.signal,
          headers: { Host: "127.0.0.1:8787", ...options.headers },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              json: async () => JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  try {
    assert.equal(
      (
        await request("/api/agent/session", {
          headers: { Host: "attacker.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/agent/session", {
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/agent/session", {
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/agent/analyze", { method: "POST" })).status,
      401,
    );
    assert.equal(calls, 0);
    const token = (await (await request("/api/agent/session")).json()).token;
    const options = {
      method: "POST",
      headers: {
        "X-Music-Learning-Token": token,
        "Content-Type": "application/json",
      },
      body: "{}",
    };
    const controller = new AbortController();
    const first = request("/api/agent/analyze", {
      ...options,
      signal: controller.signal,
    }).catch((error) => error);
    await started;
    assert.equal((await request("/api/agent/analyze", options)).status, 409);
    assert.equal(calls, 1);
    controller.abort();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(aborted, true);
    assert.equal(
      (await request("/api/agnes/chat", { method: "POST" })).status,
      404,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test("bridge bounds output, timeout and cancellation; nonzero exit does not expose provider diagnostics", async () => {
  const bin = path.join(temp, "codex-fixture");
  await fs.writeFile(
    bin,
    "#!" +
      process.execPath +
      "\n" +
      [
        "if (process.argv.includes('unicode')) { const b = Buffer.from('来源'); process.stdout.write(b.subarray(0,1)); setTimeout(() => process.stdout.write(b.subarray(1)), 20); }",
        "else if (process.argv.includes('large')) process.stdout.write('x'.repeat(10000));",
        "else if (process.argv.includes('hang')) setInterval(() => {}, 1000);",
        "else if (process.argv.includes('exec')) { process.stderr.write('PRIVATE_PROVIDER_DIAGNOSTIC'); process.exit(1); }",
        "else process.stdout.write('fixture-cli');",
      ].join("\n"),
  );
  await fs.chmod(bin, 0o700);
  process.env.CODEX_BIN = bin;
  try {
    assert.equal((await runCodexCommand(["--version"])).stdout, "fixture-cli");
    assert.equal((await runCodexCommand(["unicode"])).stdout, "来源");
    await assert.rejects(
      runCodexCommand(["large"], { maxBytes: 100 }),
      (error) => error.code === "AGENT_OUTPUT_LIMIT",
    );
    await assert.rejects(
      runCodexCommand(["hang"], { timeoutMs: 40 }),
      (error) => error.code === "AGENT_TIMEOUT",
    );
    const controller = new AbortController();
    const request = runCodexCommand(["hang"], { signal: controller.signal });
    controller.abort();
    await assert.rejects(request, (error) => error.code === "CANCELLED");
    await assert.rejects(
      runCodexStructured({ prompt: "fixture", outputSchema: "/fixture.json" }),
      (error) =>
        error.code === "AGENT_FAILED" &&
        !error.message.includes("PRIVATE_PROVIDER"),
    );
  } finally {
    delete process.env.CODEX_BIN;
  }
});
test("MCP doctor tests initialize and tools/list and cleans up its session", async () => {
  const methods = [];
  const fetcher = async (_url, options) => {
    if (options.method === "DELETE") {
      methods.push("DELETE");
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(options.body);
    methods.push(body.method);
    if (body.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result:
          body.method === "initialize"
            ? { protocolVersion: "2025-03-26" }
            : { tools: [{ name: "recording" }] },
      }),
      { headers: { "mcp-session-id": "fixture-session" } },
    );
  };
  assert.equal(await probeMusicBrainz(fetcher), "ready");
  assert.deepEqual(methods, [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "DELETE",
  ]);
  assert.equal(
    await probeMusicBrainz(async () => {
      throw new Error("unavailable");
    }),
    "unavailable",
  );
});

test("structured research receives MusicBrainz explicitly in an untrusted checkout", async () => {
  const bin = path.join(temp, "codex-config-fixture");
  await fs.writeFile(bin, "#!" + process.execPath + "\n" +
    "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(JSON.stringify({args:process.argv.slice(2)})));\n");
  await fs.chmod(bin, 0o700);
  process.env.CODEX_BIN = bin;
  try {
    const { args } = await runCodexStructured({ prompt: "fixture", outputSchema: "/fixture.json" });
    assert.equal(args[0], "exec");
    assert.ok(args.includes("--ignore-user-config"));
    assert.ok(args.includes('mcp_servers.musicbrainz.url="https://musicbrainz.caseyjhand.com/mcp"'));
    assert.ok(args.includes('web_search="live"'));
    assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
    assert.ok(!args.some((arg) => arg.includes("trust_level")));
  } finally { delete process.env.CODEX_BIN; }
});

test("health uses supported exec diagnostics and requires a reachable MCP", async () => {
  const bin = path.join(temp, "codex-health-fixture");
  await fs.writeFile(bin, "#!" + process.execPath + "\n" + [
    "const args=process.argv.slice(2);",
    "if(args.join(' ')==='--version') process.stdout.write('codex-fixture');",
    "else if(args.join(' ')==='login status') process.stderr.write('Logged in');",
    "else if(args.join(' ')==='exec --help') process.stdout.write('--ignore-user-config --output-schema');",
    "else process.exit(1);",
  ].join("\n"));
  await fs.chmod(bin, 0o700);
  const previousFetch = globalThis.fetch;
  process.env.CODEX_BIN = bin;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result:
        body.method === "initialize" ? { protocolVersion: "2025-03-26" } :
          { tools: [{ name: "search_recordings" }] } }));
    };
    const healthy = await getAgentHealth({ refresh: true });
    assert.equal(healthy.ok, true);
    assert.equal(healthy.projectConfiguration, "explicit");
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal((await getAgentHealth({ refresh: true })).ok, false);
  } finally { globalThis.fetch = previousFetch; delete process.env.CODEX_BIN; }
});
