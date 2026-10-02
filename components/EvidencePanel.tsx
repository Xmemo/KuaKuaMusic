import React from "react";
import type { EvidenceClaim, EvidenceSource } from "../music-learning/types";
const labels = {
  external_evidence: "来源中的事实",
  user_perception: "你的听感",
  ai_interpretation: "解释与推断",
  general_theory: "通用音乐原理",
  unknown: "尚未确认",
};
export function ClaimList({
  claims,
  sources,
}: {
  claims: EvidenceClaim[];
  sources: EvidenceSource[];
}) {
  const excerpts = new Map(
    sources.flatMap((source) =>
      source.excerpts.map(
        (excerpt) => [excerpt.id, { source, excerpt }] as const,
      ),
    ),
  );
  return (
    <div className="claim-list">
      {claims.map((claim) => (
        <article key={claim.id} className="claim">
          <span className={"tag kind-" + claim.kind}>{labels[claim.kind]}</span>
          <p className="preserve-lines">{claim.text}</p>
          {claim.reasoningNote ? (
            <p className="muted">{claim.reasoningNote}</p>
          ) : null}
          {claim.evidenceIds.length ? (
            <details>
              <summary>查看支撑片段（{claim.evidenceIds.length}）</summary>
              {claim.evidenceIds.map((id) => {
                const value = excerpts.get(id);
                return value ? (
                  <blockquote key={id}>
                    <p>{value.excerpt.text}</p>
                    <a
                      href={value.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {value.source.title} ↗
                    </a>
                    <div className="muted">
                      {value.excerpt.locator} · 适用范围：
                      {value.source.versionScope}
                    </div>
                  </blockquote>
                ) : (
                  <p key={id}>该片段暂不可读取。</p>
                );
              })}
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}
export function SourcesPanel({ sources }: { sources: EvidenceSource[] }) {
  return (
    <details className="sources panel">
      <summary>研究资料（{sources.length}）</summary>
      <p className="muted">
        引用片段已在读取的资料中定位；它是否充分支持判断，仍可逐条复核。
      </p>
      {sources.map((source) => (
        <article key={source.id}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.title} ↗
          </a>
          <p className="muted">
            {source.author || source.publisher || "作者未标注"} ·{" "}
            {source.versionScope} · 读取于{" "}
            {new Date(source.retrievedAt).toLocaleDateString("zh-CN")}
          </p>
          {source.excerpts.map((excerpt) => (
            <blockquote key={excerpt.id}>
              <p>{excerpt.text}</p>
              <div className="muted">{excerpt.locator}</div>
            </blockquote>
          ))}
        </article>
      ))}
    </details>
  );
}
export function Notes({ title, values }: { title: string; values: string[] }) {
  return values.length ? (
    <details className="notes">
      <summary>
        {title}（{values.length}）
      </summary>
      <ul>
        {values.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    </details>
  ) : null;
}
