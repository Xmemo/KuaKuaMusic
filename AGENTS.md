# MusicLearning2026 Agent Rules

## Current target: v3 Single Agent + Generic Skill

The current target architecture is documented in:

- `docs/TECHNICAL_ARCHITECTURE_V3.md`
- `.agents/skills/music-analysis/SKILL.md`

v1/v2 remain compatibility/reference paths. Do not apply their older “web evidence before every song-specific music claim” or mandatory MCP assumptions to the v3 route.

## Product objective

Help the user understand a specific recording, keep observation/measurement/source/interpretation boundaries visible, and optionally turn one supported mechanism into a small executable learning experiment.

## v3 architecture rules

1. The `music-analysis` Skill must remain model-agnostic and host-agnostic.
2. Model/CLI/API details belong only in Runner adapters.
3. Do not make v3 depend on MCP servers. Current v3 rejects a run that reports MCP tool use.
4. Preserve the Listen-first checkpoint before external research.
5. A precise numerical music claim must come from an executed measurement, not confident prose.
6. Measurements are estimators; preserve ambiguity and alternatives when meaningful.
7. External evidence must preserve a real URL and supporting source content.
8. General music theory may explain a mechanism, but may not prove an unobserved song-specific feature.
9. Unknown is a valid output.
10. The server independently validates timestamps, IDs, references, measurement artifact paths, and Strudel code.

## Four epistemic categories

Keep separate:

- observation
- measurement
- external_evidence
- interpretation

Do not create additional provenance labels unless they solve a real product problem.

## Recording identity

Treat recording/version selection as first-class.

The current local materializer:

- searches candidate audio;
- requires version confirmation;
- records acquisition provenance;
- measures actual duration;
- caches media revisions locally.

Do not silently reuse a different catalog/version snapshot.

## Skill discipline

The canonical Skill must not mention:

- Gemini
- Antigravity
- Qwen
- DashScope
- SiliconFlow
- KuaKuaMusic-specific UI
- Strudel-specific product flow

Product-specific instructions belong in the v3 product prompt and output schema.

## Studio

Studio remains Strudel-first at the application layer.

Any Agent-generated code is a `learning_reconstruction` unless reliable matching transcription/score evidence exists and a future product flow explicitly upgrades provenance.

Server runtime policy remains authoritative. Do not bypass it because a model generated the code.

## Repository changes

The AGPL licensing decision is recorded in `docs/STRUDEL_LICENSE_DECISION.md`.

Implementation contracts are defined in:

- `music-learning/contracts.mjs` — legacy/current v1
- `music-learning/v2/contracts.mjs` — v2 reference
- `music-learning/v3/contracts.mjs` — v3 target

Regenerate schemas with:

```bash
npm run schemas:generate
```

Generated-schema drift must remain CI-failing.

Do not commit local audio, analysis workspaces, API keys, or credentials.
