"""Capture N photos at a fixed interval using Picamera2."""
from __future__ import annotations

import logging
import time
from pathlib import Path

log = logging.getLogger(__name__)


class CameraUnavailable(RuntimeError):
    pass


def capture_series(
    out_dir: Path,
    count: int,
    interval_sec: float,
    size: tuple[int, int],
) -> list[Path]:
    """Take `count` photos `interval_sec` apart, save as img_001.jpg, img_002.jpg, ... .
    Returns the list of saved file paths.
    """
    try:
        from picamera2 import Picamera2  # type: ignore
    except ImportError as e:
        raise CameraUnavailable(
            "picamera2 not available — must run on the Pi with python3-picamera2 installed "
            "and venv created with --system-site-packages"
        ) from e

    if count < 1:
        raise ValueError(f"count must be >= 1, got {count}")
    out_dir.mkdir(parents=True, exist_ok=True)

    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": size}))
    cam.start()
    # Let auto-exposure settle on the first frame.
    time.sleep(1.0)

    saved: list[Path] = []
    try:
        for i in range(1, count + 1):
            path = out_dir / f"img_{i:03d}.jpg"
            cam.capture_file(str(path))
            log.info("captured %s", path)
            saved.append(path)
            if i < count:
                time.sleep(interval_sec)
    finally:
        cam.stop()
        cam.close()
    return saved
