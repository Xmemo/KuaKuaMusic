const ROLE_DEFAULTS = Object.freeze({
  listen: { provider: "dashscope", model: "qwen3.5-omni-plus" },
  research: { provider: "dashscope", model: "qwen3.5-omni-plus" },
  critic: { provider: "dashscope", model: "qwen3.5-omni-plus" },
  creative: { provider: "dashscope", model: "qwen3.5-omni-plus" },
});

const BUILTIN_CAPABILITIES = Object.freeze({
  dashscope: Object.freeze({
    audioUnderstanding: true,
    structuredText: true,
    nativeWebSearch: true,
    localExecution: false,
  }),
  siliconflow: Object.freeze({
    audioUnderstanding: true,
    structuredText: true,
    nativeWebSearch: false,
    localExecution: false,
  }),
  "codex-cli": Object.freeze({
    audioUnderstanding: false,
    structuredText: true,
    nativeWebSearch: true,
    localExecution: true,
  }),
});

const ROLE_ENV = Object.freeze({
  listen: ["MUSIC_LISTEN_PROVIDER", "MUSIC_LISTEN_MODEL"],
  research: ["MUSIC_RESEARCH_PROVIDER", "MUSIC_RESEARCH_MODEL"],
  critic: ["MUSIC_CRITIC_PROVIDER", "MUSIC_CRITIC_MODEL"],
  creative: ["MUSIC_CREATIVE_PROVIDER", "MUSIC_CREATIVE_MODEL"],
});

export const providerRoles = Object.freeze(Object.keys(ROLE_DEFAULTS));

export function createProviderRegistry(extra = {}) {
  const normalized = {};
  for (const [name, value] of Object.entries({
    ...BUILTIN_CAPABILITIES,
    ...extra,
  })) {
    normalized[name] = Object.freeze({
      audioUnderstanding: Boolean(value.audioUnderstanding),
      structuredText: Boolean(value.structuredText),
      nativeWebSearch: Boolean(value.nativeWebSearch),
      localExecution: Boolean(value.localExecution),
    });
  }
  return Object.freeze(normalized);
}

function requireProvider(registry, name) {
  const capabilities = registry[name];
  if (!capabilities) {
    throw new Error(
      "Unknown MusicLearning provider '" +
        name +
        "'. Register its capabilities before selecting it.",
    );
  }
  return capabilities;
}

function selection(role, env, registry) {
  const [providerKey, modelKey] = ROLE_ENV[role];
  const provider =
    String(env[providerKey] || "").trim() || ROLE_DEFAULTS[role].provider;
  const model =
    String(env[modelKey] || "").trim() || ROLE_DEFAULTS[role].model;
  const capabilities = requireProvider(registry, provider);

  if (role === "listen" && !capabilities.audioUnderstanding) {
    throw new Error(
      "Listen provider '" + provider + "' does not declare audio understanding.",
    );
  }
  if (!capabilities.structuredText) {
    throw new Error(
      "Provider '" + provider + "' does not declare structured text output.",
    );
  }

  return Object.freeze({ role, provider, model, capabilities });
}

export function resolveProviderPlan(
  env = process.env,
  registry = createProviderRegistry(),
) {
  const listen = selection("listen", env, registry);
  const research = selection("research", env, registry);
  const critic = selection("critic", env, registry);
  const creative = selection("creative", env, registry);
  const backend = String(
    env.MUSIC_RESEARCH_BACKEND || "registered-web",
  ).trim();

  if (!["registered-web", "provider-native", "codex-web"].includes(backend)) {
    throw new Error("Unknown MUSIC_RESEARCH_BACKEND '" + backend + "'.");
  }
  if (backend === "provider-native" && !research.capabilities.nativeWebSearch) {
    throw new Error(
      "Research backend provider-native requires a provider with nativeWebSearch.",
    );
  }

  return Object.freeze({
    listen,
    research: Object.freeze({ ...research, backend }),
    critic,
    creative,
  });
}

export function providerHealthSummary(plan) {
  return Object.fromEntries(
    ["listen", "research", "critic", "creative"].map((role) => {
      const value = plan[role];
      return [
        role,
        {
          provider: value.provider,
          model: value.model,
          capabilities: value.capabilities,
          ...(role === "research" ? { backend: value.backend } : {}),
        },
      ];
    }),
  );
}
