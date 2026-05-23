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
      title.textContent = "Videos";
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
      title.textContent = "Lifelog";
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
  content.innerHTML = `<p class="muted">Loading sessions…</p>`;
  try {
    const data = await listPrefix("sessions/");
    const sessionIds = (data.prefixes || [])
      .map(p => p.replace(/^sessions\//, "").replace(/\/$/, ""))
      .sort()
      .reverse();
    if (sessionIds.length === 0) {
      content.innerHTML = `<div class="empty">No sessions yet.<br>Press the button to start a lifelog.</div>`;
      return;
    }
    content.innerHTML = `<ul class="sessions">${sessionIds.map(id => `
      <li data-id="${id}"><a href="?tab=photos&session=${encodeURIComponent(id)}" data-nav="session">
        <div class="thumb-wrap"><div class="thumb-placeholder"></div></div>
        <div class="meta">
          <div class="title">${formatSession(id)}</div>
          <div class="count">Loading…</div>
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
    li.querySelector(".count").textContent = count > 0 ? `${count} ${count === 1 ? "photo" : "photos"}` : "No photos";
    if (count > 0) {
      const first = items[0];
      const url = downloadUrl(first.name, first.downloadTokens || "");
      li.querySelector(".thumb-wrap").innerHTML = `<img src="${url}" alt="" loading="lazy">`;
    }
  } catch (e) {
    li.querySelector(".count").textContent = "Failed to load";
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
  content.innerHTML = `<p class="muted">Loading photos…</p>`;
  try {
    const items = await listSessionPhotos(id);
    if (items.length === 0) {
      content.innerHTML = `<div class="empty">This session has no photos.</div>`;
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
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4"></polygon>
        </svg>
        <span class="label">Generate video (from ${count} ${count === 1 ? "photo" : "photos"})</span>
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
    btn.querySelector(".label").textContent = "Sending…";
    status.textContent = "";
    status.className = "status";
    try {
      const r = await fetch(`/api/process?sid=${encodeURIComponent(sid)}`, { method: "POST" });
      const bodyText = (await r.text()).trim();
      if (r.ok) {
        status.className = "status ok";
        status.textContent = `Generation request sent${bodyText ? " — " + bodyText : ""}`;
        btn.querySelector(".label").textContent = "Sent — generate again";
        btn.disabled = false;
      } else {
        status.className = "status err";
        status.textContent = `Error ${r.status}: ${bodyText || "(empty response)"}`;
        btn.querySelector(".label").textContent = "Generate video (retry)";
        btn.disabled = false;
      }
    } catch (e) {
      status.className = "status err";
      status.textContent = `Network error: ${e.message}`;
      btn.querySelector(".label").textContent = "Generate video (retry)";
      btn.disabled = false;
    }
  });
}

// ---------- Videos ----------

async function showVideoList() {
  content.innerHTML = `<p class="muted">Loading videos…</p>`;
  try {
    const data = await listPrefix(VIDEO_PREFIX);
    const items = (data.items || [])
      .filter(it => /\.(mp4|webm|mov)$/i.test(it.name))
      .sort((a, b) => b.name.localeCompare(a.name));  // newest first by filename
    if (items.length === 0) {
      content.innerHTML = `<div class="empty">
        No videos yet.<br>
        Open a session in the Photos tab and press "Generate video".
      </div>`;
      return;
    }
    content.innerHTML = `<ul class="videos">${items.map(it => {
      const fname = it.name.replace(/^videos\//, "");
      const url = downloadUrl(it.name, it.downloadTokens || "");
      const sizeMb = it.size ? (Number(it.size) / 1024 / 1024).toFixed(1) + " MB" : "";
      return `<li><a href="?tab=videos&video=${encodeURIComponent(fname)}" data-nav="video">
        <div class="thumb-wrap video-thumb"><video src="${url}#t=0.5" muted playsinline preload="metadata"></video><div class="play-overlay"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></div></div>
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
  content.innerHTML = `<p class="muted">Loading video…</p>`;
  try {
    const objectName = VIDEO_PREFIX + fname;
    // We need the downloadToken — fetch the metadata for this single object.
    const metaUrl = `${API}/${encodeURIComponent(objectName)}`;
    const r = await fetch(metaUrl);
    if (!r.ok) throw new Error(`Failed to fetch video metadata (${r.status})`);
    const meta = await r.json();
    const url = downloadUrl(objectName, meta.downloadTokens || "");
    content.innerHTML = `
      <div class="player-wrap">
        <video controls autoplay playsinline src="${url}"></video>
        <button id="share-btn" class="share-btn" type="button" aria-label="Share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
        </button>
      </div>
      <div class="player-meta">
        <div>${formatVideoTitle(fname)}</div>
        <a class="dl" href="${url}" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download</span>
        </a>
      </div>
      <div class="share-status" id="share-status" aria-live="polite"></div>
    `;
    wireShareButton(url, fname);
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
}

function wireShareButton(url, fname) {
  const btn = document.getElementById("share-btn");
  const status = document.getElementById("share-status");
  btn.addEventListener("click", () => shareVideo(btn, status, url, fname));
}

async function shareVideo(btn, status, url, fname) {
  status.className = "share-status";
  status.textContent = "";
  btn.disabled = true;
  const safeName = fname.replace(/[^a-z0-9._-]/gi, "_");
  const title = "Vignette — Lifelog video";
  const text = "A 15-second video generated from today's lifelog.";

  // 1) Preferred path on iOS/Android: share the video file itself via OS share sheet,
  // which exposes TikTok / Instagram / X / LINE / etc.
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function") {
    try {
      status.textContent = "Loading video…";
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], safeName, { type: blob.type || "video/mp4" });
      const shareData = { files: [file], title, text };
      if (navigator.canShare(shareData)) {
        status.textContent = "";
        await navigator.share(shareData);
        flash(status, "ok", "Share sheet opened");
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") {
        flash(status, "", "");  // user cancelled, no error
        return;
      }
      // fall through to URL share / clipboard
    }
  }

  // 2) Fallback: share just the URL via the share sheet (some browsers).
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title, text });
      flash(status, "ok", "Share sheet opened (link only)");
      return;
    } catch (e) {
      if (e.name === "AbortError") {
        flash(status, "", "");
        return;
      }
    }
  }

  // 3) Last resort: copy URL to clipboard.
  try {
    await navigator.clipboard.writeText(url);
    flash(status, "ok", "Link copied. Paste it into your target app.");
  } catch (e) {
    flash(status, "err", `Share failed: ${e.message}`);
  }
}

function flash(el, kind, msg) {
  el.className = "share-status" + (kind ? " " + kind : "");
  el.textContent = msg;
  if (msg) {
    setTimeout(() => {
      if (el.textContent === msg) {
        el.textContent = "";
        el.className = "share-status";
      }
    }, 4000);
  }
  const btn = document.getElementById("share-btn");
  if (btn) btn.disabled = false;
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
  return `<div id="lightbox"><button class="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><img alt=""></div>`;
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
