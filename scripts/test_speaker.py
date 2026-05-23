"""Play a 1-second 440Hz beep through the default (or configured) output.
Stop ai-necklace.service first so the speaker is free.
"""
import os
import numpy as np
import sounddevice as sd

SAMPLE_RATE = int(os.environ.get("SAMPLE_RATE", "48000"))  # USB DAC often requires 48000
FREQ = 440
SECONDS = 1.0
# Default to ALSA card 2 (UACDemoV1.0 USB speaker) — index 0 in sounddevice list
DEVICE = os.environ.get("AUDIO_OUTPUT_DEVICE", "0")


def _device_arg():
    if DEVICE is None or DEVICE == "":
        return None
    try:
        return int(DEVICE)
    except ValueError:
        return DEVICE


def main() -> None:
    t = np.linspace(0, SECONDS, int(SECONDS * SAMPLE_RATE), endpoint=False)
    tone = (0.3 * np.sin(2 * np.pi * FREQ * t)).astype(np.float32)
    print(f"playing beep on device={_device_arg()!r} ...")
    sd.play(tone, SAMPLE_RATE, device=_device_arg())
    sd.wait()
    print("done")


if __name__ == "__main__":
    main()
