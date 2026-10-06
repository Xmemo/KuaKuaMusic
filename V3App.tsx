import React, { useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  analyzeSongV3,
  type V3AnalyzeResponse,
  type V3Progress,
} from "./services/musicLearningV3Service";
import type { SongMetadata } from "./types";
import StudioPlayer from "./components/StudioPlayer";

const modes = { emo: "走心", hype: "上头", pro: "懂行" } as const;

function time(value: number | null) {
  if (value === null) return "";
  const seconds = Math.max(0, Math.round(value));
  return (
    Math.floor(seconds / 60) +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}

function range(start: number | null, end: number | null) {
  if (start === null) return "";
  return end === null ? time(start) : time(start) + "–" + time(end);
}

export default function V3App() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SongMetadata[]>([]);
  const [selected, setSelected] = useState<SongMetadata | null>(null);
  const [result, setResult] = useState<V3AnalyzeResponse | null>(null);
  const [mode, setMode] = useState<keyof typeof modes>("emo");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<V3Progress | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy("正在搜索歌曲");
    setError("");
    setResult(null);
    try {
      setMatches(await searchSongs(query));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function analyze(
    song: SongMetadata,
    selectedSourceId: string | null = null,
  ) {
    controller.current?.abort();
    controller.current = new AbortController();
    setSelected(song);
    setError("");
    setBusy("正在准备本地录音");
    setProgress(null);
    if (!selectedSourceId) setResult(null);

    try {
      const value = await analyzeSongV3(
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
      setResult(value);
      if (value.status === "complete") setMatches([]);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError")
        setError((cause as Error).message);
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  const complete =
    result?.status === "complete" ? result : null;
  const artifact = complete?.analysis;

  return (
    <div className="music-app">
      <header>
        <a className="brand" href="/">
          夸夸音乐 <span>Single-Agent v3 Beta</span>
        </a>
        <span className="tag">One Agent · Generic Skill · Local Song Package</span>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Listen → Measure when useful → Research → Explain</p>
          <h1>让一个真正的音乐分析 Agent 把事情做完。</h1>
          <p className="muted">
            Skill 规定方法，模型负责判断下一步；应用只负责准备录音、保存 Artifact 和执行安全。
          </p>
        </section>

        <form className="panel input-panel" onSubmit={search}>
          <label htmlFor="v3-query">歌曲链接、歌名或艺人</label>
          <div className="input-row">
            <input
              id="v3-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：VARLAN Antagonistic"
            />
            <button className="primary" disabled={!!busy || !query.trim()}>
              搜索歌曲
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

        {error ? <p className="notice" role="alert">{error}</p> : null}

        {matches.length ? (
          <section className="panel">
            <h2>选择歌曲</h2>
            <div className="song-grid">
              {matches.slice(0, 60).map((song, index) => (
                <button
                  className="song-choice"
                  key={(song.id || song.title) + index}
                  disabled={!!busy}
                  onClick={() => analyze(song)}
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

        {result?.status === "confirmation_required" && selected ? (
          <section className="panel">
            <p className="eyebrow">Recording Gate</p>
            <h2>先确认要分析的录音版本</h2>
            {result.reason ? <p className="notice">{result.reason}</p> : null}
            <div className="song-grid">
              {result.candidates.map((candidate) => (
                <button
                  className="song-choice"
                  key={candidate.sourceId}
                  disabled={!!busy}
                  onClick={() => analyze(selected, candidate.sourceId)}
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

        {artifact ? (
          <>
            <section className="panel overview">
              <div className="section-top">
                <div>
                  <p className="eyebrow">
                    {artifact.agent.runner} · {artifact.agent.model}
                  </p>
                  <h2>{selected?.title}</h2>
                  <p className="muted">
                    Skill {artifact.agent.skill.name} {artifact.agent.skill.version}
                    {" · "}
                    {artifact.agent.toolsUsed.length} 个工具调用类型
                  </p>
                </div>
                <span className="tag">Artifact v3.0</span>
              </div>
              <p className="overview-hook preserve-lines">{artifact.overall.hook}</p>
              <div className="mode-tabs">
                {(Object.entries(modes) as Array<[keyof typeof modes, string]>).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={mode === key}
                      onClick={() => setMode(key)}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
              <p className="vibe preserve-lines">{artifact.overall[mode]}</p>
              <p>{artifact.overall.overallCharacter}</p>
            </section>

            <section className="panel">
              <p className="eyebrow">Observation · 听到的</p>
              <h2>独立听感</h2>
              {artifact.observations.map((item) => (
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

            <section className="panel">
              <p className="eyebrow">Measurement · 测到的</p>
              <h2>真正执行过的测量</h2>
              {artifact.measurements.length ? (
                artifact.measurements.map((item) => (
                  <div key={item.id} className="analysis-module">
                    <h3>
                      {item.kind}: {String(item.value ?? "unknown")}
                      {item.unit ? " " + item.unit : ""}
                    </h3>
                    <p>{item.method}</p>
                    {item.alternatives.length ? (
                      <p className="muted">
                        备选：
                        {item.alternatives
                          .map(
                            (alt) =>
                              String(alt.value) +
                              " (" +
                              Math.round(alt.confidence * 100) +
                              "%)",
                          )
                          .join("；")}
                      </p>
                    ) : null}
                    {item.notes.map((note, index) => (
                      <p className="muted" key={index}>{note}</p>
                    ))}
                  </div>
                ))
              ) : (
                <p className="muted">本轮没有为了“显得科学”而强制运行 DSP。</p>
              )}
            </section>

            <section className="panel">
              <p className="eyebrow">External Evidence · 查到的</p>
              <h2>外部资料</h2>
              {artifact.externalEvidence.length ? (
                artifact.externalEvidence.map((item) => (
                  <article key={item.id} className="analysis-module">
                    <h3>{item.title}</h3>
                    <p>{item.claim}</p>
                    <blockquote>{item.excerpt}</blockquote>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.publisher || new URL(item.url).hostname}
                    </a>
                  </article>
                ))
              ) : (
                <p className="muted">没有找到足够可靠的外部资料。</p>
              )}
            </section>

            <section className="module-grid">
              {artifact.modules.map((module) => {
                const interpretations = artifact.interpretations.filter((item) =>
                  module.interpretationIds.includes(item.id),
                );
                return (
                  <article key={module.id} className="panel analysis-module">
                    <p className="eyebrow">{module.category}</p>
                    <h2>{module.title}</h2>
                    <p>{module.summary}</p>
                    {interpretations.map((item) => (
                      <div key={item.id}>
                        <p className="module-explanation preserve-lines">
                          {item.text}
                        </p>
                        {item.generalPrinciples.length ? (
                          <p className="muted">
                            通用原理：{item.generalPrinciples.join("；")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {module.listeningCues.length ? (
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

            {complete?.studio ? (
              <section className="panel studio">
                <p className="eyebrow">Creative Experiment · 教学重构</p>
                <h2>{complete.studio.experiment.question}</h2>
                <p>
                  <strong>变量：</strong>
                  {complete.studio.experiment.variable}
                </p>
                <p>
                  <strong>A：</strong>
                  {complete.studio.experiment.baseline}
                  {"　"}
                  <strong>B：</strong>
                  {complete.studio.experiment.changed}
                </p>
                <p className="notice">
                  {complete.studio.experiment.limitation}
                </p>
                <StudioPlayer
                  code={complete.studio.code}
                  baseline={complete.studio.code}
                  alternative={complete.studio.alternativeCode}
                  playback={complete.studio.playback}
                  hints={complete.studio.visualHints}
                />
              </section>
            ) : (
              <p className="muted">
                本轮没有强行生成 Studio：只有足够明确、可操作的音乐机制才进入实验。
              </p>
            )}

            {artifact.unknowns.length ? (
              <section className="panel">
                <h2>仍然不知道什么</h2>
                <ul>
                  {artifact.unknowns.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>

      <footer>
        <p>
          v3：Skill 是模型无关的方法论；当前 Runner 只是第一个实现。
        </p>
      </footer>
    </div>
  );
}
