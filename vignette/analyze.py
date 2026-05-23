"""Send photos to Gemini and get a structured lifelog analysis."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class GeminiError(RuntimeError):
    pass


_PROMPT = """\
あなたは「ウェアラブルカメラのライフログ写真群」を解析するアシスタントです。
渡された複数枚の写真は、同じ人物の同じ日の数秒〜数十秒間隔の連続写真です。
全体を通して何が起きていたかを推定し、以下のJSONスキーマで日本語で答えてください。

- highlights: 3〜5個の短い箇条書き（例: "カフェで作業している", "街を歩いている"）
- location: その場の場所・環境（例: "都市の屋外", "落ち着いたカフェ"）
- atmosphere: 全体の雰囲気（例: "穏やかで日常的", "活気のある夕方"）
- emotions: 推定される感情のキーワード配列（例: ["集中", "リラックス"]）
- key_scenes: 写真ごとの「印象的なシーン」の短い説明配列（写真の枚数と同じ長さ）
- one_line_summary: 1日を1文で要約

必ず純粋なJSONのみを返してください。前後に説明・コードフェンスを付けないでください。
"""


def analyze_photos(
    photo_paths: list[Path],
    api_key: str,
    model: str,
) -> dict[str, Any]:
    if not photo_paths:
        raise ValueError("photo_paths is empty")
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise GeminiError(
            "google-genai not installed — run setup-pi.sh again to install dependencies"
        ) from e

    client = genai.Client(api_key=api_key)

    parts: list[Any] = [_PROMPT]
    for p in photo_paths:
        if not p.exists():
            raise FileNotFoundError(p)
        parts.append(
            types.Part.from_bytes(
                data=p.read_bytes(),
                mime_type="image/jpeg",
            )
        )

    log.info("calling Gemini model=%s with %d images", model, len(photo_paths))
    try:
        resp = client.models.generate_content(
            model=model,
            contents=parts,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )
    except Exception as e:
        raise GeminiError(f"Gemini analysis call failed: {e}") from e

    text = (resp.text or "").strip()
    if not text:
        raise GeminiError("Gemini returned empty response")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise GeminiError(
            f"Gemini response was not valid JSON: {e}\n--- raw ---\n{text[:1000]}"
        ) from e
