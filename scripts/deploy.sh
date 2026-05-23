#!/usr/bin/env bash
# Sync the local project to the Pi over Tailscale.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_pi_env.sh"
ROOT="$(cd "$HERE/.." && pwd)"

ssh_pi "mkdir -p '$PI_PATH'"

rsync -avz --delete \
  --exclude 'venv/' \
  --exclude '.venv/' \
  --exclude '__pycache__/' \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'captures/' \
  --exclude 'recordings/' \
  --exclude '.DS_Store' \
  -e "$SSH_CMD_STR" \
  "$ROOT/" "$PI_USER@$PI_HOST:$PI_PATH/"

echo "Deployed to $PI_USER@$PI_HOST:$PI_PATH"
