"""Read a GPIO button for 10 seconds. Set BUTTON_GPIO env var to the BCM pin."""
import os
import time
from gpiozero import Button

PIN = int(os.environ.get("BUTTON_GPIO", "17"))


def main() -> None:
    btn = Button(PIN, pull_up=True)
    print(f"watching GPIO{PIN} (pull-up) for 10s — press the button")
    end = time.time() + 10
    last = btn.is_pressed
    print(f"initial state: {'PRESSED' if last else 'released'}")
    while time.time() < end:
        now = btn.is_pressed
        if now != last:
            print(f"{'PRESSED' if now else 'released'}")
            last = now
        time.sleep(0.02)


if __name__ == "__main__":
    main()
