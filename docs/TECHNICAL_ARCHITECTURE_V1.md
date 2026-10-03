> Initial architecture baseline. Current implemented contracts, APIs, UI, persistence and verification limits: [Technical Architecture v1.1](TECHNICAL_ARCHITECTURE_V1.1.md).

# MusicLearning2026 — Technical Architecture v1

## 0. Architecture decision

The canonical architecture is:

```
React/Vite UI
   │
   ├─ catalog search (existing)
   │
   └─ local MusicLearning API
          │
          ▼
     Codex Agent Bridge
          │
          ├─ MusicBrainz MCP ── identity / recording / work / release / credits
          ├─ Web research ───── interviews / official material / analysis / transcription sources
          ├─ AGENTS.md ──────── evidence policy
          └─ JSON Schema ───── structured output contract
          │
          ▼
     Evidence Package
          │
          ├─ structured analysis
          ├─ targeted deep dives
          └─ Studio seeds
                    │
                    ▼
             Strudel Studio Adapter
                    │
                    ├─ code
                    ├─ playback
                    ├─ visual feedback
                    ├─ diff/apply
                    └─ undo/redo
```

The legacy Agnes call path is transitional. New MusicLearning2026 work should target the Agent bridge.

---

## 1. Responsibility boundaries

### UI

Owns:

- input;
- search candidate selection;
- user perception/question;
- rendering structured analysis;
- source/evidence disclosure;
- choosing an analysis item;
- deep-dive UI;
- Studio session UI.

Does not own:

- truth judgments;
- source verification;
- silent version selection;
- song-specific factual inference.

### Catalog search

The existing search implementation remains useful as a fast discovery layer.

It is **not** the source of truth for evidence.

### MusicBrainz MCP

Canonical role:

> identity resolver / provenance backbone

Use it for:

- artist;
- recording;
- work;
- release/release-group;
- relationships;
- identifiers;
- version disambiguation.

Do not use MusicBrainz as proof for a harmony/rhythm/production claim it does not contain.

### Web research

Canonical role:

> song-specific evidence retrieval

The Agent should prefer primary/near-primary sources when possible and read the actual source rather than citing search snippets.

### Codex Agent

Canonical role:

> research + verification + synthesis

The Agent produces schema-valid JSON and follows the project evidence rules in AGENTS.md.

Schema validity is not treated as sufficient. Server-side integrity validation rejects dangling source IDs, unsupported V1 machine observations, inconsistent Studio eligibility, and transcription labels without an actual score/transcription source.

It is intentionally one Agent, not "GPT writer + Codex checker".

### Evidence package

Canonical role:

> durable local record of what is known, why it is shown, and what the user explored

This becomes the shared contract between Analysis, Deep Dive, and Studio.

### Studio

Canonical role:

> executable explanation

The Studio should not become an unrelated DAW.

---

## 2. Local Agent bridge

### Runtime

The local Express server invokes Codex CLI using non-interactive `codex exec`.

Recommended characteristics:

- ephemeral turn for each structured call;
- project working directory = repository root;
- project AGENTS.md automatically supplies evidence policy;
- project .codex/config.toml supplies MusicBrainz MCP;
- JSON Schema constrains final output;
- timeout and output-size limits enforced server-side;
- no arbitrary shell prompt endpoint exposed to the browser.

### Why this path

It lets the local product reuse the same Agent/tool environment used during development:

- ChatGPT/Codex-authenticated local runtime;
- web search where available;
- MCP servers;
- schema-constrained output;
- no second "AI personality" in the product model.

### Endpoints

#### POST /api/agent/analyze

Input:

```json
{
  "song": {
    "title": "...",
    "artist": "...",
    "album": "...",
    "releaseYear": "..."
  },
  "userPerception": "..."
}
```

Output:

SongAnalysis JSON matching `schemas/song-analysis.schema.json`.

#### POST /api/agent/deep-dive

Input:

```json
{
  "analysis": { "...": "SongAnalysis" },
  "analysisItemId": "...",
  "question": "optional"
}
```

Output:

DeepDive JSON matching `schemas/deep-dive.schema.json`.

### Security boundary

The browser never submits an arbitrary Codex system prompt.

The server constructs prompts from bounded fields and serializes user-provided text as quoted data.

The Agent runs read-only with respect to the repository for analysis tasks.

---

## 3. Evidence data model

The most important technical choice is to separate four evidence planes.

### A. external_evidence

What external sources state.

Examples:

- release date;
- personnel;
- producer quote;
- published chord/transcription data;
- documented recording technique.

### B. user_perception

What the user says they hear or feel.

Example:

> "副歌突然变宽"

This is valid data but not an objective song fact.

### C. machine_observation

Future audio-analysis estimates.

Examples:

- estimated tempo;
- detected chord;
- segment boundary.

V1 has no audio-analysis engine, so this field should normally be absent.

### D. ai_interpretation

The Agent's explanation connecting evidence and theory.

Example:

> Added backing vocals and higher-register layers may explain the user's perception of increased width.

This is interpretation, not a quoted source fact.

### Claim structure

Every claim should carry:

- `kind`;
- `status`;
- `text`;
- `sourceIds`;
- `versionScope`;
- optional `reasoningNote`.

Unknowns are first-class data.

---

## 4. Analysis pipeline

```
1. Receive selected catalog candidate
2. Resolve recording identity with MusicBrainz MCP
3. Detect ambiguity
4. Build research questions from:
   - user perception
   - recording metadata
   - potentially useful analysis dimensions
5. Search/read sources
6. Build source table
7. Draft claims from evidence
8. Reject/downgrade unsupported claims
9. Generate overall 走心/上头/懂行 from same evidence set
10. Generate only supported structured modules
11. Return schema-valid JSON
12. Persist evidence package
```

Important inversion:

> **Evidence → Claim**

not:

> **Claim → find something that sounds supportive**

---

## 5. Deep-dive pipeline

Input is one existing analysis item.

```
selected item
   ↓
re-read mapped sources
   ↓
targeted second-pass search
   ↓
persist newly discovered / reused sources
   ↓
confirmed facts
   ↓
source-specific support
   ↓
AI interpretation
   ↓
general theory
   ↓
conflicts / unknowns
   ↓
Studio eligibility
```

Studio eligibility is narrow:

- `none`
- `rhythm`
- `harmony`
- `both`

A deep dive can be excellent even when Studio eligibility is `none`.

---

## 6. Strudel-first Studio architecture

### Architectural intent

The canonical Studio artifact is a **small executable Strudel program** plus revision history.

The old concept of a bespoke MIDI editing window is removed.

### StudioSession

Conceptual model:

```ts
type StudioRevision = {
  id: string
  code: string
  sourceType: "source_transcription" | "learning_reconstruction" | "user_version"
  createdAt: string
}

type StudioSession = {
  id: string
  analysisItemId: string
  sourceIds: string[]
  visualHints: ("pianoroll" | "punchcard" | "spiral" | "scope" | "spectrum" | "pitchwheel")[]
  revisions: StudioRevision[]
  revisionIndex: number
}

// Current source type is derived from the active revision.
// Undo/reset therefore restores the original source label.
```

### Adapter contract

Runtime integration must sit behind a `StrudelStudioAdapter`:

```ts
interface StrudelStudioAdapter {
  getPattern(): string
  setPattern(code: string): Promise<void>
  play(): Promise<void>
  stop(): Promise<void>
  setTempo(value: number): Promise<void>
  validate(code: string): Promise<ValidationResult>
}
```

App-owned state handles:

- diff;
- apply;
- undo;
- redo;
- reset to source seed.

This mirrors the strongest part of the Apfelstrudel interaction model without coupling the evidence system to its backend.

### Visual mapping

Prefer native Strudel visual functions:

| Learning question | Visual |
|---|---|
| note/chord/register | inline pianoroll |
| rhythmic placement/density | punchcard or pianoroll |
| cyclic rhythm | spiral |
| waveform/envelope | scope |
| filter/spectrum | spectrum |
| pitch-class movement | pitchwheel |

The AI may include visual hints in a Studio seed.

### Example learning reconstruction

A Studio seed should explain what variable it isolates.

Example:

```js
stack(
  note("<c3 g3 a3 f3>").s("sine")._pianoroll({ labels: 1 }),
  s("bd ~ sd ~, hh*8")
)
```

This must be labeled `learning_reconstruction` unless an actual matching transcription source supports it.

---

## 7. Strudel licensing gate

Current Strudel code/packages are AGPL.

Therefore this architecture PR deliberately does **not** add `@strudel/*` to package.json.

Before bundling:

1. decide whether KuaKuaMusic/MusicLearning2026 will be distributed under an AGPL-compatible license;
2. review default sound-bank licensing separately;
3. then implement `StrudelStudioAdapter` with the selected package(s).

This keeps the product architecture stable without silently changing repository licensing.

---

## 8. Local evidence persistence

Target local layout:

```
.music-learning/
  evidence/
    <stable-song-key>/
      metadata.json
      sources.json
      analysis.json
      deep-dives/
        <analysis-item-id>.json
      studio/
        <session-id>.json
```

Suggested stable song key priority:

1. MusicBrainz recording MBID;
2. otherwise normalized artist + title + version hash.

The evidence directory should be gitignored by default unless a user intentionally promotes a case into test fixtures.

---

## 9. Migration from current app

### Keep

- React/Vite shell;
- current visual identity;
- song search and candidate selection;
- overall 走心 / 上头 / 懂行 tabs;
- current local Express development server.

### Replace

- Agnes-generated unsupported deepDive text;
- fixed requirement that all four modules be populated;
- generic follow-up chat as the only depth mechanism;
- future MIDI-window-first Studio concept.

### Add

- Codex Agent bridge;
- MusicBrainz MCP project config;
- schemas;
- evidence-aware Analysis contract;
- item-specific deep dive;
- Strudel Studio contract;
- local evidence persistence.

### Transitional rule

Do not delete the existing runtime in the architecture PR.

The new path should be introduced side-by-side, then the UI can migrate one stage at a time:

1. Analysis page;
2. Deep Dive;
3. Studio.

---

## 10. Testing strategy

### Unit

- prompt serialization;
- claim/evidence schema parsing;
- runtime evidence-integrity validation;
- second-pass source persistence;
- Studio revision reducer and source-label restoration;
- invalid/oversized Agent responses;
- timeout behavior.

### Contract fixtures

Four canonical song fixtures matching PRD acceptance cases.

Fixtures should preserve source metadata and expected epistemic boundaries, not brittle prose snapshots.

### Manual local acceptance

- `codex --version`;
- `codex mcp list`;
- MusicBrainz server visible;
- analyze endpoint returns schema-valid JSON;
- unsupported field remains absent/unknown;
- deep dive maps to selected item;
- Studio seed is labeled correctly.

---

## 11. Next implementation slices

### P0 — architecture scaffold

- frozen PRD;
- Agent policy;
- MusicBrainz MCP config;
- schemas;
- local Codex bridge;
- new API contracts;
- Studio adapter contract.

### P1 — migrate analysis UI

Render `SongAnalysis.modules[]` and source mappings.

### P2 — deep-dive page

Item-specific research + Studio eligibility.

### P3 — Strudel runtime

After licensing gate, bundle/host the selected Strudel runtime and implement playback + native visuals.

### P4 — local evidence persistence

Promote evidence package from response payload into durable local storage.

