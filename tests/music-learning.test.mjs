import test, { after } from "node:test";
import assert from "node:assert/strict";
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
  a.modules[0].summary += " Tempo is 99 BPM.";
  assert.throws(() => validateSongAnalysisIntegrity(a, a.sources), /摘要/);
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
function queuedAgent(outputs, sources = [source]) {
  const queue = outputs.map((x) => structuredClone(x));
  return createMusicLearningAgent({
    run: async () => {
      assert.ok(queue.length, "unexpected extra Agent call");
      return queue.shift();
    },
    register: async () => ({ sources: structuredClone(sources), unknowns: [] }),
  });
}
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
  assert.match(stored.analysis.overallVibe.pro.text, /资料不足/);
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
  review.identitySupported = false;
  const saved = await queuedAgent([plan, draft, review]).analyze({ song });
  assert.equal(saved.analysis.song.identityStatus, "unresolved");
  assert.equal(saved.analysis.song.album, null);
  assert.equal(saved.analysis.song.releaseYear, null);
  assert.equal(saved.analysis.modules.length, 0);
  assert.equal(saved.evidenceReview.identitySupported, false);
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
