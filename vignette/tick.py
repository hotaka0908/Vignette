"""One-shot capture tick: invoked by the systemd timer every minute.
If a session is active, take one photo into its folder. Otherwise no-op.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime

from dotenv import load_dotenv

from . import capture, session_state, sounds
from .config import load

log = logging.getLogger("vignette.tick")


def main() -> int:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    cfg = load()
    sess = session_state.read(cfg)
    if not sess:
        log.info("no active session; skipping")
        return 0

    photos_dir = cfg.photos_dir / sess.session_id
    photos_dir.mkdir(parents=True, exist_ok=True)
    fname = f"img_{datetime.now().strftime('%H%M%S')}.jpg"
    out = photos_dir / fname
    try:
        capture.capture_series(
            photos_dir, count=1, interval_sec=0, size=cfg.photo_size
        )
        # capture_series writes img_001.jpg; rename to time-based filename
        src = photos_dir / "img_001.jpg"
        if src.exists() and src != out:
            src.rename(out)
        log.info("captured %s (session=%s)", out.name, sess.session_id)
        sounds.play_shutter()
    except capture.CameraUnavailable as e:
        log.error("camera unavailable: %s", e)
        return 2
    except Exception as e:
        log.exception("capture failed: %s", e)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
