# Goggleio

Raspberry Pi hackathon project — camera + mic + speaker + GPIO.
Develop on Mac, deploy to Pi over Tailscale.

## Pi target

- Host (Tailscale MagicDNS): `raspberrypi.tailed10f0.ts.net`
- User: `hotaka`
- Path: `/home/hotaka/goggleio`
- Existing `raspi-voice7` / `ai-necklace.service` is untouched

## Quick start

```bash
# one-time: set up the Pi (creates dir, venv, installs deps)
./scripts/setup-pi.sh

# everyday loop: edit on Mac, push to Pi, run
./scripts/deploy.sh
./scripts/run-pi.sh python main.py
```

## Hardware notes

The existing `ai-necklace.service` holds the USB mic (card 3) and USB speaker (card 2)
exclusively. Before testing audio in this project:

```bash
./scripts/run-pi.sh sudo systemctl stop ai-necklace.service
# ... do audio work ...
./scripts/run-pi.sh sudo systemctl start ai-necklace.service
```

Detected on Pi:
- Camera: `/dev/video0`
- Mic: ALSA card 3 (USB PnP Sound Device)
- Speaker: ALSA card 2 (UACDemoV1.0)
- GPIO: `/dev/gpiochip0`
