# Strudel-first Studio

The MusicLearning2026 Studio is an **executable explanation surface**, not a generic DAW.

## Product contract

A Studio session always starts from one Deep Dive item.

The canonical artifact is:

- Strudel code;
- source label;
- linked evidence IDs;
- visual hints;
- revision history.

The previous bespoke MIDI-window concept is retired. MIDI may later be an export/interoperability feature.

## Interaction model

Select a Deep Dive → open its A/B experiment → propose a change → preview code and playback settings → apply → save or undo/redo. The project has adopted AGPL-3.0-or-later; built-in play and native visual feedback still require runtime adapter implementation. Export the current revision to audition in the official Strudel editor.


The Agent should read the current pattern before proposing changes.

## Native visual mapping

Use Strudel-native visuals rather than recreating a second visualization system:

- `_pianoroll()` — harmony, notes, voicing, register;
- `_punchcard()` — rhythmic placement and transformed events;
- `_spiral()` — cyclic rhythm;
- `_scope()` — waveform/envelope;
- `_spectrum()` — spectral/filter changes;
- `_pitchwheel()` — pitch-class relationships.

## Source labels

### source_transcription

Only when a matching score/chord/transcription source supports the pattern.

### learning_reconstruction

Default for AI-created examples that isolate a mechanism.

### user_version

Applied to revisions created by user/AI edits.

The source label belongs to each revision rather than the whole session. Undo/reset therefore restores the source label of the active revision instead of leaving the session permanently marked as `user_version`.

## Runtime adapter

`studio/strudelStudio.ts` defines the adapter contract and app-owned revision model.

The actual `@strudel/*` runtime is not yet bundled. The repository/distribution license is now recorded in [the license decision](../docs/STRUDEL_LICENSE_DECISION.md); a later runtime implementation must preserve the selected upstream packages' notices and link corresponding source.

This licensing gate does not change the product decision: Studio is Strudel-first.


Each revision stores full playback settings as well as code. AI proposals reference a saved baseRevisionId and never apply automatically. A changed revision or changed editor draft invalidates the preview. Current implementation and limits: [architecture v1.1](../docs/TECHNICAL_ARCHITECTURE_V1.1.md).
