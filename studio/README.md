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

Select a Deep Dive → open its A/B experiment → propose a change → preview code and playback settings → apply → save or undo/redo. Built-in playback supports the current draft and A/B audition at the same tempo and sound bank, stop and volume control. Native Strudel visuals render in the Studio canvas. Editing does not change the playing snapshot until Play is clicked again. Playback never applies or saves a revision automatically.


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

`studio/strudelRuntime.ts` implements the adapter with pinned core/mini/tonal/transpiler/draw 1.2.6 and webaudio 1.3.0. New seeds record `kua-synth-v1` and `core-1.2.6/webaudio-1.3.0`; historical `default`/`unbound` seeds resolve to these versions without rewriting their saved evidence or revisions. The app-authored deterministic percussion bank supplies bd/sd/hh/oh/cp locally; standard synthesizers also work. No external sample download is required. The license decision, UI copyright, locked source tarball links and complete upstream notices are shipped with the app.

`runtimePolicy.mjs` parses an allowlisted musical AST before evaluation. It accepts musical calls, constants and bounded callbacks; browser/network access, constructors, computed members, imports and arbitrary JavaScript are rejected. Runtime checks tempo, bank/version, event density, syntax and sound availability. Stop disconnects old voices/effect tails and cancels drawing. Cancellation during loading and unmount invalidate pending playback; unmount closes the AudioContext. Full JavaScript programs/external banks can still be exported to the official editor. Audio rendering/recording export is not implemented.

This licensing gate does not change the product decision: Studio is Strudel-first.


Each revision stores full playback settings as well as code. AI proposals reference a saved baseRevisionId and never apply automatically. A changed revision or changed editor draft invalidates the preview. Current implementation and limits: [architecture v1.1](../docs/TECHNICAL_ARCHITECTURE_V1.1.md).
