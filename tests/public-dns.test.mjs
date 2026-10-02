import test from "node:test";
import assert from "node:assert/strict";
import { resolvePublicAddresses } from "../server/publicDns.mjs";

test("fake-IP DNS uses a public resolver and validates its answer", async () => {
  let calls = 0;
  const lookup = async () => [{ address: "198.18.0.20", family: 4 }];
  const publicLookup = async (host) => {
    calls++;
    assert.equal(host, "example.org");
    return [{ address: "93.184.215.14", family: 4 }];
  };
  assert.deepEqual(await resolvePublicAddresses("example.org", { lookup, publicLookup }),
    [{ address: "93.184.215.14", family: 4 }]);
  assert.equal(calls, 1);
  await assert.rejects(resolvePublicAddresses("example.org", {
    lookup, publicLookup: async () => [{ address: "127.0.0.1", family: 4 }],
  }), (error) => error.code === "UNSAFE_SOURCE");
  await assert.rejects(resolvePublicAddresses("example.org", {
    lookup, publicLookup: async () => [],
  }));
});

test("private, mixed and literal reserved answers cannot trigger a fallback", async () => {
  for (const addresses of [
    ["10.0.0.1"], ["127.0.0.1"], ["169.254.169.254"],
    ["198.18.0.20", "192.168.1.1"], ["8.8.8.8", "127.0.0.1"],
  ]) {
    await assert.rejects(resolvePublicAddresses("example.org", {
      lookup: async () => addresses.map((address) => ({ address, family: 4 })),
      publicLookup: async () => assert.fail("must not query fallback"),
    }), (error) => error.code === "UNSAFE_SOURCE");
  }
  await assert.rejects(resolvePublicAddresses("198.18.0.20", {
    publicLookup: async () => assert.fail("must not query literal fallback"),
  }));
});
