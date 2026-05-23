"""End-to-end orchestrator: capture → analyze → prompt → display."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

from dotenv import load_dotenv

from . import analyze as analyze_mod
from . import capture as capture_mod
from . import prompt as prompt_mod
from .config import Config, load
from .storage import Session, new_session

log = logging.getLogger("vignette")


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="vignette", description=__doc__)
    p.add_argument("--count", type=int, default=None, help="number of photos to capture")
    p.add_argument("--interval", type=float, default=None, help="seconds between photos")
    p.add_argument(
        "--skip-capture",
        metavar="SESSION_ID",
        help="reuse photos from an existing session (yyyy-mm-dd_HHMMSS); skip the camera",
    )
    p.add_argument(
        "--skip-analysis",
        action="store_true",
        help="capture only — don't call Gemini (useful when GEMINI_API_KEY is not set)",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def _print_results(analysis: dict[str, Any], video_prompt: str) -> None:
    print()
    print("今日のハイライト：")
    for h in analysis.get("highlights") or []:
        print(f"- {h}")
    one_line = analysis.get("one_line_summary")
    if one_line:
        print()
        print(f"一言でいうと: {one_line}")
    print()
    print("15秒動画生成プロンプト：")
    print(video_prompt)
    print()


def _resolve_session(cfg: Config, reuse_id: str | None) -> tuple[Session, list]:
    if reuse_id:
        from pathlib import Path
        photos = sorted((cfg.photos_dir / reuse_id).glob("*.jpg"))
        if not photos:
            raise SystemExit(
                f"--skip-capture: no photos found at {cfg.photos_dir / reuse_id}"
            )
        sess = Session(
            id=reuse_id,
            photos_dir=cfg.photos_dir / reuse_id,
            analysis_path=cfg.analysis_dir / f"{reuse_id}.json",
            prompt_path=cfg.prompts_dir / f"{reuse_id}.txt",
        )
        cfg.analysis_dir.mkdir(parents=True, exist_ok=True)
        cfg.prompts_dir.mkdir(parents=True, exist_ok=True)
        log.info("reusing %d photos from session %s", len(photos), reuse_id)
        return sess, photos
    sess = new_session(cfg)
    return sess, []


def run(argv: list[str] | None = None) -> int:
    load_dotenv()
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    _setup_logging(args.verbose)

    cfg = load()
    count = args.count or cfg.photo_count
    interval = args.interval or cfg.photo_interval_sec

    sess, existing = _resolve_session(cfg, args.skip_capture)

    if existing:
        photos = existing
    else:
        log.info(
            "capturing %d photos every %.1fs into %s", count, interval, sess.photos_dir
        )
        try:
            photos = capture_mod.capture_series(
                sess.photos_dir, count=count, interval_sec=interval, size=cfg.photo_size
            )
        except capture_mod.CameraUnavailable as e:
            log.error("camera unavailable: %s", e)
            return 2

    log.info("session=%s photos=%d", sess.id, len(photos))

    if args.skip_analysis:
        log.info("--skip-analysis set; stopping after capture")
        print(f"\nsession {sess.id}: captured {len(photos)} photos at {sess.photos_dir}")
        return 0

    if not cfg.gemini_api_key:
        log.error("GEMINI_API_KEY env var not set")
        print(
            "\nset GEMINI_API_KEY (e.g. export GEMINI_API_KEY=... or put it in .env), "
            "or pass --skip-analysis",
            file=sys.stderr,
        )
        return 3

    try:
        analysis = analyze_mod.analyze_photos(
            photos, api_key=cfg.gemini_api_key, model=cfg.gemini_model
        )
    except analyze_mod.GeminiError as e:
        log.error("analysis failed: %s", e)
        return 4

    sess.analysis_path.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log.info("wrote %s", sess.analysis_path)

    try:
        video_prompt = prompt_mod.generate_video_prompt(
            analysis, api_key=cfg.gemini_api_key, model=cfg.gemini_model
        )
    except prompt_mod.PromptError as e:
        log.error("prompt generation failed: %s", e)
        return 5

    sess.prompt_path.write_text(video_prompt, encoding="utf-8")
    log.info("wrote %s", sess.prompt_path)

    _print_results(analysis, video_prompt)
    return 0


def main() -> None:
    raise SystemExit(run())


if __name__ == "__main__":
    main()
