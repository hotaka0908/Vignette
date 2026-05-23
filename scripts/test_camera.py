"""Capture a single frame from the Pi Camera to captures/test.jpg."""
import os
from picamera2 import Picamera2


def main() -> None:
    os.makedirs("captures", exist_ok=True)
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": (1280, 720)}))
    cam.start()
    out = "captures/test.jpg"
    cam.capture_file(out)
    cam.stop()
    print(f"saved {out}")


if __name__ == "__main__":
    main()
