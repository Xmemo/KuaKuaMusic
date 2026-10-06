
import React, { useEffect, useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  analyzeSongV2,
  getV2Health,
  type V2Health,
  type V2AnalyzeResponse,
} from "./services/musicLearningV2Service";
import type { SongMetadata } from "./types";
import { SourcesPanel } from "./components/EvidencePanel";
import StudioPlayer from "./components/StudioPlayer";

const modeLabels = { emo: "走心", hype: "上头", pro: "懂行" } as const;
const coreLabels = { culture: "文化与背景", harmony: "和声", rhythm: "律动", timbre: "音色" } as const;
const scopeLabels = { work: "作品背景", source_version: "来源所谈版本", recording: "录音版本" } as const;

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
  const [showMatches, setShowMatches] = useState(false);
  const [visibleMatches, setVisibleMatches] = useState(60);
  const [selected, setSelected] = useState<SongMetadata | null>(null);
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);
  const [result, setResult] = useState<V2AnalyzeResponse | null>(null);
  const [mode, setMode] = useState<keyof typeof modeLabels>("emo");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<V2Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [checking, setChecking] = useState(false);
  const controller = useRef<AbortController | null>(null);

  async function checkHealth() {
    setChecking(true);
    setHealthError("");
    try { setHealth(await getV2Health()); }
    catch (cause) { setHealthError((cause as Error).message); }
    finally { setChecking(false); }
  }
  useEffect(() => {
    void checkHealth();
    return () => controller.current?.abort();
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy("正在搜索歌曲");
    setError("");
    setResult(null);
    setSelected(null);
    setChosenSourceId(null);
    try {
      setMatches(await searchSongs(query, controller.current.signal));
      setVisibleMatches(60);
      setShowMatches(true);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function run(song: SongMetadata, selectedSourceId: string | null = null, forceRematch = false) {
    controller.current?.abort();
    controller.current = new AbortController();
    setSelected(song);
    if (!selectedSourceId) setChosenSourceId(null);
    setShowMatches(false);
    setBusy(selectedSourceId ? "正在下载所选音源并开始分析" : "正在准备音源预览");
    setError("");
    setResult(null);
    try {
      const value = await analyzeSongV2(
        song,
        {
          selectedSourceId,
          forceRematch: forceRematch || Boolean(selectedSourceId),
        },
        controller.current.signal,
        (next) => {
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
            选择歌曲后先试听音源；只有确认后才会下载并开始分析。Listen 与 Research 独立进行，最后由 Critic 综合。
          </p>
        </section>

        <details className="panel" open={health?.ok === false || Boolean(healthError)}>
          <summary>本机准备状态 · {checking ? "正在检查" : health?.ok ? "工具与配置已就绪" : "需要检查"}</summary>
          <p className="muted">检查工具、登录和密钥是否配置；模型可用性在实际调用时确认。</p>
          {health?.checks.map((item) => (
            <p key={item.id}><strong>{item.label}：{item.status === "ready" ? "已就绪" : "未就绪"}</strong> · {item.message}</p>
          ))}
          {healthError ? <p className="notice">{healthError}</p> : null}
          <button disabled={checking} onClick={() => void checkHealth()}>重新检查配置</button>
        </details>

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
              <strong>{busy}</strong>
            </span>
            <button onClick={() => controller.current?.abort()}>取消</button>
          </div>
        ) : null}

        {error ? (
          <>
            <p className="notice" role="alert">{error}</p>
            {selected && matches.length ? (
              <button onClick={() => { setResult(null); setShowMatches(true); }}>返回歌曲结果，换一个版本</button>
            ) : null}
          </>
        ) : null}

        {showMatches && matches.length ? (
          <section className="panel">
            <h2>选择歌曲</h2>
            <p className="muted">找到 {matches.length} 条候选，已展示 {Math.min(visibleMatches, matches.length)} 条。</p>
            <div className="song-grid">
              {matches.slice(0, visibleMatches).map((song, index) => (
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
            {visibleMatches < matches.length ? <button disabled={!!busy} onClick={() => setVisibleMatches((count) => count + 60)}>显示更多候选</button> : null}
          </section>
        ) : null}

        {result?.status === "confirmation_required" && selected ? (
          <section className="panel">
            <p className="eyebrow">音源预览</p>
            <h2>{result.candidates.length ? "试听并选择这个版本" : "暂未找到合适的音源"}</h2>
            <p className="muted">
              {result.candidates.length
                ? "先播放预览并选定正确版本。此步骤不会下载音频或调用分析模型。"
                : "当前没有可供试听的匹配版本。你可以返回歌曲结果，换一个歌曲条目再试。"}
            </p>
            {result.reason ? <p className="notice">{result.reason}</p> : null}
            {result.candidates.length ? <div className="source-preview-grid">
              {result.candidates.map((candidate) => (
                <article className={"source-preview-card" + (chosenSourceId === candidate.sourceId ? " is-selected" : "")} key={candidate.sourceId}>
                  <div className="source-preview-frame">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(candidate.sourceId)}?playsinline=1&rel=0`}
                      title={`试听：${candidate.title}`}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="source-preview-copy">
                    <h3>{candidate.title}</h3>
                    <p className="muted">{candidate.channel}</p>
                    <p className="muted">{candidate.durationSec ? formatTime(candidate.durationSec) : "时长未知"} · 匹配参考 {Math.round(candidate.matchScore * 100)}%</p>
                    <button
                      aria-pressed={chosenSourceId === candidate.sourceId}
                      className={chosenSourceId === candidate.sourceId ? "source-selected-button" : ""}
                      disabled={!!busy}
                      onClick={() => setChosenSourceId(candidate.sourceId)}
                    >
                      {chosenSourceId === candidate.sourceId ? "已选中此音源" : "选择此音源"}
                    </button>
                    <a href={candidate.url} target="_blank" rel="noreferrer">在 YouTube 打开</a>
                  </div>
                </article>
              ))}
            </div> : null}
            {result.candidates.length ? (
              <div className="source-preview-actions">
                <p className="muted">只有点击下方按钮后，才会下载所选音频并调用本机配置的分析模型。</p>
                <button className="primary" disabled={!chosenSourceId || !!busy} onClick={() => run(selected, chosenSourceId, true)}>
                  下载所选音源并开始分析
                </button>
              </div>
            ) : null}
            {!result.candidates.length && matches.length ? (
              <button onClick={() => { setResult(null); setSelected(null); setShowMatches(true); }}>
                返回歌曲结果，换一个版本
              </button>
            ) : null}
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
              <details open>
                <summary>本轮分析的录音音源</summary>
                <p><a href={completed.materialization.source.url} target="_blank" rel="noreferrer">{completed.materialization.source.title}</a></p>
                <p className="muted">{completed.materialization.source.channel} · 实测 {formatTime(completed.materialization.source.durationSec)} · 匹配分数 {Math.round(completed.materialization.source.matchScore * 100)}% · {completed.materialization.source.decision === "manual_selected" ? "人工确认" : "自动匹配"}</p>
                {completed.materialization.identityWarning ? <p className="notice">{completed.materialization.identityWarning}</p> : null}
                <button disabled={!!busy} onClick={() => selected && run(selected, null, true)}>更换音源</button>
              </details>
              <p className="muted">本轮缓存：音频{completed.cache.audio ? "复用" : "新建"} · Listen {completed.cache.listen ? "复用" : "新建"} · Research {completed.research ? completed.cache.research ? "复用" : "新建" : "未完成"}</p>
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

            <section className="panel" aria-label="四个核心维度">
              <div className="experiment-grid">
                {Object.entries(coreLabels).map(([category, label]) => (
                  <div key={category}><strong>{label}</strong><p>{analysis.modules.some((module) => module.category === category) ? "已有解读" : "资料不足"}</p></div>
                ))}
              </div>
              {analysis.unknowns.length ? <p className="notice">尚未确认：{analysis.unknowns.join("；")}</p> : null}
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
                    {module.unknowns.length ? <p className="notice">限制：{module.unknowns.join("；")}</p> : null}
                    <details>
                      <summary>依据与适用范围</summary>
                      {interpretations.map((item) => (
                        <div key={item.id}>
                          {item.observationIds.map((id) => {
                            const observation = completed.observation?.observations.find((entry) => entry.id === id);
                            return observation ? <p key={id}><strong>机器听觉观察</strong> · {rangeLabel(observation.startSec, observation.endSec)} {observation.statement}（置信度 {Math.round(observation.confidence * 100)}%）</p> : null;
                          })}
                          {item.evidenceIds.map((id) => {
                            const source = completed.sources.find((entry) => entry.excerpts.some((excerpt) => excerpt.id === id));
                            const excerpt = source?.excerpts.find((entry) => entry.id === id);
                            const finding = completed.research?.findings.find((entry) => entry.evidenceIds.includes(id));
                            return source && excerpt ? <p key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {finding ? scopeLabels[finding.scope] + " · " + finding.versionScope : "按来源描述范围理解"}<br />{excerpt.text}</p> : null;
                          })}
                        </div>
                      ))}
                    </details>
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
                  <div key={finding.id}><p><strong>{finding.topic}</strong> · {finding.text}</p><p className="muted">{scopeLabels[finding.scope]} · {finding.versionScope}</p></div>
                ))}
                {completed.research.unknowns.length ? <p className="notice">资料缺口：{completed.research.unknowns.join("；")}</p> : null}
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
                <p className="muted">保持不变：{completed.creative.studioSeed.experiment.constants.join("、")}</p>
                <p>试听比较：{completed.creative.studioSeed.experiment.listenFor.join("；")}</p>
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
