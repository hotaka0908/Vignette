"""Capture a single frame to captures/test.jpg."""
import os
import cv2

CAMERA_INDEX = int(os.environ.get("CAMERA_INDEX", "0"))


def main() -> None:
    os.makedirs("captures", exist_ok=True)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        raise SystemExit(f"camera {CAMERA_INDEX} not opened")
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("camera read failed")
    out = "captures/test.jpg"
    cv2.imwrite(out, frame)
    print(f"saved {out} shape={frame.shape}")


if __name__ == "__main__":
    main()
