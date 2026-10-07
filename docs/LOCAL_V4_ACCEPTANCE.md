# MusicLearning Research Workflow v4 — Local Acceptance

## Objective

Validate the **browser-driven Antigravity Session Mode**.

The main product experience should be:

> start the Orchestrator once → open KuaKuaMusic in Antigravity Browser once → all subsequent song and Studio actions happen only in the browser.

No per-song prompt copy/paste is part of this acceptance.

## 1. Branch

```bash
git fetch origin
git switch workflow/music-learning-v4-antigravity-native-2026-10-07
git pull --ff-only
npm ci
```

## 2. Tool preflight

```bash
python3 --version
ffmpeg -version
ffprobe -version
python3 tools/music-dsp/audio_metrics.py --self-test
```

Expected:

```
audio_metrics self-test: ok
```

## 3. Start Antigravity Session Mode once

Open the repository in Antigravity.

Confirm these Custom Agents exist:

- music-analysis-orchestrator
- music-acoustic-analyst
- music-listener
- music-researcher
- music-creative

Select `music-analysis-orchestrator` as the primary Agent.

Choose the Gemini/model configuration you want to benchmark. Specialist Agents use `model: inherit`.

Tell the main Agent once:

> Start KuaKuaMusic Session Mode.

It should execute:

```bash
python3 tools/music-workflow/start_session.py
```

Expected output includes:

- `status: ready`
- `browserUrl: http://127.0.0.1:3000`
- registered session state.

Then, still inside Antigravity, open the built-in browser once:

```
/browser Open http://127.0.0.1:3000
```

The main Orchestrator should now block on:

```bash
python3 tools/music-workflow/session_bus.py wait --timeout 300
```

If idle, it should call `wait` again rather than end the session.

## 4. Browser session indicator

At the top of KuaKuaMusic, verify the badge changes to:

> 后台 Gemini 在线等待

The page should not show:

- “复制 Antigravity 指令”
- a handoff textarea
- any requirement to return to the Agent chat for each song.

If the Orchestrator is stopped, the page should show:

> 后台 Gemini 未连接

Submitting a song while offline should still queue the task locally.

## 5. First benchmark — NetEase/browser path

Use:

**VARLAN — Antagonistic**

Prefer a NetEase share link if available.

In the browser only:

1. paste the NetEase link;
2. confirm correct song identity;
3. confirm the YouTube/local recording candidate;
4. submit the recording.

Expected:

- a v4 run is created;
- `browser-request.json` has `status: queued`;
- the background Orchestrator claims it automatically;
- the page moves from “已排队” to “Gemini 已接单”;
- you do not paste anything into the Agent chat.

## 6. Concurrency check

Open the Antigravity Agents panel while the analysis runs.

You should see these three specialists active concurrently:

- music-acoustic-analyst
- music-listener
- music-researcher

The Orchestrator should launch them in one multi-subagent delegation step.

## 7. DSP check

Inspect:

`<runDir>/dsp.json`

Validate:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind dsp \
  --file "<runDir>/dsp.json"
```

Required:

- actual duration;
- Integrated LUFS;
- LRA;
- True Peak;
- RMS timeline;
- normalized measurement IDs;
- change-point candidates if threshold crossed.

The Acoustic subagent must only run the reviewed `audio_metrics.py` path.

It must not create an ad-hoc MP3 parser or use `global_gain` as an energy proxy.

## 8. Listener isolation check

Inspect:

`<runDir>/listen.json`

Verify:

- recording-specific direct observations;
- no web search;
- no Python/shell;
- no access to dsp.json;
- no access to research.json.

For Antagonistic, compare whether it independently notices salient changes around the previously useful regions near roughly 0:35, 0:53, 1:10, 2:02, 2:10, and the final tail.

Exact reproduction is not required.

## 9. Research isolation check

Inspect:

`<runDir>/research.json`

Verify:

- real URLs;
- opened/read sources rather than search snippets;
- conservative identity claims;
- no access to the audio;
- no Listen/DSP contamination.

## 10. Final browser result

The browser should automatically pick up `analysis.json` without refresh.

It should show:

- 走心 / 上头 / 懂行;
- dynamic analysis modules;
- evidence counts;
- Listen observations;
- deterministic DSP values;
- external sources;
- unknowns.

Validate provenance:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind analysis \
  --file "<runDir>/analysis.json" \
  --run-dir "<runDir>"
```

This must pass.

The analysis request should then be marked:

`status: completed`

and the main Orchestrator should immediately return to Session Bus waiting state.

The browser badge should return to:

> 后台 Gemini 在线等待

## 11. Studio from the browser only

Click:

> 在 Studio 里试试这个机制

Expected:

1. browser writes `browser-creative-request.json` with `status: queued`;
2. the same background Orchestrator claims it automatically;
3. only `music-creative` runs;
4. Listen / DSP / Research do not rerun;
5. `studio.json` appears;
6. the browser automatically displays Strudel A/B.

Validate:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind studio \
  --file "<runDir>/studio.json" \
  --run-dir "<runDir>"
```

The Studio artifact must remain `learning_reconstruction`.

## 12. Offline queue recovery

Stop Session Mode:

```bash
python3 tools/music-workflow/session_bus.py stop
```

Verify the page displays the offline badge.

Submit another song from the browser.

Expected:

- task is still queued locally;
- no work is lost.

Restart Session Mode from the Orchestrator.

Expected:

- queued request is automatically claimed;
- no per-song prompt is needed.

## 13. Optional-branch failure recovery

On a separate run, prevent Research from succeeding.

Expected:

- Listen remains;
- DSP remains;
- final analysis may be `partial`;
- successful branches are not rerun;
- the browser still receives a usable analysis.

Listener failure must still fail the main analysis request.

## 14. Second benchmark

Run:

**Battlefield 4 — Warsaw Theme**

Use the same browser session without restarting the Orchestrator.

The purpose is to prove the Session Mode can process multiple songs sequentially while preserving Listen/Research isolation and the useful ~1:15 structural observation.

## 15. Acceptance targets

The workflow passes when it demonstrates:

- one-time Antigravity session startup;
- one-time browser opening;
- no per-song prompt handoff;
- persistent local request queue;
- concurrent specialist execution;
- correct decoded-audio acoustic metrics;
- no codec-metadata pseudo-measurement;
- independent direct listening;
- independent external research;
- resumable stage artifacts;
- final provenance validation;
- browser-driven on-demand Studio;
- multiple songs processed in one Session Mode.

Record actual wall-clock and token usage rather than assuming a fixed SLA.
