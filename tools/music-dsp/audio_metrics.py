#!/usr/bin/env python3
"""Deterministic acoustic metrics for MusicLearning Research Workflow v4.

Dependencies: Python 3 standard library + ffmpeg + ffprobe.

This tool intentionally does NOT estimate tempo, key, chords, stems, or form.
It decodes the actual audio waveform and reports reproducible acoustic metrics:
- duration / native stream metadata via ffprobe
- EBU R128 Integrated Loudness, LRA, True Peak via ffmpeg ebur128
- fixed-window mono PCM RMS dBFS timeline
- deterministic RMS step-change candidates

It never inspects MP3 codec fields such as global_gain as a proxy for waveform energy.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import os
import re
import statistics
import subprocess
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "4.0"
ANALYSIS_SAMPLE_RATE = 48_000
ANALYSIS_CHANNELS = 1
SAMPLE_FORMAT = "f32le"


def run_checked(args: list[str], *, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=text,
    )


def probe_audio(path: Path) -> dict[str, Any]:
    result = run_checked(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=sample_rate,channels:format=duration",
            "-of",
            "json",
            str(path),
        ]
    )
    payload = json.loads(result.stdout)
    streams = payload.get("streams") or []
    stream = streams[0] if streams else {}
    duration_raw = (payload.get("format") or {}).get("duration")
    return {
        "durationSec": float(duration_raw) if duration_raw not in (None, "N/A") else None,
        "nativeSampleRateHz": int(stream["sample_rate"]) if stream.get("sample_rate") else None,
        "channels": int(stream["channels"]) if stream.get("channels") else None,
    }


def parse_ebur128_summary(stderr: str) -> tuple[dict[str, float | None], list[str]]:
    warnings: list[str] = []
    summary = stderr.rsplit("Summary:", 1)[-1] if "Summary:" in stderr else stderr

    def number(pattern: str) -> float | None:
        match = re.search(pattern, summary, flags=re.IGNORECASE)
        return float(match.group(1)) if match else None

    integrated = number(r"\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS")
    lra = number(r"\bLRA:\s*(\d+(?:\.\d+)?)\s*LU")
    peak = number(r"\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS")

    if integrated is None:
        warnings.append("FFmpeg ebur128 summary did not expose Integrated LUFS.")
    if lra is None:
        warnings.append("FFmpeg ebur128 summary did not expose LRA.")
    if peak is None:
        warnings.append("FFmpeg ebur128 summary did not expose True Peak.")

    return {
        "integratedLufs": integrated,
        "loudnessRangeLu": lra,
        "truePeakDbfs": peak,
    }, warnings


def measure_loudness(path: Path) -> tuple[dict[str, float | None], list[str]]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter:a",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "ffmpeg ebur128 failed: " + (result.stderr or "")[-800:]
        )
    return parse_ebur128_summary(result.stderr or "")


def power_to_dbfs(power: float) -> float:
    if power <= 1e-12:
        return -120.0
    return max(-120.0, 10.0 * math.log10(power))


def rms_power(samples: array.array) -> float:
    if not samples:
        return 0.0
    return sum(float(value) * float(value) for value in samples) / len(samples)


def read_exact(stream, target_bytes: int) -> bytes:
    chunks: list[bytes] = []
    remaining = target_bytes
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def decode_rms_timeline(path: Path, window_sec: float) -> tuple[list[dict[str, float]], list[float]]:
    window_samples = max(1, round(ANALYSIS_SAMPLE_RATE * window_sec))
    window_bytes = window_samples * 4

    process = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vn",
            "-ac",
            str(ANALYSIS_CHANNELS),
            "-ar",
            str(ANALYSIS_SAMPLE_RATE),
            "-acodec",
            "pcm_f32le",
            "-f",
            "f32le",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    assert process.stderr is not None

    timeline: list[dict[str, float]] = []
    powers: list[float] = []
    index = 0

    while True:
        raw = read_exact(process.stdout, window_bytes)
        if not raw:
            break
        usable = len(raw) - (len(raw) % 4)
        if usable <= 0:
            break
        samples = array.array("f")
        samples.frombytes(raw[:usable])
        if sys.byteorder != "little":
            samples.byteswap()

        power = rms_power(samples)
        powers.append(power)
        start = index * window_sec
        actual_samples = len(samples)
        actual_duration = actual_samples / ANALYSIS_SAMPLE_RATE
        timeline.append(
            {
                "startSec": round(start, 6),
                "endSec": round(start + actual_duration, 6),
                "rmsDbfs": round(power_to_dbfs(power), 4),
            }
        )
        index += 1
        if len(raw) < window_bytes:
            break

    stderr = process.stderr.read().decode("utf-8", errors="replace")
    code = process.wait()
    if code != 0:
        raise RuntimeError("ffmpeg PCM decode failed: " + stderr[-800:])

    return timeline, powers


def detect_change_points(
    powers: list[float],
    window_sec: float,
    *,
    threshold_db: float,
    context_sec: float,
    min_separation_sec: float = 2.0,
    max_points: int = 12,
) -> list[dict[str, Any]]:
    if len(powers) < 4:
        return []

    context_windows = max(1, round(context_sec / window_sec))
    candidates: list[dict[str, Any]] = []

    for boundary in range(1, len(powers)):
        before_start = max(0, boundary - context_windows)
        after_end = min(len(powers), boundary + context_windows)
        before = powers[before_start:boundary]
        after = powers[boundary:after_end]
        if not before or not after:
            continue

        before_power = statistics.fmean(before)
        after_power = statistics.fmean(after)
        before_db = power_to_dbfs(before_power)
        after_db = power_to_dbfs(after_power)
        delta = after_db - before_db

        if abs(delta) < threshold_db:
            continue

        candidates.append(
            {
                "atSec": boundary * window_sec,
                "beforeRmsDbfs": before_db,
                "afterRmsDbfs": after_db,
                "deltaDb": delta,
                "direction": "rise" if delta > 0 else "fall",
                "contextSec": context_sec,
            }
        )

    selected: list[dict[str, Any]] = []
    for candidate in sorted(candidates, key=lambda item: abs(item["deltaDb"]), reverse=True):
        if any(
            abs(candidate["atSec"] - existing["atSec"]) < min_separation_sec
            for existing in selected
        ):
            continue
        selected.append(candidate)
        if len(selected) >= max_points:
            break

    selected.sort(key=lambda item: item["atSec"])
    for index, item in enumerate(selected, start=1):
        item["id"] = f"rms-change-{index:03d}"
        for key in ("atSec", "beforeRmsDbfs", "afterRmsDbfs", "deltaDb", "contextSec"):
            item[key] = round(float(item[key]), 4)
    return selected


def build_failed(path: Path, window_sec: float, error: str) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "failed",
        "error": error,
        "sourceAudio": {
            "path": str(path.resolve()),
            "durationSec": None,
            "nativeSampleRateHz": None,
            "channels": None,
        },
        "analysisPcm": {
            "sampleRateHz": ANALYSIS_SAMPLE_RATE,
            "channels": ANALYSIS_CHANNELS,
            "sampleFormat": SAMPLE_FORMAT,
            "rmsWindowSec": window_sec,
        },
        "loudness": {
            "integratedLufs": None,
            "loudnessRangeLu": None,
            "truePeakDbfs": None,
            "method": "ffmpeg ebur128=peak=true",
        },
        "rmsTimeline": [],
        "changePoints": [],
        "methods": [],
        "warnings": [],
    }


def extract_metrics(
    path: Path,
    *,
    window_sec: float,
    change_threshold_db: float,
    context_sec: float,
) -> dict[str, Any]:
    metadata = probe_audio(path)
    loudness, loudness_warnings = measure_loudness(path)
    timeline, powers = decode_rms_timeline(path, window_sec)
    change_points = detect_change_points(
        powers,
        window_sec,
        threshold_db=change_threshold_db,
        context_sec=context_sec,
    )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "complete",
        "error": None,
        "sourceAudio": {
            "path": str(path.resolve()),
            **metadata,
        },
        "analysisPcm": {
            "sampleRateHz": ANALYSIS_SAMPLE_RATE,
            "channels": ANALYSIS_CHANNELS,
            "sampleFormat": SAMPLE_FORMAT,
            "rmsWindowSec": window_sec,
        },
        "loudness": {
            **loudness,
            "method": "ffmpeg ebur128=peak=true (EBU R128 loudness / True Peak)",
        },
        "rmsTimeline": timeline,
        "changePoints": change_points,
        "methods": [
            {
                "id": "method-duration-001",
                "kind": "duration_and_stream_metadata",
                "method": "ffprobe audio stream + format metadata",
                "parameters": {},
                "class": "deterministic_acoustic",
            },
            {
                "id": "method-loudness-001",
                "kind": "integrated_loudness_lra_true_peak",
                "method": "ffmpeg ebur128=peak=true",
                "parameters": {
                    "standardContext": "EBU R128 / ITU-R BS.1770 family",
                },
                "class": "deterministic_acoustic",
            },
            {
                "id": "method-rms-001",
                "kind": "fixed_window_rms_dbfs",
                "method": "ffmpeg decode to mono f32le PCM, then mean-square power",
                "parameters": {
                    "sampleRateHz": ANALYSIS_SAMPLE_RATE,
                    "channels": ANALYSIS_CHANNELS,
                    "windowSec": window_sec,
                    "floorDbfs": -120.0,
                },
                "class": "deterministic_acoustic",
            },
            {
                "id": "method-change-001",
                "kind": "rms_step_change_candidates",
                "method": "difference of context-averaged decoded-PCM RMS power",
                "parameters": {
                    "windowSec": window_sec,
                    "contextSec": context_sec,
                    "thresholdDb": change_threshold_db,
                    "minSeparationSec": 2.0,
                    "maxPoints": 12,
                },
                "class": "derived_deterministic",
            },
        ],
        "warnings": loudness_warnings,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def self_test() -> None:
    half = array.array("f", [0.5] * 1000)
    db = power_to_dbfs(rms_power(half))
    assert abs(db - (-6.020599913)) < 1e-6, db

    powers = [10 ** (-20 / 10)] * 8 + [10 ** (-10 / 10)] * 8
    changes = detect_change_points(
        powers,
        0.5,
        threshold_db=3.0,
        context_sec=1.0,
        min_separation_sec=2.0,
    )
    assert changes, "expected a synthetic change point"
    strongest = max(changes, key=lambda item: abs(item["deltaDb"]))
    assert abs(strongest["atSec"] - 4.0) <= 0.5, strongest
    assert strongest["deltaDb"] > 8.0, strongest

    sample = """
Summary:

  Integrated loudness:
    I:         -10.8 LUFS
    Threshold: -20.0 LUFS

  Loudness range:
    LRA:         4.2 LU

  True peak:
    Peak:        -0.7 dBFS
"""
    parsed, warnings = parse_ebur128_summary(sample)
    assert parsed == {
        "integratedLufs": -10.8,
        "loudnessRangeLu": 4.2,
        "truePeakDbfs": -0.7,
    }, parsed
    assert warnings == [], warnings
    print("audio_metrics self-test: ok")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--window-sec", type=float, default=0.5)
    parser.add_argument("--change-threshold-db", type=float, default=3.0)
    parser.add_argument("--context-sec", type=float, default=1.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    if not args.input or not args.output:
        parser.error("--input and --output are required unless --self-test is used")

    source = args.input.expanduser().resolve()
    if not source.is_file():
        payload = build_failed(source, args.window_sec, "input audio file does not exist")
        write_json(args.output, payload)
        return 2

    if args.window_sec <= 0 or args.context_sec <= 0 or args.change_threshold_db <= 0:
        parser.error("window/context/threshold values must be positive")

    try:
        payload = extract_metrics(
            source,
            window_sec=args.window_sec,
            change_threshold_db=args.change_threshold_db,
            context_sec=args.context_sec,
        )
        write_json(args.output, payload)
        print(
            json.dumps(
                {
                    "status": payload["status"],
                    "output": str(args.output),
                    "durationSec": payload["sourceAudio"]["durationSec"],
                    "integratedLufs": payload["loudness"]["integratedLufs"],
                    "changePoints": len(payload["changePoints"]),
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        payload = build_failed(source, args.window_sec, str(exc))
        write_json(args.output, payload)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
