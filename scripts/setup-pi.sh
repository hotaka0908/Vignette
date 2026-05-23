#!/usr/bin/env bash
# One-time Pi setup: deploy, create venv, install system + python deps.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_pi_env.sh"

"$HERE/deploy.sh"

ssh_pi bash -s <<'REMOTE'
set -euo pipefail
cd "$HOME/goggleio"

# System packages needed for OpenCV (libGL etc.), sounddevice (portaudio), and gpiozero (lgpio).
SYSTEM_PKGS="python3-venv python3-dev libportaudio2 libgl1 python3-picamera2 python3-libcamera"
MISSING=""
for p in $SYSTEM_PKGS; do
  dpkg -s "$p" >/dev/null 2>&1 || MISSING="$MISSING $p"
done
if [ -n "$MISSING" ]; then
  echo "installing system packages:$MISSING"
  sudo apt-get update
  sudo apt-get install -y $MISSING
fi

# venv must use --system-site-packages so picamera2/libcamera (apt-installed) are visible.
NEED_RECREATE=0
if [ ! -d venv ]; then
  NEED_RECREATE=1
elif ! venv/bin/python -c "from picamera2 import Picamera2" 2>/dev/null; then
  echo "recreating venv with --system-site-packages so picamera2 is visible"
  rm -rf venv
  NEED_RECREATE=1
fi
if [ "$NEED_RECREATE" = 1 ]; then
  python3 -m venv --system-site-packages venv
fi
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo
echo "Pi setup OK."
echo "Project: $PWD"
python -c "
import cv2, sounddevice
from picamera2 import Picamera2
print('cv2', cv2.__version__, '| sounddevice', sounddevice.__version__, '| picamera2 OK')
"
REMOTE
