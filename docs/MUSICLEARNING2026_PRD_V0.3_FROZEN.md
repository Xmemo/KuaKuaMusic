# MusicLearning2026 PRD v0.3 — FROZEN

> Status: **Frozen baseline**
>
> Frozen on: 2026-09-28
>
> This document is the canonical product definition for the next implementation cycle. Changes to the core flow require an explicit PRD version bump.

## 1. Product definition

MusicLearning2026 is a local-first music learning tool that turns curiosity about a song into an evidence-backed explanation and then into a playable experiment.

The user-facing flow is intentionally simple:

> **Input song → Evidence-backed structured analysis → Deep dive on one analysis item → Strudel Studio experiment**

Research, source retrieval, version resolution, claim verification, and tool calls are internal Agent work. They are not separate product stages.

The product must never fill a music-analysis template just because a field exists. If a song-specific claim cannot be supported, leave it unknown.

## 2. Core product principles

### 2.1 Evidence before song-specific claims

Any non-trivial claim about the specific recording must be supported by evidence that actually applies to that song/version.

Allowed epistemic categories:

1. **External evidence** — facts, interviews, credits, published analysis, score/transcription, release data.
2. **User perception** — what the user says they hear or feel.
3. **Machine observation** — a future audio-analysis engine's estimate. V1 does not assume audio access.
4. **AI interpretation** — an explanation that connects evidence, perception, and general music theory.
5. **General theory** — music concepts used for teaching; never proof that the song uses the mechanism.
6. **Unknown** — insufficient evidence.

These categories must not be collapsed into one generic "evidence" label.

### 2.2 User flow follows cognition, not model calls

The user should experience:

> **Hear → Understand → Explore → Experiment**

The implementation may perform many Agent/tool calls internally, but the interface must not expose pseudo-stages such as "GPT draft" and "Codex verification".

### 2.3 One AI Agent

The product has one AI analysis Agent. It may call:

- MusicBrainz MCP;
- web search / web reading;
- primary interviews and official credits;
- published music analysis;
- local evidence packages;
- future audio-analysis adapters;
- Studio code-generation helpers.

Model/provider names are implementation details, not product navigation.

## 3. Stage 1 — Song input and identity

Accepted input:

- song link;
- song title;
- song title + artist.

Optional user focus:

> **哪一个细节让我想再多听一次？**

or a direct question such as:

> 为什么副歌进来之后突然感觉特别开阔？

The user focus is stored as **user perception / user question**. It must guide research, but must not be silently converted into a factual statement about the recording.

### Identity resolution

The system should resolve, when available:

- title;
- artist;
- album;
- release date/year;
- recording vs work;
- studio/live/remix/remaster/version;
- MusicBrainz recording/work/release IDs;
- source platform metadata.

If multiple plausible recordings exist, show candidates or mark the scope as unresolved. Never silently mix evidence across versions.

The existing catalog search may still be used to present candidates. MusicBrainz is the canonical identity/provenance layer for the evidence workflow.

## 4. Stage 2 — Evidence-backed structured analysis

The first formal analysis the user sees must already have passed the internal evidence workflow.

Internal workflow:

> identify recording → propose research questions → retrieve sources → build claim/evidence map → remove unsupported song-specific claims → render analysis

### 4.1 Overall impression

The "夸夸音乐" three-style presentation remains, but **only for the overall impression of the whole song**:

- **走心** — emotion, atmosphere, listening experience;
- **上头** — direct, vivid, catchy overall take;
- **懂行** — concise music/production vocabulary.

All three are expressions of the **same verified evidence set**. Style may change wording, never facts.

### 4.2 Structured modules

The analysis may contain any subset of:

- history & culture;
- harmony;
- rhythm/groove;
- timbre;
- arrangement;
- structure;
- production.

The modules use one consistent evidence-oriented writing style. They do **not** have 走心 / 上头 / 懂行 variants.

A module should appear only when the system has something meaningful and supportable to say.

For example, the UI must not invent or auto-fill:

- key;
- BPM;
- chord progression;
- instrument list;
- production technique;

merely because another music-analysis product displays those fields.

### 4.3 Analysis item contract

Each user-visible analysis item should have:

- id;
- category;
- title;
- summary;
- claim list;
- source mappings;
- version scope;
- unknowns;
- expandability;
- Studio potential: none / rhythm / harmony / both.

Every claim has an epistemic status and source mapping.

## 5. Stage 3 — Deep dive

The user selects one analysis item and asks to understand it more deeply.

Stage 3 is not "rewrite the same paragraph longer". It should add information depth:

1. what can currently be confirmed;
2. which sources support which claims;
3. what belongs to AI interpretation;
4. relevant general music theory;
5. where the evidence conflicts or version scope differs;
6. what remains unknown;
7. what to listen for next;
8. whether the concept can be turned into a playable Studio experiment.

Recommended reading order:

> **你的听感 → 已确认发生了什么 → 证据 → 音乐机制 → 为什么可能产生这种听感 → 怎么听 → 怎么自己试**

If no song-specific evidence exists, say so explicitly. General music theory may still be taught, but it must remain labeled as general theory.

## 6. Stage 4 — Strudel Studio

The previous MIDI/piano-roll-first Studio concept is retired.

The Studio is now **Strudel-first**:

> **analysis idea → executable music code → live sound + visual feedback → edit → compare**

MIDI may remain a future export/interoperability format, but it is not the primary Studio UI.

### 6.1 Why code is the primary representation

A small Strudel pattern exposes the causal variables directly:

- rhythm density;
- kick/snare/hat placement;
- chord notes;
- voicing;
- register;
- repetition;
- transformation;
- filter/effect values.

This is better suited to "change one thing and hear why it matters" than a decorative piano roll.

### 6.2 Studio entry condition

Studio is entered from a **specific deep-dive item**, not as a generic sequencer.

Every Studio session records its origin:

- selected analysis item;
- user question;
- evidence snapshot;
- source type.

### 6.3 Studio source labels

Every Studio seed is one of:

1. **source_transcription**
   - based on a matching source such as a score/chord chart/transcription;
   - source must be visible.

2. **learning_reconstruction**
   - simplified code created to demonstrate a mechanism;
   - never presented as an accurate transcription of the original.

3. **user_version**
   - user-edited derivative of the current Studio pattern.

### 6.4 Studio v1 capabilities

Primary controls:

- code editor;
- Play;
- Stop;
- tempo/cycle control;
- Apply AI suggestion;
- diff before apply;
- Undo / Redo;
- reset to source seed;
- save code locally.

Primary experiments:

- drums / groove;
- harmony / voicing / register;
- sparse vs dense arrangement sketches where appropriate.

AI actions must operate on the current pattern, not on an imagined state.

Recommended Agent tool contract:

> get_pattern → propose_change → preview_diff → set_pattern → play/stop → undo/redo

### 6.5 Visual feedback

Strudel-native visual feedback should replace custom MIDI-window visualization where possible.

Default mapping:

- harmony / notes → inline pianoroll or punchcard;
- rhythmic cycles → punchcard / pianoroll, optionally spiral;
- timbre / envelope demonstrations → scope;
- spectral/filter demonstrations → spectrum;
- pitch-class explanations → pitchwheel when useful.

Visuals serve explanation; they are not independent dashboards.

## 7. Evidence rules

### Valid source roles

Preferred order depends on claim type, but generally:

- official credits / liner notes / label or artist materials;
- creator / producer / engineer interviews;
- MusicBrainz for identity and relationships;
- reputable specialist publications;
- published music-analysis resources;
- score/chord/transcription sources when applicable.

Search snippets are discovery aids, not evidence.

A source URL alone is insufficient. The evidence package should store what the source supports.

### Claim rule

The system must be able to answer:

> **Why is this sentence allowed to appear?**

If no clear answer exists, rewrite, downgrade to interpretation/general theory, or remove it.

## 8. Local evidence package

V1 stores structured files locally rather than introducing a large vector database.

Conceptual layout:

```
.music-learning/
  evidence/
    <song-id>/
      metadata.json
      sources.json
      analysis.json
      deep-dives/
      studio/
```

The evidence package includes:

- recording identity/version;
- source metadata;
- claim → source mapping;
- user perception;
- structured analysis;
- deep dives;
- Studio seeds;
- Studio revisions.

## 9. Internal architecture assumptions

V1 is a local webpage plus a local AI Agent bridge.

The preferred execution path is:

> React/Vite UI → local Express bridge → Codex CLI Agent → MusicBrainz MCP + web research → schema-validated JSON → local evidence package → UI

The local Agent may use project-level Codex configuration and AGENTS.md instructions.

The legacy Agnes API may remain temporarily for compatibility during migration, but it is not the canonical MusicLearning2026 architecture.

## 10. Strudel licensing gate

Strudel's current code is AGPL-licensed.

Therefore the repository must **not silently bundle @strudel packages** until the project license/distribution decision is made explicitly.

The architecture should isolate Strudel behind a Studio adapter contract so:

- product/data contracts can be built now;
- the UI and Agent workflow are Strudel-first;
- runtime bundling can be enabled after the licensing decision;
- an alternative compatible implementation remains possible without rewriting the evidence pipeline.

This is a legal/distribution gate, not a product-direction uncertainty.

## 11. V1 acceptance cases

Test at least four song conditions:

1. rich public analysis;
2. ambiguous recording/version;
3. release/credit data exists but technical analysis is scarce;
4. user perception is specific but no source directly explains it.

Acceptance requirements:

- the first formal analysis is already evidence-constrained;
- unsupported song-specific claims do not appear as facts;
- user perception affects research direction;
- 走心 / 上头 / 懂行 exist only at whole-song overview level;
- structured modules use one evidence-oriented style;
- each analysis item can enter a targeted deep dive;
- deep dive adds evidence and explanation rather than verbosity;
- Studio is entered from a selected deep-dive item;
- Studio seed is labeled source_transcription or learning_reconstruction;
- Studio's primary representation is Strudel code, not a MIDI piano-roll window;
- AI changes are previewed and reversible.

## 12. Product quality model

Three quality axes define V1:

### Evidence Integrity

Can every song-specific claim be traced to evidence, or clearly marked as interpretation/unknown?

### Exploration Depth

Does selecting an item materially increase understanding?

### Explanation → Experiment Continuity

Can the relevant musical mechanism become something the user can hear, edit, and compare?

Canonical product model:

> **LISTEN → UNDERSTAND → EXPLORE → EXPERIMENT**

Canonical Agent model:

> **QUESTION → RETRIEVE → VERIFY → EXPLAIN → STRUCTURE**

These two flows must remain separate.
