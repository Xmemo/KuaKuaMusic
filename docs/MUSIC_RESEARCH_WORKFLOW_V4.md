# MusicLearning Research Workflow v4 — Antigravity Native

> Status: experimental product workflow. KuaKuaMusic Browser is now the control surface; Antigravity Main Gemini runs as a persistent session worker behind it.

## 1. Why this exists

The v3 single-Agent experiment proved two things at the same time:

1. strong multimodal models can produce excellent song-specific listening analysis;
2. letting one long-running Agent freely invent DSP, browse, code, reason, and synthesize in one context is slow, fragile, and methodologically unsafe.

Observed failure modes included:

- 13–16 minute end-to-end runs;
- millions of cache-read tokens;
- 502 failure late in a long session;
- ad-hoc MP3 `global_gain` logic being misused as an acoustic-energy measurement;
- no stage checkpoint recovery.

v4 keeps Gemini/Antigravity as the research environment but changes the work decomposition.

## 2. Core architecture

```
             Antigravity Browser
          KuaKuaMusic localhost UI
                     │
         analysis / creative request
                     │
                     ▼
           local filesystem queue
                     │
                     ▼
                         Main Gemini
                    Music Analysis Orchestrator
                              │
                 invoke_subagent × 3
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  Acoustic Analyst       Music Listener       Music Researcher
  fixed local DSP        native audio         web evidence
          │                   │                   │
          ▼                   ▼                   ▼
      dsp.json            listen.json         research.json
          └───────────────────┼───────────────────┘
                              ▼
                         Main Gemini
                           synthesis
                              │
                              ▼
                        analysis.json
                              │
                    user selects insight
                              │
                              ▼
                       Music Creative
                              │
                              ▼
                         studio.json
```

The first three specialist branches are launched concurrently.

The Main Gemini is a persistent session worker: after one request finishes, it returns to the local queue and waits for the next browser action.

## 3. Why subagents

The three specialists have independent contexts and different tool access.

This is an epistemic boundary, not just a performance trick.

### Acoustic Analyst

Knows the recording and the reviewed DSP program.

Does not browse the web.

Does not invent DSP.

### Listener

Knows the recording.

Does not run shell/Python.

Does not browse the web.

Does not see DSP or Research output.

### Researcher

Knows catalog/task identity.

Can search/read the web.

Does not see the recording.

Does not see Listen or DSP output.

This prevents external commentary from contaminating the first-pass listening analysis and prevents listening hypotheses from biasing the search plan.

## 4. Generic Skill vs host orchestration

The canonical generic Skill remains:

`.agents/skills/music-analysis/SKILL.md`

It defines only:

- observation;
- measurement;
- external evidence;
- interpretation;
- minimum basis for claims;
- uncertainty rules.

It does **not** define:

- Antigravity;
- Gemini;
- subagent topology;
- FFmpeg;
- DSP scripts;
- KuaKuaMusic UI;
- Strudel.

The Antigravity-specific work decomposition lives in:

`.agents/agents/`

This keeps the epistemic method portable to future multimodal models or hosts.

## 5. Custom agents

### Main

`.agents/agents/music-analysis-orchestrator/agent.md`

Responsibilities:

- create run;
- launch three specialist subagents concurrently;
- validate artifacts;
- synthesize final analysis;
- invoke Creative only on demand.

### Acoustic

`.agents/agents/music-acoustic-analyst/agent.md`

Allowed execution:

`python3 tools/music-dsp/audio_metrics.py`

No ad-hoc replacement algorithm.

### Listener

`.agents/agents/music-listener/agent.md`

Direct multimodal listening only.

### Researcher

`.agents/agents/music-researcher/agent.md`

Web evidence only.

### Creative

`.agents/agents/music-creative/agent.md`

On-demand teaching reconstruction only.

## 6. Run workspace

A run is created with:

```bash
python3 tools/music-workflow/create_run.py \
  --audio "/path/to/Artist - Track.mp3"
```

Example workspace:

```
.music-learning/runs/
└── artist--track--20261007T120000Z--1a2b3c4d/
    ├── input.mp3
    ├── task.json
    ├── dsp.json
    ├── listen.json
    ├── research.json
    ├── analysis.json
    └── studio.json
```

`studio.json` is optional.

All run artifacts are ignored by Git.

## 7. Deterministic DSP P0

Reviewed implementation:

`tools/music-dsp/audio_metrics.py`

Dependencies:

- Python 3 standard library
- `ffmpeg`
- `ffprobe`

No librosa/numpy/scipy requirement.

### Current metrics

1. duration / native stream metadata — ffprobe;
2. Integrated LUFS — FFmpeg ebur128;
3. Loudness Range — FFmpeg ebur128;
4. True Peak — FFmpeg ebur128;
5. 0.5 s decoded-PCM mono RMS dBFS timeline;
6. deterministic RMS step-change candidates.

### Important semantic boundary

The following are **not** P0 deterministic metrics:

- tempo;
- key;
- chord progression;
- beat grid;
- form;
- source separation;
- transcription.

These are estimators and should only be added later with a selected algorithm, benchmark, version, parameters, and ambiguity model.

## 8. Why decoded PCM

The RMS timeline is computed after FFmpeg decodes the actual recording to mono `f32le` PCM.

It does not inspect MP3 codec metadata as a proxy for waveform energy.

This explicitly prevents recurrence of the earlier `global_gain` methodological error.

## 9. DSP provenance

`dsp.json` contains both raw useful views and normalized measurement IDs.

Example:

```json
{
  "id": "rms-change-003",
  "kind": "rms_step_change",
  "class": "derived_deterministic",
  "value": -5.1,
  "unit": "dB",
  "methodId": "method-change-001"
}
```

Final interpretations cite measurement IDs, not vague phrases like “DSP confirms this”.

## 10. Artifact contracts

Schemas:

```
schemas/workflow-v4/
├── dsp.schema.json
├── listen.schema.json
├── research.schema.json
├── analysis.schema.json
└── studio.schema.json
```

### listen.json

Direct perception only.

### dsp.json

Executed acoustic measurements only.

### research.json

External evidence and source-backed findings only.

### analysis.json

Synthesis only.

Each interpretation cites zero or more:

- observation IDs;
- measurement IDs;
- evidence IDs.

In v4, `evidenceIds` in `analysis.json` refer to **Research finding IDs**. Each finding then cites one or more concrete source IDs.

### studio.json

Optional on-demand learning reconstruction.

## 11. Validation

Independent artifact:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind listen \
  --file "<run>/listen.json"
```

Final analysis:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind analysis \
  --file "<run>/analysis.json" \
  --run-dir "<run>"
```

The final validator checks cross-artifact provenance.

Studio validation also invokes the existing Strudel runtime policy.

## 12. Failure model

The branches are independent.

### Listen fails

Stop main synthesis.

DSP + web research do not substitute for hearing the recording.

### DSP fails

Continue Listen + Research.

Do not make unsupported precise acoustic claims.

### Research fails

Continue Listen + DSP.

Preserve missing external context in `unknowns`.

### Synthesis fails

Retry synthesis only.

Do not rerun successful specialist branches.

## 13. Default analysis does not generate Strudel

The main analysis returns only:

`studioPotential`

The user must explicitly request an experiment.

Only then is `music-creative` invoked.

This keeps code generation out of the default critical path.

## 14. Expected interaction

Inside Antigravity, once per working session:

1. select `music-analysis-orchestrator`;
2. choose the desired parent model/reasoning configuration;
3. say: `Start KuaKuaMusic Session Mode.`;
4. the Agent runs `python3 tools/music-workflow/start_session.py`;
5. open the local product once with:

```
/browser Open http://127.0.0.1:3000
```

After that, normal use happens entirely in the browser:

- paste NetEase/QQ links;
- confirm the recording;
- wait for the parallel analysis;
- inspect results;
- request Studio experiments.

The browser writes queued request files. The Orchestrator blocks on `session_bus.py wait`, processes one request, marks it complete, and waits again.

No per-song prompt handoff is part of the product flow.

## 15. Benchmark before freezing the product path

Do not wrap this workflow back into the Web App until it succeeds on at least:

- VARLAN — Antagonistic
- Battlefield 4 — Warsaw Theme

Evaluate:

- wall-clock time;
- token/tool behavior;
- listening specificity;
- measurement correctness;
- Research quality;
- cross-artifact provenance;
- consistency across repeated runs;
- value of Studio experiment when requested.

The browser shell is already integrated. The benchmark now decides whether this Session Mode is stable enough to freeze as the product runtime pattern.
