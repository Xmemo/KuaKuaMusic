// Synthetic fixtures. These passages and song names are not real research.
export const scope = "fixture:studio";
export const playback = {
  bpm: 120,
  beatsPerCycle: 4,
  soundBank: "default",
  runtimeVersion: "unbound",
};
export const song = {
  title: "测试歌曲",
  artist: "测试艺人",
  album: null,
  releaseYear: null,
  versionScope: scope,
  identityStatus: "resolved",
  candidates: [],
  musicBrainzRecordingId: null,
  musicBrainzWorkId: null,
  musicBrainzReleaseId: null,
};
export const source = {
  id: "src-fixture",
  title: "合成测试资料",
  author: null,
  publisher: null,
  sourceType: "official",
  url: "https://example.test/fixture",
  versionScope: scope,
  documentHash: "fixture-hash",
  retrievedAt: "2026-10-02T00:00:00Z",
  excerpts: [
    {
      id: "ev-identity",
      text: "测试歌曲由测试艺人录制，这是用于测试的录音室版本。",
      locator: "身份段落",
      topics: ["identity"],
    },
    {
      id: "ev-rhythm",
      text: "在这个合成案例中，踩镲采用八分音符，底鼓的节奏保持不变。",
      locator: "节奏段落",
      topics: ["rhythm"],
    },
  ],
};
export const claim = {
  id: "c-rhythm",
  kind: "external_evidence",
  status: "supported",
  text: "合成案例的踩镲采用八分音符。",
  evidenceIds: ["ev-rhythm"],
  versionScope: scope,
  scope: { level: "recording", label: scope },
  prerequisiteClaimIds: [],
  topic: "rhythm",
  reasoningNote: null,
};
const expression = (label) => ({ text: label + "：" + claim.text, claimIds: [claim.id] });
export function analysisFixture() {
  return structuredClone({
    song,
    userPerception: null,
    overallVibe: {
      hook: expression("一句话"),
      emo: expression("走心"),
      hype: expression("上头"),
      pro: expression("懂行"),
    },
    modules: [
      {
        id: "rhythm",
        category: "rhythm",
        title: "踩镲的疏密",
        summary: claim.text,
        summaryClaimIds: [claim.id],
        explanation: "该段资料描述了踩镲的细分方式。\n\n因此可以留意它如何和底鼓保持稳定关系。",
        explanationClaimIds: [claim.id],
        listeningCues: [{ text: "跟着底鼓听踩镲的细分。", claimIds: [claim.id], scope: "recording" }],
        claims: [claim],
        unknowns: [],
        expandable: true,
        studioPotential: "rhythm",
      },
    ],
    coverage: [
      { category: "culture", status: "insufficient", moduleIds: [] },
      { category: "harmony", status: "insufficient", moduleIds: [] },
      { category: "rhythm", status: "analyzed", moduleIds: ["rhythm"] },
      { category: "timbre", status: "insufficient", moduleIds: [] },
    ],
    completionStatus: "partial",
    sources: [source],
    unknowns: [],
  });
}
export function diveFixture(id = "rhythm") {
  const theory = {
    id: "c-general",
    kind: "general_theory",
    status: "general",
    text: "保持速度和其他声部一致时，增加踩镲事件可用于比较节奏密度。",
    evidenceIds: [],
    versionScope: "general",
    scope: { level: "general", label: "通用音乐原理" },
    prerequisiteClaimIds: [],
    topic: "rhythm",
    reasoningNote: "这是通用教学机制，不确认原曲编曲。",
  };
  return structuredClone({
    analysisItemId: id,
    title: "只改变踩镲密度",
    claims: [theory],
    sources: [source],
    generalTheory: [{ concept: "节奏密度", explanation: theory.text }],
    conflicts: [],
    unknowns: [],
    listeningCues: [
      { text: "比较两版的密度。", claimIds: [theory.id], scope: "general" },
    ],
    studio: {
      eligible: true,
      potential: "rhythm",
      reason: "可以进行单变量教学实验。",
      seed: {
        sourceType: "learning_reconstruction",
        evidenceIds: [],
        code: 's("bd*4,hh*4")._punchcard()',
        alternativeCode: 's("bd*4,hh*8")._punchcard()',
        explanation: "增加踩镲，其他条件保持一致。",
        visualHints: ["punchcard"],
        playback,
        experiment: {
          question: "更密的踩镲会改变什么？",
          variable: "踩镲事件密度",
          baseline: "每循环四次踩镲",
          changed: "每循环八次踩镲",
          constants: ["底鼓", "速度", "音源", "音量"],
          listenFor: ["密度", "推进感"],
          limitation: "这是合成教学演示，不是原曲转录。",
        },
      },
    },
  });
}
export function reviewFixture(claims, verdict = "supports") {
  return {
    claims: claims.map((c) => ({
      claimId: c.id,
      verdict,
      applicability: c.scope?.level || "general",
      reason: "合成测试审核",
    })),
    identityFields: ["title", "artist", "album", "releaseYear", "musicBrainzRecordingId", "musicBrainzWorkId", "musicBrainzReleaseId"].map((field) => ({
      field,
      verdict: "supports",
      reason: "合成测试身份审核",
      evidenceIds: ["ev-identity"],
    })),
    recordingIdentity: "resolved",
    texts: [],
    transcriptionSupported: false,
  };
}
