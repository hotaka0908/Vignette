"""Long-running daemon: watches the GPIO button and toggles capture sessions.

- press while idle → start a new session (write state.json)
- press while active → end the session: clear state and trigger upload
"""
from __future__ import annotations

import logging
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

from . import session_state
from .config import load

log = logging.getLogger("vignette.button")


def _start_session(cfg) -> str:
    sid = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    photos = cfg.photos_dir / sid
    photos.mkdir(parents=True, exist_ok=True)
    session_state.write(
        cfg, session_state.ActiveSession(session_id=sid, started_at=time.time())
    )
    log.info("STARTED session %s -> %s", sid, photos)
    return sid


def _stop_session(cfg, sid: str) -> None:
    session_state.clear(cfg)
    log.info("STOPPED session %s — kicking off upload", sid)
    # Hand off to a subprocess so the daemon stays responsive.
    log_path = cfg.photos_dir.parent / "upload.log"
    cmd = [sys.executable, "-m", "vignette.upload_cli", sid]
    with open(log_path, "ab") as f:
        f.write(f"\n--- upload {sid} @ {datetime.now().isoformat()} ---\n".encode())
        subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT, cwd=str(Path(__file__).resolve().parent.parent))
    log.info("upload subprocess launched; tail %s for progress", log_path)


def main() -> None:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    cfg = load()

    try:
        from gpiozero import Button
    except ImportError:
        log.error("gpiozero not available; cannot run button daemon")
        sys.exit(1)

    button = Button(cfg.button_gpio, pull_up=True, bounce_time=0.05)
    log.info("watching GPIO%d (pull-up) — press to toggle capture session", cfg.button_gpio)
    log.info("current state file: %s", session_state._state_path(cfg))

    def on_press():
        existing = session_state.read(cfg)
        if existing:
            _stop_session(cfg, existing.session_id)
        else:
            _start_session(cfg)

    button.when_pressed = on_press

    # Wait forever; respond to TERM/INT cleanly.
    stop = {"flag": False}

    def _shutdown(signum, frame):
        log.info("signal %d received, exiting", signum)
        stop["flag"] = True

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)
    while not stop["flag"]:
        time.sleep(1)
    button.close()


if __name__ == "__main__":
    main()
