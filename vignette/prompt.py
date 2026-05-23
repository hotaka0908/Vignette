"""Turn a session analysis into a 15-second cinematic video-generation prompt."""
from __future__ import annotations

import json
import logging
from typing import Any

log = logging.getLogger(__name__)


class PromptError(RuntimeError):
    pass


_SYSTEM = """\
You write prompts for a generative video model that produces short cinematic clips.
Given a JSON lifelog analysis (in Japanese) from a wearable-camera, produce ONE single
English prompt for a 15-second video that reconstructs the day as a cinematic short.

Requirements for the prompt:
- exactly one paragraph, 60–120 words
- explicit duration: "15-second video"
- include the following descriptors naturally: cinematic, emotional, realistic,
  wearable camera perspective
- describe scene transitions, lighting, mood, sound design hints (no music titles), and pacing
- keep it concrete: use the highlights, location, atmosphere, emotions, and key_scenes
  from the analysis verbatim where possible
- no preamble, no quotes, no markdown — output only the prompt text
"""


def generate_video_prompt(analysis: dict[str, Any], api_key: str, model: str) -> str:
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise PromptError("google-genai not installed") from e

    client = genai.Client(api_key=api_key)
    contents = [
        _SYSTEM,
        "Lifelog analysis JSON:\n" + json.dumps(analysis, ensure_ascii=False, indent=2),
    ]
    log.info("calling Gemini for video prompt, model=%s", model)
    try:
        resp = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(temperature=0.8),
        )
    except Exception as e:
        raise PromptError(f"Gemini prompt call failed: {e}") from e

    text = (resp.text or "").strip()
    if not text:
        raise PromptError("Gemini returned empty prompt")
    return text
