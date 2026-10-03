import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import {
  validateSongAnalysisIntegrity,
  validateDeepDiveIntegrity,
} from "../server/evidenceValidation.mjs";
import { validateContract } from "../server/schemaValidation.mjs";
import { contracts } from "../music-learning/contracts.mjs";
import {
  registerSources,
  readPublicSource,
  isPublicAddress,
} from "../server/sourceRegistry.mjs";
import {
  persistAnalysis,
  persistDeepDive,
  persistStudioSession,
  loadEvidencePackage,
  listAnalyses,
} from "../server/evidenceStore.mjs";
import { createMusicLearningAgent } from "../server/musicLearningAgent.mjs";
import {
  analysisFixture,
  diveFixture,
  reviewFixture,
  claim,
  song,
  source,
  scope,
} from "./fixtures/music-learning.mjs";
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "music-learning-test-"),
);
process.env.MUSIC_LEARNING_EVIDENCE_DIR = directory;
after(() => fs.rm(directory, { recursive: true, force: true }));
const studioText = await fs.readFile(
  new URL("../studio/strudelStudio.ts", import.meta.url),
  "utf8",
);
const studio = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpileModule(studioText, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ).toString("base64")
);
test("generated schemas stay identical to the canonical contracts", async () => {
  for (const [name, contract] of Object.entries(contracts))
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(
          new URL("../schemas/" + name + ".schema.json", import.meta.url),
          "utf8",
        ),
      ),
      contract,
    );
});
test("rejects malformed shape, dangling evidence, metadata used for rhythm, and wrong versions", () => {
  const valid = analysisFixture();
  assert.equal(validateSongAnalysisIntegrity(valid, valid.sources), valid);
  const malformed = structuredClone(valid);
  delete malformed.modules[0].category;
  assert.throws(() => validateContract("song-analysis", malformed), /契约/);
  const dangling = structuredClone(valid);
  dangling.modules[0].claims[0].evidenceIds = ["missing"];
  assert.throws(
    () => validateSongAnalysisIntegrity(dangling, dangling.sources),
    /不存在/,
  );
  const metadata = structuredClone(valid);
  metadata.modules[0].claims[0].evidenceIds = ["ev-identity"];
  assert.throws(
    () => validateSongAnalysisIntegrity(metadata, metadata.sources),
    /支持范围/,
  );
  const version = structuredClone(valid);
  version.modules[0].claims[0].versionScope = "fixture:live";
  assert.throws(
    () => validateSongAnalysisIntegrity(version, version.sources),
    /版本范围/,
  );
  const forged = structuredClone(valid);
  forged.sources[0].excerpts[1].text = "Forged";
  assert.throws(
    () => validateSongAnalysisIntegrity(forged, valid.sources),
    /服务端读取/,
  );
});
test("a fully covered analysis can remain partial when individual copy failed review", () => {
  const analysis = analysisFixture();
  for (const category of ["culture", "harmony", "timbre"]) {
    const id = `module-${category}`;
    const claimId = `claim-${category}`;
    const excerptId = `excerpt-${category}`;
    const text = `${category} 合成资料中的特征。`;
    analysis.sources[0].excerpts.push({ id: excerptId, text, locator: `${category} 段`, topics: [category] });
    const evidence = {
      id: claimId, kind: "external_evidence", status: "supported", text,
      evidenceIds: [excerptId], versionScope: scope,
      scope: { level: "recording", label: scope }, prerequisiteClaimIds: [],
      topic: category, reasoningNote: null,
    };
    analysis.modules.push({
      id, category, title: `${category} 特征`, summary: text,
      summaryClaimIds: [claimId], explanation: text + "\n\n它提供一条可复核的作品线索。",
      explanationClaimIds: [claimId], listeningCues: [], claims: [evidence], unknowns: [],
      expandable: true, studioPotential: category === "harmony" ? "harmony" : "none",
    });
    const coverage = analysis.coverage.find((item) => item.category === category);
    coverage.status = "analyzed";
    coverage.moduleIds = [id];
  }
  analysis.completionStatus = "partial";
  assert.equal(validateSongAnalysisIntegrity(analysis, analysis.sources), analysis);
  const inconsistent = structuredClone(analysis);
  inconsistent.completionStatus = "complete";
  inconsistent.coverage.find((item) => item.category === "timbre").status = "guidance_only";
  inconsistent.coverage.find((item) => item.category === "timbre").moduleIds = [];
  assert.throws(() => validateSongAnalysisIntegrity(inconsistent, inconsistent.sources), /分析完成状态与四维覆盖不匹配/);
});
test("JSON evidence ignores formatting outside strings, preserves the actual passage, and rejects changed values or field order", async () => {
  const json = { title: "Blue Train", version: '"live" mix', artist: "Example" };
  const document = JSON.stringify(json);
  const field = (key, value, separator = ": ") => JSON.stringify(key) + separator + JSON.stringify(value);
  const excerpts = [
    field("title", json.title),
    field("version", json.version),
    field("title", "BlueTrain"),
    field("artist", json.artist) + ", " + field("title", json.title),
    field("title", "Invented title"),
  ].map(text => ({ text, locator: "JSON field", topics: ["identity"] }));
  const proposal = { title: "Synthetic JSON", author: null, publisher: null,
    sourceType: "musicbrainz", url: source.url, versionScope: scope, excerpts };
  const result = await registerSources([proposal], {
    reader: async url => ({ url, title: null, contentType: "application/json", text: document }),
  });
  assert.deepEqual(result.sources[0].excerpts.map(e => e.text), [
    field("title", json.title, ":"), field("version", json.version, ":"),
  ]);
  assert.ok(result.sources[0].excerpts.every(e => document.includes(e.text)));
  const html = await registerSources([proposal], {
    reader: async url => ({ url, title: null, contentType: "text/html", text: document }),
  });
  assert.equal(html.sources.length, 0);
});
test("a prose summary cannot introduce facts outside its claims; unresolved recordings cannot have confirmed technical claims", () => {
  const a = analysisFixture();
  a.modules[0].summary = "踩镲以八分音符形成稳定的细分层次。";
  assert.equal(validateSongAnalysisIntegrity(a, a.sources), a);
  const b = analysisFixture();
  b.song.identityStatus = "unresolved";
  assert.throws(
    () => validateSongAnalysisIntegrity(b, b.sources),
    /版本未确定/,
  );
});
test("reader registers only passages found in the actual document and MusicBrainz stays identity-only", async () => {
  const excerpt = source.excerpts[0];
  const proposal = {
    title: "fixture",
    author: null,
    publisher: null,
    sourceType: "musicbrainz",
    url: source.url,
    versionScope: scope,
    excerpts: [
      { ...excerpt, topics: ["identity", "rhythm"] },
      {
        text: "An invented passage with no match.",
        locator: "none",
        topics: ["rhythm"],
      },
    ],
  };
  const result = await registerSources([proposal], {
    reader: async (url) => ({ url, title: "Read fixture", text: excerpt.text }),
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].excerpts.length, 1);
  assert.deepEqual(result.sources[0].excerpts[0].topics, ["identity"]);
  const missing = await registerSources([proposal], {
    reader: async (url) => ({
      url,
      title: "",
      text: "Different real document.",
    }),
  });
  assert.equal(missing.sources.length, 0);
  assert.equal(missing.unknowns.length, 1);
});
test("source reader refuses local, reserved, credentialed and non-web addresses", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700::1111"), true);
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://[::1]/",
    "file:///etc/passwd",
    "https://u:p@example.org/",
  ])
    await assert.rejects(readPublicSource(url));
});
test("a new analysis is immutable; concurrent deep dives accumulate sources and keep every turn", async () => {
  const first = await persistAnalysis(analysisFixture()),
    second = await persistAnalysis(analysisFixture());
  assert.notEqual(first.analysisId, second.analysisId);
  const dives = [diveFixture(), diveFixture()];
  dives.forEach((d, i) =>
    d.sources.push({
      ...structuredClone(source),
      id: "src-new-" + i,
      url: source.url + "/" + i,
      excerpts: [{ ...source.excerpts[0], id: "ev-new-" + i }],
    }),
  );
  await Promise.all(
    dives.map((d, i) => persistDeepDive(first.analysisId, d, "question " + i)),
  );
  const pkg = await loadEvidencePackage(first.analysisId);
  assert.equal(pkg.deepDives.length, 2);
  assert.equal(pkg.sources.length, 3);
  assert.deepEqual(pkg.analysis, first.analysis);
  assert.equal(
    (await loadEvidencePackage(second.analysisId)).deepDives.length,
    0,
  );
  assert.ok(
    (await listAnalyses()).some(
      (p) => p.analysisId === first.analysisId && p.deepDiveCount === 2,
    ),
  );
  await assert.rejects(loadEvidencePackage("../outside"), /ID 无效/);
});
test("v1.1 history loads with display defaults without rewriting its saved snapshot", async () => {
  const analysis = analysisFixture();
  delete analysis.coverage;
  delete analysis.completionStatus;
  for (const module of analysis.modules) {
    delete module.summaryClaimIds;
    delete module.explanation;
    delete module.explanationClaimIds;
    delete module.listeningCues;
    for (const item of module.claims) { delete item.scope; delete item.prerequisiteClaimIds; }
  }
  const dive = diveFixture();
  for (const item of dive.claims) { delete item.scope; delete item.prerequisiteClaimIds; }
  const analysisId = crypto.randomUUID();
  const legacy = {
    schemaVersion: "1.1", analysisId, createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z", persistent: true, analysis,
    evidenceReview: { claims: [], expressions: [], identitySupported: [], transcriptionSupported: false },
    sources: [source], deepDives: [{ deepDiveId: crypto.randomUUID(), analysisId,
      createdAt: "2026-09-02T00:00:00.000Z", question: null, deepDive: dive }],
    studioSessions: [],
  };
  await fs.mkdir(path.join(directory, analysisId));
  const target = path.join(directory, analysisId, "package.json");
  await fs.writeFile(target, JSON.stringify(legacy));
  const restored = await loadEvidencePackage(analysisId);
  assert.equal(restored.schemaVersion, "1.1");
  assert.equal(restored.analysis.coverage.find((item) => item.category === "rhythm").status, "analyzed");
  assert.equal(restored.analysis.modules[0].claims[0].scope.level, "source_version");
  assert.equal(restored.deepDives[0].deepDive.claims[0].scope.level, "general");
  assert.deepEqual(restored.evidenceReview.texts, []);
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), legacy);
});
test("Studio undo restores tempo and provenance; stale edits and NaN are rejected; saved provenance is server-owned", async () => {
  const a = await persistAnalysis(analysisFixture()),
    d = await persistDeepDive(a.analysisId, diveFixture());
  const initial = studio.createStudioSession("rhythm", d.deepDive.studio.seed);
  const proposal = studio.proposeStudioChange(
    initial,
    's("hh*8")',
    { ...initial.revisions[0].playback, bpm: 144 },
    "密度",
  );
  const edited = studio.applyStudioProposal(initial, proposal);
  assert.equal(studio.currentStudioSourceType(edited), "user_version");
  const undone = studio.undoStudio(edited);
  assert.equal(studio.currentStudioRevision(undone).playback.bpm, 120);
  assert.equal(
    studio.currentStudioSourceType(undone),
    "learning_reconstruction",
  );
  assert.equal(
    studio.currentStudioRevision(studio.redoStudio(undone)).playback.bpm,
    144,
  );
  assert.throws(() => studio.applyStudioProposal(edited, proposal), /旧版本/);
  assert.throws(
    () =>
      studio.applyStudioProposal(initial, {
        ...proposal,
        playback: { ...proposal.playback, bpm: NaN },
      }),
    /无效/,
  );
  edited.revisions[1].sourceType = "source_transcription";
  const saved = await persistStudioSession(a.analysisId, d.deepDiveId, edited);
  assert.equal(saved.revisions[1].sourceType, "user_version");
  await assert.rejects(
    persistStudioSession(a.analysisId, d.deepDiveId, edited),
    (error) => error.code === "STALE_STUDIO_SAVE",
  );
  assert.equal(
    (await loadEvidencePackage(a.analysisId)).studioSessions[0].session
      .revisions.length,
    2,
  );
  const transcription = diveFixture();
  transcription.studio.seed.sourceType = "source_transcription";
  assert.throws(
    () =>
      validateDeepDiveIntegrity(
        transcription,
        a.analysis,
        "rhythm",
        transcription.sources,
      ),
    /谱例/,
  );
});
function queuedAgent(outputs, sources = [source], options = {}) {
  const queue = outputs.map((x) => structuredClone(x));
  let lastPlan = null, analysisDraft = null, writingCalls = 0, writingReviewCalls = 0;
  let researchPlanCalls = 0, registerCalls = 0;
  const next = () => queue.shift();
  const makeWriting = () => {
    const modules = (analysisDraft?.modules || []).map((module) => {
      const ids = module.claims.map((claim) => claim.id);
      const first = module.claims[0];
      return { id: module.id, title: module.title, titleClaimIds: [first.id], summary: first.text, summaryClaimIds: [first.id],
        explanation: first.text + "\n\n这条判断帮助定位可听的音乐特点。",
        explanationClaimIds: [first.id],
        listeningCues: [
          { text: "对照这个特点前后的变化。", claimIds: [first.id], scope: first.scope.level === "recording" ? "recording" : first.scope.level === "source_version" ? "source_version" : "general" },
          ...(options.shortCueSetFirst && writingCalls === 1 ? [] : [{ text: "把这一处与前后段落作比较。", claimIds: [first.id], scope: first.scope.level === "recording" ? "recording" : first.scope.level === "source_version" ? "source_version" : "general" }]),
        ],
      };
    });
    const claim = analysisDraft?.modules?.flatMap((module) => module.claims || [])[0];
    const expression = (label) => claim ? {
      text: label + "：" + claim.text,
      claimIds: options.uncitedWritingFirst === label && writingCalls === 1 ? [] : [claim.id],
    } : { text: "", claimIds: [] };
    const revise = (key, value) => writingCalls > 1 && options.failWritingOnce?.includes(key) ? { ...value, text: value.text + "（修订）" } : value;
    return { overallVibe: { hook: expression("一句话"), emo: revise("emo", expression("走心")), hype: revise("hype", expression("上头")), pro: revise("pro", expression("懂行")) }, modules };
  };
  const agent = createMusicLearningAgent({
    run: async ({ outputSchema, prompt }) => {
      const schema = outputSchema.split("/").at(-1);
      options.prompts?.push({ schema, prompt });
      if (schema === "research-plan.schema.json") {
        researchPlanCalls++;
        const value = next();
        if (value) lastPlan = value;
        assert.ok(lastPlan, "missing research plan fixture");
        return structuredClone(lastPlan);
      }
      if (schema === "analysis-draft.schema.json") {
        analysisDraft = next();
        assert.ok(analysisDraft, "missing analysis draft fixture");
        return structuredClone(analysisDraft);
      }
      if (schema === "deep-dive-draft.schema.json") return structuredClone(next());
      if (schema === "evidence-review.schema.json") return structuredClone(next());
      if (schema === "analysis-writing.schema.json") { writingCalls++; return makeWriting(); }
      if (schema === "writing-review.schema.json") {
        writingReviewCalls++;
        const texts = [];
        const writing = makeWriting();
        const verdict = (textId) => options.failWritingAlways?.includes(textId) || (writingReviewCalls === 1 && options.failWritingOnce?.includes(textId)) ? "insufficient" : "supports";
        for (const [textId, value] of Object.entries(writing.overallVibe)) if (value.text) texts.push({ textId, verdict: verdict(textId), reason: "合成审核" });
        for (const module of writing.modules) {
          texts.push({ textId: `module:${encodeURIComponent(module.id)}:title`, verdict: verdict(`module:${encodeURIComponent(module.id)}:title`), reason: "合成审核" });
          texts.push({ textId: `module:${encodeURIComponent(module.id)}:summary`, verdict: verdict(`module:${encodeURIComponent(module.id)}:summary`), reason: "合成审核" });
          texts.push({ textId: `module:${encodeURIComponent(module.id)}:explanation`, verdict: verdict(`module:${encodeURIComponent(module.id)}:explanation`), reason: "合成审核" });
          texts.push({ textId: `module:${encodeURIComponent(module.id)}:cue_set`, verdict: verdict(`module:${encodeURIComponent(module.id)}:cue_set`), reason: "合成审核" });
          module.listeningCues.forEach((_cue, index) => texts.push({ textId: `module:${encodeURIComponent(module.id)}:cue:${index}`, verdict: verdict(`module:${encodeURIComponent(module.id)}:cue:${index}`), reason: "合成审核" }));
        }
        return { texts };
      }
      assert.fail("unexpected Agent schema " + schema);
    },
    register: async (_proposals, { existing, signal }) => {
      registerCalls++;
      if (options.register) return options.register(_proposals, { existing, signal, registerCalls });
      return {
        sources: structuredClone(existing.length ? existing : sources),
        unknowns: options.failFirstRegistration && registerCalls === 1 ? ["合成来源登记失败，需要补查替代来源。"] : [],
      };
    },
  });
  agent.getResearchPlanCallCount = () => researchPlanCalls;
  return agent;
}
test("source research uses the configured live search directly and keeps the round budget", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const prompts = [];
  const agent = queuedAgent(
    [plan, draft, reviewFixture(draft.modules[0].claims), plan],
    [source],
    { prompts },
  );
  await agent.analyze({ song });
  const researchPrompt = prompts.find((entry) => entry.schema === "research-plan.schema.json");
  assert.ok(researchPrompt);
  assert.match(researchPrompt.prompt, /only the built-in live web_search\/open tools/);
  assert.match(researchPrompt.prompt, /Do not invoke personal\/global Firecrawl skills or CLIs/);
  assert.match(researchPrompt.prompt, /Do not use MusicBrainz unless the selected title\/artist leave the work or artist genuinely ambiguous/);
  assert.doesNotMatch(researchPrompt.prompt, /Resolve identity with MusicBrainz, then find source material/);
  assert.match(researchPrompt.prompt, /At most 3 web search queries and 5 source-page reads/);
  assert.match(researchPrompt.prompt, /include the nearby question, heading or sentence that names that subject/);
  const draftPrompt = prompts.find((entry) => entry.schema === "analysis-draft.schema.json");
  assert.match(draftPrompt.prompt, /add a separate ai_interpretation claim/);
  const writingPrompt = prompts.find((entry) => entry.schema === "analysis-writing.schema.json");
  assert.match(writingPrompt.prompt, /never print raw claim IDs/);
});
test("follow-up research receives the server-owned source snapshot for reuse", async () => {
  const stored = await persistAnalysis(analysisFixture());
  const draft = diveFixture("rhythm");
  delete draft.sources;
  const outputs = [
    { song, sources: [], questions: [], unknowns: [] },
    draft, reviewFixture(draft.claims),
  ];
  let researchData;
  const agent = createMusicLearningAgent({
    run: async ({ prompt, outputSchema }) => {
      if (outputSchema.endsWith("research-plan.schema.json"))
        researchData = JSON.parse(prompt.split("DATA:\n").at(-1));
      return structuredClone(outputs.shift());
    },
    register: async (_proposals, { existing }) => ({ sources: existing, unknowns: [] }),
  });
  const result = await agent.deepDive({ analysisId: stored.analysisId, analysisItemId: "rhythm" });
  assert.deepEqual(researchData.registeredSources, stored.analysis.sources);
  assert.equal(researchData.selectedItem.id, "rhythm");
  assert.deepEqual(result.deepDive.sources, stored.analysis.sources);
});
test("follow-up explanation receives saved user edits, never a client experiment override", async () => {
  const a = await persistAnalysis(analysisFixture());
  const d = await persistDeepDive(a.analysisId, diveFixture("rhythm"), "first question");
  const initial = studio.createStudioSession("rhythm", d.deepDive.studio.seed);
  const edited = studio.applyStudioProposal(initial, studio.proposeStudioChange(
    initial, 's("hh*8")', { ...initial.revisions[0].playback, bpm: 144 }, "user edit",
  ));
  await persistStudioSession(a.analysisId, d.deepDiveId, edited);
  const draft = diveFixture("rhythm");
  delete draft.sources;
  const queue = [{ song, sources: [], questions: [], unknowns: [] }, draft, reviewFixture(draft.claims)];
  const contexts = [];
  const agent = createMusicLearningAgent({
    run: async ({ prompt, outputSchema }) => {
      if (!outputSchema.endsWith("evidence-review.schema.json"))
        contexts.push(JSON.parse(prompt.split("DATA:\n").at(-1)));
      return structuredClone(queue.shift());
    },
    register: async (_proposals, { existing }) => ({ sources: existing, unknowns: [] }),
  });
  await agent.deepDive({ analysisId: a.analysisId, analysisItemId: "rhythm", question: "continue",
    currentExperiment: { revision: { code: "untrusted", playback: { bpm: 20 } } },
  });
  for (const context of contexts) {
    assert.equal(context.currentExperiment.revision.code, 's("hh*8")');
    assert.equal(context.currentExperiment.revision.playback.bpm, 144);
    assert.equal(context.previousDeepDives[0].question, "first question");
  }
  assert.equal(contexts.length, 2);
});
test("unsupported claims are removed before presentation; empty analysis still supports a general teaching deep dive", async () => {
  const analysis = analysisFixture(),
    { sources: _sources, ...draft } = analysis;
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const agent = queuedAgent([
    plan,
    draft,
    reviewFixture(draft.modules[0].claims, "insufficient"),
  ]);
  const stored = await agent.analyze({ song });
  assert.equal(stored.analysis.modules.length, 0);
  assert.match(stored.analysis.unknowns.join(" "), /尚未确认/);
  assert.match(stored.analysis.overallVibe.hook.text, /资料不足/);
  assert.equal(stored.analysis.overallVibe.emo.text, "");
  assert.equal(stored.analysis.overallVibe.hype.text, "");
  assert.equal(stored.analysis.overallVibe.pro.text, "");
  const dive = diveFixture("question");
  delete dive.sources;
  const teacher = queuedAgent([plan, dive, reviewFixture(dive.claims)]);
  const deeper = await teacher.deepDive({
    analysisId: stored.analysisId,
    analysisItemId: "question",
    question: "节奏密度怎样变化？",
  });
  assert.equal(
    deeper.deepDive.studio.seed.sourceType,
    "learning_reconstruction",
  );
  assert.equal(deeper.deepDive.claims[0].versionScope, "general");
  await assert.rejects(
    teacher.deepDive({
      analysis: stored.analysis,
      analysisId: stored.analysisId,
      analysisItemId: "question",
    }),
    /只接受/,
  );
});
test("registration failure triggers one targeted supplement even when four dimensions have draft coverage", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const sources = [source];
  for (const category of ["culture", "harmony", "timbre"]) {
    const id = "ev-" + category;
    const categorySource = structuredClone(source);
    categorySource.id = "src-" + category;
    categorySource.url += "/" + category;
    categorySource.excerpts = [{
      id,
      text: "这个合成来源描述了一个可供审核的" + category + "特征。",
      locator: "测试段落",
      topics: [category],
    }];
    const categoryClaim = {
      ...structuredClone(claim),
      id: "c-" + category,
      text: "合成案例包含一个可审核的" + category + "特征。",
      evidenceIds: [id],
      topic: category,
    };
    draft.modules.push({
      ...structuredClone(draft.modules[0]),
      id: category,
      category,
      title: category + " 特征",
      claims: [categoryClaim],
    });
    sources.push(categorySource);
  }
  const allClaims = draft.modules.flatMap((module) => module.claims);
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const agent = queuedAgent(
    [plan, draft, reviewFixture(allClaims), { ...plan, questions: ["补查来源登记失败项"] }],
    sources,
    { failFirstRegistration: true },
  );
  const saved = await agent.analyze({ song });
  assert.equal(agent.getResearchPlanCallCount(), 2);
  assert.match(saved.analysis.unknowns.join(" "), /来源登记失败/);
});
test("a source-scope review gap triggers the one depth-focused supplement round", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const workClaim = { ...structuredClone(claim), id: "c-rhythm-work", scope: { level: "work", label: "作品层面" } };
  const scopedClaim = { ...structuredClone(claim), id: "c-rhythm-source", versionScope: "采访中所述录音版本", scope: { level: "source_version", label: "采访中所述的录音版本" } };
  draft.modules[0].claims = [workClaim, scopedClaim];
  const firstReview = reviewFixture(draft.modules[0].claims);
  firstReview.claims.find((entry) => entry.claimId === scopedClaim.id).applicability = "unresolved";
  const secondReview = reviewFixture(draft.modules[0].claims);
  const extraSource = {
    ...structuredClone(source), id: "src-depth", url: "https://example.test/depth",
    documentHash: "depth-hash", excerpts: [{ id: "ev-depth", text: "这个补充来源说明可听特征与演奏机制之间的关系。", locator: "测试段落", topics: ["rhythm"] }],
  };
  const proposal = {
    title: "补充解释", author: null, publisher: null, sourceType: "official",
    url: extraSource.url, versionScope: scope,
    excerpts: [{ text: extraSource.excerpts[0].text, locator: "测试段落", topics: ["rhythm"] }],
  };
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const supplementPlan = { ...plan, sources: [proposal] };
  const prompts = [];
  const agent = queuedAgent(
    [plan, draft, firstReview, supplementPlan, draft, secondReview],
    [source],
    {
      prompts,
      register: async (_proposals, { existing, registerCalls }) => ({
        sources: registerCalls === 1 ? [source] : [...existing, extraSource], unknowns: [],
      }),
    },
  );
  const saved = await agent.analyze({ song });
  assert.equal(agent.getResearchPlanCallCount(), 2);
  const secondResearch = prompts.filter((entry) => entry.schema === "research-plan.schema.json")[1];
  const context = JSON.parse(secondResearch.prompt.split("DATA:\n").at(-1));
  assert.deepEqual(context.missingDepthTopics, ["rhythm"]);
  const retained = saved.analysis.modules[0].claims.find((entry) => entry.id === scopedClaim.id);
  assert.ok(retained);
  assert.equal(retained.scope.label, retained.versionScope);
});
test("fewer than two source-grounded mechanism explanations triggers depth research", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const unresolvedSong = { ...song, identityStatus: "unresolved" };
  const categories = ["culture", "harmony", "rhythm", "timbre"];
  const sources = categories.map((category) => ({
    ...structuredClone(source),
    id: "src-" + category,
    url: "https://example.test/" + category,
    documentHash: "hash-" + category,
    excerpts: [{
      id: "ev-" + category,
      text: "合成资料提供一个可审核的" + category + "特征及其关系。",
      locator: "测试段落",
      topics: [category],
    }],
  }));
  const facts = categories.map((category) => ({
    ...structuredClone(claim),
    id: "c-" + category,
    topic: category,
    text: "来源所述版本有一个可审核的" + category + "特征。",
    evidenceIds: ["ev-" + category],
    scope: { level: "source_version", label: scope },
  }));
  const interpretation = {
    id: "c-rhythm-mechanism", kind: "ai_interpretation", status: "interpreted",
    text: "这个关系可能让节奏听起来更连贯。", evidenceIds: [],
    versionScope: scope, scope: { level: "source_version", label: scope },
    prerequisiteClaimIds: ["c-rhythm"], topic: "rhythm",
    reasoningNote: "只解释已引用的节奏特征。",
  };
  draft.modules = categories.map((category) => ({
    ...structuredClone(draft.modules[0]), id: category, category,
    title: category, claims: [facts.find((item) => item.topic === category)],
  }));
  draft.modules.find((item) => item.category === "rhythm").claims.push(interpretation);
  draft.modules.find((item) => item.category === "culture").claims.push({
    id: "c-culture-airplay-interpretation", kind: "ai_interpretation", status: "interpreted",
    text: "同一周末的重复播放意味着短时间内获得密集的电台曝光。", evidenceIds: [],
    versionScope: scope, scope: { level: "source_version", label: scope },
    prerequisiteClaimIds: ["c-culture"], topic: "culture",
    reasoningNote: "解释传播次数与曝光频率的关系，不主张音乐声学机制。",
  });
  const claims = draft.modules.flatMap((module) => module.claims);
  const extraSource = {
    ...structuredClone(source), id: "src-harmony-depth",
    url: "https://example.test/harmony-depth", documentHash: "harmony-depth",
    excerpts: [{ id: "ev-harmony-depth", text: "补充资料解释和声关系。", locator: "测试段落", topics: ["harmony"] }],
  };
  const extraProposal = {
    title: "和声补充", author: null, publisher: null, sourceType: "official",
    url: extraSource.url, versionScope: scope,
    excerpts: [{ text: extraSource.excerpts[0].text, locator: "测试段落", topics: ["harmony"] }],
  };
  const firstPlan = { song: unresolvedSong, sources: [], questions: [], unknowns: [] };
  const supplementPlan = { ...firstPlan, sources: [extraProposal] };
  const prompts = [];
  const agent = queuedAgent(
    [firstPlan, draft, reviewFixture(claims), supplementPlan, draft, reviewFixture(claims)],
    sources,
    {
      prompts,
      register: async (_proposals, { existing, registerCalls }) => ({
        sources: registerCalls === 1 ? sources : [...existing, extraSource],
        unknowns: [],
      }),
    },
  );
  const saved = await agent.analyze({ song });
  assert.equal(agent.getResearchPlanCallCount(), 2);
  const supplement = prompts.filter((entry) => entry.schema === "research-plan.schema.json")[1];
  const context = JSON.parse(supplement.prompt.split("DATA:\n").at(-1));
  assert.deepEqual(context.missingDepthTopics, ["harmony", "timbre"]);
  assert.match(saved.analysis.unknowns.join(" "), /仍少于两项/);
});
test("deep dive demotes a source-version fact and reports real research stages", async () => {
  const analysis = analysisFixture();
  analysis.song.identityStatus = "unresolved";
  analysis.modules[0].claims[0].scope = { level: "source_version", label: scope };
  analysis.modules[0].listeningCues = analysis.modules[0].listeningCues.map((cue) => ({ ...cue, scope: "general" }));
  const stored = await persistAnalysis(analysis);
  const draft = diveFixture("rhythm");
  const recordingFact = {
    ...structuredClone(claim), id: "c-mis-scoped-recording",
    text: "来源所述录音版本中的鼓组呼应人声。",
  };
  draft.claims.push(recordingFact);
  draft.listeningCues.push({
    text: "若当前播放录音与来源讨论的版本相同，留意鼓组和人声的呼应。",
    claimIds: [recordingFact.id], scope: "source_version",
  });
  draft.listeningCues.push({
    text: "留意多轨录音层的叠合。",
    claimIds: [recordingFact.id], scope: "source_version",
  });
  delete draft.sources;
  const plan = { song: analysis.song, sources: [], questions: [], unknowns: [] };
  const audit = reviewFixture(draft.claims);
  audit.claims.find((entry) => entry.claimId === recordingFact.id).applicability = "source_version";
  audit.recordingIdentity = "unresolved";
  const stages = [];
  const result = await queuedAgent([plan, draft, audit], [source]).deepDive(
    { analysisId: stored.analysisId, analysisItemId: "rhythm" },
    { onProgress: (progress) => stages.push(progress.stage) },
  );
  const kept = result.deepDive.claims.find((item) => item.id === recordingFact.id);
  assert.ok(kept);
  assert.equal(kept.scope.level, "source_version");
  assert.equal(kept.scope.label, kept.versionScope);
  assert.equal(result.deepDive.listeningCues.at(-1).scope, "source_version");
  assert.match(result.deepDive.listeningCues.at(-1).text, /若当前播放录音/);
  assert.match(result.deepDive.listeningCues.at(-2).text, /若当前播放录音/);
  assert.deepEqual(stages, ["research", "draft", "review", "complete"]);
});
test("a missing identifying passage downgrades resolution and unverified transcription becomes teaching", async () => {
  const analysis = analysisFixture();
  analysis.modules = [];
  const { sources: _sources, ...draft } = analysis;
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const a = await queuedAgent([plan, draft, reviewFixture([])], []).analyze({
    song,
  });
  assert.equal(a.analysis.song.identityStatus, "unresolved");
  const d = diveFixture("question");
  delete d.sources;
  d.studio.seed.sourceType = "source_transcription";
  const saved = await queuedAgent(
    [plan, d, reviewFixture(d.claims)],
    [],
  ).deepDive({
    analysisId: a.analysisId,
    analysisItemId: "question",
    question: "如何理解密度？",
  });
  assert.equal(
    saved.deepDive.studio.seed.sourceType,
    "learning_reconstruction",
  );
});

test("identity audit removes unconfirmed release metadata and blocks recording-specific technical facts", async () => {
  const analysis = analysisFixture(),
    { sources: _sources, ...draft } = analysis;
  const plan = {
    song: { ...song, album: "Unverified edition", releaseYear: "1900" },
    sources: [],
    questions: [],
    unknowns: [],
  };
  const review = reviewFixture(draft.modules[0].claims);
  review.recordingIdentity = "unresolved";
  for (const field of review.identityFields)
    if (["album", "releaseYear"].includes(field.field)) field.verdict = "insufficient";
  const saved = await queuedAgent([plan, draft, review]).analyze({ song });
  assert.equal(saved.analysis.song.identityStatus, "unresolved");
  assert.equal(saved.analysis.song.album, null);
  assert.equal(saved.analysis.song.releaseYear, null);
  assert.equal(saved.analysis.modules.length, 0);
  assert.equal(saved.evidenceReview.recordingIdentity, "unresolved");
});
test("removing one unrelated judgment preserves the three reviewed summaries; failed copy is isolated and retried once", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const unsupported = { ...structuredClone(claim), id: "c-false-bpm", text: "录音速度为每分钟 99 拍。" };
  draft.modules[0].claims.push(unsupported);
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const audit = reviewFixture(draft.modules[0].claims);
  audit.claims.find((item) => item.claimId === unsupported.id).verdict = "insufficient";
  const saved = await queuedAgent(
    [plan, draft, audit],
    [source],
    { failWritingOnce: ["hype"], failWritingAlways: ["module:rhythm:summary"] },
  ).analyze({ song });
  const analysis = saved.analysis;
  assert.deepEqual(analysis.modules[0].claims.map((item) => item.id), [claim.id]);
  assert.equal(analysis.modules[0].summary, "");
  assert.match(analysis.modules[0].explanation, /踩镲/);
  assert.match(analysis.overallVibe.hype.text, /修订/);
  assert.doesNotMatch(analysis.overallVibe.emo.text, /修订/);
  assert.doesNotMatch(analysis.overallVibe.pro.text, /修订/);
  assert.equal(new Set([analysis.overallVibe.emo.text, analysis.overallVibe.hype.text, analysis.overallVibe.pro.text]).size, 3);
});
test("a nonempty uncited summary is retried and cannot reject the whole analysis", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const saved = await queuedAgent(
    [plan, draft, reviewFixture(draft.modules[0].claims)],
    [source],
    { uncitedWritingFirst: "走心" },
  ).analyze({ song });
  assert.ok(saved.analysis.overallVibe.emo.text);
  assert.ok(saved.analysis.overallVibe.emo.claimIds.length > 0);
  assert.ok(saved.analysis.overallVibe.hype.text);
  assert.ok(saved.analysis.overallVibe.pro.text);
  assert.equal(saved.analysis.completionStatus, "partial");
});
test("source-version listening cues are conditional; a failed cue is blanked alone and passing cues remain", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const unresolvedSong = { ...song, identityStatus: "unresolved" };
  draft.modules[0].claims[0].scope = { level: "source_version", label: scope };
  const audit = reviewFixture(draft.modules.flatMap((module) => module.claims));
  audit.recordingIdentity = "unresolved";
  const badCue = `module:${encodeURIComponent("rhythm")}:cue:1`;
  const prompts = [];
  const saved = await queuedAgent(
    [{ song: unresolvedSong, sources: [], questions: [], unknowns: [] }, draft, audit],
    [source],
    { failWritingAlways: [badCue], prompts },
  ).analyze({ song: unresolvedSong });
  const cues = saved.analysis.modules[0].listeningCues;
  assert.equal(cues.length, 1);
  assert.equal(cues[0].scope, "source_version");
  assert.match(cues[0].text, /^若当前播放录音与来源所述版本相同，/);
  assert.ok(saved.evidenceReview.texts.some((item) => item.textId === badCue && item.verdict === "insufficient"));
  assert.match(saved.analysis.unknowns.join(" "), /听歌线索未全部通过审核/);
  assert.equal(saved.analysis.completionStatus, "partial");
  assert.match(prompts.find((item) => item.schema === "analysis-writing.schema.json")?.prompt || "", /若当前播放录音与来源所述版本相同，/);
});
test("a one-cue module receives a targeted cue-set repair to exactly two listening tasks", async () => {
  const draft = analysisFixture(), { sources: _sources, ...analysisDraft } = draft;
  const prompts = [];
  const saved = await queuedAgent(
    [{ song, sources: [], questions: [], unknowns: [] }, analysisDraft, reviewFixture(analysisDraft.modules.flatMap((module) => module.claims))],
    [source],
    { shortCueSetFirst: true, prompts },
  ).analyze({ song });
  assert.equal(saved.analysis.modules[0].listeningCues.length, 2);
  assert.equal(saved.analysis.completionStatus, "partial");
  assert.ok(saved.evidenceReview.texts.some((item) => item.textId === "module:rhythm:cue_set" && item.verdict === "supports"));
  assert.match(prompts.filter((item) => item.schema === "analysis-writing.schema.json")[1].prompt, /add different concrete listening tasks/);
});
test("structured citations stay attached while raw claim IDs are removed from visible copy", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  draft.modules[0].claims[0].id = "cl-rhythm-01";
  draft.modules[0].claims[0].text += "（cl-rhythm-01）";
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const saved = await queuedAgent([plan, draft, reviewFixture(draft.modules[0].claims)]).analyze({ song });
  const analysis = saved.analysis;
  assert.ok(analysis.overallVibe.emo.claimIds.includes("cl-rhythm-01"));
  const visibleText = [
    ...Object.values(analysis.overallVibe).map((item) => item.text),
    ...analysis.modules.flatMap((module) => [module.title, module.summary, module.explanation, ...module.listeningCues.map((cue) => cue.text)]),
  ].join(" ");
  assert.doesNotMatch(visibleText, /cl-rhythm-01/);
});
test("uncertain release year clears that field only; work-scoped facts remain available", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const workSource = structuredClone(source);
  workSource.id = "src-work";
  workSource.url += "/work";
  workSource.excerpts = [{
    id: "ev-work-culture",
    text: "The composition was written for a stage work and later performed by multiple singers.",
    locator: "Composition notes",
    topics: ["culture"],
  }];
  const workClaim = {
    id: "c-work-context", kind: "external_evidence", status: "supported",
    text: "这部作品的创作语境与舞台作品有关。", evidenceIds: ["ev-work-culture"],
    versionScope: scope, scope: { level: "work", label: "作品层面" },
    prerequisiteClaimIds: [], topic: "culture", reasoningNote: null,
  };
  draft.modules.push({
    ...structuredClone(draft.modules[0]), id: "culture", category: "culture",
    title: "作品语境", claims: [workClaim], summaryClaimIds: [workClaim.id],
    explanationClaimIds: [workClaim.id],
    listeningCues: [{ text: "听歌词叙述是否呈现角色视角。", claimIds: [workClaim.id], scope: "general" }],
  });
  draft.coverage[0] = { category: "culture", status: "analyzed", moduleIds: ["culture"] };
  draft.completionStatus = "partial";
  const plan = { song: { ...song, album: "已核实专辑", releaseYear: "1900" }, sources: [], questions: [], unknowns: [] };
  const audit = reviewFixture(draft.modules.flatMap((module) => module.claims));
  audit.identityFields.find((item) => item.field === "releaseYear").verdict = "insufficient";
  const saved = await queuedAgent([plan, draft, audit], [source, workSource]).analyze({ song });
  assert.equal(saved.analysis.song.identityStatus, "resolved");
  assert.equal(saved.analysis.song.album, "已核实专辑");
  assert.equal(saved.analysis.song.releaseYear, null);
  assert.ok(saved.analysis.modules.some((module) => module.claims.some((item) => item.id === workClaim.id)));
});
test("when a premise fails, its dependent interpretation is removed", async () => {
  const base = analysisFixture(), { sources: _sources, ...draft } = base;
  const interpretation = {
    id: "c-rhythm-interpretation", kind: "ai_interpretation", status: "interpreted",
    text: "這種分層可能帶來穩定的推進感。", evidenceIds: [], versionScope: scope,
    scope: { level: "recording", label: scope }, prerequisiteClaimIds: [claim.id],
    topic: "rhythm", reasoningNote: "依賴已列出的節奏判断。",
  };
  draft.modules[0].claims.push(interpretation);
  const audit = reviewFixture(draft.modules[0].claims);
  audit.claims.find((item) => item.claimId === claim.id).verdict = "insufficient";
  const saved = await queuedAgent([
    { song, sources: [], questions: [], unknowns: [] }, draft, audit,
  ]).analyze({ song });
  assert.equal(saved.analysis.modules.length, 0);
  assert.match(saved.analysis.unknowns.join(" "), /解释所依赖的判断/);
  assert.equal(saved.analysis.overallVibe.emo.text, "");
});
test("frozen PRD cases: rich evidence, ambiguous editions, metadata only, and specific perception without a song source", async () => {
  const base = analysisFixture(),
    { sources: _sources, ...draft } = base;
  const plan = { song, sources: [], questions: [], unknowns: [] };
  const rich = await queuedAgent([
    plan,
    draft,
    reviewFixture(draft.modules[0].claims),
  ]).analyze({ song });
  assert.equal(rich.analysis.modules.length, 1);
  const deeper = diveFixture("rhythm");
  delete deeper.sources;
  const targeted = await queuedAgent([
    plan,
    deeper,
    reviewFixture(deeper.claims),
  ]).deepDive({ analysisId: rich.analysisId, analysisItemId: "rhythm" });
  assert.equal(targeted.deepDive.analysisItemId, "rhythm");
  const ambiguous = {
    ...song,
    identityStatus: "ambiguous",
    candidates: [
      {
        id: "studio",
        title: song.title,
        artist: song.artist,
        versionScope: scope,
        recordingId: null,
        reason: "合成录音室候选",
      },
      {
        id: "live",
        title: song.title,
        artist: song.artist,
        versionScope: "fixture:live",
        recordingId: null,
        reason: "合成现场候选",
      },
    ],
  };
  const disputed = await queuedAgent([
    { ...plan, song: ambiguous },
    draft,
    reviewFixture(draft.modules[0].claims),
  ]).analyze({ song });
  assert.equal(disputed.analysis.song.candidates.length, 2);
  assert.equal(disputed.analysis.modules.length, 0);
  const oneCandidate = {
    ...song,
    identityStatus: "ambiguous",
    candidates: [ambiguous.candidates[0]],
  };
  const sourceScopedDraft = structuredClone(draft);
  sourceScopedDraft.modules[0].claims[0].scope = { level: "source_version", label: scope };
  const oneCandidateReview = reviewFixture(sourceScopedDraft.modules.flatMap((module) => module.claims));
  oneCandidateReview.recordingIdentity = "ambiguous";
  const unresolved = await queuedAgent([
    { ...plan, song: oneCandidate },
    sourceScopedDraft,
    oneCandidateReview,
  ]).analyze({ song: oneCandidate });
  assert.equal(unresolved.analysis.song.identityStatus, "unresolved");
  assert.equal(unresolved.analysis.modules.length, 1);
  assert.match(unresolved.analysis.unknowns.join(" "), /降为未解析/);
  const metadataOnly = {
    ...structuredClone(source),
    excerpts: [structuredClone(source.excerpts[0])],
  };
  const sparse = await queuedAgent(
    [plan, draft, reviewFixture(draft.modules[0].claims, "insufficient")],
    [metadataOnly],
  ).analyze({ song });
  assert.equal(sparse.analysis.modules.length, 0);
  assert.equal(sparse.analysis.song.identityStatus, "resolved");
  const noSourceDraft = structuredClone(draft);
  noSourceDraft.modules = [];
  const perception = "副歌为何突然感觉开阔？";
  const unknown = await queuedAgent(
    [plan, noSourceDraft, reviewFixture([])],
    [],
  ).analyze({ song, userPerception: perception });
  assert.equal(unknown.analysis.userPerception, perception);
  assert.equal(unknown.analysis.modules.length, 0);
  const theoretical = diveFixture("question");
  delete theoretical.sources;
  const learning = await queuedAgent(
    [plan, theoretical, reviewFixture(theoretical.claims)],
    [],
  ).deepDive({
    analysisId: unknown.analysisId,
    analysisItemId: "question",
    question: perception,
  });
  assert.equal(
    learning.deepDive.studio.seed.sourceType,
    "learning_reconstruction",
  );
});
