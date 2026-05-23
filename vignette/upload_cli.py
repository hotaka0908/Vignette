"""CLI entry: upload one session's photos to Firebase Storage.

Usage:
    python -m vignette.upload_cli <session_id>
"""
from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

from . import upload
from .config import load

log = logging.getLogger("vignette.upload")


def _notify_orchestrator(cfg, sid: str) -> None:
    """Tell the recap orchestrator a session is ready: POST {VIGNETTE_ORCHESTRATOR_URL}/process/<sid>.

    No-op when VIGNETTE_ORCHESTRATOR_URL is unset. A failed notify is logged but never
    fails the upload — the photos are already in Firebase, so the upload succeeded.
    Sends X-API-Key when VIGNETTE_API_KEY is set (must match the server's key).
    """
    if not cfg.orchestrator_url:
        log.info("VIGNETTE_ORCHESTRATOR_URL unset; skipping POST /process/%s", sid)
        return
    import requests

    url = f"{cfg.orchestrator_url.rstrip('/')}/process/{sid}"
    headers = {"X-API-Key": cfg.api_key} if cfg.api_key else {}
    try:
        resp = requests.post(url, headers=headers, timeout=10)
        resp.raise_for_status()
        log.info("notified orchestrator: POST /process/%s -> %s", sid, resp.status_code)
    except Exception as e:  # upload already succeeded; don't surface as a failure
        log.warning("orchestrator notify failed (upload still succeeded): %s", e)


def main() -> int:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )
    if len(sys.argv) != 2:
        print("usage: python -m vignette.upload_cli <session_id>", file=sys.stderr)
        return 2
    sid = sys.argv[1]
    cfg = load()

    if not cfg.firebase_credentials or not cfg.firebase_bucket:
        log.error(
            "VIGNETTE_FIREBASE_CREDENTIALS and VIGNETTE_FIREBASE_BUCKET must be set "
            "(in .env or env vars)"
        )
        return 3

    photos_dir = cfg.photos_dir / sid
    if not photos_dir.exists():
        log.error("session dir not found: %s", photos_dir)
        return 4

    try:
        uploaded = upload.upload_session(
            photos_dir=photos_dir,
            session_id=sid,
            credentials_path=cfg.firebase_credentials,
            bucket=cfg.firebase_bucket,
        )
    except upload.UploadError as e:
        log.error("upload failed: %s", e)
        return 5

    log.info("uploaded %d files to gs://%s/sessions/%s/", len(uploaded), cfg.firebase_bucket, sid)
    _notify_orchestrator(cfg, sid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
