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


def _play_samples(samples) -> None:
    try:
        import sounddevice as sd
        sd.play(samples, SAMPLE_RATE, device=_device())
        sd.wait()
    except Exception as e:
        log.warning("could not play audio (device=%r): %s", _device(), e)


def _play_tones(tones: list[tuple[float, float]]) -> None:
    """Play a sequence of (freq_hz, duration_sec) tones with short fades."""
    try:
        import numpy as np
    except ImportError as e:
        log.warning("numpy missing, skipping sound: %s", e)
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
    import numpy as np
    _play_samples(np.concatenate(chunks))


def play_start() -> None:
    """Ascending two-tone — session started."""
    _play_tones([(660.0, 0.12), (988.0, 0.18)])  # E5 -> B5


def play_stop() -> None:
    """Descending two-tone — session ended."""
    _play_tones([(988.0, 0.12), (660.0, 0.18)])  # B5 -> E5


def play_shutter() -> None:
    """Synthesized camera shutter click — short noise burst + low thunk."""
    try:
        import numpy as np
    except ImportError as e:
        log.warning("numpy missing, skipping shutter: %s", e)
        return

    dur = 0.09  # 90 ms — short and snappy
    n = int(SAMPLE_RATE * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    rng = np.random.default_rng()

    # Bright high-frequency noise burst (the "tsch" of the shutter)
    noise = rng.standard_normal(n).astype(np.float32) * 0.45
    # Simple high-pass-ish emphasis by mixing in differences
    noise[1:] = noise[1:] - 0.7 * noise[:-1]
    noise_env = np.exp(-t * 55).astype(np.float32)
    bright = noise * noise_env

    # Low thunk (mechanical body of the click)
    thunk = (0.4 * np.sin(2 * np.pi * 140.0 * t) * np.exp(-t * 35)).astype(np.float32)

    samples = (bright + thunk).clip(-0.95, 0.95).astype(np.float32)
    _play_samples(samples)
