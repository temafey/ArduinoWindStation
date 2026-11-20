// Мост между окном и оболочкой: обновление, полный экран и виджеты рабочего стола.
// Страница работает в песочнице без Node, и этот список — всё, до чего она дотянется.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wkUpdater", {
  state: () => ipcRenderer.invoke("wk:state"),
  check: () => ipcRenderer.invoke("wk:check"),
  install: () => ipcRenderer.invoke("wk:install"),
  onState: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("wk:state", h);
    return () => ipcRenderer.removeListener("wk:state", h);
  },
});

contextBridge.exposeInMainWorld("wkWindow", {
  toggleFullscreen: () => ipcRenderer.invoke("wk:fullscreen-toggle"),
  isFullscreen: () => ipcRenderer.invoke("wk:fullscreen-state"),
  onFullscreen: (cb) => {
    const h = (_e, v) => cb(v);
    ipcRenderer.on("wk:fullscreen", h);
    return () => ipcRenderer.removeListener("wk:fullscreen", h);
  },
});

// Виджеты Windows: дашборд раз в несколько секунд отдаёт последний кадр,
// оболочка раздаёт его окошкам на рабочем столе.
contextBridge.exposeInMainWorld("wkWidget", {
  push: (json) => ipcRenderer.send("wkw:frame", String(json)),
  open: (kind) => ipcRenderer.invoke("wkw:open", kind),
  closeAll: () => ipcRenderer.invoke("wkw:close-all"),
  list: () => ipcRenderer.invoke("wkw:list"),
});
