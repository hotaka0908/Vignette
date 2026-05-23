// Vignette web viewer — pure static, no Firebase SDK.
// Lists sessions/<id>/img_*.jpg and videos/*.mp4 from Firebase Storage via its
// public REST API. Requires the storage bucket to allow unauthenticated read
// of those paths (see ../storage.rules).

const BUCKET = "vignette-life-b4515.firebasestorage.app";
const API = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const VIDEO_PREFIX = "videos/";

const content = document.getElementById("content");
const back = document.getElementById("back");
const title = document.getElementById("title");
const refreshBtn = document.getElementById("refresh");
const navLinks = document.querySelectorAll("#bottom-nav a");

refreshBtn.addEventListener("click", () => route());
window.addEventListener("popstate", () => route());

// Intercept nav clicks so the page doesn't full-reload between tabs.
navLinks.forEach(a => {
  a.addEventListener("click", e => {
    e.preventDefault();
    const url = new URL(a.href, location.origin);
    if (location.search !== url.search) {
      history.pushState(null, "", url.pathname + url.search);
      route();
    }
  });
});

route();

function route() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab") || "photos";
  const sid = params.get("session");
  const videoName = params.get("video");
  setActiveTab(tab);

  if (tab === "videos") {
    if (videoName) {
      back.hidden = false;
      back.setAttribute("href", "?tab=videos");
      title.textContent = formatVideoTitle(videoName);
      showVideo(videoName);
    } else {
      back.hidden = true;
      title.textContent = "動画";
      showVideoList();
    }
  } else {
    if (sid) {
      back.hidden = false;
      back.setAttribute("href", "?tab=photos");
      title.textContent = formatSession(sid);
      showSession(sid);
    } else {
      back.hidden = true;
      title.textContent = "ライフログ";
      showSessionList();
    }
  }
}

function setActiveTab(tab) {
  navLinks.forEach(a => {
    a.classList.toggle("active", a.dataset.tab === tab);
  });
}

// ---------- Storage REST helpers ----------

async function listPrefix(prefix, delimiter = "/") {
  const url = `${API}?prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent(delimiter)}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`Storage list failed (${r.status}). Check storage.rules — the path must allow public read.`);
  }
  return r.json();
}

function downloadUrl(name, token) {
  return `${API}/${encodeURIComponent(name)}?alt=media&token=${token}`;
}

// ---------- Photos: session list ----------

async function showSessionList() {
  content.innerHTML = `<p class="muted">セッション一覧を読み込み中…</p>`;
  try {
    const data = await listPrefix("sessions/");
    const sessionIds = (data.prefixes || [])
      .map(p => p.replace(/^sessions\//, "").replace(/\/$/, ""))
      .sort()
      .reverse();
    if (sessionIds.length === 0) {
      content.innerHTML = `<div class="empty">セッションがまだありません。<br>ボタンを押してライフログを開始してください。</div>`;
      return;
    }
    content.innerHTML = `<ul class="sessions">${sessionIds.map(id => `
      <li data-id="${id}"><a href="?tab=photos&session=${encodeURIComponent(id)}" data-nav="session">
        <div class="thumb-wrap"><div class="thumb-placeholder"></div></div>
        <div class="meta">
          <div class="title">${formatSession(id)}</div>
          <div class="count">読み込み中…</div>
        </div>
        <div class="chev">›</div>
      </a></li>`).join("")}</ul>`;
    wireInternalLinks();
    await Promise.all(sessionIds.map(id => hydrateSessionCard(id)));
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

async function hydrateSessionCard(id) {
  const li = document.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  if (!li) return;
  try {
    const items = await listSessionPhotos(id);
    const count = items.length;
    li.querySelector(".count").textContent = count > 0 ? `${count} 枚` : "写真なし";
    if (count > 0) {
      const first = items[0];
      const url = downloadUrl(first.name, first.downloadTokens || "");
      li.querySelector(".thumb-wrap").innerHTML = `<img src="${url}" alt="" loading="lazy">`;
    }
  } catch (e) {
    li.querySelector(".count").textContent = "読み込み失敗";
  }
}

async function listSessionPhotos(id) {
  const data = await listPrefix(`sessions/${id}/`);
  return (data.items || [])
    .filter(it => it.name.toLowerCase().endsWith(".jpg"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Photos: single session ----------

async function showSession(id) {
  content.innerHTML = `<p class="muted">写真を読み込み中…</p>`;
  try {
    const items = await listSessionPhotos(id);
    if (items.length === 0) {
      content.innerHTML = `<div class="empty">このセッションには写真がありません。</div>`;
      return;
    }
    const fragments = items.map(it => {
      const url = downloadUrl(it.name, it.downloadTokens || "");
      const stamp = extractTime(it.name);
      return `<a href="${url}" data-full="${url}" class="thumb">
        <img src="${url}" alt="${stamp}" loading="lazy">
        <div class="stamp">${stamp}</div>
      </a>`;
    });
    content.innerHTML = `
      <div class="grid">${fragments.join("")}</div>
      ${generateButtonHtml(id, items.length)}
      ${lightboxHtml()}
    `;
    wireLightbox();
    wireGenerateButton(id);
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function generateButtonHtml(id, count) {
  return `
    <section class="generate">
      <button id="generate-btn" type="button">
        <span class="label">▶ 動画を生成 (${count}枚から)</span>
      </button>
      <div class="status" id="generate-status" aria-live="polite"></div>
    </section>
  `;
}

function wireGenerateButton(sid) {
  const btn = document.getElementById("generate-btn");
  const status = document.getElementById("generate-status");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.querySelector(".label").textContent = "送信中…";
    status.textContent = "";
    status.className = "status";
    try {
      const r = await fetch(`/api/process?sid=${encodeURIComponent(sid)}`, { method: "POST" });
      const bodyText = (await r.text()).trim();
      if (r.ok) {
        status.className = "status ok";
        status.textContent = `生成リクエスト送信完了 ✓${bodyText ? " — " + bodyText : ""}`;
        btn.querySelector(".label").textContent = "✓ 送信済み (もう一度生成)";
        btn.disabled = false;
      } else {
        status.className = "status err";
        status.textContent = `エラー ${r.status}: ${bodyText || "(empty response)"}`;
        btn.querySelector(".label").textContent = "▶ 動画を生成 (再試行)";
        btn.disabled = false;
      }
    } catch (e) {
      status.className = "status err";
      status.textContent = `通信エラー: ${e.message}`;
      btn.querySelector(".label").textContent = "▶ 動画を生成 (再試行)";
      btn.disabled = false;
    }
  });
}

// ---------- Videos ----------

async function showVideoList() {
  content.innerHTML = `<p class="muted">動画を読み込み中…</p>`;
  try {
    const data = await listPrefix(VIDEO_PREFIX);
    const items = (data.items || [])
      .filter(it => /\.(mp4|webm|mov)$/i.test(it.name))
      .sort((a, b) => b.name.localeCompare(a.name));  // newest first by filename
    if (items.length === 0) {
      content.innerHTML = `<div class="empty">
        動画がまだありません。<br>
        写真タブからセッションを開き、「▶ 動画を生成」を押してください。
      </div>`;
      return;
    }
    content.innerHTML = `<ul class="videos">${items.map(it => {
      const fname = it.name.replace(/^videos\//, "");
      const url = downloadUrl(it.name, it.downloadTokens || "");
      const sizeMb = it.size ? (Number(it.size) / 1024 / 1024).toFixed(1) + " MB" : "";
      return `<li><a href="?tab=videos&video=${encodeURIComponent(fname)}" data-nav="video">
        <div class="thumb-wrap video-thumb"><video src="${url}#t=0.5" muted playsinline preload="metadata"></video><div class="play-overlay">▶</div></div>
        <div class="meta">
          <div class="title">${formatVideoTitle(fname)}</div>
          <div class="count">${sizeMb}</div>
        </div>
        <div class="chev">›</div>
      </a></li>`;
    }).join("")}</ul>`;
    wireInternalLinks();
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

async function showVideo(fname) {
  content.innerHTML = `<p class="muted">動画を読み込み中…</p>`;
  try {
    const objectName = VIDEO_PREFIX + fname;
    // We need the downloadToken — fetch the metadata for this single object.
    const metaUrl = `${API}/${encodeURIComponent(objectName)}`;
    const r = await fetch(metaUrl);
    if (!r.ok) throw new Error(`動画情報の取得に失敗 (${r.status})`);
    const meta = await r.json();
    const url = downloadUrl(objectName, meta.downloadTokens || "");
    content.innerHTML = `
      <div class="player-wrap">
        <video controls autoplay playsinline src="${url}"></video>
      </div>
      <div class="player-meta">
        <div>${formatVideoTitle(fname)}</div>
        <a class="dl" href="${url}" download>↓ ダウンロード</a>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

// ---------- Navigation glue ----------

function wireInternalLinks() {
  document.querySelectorAll("a[data-nav]").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const url = new URL(a.href, location.origin);
      history.pushState(null, "", url.pathname + url.search);
      route();
    });
  });
}

function lightboxHtml() {
  return `<div id="lightbox"><button class="close" aria-label="閉じる">✕</button><img alt=""></div>`;
}

function wireLightbox() {
  const box = document.getElementById("lightbox");
  const img = box.querySelector("img");
  const close = box.querySelector(".close");
  document.querySelectorAll("a.thumb").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      img.src = a.dataset.full;
      box.classList.add("open");
    });
  });
  close.addEventListener("click", () => box.classList.remove("open"));
  box.addEventListener("click", e => { if (e.target === box) box.classList.remove("open"); });
}

// ---------- Formatting ----------

function formatSession(id) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}  ${m[2]}:${m[3]}:${m[4]}` : id;
}

function extractTime(objectPath) {
  const fname = objectPath.split("/").pop();
  const m = fname.match(/^img_(\d{2})(\d{2})(\d{2})\.jpg$/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : fname;
}

function formatVideoTitle(fname) {
  // videos/2026-05-24_055333.mp4 → 2026-05-24  05:53:33
  const base = fname.replace(/\.[a-z0-9]+$/i, "");
  const m = base.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}  ${m[2]}:${m[3]}:${m[4]}` : base;
}
