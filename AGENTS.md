# MusicLearning2026 Agent Rules

## Current experimental workflow on this branch

The active experiment is:

**MusicLearning Research Workflow v4 — Antigravity Native**

Read:

- `docs/MUSIC_RESEARCH_WORKFLOW_V4.md`
- `.agents/skills/music-analysis/SKILL.md`
- `.agents/agents/music-analysis-orchestrator/agent.md`

The Web App v1/v2/v3 code remains in the repository for comparison, but this branch does **not** use the v3 `agy CLI` subprocess runtime as its primary workflow.

## Core execution model

The user starts `music-analysis-orchestrator` once in Antigravity Session Mode.

The local browser is the user-facing control surface. It writes analysis/creative requests into local run files. The main Gemini session remains alive, blocks on `tools/music-workflow/session_bus.py wait`, claims those requests, orchestrates the specialist subagents, writes artifacts, marks the request complete, and returns to the queue.

There is no per-song prompt copy/paste and no Node → `agy CLI` subprocess.

It launches three independent custom subagents concurrently:

1. `music-acoustic-analyst`
2. `music-listener`
3. `music-researcher`

They produce:

- `dsp.json`
- `listen.json`
- `research.json`

The main Agent then produces:

- `analysis.json`

The optional `music-creative` subagent is only invoked when the user explicitly wants a Studio experiment.

## Generic Skill

The canonical `music-analysis` Skill is epistemic and model-agnostic.

It defines:

- observation
- measurement
- external_evidence
- interpretation
- minimum claim basis
- uncertainty discipline

It must not become a Gemini/Antigravity/FFmpeg/KuaKuaMusic/Strudel-specific orchestration prompt.

Execution order and tool assignment belong to custom agents and host workflow files, not the generic Skill.

## Acoustic measurement policy

The Acoustic Analyst may only invoke the reviewed repository tool:

`tools/music-dsp/audio_metrics.py`

Do not invent replacement DSP methods during a run.

In particular, never infer waveform-level loudness, RMS, energy, tempo, key, or dynamics from MP3 codec metadata such as frame-header quantization values or `global_gain`.

Current P0 DSP deliberately covers only:

- duration / native audio metadata
- Integrated LUFS
- Loudness Range
- True Peak
- decoded-PCM fixed-window RMS timeline
- deterministic RMS step-change candidates

Tempo/key/chord/form estimators are intentionally not P0.

## Isolation policy

### Listener

May access the recording.

Must not access:

- web search
- Research artifact
- DSP artifact
- shell/Python

### Researcher

May access task identity and web tools.

Must not access:

- recording
- Listen artifact
- DSP artifact

### Acoustic Analyst

May access recording and fixed DSP script.

Must not access:

- web search
- ad-hoc DSP implementation

## Provenance

Final `analysis.json` interpretations reference:

- Listener observation IDs
- DSP measurement IDs
- Research finding IDs

Research findings in turn reference concrete source IDs.

Run:

`node tools/music-workflow/validate_artifact.mjs`

to enforce cross-artifact references and timestamp bounds.

## Studio

Default analysis produces only `studioPotential`.

Strudel code is generated on demand by `music-creative`.

All generated Studio code is:

`learning_reconstruction`

and must pass the existing Strudel runtime policy validator.

## MCP

No MCP server is required by this workflow.

Do not add MusicBrainz/music21/Discogs/etc. MCP dependencies unless a future benchmark shows a concrete quality benefit.

## Local artifacts

Do not commit:

- audio
- `.music-learning/runs/`
- `.music-learning/session/`
- analysis artifacts
- credentials
- tokens
- browser/session state


## Session bus

Session startup:

```bash
python3 tools/music-workflow/start_session.py
```

Browser requests are local JSON files.

The main orchestrator waits with:

```bash
python3 tools/music-workflow/session_bus.py wait --timeout 300
```

After processing a claimed request, it must call `session_bus.py complete` and immediately wait again.

The browser may queue work while the orchestrator is offline; queued work must not be discarded.
