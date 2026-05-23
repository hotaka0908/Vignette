#!/usr/bin/env bash
# Run a command on the Pi inside the project dir, with the venv activated.
#   ./scripts/run-pi.sh python main.py
#   ./scripts/run-pi.sh python scripts/test_camera.py
#   ./scripts/run-pi.sh sudo systemctl stop ai-necklace.service
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_pi_env.sh"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command...>" >&2
  exit 2
fi

# If the command starts with `python` or `pip`, route it through the venv.
REMOTE_CMD="cd '$PI_PATH' && [ -f venv/bin/activate ] && . venv/bin/activate; $*"
ssh_pi "$REMOTE_CMD"
