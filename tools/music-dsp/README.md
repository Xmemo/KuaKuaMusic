# Music DSP — P0 Acoustic Metrics

`audio_metrics.py` is the only DSP program that the v4 Acoustic Analyst is allowed to execute during a normal run.

## Dependencies

- Python 3 standard library
- ffmpeg
- ffprobe

No numpy/librosa/scipy dependency is required.

## Run

```bash
python3 tools/music-dsp/audio_metrics.py \
  --input "/path/to/audio.mp3" \
  --output "/path/to/run/dsp.json"
```

## Self-test

```bash
python3 tools/music-dsp/audio_metrics.py --self-test
```

## What it measures

- duration / native stream metadata;
- Integrated LUFS;
- Loudness Range;
- True Peak;
- decoded PCM fixed-window RMS dBFS;
- deterministic RMS step-change candidates.

## What it does not measure

- BPM;
- key;
- chords;
- form;
- transcription;
- semantic section labels.

Those require estimator-specific benchmark decisions and are intentionally out of P0.

## Important

The tool decodes the recording to PCM before local RMS analysis.

Never replace this with MP3 frame `global_gain`, quantizer, bitrate, or other codec metadata as a loudness/energy estimator.
