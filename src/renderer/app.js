const appEl = document.querySelector(".app");
const tabsStrip = document.getElementById("tabsStrip");
const omniboxForm = document.getElementById("omniboxForm");
const urlInput = document.getElementById("urlInput");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const homeBtn = document.getElementById("homeBtn");
const reloadBtn = document.getElementById("reloadBtn");
const newTabBtn = document.getElementById("newTabBtn");
const downloadsBtn = document.getElementById("downloadsBtn");
const settingsBtn = document.getElementById("settingsBtn");
const themeBtn = document.getElementById("themeBtn");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const openExternalBtn = document.getElementById("openExternalBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const viewHost = document.getElementById("viewHost");
const downloadsEl = document.getElementById("downloads");

const downloadsModal = document.getElementById("downloadsModal");
const downloadsList = document.getElementById("downloadsList");
const downloadsCloseBtn = document.getElementById("downloadsCloseBtn");

const searchModal = document.getElementById("searchModal");
const searchList = document.getElementById("searchList");
const searchCloseBtn = document.getElementById("searchCloseBtn");

const settingsModal = document.getElementById("settingsModal");
const homeInput = document.getElementById("homeInput");
const searchSelect = document.getElementById("searchSelect");
const downloadDirInput = document.getElementById("downloadDirInput");
const chooseDownloadDirBtn = document.getElementById("chooseDownloadDirBtn");
const restoreSessionToggle = document.getElementById("restoreSessionToggle");
const settingsCancelBtn = document.getElementById("settingsCancelBtn");
const settingsSaveBtn = document.getElementById("settingsSaveBtn");

const winClose = document.getElementById("winClose");
const winMin = document.getElementById("winMin");
const winMax = document.getElementById("winMax");

/** @type {{id: string, title: string, url: string}[]} */
const tabs = [];
let activeTabId = null;

/** @type {{ homepage: string, searchEngine: string, downloadDir: string | null } | null} */
let settings = null;

/** @type {Map<string, {id: string, filename: string, path: string, totalBytes: number, receivedBytes: number, state: string, paused: boolean}>} */
const downloads = new Map();

// "Свой поиск": быстрый поиск по вкладкам (локально)
const quick = document.createElement("div");
quick.style.position = "fixed";
quick.style.left = "0";
quick.style.right = "0";
quick.style.top = "62px";
quick.style.zIndex = "9999";
quick.style.display = "none";
quick.style.pointerEvents = "none";
quick.innerHTML = `<div class="quick" id="quickBox"><div class="quick__list" id="quickList"></div></div>`;
document.body.appendChild(quick);
const quickBox = quick.querySelector("#quickBox");
const quickList = quick.querySelector("#quickList");

/** @type {{ url: string, title: string, ts: number }[]} */
let historyItems = [];

function pushHistory(url, title) {
  if (!url || url === "about:blank") return;
  const t = title || titleFromUrl(url);
  const now = Date.now();
  historyItems = [{ url, title: t, ts: now }, ...historyItems.filter((x) => x.url !== url)].slice(0, 200);
  try {
    localStorage.setItem("auroraHistory", JSON.stringify(historyItems));
  } catch {
    // ignore
  }
}

function titleFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname) return u.hostname.replace(/^www\./, "");
  } catch {
    // ignore
  }
  if (url === "about:blank") return "Новая вкладка";
  return "Вкладка";
}

function setTheme(theme) {
  appEl.dataset.theme = theme;
  localStorage.setItem("macosBrowserTheme", theme);
  themeBtn.innerHTML =
    theme === "dark"
      ? "<span aria-hidden=\"true\">☾</span>"
      : "<span aria-hidden=\"true\">☼</span>";
}

function toggleTheme() {
  setTheme(appEl.dataset.theme === "dark" ? "light" : "dark");
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) ?? null;
}

function renderTabs() {
  tabsStrip.innerHTML = "";

  for (const t of tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.setAttribute("role", "tab");
    tabEl.setAttribute("aria-selected", t.id === activeTabId ? "true" : "false");
    tabEl.tabIndex = t.id === activeTabId ? 0 : -1;

    const titleEl = document.createElement("div");
    titleEl.className = "tab__title";
    titleEl.textContent = t.title || "Вкладка";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab__close no-drag";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Закрыть вкладку");
    closeBtn.textContent = "×";

    tabEl.addEventListener("click", () => activateTab(t.id));
    tabEl.addEventListener("auxclick", (e) => {
      // Средняя кнопка мыши — закрыть вкладку (как в обычных браузерах)
      if (e.button === 1) closeTab(t.id);
    });
    tabEl.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });
    tabEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") activateTab(t.id);
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(t.id);
    });

    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);
    tabsStrip.appendChild(tabEl);
  }
}

function showQuick(results) {
  if (!results.length) {
    quick.style.display = "none";
    return;
  }
  quickList.innerHTML = "";
  for (const r of results.slice(0, 6)) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "quick__row no-drag";
    row.innerHTML = `<span class="quick__title"></span><span class="quick__url"></span>`;
    row.querySelector(".quick__title").textContent = r.title;
    row.querySelector(".quick__url").textContent = r.url;
    row.addEventListener("click", async () => {
      quick.style.display = "none";
      await activateTab(r.id);
    });
    quickList.appendChild(row);
  }
  quick.style.display = "block";
  quick.style.pointerEvents = "auto";
}

function hideQuick() {
  quick.style.display = "none";
  quick.style.pointerEvents = "none";
}

function openSearchModal(query) {
  const q = (query || "").trim().toLowerCase();
  const results = [];

  // 1) Открытые вкладки
  for (const t of tabs) {
    const title = t.title || "Вкладка";
    const url = t.url || "";
    if (!q || title.toLowerCase().includes(q) || url.toLowerCase().includes(q)) {
      results.push({ kind: "tab", id: t.id, title, url });
    }
  }

  // 2) История
  if (q) {
    for (const h of historyItems) {
      if ((h.title || "").toLowerCase().includes(q) || (h.url || "").toLowerCase().includes(q)) {
        results.push({ kind: "history", title: h.title, url: h.url });
      }
    }
  }

  searchList.innerHTML = "";
  if (!q) {
    const empty = document.createElement("div");
    empty.className = "dl-item";
    empty.textContent = "Введите запрос в адресной строке и нажмите Enter.";
    searchList.appendChild(empty);
  } else if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dl-item";
    empty.textContent = "Ничего не найдено (ищу по вкладкам и истории).";
    searchList.appendChild(empty);
  } else {
    for (const r of results.slice(0, 30)) {
      const item = document.createElement("div");
      item.className = "dl-item";
      const row = document.createElement("div");
      row.className = "dl-item__row";

      const name = document.createElement("div");
      name.className = "dl-item__name";
      name.textContent = r.title;

      const meta = document.createElement("div");
      meta.className = "dl-item__meta";
      meta.textContent = r.kind === "tab" ? "Вкладка" : "История";

      row.appendChild(name);
      row.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "dl-item__actions";

      const openBtn = document.createElement("button");
      openBtn.className = "primary no-drag";
      openBtn.type = "button";
      openBtn.textContent = r.kind === "tab" ? "Перейти" : "Открыть";
      openBtn.addEventListener("click", async () => {
        closeSearchModal();
        if (r.kind === "tab") {
          await activateTab(r.id);
        } else {
          await navigate(r.url);
        }
      });

      actions.appendChild(openBtn);
      item.appendChild(row);
      item.appendChild(actions);
      searchList.appendChild(item);
    }
  }

  searchModal.dataset.open = "true";
  searchModal.setAttribute("aria-hidden", "false");
  window.browserAPI.view.setVisible(false);
}

function closeSearchModal() {
  searchModal.dataset.open = "false";
  searchModal.setAttribute("aria-hidden", "true");
  window.browserAPI.view.setVisible(true);
}

function setStatus(text) {
  // Убрали панель закладок; статус теперь в title окна (и можно расширить позже).
  document.title = text ? `macOS Browser — ${text}` : "macOS Browser";
}

function showOverlay(text, url) {
  overlay.dataset.show = "true";
  overlayText.textContent = text;
  openExternalBtn.dataset.url = url || "";
  copyLinkBtn.dataset.url = url || "";
}

function hideOverlay() {
  overlay.dataset.show = "false";
}

function updateNavButtons({ canGoBack, canGoForward, url } = {}) {
  backBtn.disabled = !canGoBack;
  forwardBtn.disabled = !canGoForward;
  if (typeof url === "string") {
    urlInput.value = url === "about:blank" ? "" : url;
  }
}

async function newTab(url = "about:blank") {
  const { id } = await window.browserAPI.tabs.create(url);
  tabs.push({ id, title: titleFromUrl(url), url });
  activeTabId = id;
  renderTabs();
  showOverlay(url === "about:blank" ? "Новая вкладка" : "Открываем страницу…", url);
  await window.browserAPI.nav.go(id, url);
  await window.browserAPI.tabs.activate(id);
  urlInput.focus({ preventScroll: true });
  urlInput.select();
}

async function activateTab(id) {
  activeTabId = id;
  renderTabs();
  const t = getActiveTab();
  urlInput.value = t?.url === "about:blank" ? "" : (t?.url ?? "");
  showOverlay("Открываем вкладку…", t?.url ?? "");
  await window.browserAPI.tabs.activate(id);
}

async function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);
  renderTabs();

  const res = await window.browserAPI.tabs.close(id);
  if (res?.nextActiveId) {
    activeTabId = res.nextActiveId;
    renderTabs();
  }
}

async function navigate(url) {
  const t = getActiveTab();
  if (!t) return;
  showOverlay("Загрузка…", url);
  setStatus("Загрузка…");
  await window.browserAPI.nav.go(t.id, url);
}

function syncViewportBounds() {
  const rect = viewHost.getBoundingClientRect();
  window.browserAPI.viewport.setBounds({
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
}

omniboxForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = (urlInput.value || "").trim();
  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v) || v.includes(".");
  if (!looksLikeUrl && v.length) {
    openSearchModal(v);
    return;
  }
  navigate(v);
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const t = getActiveTab();
    urlInput.value = t?.url === "about:blank" ? "" : (t?.url ?? "");
    hideQuick();
    urlInput.blur();
  }
});

urlInput.addEventListener("input", () => {
  const q = (urlInput.value || "").trim().toLowerCase();
  if (q.length < 2) {
    hideQuick();
    return;
  }
  // Показываем только для "текста", а не для явных URL
  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(q) || q.includes(".");
  if (looksLikeUrl) {
    hideQuick();
    return;
  }
  const results = tabs
    .map((t) => ({ ...t, title: t.title || "Вкладка" }))
    .filter((t) => (t.title || "").toLowerCase().includes(q) || (t.url || "").toLowerCase().includes(q));
  showQuick(results);
});

backBtn.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t) return;
  await window.browserAPI.nav.back(t.id);
});
forwardBtn.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t) return;
  await window.browserAPI.nav.forward(t.id);
});
homeBtn.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t) return;
  showOverlay("Домашняя…", "about:blank");
  setStatus("Домой");
  await window.browserAPI.nav.go(t.id, "about:blank");
});
reloadBtn.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t) return;
  showOverlay("Обновляем…", t.url);
  await window.browserAPI.nav.reload(t.id);
});
newTabBtn.addEventListener("click", () => newTab("about:blank"));
themeBtn.addEventListener("click", toggleTheme);

function openSettings() {
  if (!settings) return;
  homeInput.value = settings.homepage || "";
  searchSelect.value = settings.searchEngine || "google";
  downloadDirInput.value = settings.downloadDir || "";
  restoreSessionToggle.checked = !!settings.restoreSession;
  settingsModal.dataset.open = "true";
  settingsModal.setAttribute("aria-hidden", "false");
  window.browserAPI.view.setVisible(false);
}

function closeSettings() {
  settingsModal.dataset.open = "false";
  settingsModal.setAttribute("aria-hidden", "true");
  window.browserAPI.view.setVisible(true);
}

settingsBtn.addEventListener("click", openSettings);
settingsCancelBtn.addEventListener("click", closeSettings);
settingsModal.querySelector(".modal__backdrop")?.addEventListener("click", closeSettings);

function openDownloads() {
  downloadsModal.dataset.open = "true";
  downloadsModal.setAttribute("aria-hidden", "false");
  window.browserAPI.view.setVisible(false);
}

function closeDownloads() {
  downloadsModal.dataset.open = "false";
  downloadsModal.setAttribute("aria-hidden", "true");
  window.browserAPI.view.setVisible(true);
}

downloadsBtn.addEventListener("click", openDownloads);
downloadsCloseBtn.addEventListener("click", closeDownloads);
downloadsModal.querySelector(".modal__backdrop")?.addEventListener("click", closeDownloads);

searchCloseBtn.addEventListener("click", closeSearchModal);
searchModal.querySelector(".modal__backdrop")?.addEventListener("click", closeSearchModal);

chooseDownloadDirBtn.addEventListener("click", async () => {
  const res = await window.browserAPI.settings.chooseDownloadDir();
  if (res?.ok && res.downloadDir) {
    downloadDirInput.value = res.downloadDir;
  }
});

settingsSaveBtn.addEventListener("click", async () => {
  const next = {
    homepage: (homeInput.value || "").trim() || "about:blank",
    searchEngine: searchSelect.value || "google",
    restoreSession: !!restoreSessionToggle.checked
  };
  const res = await window.browserAPI.settings.set(next);
  if (res?.ok) {
    settings = res.settings;
    closeSettings();
    setStatus("Настройки сохранены");
    setTimeout(() => setStatus("Готово"), 800);
  }
});

document.querySelectorAll(".bookmark").forEach((b) => {
  b.addEventListener("click", () => {
    const url = b.getAttribute("data-url") ?? "about:blank";
    navigate(url);
  });
});

openExternalBtn.addEventListener("click", async () => {
  const url = openExternalBtn.dataset.url ?? "";
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
});

copyLinkBtn.addEventListener("click", async () => {
  const url = copyLinkBtn.dataset.url ?? "";
  try {
    await navigator.clipboard.writeText(url);
    copyLinkBtn.textContent = "Скопировано";
    setTimeout(() => (copyLinkBtn.textContent = "Скопировать ссылку"), 900);
  } catch {
    copyLinkBtn.textContent = "Не удалось";
    setTimeout(() => (copyLinkBtn.textContent = "Скопировать ссылку"), 900);
  }
});

winClose.addEventListener("click", () => window.browserAPI.win.close());
winMin.addEventListener("click", () => window.browserAPI.win.minimize());
winMax.addEventListener("click", () => window.browserAPI.win.maximize());

window.addEventListener("keydown", (e) => {
  const isMacLike = e.metaKey || e.ctrlKey;
  if (!isMacLike) return;

  if (e.key.toLowerCase() === "l") {
    e.preventDefault();
    urlInput.focus({ preventScroll: true });
    urlInput.select();
  }

  if (e.key.toLowerCase() === "t") {
    e.preventDefault();
    newTab("about:blank");
  }

  if (e.key.toLowerCase() === "w") {
    e.preventDefault();
    if (activeTabId) closeTab(activeTabId);
  }

  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    const t = getActiveTab();
    if (t) window.browserAPI.nav.reload(t.id);
  }
});

window.browserAPI.on.tabTitle(({ id, title }) => {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  t.title = title || t.title || "Вкладка";
  renderTabs();
  pushHistory(t.url, t.title);
});

window.browserAPI.on.tabUrl(({ id, url }) => {
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  t.url = url;
  if (id === activeTabId) urlInput.value = url === "about:blank" ? "" : url;
  pushHistory(t.url, t.title);
});

window.browserAPI.on.tabActivated(({ id }) => {
  activeTabId = id;
  renderTabs();
  const t = getActiveTab();
  if (t) urlInput.value = t.url === "about:blank" ? "" : t.url;
  hideOverlay();
  setStatus("Готово");
});

window.browserAPI.on.navState((state) => {
  if (!state || state.id !== activeTabId) return;
  updateNavButtons(state);
});

window.browserAPI.on.tabLoadFailed(({ id, url }) => {
  if (id !== activeTabId) return;
  showOverlay("Не удалось загрузить страницу.", url);
  setStatus("Ошибка загрузки");
});

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(fixed)} ${units[i]}`;
}

function renderDownloads() {
  downloadsEl.innerHTML = "";
  const items = Array.from(downloads.values()).slice(-4);
  for (const d of items) {
    const percent =
      d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;

    const el = document.createElement("div");
    el.className = "download";

    const top = document.createElement("div");
    top.className = "download__top";

    const name = document.createElement("div");
    name.className = "download__name";
    name.textContent = d.filename;

    const meta = document.createElement("div");
    meta.className = "download__meta";
    meta.textContent =
      d.state === "completed"
        ? "Готово"
        : d.state === "interrupted"
          ? "Ошибка"
          : `${percent}% · ${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`;

    top.appendChild(name);
    top.appendChild(meta);

    const bar = document.createElement("div");
    bar.className = "download__bar";
    const fill = document.createElement("div");
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);

    const actions = document.createElement("div");
    actions.className = "download__actions";

    const showBtn = document.createElement("button");
    showBtn.className = "ghost no-drag";
    showBtn.type = "button";
    showBtn.textContent = "Показать в папке";
    showBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.showInFolder(d.path);
    });

    actions.appendChild(showBtn);

    el.appendChild(top);
    el.appendChild(bar);
    el.appendChild(actions);
    downloadsEl.appendChild(el);
  }
}

function renderDownloadsManager() {
  downloadsList.innerHTML = "";
  const items = Array.from(downloads.values()).reverse();
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dl-item";
    empty.textContent = "Пока нет загрузок.";
    downloadsList.appendChild(empty);
    return;
  }

  for (const d of items) {
    const percent =
      d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;

    const wrap = document.createElement("div");
    wrap.className = "dl-item";

    const row = document.createElement("div");
    row.className = "dl-item__row";

    const name = document.createElement("div");
    name.className = "dl-item__name";
    name.textContent = d.filename;

    const meta = document.createElement("div");
    meta.className = "dl-item__meta";
    meta.textContent =
      d.state === "completed"
        ? "Готово"
        : d.state === "interrupted"
          ? "Ошибка"
          : `${d.paused ? "Пауза" : `${percent}%`} · ${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`;

    row.appendChild(name);
    row.appendChild(meta);

    const bar = document.createElement("div");
    bar.className = "dl-item__bar";
    const fill = document.createElement("div");
    fill.style.width = `${percent}%`;
    bar.appendChild(fill);

    const actions = document.createElement("div");
    actions.className = "dl-item__actions";

    const showBtn = document.createElement("button");
    showBtn.className = "ghost no-drag";
    showBtn.type = "button";
    showBtn.textContent = "Показать в папке";
    showBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.showInFolder(d.path);
    });

    const openBtn = document.createElement("button");
    openBtn.className = "ghost no-drag";
    openBtn.type = "button";
    openBtn.textContent = "Открыть";
    openBtn.disabled = d.state !== "completed";
    openBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.open(d.path);
    });

    const pauseBtn = document.createElement("button");
    pauseBtn.className = "ghost no-drag";
    pauseBtn.type = "button";
    pauseBtn.textContent = "Пауза";
    pauseBtn.disabled = d.state !== "progressing" || d.paused;
    pauseBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.pause(d.id);
    });

    const resumeBtn = document.createElement("button");
    resumeBtn.className = "ghost no-drag";
    resumeBtn.type = "button";
    resumeBtn.textContent = "Продолжить";
    resumeBtn.disabled = d.state !== "progressing" || !d.paused;
    resumeBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.resume(d.id);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ghost no-drag";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Отменить";
    cancelBtn.disabled = d.state !== "progressing";
    cancelBtn.addEventListener("click", async () => {
      await window.browserAPI.downloads.cancel(d.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(showBtn);
    actions.appendChild(pauseBtn);
    actions.appendChild(resumeBtn);
    actions.appendChild(cancelBtn);

    wrap.appendChild(row);
    wrap.appendChild(bar);
    wrap.appendChild(actions);
    downloadsList.appendChild(wrap);
  }
}

window.browserAPI.on.downloadCreated((payload) => {
  const d = {
    id: payload.id,
    filename: payload.filename || "download",
    path: payload.path || "",
    totalBytes: payload.totalBytes || 0,
    receivedBytes: 0,
    state: "progressing",
    paused: false
  };
  downloads.set(d.id, d);
  setStatus("Скачивание…");
  renderDownloads();
  renderDownloadsManager();
});

window.browserAPI.on.downloadUpdated((payload) => {
  const d = downloads.get(payload.id);
  if (!d) return;
  d.receivedBytes = payload.receivedBytes ?? d.receivedBytes;
  d.totalBytes = payload.totalBytes ?? d.totalBytes;
  d.state = payload.state ?? d.state;
  d.paused = payload.paused ?? d.paused;
  renderDownloads();
  renderDownloadsManager();
});

window.browserAPI.on.downloadDone((payload) => {
  const d = downloads.get(payload.id);
  if (!d) return;
  d.state = payload.state === "completed" ? "completed" : "interrupted";
  if (payload.path) d.path = payload.path;
  setStatus(d.state === "completed" ? "Загрузка завершена" : "Ошибка загрузки");
  renderDownloads();
  renderDownloadsManager();
  setTimeout(() => setStatus("Готово"), 1200);
});

// viewport bounds
const ro = new ResizeObserver(() => syncViewportBounds());
ro.observe(viewHost);
window.addEventListener("resize", () => syncViewportBounds());

// init - Always default to dark theme
setTheme("dark");
setStatus("Инициализация…");
hideOverlay();
try {
  const raw = localStorage.getItem("auroraHistory");
  if (raw) historyItems = JSON.parse(raw) || [];
} catch {
  historyItems = [];
}
// Делаем несколько "снимков" после layout, чтобы bounds не были (0,0) на Windows scaling
requestAnimationFrame(() => {
  syncViewportBounds();
  requestAnimationFrame(() => syncViewportBounds());
  setTimeout(() => syncViewportBounds(), 120);
});
(async () => {
  settings = await window.browserAPI.settings.get();
  setStatus("Готово");
  // Если main процесс уже восстановил вкладки — просто отрисуем их, не создавая новую.
  const existing = await window.browserAPI.tabs.list();
  if (existing?.tabs?.length) {
    tabs.length = 0;
    for (const t of existing.tabs) {
      tabs.push({
        id: t.id,
        title: titleFromUrl(t.url),
        url: t.url
      });
    }
    activeTabId = existing.activeTabId || existing.tabs[0].id;
    renderTabs();
    await window.browserAPI.tabs.activate(activeTabId);
    return;
  }

  const startUrl = settings?.homepage || "about:blank";
  await newTab(startUrl);
})();

