import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
import { load } from "cheerio";
import { AppError } from "./errors.mjs";

export const normalizeEvidenceText = (value) =>
  String(value).normalize("NFKC").replace(/\s+/gu, " ").trim();
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(address) &&
      !/^(?:2001:db8:|2002:)/i.test(address)
    );
  if (family !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 0 && c === 2))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113)
  );
}
function sourceUrl(value) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  ) {
    throw new AppError("来源地址不属于公开网页。", "UNSAFE_SOURCE", 422);
  }
  url.hash = "";
  return url;
}
let nextMusicBrainzAt = 0;
async function respectMetadataRate(url, signal) {
  if (!url.hostname.endsWith("musicbrainz.org")) return;
  const now = Date.now(),
    wait = Math.max(0, nextMusicBrainzAt - now);
  nextMusicBrainzAt = Math.max(now, nextMusicBrainzAt) + 1100;
  if (wait)
    await new Promise((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, wait);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        reject(new AppError("请求已取消。", "CANCELLED", 499));
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
}
export async function readPublicSource(value, { signal, redirects = 0 } = {}) {
  if (signal?.aborted) throw new AppError("请求已取消。", "CANCELLED", 499);
  if (redirects > 3) throw new Error("Too many redirects");
  const url = sourceUrl(value),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
    throw new AppError("来源解析到了非公开网络。", "UNSAFE_SOURCE", 422);
  await respectMetadataRate(url, signal);
  // Pin the validated address to this request; do not re-resolve on connection.
  const result = await new Promise((resolve, reject) => {
    const selected = addresses[0];
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        signal,
        headers: {
          "User-Agent":
            "MusicLearning2026/1.1 (https://github.com/Xmemo/KuaKuaMusic)",
          Accept: "text/html,application/json,text/plain",
        },
        lookup: (_hostname, options, callback) =>
          options?.all
            ? callback(null, [selected])
            : callback(null, selected.address, selected.family),
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          response.headers.location
        ) {
          response.resume();
          resolve({ redirect: new URL(response.headers.location, url).href });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(new Error("HTTP " + response.statusCode));
          return;
        }
        const type = response.headers["content-type"] || "";
        if (
          !/(?:text\/(?:html|plain)|application\/(?:json|ld\+json|xhtml\+xml))/i.test(
            type,
          )
        ) {
          response.resume();
          reject(new Error("Unsupported document type"));
          return;
        }
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2_000_000)
            request.destroy(new Error("Document too large"));
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () =>
          resolve({
            url: url.href,
            type,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("Source read timed out")),
      8000,
    );
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
    request.end();
  });
  if (result.redirect)
    return readPublicSource(result.redirect, {
      signal,
      redirects: redirects + 1,
    });
  if (/html/i.test(result.type)) {
    const $ = load(result.body);
    $("script,style,noscript,svg").remove();
    return {
      url: result.url,
      text: normalizeEvidenceText($("body").text()),
      title: $("title").text().trim(),
    };
  }
  return {
    url: result.url,
    text: normalizeEvidenceText(result.body),
    title: null,
  };
}
export async function registerSources(
  proposals,
  { existing = [], reader = readPublicSource, signal } = {},
) {
  const registered = new Map(existing.map((s) => [s.id, s]));
  const unknowns = [];
  const unique = [...new Map(proposals.map((p) => [p.url, p])).values()].slice(
    0,
    8,
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, unique.length) }, async () => {
      while (cursor < unique.length) {
        const proposal = unique[cursor++];
        try {
          const doc = await reader(proposal.url, { signal });
          const normalized = normalizeEvidenceText(doc.text),
            documentHash = digest(normalized);
          const id =
            "src-" +
            digest(
              doc.url + "\n" + documentHash + "\n" + proposal.versionScope,
            ).slice(0, 24);
          const excerpts = [];
          for (const candidate of proposal.excerpts.slice(0, 6)) {
            const text = normalizeEvidenceText(candidate.text);
            if (
              text.length < 12 ||
              text.length > 600 ||
              !normalized.includes(text)
            )
              continue;
            const topics =
              proposal.sourceType === "musicbrainz"
                ? candidate.topics.filter((t) => t === "identity")
                : candidate.topics;
            if (!topics.length) continue;
            excerpts.push({
              id:
                "ev-" +
                digest(id + "\n" + text + "\n" + topics.join("|")).slice(0, 24),
              text,
              locator: candidate.locator.slice(0, 500),
              topics,
            });
          }
          if (!excerpts.length) {
            unknowns.push("未能在读取的资料中定位支撑片段：" + proposal.title);
            continue;
          }
          const source = {
            id,
            title: doc.title || proposal.title,
            author: proposal.author,
            publisher: proposal.publisher,
            sourceType: proposal.sourceType,
            url: doc.url,
            versionScope: proposal.versionScope,
            documentHash,
            retrievedAt: new Date().toISOString(),
            excerpts: [...new Map(excerpts.map((e) => [e.id, e])).values()],
          };
          const previous = registered.get(id);
          if (previous) {
            source.retrievedAt = previous.retrievedAt;
            source.excerpts = [
              ...new Map(
                [...previous.excerpts, ...excerpts].map((e) => [e.id, e]),
              ).values(),
            ];
          }
          registered.set(id, source);
        } catch (error) {
          if (signal?.aborted)
            throw new AppError("请求已取消。", "CANCELLED", 499);
          unknowns.push("资料暂不可读取，未作为依据使用：" + proposal.title);
        }
      }
    }),
  );
  return { sources: [...registered.values()], unknowns };
}
