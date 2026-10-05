import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCriticReferences,
} from "../server/v2/criticPass.mjs";
import {
  validateCreativeReferences,
} from "../server/v2/creativePass.mjs";
import {
  creativeBlueprintToStrudelPlan,
} from "../server/v2/creativeStrudelBridge.mjs";

const observation = {
  observations: [
    {
      id: "obs-rhythm-1",
      category: "rhythm",
      statement: "重复脉冲在转折前保持稳定。",
    },
    {
      id: "obs-arrangement-1",
      category: "arrangement",
      statement: "转折后层次明显增加。",
    },
  ],
};

const sources = [
  {
    id: "src-1",
    excerpts: [
      {
        id: "ev-rhythm-1",
        topics: ["rhythm"],
      },
    ],
  },
];

function criticDraft() {
  return {
    overallVibe: {
      hook: { text: "重复之后突然打开。", interpretationIds: ["int-rhythm"] },
      emo: { text: "压住再释放。", interpretationIds: ["int-rhythm"] },
      hype: { text: "转折很抓耳。", interpretationIds: ["int-rhythm"] },
      pro: { text: "稳定脉冲与密度变化形成结构对比。", interpretationIds: ["int-rhythm"] },
    },
    interpretations: [
      {
        id: "int-rhythm",
        category: "rhythm",
        text: "稳定重复建立参照，转折后的密度变化因此更突出。",
        observationIds: ["obs-rhythm-1"],
        evidenceIds: ["ev-rhythm-1"],
        generalPrinciples: ["重复可建立时间预期。"],
      },
    ],
    modules: [
      {
        id: "mod-rhythm",
        category: "rhythm",
        title: "先重复，再打开",
        summary: "最明显的力量来自前后密度对比。",
        interpretationIds: ["int-rhythm"],
        listeningCues: [
          {
            text: "比较转折前后的节奏密度。",
            startSec: 70,
            endSec: 85,
            observationIds: ["obs-rhythm-1"],
            evidenceIds: [],
          },
        ],
        unknowns: [],
        expandable: true,
        studioPotential: "rhythm",
      },
    ],
    unknowns: [],
  };
}

test("critic accepts only references that exist in observation/source artifacts", () => {
  const draft = criticDraft();
  assert.equal(
    validateCriticReferences(draft, { observation, sources }),
    draft,
  );
});

test("critic rejects invented observation references", () => {
  const draft = criticDraft();
  draft.interpretations[0].observationIds = ["obs-does-not-exist"];
  assert.throws(
    () => validateCriticReferences(draft, { observation, sources }),
    /不存在的听觉观察/,
  );
});

test("creative blueprint stays traceable and maps to a learning reconstruction", () => {
  const analysis = {
    interpretations: criticDraft().interpretations,
  };
  const draft = {
    title: "由重复到释放",
    concept: "保持脉冲，改变密度。",
    sourceObservationIds: ["obs-rhythm-1", "obs-arrangement-1"],
    sourceInterpretationIds: ["int-rhythm"],
    variables: [
      {
        id: "var-density",
        type: "rhythmic_density",
        baseline: "稀疏重复脉冲",
        variation: "更密的细分事件",
        sourceObservationIds: ["obs-rhythm-1"],
      },
      {
        id: "var-layer",
        type: "layer_entry",
        baseline: "单层节奏",
        variation: "加入第二层",
        sourceObservationIds: ["obs-arrangement-1"],
      },
    ],
    preserve: ["tempo"],
    listenFor: ["密度变化是否带来更强的转折感"],
    limitations: ["这是教学重构，不是原曲转录。"],
    studioEligible: true,
  };
  validateCreativeReferences(draft, { observation, analysis });
  const plan = creativeBlueprintToStrudelPlan({
    schemaVersion: "2.0",
    blueprintId: "bp-1",
    songId: "song-1",
    analysisId: "analysis-1",
    ...draft,
  });
  assert.equal(plan.eligible, true);
  assert.equal(plan.sourceType, "learning_reconstruction");
  assert.ok(plan.visualHints.includes("punchcard"));
  assert.ok(plan.variables.some((item) => item.type === "layer_entry"));
});

test("creative variables cannot be generated from interpretation alone", () => {
  const analysis = { interpretations: criticDraft().interpretations };
  const draft = {
    title: "抽象情绪",
    concept: "只说更英雄感",
    sourceObservationIds: [],
    sourceInterpretationIds: ["int-rhythm"],
    variables: [
      {
        id: "var-invalid",
        type: "timbre_brightness",
        baseline: "暗",
        variation: "亮",
        sourceObservationIds: [],
      },
    ],
    preserve: [],
    listenFor: [],
    limitations: [],
    studioEligible: true,
  };
  assert.throws(
    () => validateCreativeReferences(draft, { observation, analysis }),
    /具体 Audio Observation/,
  );
});
