import React, { useEffect, useRef, useState } from "react";
import type { PlaybackState, VisualHint } from "../music-learning/types";
import type { StudioRuntime } from "../studio/strudelRuntime";
import {
  validateRuntimePlayback,
  validateStudioCode,
} from "../studio/runtimePolicy.mjs";
import {
  STRUDEL_COPYRIGHT,
  STRUDEL_RUNTIME_VERSION,
} from "../studio/runtimeConfig.mjs";

export default function StudioPlayer({
  code,
  baseline,
  alternative,
  playback,
  hints,
}: {
  code: string;
  baseline: string;
  alternative: string;
  playback: PlaybackState;
  hints: VisualHint[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    player = useRef<StudioRuntime>(null),
    context = useRef<AudioContext>(null);
  const generation = useRef(0),
    mounted = useRef(true);
  const [loading, setLoading] = useState(false),
    [playing, setPlaying] = useState("");
  const [error, setError] = useState(""),
    [volume, setVolume] = useState(50),
    [tempo, setTempo] = useState("");
  useEffect(() => {
    mounted.current = true;
    const resizeCanvas = () => {
      if (!canvas.current) return;
      const size = canvas.current.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.current.width = Math.max(1, Math.round(size.width * scale));
      canvas.current.height = Math.max(1, Math.round(size.height * scale));
    };
    resizeCanvas();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(resizeCanvas)
        : null;
    if (canvas.current) observer?.observe(canvas.current);
    return () => {
      observer?.disconnect();
      mounted.current = false;
      ++generation.current;
      if (player.current) void player.current.dispose();
      else if (context.current?.state !== "closed")
        void context.current?.close();
    };
  }, []);
  const stop = async () => {
    ++generation.current;
    await player.current?.stop();
    if (mounted.current) setPlaying("");
  };
  const play = async (next: string, label: string) => {
    const request = ++generation.current;
    setError("");
    try {
      validateStudioCode(next);
      validateRuntimePlayback(playback);
      context.current ||= new AudioContext();
      void context.current.resume();
      setLoading(true);
      setPlaying("");
      if (!player.current) {
        const { createStrudelRuntime } = await import(
          "../studio/strudelRuntime"
        );
        if (request !== generation.current || !mounted.current) return;
        const created = await createStrudelRuntime(
          canvas.current!,
          context.current,
          hints,
          (cause) => {
            if (!mounted.current) return;
            ++generation.current;
            setPlaying("");
            setError(`音频播放失败：${cause.message}`);
          },
        );
        if (request !== generation.current || !mounted.current) {
          await created.dispose();
          context.current = null;
          return;
        }
        player.current = created;
      }
      await player.current.stop();
      await player.current.setPattern(next);
      await player.current.setPlayback(playback);
      player.current.setVolume(volume / 100);
      if (request !== generation.current || !mounted.current) return;
      await player.current.play();
      if (request !== generation.current || !mounted.current) return;
      setPlaying(label);
      setTempo(`${playback.bpm} BPM · ${playback.beatsPerCycle} 拍 / 循环`);
    } catch (cause) {
      await player.current?.stop();
      if (request === generation.current && mounted.current) {
        setPlaying("");
        setError((cause as Error).message || "播放失败，请重试。");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  };
  return (
    <div className="studio-player" aria-label="内置 Strudel 播放器">
      <div className="section-top">
        <div>
          <h3>听听这个实验</h3>
          <p className="muted">
            A / B 使用同一速度与音源。修改代码或速度后，点击播放即可听到新草稿。
          </p>
        </div>
        <span className={`tag ${playing ? "is-playing" : ""}`} role="status">
          {loading
            ? "正在准备音频…"
            : playing
              ? `播放中 · ${playing}`
              : "已停止"}
        </span>
      </div>
      <div className="actions">
        <button
          className="primary"
          onClick={() => play(code, "当前草稿")}
          disabled={loading}
        >
          ▶ 播放当前草稿
        </button>
        <button
          onClick={() => play(baseline, "A 版本")}
          disabled={loading}
          aria-pressed={playing === "A 版本"}
        >
          试听 A
        </button>
        <button
          onClick={() => play(alternative, "B 版本")}
          disabled={loading}
          aria-pressed={playing === "B 版本"}
        >
          试听 B
        </button>
        <button onClick={stop} disabled={!loading && !playing}>
          ■ 停止
        </button>
      </div>
      <div className="player-volume">
        <label htmlFor="studio-volume">音量 {volume}%</label>
        <input
          id="studio-volume"
          type="range"
          min="0"
          max="100"
          value={volume}
          disabled={loading}
          onChange={(event) => {
            const next = Number(event.target.value);
            setVolume(next);
            player.current?.setVolume(next / 100);
          }}
        />
        <span className="muted">
          {playing ? tempo : "点击播放后显示原生节拍 / 音符视图"}
        </span>
      </div>
      <canvas
        id="test-canvas"
        ref={canvas}
        width="1200"
        height="250"
        className="strudel-visual"
        role="img"
        aria-label="Strudel 原生动态乐句视图"
      />
      {error ? <p role="alert">{error}</p> : null}
      <p className="muted player-license">
        教学实验 · 内置合成音源 · Strudel {STRUDEL_RUNTIME_VERSION}
        <br />
        {STRUDEL_COPYRIGHT} ·{" "}
        <a href="/LICENSE" target="_blank" rel="noopener noreferrer">
          AGPL 许可
        </a>{" "}
        ·{" "}
        <a
          href="/BUNDLED_LICENSES.txt"
          target="_blank"
          rel="noopener noreferrer"
        >
          第三方版权声明
        </a>
      </p>
    </div>
  );
}
