# Vignette

Lifelog → cinematic 15-second video prompt.
The Pi Camera takes a few photos, Gemini reads them as a "wearable-camera lifelog",
and the result is summarized into a short video-generation prompt in English.

> Develop on Mac, push to GitHub, Pi auto-pulls within ~5 seconds via systemd timer.

## What it does

1. Take N photos (default 5) at a fixed interval (default 3s) with Picamera2
2. Save them under `data/photos/<session-id>/img_001.jpg ...`
3. Send the photos to **Gemini 2.5 Flash** and ask for a structured lifelog analysis
   (highlights, location, atmosphere, emotions, key scenes, one-line summary)
4. Save the analysis as `data/analysis/<session-id>.json`
5. Call Gemini again to turn the analysis into a single 15-second cinematic video prompt
   (English, with `cinematic`, `emotional`, `realistic`, `wearable camera perspective`)
6. Save the prompt to `data/prompts/<session-id>.txt`
7. Print today's highlights + the video prompt to the CLI

## Pi target

- Host: `raspberrypi.tailed10f0.ts.net`
- User: `hotaka`
- Path: `/home/hotaka/vignette` (this repo, auto-pulled from `main`)
- Existing `raspi-voice7` / `ai-necklace.service` is untouched

## Setup (one-time, per Pi)

```bash
./scripts/setup-pi.sh
```

This installs apt deps (picamera2, libcamera, libportaudio, ...) and creates a venv
with `--system-site-packages` (required so `picamera2` is visible from venv).

Then set your API key in a `.env` file at the repo root on the Pi (NOT committed):

```bash
./scripts/run-pi.sh "echo 'GEMINI_API_KEY=YOUR_KEY' >> .env"
```

Get a key from https://aistudio.google.com/app/apikey.

## Daily workflow

```bash
# 1. edit on Mac
vim vignette/cli.py

# 2. push — Pi pulls automatically within ~5–10s
git add -A && git commit -m "..." && git push

# 3. run on Pi
./scripts/run-pi.sh python main.py
```

## CLI

```
python main.py [--count N] [--interval SEC] [--skip-analysis]
               [--skip-capture SESSION_ID] [-v]
```

- `--skip-analysis` — capture only, no Gemini call (useful before setting the API key)
- `--skip-capture SESSION_ID` — reuse photos from a previous session

## Example output

```
今日のハイライト：
- カフェで作業している
- 街を歩いている
- 人と会話している

一言でいうと: 都市の中で人と関わりながら過ごした穏やかな1日

15秒動画生成プロンプト：
A cinematic 15-second realistic video reconstructed from wearable camera lifelog photos ...
```

## File layout

```
vignette/
├── config.py       # env-var driven settings
├── storage.py      # per-session directory layout
├── capture.py      # Picamera2 N-shot capture
├── analyze.py      # Gemini vision → structured JSON
├── prompt.py       # JSON → cinematic English video prompt
└── cli.py          # orchestrator with the CLI output above
main.py             # entrypoint
data/
├── photos/<session-id>/img_001.jpg ...
├── analysis/<session-id>.json
└── prompts/<session-id>.txt
scripts/            # Pi deploy + hardware test helpers
```

## Notes

- The Pi has a Sony **IMX500** AI camera on the CSI port; we use it as a plain camera
  via `picamera2`. On-chip inference is not used yet.
- The systemd timer `vignette-pull.timer` does `git fetch && git reset --hard origin/main`
  every 5 seconds — **uncommitted edits made on the Pi will be discarded**. Always edit on Mac.
- The existing `ai-necklace.service` holds the USB mic + speaker exclusively. Vignette
  itself doesn't use audio, so it doesn't conflict — keep ai-necklace running as-is.
