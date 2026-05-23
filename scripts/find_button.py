"""Identify which GPIO pin a wired button is connected to.

Monitors a set of safe GPIO pins with internal pull-ups enabled for `DURATION_SEC`.
When any pin's state changes, prints the transition. Press the button during the
scan window — the pin that flips is the one your button is on.
"""
import sys
import time

try:
    import lgpio
except ImportError:
    print("lgpio not available — install with: pip install lgpio", file=sys.stderr)
    sys.exit(1)

# Skip UART (14, 15) used for serial console; skip ID_SD/ID_SC (0, 1) reserved for HAT EEPROM.
CANDIDATE_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]
DURATION_SEC = 30
POLL_HZ = 200


def main() -> None:
    h = lgpio.gpiochip_open(0)
    claimed = []
    for pin in CANDIDATE_PINS:
        try:
            lgpio.gpio_claim_input(h, pin, lgpio.SET_PULL_UP)
            claimed.append(pin)
        except lgpio.error as e:
            print(f"skip GPIO{pin}: {e}", file=sys.stderr)

    state = {p: lgpio.gpio_read(h, p) for p in claimed}
    print(f"Monitoring {len(claimed)} GPIO pins for {DURATION_SEC}s — PRESS YOUR BUTTON NOW")
    print(f"Initial state (1=HIGH/released, 0=LOW/pressed-if-pull-up):")
    for p in claimed:
        print(f"  GPIO{p:>2}={state[p]}", end="  ")
    print()
    print("---")

    transitions: dict[int, list[tuple[float, int]]] = {p: [] for p in claimed}
    start = time.monotonic()
    end = start + DURATION_SEC
    period = 1.0 / POLL_HZ

    try:
        while time.monotonic() < end:
            t = time.monotonic() - start
            for p in claimed:
                v = lgpio.gpio_read(h, p)
                if v != state[p]:
                    print(f"  t={t:5.2f}s  GPIO{p:>2}: {state[p]} -> {v}")
                    transitions[p].append((t, v))
                    state[p] = v
            time.sleep(period)
    finally:
        for p in claimed:
            lgpio.gpio_free(h, p)
        lgpio.gpiochip_close(h)

    print("---")
    summary = [(p, len(ts)) for p, ts in transitions.items() if ts]
    summary.sort(key=lambda x: -x[1])
    if not summary:
        print("No GPIO transitions detected. Button may be wired to a non-GPIO pin, "
              "or the wiring is not making contact. Try again and press firmly.")
    else:
        winner, n = summary[0]
        print(f"DETECTED BUTTON: GPIO{winner}  ({n} transitions)")
        if len(summary) > 1:
            print("Other pins also transitioned (likely floating or noise):")
            for p, n in summary[1:]:
                print(f"  GPIO{p}: {n} transitions")


if __name__ == "__main__":
    main()
