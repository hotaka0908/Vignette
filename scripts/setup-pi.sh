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
SYSTEM_PKGS="python3-venv python3-dev libportaudio2 libatlas-base-dev libgl1 liblgpio1"
MISSING=""
for p in $SYSTEM_PKGS; do
  dpkg -s "$p" >/dev/null 2>&1 || MISSING="$MISSING $p"
done
if [ -n "$MISSING" ]; then
  echo "installing system packages:$MISSING"
  sudo apt-get update
  sudo apt-get install -y $MISSING
fi

if [ ! -d venv ]; then
  python3 -m venv venv
fi
. venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo
echo "Pi setup OK."
echo "Project: $PWD"
python -c "import cv2, sounddevice, gpiozero; print('cv2', cv2.__version__, 'sd', sounddevice.__version__, 'gpiozero', gpiozero.__version__)"
REMOTE
