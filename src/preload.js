const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserAPI", {
  tabs: {
    create: (url) => ipcRenderer.invoke("tabs:create", { url }),
    close: (id) => ipcRenderer.invoke("tabs:close", { id }),
    activate: (id) => ipcRenderer.invoke("tabs:activate", { id }),
    list: () => ipcRenderer.invoke("tabs:list")
  },
  nav: {
    go: (id, url) => ipcRenderer.invoke("nav:go", { id, url }),
    back: (id) => ipcRenderer.invoke("nav:back", { id }),
    forward: (id) => ipcRenderer.invoke("nav:forward", { id }),
    reload: (id) => ipcRenderer.invoke("nav:reload", { id })
  },
  viewport: {
    setBounds: (bounds) => ipcRenderer.send("viewport:setBounds", bounds)
  },
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close")
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (next) => ipcRenderer.invoke("settings:set", next),
    chooseDownloadDir: () => ipcRenderer.invoke("settings:chooseDownloadDir")
  },
  downloads: {
    showInFolder: (filePath) => ipcRenderer.invoke("downloads:showInFolder", { path: filePath }),
    pause: (id) => ipcRenderer.invoke("downloads:pause", { id }),
    resume: (id) => ipcRenderer.invoke("downloads:resume", { id }),
    cancel: (id) => ipcRenderer.invoke("downloads:cancel", { id }),
    open: (filePath) => ipcRenderer.invoke("downloads:open", { path: filePath })
  },
  view: {
    setVisible: (visible) => ipcRenderer.invoke("view:setVisible", { visible: !!visible })
  },
  on: {
    tabTitle: (cb) => ipcRenderer.on("tab:title", (_e, payload) => cb(payload)),
    tabUrl: (cb) => ipcRenderer.on("tab:url", (_e, payload) => cb(payload)),
    tabActivated: (cb) => ipcRenderer.on("tab:activated", (_e, payload) => cb(payload)),
    navState: (cb) => ipcRenderer.on("nav:state", (_e, payload) => cb(payload)),
    tabLoadFailed: (cb) => ipcRenderer.on("tab:loadFailed", (_e, payload) => cb(payload)),
    settingsChanged: (cb) => ipcRenderer.on("settings:changed", (_e, payload) => cb(payload)),
    downloadCreated: (cb) => ipcRenderer.on("download:created", (_e, payload) => cb(payload)),
    downloadUpdated: (cb) => ipcRenderer.on("download:updated", (_e, payload) => cb(payload)),
    downloadDone: (cb) => ipcRenderer.on("download:done", (_e, payload) => cb(payload))
  }
});

