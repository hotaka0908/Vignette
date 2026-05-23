// Vignette web viewer — pure static, no Firebase SDK.
// Lists sessions/<id>/img_*.jpg from Firebase Storage via its public REST API.
// Requires the storage bucket to allow unauthenticated read of paths under /sessions/.

const BUCKET = "vignette-life-b4515.firebasestorage.app";

const API = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;

const content = document.getElementById("content");
const back = document.getElementById("back");
const title = document.getElementById("title");
const refreshBtn = document.getElementById("refresh");

refreshBtn.addEventListener("click", () => route());
window.addEventListener("popstate", () => route());

route();

function route() {
  const params = new URLSearchParams(location.search);
  const sid = params.get("session");
  if (sid) {
    back.hidden = false;
    title.textContent = formatSession(sid);
    showSession(sid);
  } else {
    back.hidden = true;
    title.textContent = "Vignette";
    showSessionList();
  }
}

async function listPrefix(prefix, delimiter = "/") {
  const url = `${API}?prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent(delimiter)}`;
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`Storage list failed (${r.status}). Check storage.rules — sessions/ must allow public read.`);
  }
  return r.json();
}

function downloadUrl(name, token) {
  // name is the encoded object path like "sessions%2F2026-05-24_041237%2Fimg_001.jpg"
  return `${API}/${encodeURIComponent(name)}?alt=media&token=${token}`;
}

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
    // Render skeleton list immediately so the page feels fast,
    // then fill in thumbnails + counts in parallel as each session's listing completes.
    content.innerHTML = `<ul class="sessions">${sessionIds.map(id => `
      <li data-id="${id}"><a href="?session=${encodeURIComponent(id)}">
        <div class="thumb-wrap"><div class="thumb-placeholder"></div></div>
        <div class="meta">
          <div class="title">${formatSession(id)}</div>
          <div class="count">読み込み中…</div>
        </div>
        <div class="chev">›</div>
      </a></li>`).join("")}</ul>`;
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
      const wrap = li.querySelector(".thumb-wrap");
      wrap.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
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

async function showSession(id) {
  content.innerHTML = `<p class="muted">写真を読み込み中…</p>`;
  try {
    const data = await listPrefix(`sessions/${id}/`);
    const items = (data.items || []).filter(it => it.name.toLowerCase().endsWith(".jpg"));
    items.sort((a, b) => a.name.localeCompare(b.name));
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
    content.innerHTML = `<div class="grid">${fragments.join("")}</div>${lightboxHtml()}`;
    wireLightbox();
  } catch (e) {
    content.innerHTML = `<div class="error">${e.message}</div>`;
  }
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

function formatSession(id) {
  // sessions/2026-05-24_041237 → 2026-05-24 04:12:37
  const m = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}  ${m[2]}:${m[3]}:${m[4]}` : id;
}

function extractTime(objectPath) {
  // sessions/<id>/img_HHMMSS.jpg or img_001.jpg
  const fname = objectPath.split("/").pop();
  const m = fname.match(/^img_(\d{2})(\d{2})(\d{2})\.jpg$/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : fname;
}
