"""Shared on-disk state for the active capture session.

The button daemon writes/clears `state.json`; the capture timer reads it
to decide whether to capture and where to put the photo.

Schema:
    {"session_id": "2026-05-23_134205", "started_at": 1727...}
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import Config


STATE_FILENAME = "state.json"


@dataclass(frozen=True)
class ActiveSession:
    session_id: str
    started_at: float

    @property
    def started_dt(self) -> datetime:
        return datetime.fromtimestamp(self.started_at)


def _state_path(cfg: Config) -> Path:
    return cfg.photos_dir.parent / STATE_FILENAME


def read(cfg: Config) -> ActiveSession | None:
    p = _state_path(cfg)
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    sid = data.get("session_id")
    started = data.get("started_at")
    if not isinstance(sid, str) or not isinstance(started, (int, float)):
        return None
    return ActiveSession(session_id=sid, started_at=float(started))


def write(cfg: Config, session: ActiveSession) -> None:
    p = _state_path(cfg)
    p.parent.mkdir(parents=True, exist_ok=True)
    # atomic write
    with tempfile.NamedTemporaryFile(
        mode="w", dir=p.parent, delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(
            {"session_id": session.session_id, "started_at": session.started_at},
            tmp,
            ensure_ascii=False,
        )
        tmp_name = tmp.name
    os.replace(tmp_name, p)


def clear(cfg: Config) -> None:
    p = _state_path(cfg)
    try:
        p.unlink()
    except FileNotFoundError:
        pass
