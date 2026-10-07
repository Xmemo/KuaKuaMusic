#!/usr/bin/env python3
"""Create an isolated MusicLearning Research Workflow v4 run workspace."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^\w\-]+", "-", value, flags=re.UNICODE)
    value = re.sub(r"-+", "-", value).strip("-")
    return value[:80] or "track"


def infer_identity(path: Path) -> tuple[str, str]:
    stem = path.stem.strip()
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        if artist.strip() and title.strip():
            return title.strip(), artist.strip()
    return stem or "Unknown Track", "Unknown Artist"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--title")
    parser.add_argument("--artist")
    parser.add_argument("--album")
    parser.add_argument("--year")
    parser.add_argument(
        "--runs-root",
        type=Path,
        default=Path(".music-learning") / "runs",
    )
    args = parser.parse_args()

    audio = args.audio.expanduser().resolve()
    if not audio.is_file():
        parser.error("audio file does not exist: " + str(audio))

    inferred_title, inferred_artist = infer_identity(audio)
    title = (args.title or inferred_title).strip()
    artist = (args.artist or inferred_artist).strip()
    album = args.album.strip() if args.album else None
    year = args.year.strip() if args.year else None

    file_sha = sha256(audio)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = (
        slugify(artist)[:30]
        + "--"
        + slugify(title)[:40]
        + "--"
        + timestamp
        + "--"
        + file_sha[:8]
    )

    run_dir = args.runs_root.expanduser().resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    extension = audio.suffix.lower() or ".audio"
    input_audio = run_dir / ("input" + extension)
    shutil.copy2(audio, input_audio)

    task = {
        "schemaVersion": "4.0",
        "runId": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "identity": {
            "title": title,
            "artist": artist,
            "album": album,
            "year": year,
            "identityNeedsReview": artist == "Unknown Artist",
        },
        "input": {
            "sourcePath": str(audio),
            "audioPath": str(input_audio),
            "sha256": file_sha,
            "originalFilename": audio.name,
        },
        "artifacts": {
            "dsp": str(run_dir / "dsp.json"),
            "listen": str(run_dir / "listen.json"),
            "research": str(run_dir / "research.json"),
            "analysis": str(run_dir / "analysis.json"),
            "studio": str(run_dir / "studio.json"),
        },
    }
    task_path = run_dir / "task.json"
    task_path.write_text(
        json.dumps(task, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "runId": run_id,
                "runDir": str(run_dir),
                "audioPath": str(input_audio),
                "taskPath": str(task_path),
                "title": title,
                "artist": artist,
                "identityNeedsReview": task["identity"]["identityNeedsReview"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
