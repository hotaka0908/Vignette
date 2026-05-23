"""Short audio cues played when a capture session starts or ends.

Plays via sounddevice/PortAudio directly against ALSA so it works from a systemd
service (no PulseAudio/PipeWire user session required). Errors are caught and
logged but never bring down the caller — the button must always work even if
the speaker is unplugged.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

# USB DAC UACDemoV1.0 → sounddevice index 0 on this Pi. Override with env var if needed.
DEFAULT_DEVICE = os.environ.get("VIGNETTE_AUDIO_OUTPUT_DEVICE", "0")
SAMPLE_RATE = int(os.environ.get("VIGNETTE_AUDIO_SAMPLE_RATE", "48000"))


def _device():
    if DEFAULT_DEVICE in ("", "default", None):
        return None
    try:
        return int(DEFAULT_DEVICE)
    except (TypeError, ValueError):
        return DEFAULT_DEVICE


def _play_tones(tones: list[tuple[float, float]]) -> None:
    """Play a sequence of (freq_hz, duration_sec) tones with short fades."""
    try:
        import numpy as np
        import sounddevice as sd
    except ImportError as e:
        log.warning("audio libs missing, skipping sound: %s", e)
        return

    fade_sec = 0.01
    chunks = []
    for freq, dur in tones:
        n = int(SAMPLE_RATE * dur)
        t = np.linspace(0, dur, n, endpoint=False)
        wave = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
        n_fade = int(SAMPLE_RATE * fade_sec)
        if n > 2 * n_fade:
            wave[:n_fade] *= np.linspace(0, 1, n_fade)
            wave[-n_fade:] *= np.linspace(1, 0, n_fade)
        chunks.append(wave)
    samples = np.concatenate(chunks)

    try:
        sd.play(samples, SAMPLE_RATE, device=_device())
        sd.wait()
    except Exception as e:
        log.warning("could not play tone (device=%r): %s", _device(), e)


def play_start() -> None:
    """Ascending two-tone — session started."""
    _play_tones([(660.0, 0.12), (988.0, 0.18)])  # E5 -> B5


def play_stop() -> None:
    """Descending two-tone — session ended."""
    _play_tones([(988.0, 0.12), (660.0, 0.18)])  # B5 -> E5
