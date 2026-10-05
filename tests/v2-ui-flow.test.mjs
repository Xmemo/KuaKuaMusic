import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";

const built = await build({
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./V2App"; createRoot(document.getElementById("root")).render(<App/>);',
    resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx" },
  bundle: true, format: "iife", platform: "browser", write: false,
  define: { "import.meta.env": '{}', "process.env.NODE_ENV": '"production"' },
});
const song = { title: "测试歌曲", artist: "测试艺人", album: "Studio" };
const candidate = { sourceId: "yt-1", title: "正确录音", channel: "Artist - Topic", url: "https://youtube.com/watch?v=test", durationSec: 120, matchScore: 0.94 };
const completed = {
  status: "complete", songId: "song-1", materialization: { reused: true, mediaRevisionId: "media-1", source: { ...candidate, decision: "manual_selected" }, identityWarning: null },
  cache: { audio: true, listen: true, research: true }, observation: { provider: { model: "qwen-test" }, globalProfile: { overallCharacter: "脉冲", styleTags: [], moodTags: [] },
    notableMoments: [], observations: [{ id: "obs-1", category: "rhythm", statement: "节奏加密", startSec: 70, endSec: 85, confidence: 0.8 }], uncertainties: [] },
  research: { summary: "作品背景", findings: [{ id: "fact-1", topic: "culture", text: "背景资料", scope: "work", versionScope: "作品而非特定录音", evidenceIds: ["ev-1"] }], unknowns: ["录音年份未知"] },
  analysis: { overallVibe: { hook: { text: "测试钩子" }, emo: { text: "走心概括" }, hype: { text: "上头概括" }, pro: { text: "懂行概括" } },
    interpretations: [{ id: "int-1", text: "机制解释", observationIds: ["obs-1"], evidenceIds: ["ev-1"], generalPrinciples: ["重复建立预期"] }],
    modules: [{ id: "mod-1", category: "rhythm", title: "律动机制", summary: "特点", interpretationIds: ["int-1"], listeningCues: [{ text: "听加密", startSec: 75, endSec: 80 }], unknowns: ["拍号未确认"], studioPotential: "none" }], unknowns: ["和弦未确认"] },
  sources: [{ id: "src-1", title: "已读来源", url: "https://example.invalid/source", versionScope: "作品", retrievedAt: "2026-10-05T00:00:00Z", excerpts: [{ id: "ev-1", text: "实际读到的片段", locator: "正文", topics: ["culture"] }] }], creative: null, warnings: [],
};
async function until(check) {
  for (let i = 0; i < 150; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 10)); }
  throw new Error("v2 UI state did not settle");
}
function harness(t, analyze, { songs = [song], search } = {}) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://127.0.0.1:3001", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.AbortController = AbortController; window.TextDecoder = TextDecoder;
  const requests = [];
  window.fetch = async (raw, options = {}) => {
    const url = new URL(raw, window.location.href);
    if (url.pathname === "/api/agent/session") return Response.json({ token: "synthetic" });
    if (url.pathname === "/api/agent/v2/health") return Response.json({ ok: false, checks: [{ id: "dashscope", label: "DASHSCOPE_API_KEY", status: "missing", message: "请配置本机密钥" }] });
    if (url.pathname === "/api/music/search") return search ? search(options) : Response.json({ songs });
    if (url.pathname === "/api/agent/v2/analyze") {
      const body = JSON.parse(options.body); requests.push(body); return analyze(body, options, requests.length);
    }
    throw new Error("Unexpected request: " + url.pathname);
  };
  window.eval(built.outputFiles[0].text);
  const document = window.document;
  const button = (text) => [...document.querySelectorAll("button")].find((entry) => entry.textContent === text);
  async function start() {
    await until(() => document.querySelector("input"));
    const input = document.querySelector("input");
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "测试歌曲");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await until(() => !button("搜索歌曲").disabled); button("搜索歌曲").click();
    await until(() => document.querySelector(".song-choice")); document.querySelector(".song-choice").click();
  }
  return { window, document, errors, requests, button, start };
}

test("v2 displays configuration gaps, actual source, cache hits, all core dimensions and scoped limits", async (t) => {
  const ui = harness(t, async () => Response.json(completed)); await ui.start();
  await until(() => ui.document.body.textContent.includes("本轮分析的录音音源"));
  const text = ui.document.body.textContent;
  assert.match(text, /DASHSCOPE_API_KEY：未就绪/);
  assert.equal(ui.document.querySelector('details.panel').open, true);
  assert.equal(ui.document.querySelector('a[href="https://youtube.com/watch?v=test"]').textContent, "正确录音");
  assert.match(text, /实测 2:00/); assert.match(text, /Listen 复用/); assert.match(text, /Research 复用/);
  for (const label of ["文化与背景", "和声", "律动", "音色", "资料不足", "已有解读"]) assert.ok(text.includes(label));
  for (const limit of ["拍号未确认", "和弦未确认", "录音年份未知", "作品而非特定录音", "实际读到的片段"]) assert.ok(text.includes(limit));
  ui.button("上头").click(); await until(() => ui.document.querySelector(".vibe").textContent === "上头概括");
  ui.button("更换音源").click(); await until(() => ui.requests.length === 2);
  assert.equal(ui.requests[1].forceRematch, true); assert.equal(ui.requests[1].selectedSourceId, null);
  assert.deepEqual(ui.errors, []);
});

test("v2 confirmation shows an independent source link and reason before selecting a source", async (t) => {
  const ui = harness(t, async (_, __, count) => Response.json(count === 1 ? { status: "confirmation_required", candidates: [candidate], reason: "实测时长不符" } : completed));
  await ui.start(); await until(() => ui.document.body.textContent.includes("打开音源核对"));
  assert.match(ui.document.body.textContent, /实测时长不符/);
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.document.querySelector('a[href="https://youtube.com/watch?v=test"]').closest("button"), null);
  [...ui.document.querySelectorAll("button")].find((entry) => entry.textContent.includes("正确录音")).click();
  await until(() => ui.requests.length === 2); assert.equal(ui.requests[1].selectedSourceId, "yt-1");
});

test("v2 stream failures display the real failed stage and cancellation settles without an error", async (t) => {
  const ui = harness(t, async () => new Response('event: error\ndata: {"stage":"listening","error":"模型调用失败"}\n\n', { headers: { "content-type": "text/event-stream" } }));
  await ui.start(); await until(() => ui.document.querySelector('[role="alert"]'));
  assert.equal(ui.document.querySelector('[role="alert"]').textContent, "listening：模型调用失败");
  const cancel = harness(t, async (_, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })));
  await cancel.start(); await until(() => cancel.requests.length === 1 && cancel.button("取消")); cancel.button("取消").click();
  await until(() => !cancel.document.querySelector('[role="status"]'));
  assert.equal(cancel.document.querySelector('[role="alert"]'), null);
});

test("v2 search exposes candidates beyond the first sixty and search can be cancelled", async (t) => {
  const ui = harness(t, async () => Response.json(completed), { songs: Array.from({ length: 61 }, (_, index) => ({ ...song, title: "歌曲" + index })) });
  await until(() => ui.document.querySelector("input"));
  const input = ui.document.querySelector("input");
  Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype, "value").set.call(input, "test");
  input.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  await until(() => !ui.button("搜索歌曲").disabled); ui.button("搜索歌曲").click();
  await until(() => ui.button("显示更多候选"));
  assert.equal(ui.document.querySelectorAll(".song-choice").length, 60);
  ui.button("显示更多候选").click(); await until(() => ui.document.querySelectorAll(".song-choice").length === 61);
  assert.match(ui.document.body.textContent, /歌曲60/);
  let requested = false;
  const cancel = harness(t, async () => Response.json(completed), { search: async (options) => {
    requested = true; return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  } });
  await until(() => cancel.document.querySelector("input"));
  const field = cancel.document.querySelector("input");
  Object.getOwnPropertyDescriptor(cancel.window.HTMLInputElement.prototype, "value").set.call(field, "test");
  field.dispatchEvent(new cancel.window.Event("input", { bubbles: true }));
  await until(() => !cancel.button("搜索歌曲").disabled); cancel.button("搜索歌曲").click();
  await until(() => requested && cancel.button("取消")); cancel.button("取消").click();
  await until(() => !cancel.document.querySelector('[role="status"]'));
  assert.equal(cancel.document.querySelector('[role="alert"]'), null);
});
