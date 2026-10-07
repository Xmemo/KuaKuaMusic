#!/usr/bin/env python3
"""Start the local KuaKuaMusic v4 browser server and register Antigravity Session Mode."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def fetch_json(url: str, *, token: str | None = None, timeout: float = 2.0) -> dict[str, Any]:
    headers = {}
    if token:
        headers["X-Music-Learning-Token"] = token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def v4_ready(base_url: str) -> bool:
    try:
        session = fetch_json(base_url.rstrip("/") + "/api/agent/session")
        token = session.get("token")
        if not token:
            return False
        fetch_json(
            base_url.rstrip("/") + "/api/agent/v4/session",
            token=str(token),
        )
        return True
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError):
        return False


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def start_server(
    repo_root: Path,
    *,
    base_url: str,
    log_file: Path,
    pid_file: Path,
    timeout: float,
) -> tuple[bool, int | None]:
    if v4_ready(base_url):
        return False, None

    if pid_file.exists():
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
        except (ValueError, OSError):
            pid = 0
        if pid and alive(pid):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if v4_ready(base_url):
                    return False, pid
                time.sleep(0.5)
            raise RuntimeError(
                "A dev-server process is alive but the v4 bridge did not become ready. "
                f"Inspect {log_file}."
            )

    log_file.parent.mkdir(parents=True, exist_ok=True)
    log_handle = log_file.open("ab", buffering=0)
    env = os.environ.copy()
    env.update(
        {
            "MUSIC_V4_BRIDGE_ENABLED": "1",
            "VITE_MUSIC_V4_ENABLED": "1",
            "MUSIC_V3_ENABLED": "0",
            "VITE_MUSIC_V3_ENABLED": "0",
            "MUSIC_V2_ENABLED": "0",
            "VITE_MUSIC_V2_ENABLED": "0",
        }
    )

    process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=repo_root,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pid_file.write_text(str(process.pid) + "\n", encoding="utf-8")

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            tail = ""
            try:
                tail = log_file.read_text(encoding="utf-8", errors="replace")[-2000:]
            except OSError:
                pass
            raise RuntimeError(
                "KuaKuaMusic dev server exited before becoming ready.\n" + tail
            )
        if v4_ready(base_url):
            return True, process.pid
        time.sleep(0.5)

    try:
        os.killpg(process.pid, signal.SIGTERM)
    except OSError:
        pass
    raise RuntimeError(
        f"KuaKuaMusic v4 did not become ready within {timeout:.0f}s. "
        f"Inspect {log_file}."
    )


def register_session(repo_root: Path, session_root: Path) -> dict[str, Any]:
    command = [
        "python3",
        str(repo_root / "tools" / "music-workflow" / "session_bus.py"),
        "--session-root",
        str(session_root),
        "register",
    ]
    result = subprocess.run(
        command,
        cwd=repo_root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return json.loads(result.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
    )
    parser.add_argument(
        "--session-root",
        type=Path,
        default=Path(".music-learning") / "session",
    )
    parser.add_argument("--url", default="http://127.0.0.1:3000")
    parser.add_argument("--timeout", type=float, default=45.0)
    args = parser.parse_args()

    repo_root = args.repo_root.expanduser().resolve()
    session_root = (
        args.session_root.expanduser().resolve()
        if args.session_root.is_absolute()
        else (repo_root / args.session_root).resolve()
    )
    log_file = session_root / "dev-server.log"
    pid_file = session_root / "dev-server.pid"

    started, pid = start_server(
        repo_root,
        base_url=args.url,
        log_file=log_file,
        pid_file=pid_file,
        timeout=args.timeout,
    )
    session = register_session(repo_root, session_root)

    print(
        json.dumps(
            {
                "status": "ready",
                "browserUrl": args.url,
                "serverStarted": started,
                "serverPid": pid,
                "serverLog": str(log_file),
                "sessionRoot": str(session_root),
                "session": session,
                "next": (
                    "Open the Antigravity browser once with "
                    f"/browser Open {args.url}, then keep this orchestrator in Session Mode."
                ),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
