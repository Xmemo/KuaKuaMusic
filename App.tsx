import React, { useEffect, useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  analyzeSongWithEvidence,
  deepDiveAnalysisItem,
  getMusicLearningAgentHealth,
  listSavedAnalyses,
  loadSavedAnalysis,
} from "./services/musicLearningService";
import type { AnalysisProgress } from "./services/musicLearningService";
import type { SongMetadata } from "./types";
import type {
  AgentHealth,
  AnalysisHistoryItem,
  EvidencePackage,
  StoredAnalysis,
  StoredDeepDive,
} from "./music-learning/types";
import { ClaimList, Notes, SourcesPanel } from "./components/EvidencePanel";
import StudioPanel from "./components/StudioPanel";
const categories = {
  culture: "文化与背景",
  harmony: "和声",
  rhythm: "节奏与律动",
  timbre: "音色",
  arrangement: "编曲",
  structure: "结构",
  production: "制作",
};
const modes = { emo: "走心", hype: "上头", pro: "懂行" };
const coreLabels = { culture: "文化与背景", harmony: "和声", rhythm: "节奏与律动", timbre: "音色" } as const;
const coreGuidance = {
  culture: "试着把歌词里的叙述视角、意象和时代语境分开听。以下只是通用阅读方法，不代表已经确认这首歌的背景。",
  harmony: "跟着低音听每次和弦变化，再留意旋律停留或解决的位置。以下是通用听歌练习，不是这首歌的和弦结论。",
  rhythm: "轻轻跟拍，比较重拍、切分和鼓点疏密在哪里变化。以下是通用听歌练习，不是这首歌的节拍测量。",
  timbre: "分别注意人声、低频、打击声和铺底声的明暗、远近与质感。以下是通用听歌练习，不是这首歌的录音分析。",
} as const;
const scopeLabels = { recording: "所选录音", work: "作品层面", source_version: "来源所述版本", general: "通用原理" } as const;
function MusicLearningApp() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SongMetadata[]>([]),
    [selected, setSelected] = useState<SongMetadata | null>(null);
  const [visibleMatches, setVisibleMatches] = useState(24);
  const [stored, setStored] = useState<StoredAnalysis | null>(null),
    [savedPackage, setSavedPackage] = useState<EvidencePackage | null>(null);
  const [dive, setDive] = useState<StoredDeepDive | null>(null),
    [mode, setMode] = useState<keyof typeof modes>("emo");
  const [question, setQuestion] = useState(""),
    [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [health, setHealth] = useState<AgentHealth | null>(null),
    [busy, setBusy] = useState(""),
    [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null),
    [error, setError] = useState(""),
    [connection, setConnection] = useState("");
  const controller = useRef<AbortController | null>(null),
    ticket = useRef(0);
  const analysis = stored?.analysis;
  const failedCopyIds = new Set((stored?.evidenceReview?.texts ?? []).filter((item) => item.verdict !== "supports").map((item) => item.textId));
  const availableModes = analysis
    ? (Object.entries(modes) as Array<[keyof typeof modes, string]>).filter(([key]) => analysis.overallVibe[key].text.trim())
    : [];
  const displayMode = availableModes.some(([key]) => key === mode) ? mode : availableModes[0]?.[0];
  useEffect(() => {
    let disposed = false;
    getMusicLearningAgentHealth()
      .then((value) => {
        if (!disposed) setHealth(value);
      })
      .catch(() => {
        if (!disposed) setConnection("请在本机运行 npm run dev 后打开本页面。");
      });
    listSavedAnalyses()
      .then((value) => {
        if (!disposed) setHistory(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      controller.current?.abort();
      ticket.current++;
    };
  }, []);
  async function refreshHistory() {
    try {
      setHistory(await listSavedAnalyses());
    } catch {}
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    controller.current = null;
    setBusy("正在搜索歌曲");
    setAnalysisProgress(null);
    setError("");
    try {
      setMatches(await searchSongs(query));
      setVisibleMatches(24);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function analyze(song: SongMetadata & { selectedVersion?: string }) {
    controller.current?.abort();
    controller.current = new AbortController();
    const currentTicket = ++ticket.current;
    setSelected(song);
    setStored(null);
    setSavedPackage(null);
    setDive(null);
    setQuestion("");
    setMode("emo");
    setAnalysisProgress(null);
    setBusy("正在准备研究");
    setError("");
    try {
      const value = await analyzeSongWithEvidence(
        song,
        "",
        controller.current.signal,
        (progress) => {
          if (currentTicket !== ticket.current) return;
          setAnalysisProgress(progress);
          setBusy(progress.label);
        },
      );
      if (currentTicket !== ticket.current) return;
      setStored(value);
      setSavedPackage(null);
      setDive(null);
      setMatches([]);
      await refreshHistory();
    } catch (e) {
      if (
        currentTicket === ticket.current &&
        (e as Error).name !== "AbortError"
      )
        setError((e as Error).message);
    } finally {
      if (currentTicket === ticket.current) { setBusy(""); setAnalysisProgress(null); }
    }
  }
  async function expand(id: string, followup = "") {
    if (!stored || busy) return;
    controller.current = new AbortController();
    const currentTicket = ++ticket.current;
    setBusy("正在围绕这个问题深入研究");
    setAnalysisProgress(null);
    setError("");
    try {
      const value = await deepDiveAnalysisItem(
        stored.analysisId,
        id,
        followup,
        controller.current.signal,
        (progress) => {
          if (currentTicket !== ticket.current) return;
          setAnalysisProgress(progress);
          setBusy(progress.label);
        },
      );
      if (currentTicket !== ticket.current) return;
      setDive(value);
      const pkg = await loadSavedAnalysis(stored.analysisId);
      if (currentTicket === ticket.current) setSavedPackage(pkg);
      await refreshHistory();
    } catch (e) {
      if (
        currentTicket === ticket.current &&
        (e as Error).name !== "AbortError"
      )
        setError((e as Error).message);
    } finally {
      if (currentTicket === ticket.current) { setBusy(""); setAnalysisProgress(null); }
    }
  }
  async function restore(id: string) {
    controller.current?.abort();
    const currentTicket = ++ticket.current;
    setBusy("正在恢复研究记录");
    setError("");
    try {
      const pkg = await loadSavedAnalysis(id);
      if (currentTicket !== ticket.current) return;
      setStored(pkg);
      setSavedPackage(pkg);
      setSelected({
        title: pkg.analysis.song.title,
        artist: pkg.analysis.song.artist,
      });
      setDive(pkg.deepDives.at(-1) || null);
      setMatches([]);
    } catch (e) {
      if (currentTicket === ticket.current) setError((e as Error).message);
    } finally {
      if (currentTicket === ticket.current) setBusy("");
    }
  }
  function cancel() {
    controller.current?.abort();
    ticket.current++;
    setBusy("");
    setAnalysisProgress(null);
    setError("研究已取消，已有保存记录仍可继续使用。");
  }
  function exportAnalysis() {
    if (!stored) return;
    const blob = new Blob([JSON.stringify(savedPackage || stored, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "music-learning-evidence.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="music-app">
      <header>
        <a className="brand" href="/">
          夸夸音乐 <span>MusicLearning2026</span>
        </a>
        <span className="tag">从好奇到音乐实验</span>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">听懂一个细节，再亲手改变它</p>
          <h1>这首歌，为什么让我想再听一次？</h1>
          <p className="muted">
            选择歌曲，找到有资料支持的解释，再用一个小实验探索音乐机制。
          </p>
        </section>
        {connection ? (
          <p className="notice" role="status">
            {connection}
          </p>
        ) : null}
        {health && !health.ok ? (
          <p className="notice" role="status">
            研究服务尚未就绪。请确认 Codex 已登录，并能连接 MusicBrainz 服务。
          </p>
        ) : null}
        {health?.model ? (
          <p className="muted">
            研究模型：Codex · {health.model} ·{" "}
            {health.reasoningEffort === "xhigh" ? "极高" : health.reasoningEffort}
          </p>
        ) : null}
        <form className="panel input-panel" onSubmit={search}>
          <label htmlFor="song-query">歌曲链接、歌名或艺人</label>
          <div className="input-row">
            <input
              id="song-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：歌名 + 艺人"
            />
            <button className="primary" disabled={!!busy || !query.trim()}>
              搜索歌曲
            </button>
          </div>
        </form>
        {busy ? (
          <div className="busy" role="status">
            <span>
              {analysisProgress ? <small>研究阶段 · {analysisProgress.operation === "deep_dive" ? "单点深挖" : analysisProgress.stage === "research" ? analysisProgress.round === 2 ? "补检轮" : "首轮" : analysisProgress.stage === "supplement" ? "针对缺口补查" : "分析整理"}</small> : null}
              <strong>{busy}</strong>
            </span>
            {controller.current ? (
              <button onClick={cancel}>取消研究</button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
        {matches.length ? (
          <section className="panel">
            <h2>选择要研究的歌曲</h2>
            <p className="muted">
              找到 {matches.length} 个候选，当前显示 {Math.min(visibleMatches, matches.length)} 个。
              结果来自可访问的平台资料和 iTunes 曲库，可能不包含全部作品。
            </p>
            <div className="song-grid">
              {matches.slice(0, visibleMatches).map((song, index) => (
                <button
                  className="song-choice"
                  key={(song.id || song.title) + index}
                  disabled={!!busy}
                  onClick={() => analyze(song)}
                >
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                  <small>{song.album || song.platform || ""}</small>
                </button>
              ))}
            </div>
            {visibleMatches < matches.length ? (
              <button disabled={!!busy} onClick={() => setVisibleMatches((count) => count + 24)}>
                显示更多歌曲
              </button>
            ) : null}
          </section>
        ) : null}
        {analysis && stored ? (
          <>
            <section className="panel overview">
              <div className="section-top">
                <div>
                  <p className="eyebrow">{analysis.song.artist}</p>
                  <h2>{analysis.song.title}</h2>
                </div>
                <button onClick={exportAnalysis}>导出研究</button>
              </div>
              <p className="muted">
                {analysis.song.versionScope} ·{" "}
                {analysis.song.identityStatus === "resolved"
                  ? "版本已确定"
                  : analysis.song.identityStatus === "ambiguous"
                    ? "存在多个候选版本"
                    : "版本尚未核实"}
              </p>
              {!stored.persistent ? (
                <p className="notice">
                  当前为临时保存，服务重启后记录会清除。需要保留时请导出。
                </p>
              ) : null}
              {analysis.userPerception ? (
                <p className="user-perception">
                  你的问题：{analysis.userPerception}
                </p>
              ) : null}
              {analysis.overallVibe.hook.text ? <p className="overview-hook preserve-lines">{analysis.overallVibe.hook.text}</p> : null}
              {availableModes.length ? <div
                className="mode-tabs"
                role="group"
                aria-label="三种整首歌概括"
              >
                {availableModes.map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={mode === key}
                    onClick={() => setMode(key as keyof typeof modes)}
                  >
                    {label}
                  </button>
                ))}
              </div> : null}
              {["emo", "hype", "pro"].filter((key) => failedCopyIds.has(key)).map((key) => <p className="notice" key={key}>{modes[key as keyof typeof modes]}版概括本轮未完成，其他通过审核的内容已保留。</p>)}
              {displayMode ? <p className="vibe preserve-lines">{analysis.overallVibe[displayMode].text}</p> : null}
              {analysis.completionStatus !== "complete" ? <p className="muted">本次分析为{analysis.completionStatus === "partial" ? "部分完成" : "资料不足"}；未覆盖维度会单独标明，不会用概括替代分析。</p> : null}
              {analysis.song.identityStatus === "ambiguous" ? (
                <div className="version-options">
                  <p>请选择版本，再继续歌曲专属分析：</p>
                  {analysis.song.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      disabled={!!busy}
                      onClick={() =>
                        analyze({
                          title: candidate.title,
                          artist: candidate.artist,
                          selectedVersion:
                            candidate.recordingId || candidate.id,
                        })
                      }
                    >
                      {candidate.versionScope} · {candidate.reason}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
            <section className="core-grid" aria-label="四个核心音乐维度">
              {analysis.coverage.map((entry) => {
                const linked = analysis.modules.filter((item) => entry.moduleIds.includes(item.id));
                return <article className="panel core-dimension" key={entry.category}>
                  <div className="section-top"><h2>{coreLabels[entry.category]}</h2><span className="tag">{entry.status === "analyzed" ? "已有解读" : entry.status === "guidance_only" ? "听歌指导" : "资料不足"}</span></div>
                  {entry.status === "analyzed" ? linked.map((item) => <section className="analysis-module" key={item.id}>
                    <h3>{item.title || "音乐特点"}</h3>
                    {item.summary ? <p className="module-summary">{item.summary}</p> : null}
                    {item.explanation ? <p className="module-explanation preserve-lines">{item.explanation}</p> : null}
                    {item.listeningCues.length ? <div className="listening-cues"><h4>怎么听</h4><ul>{item.listeningCues.map((cue, index) => <li key={index}>{cue.scope === "general" ? <span className="tag">通用听歌线索</span> : cue.scope === "source_version" ? <span className="tag">来源版本听歌线索</span> : null} {cue.text}</li>)}</ul></div> : null}
                    {["title", "summary", "explanation", "cue", "cue_set"].some((kind) => failedCopyIds.has(`module:${encodeURIComponent(item.id)}:${kind}`) || (kind === "cue" && [...failedCopyIds].some((id) => id.startsWith(`module:${encodeURIComponent(item.id)}:cue:`)))) ? <p className="muted">部分模块文案或听歌线索未通过审核，失败项已单独留空；其余合格内容仍保留。</p> : null}
                    <div className="claim-scopes">{[...new Set(item.claims.map((claim) => claim.scope.level))].map((scope) => <span className="tag" key={scope}>{scopeLabels[scope]}</span>)}</div>
                    <details className="module-evidence"><summary>依据与限制</summary><ClaimList claims={item.claims} sources={analysis.sources} /><Notes title="仍待确认" values={item.unknowns} /></details>
                    <button className="primary" disabled={!!busy || !item.expandable} onClick={() => expand(item.id)}>深入理解这个细节</button>
                  </section>) : entry.status === "guidance_only" ? <div className="guidance-only"><p className="tag">通用听歌练习 · 不计作歌曲分析</p><p>{coreGuidance[entry.category]}</p></div> : <p className="muted">当前资料未覆盖这个维度。通用听歌练习也无法替代针对这首歌的证据。</p>}
                </article>;
              })}
            </section>
            {analysis.modules.some((item) => !(["culture", "harmony", "rhythm", "timbre"] as string[]).includes(item.category)) ? <section className="module-grid secondary-modules" aria-label="其他分析模块">
              {analysis.modules.filter((item) => !(["culture", "harmony", "rhythm", "timbre"] as string[]).includes(item.category)).map((item) => <section className="panel analysis-module" key={item.id}>
                <p className="eyebrow">{categories[item.category]}</p><h2>{item.title || categories[item.category]}</h2>
                {item.summary ? <p className="module-summary">{item.summary}</p> : null}
                {item.explanation ? <p className="module-explanation preserve-lines">{item.explanation}</p> : null}
                {item.listeningCues.length ? <div><h3>怎么听</h3><ul>{item.listeningCues.map((cue, index) => <li key={index}>{cue.scope === "source_version" ? <span className="tag">来源版本听歌线索</span> : cue.scope === "general" ? <span className="tag">通用听歌线索</span> : null} {cue.text}</li>)}</ul></div> : null}
                {["title", "summary", "explanation", "cue", "cue_set"].some((kind) => failedCopyIds.has(`module:${encodeURIComponent(item.id)}:${kind}`) || (kind === "cue" && [...failedCopyIds].some((id) => id.startsWith(`module:${encodeURIComponent(item.id)}:cue:`)))) ? <p className="muted">部分模块文案或听歌线索未通过审核，失败项已单独留空；其余合格内容仍保留。</p> : null}
                <details><summary>依据与限制</summary><ClaimList claims={item.claims} sources={analysis.sources} /><Notes title="仍待确认" values={item.unknowns} /></details>
                <button className="primary" disabled={!!busy || !item.expandable} onClick={() => expand(item.id)}>深入理解这个细节</button>
              </section>)}
            </section> : null}
            <form
              className="panel"
              onSubmit={(event) => {
                event.preventDefault();
                expand("question", question);
              }}
            >
              <label htmlFor="explore-question">继续探索一个具体问题</label>
              <div className="input-row">
                <input
                  id="explore-question"
                  value={question}
                  maxLength={1200}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="例如：音区升高为什么可能显得更开阔？"
                />
                <button disabled={!!busy || !question.trim()}>
                  探索这个问题
                </button>
              </div>
              <p className="muted">
                没有原曲依据的机制会标为通用理论或教学演示。
              </p>
            </form>
            {savedPackage?.deepDives.length ? (
              <details className="panel">
                <summary>
                  已保存的深入研究（{savedPackage.deepDives.length}）
                </summary>
                {savedPackage.deepDives.map((value) => (
                  <button
                    className="history-item"
                    key={value.deepDiveId}
                    onClick={() => setDive(value)}
                  >
                    {value.deepDive.title} · {value.question || "分析点深挖"}
                  </button>
                ))}
              </details>
            ) : null}
            {dive ? (
              <section className="panel deep-dive">
                <p className="eyebrow">围绕一个问题深入理解</p>
                <h2>{dive.deepDive.title}</h2>
                <ClaimList
                  claims={dive.deepDive.claims}
                  sources={dive.deepDive.sources}
                />
                <Notes title="资料中的冲突" values={dive.deepDive.conflicts} />
                <Notes title="仍然未知" values={dive.deepDive.unknowns} />
                {dive.deepDive.listeningCues.length ? (
                  <div>
                    <h3>下次怎么听</h3>
                    <ul>
                      {dive.deepDive.listeningCues.map((cue, index) => (
                        <li key={index}>
                          {cue.scope === "general" ? "通用聆听练习：" : cue.scope === "source_version" ? "来源版本聆听线索：" : ""}
                          {cue.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!dive.deepDive.studio.eligible ? (
                  <p className="muted">{dive.deepDive.studio.reason}</p>
                ) : null}
              </section>
            ) : null}
            {dive?.deepDive.studio.eligible && dive.deepDive.studio.seed ? (
              <StudioPanel
                key={dive.deepDiveId}
                saved={dive}
                initialSession={
                  savedPackage?.studioSessions.find(
                    (value) => value.deepDiveId === dive.deepDiveId,
                  )?.session
                }
                onSaved={(session) =>
                  setSavedPackage((previous) =>
                    previous
                      ? {
                          ...previous,
                          studioSessions: [
                            ...previous.studioSessions.filter(
                              (value) => value.session.id !== session.id,
                            ),
                            { deepDiveId: dive.deepDiveId, session },
                          ],
                        }
                      : previous,
                  )
                }
              />
            ) : null}
            <Notes title="当前研究的未知部分" values={analysis.unknowns} />
            <SourcesPanel
              sources={
                dive?.deepDive.sources ||
                savedPackage?.sources ||
                analysis.sources
              }
            />
          </>
        ) : null}
        {history.length ? (
          <details className="panel history">
            <summary>继续之前的研究（{history.length}）</summary>
            {history.slice(0, 30).map((item) => (
              <button
                className="history-item"
                key={item.analysisId}
                disabled={!!busy}
                onClick={() => restore(item.analysisId)}
              >
                <strong>
                  {item.song.title} — {item.song.artist}
                </strong>
                <span>
                  {new Date(item.updatedAt).toLocaleString("zh-CN")} ·{" "}
                  {item.deepDiveCount} 次深入研究
                </span>
              </button>
            ))}
          </details>
        ) : null}
        {selected && !busy ? (
          <button onClick={() => analyze(selected)}>
            重新研究 {selected.title}
          </button>
        ) : null}
      </main>
      <footer>
        <p>每个判断都应能追溯；每个实验都应能说明它改变了什么。</p>
        <p>
          <a href="/LICENSE" target="_blank" rel="noreferrer">
            AGPL-3.0-or-later
          </a>
          {" · "}
          <a
            href={"https://github.com/Xmemo/KuaKuaMusic/tree/" +
              (import.meta.env.VITE_SOURCE_REVISION || "arch/music-learning-2026-v1-2026-09-28")}
            target="_blank"
            rel="noreferrer"
          >
            对应源码
          </a>
          {" · "}
          <a href="/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">
            第三方声明
          </a>
        </p>
      </footer>
    </div>
  );
}
const V2App =
  import.meta.env.VITE_MUSIC_V2_ENABLED === "1"
    ? React.lazy(() => import("./V2App"))
    : null;
const LegacyApp =
  import.meta.env.VITE_ENABLE_LEGACY_UI === "1"
    ? React.lazy(() => import("./LegacyApp"))
    : null;
export default function App() {
  if (V2App)
    return (
      <React.Suspense fallback={<p>正在加载 Audio-first v2</p>}>
        <V2App />
      </React.Suspense>
    );
  if (LegacyApp && new URLSearchParams(location.search).get("legacy") === "1")
    return (
      <React.Suspense fallback={<p>正在加载旧版页面</p>}>
        <LegacyApp />
      </React.Suspense>
    );
  return <MusicLearningApp />;
}
