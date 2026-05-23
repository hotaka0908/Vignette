# Shared SSH/rsync settings for Pi over Tailscale.
# Source this from other scripts: . "$(dirname "$0")/_pi_env.sh"
PI_USER="${PI_USER:-hotaka}"
PI_HOST="${PI_HOST:-raspberrypi.tailed10f0.ts.net}"
PI_PATH="${PI_PATH:-/home/hotaka/goggleio}"

KNOWN_HOSTS_FILE="${KNOWN_HOSTS_FILE:-$HOME/.ssh/known_hosts_tailscale}"
mkdir -p "$(dirname "$KNOWN_HOSTS_FILE")"
touch "$KNOWN_HOSTS_FILE"

SSH_OPTS=(
  -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE"
  -o "StrictHostKeyChecking=accept-new"
  -o "ProxyCommand=tailscale nc %h %p"
)

ssh_pi() { ssh "${SSH_OPTS[@]}" "$PI_USER@$PI_HOST" "$@"; }

# rsync needs -e with a single string
SSH_CMD_STR="ssh -o UserKnownHostsFile=$KNOWN_HOSTS_FILE -o StrictHostKeyChecking=accept-new -o ProxyCommand='tailscale nc %h %p'"
