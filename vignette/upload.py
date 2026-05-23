"""Upload a session's photos to Firebase Storage."""
from __future__ import annotations

import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)


class UploadError(RuntimeError):
    pass


def _ensure_app(credentials_path: str, bucket: str):
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as e:
        raise UploadError(
            "firebase-admin not installed — run setup-pi.sh to install dependencies"
        ) from e
    if not firebase_admin._apps:
        cred = credentials.Certificate(credentials_path)
        firebase_admin.initialize_app(cred, {"storageBucket": bucket})


def upload_session(
    photos_dir: Path,
    session_id: str,
    credentials_path: str,
    bucket: str,
) -> list[str]:
    """Upload every .jpg in `photos_dir` to gs://<bucket>/sessions/<session_id>/.
    Returns the list of object paths uploaded.
    """
    if not Path(credentials_path).exists():
        raise UploadError(f"credentials JSON not found at {credentials_path}")
    photos = sorted(photos_dir.glob("*.jpg"))
    if not photos:
        raise UploadError(f"no photos in {photos_dir}")

    _ensure_app(credentials_path, bucket)
    from firebase_admin import storage

    sb = storage.bucket()
    uploaded: list[str] = []
    for p in photos:
        object_path = f"sessions/{session_id}/{p.name}"
        blob = sb.blob(object_path)
        blob.upload_from_filename(str(p), content_type="image/jpeg")
        uploaded.append(object_path)
        log.info("uploaded %s -> gs://%s/%s", p.name, bucket, object_path)
    return uploaded


def upload_one(
    photo_path: Path,
    session_id: str,
    credentials_path: str,
    bucket: str,
) -> str:
    """Upload a single photo to gs://<bucket>/sessions/<session_id>/<photo_name>.
    Returns the object path. Idempotent — re-uploads overwrite.
    """
    if not photo_path.exists():
        raise UploadError(f"photo not found: {photo_path}")
    if not Path(credentials_path).exists():
        raise UploadError(f"credentials JSON not found at {credentials_path}")

    _ensure_app(credentials_path, bucket)
    from firebase_admin import storage

    sb = storage.bucket()
    object_path = f"sessions/{session_id}/{photo_path.name}"
    blob = sb.blob(object_path)
    blob.upload_from_filename(str(photo_path), content_type="image/jpeg")
    log.info("uploaded %s -> gs://%s/%s", photo_path.name, bucket, object_path)
    return object_path
