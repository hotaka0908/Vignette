# Vignette

ウェアラブル・ライフログカメラ。ボタンを押すと Pi が即1枚撮影し、その後セッションが終わるまで1分ごとに1枚撮影。もう一度押すとセッション中の全写真を Firebase Storage にアップロード。アップ後は別パイプラインで 15 秒動画に再構成する想定。

> Mac で編集 → GitHub に push → Pi が 5〜10 秒で自動 pull（`scripts/install-autopull.sh` で仕込んだ systemd timer）。

## 仕組み

1. **配線済みボタン (GPIO5) を押す** → `vignette-button.service` が `data/state.json` に `2026-05-23_134205` のような新しい session id を書き込み、**ワンショット撮影を即起動**（短いセッションでも最低 1 枚は残る）。
2. **`state.json` がある間**、`vignette-capture.timer` が 60 秒ごとに `vignette-capture.service` を起動。`python -m vignette.tick` が `state.json` を読み、Picamera2 で 1 枚撮って `data/photos/<session-id>/img_HHMMSS.jpg` に保存。
3. **もう一度ボタンを押す** → `state.json` を削除し、button daemon が `python -m vignette.upload_cli <session-id>` を subprocess で起動。セッションディレクトリ内のすべての `.jpg` を `gs://<bucket>/sessions/<session-id>/` にアップロード。ログは `data/upload.log` に追記。

オンデバイスの Gemini 分析・動画プロンプト生成 (`vignette/analyze.py`, `prompt.py`, `cli.py`, `main.py`) は lifelog daemon **では使われない**。後フェーズ用に残してあり、手動で呼ぶときだけ動く。

## Pi 接続情報

- Tailscale MagicDNS ホスト: `raspberrypi.tailed10f0.ts.net`
- SSH ユーザー: `hotaka`（`hotaka0908` は Tailscale アカウント名で別物）
- Pi 上のパス: `/home/hotaka/vignette`
- 自動 pull: `vignette-pull.timer` が 5 秒ごとに `git fetch && git reset --hard origin/main` を実行。**Pi 上で直接編集した変更は失われます。必ず Mac で編集して push。**
- 既存プロジェクト `~/raspi-voice7` はハッカソン中は停止: `ai-necklace.service` を `stop + disable` 済み（GPIO5・USB オーディオを Vignette が独占できるように）。元に戻すには `sudo systemctl enable --now ai-necklace.service`。

## 初回セットアップ

### 1. Firebase プロジェクトと Storage バケットを作成

1. https://console.firebase.google.com/ → 「プロジェクトを追加」。**個人 Google アカウント**で作成（Workspace アカウントは組織ポリシーでサービスアカウント鍵のダウンロードがブロックされることがある）。
2. 「ビルド > Storage」→「始める」→ 本番モード → リージョン `asia-northeast1`。Firebase Storage は **Blaze (従量課金) プラン必須**。サインアップで $300 無料クレジット + 永続無料枠（5 GB 保存、1 GB/日 転送）があり、ハッカソン規模なら $0 で済む。
3. プロジェクト設定 (⚙) > サービス アカウント → 「新しい秘密鍵を生成」→ JSON をダウンロード。
4. 「Storage > Files」上部に表示されるバケット名を控える。新規プロジェクトは `gs://<project>.firebasestorage.app`、古いものは `gs://<project>.appspot.com`。`gs://` 以降だけメモ。

### 2. Pi に依存をインストール

```bash
./scripts/setup-pi.sh
```

内容:
- apt: `python3-venv python3-dev libportaudio2 libgl1 python3-picamera2 python3-libcamera`
- `venv/` を `--system-site-packages` 付きで作成（apt 経由の `picamera2` が見えるように）
- `requirements.txt` を pip インストール: `opencv-python-headless`, `sounddevice`, `numpy`, `scipy`, `gpiozero`, `lgpio`, `python-dotenv`, `openai`, `requests`, `google-genai`, `firebase-admin`

### 3. Firebase 認証情報を Pi に転送

Mac から (JSON はファイル名で gitignore 済み):

```bash
scp -o "UserKnownHostsFile=$HOME/.ssh/known_hosts_tailscale" \
    -o "ProxyCommand=tailscale nc %h %p" \
    /path/to/your-firebase-adminsdk.json \
    hotaka@raspberrypi.tailed10f0.ts.net:/home/hotaka/vignette/firebase-credentials.json

./scripts/run-pi.sh chmod 600 firebase-credentials.json
```

### 4. Pi 上に `.env` を作成

```bash
./scripts/run-pi.sh "cat > .env <<EOF
VIGNETTE_FIREBASE_CREDENTIALS=/home/hotaka/vignette/firebase-credentials.json
VIGNETTE_FIREBASE_BUCKET=<your-project>.firebasestorage.app
VIGNETTE_BUTTON_GPIO=5
VIGNETTE_CAPTURE_INTERVAL_SEC=60
EOF"
```

`.env` は Vignette の各エントリーポイントで `python-dotenv` 経由で自動ロードされ、systemd ユニットからも `EnvironmentFile=` で読み込まれる。

サポートされる環境変数の完全なリストは `.env.example` を参照。

### 5. lifelog の systemd ユニットをインストール

```bash
./scripts/install-lifelog.sh
```

`scripts/pi_systemd/` 配下の `vignette-button.service`, `vignette-capture.service`, `vignette-capture.timer` を `/etc/systemd/system/` にコピー → `daemon-reload` → 両方を `enable --now`。

自動 pull もまだ未設定なら（通常は済んでいる）:

```bash
./scripts/install-autopull.sh   # vignette-pull.timer — 5 秒ごとに git pull
```

## 使い方

ボタンを押すだけ。

- **アイドル中に押す** → セッション開始。即 1 枚撮影、その後 60 秒ごとに 1 枚、もう一度押すまで継続
- **アクティブ中に押す** → セッション終了、Firebase へアップロード開始

セッションが capture interval (60 秒) より短くても、開始時の即時撮影 1 枚は残る（5 秒のテスト押下でも 1 枚撮影 → 1 枚アップロードされる）。

### モニタリング

```bash
# button daemon (START/STOP イベント)
./scripts/run-pi.sh sudo journalctl -u vignette-button.service -f

# 1分ごとの撮影ログ
./scripts/run-pi.sh sudo journalctl -u vignette-capture.service -n 20

# アップロード subprocess の出力
./scripts/run-pi.sh tail -f data/upload.log

# 現在のセッション状態 (ファイル無し = idle)
./scripts/run-pi.sh cat data/state.json
```

### 手動操作

```bash
# 既存セッションを ID 指定でアップロード
./scripts/run-pi.sh python -m vignette.upload_cli 2026-05-24_041237

# タイマーを待たず即時に撮影トリガー
./scripts/run-pi.sh sudo systemctl start vignette-capture.service
```

## 日常開発フロー

```bash
# Mac で編集
vim vignette/button_daemon.py

# push — Pi が 5〜10 秒で自動 pull
git add -A && git commit -m "..." && git push

# Python コード変更は次回のサービス起動で反映される。
# 常駐の button daemon は明示的に再起動が必要:
./scripts/run-pi.sh sudo systemctl restart vignette-button.service

# systemd ユニットファイル自体を変更したら:
./scripts/install-lifelog.sh
```

## ファイル構成

```
main.py                            # (Phase 2) vignette.cli.run のエントリーポイント
requirements.txt
.env.example
vignette/
├── __init__.py
├── config.py                      # 環境変数 → Config dataclass + load()
├── session_state.py               # data/state.json の atomic read/write/clear
├── storage.py                     # (Phase 2) cli.py 用のセッションパス管理
├── capture.py                     # Picamera2 N 枚撮影ヘルパー
├── tick.py                        # `python -m vignette.tick` — ワンショット撮影
├── button_daemon.py               # `python -m vignette.button_daemon` — 常駐
├── upload.py                      # Firebase Storage アップロードヘルパー
├── upload_cli.py                  # `python -m vignette.upload_cli <session_id>`
├── analyze.py                     # (Phase 2) Gemini 複数画像分析
├── prompt.py                      # (Phase 2) シネマティック動画プロンプト生成
└── cli.py                         # (Phase 2) capture → analyze → prompt オーケストレータ
scripts/
├── _pi_env.sh                     # 他スクリプトが共有する SSH/rsync 設定
├── setup-pi.sh                    # Pi 初回セットアップ (apt + venv + pip)
├── install-lifelog.sh             # button + capture の systemd ユニット設置
├── install-autopull.sh            # vignette-pull.timer (git 自動 pull) 設置
├── run-pi.sh                      # Pi 上で任意コマンド実行 (venv 自動有効化)
├── deploy.sh                      # 手動 rsync (レガシー、通常は不要)
├── find_button.py                 # GPIO 探索 — ボタンが繋がっているピンを特定
├── list_devices.py                # sounddevice でオーディオデバイス一覧
├── test_camera.py                 # Picamera2 で 1 枚撮影 → captures/
├── test_gpio.py                   # 単一 GPIO ボタンを 10 秒ポーリング
├── test_mic.py                    # sounddevice で 3 秒 WAV 録音
├── test_speaker.py                # 440Hz ビープ再生
└── pi_systemd/
    ├── vignette-button.service    # GPIO5 常駐ウォッチャー
    ├── vignette-capture.service   # oneshot — vignette.tick を実行
    ├── vignette-capture.timer     # 60 秒ごとに vignette-capture.service を起動
    ├── vignette-pull.service      # oneshot — git fetch + reset --hard
    └── vignette-pull.timer        # 5 秒ごとに vignette-pull.service を起動
data/                              # gitignore 済み
├── state.json                     # アクティブセッション: {"session_id", "started_at"}
├── photos/<session-id>/img_HHMMSS.jpg ...
└── upload.log                     # upload subprocess の累積出力
firebase-credentials.json          # gitignore 済み (ファイル名で除外)
.env                               # gitignore 済み
```

## メモ

- Pi の CSI ポートには Sony **IMX500** AI カメラが繋がっている。今は `picamera2` で普通のカメラとして使用、オンチップ推論は未使用。
- Phase 2 のオンデバイスパイプライン (`main.py`, `vignette/cli.py`) は `.env` に `GEMINI_API_KEY` が必要。単体実行は `./scripts/run-pi.sh python main.py [--count N] [--skip-capture SESSION_ID] [--skip-analysis]`。
- USB スピーカー (UACDemoV1.0) は 44100 Hz 非対応、48000 Hz が必要。テストスクリプトでは `SAMPLE_RATE=48000` を設定。lifelog daemon 自体では未使用。

---

# Vignette (English)

Wearable lifelog camera. Press a button → Pi snaps one photo immediately and then
one per minute while you wear it. Press again → all photos from that session upload
to Firebase Storage. A separate downstream pipeline turns them into a 15-second video.

> Develop on Mac, push to GitHub, Pi auto-pulls within ~5 seconds via the systemd
> timer set up by `scripts/install-autopull.sh`.

## How it works

1. **Press the wired button (GPIO5)** → `vignette-button.service` writes
   `data/state.json` with a new session id like `2026-05-23_134205` and **launches
   an immediate one-shot capture** so even very short sessions produce at least one
   photo.
2. **While `state.json` exists**, `vignette-capture.timer` fires once per minute and
   runs `vignette-capture.service`, which calls `python -m vignette.tick`.
   Each tick reads `state.json`, captures one photo with Picamera2, and saves it as
   `data/photos/<session-id>/img_HHMMSS.jpg`.
3. **Press the button again** → `state.json` is removed and the button daemon
   launches `python -m vignette.upload_cli <session-id>` as a subprocess. That
   uploads every `.jpg` from the session directory to
   `gs://<bucket>/sessions/<session-id>/`. Output goes to `data/upload.log`.

The on-device Gemini analysis + video-prompt pipeline (`vignette/analyze.py`,
`vignette/prompt.py`, `vignette/cli.py`, `main.py`) is **not** used by the lifelog
daemon. It's kept around for later phases and runs only when invoked manually.

## Pi target

- Tailscale MagicDNS host: `raspberrypi.tailed10f0.ts.net`
- SSH user: `hotaka` (NOT `hotaka0908` — that's the Tailscale account name)
- Path on Pi: `/home/hotaka/vignette`
- Auto-pull: `vignette-pull.timer` does `git fetch && git reset --hard origin/main`
  every 5 seconds. **Uncommitted edits on the Pi are lost.** Always edit on Mac.
- The previous project `~/raspi-voice7` is paused during the hackathon:
  `ai-necklace.service` was stopped + disabled so GPIO5 and the USB audio devices
  are free for Vignette to claim. Re-enable later with
  `sudo systemctl enable --now ai-necklace.service`.

## One-time setup

### 1. Create a Firebase project + Storage bucket

1. https://console.firebase.google.com/ → **Add project**.
   Use a **personal** Google account — work/Workspace accounts may block service
   account key downloads via org policy.
2. **Build > Storage** → **Get started** → production mode → region
   `asia-northeast1`. Firebase Storage now requires the **Blaze (pay-as-you-go)
   plan**; signup gives $300 free credit and the daily free tier
   (5 GB stored, 1 GB/day egress) easily covers hackathon usage.
3. **Project settings (⚙) > Service accounts** → **Generate new private key** →
   download the JSON.
4. **Storage > Files** shows your bucket name at the top, e.g.
   `gs://<project>.firebasestorage.app` (new projects, post-Oct 2024) or
   `gs://<project>.appspot.com` (older projects). Note it down — without the `gs://`.

### 2. Install dependencies on the Pi

```bash
./scripts/setup-pi.sh
```

This installs:
- apt: `python3-venv python3-dev libportaudio2 libgl1 python3-picamera2 python3-libcamera`
- creates `venv/` with `--system-site-packages` so `picamera2` is visible
- pip-installs `requirements.txt`: `opencv-python-headless`, `sounddevice`, `numpy`,
  `scipy`, `gpiozero`, `lgpio`, `python-dotenv`, `openai`, `requests`, `google-genai`,
  `firebase-admin`.

### 3. Copy the Firebase credentials onto the Pi

From Mac (the JSON is gitignored by name):

```bash
scp -o "UserKnownHostsFile=$HOME/.ssh/known_hosts_tailscale" \
    -o "ProxyCommand=tailscale nc %h %p" \
    /path/to/your-firebase-adminsdk.json \
    hotaka@raspberrypi.tailed10f0.ts.net:/home/hotaka/vignette/firebase-credentials.json

./scripts/run-pi.sh chmod 600 firebase-credentials.json
```

### 4. Write `.env` on the Pi

```bash
./scripts/run-pi.sh "cat > .env <<EOF
VIGNETTE_FIREBASE_CREDENTIALS=/home/hotaka/vignette/firebase-credentials.json
VIGNETTE_FIREBASE_BUCKET=<your-project>.firebasestorage.app
VIGNETTE_BUTTON_GPIO=5
VIGNETTE_CAPTURE_INTERVAL_SEC=60
EOF"
```

`.env` is loaded automatically by `python-dotenv` inside every Vignette entrypoint,
and is also picked up by the systemd units via `EnvironmentFile=`.

See `.env.example` for the full list of supported variables.

### 5. Install the lifelog systemd units

```bash
./scripts/install-lifelog.sh
```

Copies `scripts/pi_systemd/vignette-button.service`,
`scripts/pi_systemd/vignette-capture.service`, and
`scripts/pi_systemd/vignette-capture.timer` to `/etc/systemd/system/`, runs
`daemon-reload`, and enables both units at boot.

Also useful (already installed if you set up auto-pull):

```bash
./scripts/install-autopull.sh   # vignette-pull.timer — git pull every 5s
```

## Using it

Just press the button.

- **press while idle** → session starts; first photo captured immediately, then one
  every 60 seconds until you press again
- **press while active** → session ends; all photos in the session dir upload to
  Firebase

If a session is shorter than the capture interval, you still get at least the
immediate first photo (so a 5-second test press produces 1 photo and 1 upload).

### Monitoring

```bash
# button daemon — START/STOP events
./scripts/run-pi.sh sudo journalctl -u vignette-button.service -f

# per-tick capture log
./scripts/run-pi.sh sudo journalctl -u vignette-capture.service -n 20

# upload subprocess output
./scripts/run-pi.sh tail -f data/upload.log

# current session state (empty / not exist = idle)
./scripts/run-pi.sh cat data/state.json
```

### Manual operations

```bash
# upload an existing session by id
./scripts/run-pi.sh python -m vignette.upload_cli 2026-05-24_041237

# kick the capture timer immediately instead of waiting
./scripts/run-pi.sh sudo systemctl start vignette-capture.service
```

## Daily dev workflow

```bash
# edit on Mac
vim vignette/button_daemon.py

# push — Pi auto-pulls in ~5–10 seconds
git add -A && git commit -m "..." && git push

# Python code changes take effect on the next service invocation. For the long-running
# button daemon you need to restart it explicitly:
./scripts/run-pi.sh sudo systemctl restart vignette-button.service

# If you change systemd unit files, re-install them:
./scripts/install-lifelog.sh
```

## File layout

```
main.py                            # (Phase 2) entrypoint for vignette.cli.run
requirements.txt
.env.example
vignette/
├── __init__.py
├── config.py                      # env-var settings (Config dataclass + load())
├── session_state.py               # data/state.json read/write/clear (atomic)
├── storage.py                     # (Phase 2) per-session paths for cli.py
├── capture.py                     # Picamera2 N-shot capture helper
├── tick.py                        # `python -m vignette.tick` — one-shot capture
├── button_daemon.py               # `python -m vignette.button_daemon` — long-running
├── upload.py                      # Firebase Storage upload helper
├── upload_cli.py                  # `python -m vignette.upload_cli <session_id>`
├── analyze.py                     # (Phase 2) Gemini multi-image analysis
├── prompt.py                      # (Phase 2) cinematic video prompt generator
└── cli.py                         # (Phase 2) capture → analyze → prompt orchestrator
scripts/
├── _pi_env.sh                     # shared SSH/rsync env for the other scripts
├── setup-pi.sh                    # one-time Pi bootstrap (apt + venv + pip)
├── install-lifelog.sh             # install button + capture systemd units
├── install-autopull.sh            # install vignette-pull.timer (git auto-pull)
├── run-pi.sh                      # run arbitrary command on Pi (auto-activates venv)
├── deploy.sh                      # manual rsync (legacy, rarely needed)
├── find_button.py                 # GPIO discovery — find which pin the button is on
├── list_devices.py                # list audio devices via sounddevice
├── test_camera.py                 # take a single Picamera2 snapshot to captures/
├── test_gpio.py                   # poll a single GPIO button for 10s
├── test_mic.py                    # record 3s WAV via sounddevice
├── test_speaker.py                # play 440Hz beep
└── pi_systemd/
    ├── vignette-button.service    # long-running GPIO5 watcher
    ├── vignette-capture.service   # oneshot — runs vignette.tick
    ├── vignette-capture.timer     # fires vignette-capture.service every 60s
    ├── vignette-pull.service      # oneshot — git fetch + reset --hard
    └── vignette-pull.timer        # fires vignette-pull.service every 5s
data/                              # gitignored
├── state.json                     # active session: {"session_id", "started_at"}
├── photos/<session-id>/img_HHMMSS.jpg ...
└── upload.log                     # accumulated output of upload subprocesses
firebase-credentials.json          # gitignored by name
.env                               # gitignored
```

## Notes

- The Pi has a Sony **IMX500** AI camera on the CSI port. We use it as a plain
  camera via `picamera2`; on-chip inference is not used.
- The on-device Phase 2 pipeline (`main.py`, `vignette/cli.py`) needs
  `GEMINI_API_KEY` set in `.env`. Run it stand-alone with
  `./scripts/run-pi.sh python main.py [--count N] [--skip-capture SESSION_ID] [--skip-analysis]`.
- USB speaker (UACDemoV1.0) requires 48000 Hz, not 44100 Hz. Set `SAMPLE_RATE=48000`
  for the test scripts. Not used by the lifelog daemon itself.
