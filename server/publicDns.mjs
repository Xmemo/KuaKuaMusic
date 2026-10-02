import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { AppError } from "./errors.mjs";

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 6)
    return /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^(?:2001:db8:|2002:)/i.test(address);
  if (family !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function queryPublicDns(host, { signal } = {}) {
  // Fixed resolver and fixed connection address: local fake-IP DNS cannot
  // redirect the resolver itself. TLS still verifies cloudflare-dns.com.
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.search = new URLSearchParams({ name: host, type: "A" }).toString();
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      signal,
      headers: { Accept: "application/dns-json" },
      lookup: (_host, options, callback) => options?.all
        ? callback(null, [{ address: "1.1.1.1", family: 4 }])
        : callback(null, "1.1.1.1", 4),
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error("Public DNS unavailable"));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 65536) request.destroy(new Error("DNS response too large"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (result.Status !== 0) throw new Error("Public DNS lookup failed");
          resolve((result.Answer || []).filter((entry) => entry.type === 1)
            .map((entry) => ({ address: entry.data, family: 4 })));
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("DNS timed out")), 5000);
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
    request.end();
  });
}

export async function resolvePublicAddresses(host, {
  signal, lookup = dns.lookup, publicLookup = queryPublicDns,
} = {}) {
  if (signal?.aborted) throw new AppError("请求已取消。", "CANCELLED", 499);
  const literal = net.isIP(host);
  let addresses = literal
    ? [{ address: host, family: literal }]
    : await lookup(host, { all: true });
  const synthetic = (address) => /^198\.(?:18|19)\./.test(address);
  if (!literal && addresses.length && addresses.every((entry) => synthetic(entry.address)))
    addresses = await publicLookup(host, { signal });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new AppError("来源解析到了非公开网络。", "UNSAFE_SOURCE", 422);
  return addresses;
}
