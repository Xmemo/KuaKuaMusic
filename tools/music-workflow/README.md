# MusicLearning Workflow v4 Tools

## Create a run

```bash
python3 tools/music-workflow/create_run.py \
  --audio "/path/to/Artist - Track.mp3"
```

The script copies the input into an ignored local run directory and writes `task.json`.

## Validate artifacts

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind listen \
  --file "<run>/listen.json"
```

Kinds:

- dsp
- listen
- research
- analysis
- studio

For final cross-artifact validation:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind analysis \
  --file "<run>/analysis.json" \
  --run-dir "<run>"
```

For Studio, `--run-dir` also verifies interpretation provenance and applies the repository's Strudel runtime policy.


## Antigravity Session Mode

Start the local v4 product/server and register the main Agent session:

```bash
python3 tools/music-workflow/start_session.py
```

Equivalent npm shortcut:

```bash
npm run workflow:v4:session-start
```

The main `music-analysis-orchestrator` then waits for browser work:

```bash
python3 tools/music-workflow/session_bus.py wait --timeout 300
```

Browser requests are stored inside each run as:

- `browser-request.json`
- `browser-creative-request.json`

The Session Bus claims one queued request atomically, marks the global session `processing`, and returns the request metadata to the Orchestrator.

After successful processing:

```bash
python3 tools/music-workflow/session_bus.py complete \
  --request-file "<request-file>" \
  --status completed
```

Then immediately call `wait` again.

Stop only when the user explicitly ends Session Mode:

```bash
python3 tools/music-workflow/session_bus.py stop
```

No `agy CLI` subprocess is used by this bridge.
