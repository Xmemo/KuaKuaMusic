#!/usr/bin/env python3
"""Filesystem request bus between KuaKuaMusic browser UI and Antigravity session mode.

No model runtime is launched here. The browser/server writes queued request JSON files.
The already-running Antigravity orchestrator blocks on \`wait\`, claims one request,
processes it with its normal tools/subagents, then calls \`complete\` and waits again.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "4.0"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    temp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temp, path)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def session_file(session_root: Path) -> Path:
    return session_root / "orchestrator.json"


def load_session(session_root: Path) -> dict[str, Any] | None:
    file = session_file(session_root)
    try:
        return read_json(file)
    except FileNotFoundError:
        return None


def write_session(
    session_root: Path,
    *,
    status: str,
    session_id: str | None = None,
    active_request: dict[str, Any] | None = None,
    last_error: str | None = None,
    preserve_started: bool = True,
) -> dict[str, Any]:
    current = load_session(session_root) if preserve_started else None
    sid = session_id or (current or {}).get("sessionId") or uuid.uuid4().hex
    started = (current or {}).get("startedAt") or iso_now()
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionId": sid,
        "status": status,
        "startedAt": started,
        "updatedAt": iso_now(),
        "activeRequestId": (active_request or {}).get("requestId"),
        "activeRunId": (active_request or {}).get("runId"),
        "activeKind": (active_request or {}).get("kind"),
        "lastError": last_error,
    }
    atomic_write(session_file(session_root), payload)
    return payload


def request_files(runs_root: Path) -> list[Path]:
    if not runs_root.exists():
        return []
    files: list[Path] = []
    for run_dir in runs_root.iterdir():
        if not run_dir.is_dir():
            continue
        for name in ("browser-request.json", "browser-creative-request.json"):
            file = run_dir / name
            if file.is_file():
                files.append(file)
    return files


def queued_requests(runs_root: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    found: list[tuple[str, Path, dict[str, Any]]] = []
    for file in request_files(runs_root):
        try:
            payload = read_json(file)
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("status") != "queued":
            continue
        queued_at = str(payload.get("queuedAt") or payload.get("createdAt") or "")
        found.append((queued_at, file, payload))
    found.sort(key=lambda item: (item[0], str(item[1])))
    return found


def claim_request(
    file: Path,
    payload: dict[str, Any],
    *,
    session_id: str,
) -> dict[str, Any] | None:
    lock = file.with_name(file.name + ".claim-lock")
    try:
        lock.mkdir()
    except FileExistsError:
        return None
    try:
        current = read_json(file)
        if current.get("status") != "queued":
            return None
        current["status"] = "claimed"
        current["claimedAt"] = iso_now()
        current["claimedBySessionId"] = session_id
        atomic_write(file, current)
        return {
            **current,
            "requestFile": str(file.resolve()),
            "runDir": str(file.parent.resolve()),
        }
    finally:
        try:
            lock.rmdir()
        except OSError:
            pass


def cmd_register(args: argparse.Namespace) -> int:
    root = args.session_root.expanduser().resolve()
    payload = write_session(
        root,
        status="waiting",
        session_id=args.session_id or uuid.uuid4().hex,
        preserve_started=False,
    )
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    root = args.session_root.expanduser().resolve()
    payload = load_session(root)
    if payload is None:
        print(
            json.dumps(
                {
                    "schemaVersion": SCHEMA_VERSION,
                    "status": "offline",
                    "updatedAt": None,
                },
                ensure_ascii=False,
            )
        )
        return 0
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def cmd_wait(args: argparse.Namespace) -> int:
    runs_root = args.runs_root.expanduser().resolve()
    session_root = args.session_root.expanduser().resolve()
    session = load_session(session_root)
    if not session or session.get("status") == "stopped":
        session = write_session(
            session_root,
            status="waiting",
            session_id=args.session_id or None,
            preserve_started=False,
        )
    session_id = str(session["sessionId"])

    deadline = None if args.timeout <= 0 else time.monotonic() + args.timeout
    last_heartbeat = 0.0

    while True:
        now = time.monotonic()
        if now - last_heartbeat >= args.heartbeat_sec:
            write_session(
                session_root,
                status="waiting",
                session_id=session_id,
            )
            last_heartbeat = now

        for _, file, payload in queued_requests(runs_root):
            claimed = claim_request(file, payload, session_id=session_id)
            if not claimed:
                continue
            write_session(
                session_root,
                status="processing",
                session_id=session_id,
                active_request=claimed,
            )
            print(json.dumps(claimed, ensure_ascii=False))
            return 0

        if deadline is not None and time.monotonic() >= deadline:
            write_session(
                session_root,
                status="waiting",
                session_id=session_id,
            )
            print(
                json.dumps(
                    {
                        "schemaVersion": SCHEMA_VERSION,
                        "kind": "idle_timeout",
                        "sessionId": session_id,
                    },
                    ensure_ascii=False,
                )
            )
            return 0

        time.sleep(args.poll_sec)


def cmd_complete(args: argparse.Namespace) -> int:
    file = args.request_file.expanduser().resolve()
    session_root = args.session_root.expanduser().resolve()
    payload = read_json(file)
    if payload.get("status") not in ("claimed", "queued"):
        raise SystemExit(
            "request is not claimable/completable from status "
            + str(payload.get("status"))
        )

    payload["status"] = args.status
    payload["completedAt"] = iso_now()
    payload["error"] = args.error if args.status == "failed" else None
    atomic_write(file, payload)

    current = load_session(session_root)
    write_session(
        session_root,
        status="waiting",
        session_id=(current or {}).get("sessionId"),
        last_error=args.error if args.status == "failed" else None,
    )
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def cmd_requeue(args: argparse.Namespace) -> int:
    file = args.request_file.expanduser().resolve()
    payload = read_json(file)
    payload["status"] = "queued"
    payload["queuedAt"] = iso_now()
    payload["claimedAt"] = None
    payload["claimedBySessionId"] = None
    payload["completedAt"] = None
    payload["error"] = None
    atomic_write(file, payload)
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    root = args.session_root.expanduser().resolve()
    current = load_session(root)
    payload = write_session(
        root,
        status="stopped",
        session_id=(current or {}).get("sessionId"),
    )
    print(json.dumps(payload, ensure_ascii=False))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    root.add_argument(
        "--session-root",
        type=Path,
        default=Path(".music-learning") / "session",
    )
    sub = root.add_subparsers(dest="command", required=True)

    register = sub.add_parser("register")
    register.add_argument("--session-id")
    register.set_defaults(func=cmd_register)

    status = sub.add_parser("status")
    status.set_defaults(func=cmd_status)

    wait = sub.add_parser("wait")
    wait.add_argument(
        "--runs-root",
        type=Path,
        default=Path(".music-learning") / "runs",
    )
    wait.add_argument("--session-id")
    wait.add_argument("--poll-sec", type=float, default=0.5)
    wait.add_argument("--heartbeat-sec", type=float, default=2.0)
    wait.add_argument(
        "--timeout",
        type=float,
        default=900.0,
        help="Seconds to block before returning idle_timeout. <=0 waits forever.",
    )
    wait.set_defaults(func=cmd_wait)

    complete = sub.add_parser("complete")
    complete.add_argument("--request-file", type=Path, required=True)
    complete.add_argument(
        "--status",
        choices=["completed", "failed"],
        required=True,
    )
    complete.add_argument("--error")
    complete.set_defaults(func=cmd_complete)

    requeue = sub.add_parser("requeue")
    requeue.add_argument("--request-file", type=Path, required=True)
    requeue.set_defaults(func=cmd_requeue)

    stop = sub.add_parser("stop")
    stop.set_defaults(func=cmd_stop)
    return root


def main() -> int:
    args = parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
