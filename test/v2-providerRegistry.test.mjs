import test from "node:test";
import assert from "node:assert/strict";
import {
  createProviderRegistry,
  resolveProviderPlan,
} from "../music-learning/v2/providerRegistry.mjs";

test("defaults all four roles to DashScope qwen3.8-omni-flash", () => {
  const plan = resolveProviderPlan({});
  assert.equal(plan.listen.provider, "dashscope");
  assert.equal(plan.listen.model, "qwen3.8-omni-flash");
  assert.equal(plan.research.backend, "registered-web");
  assert.equal(plan.research.model, "qwen3.8-omni-flash");
  assert.equal(plan.critic.model, "qwen3.8-omni-flash");
  assert.equal(plan.creative.model, "qwen3.8-omni-flash");
});

test("roles can switch providers independently", () => {
  const plan = resolveProviderPlan({
    MUSIC_LISTEN_PROVIDER: "siliconflow",
    MUSIC_LISTEN_MODEL: "Qwen/Qwen3-Omni-30B-A3B-Thinking",
    MUSIC_RESEARCH_PROVIDER: "codex-cli",
    MUSIC_RESEARCH_MODEL: "gpt-6-luna",
    MUSIC_CRITIC_PROVIDER: "codex-cli",
    MUSIC_CRITIC_MODEL: "gpt-6-luna",
  });
  assert.equal(plan.listen.provider, "siliconflow");
  assert.equal(plan.research.provider, "codex-cli");
  assert.equal(plan.critic.provider, "codex-cli");
  assert.equal(plan.creative.provider, "dashscope");
});

test("Codex CLI cannot be selected as Listen until it declares audio support", () => {
  assert.throws(
    () =>
      resolveProviderPlan({
        MUSIC_LISTEN_PROVIDER: "codex-cli",
        MUSIC_LISTEN_MODEL: "gpt-6-luna",
      }),
    /does not declare audio understanding/,
  );
});

test("provider-native research requires native web search capability", () => {
  assert.throws(
    () =>
      resolveProviderPlan({
        MUSIC_RESEARCH_PROVIDER: "siliconflow",
        MUSIC_RESEARCH_BACKEND: "provider-native",
      }),
    /nativeWebSearch/,
  );
});

test("custom provider capabilities can be registered without changing pipeline code", () => {
  const registry = createProviderRegistry({
    "future-local": {
      audioUnderstanding: true,
      structuredText: true,
      nativeWebSearch: false,
      localExecution: true,
    },
  });
  const plan = resolveProviderPlan(
    {
      MUSIC_LISTEN_PROVIDER: "future-local",
      MUSIC_LISTEN_MODEL: "music-local-v1",
    },
    registry,
  );
  assert.equal(plan.listen.provider, "future-local");
  assert.equal(plan.listen.capabilities.localExecution, true);
});
