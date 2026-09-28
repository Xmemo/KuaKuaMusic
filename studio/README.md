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

```
Deep Dive
  ↓
Studio seed
  ↓
validate
  ↓
play
  ↓
user / AI proposes change
  ↓
preview diff
  ↓
apply
  ↓
play + compare
  ↓
undo / redo
```

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

Applied after the user edits the seed.

## Runtime adapter

`studio/strudelStudio.ts` defines the adapter contract and app-owned revision model.

The actual `@strudel/*` runtime is intentionally not bundled in this architecture PR because current Strudel packages are AGPL-licensed. Resolve the repository/distribution license first, then implement the adapter against the chosen Strudel packages.

This licensing gate does not change the product decision: Studio is Strudel-first.
