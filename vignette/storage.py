"""Per-session directory layout under data/."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import Config


@dataclass(frozen=True)
class Session:
    id: str
    photos_dir: Path
    analysis_path: Path
    prompt_path: Path


def new_session(cfg: Config, now: datetime | None = None) -> Session:
    now = now or datetime.now()
    sid = now.strftime("%Y-%m-%d_%H%M%S")
    photos = cfg.photos_dir / sid
    photos.mkdir(parents=True, exist_ok=True)
    cfg.analysis_dir.mkdir(parents=True, exist_ok=True)
    cfg.prompts_dir.mkdir(parents=True, exist_ok=True)
    return Session(
        id=sid,
        photos_dir=photos,
        analysis_path=cfg.analysis_dir / f"{sid}.json",
        prompt_path=cfg.prompts_dir / f"{sid}.txt",
    )
