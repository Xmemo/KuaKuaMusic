import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createStructuredTextProvider } from "../server/v2/textProvider.mjs";
import { readProviderText } from "../server/v2/providerTransport.mjs";
import { createDashScopeAudioProvider } from "../server/v2/dashscopeAudioProvider.mjs";
import { createSongLibrary, deriveCatalogIdentityKey } from "../server/v2/songLibrary.mjs";
import { createV2Service } from "../server/v2/v2Service.mjs";
import { createYouTubeAudioProvider } from "../server/v2/youtubeAudioProvider.mjs";
import {
  removeUnsupportedNotableMoments,
  validateMusicObservation,
  validateTimedCue,
} from "../server/v2/observationValidation.mjs";
import { createV2Preflight } from "../server/v2/preflight.mjs";
import { resolveProviderPlan } from "../music-learning/v2/providerRegistry.mjs";
import { chooseAudioSource } from "../music-learning/v2/sourceMatcher.mjs";
import { createStrudelSeedPass } from "../server/v2/strudelSeedPass.mjs";
import { createCreativePass } from "../server/v2/creativePass.mjs";
import { createCriticPass } from "../server/v2/criticPass.mjs";
import { createResearchPass } from "../server/v2/researchPass.mjs";
import { DASHSCOPE_LISTEN_PROMPT_VERSION } from "../server/v2/dashscopeAudioProvider.mjs";
import { RESEARCH_PROMPT_VERSION } from "../server/v2/researchPass.mjs";

const song = { title: "Test Song", artist: "Artist", album: "Studio", durationSec: 120 };
const env = { DASHSCOPE_API_KEY: "synthetic-test-key", DASHSCOPE_BASE_URL: "https://example.invalid/v1" };
const creativeDraft = { title: "test", concept: "test", sourceObservationIds: [], sourceInterpretationIds: [],
  variables: [], preserve: [], listenFor: [], limitations: [], studioEligible: false };

function observation() {
  return { schemaVersion: "2.0", listenRunId: "listen-1", songId: "song-1", mediaRevisionId: "media-1",
    createdAt: new Date().toISOString(), provider: { name: "dashscope", model: "qwen3.5-omni-plus", promptVersion: "test" },
    globalProfile: { styleTags: [], moodTags: [], overallCharacter: "脉冲与密度变化", confidence: 0.8 },
    timeline: { durationSec: 120, sections: [{ id: "section-1", startSec: 0, endSec: 120, label: "other", description: "测试段落", confidence: 0.7 }] },
    observations: [{ id: "obs-1", category: "rhythm", statement: "脉冲加密", startSec: 70, endSec: 85, tags: [], confidence: 0.8, precision: "time_localized" }],
    notableMoments: [{ id: "moment-1", startSec: 75, endSec: 80, salience: 0.8, title: "加密", observationIds: ["obs-1"] }],
    estimatedParameters: { bpm: { value: null, confidence: 0 }, key: { value: null, confidence: 0 }, meter: { value: null, confidence: 0 } }, uncertainties: [] };
}
function criticDraft() {
  const expression = (text) => ({ text, interpretationIds: ["int-1"] });
  return { overallVibe: { hook: expression("脉冲加密"), emo: expression("紧张累积"), hype: expression("更密更抓耳"), pro: expression("细分事件增加形成密度对比") },
    interpretations: [{ id: "int-1", category: "rhythm", text: "脉冲加密增强推进感", observationIds: ["obs-1"], evidenceIds: [], generalPrinciples: ["密度对比可改变推进感"] }],
    modules: [{ id: "module-1", category: "rhythm", title: "密度变化", summary: "更密的脉冲", interpretationIds: ["int-1"],
      listeningCues: [{ text: "比较脉冲密度", startSec: 75, endSec: 80, observationIds: ["obs-1"], evidenceIds: [] }], unknowns: [], expandable: true, studioPotential: "rhythm" }], unknowns: ["和声尚不明确"] };
}
function sse(value, extra = "") {
  const content = typeof value === "string" ? value : JSON.stringify(value);
  return new Response("data: " + JSON.stringify({ choices: [{ delta: { content } }] }) + "\r\n\r\n" + extra + "data: [DONE]\r\n\r\n", {
    headers: { "content-type": "text/event-stream" },
  });
}
async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kua-v2-regression-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
function audioRunner() {
  const calls = [];
  let entry = { id: "source-studio", title: song.title, artist: song.artist, album: song.album,
    channel: "Artist - Topic", duration: 120 };
  let duration = 120;
  const runner = async (binary, args) => {
    calls.push({ binary, args });
    if (args.includes("--dump-single-json")) return { stdout: JSON.stringify({ entries: [entry] }) };
    if (args.includes("--no-playlist")) {
      const template = args[args.indexOf("-o") + 1];
      await fs.writeFile(template.replace("%(ext)s", "webm"), "synthetic source");
    } else if (binary === "ffmpeg") await fs.writeFile(args.at(-1), "synthetic mp3");
    else if (binary === "ffprobe") return { stdout: JSON.stringify({ format: { duration } }) };
    return { stdout: "" };
  };
  return { runner, calls, setVersion(nextEntry, nextDuration) { entry = nextEntry; duration = nextDuration; } };
}

test("DashScope text requests stream, supply the full schema and repair invalid output once", async () => {
  const bodies = [];
  const provider = createStructuredTextProvider({ provider: "dashscope", model: "qwen3.5-omni-plus" }, {
    env, fetcher: async (_, options) => { bodies.push(JSON.parse(options.body)); return sse(bodies.length === 1 ? {} : creativeDraft); },
  });
  assert.deepEqual(await provider.generateJson({ schemaName: "v2-creative-draft", prompt: "Write a blueprint" }), creativeDraft);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].stream, true);
  assert.deepEqual(bodies[0].modalities, ["text"]);
  assert.match(bodies[0].messages[1].content, /"studioEligible"/);
  assert.match(bodies[1].messages[1].content, /Validation error/);
});

test("a second malformed structured response fails without an unbounded retry", async () => {
  let calls = 0;
  const provider = createStructuredTextProvider({ provider: "dashscope", model: "qwen3.5-omni-plus" }, {
    env, fetcher: async () => { calls++; return sse("{broken"); },
  });
  await assert.rejects(provider.generateJson({ schemaName: "v2-creative-draft", prompt: "test" }), { code: "V2_PROVIDER_INVALID_JSON" });
  assert.equal(calls, 2);
});

test("provider errors and cancellation do not trigger structured output repair", async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const provider = createStructuredTextProvider({ provider: "dashscope", model: "qwen3.5-omni-plus" }, {
    env, fetcher: async (_, options) => { calls++; options.signal.throwIfAborted(); },
  });
  await assert.rejects(provider.generateJson({ schemaName: "v2-creative-draft", prompt: "test", signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
  const bad = createStructuredTextProvider({ provider: "dashscope", model: "qwen3.5-omni-plus" }, {
    env, fetcher: async () => { calls++; return Response.json({ error: { message: "access denied" } }, { status: 401 }); },
  });
  await assert.rejects(bad.generateJson({ schemaName: "v2-creative-draft", prompt: "test" }), { code: "V2_PROVIDER_FAILED" });
  assert.equal(calls, 2);
});

test("SSE reader handles split UTF-8 chunks and rejects truncation and stream errors", async () => {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"音乐"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
  assert.equal(await readProviderText(response), "音乐");
  await assert.rejects(readProviderText(sse("{}", 'data: {"choices":[{"finish_reason":"length"}]}\n\n')), { code: "V2_PROVIDER_TRUNCATED" });
  await assert.rejects(readProviderText(sse("{}", 'data: {"error":{"code":"failed"}}\n\n')), { code: "V2_PROVIDER_FAILED" });
});

test("acquisition hashes the actual source and uses probed duration rather than YouTube metadata", async (t) => {
  const root = await tempRoot(t), stub = audioRunner();
  stub.setVersion({}, 121.3);
  const provider = createYouTubeAudioProvider({ runner: stub.runner, env: {} });
  const result = await provider.acquire({ sourceId: "yt-test", url: "https://youtube.com/watch?v=test", title: "test", channel: "test", durationSec: 999 }, {
    destinationDir: root, decision: "manual_selected", matchScore: 0.8,
  });
  assert.equal(result.durationSec, 121.3);
  assert.equal(result.acquisition.durationSec, 999);
  assert.equal(result.sha256, crypto.createHash("sha256").update("synthetic source").digest("hex"));
  assert.equal(stub.calls.at(-1).binary, "ffprobe");
});

test("acquisition rejects missing or invalid probed duration", async (t) => {
  const root = await tempRoot(t), stub = audioRunner(); stub.setVersion({}, null);
  await assert.rejects(createYouTubeAudioProvider({ runner: stub.runner, env: {} }).acquire({ url: "https://youtube.com/watch?v=test" }, {
    destinationDir: root, decision: "manual_selected", matchScore: 1,
  }), { code: "V2_AUDIO_DURATION_INVALID" });
});

test("YouTube search reads flat results so one unavailable match cannot abort candidate discovery", async () => {
  const calls = [];
  const provider = createYouTubeAudioProvider({
    env: {},
    runner: async (_binary, args) => {
      calls.push(args);
      if (!args.includes("--flat-playlist") || !args.includes("--ignore-errors")) {
        throw new Error("one search result is unavailable");
      }
      return {
        stdout: JSON.stringify({
          entries: [{
            id: "available-result",
            title: 'Battlefield 4 "Warsaw" Theme',
            channel: "Rami - Topic",
            duration: 120,
          }],
        }),
      };
    },
  });

  const results = await provider.search(song);

  assert.equal(results.length, 1);
  assert.equal(results[0].sourceId, "available-result");
  assert.ok(calls[0].includes("--ignore-errors"));
});

test("Critic stops before a model call when Listen and Research have no citable evidence", async () => {
  let calls = 0;
  const critic = createCriticPass({
    selection: { provider: "dashscope", model: "qwen3.5-omni-plus" },
    env,
    fetcher: async () => { calls++; throw new Error("unexpected model call"); },
  });

  await assert.rejects(
    critic.run(song, {
      observation: null,
      research: { findings: [], unknowns: ["no sources"] },
      sources: [],
    }),
    { code: "V2_PRIMARY_EVIDENCE_EMPTY" },
  );
  assert.equal(calls, 0);
});

test("unsupported notable moments are dropped without discarding supported audio observations", () => {
  const document = observation();
  document.notableMoments.push({
    id: "unsupported-moment",
    startSec: 90,
    endSec: 98,
    salience: 0.7,
    title: "缺少覆盖观察",
    observationIds: ["obs-1"],
  });

  const sanitized = removeUnsupportedNotableMoments(document, {
    durationSec: 120,
  });

  assert.deepEqual(
    sanitized.notableMoments.map((moment) => moment.id),
    ["moment-1"],
  );
  assert.equal(sanitized.observations.length, 1);
  assert.match(sanitized.uncertainties.at(-1).text, /忽略 1 条/);
  assert.equal(validateMusicObservation(sanitized, { durationSec: 120 }), sanitized);
});

test("parallel Listen and Research saves retain every manifest ID across library instances", async (t) => {
  const root = await tempRoot(t), a = createSongLibrary({ root }), b = createSongLibrary({ root });
  const pkg = await a.ensureSongPackage(song);
  await Promise.all(Array.from({ length: 30 }, (_, index) => Promise.all([
    a.saveObservation(pkg.song.songId, { listenRunId: "listen-" + index }),
    b.saveResearch(pkg.song.songId, { researchRunId: "research-" + index }, []),
  ])));
  const manifest = await a.loadManifest(pkg.song.songId);
  assert.equal(new Set(manifest.observationRunIds).size, 30);
  assert.equal(new Set(manifest.researchRunIds).size, 30);
  assert.equal((await b.loadObservation(pkg.song.songId, "listen-29")).listenRunId, "listen-29");
  assert.equal((await a.loadResearch(pkg.song.songId, "research-29")).artifact.researchRunId, "research-29");
});

test("materialize requires preview selection and reuses the chosen recording, but not a live version", async (t) => {
  const root = await tempRoot(t), stub = audioRunner();
  let modelCalls = 0;
  const service = createV2Service({ env: { ...env, MUSIC_LIBRARY_DIR: root }, runner: stub.runner,
    fetcher: async () => { modelCalls++; throw new Error("unexpected model call before source selection"); } });
  const preview = await service.analyze({ song });
  assert.equal(preview.status, "confirmation_required");
  assert.equal(preview.candidates[0].sourceId, "source-studio");
  assert.equal(modelCalls, 0, "analysis must not call Listen or Research before preview selection");
  assert.equal(stub.calls.some((item) => item.args.includes("--no-playlist")), false);
  const first = await service.materialize({ song, selectedSourceId: preview.candidates[0].sourceId });
  assert.equal(first.status, "ready");
  assert.equal(stub.calls.filter((item) => item.args.some((arg) => arg.startsWith("ytsearch10:"))).length, 2,
    "confirming a preview should inspect that video directly instead of repeating keyword search");
  const calls = stub.calls.length;
  const againPreview = await service.materialize({ song });
  assert.equal(againPreview.status, "confirmation_required");
  assert.equal(againPreview.candidates[0].sourceId, "source-studio");
  assert.equal(stub.calls.length, calls);
  const again = await service.materialize({ song, selectedSourceId: "source-studio" });
  assert.equal(again.reused, true); assert.equal(stub.calls.length, calls);
  const rematch = await service.materialize({ song, forceRematch: true });
  assert.equal(rematch.status, "confirmation_required");
  assert.equal(stub.calls.filter((item) => item.args.includes("--no-playlist")).length, 1);
  const live = { ...song, album: "Live", durationSec: 300, trackUrl: "https://catalog.invalid/live" };
  stub.setVersion({ id: "source-live", title: song.title, artist: song.artist, album: "Live", channel: "Artist - Topic", duration: 300 }, 300);
  const livePreview = await service.materialize({ song: live });
  assert.equal(livePreview.status, "confirmation_required");
  const next = await service.materialize({ song: live, selectedSourceId: "source-live" });
  assert.equal(next.reused, false); assert.equal(next.media.durationSec, 300);
  assert.equal(next.songId, first.songId);
  assert.notEqual(next.media.mediaRevisionId, first.media.mediaRevisionId);
  assert.equal(first.media.catalogSong.album, "Studio");
  assert.equal(next.manifest.mediaRevisions.length, 2);
  assert.notEqual(deriveCatalogIdentityKey(live), deriveCatalogIdentityKey(song));
});

test("a duration mismatch pauses before Listen and manual confirmation reuses the pending download", async (t) => {
  const root = await tempRoot(t), stub = audioRunner(); stub.setVersion({ id: "source-studio", title: song.title, artist: song.artist, album: song.album, channel: "Artist - Topic", duration: 120 }, 180);
  const service = createV2Service({ env: { MUSIC_LIBRARY_DIR: root }, runner: stub.runner });
  const preview = await service.materialize({ song });
  assert.equal(preview.status, "confirmation_required");
  assert.equal(stub.calls.some((item) => item.args.includes("--no-playlist")), false);
  const pending = await service.materialize({ song, selectedSourceId: preview.candidates[0].sourceId });
  assert.equal(pending.status, "confirmation_required"); assert.match(pending.reason, /180/);
  await assert.rejects(service.listen({ songId: pending.songId }), { code: "V2_AUDIO_SOURCE_CONFIRMATION_REQUIRED" });
  const calls = stub.calls.length;
  const confirmed = await service.materialize({ song, selectedSourceId: "source-studio", forceRematch: true });
  assert.equal(confirmed.status, "ready"); assert.equal(confirmed.reused, true);
  assert.equal(confirmed.media.acquisition.requiresSanityCheck, false);
  assert.equal(stub.calls.length, calls);
});

test("materialize returns a clear empty match state for weak YouTube results without downloading them", async (t) => {
  const root = await tempRoot(t), stub = audioRunner();
  stub.setVersion({ id: "workout", title: "Arm antagonist drop set", artist: "Marius Varlan",
    channel: "Marius Varlan", duration: 178 }, 178);
  const service = createV2Service({ env: { MUSIC_LIBRARY_DIR: root }, runner: stub.runner });
  const result = await service.materialize({ song: {
    title: "Antagonistic", artist: "Varlan", album: "Pacific Dreams 88.9", durationSec: 178,
  } });

  assert.equal(result.status, "confirmation_required");
  assert.deepEqual(result.candidates, []);
  assert.match(result.reason, /标题相似度太低/);
  assert.equal(stub.calls.some(({ args }) => args.includes("--no-playlist")), false);
});

test("medium confidence source requires confirmation before acquisition", () => {
  const result = chooseAudioSource(song, [{ sourceId: "medium", title: song.title, artistHint: song.artist, albumHint: null,
    channel: "Fan", durationSec: 140, isOfficial: false, isTopic: false, isPublisher: false }]);
  assert.ok(result.candidates[0].matchScore >= 0.75 && result.candidates[0].matchScore < 0.88);
  assert.equal(result.decision, "manual_required"); assert.equal(result.selected, null);
});

test("Research cache excludes other catalog versions and older prompts", async (t) => {
  const root = await tempRoot(t), library = createSongLibrary({ root }), pkg = await library.ensureSongPackage(song);
  const artifact = { researchRunId: "research-studio", provider: { name: "dashscope", model: "qwen" }, backend: "registered-web", createdAt: new Date().toISOString(), guidedByObservationIds: [] };
  const key = deriveCatalogIdentityKey(song);
  await library.saveResearch(pkg.song.songId, artifact, [], { catalogIdentityKey: key, promptVersion: "new" });
  const query = { provider: "dashscope", model: "qwen", backend: "registered-web", maxAgeMs: 60000, catalogIdentityKey: key, promptVersion: "new" };
  assert.ok(await library.findReusableResearch(pkg.song.songId, query));
  assert.equal(await library.findReusableResearch(pkg.song.songId, { ...query, promptVersion: "old" }), null);
  assert.equal(await library.findReusableResearch(pkg.song.songId, { ...query, catalogIdentityKey: deriveCatalogIdentityKey({ ...song, album: "Live" }) }), null);
});

test("Research skips paid synthesis when discovery has no citable source excerpt", async () => {
  let modelCalls = 0;
  const pass = createResearchPass({
    selection: { provider: "dashscope", model: "qwen3.8-omni-flash" },
    env,
    fetcher: async () => { modelCalls++; throw new Error("unexpected model call"); },
    discovery: {
      discover: async () => ({ sources: [], unknowns: ["找不到可读取的资料页"] }),
    },
  });
  const result = await pass.run({ ...song, songId: "song-1" });
  assert.equal(modelCalls, 0);
  assert.equal(result.sources.length, 0);
  assert.equal(result.artifact.findings.length, 0);
  assert.match(result.artifact.summary, /没有调用模型/u);
  assert.ok(result.artifact.unknowns.includes("找不到可读取的资料页"));
});

test("Listen rejects reversed ranges, out-of-duration ranges, invented IDs and global timestamp support", () => {
  assert.ok(validateMusicObservation(observation()));
  for (const mutate of [
    (doc) => { doc.observations[0].endSec = 69; },
    (doc) => { doc.timeline.sections[0].endSec = 121; },
    (doc) => { doc.notableMoments[0].observationIds = ["invented"]; },
    (doc) => { doc.observations[0].precision = "global"; doc.observations[0].startSec = null; doc.observations[0].endSec = null; },
    (doc) => { doc.observations.push({ ...doc.observations[0] }); },
  ]) { const doc = observation(); mutate(doc); assert.throws(() => validateMusicObservation(doc), { code: "EVIDENCE_INTEGRITY" }); }
});

test("timed Critic cues must be covered by local observations inside the audio", () => {
  const cue = { startSec: 75, endSec: 80, observationIds: ["obs-1"] };
  validateTimedCue(cue, observation());
  assert.throws(() => validateTimedCue({ ...cue, endSec: 121 }, observation()), /实际音频/);
  assert.throws(() => validateTimedCue({ ...cue, startSec: 60 }, observation()), /覆盖范围/);
  const global = observation(); global.observations[0].precision = "global";
  assert.throws(() => validateTimedCue(cue, global), /时间定位/);
});

test("Critic repairs only one semantic failure with the original supporting artifacts", async () => {
  const prompts = [];
  const pass = createCriticPass({ selection: { provider: "dashscope", model: "qwen3.5-omni-plus" }, env,
    fetcher: async (_, options) => {
      prompts.push(JSON.parse(options.body).messages[1].content);
      const draft = criticDraft(); if (prompts.length === 1) draft.modules[0].listeningCues[0].endSec = 130;
      return sse(draft);
    } });
  const result = await pass.run({ ...song, songId: "song-1" }, { observation: observation() });
  assert.equal(prompts.length, 2); assert.match(prompts[1], /Repair this validation error/);
  assert.match(prompts[1], /"obs-1"/); assert.equal(result.modules[0].listeningCues[0].endSec, 80);
});

test("Critic splits mixed-category modules into evidence-scoped modules and preserves summaries", async () => {
  let calls = 0;
  const draft = criticDraft();
  draft.interpretations.push({
    id: "int-melody",
    category: "melody",
    text: "旋律进入形成对比",
    observationIds: ["obs-1"],
    evidenceIds: [],
    generalPrinciples: [],
  });
  draft.modules[0].interpretationIds.push("int-melody");
  const pass = createCriticPass({
    selection: { provider: "dashscope", model: "qwen3.5-omni-plus" },
    env,
    fetcher: async () => {
      calls++;
      return sse(draft);
    },
  });

  const result = await pass.run(
    { ...song, songId: "song-1" },
    { observation: observation() },
  );

  assert.equal(calls, 2);
  assert.deepEqual(
    result.modules.map((module) => module.category),
    ["rhythm", "melody"],
  );
  assert.ok(result.modules.every((module) => module.interpretationIds.length === 1));
  assert.equal(result.overallVibe.hook.text, "脉冲加密");
  assert.equal(result.interpretations.length, 2);
  assert.match(result.unknowns.at(-1), /跨类别模块已按已审核解释拆分/);
});

test("Creative includes each variable observation in the blueprint-level source list", async () => {
  const draft = {
    ...creativeDraft,
    sourceInterpretationIds: ["int-1"],
    variables: [{
      id: "var-1",
      type: "rhythmic_density",
      baseline: "稀疏",
      variation: "密集",
      sourceObservationIds: ["obs-1"],
    }],
    studioEligible: true,
  };
  const pass = createCreativePass({
    selection: { provider: "dashscope", model: "qwen3.5-omni-plus" },
    env,
    fetcher: async () => sse(draft),
  });

  const blueprint = await pass.run(
    { ...song, songId: "song-1" },
    {
      observation: observation(),
      analysis: { analysisId: "analysis-1", interpretations: [{ id: "int-1" }] },
    },
  );

  assert.deepEqual(blueprint.sourceObservationIds, ["obs-1"]);
  assert.equal(blueprint.studioEligible, true);
});

test("cached primary passes still produce independent, traceable Critic and Studio snapshots", async (t) => {
  const root = await tempRoot(t), stub = audioRunner(), providerCalls = [];
  const service = createV2Service({ env: { ...env, MUSIC_LIBRARY_DIR: root }, runner: stub.runner,
    fetcher: async (_, options) => {
      const prompt = JSON.parse(options.body).messages[1].content; providerCalls.push(prompt);
      if (prompt.startsWith("You are the Critic Pass")) return sse(criticDraft());
      if (prompt.startsWith("You are the Creative Pass")) return sse({ ...creativeDraft, sourceObservationIds: ["obs-1"], sourceInterpretationIds: ["int-1"],
        variables: [{ id: "var-1", type: "rhythmic_density", baseline: "稀疏", variation: "密集", sourceObservationIds: ["obs-1"] }], studioEligible: true });
      if (prompt.startsWith("You are the Strudel Seed Pass")) return sse({ code: 's("bd ~ sd ~")', alternativeCode: 's("bd hh sd hh")', explanation: "密度变化", visualHints: ["punchcard"],
        experiment: { question: "密度如何改变推进感", variable: "rhythmic_density", baseline: "稀疏", changed: "密集", constants: ["tempo"], listenFor: ["密度"], limitation: "learning reconstruction" } });
      throw new Error("Unexpected provider request");
    } });
  const preview = await service.materialize({ song });
  const media = await service.materialize({ song, selectedSourceId: preview.candidates[0].sourceId });
  const library = createSongLibrary({ root });
  const doc = { ...observation(), songId: media.songId, mediaRevisionId: media.media.mediaRevisionId,
    provider: { name: "dashscope", model: "qwen3.8-omni-flash", promptVersion: DASHSCOPE_LISTEN_PROMPT_VERSION } };
  const research = { schemaVersion: "2.0", researchRunId: "research-1", songId: media.songId, createdAt: new Date().toISOString(), provider: { name: "dashscope", model: "qwen3.8-omni-flash" }, backend: "registered-web",
    guidedByObservationIds: [], sourceIds: [], summary: "没有足够外部资料", findings: [], unknowns: ["文化背景待检索"] };
  await Promise.all([library.saveObservation(media.songId, doc), library.saveResearch(media.songId, research, [], { catalogIdentityKey: deriveCatalogIdentityKey(media.song), promptVersion: RESEARCH_PROMPT_VERSION })]);
  const first = await service.analyze({ song, selectedSourceId: "source-studio" });
  const second = await service.analyze({ song, selectedSourceId: "source-studio" });
  assert.equal(first.status, "complete"); assert.equal(second.status, "complete");
  assert.deepEqual(second.cache, { audio: true, listen: true, research: true });
  assert.equal(second.materialization.source.sourceId, "source-studio");
  assert.equal(second.analysis.listenRunId, "listen-1"); assert.equal(second.analysis.researchRunId, "research-1");
  assert.notEqual(first.analysis.analysisId, second.analysis.analysisId);
  assert.equal(second.creative.studioSeed.analysisId, second.analysis.analysisId);
  assert.equal(second.creative.studioSeed.blueprintId, second.creative.blueprint.blueprintId);
  const manifest = await library.loadManifest(media.songId);
  assert.equal(manifest.analysisIds.length, 2); assert.equal(manifest.studioSeedIds.length, 2);
  assert.equal(providerCalls.length, 6); assert.equal(stub.calls.filter((call) => call.args.includes("--no-playlist")).length, 1);
  await library.ensureSongPackage({ ...song, album: "Live" });
  await assert.rejects(service.creative({ songId: media.songId, analysisId: second.analysis.analysisId }), { code: "V2_AUDIO_VERSION_MISMATCH" });
  assert.equal(providerCalls.length, 6);
});

test("Listen audio request uses OSS streaming and repairs temporal errors before saving", async (t) => {
  const root = await tempRoot(t), audioPath = path.join(root, "analysis.mp3"); await fs.writeFile(audioPath, "synthetic audio");
  const bodies = []; let uploads = 0;
  const provider = createDashScopeAudioProvider({ env, fetcher: async (url, options) => {
    if (options.method === "GET") return Response.json({ data: { upload_host: "https://upload.invalid", upload_dir: "test", oss_access_key_id: "test", signature: "test", policy: "test", x_oss_object_acl: "private", x_oss_forbid_overwrite: "true" } });
    if (String(url) === "https://upload.invalid") { uploads++; return new Response(); }
    const body = JSON.parse(options.body); bodies.push(body);
    const doc = observation(); if (bodies.length === 1) doc.notableMoments[0].endSec = 150;
    return sse(doc);
  } });
  const result = await provider.listen({ audioPath, song: { ...song, songId: "song-1" }, mediaRevisionId: "media-1", durationSec: 120, model: "qwen3.5-omni-plus" });
  assert.equal(uploads, 1); assert.equal(bodies.length, 2);
  assert.equal(bodies[0].stream, true);
  assert.equal(bodies[0].messages[0].content[0].input_audio.data, "oss://test/analysis.mp3");
  assert.match(bodies[1].messages[0].content[1].text, /Repair the validation error/);
  assert.equal(result.timeline.durationSec, 120); assert.equal(result.notableMoments[0].endSec, 80);
});

test("preflight reports missing dependencies without exposing any key and recognizes readiness", async () => {
  const plan = resolveProviderPlan({});
  const missing = createV2Preflight({ env: {}, plan, runner: async () => { throw new Error("not found"); }, agentHealth: async () => ({}) });
  const result = await missing(); assert.equal(result.ok, false);
  assert.equal(result.checks.find((item) => item.id === "dashscope").status, "missing");
  assert.equal(result.checks.find((item) => item.id === "codex").status, "missing");
  assert.equal(result.checks.find((item) => item.id === "musicbrainz").status, "missing");
  const readinessTimeouts = [];
  const ready = createV2Preflight({ env, plan, runner: async (_binary, _args, options) => { readinessTimeouts.push(options.timeoutMs); return {}; }, agentHealth: async () => ({ codexAvailable: true, authentication: "ready", projectConfiguration: "explicit", musicBrainz: "ready" }) });
  const good = await ready(); assert.equal(good.ok, true); assert.ok(!JSON.stringify(good).includes(env.DASHSCOPE_API_KEY));
  assert.deepEqual(readinessTimeouts, [15000, 15000, 15000]);
});

test("Studio rejects formatting-only A/B changes and variables absent from the blueprint", async () => {
  const input = { song: { songId: "song-1" }, observation: {}, analysis: {}, blueprint: { studioEligible: true }, plan: { eligible: true, variables: [{ type: "rhythmic_density" }], visualHints: [] } };
  for (const change of [
    { alternativeCode: "s('bd ~ sd ~')", variable: "rhythmic_density" },
    { alternativeCode: 's("bd hh sd hh")', variable: "tempo" },
  ]) {
    let calls = 0;
    const draft = { code: 's("bd ~ sd ~")', alternativeCode: change.alternativeCode, explanation: "test", visualHints: [],
      experiment: { question: "test", variable: change.variable, baseline: "sparse", changed: "dense", constants: ["tempo"], listenFor: ["density"], limitation: "learning reconstruction" } };
    const pass = createStrudelSeedPass({ selection: { provider: "dashscope", model: "qwen3.5-omni-plus" }, env, fetcher: async () => { calls++; return sse(draft); } });
    await assert.rejects(pass.run(input), { code: "EVIDENCE_INTEGRITY" }); assert.equal(calls, 2);
  }
});
