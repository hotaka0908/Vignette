"""Play a 1-second 440Hz beep through the default (or configured) output.
Stop ai-necklace.service first so the speaker is free.
"""
import os
import numpy as np
import sounddevice as sd

SAMPLE_RATE = 44100
FREQ = 440
SECONDS = 1.0
DEVICE = os.environ.get("AUDIO_OUTPUT_DEVICE")


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
