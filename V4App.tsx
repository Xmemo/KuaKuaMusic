import React, { useEffect, useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  getV4RunStatus,
  prepareV4Run,
  requestV4Creative,
  type V4PrepareResponse,
  type V4Progress,
} from "./services/musicLearningV4Service";
import type { V4RunStatus } from "./music-learning/v4/types";
import type { SongMetadata } from "./types";
import StudioPlayer from "./components/StudioPlayer";

const modes = { emo: "走心", hype: "上头", pro: "懂行" } as const;

function time(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  const seconds = Math.max(0, Math.round(value));
  return (
    Math.floor(seconds / 60) +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}

function range(start: number | null, end: number | null) {
  if (start == null) return "";
  return end == null ? time(start) : time(start) + "–" + time(end);
}

function stageLabel(
  state: "missing" | "writing" | "ready",
  status: string | null,
) {
  if (state === "missing") return "等待 Antigravity";
  if (state === "writing") return "正在写入";
  if (status === "failed") return "失败";
  if (status === "partial") return "部分完成";
  return "已完成";
}

async function copyText(value: string) {
  if (!navigator.clipboard)
    throw new Error("当前浏览器不支持自动复制，请手动复制下面的指令。");
  await navigator.clipboard.writeText(value);
}

export default function V4App() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SongMetadata[]>([]);
  const [selected, setSelected] = useState<SongMetadata | null>(null);
  const [prepareResult, setPrepareResult] =
    useState<V4PrepareResponse | null>(null);
  const [run, setRun] = useState<V4RunStatus | null>(null);
  const [mode, setMode] = useState<keyof typeof modes>("emo");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<V4Progress | null>(null);
  const [error, setError] = useState("");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [creativePrompt, setCreativePrompt] = useState("");
  const [creativeTarget, setCreativeTarget] = useState("");
  const controller = useRef<AbortController | null>(null);

  const runId =
    prepareResult?.status === "run_ready" ? prepareResult.runId : null;

  useEffect(() => {
    if (!runId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const value = await getV4RunStatus(runId);
        if (disposed) return;
        setRun(value);
        setError("");
      } catch (cause) {
        if (!disposed) setError((cause as Error).message);
      } finally {
        if (!disposed) timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    controller.current?.abort();
    setBusy("正在解析歌曲链接");
    setError("");
    setMatches([]);
    setPrepareResult(null);
    setRun(null);
    setCreativePrompt("");
    setCreativeTarget("");
    try {
      setMatches(await searchSongs(query));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function prepare(
    song: SongMetadata,
    selectedSourceId: string | null = null,
  ) {
    controller.current?.abort();
    controller.current = new AbortController();
    setSelected(song);
    setError("");
    setBusy("正在准备本地录音");
    setProgress(null);
    setRun(null);
    setCreativePrompt("");
    setCreativeTarget("");
    if (!selectedSourceId) setPrepareResult(null);

    try {
      const value = await prepareV4Run(
        song,
        {
          selectedSourceId,
          forceRematch: Boolean(selectedSourceId),
        },
        controller.current.signal,
        (next) => {
          setProgress(next);
          setBusy(next.label);
        },
      );
      setPrepareResult(value);
      if (value.status === "run_ready") {
        setMatches([]);
        setHandoffMessage("Run 已准备好。复制指令到 Antigravity 开始分析。");
      }
    } catch (cause) {
      if ((cause as Error).name !== "AbortError")
        setError((cause as Error).message);
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  async function copyAnalysisPrompt() {
    const prompt =
      run?.antigravityPrompt ||
      (prepareResult?.status === "run_ready"
        ? prepareResult.antigravityPrompt
        : "");
    if (!prompt) return;
    try {
      await copyText(prompt);
      setHandoffMessage("已复制。切到 Antigravity，选择 music-analysis-orchestrator 后粘贴运行。");
    } catch (cause) {
      setHandoffMessage((cause as Error).message);
    }
  }

  async function createExperiment(interpretationId: string) {
    if (!runId) return;
    setError("");
    try {
      const value = await requestV4Creative(runId, interpretationId);
      setCreativeTarget(interpretationId);
      setCreativePrompt(value.antigravityPrompt);
      try {
        await copyText(value.antigravityPrompt);
        setHandoffMessage(
          "Studio 指令已复制。切到 Antigravity 粘贴运行；本页会继续等待 studio.json。",
        );
      } catch (cause) {
        setHandoffMessage((cause as Error).message);
      }
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const analysis = run?.artifacts.analysis.value;
  const listen = run?.artifacts.listen.value;
  const dsp = run?.artifacts.dsp.value;
  const research = run?.artifacts.research.value;
  const studio = run?.artifacts.studio.value;
  const analysisPrompt =
    run?.antigravityPrompt ||
    (prepareResult?.status === "run_ready"
      ? prepareResult.antigravityPrompt
      : "");

  return (
    <div className="music-app">
      <header>
        <a className="brand" href="/">
          夸夸音乐 <span>Antigravity v4</span>
        </a>
        <span className="tag">
          网易云入口 · 本地录音 · 并行研究 · Studio
        </span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Link → Recording → Research Team → Experiment</p>
          <h1>粘贴一首歌，让它真正被听、被测量、被考据。</h1>
          <p className="muted">
            浏览器负责歌曲入口和结果呈现；Antigravity 负责三个隔离的专业子 Agent 并行分析。
          </p>
        </section>

        <form className="panel input-panel" onSubmit={search}>
          <label htmlFor="v4-query">网易云 / QQ 音乐链接、歌名或艺人</label>
          <div className="input-row">
            <input
              id="v4-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="粘贴网易云分享链接，或输入「歌名 + 艺人」"
            />
            <button className="primary" disabled={!!busy || !query.trim()}>
              找到这首歌
            </button>
          </div>
        </form>

        {busy ? (
          <div className="busy" role="status">
            <span>
              {progress ? <small>{progress.stage}</small> : null}
              <strong>{busy}</strong>
            </span>
            <button onClick={() => controller.current?.abort()}>取消</button>
          </div>
        ) : null}

        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}

        {matches.length ? (
          <section className="panel">
            <p className="eyebrow">Song Identity</p>
            <h2>选择要分析的歌曲</h2>
            <div className="song-grid">
              {matches.slice(0, 60).map((song, index) => (
                <button
                  className="song-choice"
                  key={(song.id || song.title) + index}
                  disabled={!!busy}
                  onClick={() => prepare(song)}
                >
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                  <small>
                    {[song.album, song.releaseYear, song.platform]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {prepareResult?.status === "confirmation_required" && selected ? (
          <section className="panel">
            <p className="eyebrow">Recording Gate</p>
            <h2>确认实际要听的录音版本</h2>
            {prepareResult.reason ? (
              <p className="notice">{prepareResult.reason}</p>
            ) : null}
            <div className="song-grid">
              {prepareResult.candidates.map((candidate) => (
                <button
                  className="song-choice"
                  key={candidate.sourceId}
                  disabled={!!busy}
                  onClick={() => prepare(selected, candidate.sourceId)}
                >
                  <strong>{candidate.title}</strong>
                  <span>{candidate.channel}</span>
                  <small>
                    匹配 {Math.round(candidate.matchScore * 100)}%
                    {candidate.durationSec
                      ? " · " + time(candidate.durationSec)
                      : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {prepareResult?.status === "run_ready" ? (
          <section className="panel">
            <div className="section-top">
              <div>
                <p className="eyebrow">Antigravity Handoff</p>
                <h2>录音已准备好，现在交给研究团队</h2>
              </div>
              <span className="tag">
                {prepareResult.reused ? "复用本地录音" : "新录音已缓存"}
              </span>
            </div>
            <p>
              <strong>{prepareResult.song.title}</strong> —{" "}
              {prepareResult.song.artist}
              {" · "}
              {time(prepareResult.materialization.durationSec)}
            </p>
            <p className="muted">
              Run：{prepareResult.runId}
            </p>
            <p className="muted">
              浏览器不会偷偷调用 agy CLI。请在 Antigravity 中运行下面这条任务；本页会自动等待并读取产物。
            </p>
            <textarea
              readOnly
              value={analysisPrompt}
              rows={11}
              style={{ width: "100%", resize: "vertical" }}
              aria-label="Antigravity 分析指令"
            />
            <div className="actions">
              <button className="primary" onClick={copyAnalysisPrompt}>
                复制 Antigravity 分析指令
              </button>
            </div>
            {handoffMessage ? <p className="notice">{handoffMessage}</p> : null}
          </section>
        ) : null}

        {run ? (
          <section className="panel">
            <p className="eyebrow">Live Artifacts</p>
            <h2>研究进度</h2>
            <div className="song-grid">
              {(
                [
                  ["dsp", "📐 声学测量"],
                  ["listen", "🎧 独立听感"],
                  ["research", "📚 外部考据"],
                  ["analysis", "🧠 综合拆解"],
                  ["studio", "🎛 Studio"],
                ] as const
              ).map(([key, label]) => (
                <div className="song-choice" key={key}>
                  <strong>{label}</strong>
                  <span>
                    {stageLabel(
                      run.summary[key].state,
                      run.summary[key].status,
                    )}
                  </span>
                  {run.summary[key].error ? (
                    <small>{run.summary[key].error}</small>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {analysis ? (
          <>
            <section className="panel overview">
              <div className="section-top">
                <div>
                  <p className="eyebrow">
                    {analysis.status === "partial"
                      ? "Partial Analysis"
                      : "MusicLearning v4"}
                  </p>
                  <h2>{run?.task.identity.title}</h2>
                  <p className="muted">{run?.task.identity.artist}</p>
                </div>
                <span className="tag">Artifact v4.0</span>
              </div>
              <p className="overview-hook preserve-lines">
                {analysis.overall.hook}
              </p>
              <div className="mode-tabs">
                {(Object.entries(modes) as Array<
                  [keyof typeof modes, string]
                >).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={mode === key}
                    onClick={() => setMode(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="vibe preserve-lines">{analysis.overall[mode]}</p>
              <p>{analysis.overall.overallCharacter}</p>
            </section>

            <section className="module-grid">
              {analysis.modules.map((module) => {
                const interpretations = analysis.interpretations.filter((item) =>
                  module.interpretationIds.includes(item.id),
                );
                return (
                  <article className="panel analysis-module" key={module.id}>
                    <p className="eyebrow">{module.category}</p>
                    <h2>{module.title}</h2>
                    <p className="module-summary">{module.summary}</p>
                    {interpretations.map((item) => {
                      const studioRecommended =
                        analysis.studioPotential.eligible &&
                        analysis.studioPotential.sourceInterpretationIds.includes(
                          item.id,
                        );
                      return (
                        <div key={item.id}>
                          <p className="module-explanation preserve-lines">
                            {item.text}
                          </p>
                          <p className="muted">
                            依据：听感 {item.observationIds.length} · 测量{" "}
                            {item.measurementIds.length} · 外部证据{" "}
                            {item.evidenceIds.length}
                          </p>
                          {item.generalPrinciples.length ? (
                            <p className="muted">
                              通用原理：{item.generalPrinciples.join("；")}
                            </p>
                          ) : null}
                          {studioRecommended ? (
                            <button
                              className="primary"
                              onClick={() => createExperiment(item.id)}
                            >
                              在 Studio 里试试这个机制
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {module.listeningCues.length ? (
                      <div className="listening-cues">
                        <h3>怎么听</h3>
                        <ul>
                          {module.listeningCues.map((cue, index) => (
                            <li key={index}>
                              {range(cue.startSec, cue.endSec)
                                ? range(cue.startSec, cue.endSec) + " · "
                                : ""}
                              {cue.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {module.unknowns.length ? (
                      <p className="muted">
                        未确认：{module.unknowns.join("；")}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </section>

            {analysis.studioPotential.eligible ? (
              <section className="panel">
                <p className="eyebrow">Studio Potential</p>
                <h2>{analysis.studioPotential.mechanism}</h2>
                <p>
                  <strong>变量：</strong>
                  {analysis.studioPotential.variable}
                </p>
                <p>
                  <strong>A：</strong>
                  {analysis.studioPotential.baseline}
                  {"　"}
                  <strong>B：</strong>
                  {analysis.studioPotential.changed}
                </p>
                <p className="muted">
                  听什么：{analysis.studioPotential.listenFor.join("；")}
                </p>
                <p className="notice">
                  {analysis.studioPotential.limitation}
                </p>
              </section>
            ) : null}
          </>
        ) : null}

        {listen?.status === "complete" ? (
          <section className="panel">
            <p className="eyebrow">Observation · 听到的</p>
            <h2>独立听感</h2>
            <p>{listen.overallCharacter}</p>
            {listen.observations.map((item) => (
              <p key={item.id}>
                <strong>{item.category}</strong>
                {range(item.startSec, item.endSec)
                  ? " · " + range(item.startSec, item.endSec)
                  : ""}
                {" — "}
                {item.text}
                <span className="muted">
                  {" "}({Math.round(item.confidence * 100)}%)
                </span>
              </p>
            ))}
          </section>
        ) : null}

        {dsp?.status === "complete" ? (
          <section className="panel">
            <p className="eyebrow">Measurement · 测到的</p>
            <h2>确定性声学指标</h2>
            <div className="song-grid">
              <div className="song-choice">
                <strong>
                  {dsp.loudness.integratedLufs ?? "—"} LUFS
                </strong>
                <span>Integrated Loudness</span>
              </div>
              <div className="song-choice">
                <strong>{dsp.loudness.loudnessRangeLu ?? "—"} LU</strong>
                <span>Loudness Range</span>
              </div>
              <div className="song-choice">
                <strong>{dsp.loudness.truePeakDbfs ?? "—"} dBFS</strong>
                <span>True Peak</span>
              </div>
            </div>
            {dsp.changePoints.length ? (
              <>
                <h3>RMS 跃变候选</h3>
                <ul>
                  {dsp.changePoints.slice(0, 12).map((point) => (
                    <li key={point.id}>
                      {time(point.atSec)} · {point.deltaDb > 0 ? "+" : ""}
                      {point.deltaDb.toFixed(2)} dB ·{" "}
                      {point.direction === "rise" ? "上升" : "下降"}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="muted">{dsp.loudness.method}</p>
          </section>
        ) : null}

        {research?.status === "complete" ? (
          <section className="panel">
            <p className="eyebrow">External Evidence · 查到的</p>
            <h2>外部资料</h2>
            {research.findings.map((finding) => (
              <div className="analysis-module" key={finding.id}>
                <h3>{finding.topic}</h3>
                <p>{finding.text}</p>
                <p className="muted">
                  置信度 {Math.round(finding.confidence * 100)}%
                </p>
                {finding.sourceIds.map((sourceId) => {
                  const source = research.sources.find(
                    (item) => item.id === sourceId,
                  );
                  return source ? (
                    <p key={source.id}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>
                      {source.publisher ? " · " + source.publisher : ""}
                    </p>
                  ) : null;
                })}
              </div>
            ))}
            {research.unknowns.length ? (
              <p className="muted">
                仍待确认：{research.unknowns.join("；")}
              </p>
            ) : null}
          </section>
        ) : null}

        {creativePrompt && !studio ? (
          <section className="panel">
            <p className="eyebrow">Creative Handoff</p>
            <h2>Studio 任务已准备</h2>
            <p>
              分析点：<code>{creativeTarget}</code>
            </p>
            <textarea
              readOnly
              value={creativePrompt}
              rows={8}
              style={{ width: "100%", resize: "vertical" }}
              aria-label="Antigravity Studio 指令"
            />
            <button
              className="primary"
              onClick={() => {
                void copyText(creativePrompt)
                  .then(() =>
                    setHandoffMessage("Studio 指令已重新复制。"),
                  )
                  .catch((cause) =>
                    setHandoffMessage((cause as Error).message),
                  );
              }}
            >
              复制 Studio 指令
            </button>
          </section>
        ) : null}

        {studio ? (
          <section className="panel studio">
            <p className="eyebrow">Creative Experiment · 教学重构</p>
            <h2>{studio.question}</h2>
            <p>
              <strong>变量：</strong>
              {studio.variable}
            </p>
            <p>
              <strong>A：</strong>
              {studio.baseline}
              {"　"}
              <strong>B：</strong>
              {studio.changed}
            </p>
            <p className="notice">{studio.limitation}</p>
            <StudioPlayer
              code={studio.code}
              baseline={studio.code}
              alternative={studio.alternativeCode}
              playback={studio.playback}
              hints={studio.visualHints}
            />
          </section>
        ) : null}

        {analysis?.unknowns.length ? (
          <section className="panel">
            <h2>仍然不知道什么</h2>
            <ul>
              {analysis.unknowns.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer>
        <p>
          浏览器负责产品壳；Antigravity 负责 v4 并行研究。没有后台 agy CLI 隐式调用。
        </p>
      </footer>
    </div>
  );
}
