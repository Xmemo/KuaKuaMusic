# MusicLearning2026 Agent Rules

## Product objective

Help the user understand a specific recording with verifiable evidence, then turn a selected musical mechanism into a small executable learning experiment.

## Mandatory evidence rules

1. Treat song/recording identity as a first-class problem.
2. Use the configured MusicBrainz MCP when identity, recording, work, release, credits, or version scope matters.
3. Use web research for song-specific claims that MusicBrainz does not support.
4. Search snippets are discovery aids, not evidence. Read the source when possible.
5. Prefer primary or near-primary sources for creator/production claims.
6. Never write a song-specific musical claim merely because it is plausible for the artist/genre.
7. Never auto-fill key, BPM, chord progression, instrumentation, structure, or production technique without support.
8. When evidence is insufficient, return an explicit unknown.
9. Keep these epistemic categories separate:
   - external_evidence
   - user_perception
   - machine_observation
   - ai_interpretation
   - general_theory
   - unknown
10. V1 has no authorized audio input. Do not claim to have listened to or measured the recording.

## Analysis output

- Always assess culture, harmony, rhythm and timbre separately; identity metadata does not count as music-analysis coverage.
- Show all four core dimensions and label each as analyzed, generic listening guidance, or insufficient evidence. Generic guidance never counts as analysis of the selected song.
- Overall 走心 / 上头 / 懂行 variants must be meaningfully distinct, share the final evidence set, and be audited independently.
- Structured modules start with a plain-language feature, then explain the supported mechanism and possible listener effect, offer concrete listening cues, and place citations/limits behind a collapsed details panel.
- Omit unsupported/empty modules rather than filling a template.
- Every supported song-specific claim must map to registered excerpt evidenceIds, with matching topic and version scope.
- State whether a claim applies to the selected recording, the composition/work, a source's stated version, or general theory.
- Every AI interpretation names prerequisite claim IDs; if a prerequisite is removed, remove dependent interpretations.
- Audit identity fields and copy independently. Never discard valid work-level or source-version information solely because a release year or recording identity is uncertain.
- Keep source facts distinct from the Agent's interpretation.
- The first research round is capped at 3 searches / 5 pages. If any core dimension lacks song-specific evidence, allow exactly one targeted supplement round with the same limits and no more than 10 unique sources across both rounds.

## Deep dive

A deep dive must add evidence or explanatory depth. Do not merely expand wording.

Return:

- confirmed claims;
- source-specific support;
- AI interpretation;
- relevant general theory;
- conflicts;
- unknowns;
- listening cues;
- Studio eligibility.

## Studio

Studio is Strudel-first.

Generate a Studio seed only when the selected deep dive has a useful rhythm or harmony experiment.

Every seed must be labeled:

- source_transcription
- learning_reconstruction
- user_version

Default to learning_reconstruction unless a matching transcription/score/chord source supports the actual content.

Prefer small, legible code that isolates the variable being taught. Add native visual hints when useful:

- pianoroll / punchcard for notes and rhythmic placement;
- spiral for cyclic rhythm;
- scope for waveform/envelope;
- spectrum for spectral/filter explanation;
- pitchwheel for pitch-class explanation.

Never claim a learning reconstruction is the original song.

## Repository changes

The AGPL licensing decision is recorded in docs/STRUDEL_LICENSE_DECISION.md. The pinned Strudel runtime is bundled behind an adapter boundary. Preserve upstream notices and corresponding source access. Generate musical expressions using the built-in synthesizers; do not generate browser/network operations or external sample-bank dependencies.


Implementation contracts are defined in music-learning/contracts.mjs; regenerate schemas with npm run schemas:generate. Consult docs/TECHNICAL_ARCHITECTURE_V1.2.md for current analysis rules and docs/TECHNICAL_ARCHITECTURE_V1.1.md for API and persistence boundaries. Preserve independent analysis snapshots and every deep-dive turn. Never trust a client-supplied analysis or provenance label.
