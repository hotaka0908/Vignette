#!/usr/bin/env bash
# Install the Vignette lifelog systemd units on the Pi:
#   - vignette-button.service  (long-running, watches GPIO5)
#   - vignette-capture.service (oneshot) + .timer (every 60s)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_pi_env.sh"

scp -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE" -o StrictHostKeyChecking=accept-new \
    -o "ProxyCommand=tailscale nc %h %p" \
    "$HERE/pi_systemd/vignette-button.service" \
    "$HERE/pi_systemd/vignette-capture.service" \
    "$HERE/pi_systemd/vignette-capture.timer" \
    "$PI_USER@$PI_HOST:/tmp/"

ssh_pi bash -s <<'REMOTE'
set -euo pipefail
sudo mv /tmp/vignette-button.service  /etc/systemd/system/vignette-button.service
sudo mv /tmp/vignette-capture.service /etc/systemd/system/vignette-capture.service
sudo mv /tmp/vignette-capture.timer   /etc/systemd/system/vignette-capture.timer
sudo systemctl daemon-reload
sudo systemctl enable --now vignette-button.service
sudo systemctl enable --now vignette-capture.timer
echo
echo "--- button service ---"
systemctl status vignette-button.service --no-pager -n 5
echo
echo "--- capture timer ---"
systemctl status vignette-capture.timer --no-pager -n 3
REMOTE
