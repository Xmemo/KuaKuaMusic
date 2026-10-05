import test from "node:test";
import assert from "node:assert/strict";
import {
  createStructuredTextProvider,
} from "../server/v2/textProvider.mjs";
import {
  createStrudelSeedPass,
} from "../server/v2/strudelSeedPass.mjs";

test("Codex text provider honors the role model and disables research tools", async () => {
  let call = null;
  const provider = createStructuredTextProvider(
    {
      provider: "codex-cli",
      model: "role-specific-model",
    },
    {
      codexRunner: async (value) => {
        call = value;
        return {
          title: "test",
          concept: "test",
          sourceObservationIds: [],
          sourceInterpretationIds: [],
          variables: [],
          preserve: [],
          listenFor: [],
          limitations: [],
          studioEligible: false,
        };
      },
    },
  );

  await provider.generateJson({
    schemaName: "v2-creative-draft",
    prompt: "test",
  });

  assert.equal(call.model, "role-specific-model");
  assert.equal(call.researchEnabled, false);
  assert.match(call.outputSchema, /v2-creative-draft\.schema\.json$/);
});

test("Strudel seed pass retries invalid code and keeps learning-reconstruction provenance", async () => {
  let calls = 0;
  const responses = [
    {
      code: 'fetch("https://example.com")',
      alternativeCode: 's("bd ~ sd ~")',
      explanation: "invalid first attempt",
      visualHints: ["punchcard"],
      experiment: {
        question: "密度变化如何影响推进感？",
        variable: "rhythmic_density",
        baseline: "稀疏",
        changed: "更密",
        constants: ["tempo"],
        listenFor: ["比较节奏密度"],
        limitation: "这是教学重构，不是原曲转录。",
      },
    },
    {
      code: 's("bd ~ sd ~")',
      alternativeCode: 's("bd hh sd hh")',
      explanation: "只改变节奏密度。",
      visualHints: ["punchcard"],
      experiment: {
        question: "密度变化如何影响推进感？",
        variable: "rhythmic_density",
        baseline: "稀疏四拍脉冲",
        changed: "加入更密的间隔事件",
        constants: ["tempo", "sound family"],
        listenFor: ["比较推进感和转折感"],
        limitation: "这是教学重构，不是原曲转录。",
      },
    },
  ];

  const fetcher = async () => {
    const payload = responses[calls++];
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(payload),
              },
            },
          ],
        };
      },
    };
  };

  const pass = createStrudelSeedPass({
    selection: {
      provider: "dashscope",
      model: "qwen3.5-omni-plus",
    },
    env: {
      DASHSCOPE_API_KEY: "test-key",
      DASHSCOPE_BASE_URL: "https://example.invalid/v1",
    },
    fetcher,
  });

  const seed = await pass.run({
    song: {
      songId: "song-1",
      title: "Test",
      artist: "Artist",
    },
    observation: {
      estimatedParameters: {
        bpm: { value: 128, confidence: 0.9 },
      },
      observations: [
        {
          id: "obs-1",
        },
      ],
    },
    analysis: {
      analysisId: "analysis-1",
      interpretations: [
        {
          id: "int-1",
        },
      ],
    },
    blueprint: {
      blueprintId: "bp-1",
      songId: "song-1",
      analysisId: "analysis-1",
      studioEligible: true,
      sourceObservationIds: ["obs-1"],
      sourceInterpretationIds: ["int-1"],
      variables: [
        {
          id: "var-1",
          type: "rhythmic_density",
          baseline: "稀疏",
          variation: "更密",
          sourceObservationIds: ["obs-1"],
        },
      ],
    },
    plan: {
      eligible: true,
      visualHints: ["punchcard"],
      variables: [
        {
          id: "var-1",
          type: "rhythmic_density",
          operations: ["sequence", "subdivision", "fast"],
          visualHints: ["punchcard"],
        },
      ],
    },
  });

  assert.equal(calls, 2);
  assert.equal(seed.sourceType, "learning_reconstruction");
  assert.equal(seed.playback.bpm, 128);
  assert.equal(seed.blueprintId, "bp-1");
  assert.deepEqual(seed.sourceObservationIds, ["obs-1"]);
  assert.deepEqual(seed.sourceInterpretationIds, ["int-1"]);
});
