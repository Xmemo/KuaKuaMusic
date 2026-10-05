
import React, { useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  analyzeSongV2,
  type V2AnalyzeResponse,
  type V2Progress,
} from "./services/musicLearningV2Service";
import type { SongMetadata } from "./types";
import { SourcesPanel } from "./components/EvidencePanel";
import StudioPlayer from "./components/StudioPlayer";

const modeLabels = { emo: "走心", hype: "上头", pro: "懂行" } as const;

function formatTime(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(value / 60);
  return minutes + ":" + String(value % 60).padStart(2, "0");
}

function rangeLabel(start: number | null, end: number | null) {
  if (start === null) return "";
  return end === null ? formatTime(start) : formatTime(start) + "–" + formatTime(end);
}

export default function V2App() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SongMetadata[]>([]);
  const [selected, setSelected] = useState<SongMetadata | null>(null);
  const [result, setResult] = useState<V2AnalyzeResponse | null>(null);
  const [mode, setMode] = useState<keyof typeof modeLabels>("emo");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<V2Progress | null>(null);
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

  async function run(song: SongMetadata, selectedSourceId: string | null = null) {
    controller.current?.abort();
    controller.current = new AbortController();
    setSelected(song);
    setBusy("正在准备本地歌曲");
    setProgress(null);
    setError("");
    if (!selectedSourceId) setResult(null);
    try {
      const value = await analyzeSongV2(
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
      if (value.status !== "confirmation_required") setMatches([]);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError")
        setError((cause as Error).message);
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  const completed =
    result && result.status !== "confirmation_required" ? result : null;
  const analysis = completed?.analysis;
  const activeMode = analysis?.overallVibe[mode];

  return (
    <div className="music-app">
      <header>
        <a className="brand" href="/">
          夸夸音乐 <span>Audio-first v2 Beta</span>
        </a>
        <span className="tag">Listen → Research → Critic → Experiment</span>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">先听这首歌，再查资料，再解释</p>
          <h1>这次，真的从音乐本身开始。</h1>
          <p className="muted">
            选择歌曲后，本机先匹配并缓存音频；Listen 与 Research 独立进行，最后才由 Critic 综合。
          </p>
        </section>

        <form className="panel input-panel" onSubmit={search}>
          <label htmlFor="v2-song-query">歌曲链接、歌名或艺人</label>
          <div className="input-row">
            <input
              id="v2-song-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：Battlefield 4 Warsaw Theme Rami"
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
                  onClick={() => run(song)}
                >
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                  <small>{[song.album, song.releaseYear, song.platform].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {result?.status === "confirmation_required" && selected ? (
          <section className="panel">
            <p className="eyebrow">需要确认音源</p>
            <h2>YouTube 找到几个相近版本</h2>
            <p className="muted">自动匹配置信度不够高。选中后会创建新的 media revision。</p>
            <div className="song-grid">
              {result.candidates.map((candidate) => (
                <button
                  className="song-choice"
                  key={candidate.sourceId}
                  disabled={!!busy}
                  onClick={() => run(selected, candidate.sourceId)}
                >
                  <strong>{candidate.title}</strong>
                  <span>{candidate.channel}</span>
                  <small>
                    匹配 {Math.round(candidate.matchScore * 100)}%
                    {candidate.durationSec ? " · " + formatTime(candidate.durationSec) : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {completed && analysis ? (
          <>
            <section className="panel overview">
              <div className="section-top">
                <div>
                  <p className="eyebrow">{completed.materialization.reused ? "本地音频已复用" : "已建立本地音频"}</p>
                  <h2>{selected?.title}</h2>
                  <p className="muted">{selected?.artist}</p>
                </div>
                <span className="tag">{completed.status === "complete" ? "完整完成" : "降级完成"}</span>
              </div>
              <p className="overview-hook preserve-lines">{analysis.overallVibe.hook.text}</p>
              <div className="mode-tabs" role="group" aria-label="三种概括">
                {(Object.entries(modeLabels) as Array<[keyof typeof modeLabels, string]>).map(([key, label]) => (
                  <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>
                    {label}
                  </button>
                ))}
              </div>
              {activeMode ? <p className="vibe preserve-lines">{activeMode.text}</p> : null}
              {completed.warnings.length ? (
                <div className="notice">
                  {completed.warnings.map((item) => (
                    <p key={item.stage + item.code}>{item.stage}：{item.message}</p>
                  ))}
                </div>
              ) : null}
            </section>

            {completed.observation ? (
              <section className="panel">
                <div className="section-top">
                  <div>
                    <p className="eyebrow">Listen Pass</p>
                    <h2>模型独立听到了什么</h2>
                  </div>
                  <span className="tag">{completed.observation.provider.model}</span>
                </div>
                <p>{completed.observation.globalProfile.overallCharacter}</p>
                <p className="muted">
                  {[...completed.observation.globalProfile.styleTags, ...completed.observation.globalProfile.moodTags].join(" · ")}
                </p>
                {completed.observation.notableMoments.map((moment) => (
                  <article className="analysis-module" key={moment.id}>
                    <span className="tag">{formatTime(moment.startSec)}–{formatTime(moment.endSec)}</span>
                    <h3>{moment.title}</h3>
                  </article>
                ))}
                <details>
                  <summary>查看全部 Audio Observation（{completed.observation.observations.length}）</summary>
                  {completed.observation.observations.map((item) => (
                    <p key={item.id}>
                      <strong>{item.category}</strong>{" "}
                      {rangeLabel(item.startSec, item.endSec) ? rangeLabel(item.startSec, item.endSec) + " · " : ""}
                      {item.statement}{" "}
                      <span className="muted">confidence {Math.round(item.confidence * 100)}%</span>
                    </p>
                  ))}
                </details>
                {completed.observation.uncertainties.length ? (
                  <details>
                    <summary>Listen 的不确定部分</summary>
                    <ul>
                      {completed.observation.uncertainties.map((item, index) => (
                        <li key={index}>{item.topic}：{item.text}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            ) : (
              <p className="notice">本轮 Listen 失败，保留 Research-only Critic 结果，不生成 Studio。</p>
            )}

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
                    {interpretations.map((item) => (
                      <div key={item.id}>
                        <p className="module-explanation preserve-lines">{item.text}</p>
                        {item.generalPrinciples.length ? (
                          <p className="muted">通用原理：{item.generalPrinciples.join("；")}</p>
                        ) : null}
                      </div>
                    ))}
                    {module.listeningCues.length ? (
                      <div className="listening-cues">
                        <h3>怎么听</h3>
                        <ul>
                          {module.listeningCues.map((cue, index) => (
                            <li key={index}>
                              {rangeLabel(cue.startSec, cue.endSec) ? rangeLabel(cue.startSec, cue.endSec) + " · " : ""}
                              {cue.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {module.studioPotential !== "none" ? (
                      <span className="tag">可实验 · {module.studioPotential}</span>
                    ) : null}
                  </article>
                );
              })}
            </section>

            {completed.research ? (
              <section className="panel">
                <p className="eyebrow">Research Pass</p>
                <h2>外部资料独立查到了什么</h2>
                <p>{completed.research.summary}</p>
                {completed.research.findings.map((finding) => (
                  <p key={finding.id}><strong>{finding.topic}</strong> · {finding.text}</p>
                ))}
              </section>
            ) : (
              <p className="notice">本轮 Research 失败；Critic 仅使用 Audio Observation 与通用音乐原理。</p>
            )}

            {completed.creative?.blueprint ? (
              <section className="panel">
                <p className="eyebrow">Creative Blueprint</p>
                <h2>{completed.creative.blueprint.title}</h2>
                <p>{completed.creative.blueprint.concept}</p>
                <div className="experiment-grid">
                  {completed.creative.blueprint.variables.map((variable) => (
                    <div key={variable.id}>
                      <strong>{variable.type}</strong>
                      <p>A：{variable.baseline}<br />B：{variable.variation}</p>
                    </div>
                  ))}
                </div>
                <p className="muted">{completed.creative.blueprint.limitations.join("；")}</p>
              </section>
            ) : null}

            {completed.creative?.studioSeed ? (
              <section className="panel studio">
                <div className="section-top">
                  <div>
                    <p className="eyebrow">Studio · 教学重构</p>
                    <h2>{completed.creative.studioSeed.experiment.question}</h2>
                  </div>
                  <span className="tag">learning_reconstruction</span>
                </div>
                <p><strong>只改变：</strong>{completed.creative.studioSeed.experiment.variable}</p>
                <p>
                  <strong>A：</strong>{completed.creative.studioSeed.experiment.baseline}
                  {"　"}
                  <strong>B：</strong>{completed.creative.studioSeed.experiment.changed}
                </p>
                <p className="notice">{completed.creative.studioSeed.experiment.limitation}</p>
                <StudioPlayer
                  code={completed.creative.studioSeed.code}
                  baseline={completed.creative.studioSeed.code}
                  alternative={completed.creative.studioSeed.alternativeCode}
                  playback={completed.creative.studioSeed.playback}
                  hints={completed.creative.studioSeed.visualHints}
                />
                <details>
                  <summary>查看生成的 Strudel A/B 代码</summary>
                  <pre>{completed.creative.studioSeed.code}</pre>
                  <pre>{completed.creative.studioSeed.alternativeCode}</pre>
                </details>
              </section>
            ) : completed.observation ? (
              <p className="muted">当前没有足够可操作的机制进入 Studio，没有强行生成实验。</p>
            ) : null}

            <SourcesPanel sources={completed.sources} />
          </>
        ) : null}

        {selected && !busy && completed ? (
          <button onClick={() => run(selected)}>再分析一次 {selected.title}</button>
        ) : null}
      </main>
      <footer>
        <p>v2 Beta：音频与 Artifact 保存在本机；DashScope Listen 会临时上传分析音频。</p>
      </footer>
    </div>
  );
}
