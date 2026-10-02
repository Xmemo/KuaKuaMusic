// App-authored deterministic synthesized percussion. No recording, sample
// downloads, or third-party sample corpus is used by the default sound bank.
export function registerDefaultSounds(audio: any, context: AudioContext) {
  const drums = {
    bd: [0.3, 0.8],
    sd: [0.18, 0.35],
    hh: [0.065, 0.18],
    oh: [0.24, 0.15],
    cp: [0.13, 0.25],
  };
  for (const [name, [length, level]] of Object.entries(drums)) {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * length),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let random = 123456789,
      previous = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate;
      random = (1664525 * random + 1013904223) >>> 0;
      const noise = random / 2147483648 - 1;
      const high = noise - previous;
      previous = noise;
      const envelope =
        Math.exp(-t / (length / 5)) *
        Math.min(t / 0.002, 1) *
        Math.max(0, 1 - t / length);
      data[i] =
        level *
        envelope *
        (name === "bd"
          ? Math.sin(
              2 * Math.PI * (48 * t + 85 * 0.025 * (1 - Math.exp(-t / 0.025))),
            )
          : name === "sd"
            ? noise * 0.75 + Math.sin(2 * Math.PI * 180 * t) * 0.25
            : high * 0.5);
    }
    audio.registerSound(
      name,
      (time: number, _value: unknown, ended: () => void) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.onended = ended;
        source.start(time);
        source.stop(time + length);
        return { node: source, stop: (end: number) => source.stop(end) };
      },
      { type: "synth", prebake: true },
    );
  }
}
