import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import * as audio from "@strudel/webaudio";
import * as draw from "@strudel/draw";
import { transpiler } from "@strudel/transpiler";
import type { PlaybackState, VisualHint } from "../music-learning/types";
import type { StrudelStudioAdapter } from "./strudelStudio";
import { registerDefaultSounds } from "./defaultSounds";
import {
  validateStudioCode,
  validateRuntimePlayback,
} from "./runtimePolicy.mjs";
import {
  STRUDEL_RUNTIME_VERSION,
  STRUDEL_SOUND_BANK,
} from "./runtimeConfig.mjs";

export interface StudioRuntime extends StrudelStudioAdapter {
  setVolume(value: number): void;
}

export async function createStrudelRuntime(
  canvas: HTMLCanvasElement,
  context: AudioContext,
  hints: VisualHint[],
  onError: (error: Error) => void,
): Promise<StudioRuntime> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器未能创建可视化画布。");
  mini.miniAllStrings();
  await core.evalScope(core, mini, tonal, audio);
  audio.setAudioContext(context);
  audio.setSuperdoughAudioController(null);
  audio.registerSynthSounds();
  registerDefaultSounds(audio, context);
  let code = "",
    playback: PlaybackState,
    epoch = 0,
    disposed = false,
    volume = 0.5;
  const drawer = new draw.Drawer(
    (haps: any[], time: number, _drawer: any, painters: any[]) => {
      for (const painter of painters) painter(ctx, time, haps, [-0.5, 0.5]);
    },
    [-0.5, 0.5],
  );
  // Render Strudel's native inline methods into the app-owned canvas.
  const options = {
    ctx,
    active: "#ffd87b",
    inactive: "#9675dc",
    background: "#100e19",
    playheadColor: "#ffffff",
    labels: true,
    cycles: 1,
    fill: true,
    fillActive: true,
    autorange: true,
  };
  for (const name of [
    "pianoroll",
    "punchcard",
    "spiral",
    "scope",
    "spectrum",
    "pitchwheel",
  ])
    core.Pattern.prototype[`_${name}`] = function (config = {}) {
      return this[name]({ ...options, ...config, ctx });
    };
  const repl = audio.webaudioRepl({
    audioContext: context,
    transpiler,
    defaultOutput: async (...args: any[]) => {
      const request = epoch;
      try {
        await audio.webaudioOutput(...args);
      } catch (error) {
        if (!disposed && request === epoch) {
          ++epoch;
          mute();
          onError(error as Error);
        }
      }
    },
  });
  const mute = () => {
    repl.stop();
    drawer.stop();
    // Upstream cleanupDraw looks up #test-canvas even when clearing is false.
    // During React unmount keep our detached canvas available for that synchronous
    // cleanup, so Strudel does not create an orphaned full-window fallback canvas.
    const detached = !canvas.isConnected;
    if (detached && !document.getElementById("test-canvas"))
      document.body.append(canvas);
    try {
      draw.cleanupDraw(false);
    } finally {
      if (detached) canvas.remove();
    }
    if (context.state === "closed") return;
    audio.resetGlobalEffects();
    audio.getSuperdoughAudioController().output.destinationGain.gain.value = 0;
  };
  const setVolume = (value: number) => {
    volume = Math.min(1, Math.max(0, value));
    if (repl.state.started)
      audio
        .getSuperdoughAudioController()
        .output.destinationGain.gain.setTargetAtTime(
          volume * 0.6,
          context.currentTime,
          0.015,
        );
  };
  return {
    getPattern: () => code,
    async setPattern(next) {
      validateStudioCode(next);
      code = next;
    },
    async setPlayback(next) {
      validateRuntimePlayback(next);
      if (
        !["unbound", STRUDEL_RUNTIME_VERSION].includes(next.runtimeVersion) ||
        !["default", STRUDEL_SOUND_BANK].includes(next.soundBank)
      )
        throw new Error(
          "此实验指定了其他运行时或音源，请导出后使用匹配的环境播放。",
        );
      playback = { ...next };
    },
    async validate(next) {
      try {
        validateStudioCode(next);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    },
    setVolume,
    async play() {
      if (disposed) throw new Error("播放器已关闭。");
      const request = ++epoch;
      mute();
      validateStudioCode(code);
      validateRuntimePlayback(playback);
      await context.resume();
      await audio.initAudio({ maxPolyphony: 32 });
      if (request !== epoch || disposed) return;
      if (context.state !== "running")
        throw new Error("浏览器暂停了音频，请再次点击播放。");
      repl.setCps(playback.bpm / playback.beatsPerCycle / 60);
      const pattern = await repl.evaluate(code, false);
      if (request !== epoch || disposed) {
        mute();
        return;
      }
      try {
        if (repl.state.error || !core.isPattern(pattern))
          throw repl.state.error || new Error("代码未生成可播放的乐句。");
        const events = pattern.queryArc(0, 1);
        if (events.length > 256)
          throw new Error("每循环事件过多，请减少密度后重试。");
        for (const event of events) {
          const sound = event.value?.s || "sine";
          if (!audio.soundMap.get()[sound] || event.value?.bank)
            throw new Error(
              `音源 ${sound} 尚未提供；请使用内置 bd、sd、hh、oh、cp 或 sine、triangle、sawtooth、square。`,
            );
        }
        if (
          !/\.?_?(pianoroll|punchcard|spiral|scope|spectrum|pitchwheel)\s*\(/.test(
            code,
          )
        ) {
          const hint = hints[0] || "punchcard";
          await repl.setPattern(pattern[`_${hint}`](), false);
        }
        audio.getSuperdoughAudioController().output.destinationGain.gain.value =
          volume * 0.6;
        await repl.start();
        if (request !== epoch || disposed) {
          mute();
          return;
        }
        drawer.start(repl.scheduler);
      } catch (error) {
        mute();
        throw error;
      }
    },
    async stop() {
      ++epoch;
      mute();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      ++epoch;
      mute();
      if (context.state !== "closed") await context.close();
    },
  };
}
