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
