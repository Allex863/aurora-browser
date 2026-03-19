const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, BrowserView, ipcMain, shell, session, dialog } = require("electron");

/** @type {BrowserWindow | null} */
let win = null;

/** @type {{ x: number, y: number, width: number, height: number }} */
let viewportBounds = { x: 0, y: 0, width: 800, height: 600 };

/** @type {Map<string, { id: string, view: BrowserView, url: string, internal?: "home" }>} */
const tabs = new Map();

/** @type {string | null} */
let activeTabId = null;

/** @type {Map<string, import("electron").DownloadItem>} */
const downloadItems = new Map();

let viewportReady = false;

const SETTINGS_DEFAULTS = Object.freeze({
  homepage: "about:blank",
  searchEngine: "google", // google | yandex
  downloadDir: null,
  restoreSession: true
});

/** @type {{ homepage: string, searchEngine: string, downloadDir: string | null, restoreSession: boolean }} */
let settings = { ...SETTINGS_DEFAULTS, downloadDir: null, restoreSession: true };

function sessionPath() {
  return path.join(app.getPath("userData"), "session.json");
}

function loadSessionUrls() {
  try {
    const raw = fs.readFileSync(sessionPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.tabs)) {
      return parsed.tabs
        .filter((u) => typeof u === "string" && u.length > 0)
        .slice(0, 20);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveSessionUrls(urls) {
  try {
    fs.mkdirSync(path.dirname(sessionPath()), { recursive: true });
    fs.writeFileSync(sessionPath(), JSON.stringify({ tabs: urls }, null, 2), "utf8");
  } catch {
    // ignore
  }
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    settings = {
      ...SETTINGS_DEFAULTS,
      ...parsed
    };
  } catch {
    settings = { ...SETTINGS_DEFAULTS };
  }

  if (!settings.downloadDir) settings.downloadDir = app.getPath("downloads");
  if (!settings.homepage) settings.homepage = SETTINGS_DEFAULTS.homepage;
  if (!settings.searchEngine) settings.searchEngine = SETTINGS_DEFAULTS.searchEngine;
  if (typeof settings.restoreSession !== "boolean") settings.restoreSession = SETTINGS_DEFAULTS.restoreSession;
}

function saveSettings(next) {
  settings = {
    ...settings,
    ...next
  };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  win?.webContents.send("settings:changed", settings);
}

function isSpecialSchemeUrl(s) {
  return (
    s.startsWith("about:") ||
    s.startsWith("file:") ||
    s.startsWith("data:") ||
    s.startsWith("chrome:") ||
    s.startsWith("edge:") ||
    s.startsWith("view-source:")
  );
}

function searchUrlFor(query) {
  const q = encodeURIComponent(query);
  switch (settings.searchEngine) {
    case "google":
      return `https://www.google.com/search?q=${q}`;
    case "yandex":
      return `https://yandex.ru/search/?text=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function normalizeToUrl(raw) {
  const s = (raw ?? "").trim();
  if (!s) return "about:blank";

  // Важно: about:blank и прочие "внутренние" схемы НЕ должны уходить в поиск
  if (isSpecialSchemeUrl(s)) return s;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
  const looksLikeUrl = hasScheme || s.includes(".");

  if (!looksLikeUrl) {
    return searchUrlFor(s);
  }

  if (hasScheme) return s;
  return `https://${s}`;
}

function rendererHomeUrl() {
  return "app://home";
}

function resolveInternalUrl(url) {
  if (url === "about:blank") return rendererHomeUrl();
  return url;
}

/** @type {BrowserWindow | null} */
let splashWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 450,
    height: 550,
    frame: false,
    transparent: false,
    backgroundColor: "#0d1117",
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const splashPath = path.join(__dirname, "splash.html");
  splashWindow.loadFile(splashPath);
  splashWindow.show();

  return splashWindow;
}

function closeSplashWindow() {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

function ensureWindow() {
  if (win) return win;

  const iconPath = path.join(__dirname, "..", "assets", "icon-512.png");

  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: "#0b0e14",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 16 },
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.on("closed", () => {
    win = null;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Открытие внешних окон — в системном браузере.
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  const rendererPath = path.join(__dirname, "renderer", "index.html");
  win.loadFile(rendererPath);

  return win;
}

function createTab({ url = "about:blank" } = {}) {
  if (!win) ensureWindow();

  const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
  const view = new BrowserView({
    webPreferences: {
      // Вкладки должны быть безопаснее, но функциональны.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true
    }
  });

  // Базовые UX-настройки
  view.webContents.setUserAgent(
    `${view.webContents.getUserAgent()} macos-browser-desktop/0.1`
  );

  view.webContents.on("page-title-updated", () => {
    const title = view.webContents.getTitle() || "Вкладка";
    win?.webContents.send("tab:title", { id, title });
  });

  view.webContents.on("did-navigate", (_e, nextUrl) => {
    const tab = tabs.get(id);
    if (!tab) return;

    // Внутренняя домашняя грузится через file://, но в UI мы держим "about:blank"
    if (tab.internal === "home" && String(nextUrl).startsWith("file:")) {
      win?.webContents.send("tab:url", { id, url: "about:blank" });
      win?.webContents.send("nav:state", navStateFor(id));
      return;
    }

    tab.internal = undefined;
    tab.url = nextUrl;
    win?.webContents.send("tab:url", { id, url: nextUrl });
    win?.webContents.send("nav:state", navStateFor(id));
  });

  view.webContents.on("did-navigate-in-page", (_e, nextUrl) => {
    const tab = tabs.get(id);
    if (!tab) return;

    if (tab.internal === "home" && String(nextUrl).startsWith("file:")) {
      win?.webContents.send("tab:url", { id, url: "about:blank" });
      win?.webContents.send("nav:state", navStateFor(id));
      return;
    }

    tab.internal = undefined;
    tab.url = nextUrl;
    win?.webContents.send("tab:url", { id, url: nextUrl });
    win?.webContents.send("nav:state", navStateFor(id));
  });

  view.webContents.on("did-fail-load", (_e, _ec, _ed, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    win?.webContents.send("tab:loadFailed", { id, url: validatedURL });
  });

  tabs.set(id, { id, view, url: "about:blank", internal: "home" });
  if (url) loadInTab(id, url);
  return id;
}

function navStateFor(id) {
  const t = tabs.get(id);
  if (!t) return { id, canGoBack: false, canGoForward: false, url: "" };
  return {
    id,
    canGoBack: t.view.webContents.canGoBack(),
    canGoForward: t.view.webContents.canGoForward(),
    url: t.url
  };
}

function setActiveTab(id) {
  if (!win) return;
  if (!tabs.has(id)) return;

  activeTabId = id;
  const t = tabs.get(id);

  if (viewportReady) {
    win.setBrowserView(t.view);
    t.view.setBounds(viewportBounds);
    t.view.setAutoResize({ width: true, height: true });
  }

  win.webContents.send("tab:activated", { id });
  win.webContents.send("nav:state", navStateFor(id));
}

function removeTab(id) {
  const t = tabs.get(id);
  if (!t) return;

  if (activeTabId === id) {
    if (win) win.setBrowserView(null);
    activeTabId = null;
  }

  try {
    t.view.webContents.destroy();
  } catch {
    // ignore
  }
  tabs.delete(id);
}

function loadInTab(id, rawUrl) {
  const t = tabs.get(id);
  if (!t) return;

  const normalized = normalizeToUrl(rawUrl);
  const url = resolveInternalUrl(normalized);
  t.url = url;

  if (url === rendererHomeUrl()) {
    t.internal = "home";
    const homePath = path.join(__dirname, "pages", "home.html");
    t.view.webContents.loadFile(homePath).catch(() => {});
    win?.webContents.send("tab:url", { id, url: "about:blank" });
    win?.webContents.send("nav:state", navStateFor(id));
    return;
  }

  t.internal = undefined;
  t.view.webContents.loadURL(url).catch(() => {
    win?.webContents.send("tab:loadFailed", { id, url });
  });
  win?.webContents.send("tab:url", { id, url });
}

function resizeActiveView() {
  if (!win || !activeTabId) return;
  const t = tabs.get(activeTabId);
  if (!t) return;
  // Защита от "нулевых" bounds, которые могут перекрыть UI.
  if (!Number.isFinite(viewportBounds.width) || viewportBounds.width < 320) return;
  if (!Number.isFinite(viewportBounds.height) || viewportBounds.height < 240) return;
  if (!Number.isFinite(viewportBounds.y) || viewportBounds.y < 0) return;
  viewportReady = true;
  if (win.getBrowserView() !== t.view) win.setBrowserView(t.view);
  t.view.setBounds(viewportBounds);
}

app.whenReady().then(() => {
  loadSettings();

  // Создаём splash screen
  createSplashWindow();

  // Создаём основное окно (скрытое, пока splash активен)
  ensureWindow();

  // Обработчик готовности splash
  ipcMain.once('splash:ready', () => {
    // Закрываем splash и сразу показываем основное окно
    closeSplashWindow();
    
    // Показываем основное окно на переднем плане
    if (win) {
      win.showInactive();
      win.show();
      win.focus();
      win.setAlwaysOnTop(true, 'screen-saver');
      setTimeout(() => {
        win.setAlwaysOnTop(false, 'normal');
      }, 100);
    }
  });

  // Downloads (единый менеджер для всех вкладок)
  session.defaultSession.on("will-download", (_event, item, webContents) => {
    const downloadId =
      Math.random().toString(16).slice(2) + Date.now().toString(16);

    const filename = item.getFilename();
    const totalBytes = item.getTotalBytes();
    const baseDir = settings.downloadDir || app.getPath("downloads");
    const safePath = path.join(baseDir, filename);
    item.setSavePath(safePath);

    downloadItems.set(downloadId, item);

    win?.webContents.send("download:created", {
      id: downloadId,
      filename,
      totalBytes,
      path: safePath,
      url: item.getURL()
    });

    item.on("updated", () => {
      win?.webContents.send("download:updated", {
        id: downloadId,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: item.getState(),
        paused: item.isPaused()
      });
    });

    item.once("done", (_e, state) => {
      win?.webContents.send("download:done", {
        id: downloadId,
        state,
        path: item.getSavePath()
      });
      downloadItems.delete(downloadId);
    });

    // Если загрузка инициирована не из активной вкладки, всё равно показываем.
    void webContents;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) ensureWindow();
  });

  // Всегда начинаем с Домашней (как первая вкладка)
  const homeId = createTab({ url: "about:blank" });
  setActiveTab(homeId);

  if (settings.restoreSession) {
    const urls = loadSessionUrls();
    for (const u of urls) createTab({ url: u });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (!settings.restoreSession) return;
  const urls = Array.from(tabs.values())
    .map((t) => t.url)
    .filter((u) => typeof u === "string" && u.length > 0 && u !== rendererHomeUrl());
  saveSessionUrls(urls);
});

ipcMain.handle("tabs:create", (_e, { url } = {}) => {
  const id = createTab({ url: url ?? "about:blank" });
  // если первая вкладка — активируем
  if (!activeTabId) setActiveTab(id);
  return { id };
});

ipcMain.handle("tabs:list", () => {
  const list = Array.from(tabs.values()).map((t) => ({
    id: t.id,
    url: t.url === rendererHomeUrl() ? "about:blank" : t.url
  }));
  return { tabs: list, activeTabId };
});

ipcMain.handle("tabs:close", (_e, { id }) => {
  const ids = Array.from(tabs.keys());
  const idx = ids.indexOf(id);
  const wasActive = activeTabId === id;
  removeTab(id);

  if (tabs.size === 0) {
    const next = createTab({ url: settings.homepage || "https://example.com" });
    setActiveTab(next);
    return { nextActiveId: next };
  }

  if (wasActive) {
    const remaining = Array.from(tabs.keys());
    const pick = remaining[Math.min(idx, remaining.length - 1)];
    setActiveTab(pick);
    return { nextActiveId: pick };
  }

  return { nextActiveId: activeTabId };
});

ipcMain.handle("tabs:activate", (_e, { id }) => {
  setActiveTab(id);
  return { ok: true };
});

ipcMain.handle("nav:go", (_e, { id, url }) => {
  loadInTab(id, url);
  setActiveTab(id);
  return { ok: true };
});

ipcMain.handle("nav:back", (_e, { id }) => {
  const t = tabs.get(id);
  if (!t) return { ok: false };
  if (t.view.webContents.canGoBack()) t.view.webContents.goBack();
  win?.webContents.send("nav:state", navStateFor(id));
  return { ok: true };
});

ipcMain.handle("nav:forward", (_e, { id }) => {
  const t = tabs.get(id);
  if (!t) return { ok: false };
  if (t.view.webContents.canGoForward()) t.view.webContents.goForward();
  win?.webContents.send("nav:state", navStateFor(id));
  return { ok: true };
});

ipcMain.handle("nav:reload", (_e, { id }) => {
  const t = tabs.get(id);
  if (!t) return { ok: false };
  t.view.webContents.reload();
  return { ok: true };
});

ipcMain.on("viewport:setBounds", (_e, bounds) => {
  if (!bounds) return;
  const x = Number.isFinite(bounds.left) ? bounds.left : (Number.isFinite(bounds.x) ? bounds.x : 0);
  const y = Number.isFinite(bounds.top) ? bounds.top : (Number.isFinite(bounds.y) ? bounds.y : 0);
  const w = Number.isFinite(bounds.width) ? bounds.width : 800;
  const h = Number.isFinite(bounds.height) ? bounds.height : 600;

  viewportBounds = {
    x: Math.max(0, Math.floor(x)),
    // Добавляем небольшой безопасный отступ, чтобы контент не "залезал" на табы при масштабировании
    y: Math.max(0, Math.floor(y) + 2),
    width: Math.max(320, Math.floor(w)),
    height: Math.max(240, Math.floor(h))
  };
  resizeActiveView();
});

ipcMain.handle("win:minimize", () => {
  win?.minimize();
  return { ok: true };
});
ipcMain.handle("win:maximize", () => {
  if (!win) return { ok: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { ok: true, maximized: win.isMaximized() };
});
ipcMain.handle("win:close", () => {
  win?.close();
  return { ok: true };
});

ipcMain.handle("view:setVisible", (_e, { visible }) => {
  if (!win) return { ok: false };
  if (!activeTabId) return { ok: true };
  if (visible) {
    setActiveTab(activeTabId);
  } else {
    win.setBrowserView(null);
  }
  return { ok: true };
});

ipcMain.handle("settings:get", () => {
  return { ...settings };
});

ipcMain.handle("settings:set", (_e, next) => {
  saveSettings(next || {});
  return { ok: true, settings: { ...settings } };
});

ipcMain.handle("settings:chooseDownloadDir", async () => {
  if (!win) return { ok: false };
  const res = await dialog.showOpenDialog(win, {
    title: "Выберите папку для загрузок",
    properties: ["openDirectory", "createDirectory"]
  });
  if (res.canceled || !res.filePaths?.[0]) return { ok: false };
  saveSettings({ downloadDir: res.filePaths[0] });
  return { ok: true, downloadDir: res.filePaths[0] };
});

ipcMain.handle("downloads:showInFolder", (_e, { path: filePath }) => {
  if (filePath) shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle("downloads:pause", (_e, { id }) => {
  const item = downloadItems.get(id);
  if (!item) return { ok: false };
  if (!item.isPaused()) item.pause();
  return { ok: true };
});

ipcMain.handle("downloads:resume", (_e, { id }) => {
  const item = downloadItems.get(id);
  if (!item) return { ok: false };
  if (item.isPaused()) item.resume();
  return { ok: true };
});

ipcMain.handle("downloads:cancel", (_e, { id }) => {
  const item = downloadItems.get(id);
  if (!item) return { ok: false };
  try {
    item.cancel();
  } catch {
    // ignore
  }
  return { ok: true };
});

ipcMain.handle("downloads:open", (_e, { path: filePath }) => {
  if (!filePath) return { ok: false };
  shell.openPath(filePath).catch(() => {});
  return { ok: true };
});

// Обработчик готовности splash screen
ipcMain.on("splash:ready", () => {
  // Splash готов, но мы всё равно ждём таймер в app.whenReady()
});
