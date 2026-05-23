"""Print available audio and camera devices on the host where this runs.
Run on the Pi: ./scripts/run-pi.sh ./venv/bin/python scripts/list_devices.py
"""
import sounddevice as sd


def main() -> None:
    print("=== Audio devices ===")
    print(sd.query_devices())
    print("\n=== Default input/output ===")
    print("default input :", sd.default.device[0])
    print("default output:", sd.default.device[1])


if __name__ == "__main__":
    main()
