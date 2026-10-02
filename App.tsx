import React, { useEffect, useRef, useState } from "react";
import { searchSongs } from "./services/musicService";
import {
  analyzeSongWithEvidence,
  deepDiveAnalysisItem,
  getMusicLearningAgentHealth,
  listSavedAnalyses,
  loadSavedAnalysis,
} from "./services/musicLearningService";
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
function MusicLearningApp() {
  const [query, setQuery] = useState(""),
    [perception, setPerception] = useState("");
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
    [error, setError] = useState(""),
    [connection, setConnection] = useState("");
  const controller = useRef<AbortController | null>(null),
    ticket = useRef(0);
  const analysis = stored?.analysis;
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
    setBusy("正在读取资料并整理解释，可能需要几分钟");
    setError("");
    try {
      const value = await analyzeSongWithEvidence(
        song,
        perception,
        controller.current.signal,
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
      if (currentTicket === ticket.current) setBusy("");
    }
  }
  async function expand(id: string, followup = "") {
    if (!stored || busy) return;
    controller.current = new AbortController();
    const currentTicket = ++ticket.current;
    setBusy("正在围绕这个问题深入研究");
    setError("");
    try {
      const value = await deepDiveAnalysisItem(
        stored.analysisId,
        id,
        followup,
        controller.current.signal,
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
      if (currentTicket === ticket.current) setBusy("");
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
      setPerception(pkg.analysis.userPerception || "");
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
          <label htmlFor="perception">你想理解哪个细节？（可选）</label>
          <textarea
            id="perception"
            rows={2}
            maxLength={1200}
            value={perception}
            onChange={(event) => setPerception(event.target.value)}
            placeholder="例如：副歌为什么突然感觉开阔？"
          />
        </form>
        {busy ? (
          <div className="busy" role="status">
            <span>{busy}</span>
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
              <p className="preserve-lines">{analysis.overallVibe.hook.text}</p>
              <div
                className="mode-tabs"
                role="group"
                aria-label="整首歌总体观感"
              >
                {Object.entries(modes).map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={mode === key}
                    onClick={() => setMode(key as keyof typeof modes)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="vibe preserve-lines">
                {analysis.overallVibe[mode].text}
              </p>
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
            <div className="module-grid">
              {analysis.modules.map((item) => (
                <section className="panel analysis-module" key={item.id}>
                  <p className="eyebrow">{categories[item.category]}</p>
                  <h2>{item.title}</h2>
                  <ClaimList claims={item.claims} sources={analysis.sources} />
                  <Notes title="这个分析点的未知部分" values={item.unknowns} />
                  <button
                    className="primary"
                    disabled={!!busy || !item.expandable}
                    onClick={() => expand(item.id)}
                  >
                    深入理解这个细节
                  </button>
                </section>
              ))}
            </div>
            {!analysis.modules.length ? (
              <section className="panel">
                <h2>暂时没有足够资料形成歌曲专属分析</h2>
                <p>
                  你仍可以提出一个音乐问题，用清楚标注的通用解释和教学实验继续探索。
                </p>
              </section>
            ) : null}
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
                          {cue.scope === "general" ? "通用聆听练习：" : ""}
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
        {selected && !stored && !busy ? (
          <button onClick={() => analyze(selected)}>
            重新研究 {selected.title}
          </button>
        ) : null}
      </main>
      <footer>每个判断都应能追溯；每个实验都应能说明它改变了什么。</footer>
    </div>
  );
}
const LegacyApp =
  import.meta.env.VITE_ENABLE_LEGACY_UI === "1"
    ? React.lazy(() => import("./LegacyApp"))
    : null;
export default function App() {
  if (LegacyApp && new URLSearchParams(location.search).get("legacy") === "1")
    return (
      <React.Suspense fallback={<p>正在加载旧版页面</p>}>
        <LegacyApp />
      </React.Suspense>
    );
  return <MusicLearningApp />;
}
