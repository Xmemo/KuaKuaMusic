---
name: music-analysis
description: Model-agnostic epistemic rules for rigorous analysis of a specific music recording. Use whenever listening observations, acoustic measurements, external music evidence, or music-theory interpretations must be kept distinct and uncertainty preserved.
---

# Music Analysis

This is a **model-agnostic and host-agnostic epistemic protocol**.

It does not define an execution pipeline. The host may use one model, several agents, local scripts, APIs, or other orchestration. This skill only defines what different kinds of musical claims mean and what minimum basis they require.

## Four evidence classes

Keep these distinct:

1. **observation** — something directly perceived in the supplied recording.
2. **measurement** — a numerical or categorical result produced by a method that was actually executed.
3. **external_evidence** — something a real external source states.
4. **interpretation** — an explanation that combines observations, measurements, external evidence, and general music knowledge.

Never relabel an interpretation as an observation or measurement.

## Observation rules

An observation may describe:

- structure and energy arc;
- rhythm and groove;
- melody and motif;
- harmonic or tonal character when perceptible;
- timbre and texture;
- arrangement and production;
- notable moments with approximate timestamps.

Observation does **not** justify invented precision.

Examples:

- acceptable: “a brighter high-frequency layer enters around 0:53”;
- not acceptable without measurement: “high-frequency energy rises by 6.4 dB at 0:53”;
- acceptable: “minor-leaning tonal character”;
- not acceptable without appropriate evidence: “the key is definitely F minor”.

## Measurement rules

A measurement exists only when a real analysis method was executed on the recording or on a reliable symbolic representation.

When trusted host-provided measurements are available, use them. Do not re-derive precise acoustic quantities from compressed-media internals merely because the host exposes raw file bytes.

**Never infer waveform-level loudness, energy, tempo, key, or dynamics from codec metadata such as MP3 frame headers, quantizer fields, bit allocation, or `global_gain` alone.**

A measurement record should preserve when relevant:

- value and unit;
- method;
- analysis parameters or version;
- time range;
- ambiguity or alternative candidates;
- limitations.

Distinguish two broad classes:

### Deterministic acoustic metrics

Examples include duration, sample rate, channel count, integrated loudness under a specified standard, true peak, or RMS computed from decoded PCM under fixed parameters.

These are reproducible for the same decoded signal and method, but wording should still identify the method and parameters.

### Estimators

Examples include tempo, key, chord sequence, beat grid, section boundaries, stem labels, or transcription.

Estimator output is **not ground truth**. Preserve ambiguity:

- tempo may have half-time/double-time alternatives;
- key estimates may have close competing candidates;
- chord/transcription claims require stronger evidence than broad tonal character.

Do not turn a high score/correlation into “100% certainty”.

## External evidence rules

External evidence should preserve:

- exact source URL when available;
- title/publisher;
- a short supporting excerpt or precise paraphrase;
- the claim that the source actually supports;
- scope: recording / release / work / artist / general.

Search-result snippets are discovery aids, not evidence.

Prefer primary or near-primary sources for creator, production, release, or intent claims.

If reliable material is thin, say so. Do not compensate by inventing song-specific facts.

Identity claims deserve special care. Similar titles, aliases, game-radio labels, uploader names, fan wikis, and third-party metadata do not by themselves establish that two names refer to the same recording, artist, or creator.

## Interpretation rules

Interpretation explains musical meaning or mechanism.

A useful pattern is:

> observation / measurement / external evidence → musical mechanism → plausible perceptual effect

Examples:

- “The stable pulse remains while surface-event density increases, so the section gains urgency without requiring a tempo change.”
- “The sudden reduction in short-window RMS coincides with fewer active layers, strengthening the sense of temporary weightlessness.”

General music theory may explain a mechanism without a song-specific citation, but it cannot prove that a recording contains a feature that was never observed or measured.

## Minimum-basis policy

| Claim | Minimum basis |
| --- | --- |
| “Around 1:15 the arrangement opens up” | direct audio observation |
| “RMS falls from X to Y” | executed measurement on decoded audio |
| “Integrated loudness is X LUFS” | executed standards-based loudness measurement |
| “Tempo is 108.8 BPM” | executed tempo estimator + ambiguity awareness |
| “Key estimate is F minor” | executed tonal estimator or reliable symbolic evidence |
| “The progression is Fm–D♭–A♭–E♭” | reliable transcription/symbolic evidence or sufficiently explicit analysis |
| “The producer used plugin X” | external evidence |
| “This feels more urgent because density rises over a stable pulse” | interpretation grounded in observation/measurement |
| “Industrial music often uses mechanical repetition” | general theory/style prior, never proof about this recording |

## Uncertainty rules

- Unknown is a valid result.
- Contradictory sources should remain contradictory unless stronger evidence resolves them.
- Approximate timestamps should not be dressed up as sample-accurate boundaries.
- Algorithmic estimates should keep alternatives when meaningful.
- Do not claim a score, transcription, chord sequence, production chain, or creator identity is exact unless the evidence supports that precision.

## Output quality

- Prefer recording-specific, time-localized insights over generic genre prose.
- Do not force every analysis category to be populated.
- Do not write “100% certain”, “proved”, or equivalent language for model/DSP estimators.
- Clearly distinguish what was heard, what was measured, what sources say, and what is inferred.

## Downstream tasks

The caller may request:

- a review or teaching explanation;
- multiple writing styles;
- structured JSON;
- a creative exercise;
- executable music code.

Follow caller-provided schemas and runtime constraints. Do not bake any product, model family, CLI, search provider, DSP implementation, or synthesis runtime into this core skill.
