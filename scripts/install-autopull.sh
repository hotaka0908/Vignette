#!/usr/bin/env bash
# Install the systemd timer on the Pi that pulls Vignette every 5 seconds.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_pi_env.sh"

scp -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE" -o StrictHostKeyChecking=accept-new \
    -o "ProxyCommand=tailscale nc %h %p" \
    "$HERE/pi_systemd/vignette-pull.service" \
    "$HERE/pi_systemd/vignette-pull.timer" \
    "$PI_USER@$PI_HOST:/tmp/"

ssh_pi bash -s <<'REMOTE'
set -euo pipefail
sudo mv /tmp/vignette-pull.service /etc/systemd/system/vignette-pull.service
sudo mv /tmp/vignette-pull.timer   /etc/systemd/system/vignette-pull.timer
sudo systemctl daemon-reload
sudo systemctl enable --now vignette-pull.timer
echo "--- timer ---"
systemctl status vignette-pull.timer --no-pager -n 3
echo "--- first run ---"
systemctl status vignette-pull.service --no-pager -n 5 || true
REMOTE
