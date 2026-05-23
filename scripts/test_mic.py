"""Record 3 seconds of audio to recordings/test.wav.
Stop ai-necklace.service first so the mic is free.
"""
import os
import sounddevice as sd
from scipy.io import wavfile

SECONDS = 3
SAMPLE_RATE = 16000
DEVICE = os.environ.get("AUDIO_INPUT_DEVICE")  # int or substring; None = default


def _device_arg():
    if DEVICE is None or DEVICE == "":
        return None
    try:
        return int(DEVICE)
    except ValueError:
        return DEVICE


def main() -> None:
    os.makedirs("recordings", exist_ok=True)
    print(f"recording {SECONDS}s @ {SAMPLE_RATE}Hz from device={_device_arg()!r} ...")
    audio = sd.rec(
        int(SECONDS * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        device=_device_arg(),
    )
    sd.wait()
    out = "recordings/test.wav"
    wavfile.write(out, SAMPLE_RATE, audio)
    print(f"saved {out}")


if __name__ == "__main__":
    main()
