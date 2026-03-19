// Aurora Browser Mobile - JavaScript

const appEl = document.querySelector(".app");
const tabsStrip = document.getElementById("tabsStrip");
const omniboxForm = document.getElementById("omniboxForm");
const urlInput = document.getElementById("urlInput");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const homeBtn = document.getElementById("homeBtn");
const newTabBtn = document.getElementById("newTabBtn");
const downloadsBtn = document.getElementById("downloadsBtn");
const settingsBtn = document.getElementById("settingsBtn");
const bookmarksBtn = document.getElementById("bookmarksBtn");
const menuBtn = document.getElementById("menuBtn");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const webView = document.getElementById("webView");
const viewport = document.getElementById("viewport");

// Модальные окна
const menuModal = document.getElementById("menuModal");
const menuCloseBtn = document.getElementById("menuCloseBtn");
const downloadsModal = document.getElementById("downloadsModal");
const downloadsList = document.getElementById("downloadsList");
const downloadsCloseBtn = document.getElementById("downloadsCloseBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const settingsSaveBtn = document.getElementById("settingsSaveBtn");
const historyModal = document.getElementById("historyModal");
const historyCloseBtn = document.getElementById("historyCloseBtn");
const historyList = document.getElementById("historyList");
const historyClearBtn = document.getElementById("historyClearBtn");

// Кнопки меню
const themeBtn = document.getElementById("themeBtn");
const historyBtn = document.getElementById("historyBtn");
const shareBtn = document.getElementById("shareBtn");
const addToHomeBtn = document.getElementById("addToHomeBtn");

// Настройки
const homeInput = document.getElementById("homeInput");
const searchSelect = document.getElementById("searchSelect");
const adBlockToggle = document.getElementById("adBlockToggle");
const nightModeToggle = document.getElementById("nightModeToggle");

/** @type {{id: string, title: string, url: string}[]} */
const tabs = [];
let activeTabId = null;
let currentTabCounter = 0;

/** @type {{ homepage: string, searchEngine: string, adBlock: boolean, nightMode: boolean }} */
let settings = {
  homepage: "about:blank",
  searchEngine: "google",
  adBlock: false,
  nightMode: false
};

/** @type {{ url: string, title: string, ts: number }[]} */
let historyItems = [];

/** @type {Map<string, {id: string, filename: string, url: string, state: string}>} */
const downloads = new Map();

// Загрузка истории
function loadHistory() {
  try {
    const raw = localStorage.getItem("auroraMobileHistory");
    if (raw) historyItems = JSON.parse(raw) || [];
  } catch {
    historyItems = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem("auroraMobileHistory", JSON.stringify(historyItems));
  } catch {
    // ignore
  }
}

function pushHistory(url, title) {
  if (!url || url === "about:blank") return;
  const t = title || titleFromUrl(url);
  const now = Date.now();
  historyItems = [{ url, title: t, ts: now }, ...historyItems.filter((x) => x.url !== url)].slice(0, 100);
  saveHistory();
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

// Тема
function setTheme(theme) {
  appEl.dataset.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("auroraMobileTheme", theme);
  themeBtn.querySelector(".menu-item__icon").textContent = theme === "dark" ? "☾" : "☼";
}

function toggleTheme() {
  setTheme(appEl.dataset.theme === "dark" ? "light" : "dark");
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) ?? null;
}

// Рендеринг вкладок
function renderTabs() {
  tabsStrip.innerHTML = "";

  for (const t of tabs) {
    const tabEl = document.createElement("div");
    tabEl.className = "tab";
    tabEl.setAttribute("aria-selected", t.id === activeTabId ? "true" : "false");

    const titleEl = document.createElement("div");
    titleEl.className = "tab__title";
    titleEl.textContent = t.title || "Вкладка";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab__close";
    closeBtn.type = "button";
    closeBtn.textContent = "×";

    tabEl.addEventListener("click", () => activateTab(t.id));
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(t.id);
    });

    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);
    tabsStrip.appendChild(tabEl);
  }

  // Прокрутка к активной вкладке
  const activeTab = tabsStrip.querySelector('[aria-selected="true"]');
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

// Показать оверлей
function showOverlay(text) {
  overlay.dataset.show = "true";
  overlayText.textContent = text;
  setTimeout(() => hideOverlay(), 2000);
}

function hideOverlay() {
  overlay.dataset.show = "false";
}

// Навигация
function updateNavButtons() {
  // Для iframe навигация ограничена
  backBtn.disabled = true;
  forwardBtn.disabled = true;
}

// Создание новой вкладки
function newTab(url = "about:blank") {
  currentTabCounter++;
  const id = `tab-${currentTabCounter}-${Date.now()}`;
  tabs.push({ id, title: "Новая вкладка", url: "about:blank" });
  activeTabId = id;
  renderTabs();
  loadHomePage();
  return id;
}

// Активация вкладки
function activateTab(id) {
  activeTabId = id;
  renderTabs();
  const t = getActiveTab();
  if (t) {
    urlInput.value = t.url === "about:blank" ? "" : t.url;
    loadUrlInWebView(t.url);
  }
}

// Закрытие вкладки
function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    newTab("about:blank");
  } else if (activeTabId === id) {
    const newIdx = Math.min(idx, tabs.length - 1);
    activateTab(tabs[newIdx].id);
  } else {
    renderTabs();
  }
}

// Загрузка URL в WebView
function loadUrlInWebView(url) {
  if (url === "about:blank") {
    webView.src = "home.html";
    hideOverlay();
    return;
  }

  showOverlay("Загрузка…");
  
  // Проверка, является ли URL поисковым запросом
  const looksLikeUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) || url.includes(".");
  let finalUrl = url;
  
  if (!looksLikeUrl && url.trim().length > 0) {
    // Это поисковый запрос
    finalUrl = searchUrlFor(url.trim());
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    finalUrl = `https://${url}`;
  }

  try {
    webView.src = finalUrl;
    urlInput.value = finalUrl;
    
    // Обновляем URL активной вкладки
    const t = getActiveTab();
    if (t) {
      t.url = finalUrl;
      t.title = titleFromUrl(finalUrl);
      renderTabs();
      pushHistory(finalUrl, t.title);
    }
  } catch (e) {
    showOverlay("Ошибка загрузки");
  }
}

function searchUrlFor(query) {
  const q = encodeURIComponent(query);
  switch (settings.searchEngine) {
    case "yandex":
      return `https://yandex.ru/search/?text=${q}`;
    case "bing":
      return `https://www.bing.com/search?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

// Загрузка домашней страницы
function loadHomePage() {
  webView.src = "home.html";
  urlInput.value = "";
  const t = getActiveTab();
  if (t) {
    t.url = "about:blank";
    t.title = "Домашняя";
    renderTabs();
  }
  hideOverlay();
}

// Обработчики событий
omniboxForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = (urlInput.value || "").trim();
  if (!v) return;
  loadUrlInWebView(v);
  urlInput.blur();
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const t = getActiveTab();
    urlInput.value = t?.url === "about:blank" ? "" : (t?.url ?? "");
    urlInput.blur();
  }
});

backBtn.addEventListener("click", () => {
  try {
    webView.contentWindow?.history?.back();
  } catch {
    // ignore
  }
});

forwardBtn.addEventListener("click", () => {
  try {
    webView.contentWindow?.history?.forward();
  } catch {
    // ignore
  }
});

reloadBtn.addEventListener("click", () => {
  try {
    webView.contentWindow?.location?.reload();
  } catch {
    webView.src = webView.src;
  }
  showOverlay("Обновление…");
});

homeBtn.addEventListener("click", loadHomePage);
newTabBtn.addEventListener("click", () => newTab("about:blank"));

// Меню
function openMenu() {
  menuModal.dataset.open = "true";
  menuModal.setAttribute("aria-hidden", "false");
}

function closeMenu() {
  menuModal.dataset.open = "false";
  menuModal.setAttribute("aria-hidden", "true");
}

menuBtn.addEventListener("click", openMenu);
menuCloseBtn.addEventListener("click", closeMenu);
menuModal.querySelector(".modal__backdrop")?.addEventListener("click", closeMenu);

// Кнопки меню
themeBtn.addEventListener("click", () => {
  toggleTheme();
  closeMenu();
});

historyBtn.addEventListener("click", () => {
  openHistory();
  closeMenu();
});

shareBtn.addEventListener("click", async () => {
  const t = getActiveTab();
  if (!t || t.url === "about:blank") return;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: t.title,
        url: t.url
      });
    } catch {
      // ignore
    }
  } else {
    await navigator.clipboard.writeText(t.url);
    showOverlay("Ссылка скопирована");
  }
  closeMenu();
});

addToHomeBtn.addEventListener("click", () => {
  showOverlay("Добавьте на главный экран через меню браузера");
  closeMenu();
});

// Загрузки
function openDownloads() {
  renderDownloadsManager();
  downloadsModal.dataset.open = "true";
  downloadsModal.setAttribute("aria-hidden", "false");
}

function closeDownloads() {
  downloadsModal.dataset.open = "false";
  downloadsModal.setAttribute("aria-hidden", "true");
}

downloadsBtn.addEventListener("click", openDownloads);
downloadsCloseBtn.addEventListener("click", closeDownloads);
downloadsModal.querySelector(".modal__backdrop")?.addEventListener("click", closeDownloads);

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
    const wrap = document.createElement("div");
    wrap.className = "dl-item";

    const row = document.createElement("div");
    row.className = "dl-item__row";

    const name = document.createElement("div");
    name.className = "dl-item__name";
    name.textContent = d.filename;

    const meta = document.createElement("div");
    meta.className = "dl-item__meta";
    meta.textContent = d.state === "completed" ? "Готово" : "Загрузка";

    row.appendChild(name);
    row.appendChild(meta);
    wrap.appendChild(row);
    downloadsList.appendChild(wrap);
  }
}

// Настройки
function openSettings() {
  homeInput.value = settings.homepage || "";
  searchSelect.value = settings.searchEngine || "google";
  adBlockToggle.checked = !!settings.adBlock;
  nightModeToggle.checked = !!settings.nightMode;
  settingsModal.dataset.open = "true";
  settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  settingsModal.dataset.open = "false";
  settingsModal.setAttribute("aria-hidden", "true");
}

settingsBtn.addEventListener("click", openSettings);
settingsCloseBtn.addEventListener("click", closeSettings);
settingsModal.querySelector(".modal__backdrop")?.addEventListener("click", closeSettings);

settingsSaveBtn.addEventListener("click", () => {
  settings = {
    homepage: (homeInput.value || "").trim() || "about:blank",
    searchEngine: searchSelect.value || "google",
    adBlock: !!adBlockToggle.checked,
    nightMode: !!nightModeToggle.checked
  };
  
  try {
    localStorage.setItem("auroraMobileSettings", JSON.stringify(settings));
  } catch {
    // ignore
  }
  
  closeSettings();
  showOverlay("Настройки сохранены");
});

// История
function openHistory() {
  renderHistory();
  historyModal.dataset.open = "true";
  historyModal.setAttribute("aria-hidden", "false");
}

function closeHistory() {
  historyModal.dataset.open = "false";
  historyModal.setAttribute("aria-hidden", "true");
}

historyCloseBtn.addEventListener("click", closeHistory);
historyModal.querySelector(".modal__backdrop")?.addEventListener("click", closeHistory);

function renderHistory() {
  historyList.innerHTML = "";
  
  if (historyItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dl-item";
    empty.textContent = "История пуста.";
    historyList.appendChild(empty);
    return;
  }

  for (const h of historyItems.slice(0, 50)) {
    const wrap = document.createElement("div");
    wrap.className = "dl-item";
    wrap.style.cursor = "pointer";

    const row = document.createElement("div");
    row.className = "dl-item__row";

    const name = document.createElement("div");
    name.className = "dl-item__name";
    name.textContent = h.title;

    const meta = document.createElement("div");
    meta.className = "dl-item__meta";
    meta.textContent = h.url;

    row.appendChild(name);
    row.appendChild(meta);
    wrap.appendChild(row);
    
    wrap.addEventListener("click", () => {
      loadUrlInWebView(h.url);
      closeHistory();
    });
    
    historyList.appendChild(wrap);
  }
}

historyClearBtn.addEventListener("click", () => {
  historyItems = [];
  saveHistory();
  renderHistory();
  showOverlay("История очищена");
});

// Закладки (простая реализация)
bookmarksBtn.addEventListener("click", () => {
  const bookmarks = [
    { url: "https://www.google.com", title: "Google" },
    { url: "https://www.youtube.com", title: "YouTube" },
    { url: "https://github.com", title: "GitHub" },
    { url: "https://vk.com", title: "VK" }
  ];
  
  // Временная реализация - просто показываем первую закладку
  if (bookmarks.length > 0) {
    loadUrlInWebView(bookmarks[0].url);
    showOverlay("Открываем закладки...");
  }
});

// Обработка загрузки iframe
webView.addEventListener("load", () => {
  hideOverlay();
});

webView.addEventListener("error", () => {
  showOverlay("Ошибка загрузки страницы");
});

// Инициализация
function loadSettings() {
  try {
    const raw = localStorage.getItem("auroraMobileSettings");
    if (raw) {
      settings = { ...settings, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  
  if (settings.nightMode) {
    appEl.dataset.theme = "dark";
  }
}

function init() {
  loadSettings();
  loadHistory();
  
  // Загружаем тему
  const savedTheme = localStorage.getItem("auroraMobileTheme");
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    setTheme("dark");
  }
  
  // Создаем первую вкладку
  newTab("about:blank");
  
  // Обработка жестов
  let touchStartX = 0;
  let touchEndX = 0;
  
  viewport.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  
  viewport.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
  
  function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Свайп влево - назад
        backBtn.click();
      } else {
        // Свайп вправо - вперёд
        forwardBtn.click();
      }
    }
  }
}

// Запуск
init();
