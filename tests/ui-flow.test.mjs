import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { analysisFixture, diveFixture } from "./fixtures/music-learning.mjs";
import { normalizeLegacyPackage } from "../server/evidenceStore.mjs";
const built = await build({
  stdin: {
    contents:
      'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./App"; createRoot(document.getElementById("root")).render(<App/>);',
    resolveDir: new URL("../", import.meta.url).pathname,
    loader: "tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  write: false,
  define: {
    "import.meta.env.VITE_ENABLE_LEGACY_UI": '"0"',
    "import.meta.env.VITE_BACKEND_API_BASE_URL": '""',
    "import.meta.env.VITE_SOURCE_REVISION": '"fixture-revision"',
    "process.env.NODE_ENV": '"production"',
  },
});
async function until(check) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("UI state did not settle");
}
function harness({ empty = false, failAnalysisNumber = 0, deepDiveProgress = false, analysisProgress = false, sourceVersionCues = false, legacyHistory = false, songs = [{ title: "测试歌曲", artist: "测试艺人" }] } = {}) {
  const errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    {
      url: "http://127.0.0.1:3000/",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: console,
    },
  );
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  let pkg = null,
    finishProposal = null,
    finishDeepDive = null,
    finishAnalysis = null;
  if (legacyHistory) {
    const analysis = analysisFixture();
    delete analysis.coverage;
    delete analysis.completionStatus;
    pkg = {
      schemaVersion: "1.1",
      analysisId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      persistent: true,
      analysis,
      evidenceReview: { claims: [], expressions: [], identitySupported: [], transcriptionSupported: false },
      sources: analysis.sources,
      deepDives: [],
      studioSessions: [],
    };
  }
  const analysisRequests = [];
  window.AbortController = globalThis.AbortController;
  window.crypto.randomUUID = crypto.randomUUID;
  window.fetch = async (raw, options = {}) => {
    const url = new URL(raw, window.location.href),
      data = options.body ? JSON.parse(options.body) : null;
    let value;
    if (url.pathname === "/api/agent/session") value = { token: "synthetic" };
    else if (url.pathname === "/api/agent/health") value = { ok: true };
    else if (url.pathname === "/api/music/search")
      value = { songs };
    else if (url.pathname === "/api/agent/analyses")
      value = pkg
        ? [
            {
              analysisId: pkg.analysisId,
              createdAt: pkg.createdAt,
              updatedAt: pkg.updatedAt,
              song: pkg.analysis.song,
              deepDiveCount: pkg.deepDives.length,
            },
          ]
        : [];
    else if (url.pathname === "/api/agent/analyze") {
      analysisRequests.push(data);
      if (analysisRequests.length === failAnalysisNumber)
        return { ok: false, status: 502, headers: { get: () => "application/json" }, json: async () => ({ error: "合成研究失败" }) };
      if (analysisProgress) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/event-stream" : null },
          body: new ReadableStream({
            start(stream) {
              const encode = (event, payload) => new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
              stream.enqueue(encode("progress", { stage: "compose", round: 2, label: "正在撰写三种概括和分模块解释" }));
              finishAnalysis = () => {
                const analysis = analysisFixture();
                const now = new Date().toISOString();
                pkg = { schemaVersion: "1.2", analysisId: crypto.randomUUID(), createdAt: now, updatedAt: now, persistent: true, analysis, sources: analysis.sources, deepDives: [], studioSessions: [] };
                stream.enqueue(encode("result", pkg));
                stream.close();
              };
            },
          }),
        };
      }
      const analysis = analysisFixture();
      analysis.userPerception = data.userPerception || null;
      if (sourceVersionCues) {
        analysis.modules[0].claims[0].scope = { level: "source_version", label: analysis.song.versionScope };
        analysis.modules[0].listeningCues = analysis.modules[0].listeningCues.map((cue) => ({ ...cue, scope: "source_version" }));
      }
      if (empty) {
        analysis.modules = [];
        analysis.song.identityStatus = "unresolved";
        analysis.coverage = analysis.coverage.map((item) => ({ ...item, status: "insufficient", moduleIds: [] }));
        analysis.completionStatus = "insufficient";
      }
      const now = new Date().toISOString();
      pkg = {
        schemaVersion: "1.1",
        analysisId: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        persistent: true,
        analysis,
        sources: analysis.sources,
        deepDives: [],
        studioSessions: [],
      };
      value = pkg;
    } else if (url.pathname === "/api/agent/deep-dive") {
      const dive = {
        deepDiveId: crypto.randomUUID(),
        analysisId: pkg.analysisId,
        createdAt: new Date().toISOString(),
        question: data.question,
        deepDive: diveFixture(data.analysisItemId),
      };
      if (deepDiveProgress) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/event-stream" : null },
          body: new ReadableStream({
            start(stream) {
              const encode = (event, payload) => new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
              stream.enqueue(encode("progress", { stage: "draft", round: 1, label: "正在整理深挖判断" }));
              finishDeepDive = () => {
                pkg.deepDives.push(dive);
                stream.enqueue(encode("result", dive));
                stream.close();
              };
            },
          }),
        };
      }
      pkg.deepDives.push(dive);
      value = dive;
    } else if (url.pathname.endsWith("/studio")) {
      pkg.studioSessions = [
        { deepDiveId: pkg.deepDives.at(-1).deepDiveId, session: data.session },
      ];
      value = data.session;
    } else if (url.pathname === "/api/agent/studio/propose") {
      return new Promise((resolve) => {
        finishProposal = () =>
          resolve({
              ok: true,
              status: 200,
              headers: { get: () => "application/json" },
            json: async () => ({
              baseRevisionId: data.baseRevisionId,
              code: 's("hh*16")',
              playback: pkg.studioSessions[0].session.revisions.at(-1).playback,
              explanation: "synthetic proposal",
            }),
          });
      });
    } else if (url.pathname.startsWith("/api/agent/analyses/")) value = pkg?.schemaVersion === "1.1" ? normalizeLegacyPackage(pkg) : pkg;
    else throw new Error("Unexpected fixture endpoint " + url.pathname);
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => structuredClone(value) };
  };
  const document = window.document;
  const button = (name) =>
    [...document.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === name,
    );
  const fill = (id, text) => {
    const element = document.getElementById(id);
    const proto =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, text);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const mount = () => {
    document.getElementById("root").replaceChildren();
    window.eval(built.outputFiles[0].text);
  };
  mount();
  return {
    analysisRequests,
    dom,
    document,
    button,
    fill,
    mount,
    errors,
    pkg: () => pkg,
    resolveProposal: () => finishProposal?.(),
    finishDeepDive: () => finishDeepDive?.(),
    finishAnalysis: () => finishAnalysis?.(),
    proposalPending: () => !!finishProposal,
  };
}
async function selectSong(ui) {
  await until(() => ui.document.getElementById("song-query"));
  ui.fill("song-query", "测试歌曲");
  await until(() => !ui.button("搜索歌曲").disabled);
  ui.button("搜索歌曲").click();
  await until(() => ui.document.querySelector(".song-choice"));
  ui.document.querySelector(".song-choice").click();
  await until(() => ui.document.querySelector(".overview"));
}
test("deep-dive progress events remain visible while the result is still running", async () => {
  const ui = harness({ deepDiveProgress: true });
  try {
    await selectSong(ui);
    ui.button("深入理解这个细节").click();
    await until(() => ui.document.querySelector(".busy")?.textContent.includes("正在整理深挖判断"));
    assert.match(ui.document.querySelector(".busy").textContent, /研究阶段 · 单点深挖/);
    assert.ok(ui.button("取消研究"));
    ui.finishDeepDive();
    await until(() => ui.document.querySelector("#pattern"));
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("round-two writing progress is shown as analysis, not as a supplement round", async () => {
  const ui = harness({ analysisProgress: true });
  try {
    await until(() => ui.document.getElementById("song-query"));
    ui.fill("song-query", "测试歌曲");
    await until(() => !ui.button("搜索歌曲").disabled);
    ui.button("搜索歌曲").click();
    await until(() => ui.document.querySelector(".song-choice"));
    ui.document.querySelector(".song-choice").click();
    await until(() => ui.document.querySelector(".busy")?.textContent.includes("正在撰写三种概括"));
    assert.match(ui.document.querySelector(".busy").textContent, /研究阶段 · 分析整理/);
    assert.doesNotMatch(ui.document.querySelector(".busy").textContent, /研究阶段 · 补检轮/);
    ui.finishAnalysis();
    await until(() => ui.document.querySelector(".overview"));
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("source-version listening cues are visibly attributed to that source version", async () => {
  const ui = harness({ sourceVersionCues: true });
  try {
    await selectSong(ui);
    assert.match(ui.document.querySelector(".listening-cues").textContent, /来源版本听歌线索/);
    assert.equal(ui.document.querySelectorAll(".listening-cues .tag").length, 1);
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("DOM search exposes all returned candidates beyond the first page", async () => {
  const songs = Array.from({ length: 50 }, (_, index) => ({
    id: String(index), title: "测试歌曲 " + index, artist: "测试艺人",
  }));
  const ui = harness({ songs });
  try {
    await until(() => ui.document.getElementById("song-query"));
    ui.fill("song-query", "测试艺人");
    await until(() => !ui.button("搜索歌曲").disabled);
    ui.button("搜索歌曲").click();
    await until(() => ui.document.querySelectorAll(".song-choice").length === 24);
    ui.button("显示更多歌曲").click();
    await until(() => ui.document.querySelectorAll(".song-choice").length === 48);
    ui.button("显示更多歌曲").click();
    await until(() => ui.document.querySelectorAll(".song-choice").length === 50);
    assert.equal(ui.button("显示更多歌曲"), undefined);
    assert.match(ui.document.body.textContent, /找到 50 个候选/);
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("a new research after restoring history sends no stale question and a failure does not display the previous analysis", async () => {
  const ui = harness({ failAnalysisNumber: 2 });
  try {
    await selectSong(ui);
    ui.pkg().analysis.userPerception = "上一首歌的历史问题";
    ui.mount();
    await until(() => ui.document.querySelector(".history-item"));
    ui.document.querySelector(".history-item").click();
    await until(() => ui.document.querySelector(".overview"));
    ui.fill("song-query", "下一首歌曲");
    await until(() => !ui.button("搜索歌曲").disabled);
    ui.button("搜索歌曲").click();
    await until(() => ui.document.querySelector(".song-choice"));
    ui.document.querySelector(".song-choice").click();
    await until(() => ui.document.querySelector('[role="alert"]'));
    assert.equal(ui.analysisRequests[1].userPerception, "");
    assert.equal(ui.document.querySelector(".overview"), null);
    assert.match(ui.document.querySelector('[role="alert"]').textContent, /合成研究失败/);
    assert.ok(ui.button("重新研究 测试歌曲"));
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("DOM flow: legacy 1.1 history with legacy review fields restores without crashing", async () => {
  const ui = harness({ legacyHistory: true });
  try {
    await until(() => ui.document.querySelector("details.history .history-item"));
    ui.document.querySelector("details.history").open = true;
    ui.document.querySelector(".history-item").click();
    await until(() => ui.document.querySelector(".overview"));
    assert.match(ui.document.body.textContent, /四个核心音乐维度|文化与背景/);
    assert.deepEqual(ui.errors, []);
  } finally { ui.dom.window.close(); }
});
test("DOM flow: selected-item deep dive, manual preview protection, saved tempo restoration, and AI cannot overwrite a new draft", async () => {
  const ui = harness();
  try {
    await selectSong(ui);
    assert.equal(ui.document.querySelectorAll(".core-dimension").length, 4);
    assert.match(ui.document.querySelector(".core-dimension").textContent, /资料不足|已有解读|听歌指导/);
    assert.equal(ui.document.querySelectorAll(".mode-tabs button").length, 3);
    const overviewTexts = [...ui.document.querySelectorAll(".mode-tabs button")].map((button) => {
      const key = button.textContent === "走心" ? "emo" : button.textContent === "上头" ? "hype" : "pro";
      return ui.pkg().analysis.overallVibe[key].text;
    });
    assert.equal(new Set(overviewTexts).size, 3);
    assert.match(ui.document.querySelector(".module-summary").textContent, /踩镲/);
    assert.match(ui.document.querySelector(".module-explanation").textContent, /稳定关系/);
    assert.match(ui.document.querySelector(".listening-cues").textContent, /跟着底鼓/);
    ui.button("深入理解这个细节").click();
    await until(() => ui.document.getElementById("pattern"));
    ui.fill("pattern", 's("hh*8")');
    await until(() => !ui.button("预览修改").disabled);
    ui.button("预览修改").click();
    await until(() => ui.button("应用这次修改"));
    ui.fill("pattern", 's("hh*12")');
    await until(() => ui.button("应用这次修改").disabled);
    ui.document.querySelector(".playback-controls input").id = "fixture-bpm";
    ui.fill("fixture-bpm", "144");
    ui.button("预览修改").click();
    await until(() => !ui.button("应用这次修改").disabled);
    ui.button("应用这次修改").click();
    await until(() => !ui.button("保存实验").disabled);
    ui.button("保存实验").click();
    await until(() =>
      ui.document.body.textContent.includes("提交的实验与版本历史已保存"),
    );
    assert.equal(
      ui.pkg().studioSessions[0].session.revisions.at(-1).code,
      's("hh*12")',
    );
    ui.fill("studio-question", "增加密度");
    await until(() => !ui.button("请求建议").disabled);
    ui.button("请求建议").click();
    await until(ui.proposalPending);
    ui.fill("pattern", 's("hh*24")');
    ui.resolveProposal();
    await until(() => ui.button("应用这次修改"));
    assert.equal(ui.button("应用这次修改").disabled, true);
    assert.equal(ui.document.getElementById("pattern").value, 's("hh*24")');
    ui.mount();
    await until(() => ui.document.querySelector(".history-item"));
    ui.document.querySelector(".history-item").click();
    await until(() => ui.document.getElementById("pattern"));
    assert.equal(ui.document.getElementById("pattern").value, 's("hh*12")');
    assert.equal(
      ui.document.querySelector(".playback-controls input").value,
      "144",
    );
    assert.match(
      ui.document.querySelector(".studio h2").textContent,
      /用户版本/,
    );
    ui.button("撤销").click();
    await until(() =>
      ui.document.getElementById("pattern").value.includes("bd*4"),
    );
    assert.match(
      ui.document.querySelector(".studio h2").textContent,
      /教学演示/,
    );
    assert.equal(
      ui.document.querySelector(".playback-controls input").value,
      "120",
    );
    assert.deepEqual(ui.errors, []);
  } finally {
    ui.dom.window.close();
  }
});
test("DOM flow: no song modules still provides a specific-question teaching experiment", async () => {
  const ui = harness({ empty: true });
  try {
    await selectSong(ui);
    assert.match(ui.document.body.textContent, /资料不足/);
    assert.equal(ui.document.querySelectorAll(".core-dimension").length, 4);
    ui.fill("explore-question", "如何比较节奏密度？");
    await until(() => !ui.button("探索这个问题").disabled);
    ui.button("探索这个问题").click();
    await until(() => ui.document.getElementById("pattern"));
    assert.equal(ui.pkg().deepDives[0].deepDive.analysisItemId, "question");
    assert.match(
      ui.document.querySelector(".studio h2").textContent,
      /教学演示/,
    );
    assert.deepEqual(ui.errors, []);
  } finally {
    ui.dom.window.close();
  }
});
