# Vignette

Wearable lifelog camera. Press a button → Pi takes one photo per minute while you wear it.
Press again → upload the session's photos to Firebase Storage. From there a separate pipeline
turns them into a 15-second video.

> Develop on Mac, push to GitHub, Pi auto-pulls within ~5 seconds via systemd timer.

## How it works

1. Press the wired button (GPIO5) → `vignette-button.service` writes `data/state.json`
   with a new session id like `2026-05-23_134205`
2. `vignette-capture.timer` fires every 60s. If a session is active, it takes one photo
   with Picamera2 into `data/photos/<session-id>/img_HHMMSS.jpg`
3. Press the button again → state is cleared, and an upload subprocess pushes every
   photo of that session to `gs://<bucket>/sessions/<session-id>/`

The on-device Gemini analysis + video-prompt pipeline (`vignette/analyze.py`, `prompt.py`)
is kept for later phases but not used by the lifelog daemon.

## Pi target

- Host: `raspberrypi.tailed10f0.ts.net`
- User: `hotaka`
- Path: `/home/hotaka/vignette` (this repo, auto-pulled from `main`)
- `ai-necklace.service` (raspi-voice7) is stopped + disabled during the hackathon so
  GPIO5 and the USB audio are free for Vignette.

## One-time setup

### 1. Create a Firebase project + Storage bucket

1. https://console.firebase.google.com/ → new project
2. **Build > Storage** → Get started → production mode → region `asia-northeast1`
3. **Project settings > Service accounts** → Generate new private key → download JSON
4. Note the bucket name shown in **Storage > Files** (looks like `<project>.appspot.com`)

### 2. Install on the Pi

```bash
./scripts/setup-pi.sh
```

Installs apt deps + Python deps including `firebase-admin`, `picamera2`, etc.

### 3. Copy your Firebase credentials onto the Pi

From Mac (don't commit the JSON):

```bash
scp -o "ProxyCommand=tailscale nc %h %p" \
    /path/to/firebase-credentials.json \
    hotaka@raspberrypi.tailed10f0.ts.net:/home/hotaka/vignette/firebase-credentials.json
```

### 4. Set env vars on the Pi

```bash
./scripts/run-pi.sh 'cat > .env <<EOF
VIGNETTE_FIREBASE_CREDENTIALS=/home/hotaka/vignette/firebase-credentials.json
VIGNETTE_FIREBASE_BUCKET=<your-project>.appspot.com
VIGNETTE_BUTTON_GPIO=5
VIGNETTE_CAPTURE_INTERVAL_SEC=60
EOF'
```

### 5. Install the lifelog systemd units

```bash
./scripts/install-lifelog.sh
```

Enables `vignette-button.service` (long-running) and `vignette-capture.timer` (every 60s).

## Using it

Just press the button. That's it.

- **press while idle** → session starts; photos collect every 60s
- **press while active** → session ends; photos upload to Firebase

Monitor progress from Mac:

```bash
# button daemon activity
./scripts/run-pi.sh sudo journalctl -u vignette-button.service -f

# per-tick capture log
./scripts/run-pi.sh sudo journalctl -u vignette-capture.service -n 20

# upload log (subprocess output)
./scripts/run-pi.sh tail -f data/upload.log

# what's the current session state?
./scripts/run-pi.sh cat data/state.json
```

## Daily dev workflow

```bash
# edit on Mac
vim vignette/button_daemon.py

# push — Pi auto-pulls in ~5s, then systemd restarts the affected service if needed
git add -A && git commit -m "..." && git push

# if you change systemd units, re-run:
./scripts/install-lifelog.sh
```

## File layout

```
vignette/
├── config.py             # env-var settings
├── session_state.py      # state.json read/write
├── capture.py            # Picamera2 N-shot capture
├── button_daemon.py      # long-running GPIO5 watcher
├── tick.py               # one-shot capture invoked by timer
├── upload.py             # Firebase Storage uploader
├── upload_cli.py         # `python -m vignette.upload_cli <session_id>`
├── analyze.py            # (Phase 2) Gemini image analysis
├── prompt.py             # (Phase 2) video prompt generation
└── cli.py                # (Phase 2) one-shot capture+analyze+prompt CLI
scripts/
├── setup-pi.sh           # one-time Pi bootstrap
├── install-lifelog.sh    # install button + capture systemd units
├── install-autopull.sh   # install git-pull systemd timer
├── run-pi.sh             # run arbitrary command on Pi
├── deploy.sh             # manual rsync (legacy)
├── find_button.py        # GPIO discovery scanner
└── pi_systemd/           # systemd unit files
data/
├── state.json            # active session (created/removed by button daemon)
├── photos/<session-id>/img_HHMMSS.jpg ...
└── upload.log            # output of upload subprocess
```

## Notes

- The Pi has a Sony **IMX500** AI camera. We use it as a plain camera via `picamera2`.
- The systemd timer `vignette-pull.timer` does `git reset --hard origin/main` every 5s —
  **uncommitted edits made on the Pi will be discarded**. Always edit on Mac.
- The Phase-2 modules (`analyze.py`, `prompt.py`, `cli.py`) need `GEMINI_API_KEY` and
  are independent of the daemon. Run them with `python main.py [--skip-capture <id>]`.
