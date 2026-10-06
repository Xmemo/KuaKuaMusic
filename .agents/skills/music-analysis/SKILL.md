---
name: music-analysis
description: Investigates a specific music recording by listening before research, measuring exact claims only when useful, separating evidence from interpretation, and preserving uncertainty. Use for rigorous song, track, production, arrangement, or listening analysis.
---

# Music Analysis

This is a **model-agnostic and host-agnostic** music-analysis protocol.

Do not assume a particular model family, API, CLI, plugin, MCP server, search provider, Python package, or audio-analysis library is available. Use the capabilities exposed by the current host. If a capability is unavailable, degrade explicitly rather than pretending it was used.

The objective is to understand one specific recording rigorously and explain what is musically interesting about it.

## Epistemic categories

Keep these categories distinct:

1. **observation** — something directly perceived in the supplied recording.
2. **measurement** — a numerical or categorical result produced by an analysis method that was actually executed.
3. **external_evidence** — something a real external source states.
4. **interpretation** — an explanation that combines observations, measurements, external evidence, and general music knowledge.

Never relabel an interpretation as an observation or measurement.

## Investigation protocol

### Phase A — Listen first

Before external research, inspect/listen to the complete supplied recording as far as the host permits.

Build an independent listening checkpoint covering only what can be heard:

- overall character;
- structure and energy arc;
- notable moments with approximate timestamps;
- rhythm and groove;
- harmony or tonal character when perceptible;
- melody and motif;
- timbre and texture;
- arrangement and production;
- uncertainties.

If the host provides a writable workspace, persist this checkpoint as:

`phase-a-observation.json`

before starting external research.

During Phase A:

- do not use web search or external editorial material;
- do not import remembered reviews, credits, release history, or cultural facts;
- do not invent exact BPM, key, chords, notes, instruments, plugins, or production techniques because they sound plausible;
- approximate listening language is allowed, such as “around 110 BPM”, “minor-leaning”, or “a bright high-frequency layer”.

### Phase B — Measure only when useful

Use available local computation selectively. This may include shell tools, Python, DSP libraries, audio utilities, symbolic-music tools, or equivalent capabilities exposed by the host.

Do **not** run a fixed battery of analyses merely to appear scientific.

Measurement is useful when an exact or quantitative claim materially improves the answer, for example:

- tempo;
- key or tonal-center estimate;
- RMS/loudness change;
- spectral-band change;
- onset/event density;
- section-boundary candidate;
- duration or silence;
- another concrete acoustic question raised by listening.

Rules:

- If you publish a precise number, actually compute or retrieve it from a method that was executed.
- Record the method and meaningful uncertainty or ambiguity.
- A measurement is an estimator, not ground truth.
- Tempo analysis should consider half-time/double-time ambiguity when relevant.
- Key detection should preserve competing candidates when close.
- Do not convert a high correlation or model score into “100% certainty”.
- Prefer musically conventional spellings when interpreting enharmonic results.
- If computation is unavailable or denied, keep the claim approximate or mark it unknown.

When a writable workspace exists, temporary scripts may go under `work/` and measurement outputs under `measurements/`.

### Phase C — Research after the listening checkpoint

Only after the independent listening checkpoint is complete may you use external search or browsing capabilities.

Research selectively for:

- official credits and release context;
- artist/composer/producer interviews;
- album or soundtrack notes;
- credible music criticism;
- production breakdowns;
- relevant score/transcription material;
- historical or cultural context.

Rules:

- Search-result snippets are discovery aids, not evidence.
- Open/read the source before using it when possible.
- Prefer primary or near-primary sources for creator/production claims.
- Preserve the exact source URL when the host can expose it.
- Keep a short excerpt or precise paraphrase that supports the stated claim.
- If reliable material is thin, say so.
- Do not compensate for thin research by inventing song-specific facts.
- No MCP server or plugin is required by this skill. Never make the analysis depend on a specific extension.

### Phase D — Synthesize

Combine the independent listening checkpoint, useful measurements, external evidence, and general music principles.

A strong interpretation often follows:

> observation/measurement → musical mechanism → plausible perceptual effect

General music theory may explain a mechanism without a song-specific citation, but it cannot prove that the recording contains a feature you did not observe or measure.

Keep conflicts and uncertainty visible.

## Claim policy

Before finalizing, apply these minimum bases:

| Claim | Minimum basis |
| --- | --- |
| “Around 1:15 the arrangement opens up” | direct audio observation |
| “RMS falls from X to Y” | executed measurement |
| “Tempo is 108.8 BPM” | executed measurement plus ambiguity awareness |
| “Key estimate is F minor” | executed tonal measurement, not listening alone |
| “The progression is Fm–D♭–A♭–E♭” | reliable transcription/symbolic evidence or sufficiently explicit measurement |
| “The producer used plugin X” | external evidence |
| “This feels more urgent because density rises over a stable pulse” | interpretation grounded in observation/measurement |
| “Industrial music often uses mechanical repetition” | general theory/style prior, never proof about this recording |

## Output quality

- Prefer song-specific, time-localized insights over generic genre prose.
- Do not force every category to be populated.
- Do not write “100% certain”, “proved”, or equivalent language for model/DSP estimators.
- Distinguish what was heard, what was measured, what sources say, and what is inferred.
- Exact timestamps must fit within the supplied audio duration.
- If a global observation has no meaningful moment, leave its time range unspecified/null.
- Unknown is a valid result.
- Do not claim a score, transcription, chord sequence, or production chain is exact unless the evidence supports that precision.

## Downstream tasks

The caller may request additional product-specific outputs such as:

- a review or teaching explanation;
- multiple writing styles;
- a structured JSON artifact;
- a creative exercise;
- executable music code.

Follow the caller-provided schema and runtime constraints for those outputs. Do not bake any particular downstream product, framework, or synthesis runtime into the core analysis method.

## Workspace discipline

If the host provides an isolated analysis workspace:

- read only the supplied input assets and task metadata;
- write only inside that workspace;
- do not modify application source code;
- do not inspect secret files or environment configuration;
- preserve `phase-a-observation.json` as the pre-research checkpoint when file output is available.

The host application may independently validate timestamps, references, measurements, source URLs, and executable output.
