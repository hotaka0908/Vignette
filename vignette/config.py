"""Centralized configuration loaded from env vars with defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


@dataclass(frozen=True)
class Config:
    photo_count: int
    photo_interval_sec: float
    photo_size: tuple[int, int]
    gemini_model: str
    gemini_api_key: str | None
    photos_dir: Path
    analysis_dir: Path
    prompts_dir: Path
    # Lifelog daemon settings
    button_gpio: int
    capture_interval_sec: int
    firebase_credentials: str | None
    firebase_bucket: str | None


def load() -> Config:
    return Config(
        photo_count=int(os.environ.get("VIGNETTE_PHOTO_COUNT", "5")),
        photo_interval_sec=float(os.environ.get("VIGNETTE_PHOTO_INTERVAL_SEC", "3")),
        photo_size=(
            int(os.environ.get("VIGNETTE_PHOTO_WIDTH", "1920")),
            int(os.environ.get("VIGNETTE_PHOTO_HEIGHT", "1080")),
        ),
        gemini_model=os.environ.get("VIGNETTE_GEMINI_MODEL", "gemini-2.5-flash"),
        gemini_api_key=os.environ.get("GEMINI_API_KEY"),
        photos_dir=DATA_DIR / "photos",
        analysis_dir=DATA_DIR / "analysis",
        prompts_dir=DATA_DIR / "prompts",
        button_gpio=int(os.environ.get("VIGNETTE_BUTTON_GPIO", "5")),
        capture_interval_sec=int(os.environ.get("VIGNETTE_CAPTURE_INTERVAL_SEC", "60")),
        firebase_credentials=os.environ.get("VIGNETTE_FIREBASE_CREDENTIALS"),
        firebase_bucket=os.environ.get("VIGNETTE_FIREBASE_BUCKET"),
    )
