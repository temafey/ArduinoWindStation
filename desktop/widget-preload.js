// Мост виджета рабочего стола: принять кадр, открыть меню, позвать главное окно.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wkw", {
  onFrame: (cb) => ipcRenderer.on("wkw:frame", (_e, json) => cb(json)),
  menu: () => ipcRenderer.send("wkw:menu"),
  openMain: () => ipcRenderer.send("wkw:open-main"),
  moveTo: (x, y) => ipcRenderer.send("wkw:move", x, y),
  zoom: (dir) => ipcRenderer.send("wkw:zoom", dir),
});
