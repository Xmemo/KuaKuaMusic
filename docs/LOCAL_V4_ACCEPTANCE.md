# MusicLearning Research Workflow v4 — Local Acceptance

## Objective

Validate the workflow **inside Antigravity**, not through the KuaKuaMusic Web App.

The critical questions are:

1. do the three specialists actually run concurrently;
2. does the Listener directly understand the local recording;
3. does the Acoustic Analyst only use the reviewed DSP script;
4. does Research remain independent from Listen;
5. does the final synthesis preserve provenance;
6. does a failed optional branch avoid destroying successful work.

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
```

Then:

```bash
python3 tools/music-dsp/audio_metrics.py --self-test
```

Expected:

```
audio_metrics self-test: ok
```

## 3. Open the repository in Antigravity

Confirm that Custom Agents include:

- music-analysis-orchestrator
- music-acoustic-analyst
- music-listener
- music-researcher
- music-creative

Confirm that the `music-analysis` Skill is visible.

Select `music-analysis-orchestrator` as the primary Agent.

Use the Gemini/model configuration you want to benchmark in the Antigravity UI. The specialist Agents use `model: inherit`.

## 3A. 首选：浏览器 / 网易云入口

在 `.env.local` 中：

```bash
MUSIC_V4_BRIDGE_ENABLED=1
VITE_MUSIC_V4_ENABLED=1

MUSIC_V3_ENABLED=0
VITE_MUSIC_V3_ENABLED=0
MUSIC_V2_ENABLED=0
VITE_MUSIC_V2_ENABLED=0
```

启动：

```bash
npm run dev
```

打开：

```
http://127.0.0.1:3000
```

首选验收流程：

1. 粘贴网易云分享链接；
2. 确认页面识别出正确歌名/艺人；
3. 选择或确认 YouTube 录音版本；
4. 页面显示 `Antigravity Handoff` 和 run ID；
5. 点击“复制 Antigravity 分析指令”；
6. 切到已经选择 `music-analysis-orchestrator` 的 Antigravity 会话并粘贴执行；
7. 回到浏览器，不刷新页面；
8. 确认 DSP / Listen / Research / Analysis 状态自动更新；
9. `analysis.json` 完成后，页面自动出现分析模块；
10. 点击推荐分析点的“在 Studio 里试试这个机制”；
11. 粘贴新的 Creative 指令到 Antigravity；
12. `studio.json` 完成后，浏览器自动出现 Strudel A/B 播放器。

浏览器不能通过未公开接口把 prompt 直接注入 Antigravity Desktop，因此当前明确保留一次 copy/paste handoff；它不会在后台重新调用 `agy CLI`。

## 3B. 调试入口：直接本地 MP3

如果要绕开 Browser Bridge 调试 Agent 本身，可以继续直接使用本地音频路径。

## 4. First benchmark

Use:

`VARLAN - Antagonistic.mp3`

Direct-debug prompt:

> Analyze this recording with the MusicLearning Research Workflow v4: `/absolute/path/VARLAN - Antagonistic.mp3`. The identity is VARLAN — Antagonistic. Run the three specialist branches concurrently and stop after analysis.json; do not generate Studio yet.

For the product-path acceptance, prefer the browser/NetEase flow in 3A.

## 5. Concurrency check

Open the Agents panel immediately after delegation.

You should see these three active together:

- music-acoustic-analyst
- music-listener
- music-researcher

The Orchestrator should use a single multi-subagent delegation step, not wait for one specialist before starting another.

## 6. DSP check

Inspect:

`<runDir>/dsp.json`

Then manually validate:

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

Inspect the Acoustic subagent log.

It should only run the reviewed `audio_metrics.py` path.

It must not create an ad-hoc MP3 parser or use `global_gain` as an energy proxy.

## 7. Listener isolation check

Inspect:

`<runDir>/listen.json`

Look for song-specific direct observations.

Verify the Listener did **not**:

- search the web;
- run Python/shell;
- read dsp.json;
- read research.json.

For Antagonistic, compare whether it independently notices salient changes near the areas previously discussed around roughly 0:35, 0:53, 1:10, 2:02, 2:10, and the final tail.

It is not required to reproduce every old timestamp exactly.

## 8. Research isolation check

Inspect:

`<runDir>/research.json`

Verify:

- URLs are real;
- sources were opened/read rather than copied from search snippets;
- identity claims are conservative;
- sparse public information remains sparse;
- Research did not read the audio/listening result.

## 9. Final provenance check

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind analysis \
  --file "<runDir>/analysis.json" \
  --run-dir "<runDir>"
```

This must pass.

Then inspect:

- every interpretation observation ID exists in listen.json;
- every measurement ID exists in dsp.json;
- every evidence ID exists as a Research finding;
- each Research finding points to a source;
- listening cues do not exceed measured duration.

## 10. Failure recovery check

On a separate test run, deliberately prevent Research from succeeding, for example by denying its web permission.

Expected:

- Listen remains available;
- DSP remains available;
- final analysis can be `partial`;
- successful branches are not rerun;
- external context is marked unavailable/unknown.

Do not simulate Listener failure as a successful analysis: Listener is required.

## 11. Studio check

After a successful main analysis, ask:

> Turn interpretation `<id>` into a small A/B teaching experiment.

The Orchestrator should invoke only `music-creative`.

Then validate:

```bash
node tools/music-workflow/validate_artifact.mjs \
  --kind studio \
  --file "<runDir>/studio.json" \
  --run-dir "<runDir>"
```

The Studio artifact must remain `learning_reconstruction`.

## 12. Second benchmark

Run:

Battlefield 4 — Warsaw Theme

The purpose is to test generalization and the Listen/Research isolation around the previously useful ~1:15 structural change.

## 13. Acceptance targets

Do not freeze exact latency until measured.

The workflow passes if it demonstrates:

- concurrent specialist execution;
- large reduction in open-ended Agent loops;
- correct decoded-audio acoustic metrics;
- no codec-metadata pseudo-measurement;
- independent direct listening;
- independent web research;
- resumable stage artifacts;
- final provenance validation;
- useful synthesis on both benchmark tracks.

Record actual wall-clock and token usage rather than assuming a 40–60 second SLA.
