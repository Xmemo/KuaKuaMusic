import React, { useEffect, useRef, useState } from "react";
import type { StoredDeepDive } from "../music-learning/types";
import {
  proposeStudioEdit,
  saveStudioSession,
} from "../services/musicLearningService";
import {
  applyStudioProposal,
  createStudioSession,
  currentStudioRevision,
  previewStudioDiff,
  proposeStudioChange,
  redoStudio,
  resetStudioToSeed,
  strudelExport,
  undoStudio,
  type StudioProposal,
  type StudioSession,
} from "../studio/strudelStudio";
function download(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function StudioPanel({
  saved,
  initialSession,
  onSaved,
}: {
  saved: StoredDeepDive;
  initialSession?: StudioSession;
  onSaved?: (session: StudioSession) => void;
}) {
  const seed = saved.deepDive.studio.seed!;
  const [session, setSession] = useState(
    () =>
      initialSession ||
      createStudioSession(saved.deepDive.analysisItemId, seed),
  );
  const current = currentStudioRevision(session);
  const [code, setCode] = useState(current.code),
    [bpm, setBpm] = useState(current.playback.bpm),
    [beats, setBeats] = useState(current.playback.beatsPerCycle);
  const [proposal, setProposal] = useState<StudioProposal | null>(null),
    [question, setQuestion] = useState("");
  const [proposalOrigin, setProposalOrigin] = useState<"manual" | "suggestion">(
    "manual",
  );
  const [notice, setNotice] = useState(""),
    [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const dirty =
    code !== current.code ||
    bpm !== current.playback.bpm ||
    beats !== current.playback.beatsPerCycle;
  const change = (next: StudioSession) => {
    setSession(next);
    const revision = currentStudioRevision(next);
    setCode(revision.code);
    setBpm(revision.playback.bpm);
    setBeats(revision.playback.beatsPerCycle);
    setNotice("当前修改尚未保存");
  };
  const preview = () => {
    setProposalOrigin("manual");
    setProposal(
      proposeStudioChange(
        session,
        code,
        { ...current.playback, bpm, beatsPerCycle: beats },
        "手动编辑",
      ),
    );
    setNotice("");
  };
  const draftChanged =
    !!proposal &&
    (proposalOrigin === "suggestion"
      ? dirty
      : proposal.code !== code ||
        proposal.playback.bpm !== bpm ||
        proposal.playback.beatsPerCycle !== beats);
  const apply = () => {
    if (!proposal || draftChanged) return;
    try {
      change(applyStudioProposal(session, proposal));
      setProposal(null);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const save = async () => {
    setPending(true);
    try {
      const value = await saveStudioSession(
        saved.analysisId,
        saved.deepDiveId,
        session,
      );
      setSession((previous) => ({
        ...previous,
        saveVersion: value.saveVersion,
      }));
      onSaved?.(value);
      setNotice("提交的实验与版本历史已保存");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(false);
    }
  };
  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!question.trim() || dirty || pending) return;
    setPending(true);
    setNotice("");
    controller.current = new AbortController();
    try {
      const savedSession = await saveStudioSession(
        saved.analysisId,
        saved.deepDiveId,
        session,
      );
      setSession((previous) => ({
        ...previous,
        saveVersion: savedSession.saveVersion,
      }));
      onSaved?.(savedSession);
      const result = await proposeStudioEdit(
        saved.analysisId,
        saved.deepDiveId,
        session.id,
        current.id,
        question,
        controller.current.signal,
      );
      setProposalOrigin("suggestion");
      setProposal(result);
    } catch (error) {
      setNotice(
        (error as Error).name === "AbortError"
          ? "建议请求已取消"
          : (error as Error).message,
      );
    } finally {
      setPending(false);
    }
  };
  const diff = proposal ? previewStudioDiff(session, proposal) : null;
  const sourceLabel =
    current.sourceType === "source_transcription"
      ? "有谱例依据的转录"
      : current.sourceType === "learning_reconstruction"
        ? "教学演示"
        : "用户版本";
  return (
    <section className="panel studio" aria-label="音乐实验">
      <div className="section-top">
        <h2>Studio · {sourceLabel}</h2>
        <span className="tag">
          第 {session.revisionIndex + 1} / {session.revisions.length} 个版本
        </span>
      </div>
      <p>{session.experiment.question}</p>
      <div className="experiment-grid">
        <div>
          <strong>只改变</strong>
          <p>{session.experiment.variable}</p>
        </div>
        <div>
          <strong>保持一致</strong>
          <p>{session.experiment.constants.join("、")}</p>
        </div>
      </div>
      <p>
        <strong>A：</strong>
        {session.experiment.baseline}　<strong>B：</strong>
        {session.experiment.changed}
      </p>
      <p>
        <strong>听哪里：</strong>
        {session.experiment.listenFor.join("；")}
      </p>
      <p className="notice">{session.experiment.limitation}</p>
      <label htmlFor="pattern">实验代码</label>
      <textarea
        id="pattern"
        className="code-editor"
        spellCheck={false}
        value={code}
        maxLength={16000}
        onChange={(event) => setCode(event.target.value)}
        rows={9}
      />
      <div className="playback-controls">
        <label>
          速度（BPM）
          <input
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={(event) => setBpm(Number(event.target.value))}
          />
        </label>
        <label>
          每循环拍数
          <input
            type="number"
            min={0.25}
            max={32}
            step={0.25}
            value={beats}
            onChange={(event) => setBeats(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="actions">
        <button onClick={preview} disabled={!dirty}>
          预览修改
        </button>
        <button
          disabled={dirty}
          onClick={() => {
            setProposalOrigin("suggestion");
            setProposal(
              proposeStudioChange(
                session,
                session.alternativeCode,
                undefined,
                "对比版本 B",
              ),
            );
            setNotice("");
          }}
        >
          预览 B 版本
        </button>
        <button
          onClick={() => change(undoStudio(session))}
          disabled={session.revisionIndex === 0}
        >
          撤销
        </button>
        <button
          onClick={() => change(redoStudio(session))}
          disabled={session.revisionIndex === session.revisions.length - 1}
        >
          重做
        </button>
        <button onClick={() => change(resetStudioToSeed(session))}>
          回到 A 版本
        </button>
        <button onClick={save} disabled={pending || dirty}>
          保存实验
        </button>
      </div>
      {proposal && diff ? (
        <div className="proposal">
          <h3>修改预览</h3>
          <p>{proposal.explanation}</p>
          <p className="muted">
            速度：{diff.before.playback.bpm} → {diff.after.playback.bpm}{" "}
            BPM；每循环拍数：{diff.before.playback.beatsPerCycle} →{" "}
            {diff.after.playback.beatsPerCycle}
          </p>
          <div className="diff-grid">
            <pre aria-label="修改前代码">{diff.before.code}</pre>
            <pre aria-label="修改后代码">{diff.after.code}</pre>
          </div>
          {draftChanged ? (
            <p role="alert">草稿已变化，请重新预览修改。</p>
          ) : null}
          {diff.stale ? (
            <p role="alert">当前版本已改变，此建议已过期。</p>
          ) : null}
          <div className="actions">
            <button
              className="primary"
              onClick={apply}
              disabled={diff.stale || draftChanged}
            >
              应用这次修改
            </button>
            <button onClick={() => setProposal(null)}>放弃建议</button>
          </div>
        </div>
      ) : null}
      <form onSubmit={ask}>
        <label htmlFor="studio-question">希望怎样调整这个实验？</label>
        <div className="input-row">
          <input
            id="studio-question"
            value={question}
            maxLength={1200}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：只把踩镲变得更密"
          />
          <button type="submit" disabled={pending || dirty || !question.trim()}>
            请求建议
          </button>
          {pending ? (
            <button type="button" onClick={() => controller.current?.abort()}>
              取消请求
            </button>
          ) : null}
        </div>
      </form>
      {dirty ? (
        <p className="muted">请先预览并应用当前草稿，再保存或请求建议。</p>
      ) : null}
      <div className="runtime-boundary">
        <p>当前版本支持编辑、比较和保存。内置播放待 Strudel 许可决定后接入。</p>
        <button
          onClick={() =>
            download("music-learning-pattern.js", strudelExport(current))
          }
        >
          导出当前 Strudel 代码
        </button>
        <p className="muted">
          将导出的代码粘贴到{" "}
          <a
            href="https://strudel.cc/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Strudel 官方编辑器 ↗
          </a>{" "}
          可试听。两个版本使用相同的速度与音源条件比较。
        </p>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
    </section>
  );
}
