// Оболочка Weathered_Kiwi: окно Chromium вокруг уже собранного дашборда.
const { app, BrowserWindow, session, shell, Menu, ipcMain, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const updater = require("./updater");
const widgets = require("./widgets");

let mainWin = null;

// Значок окна и панели задач: стеклянный или тональный — тумблер «Liquid Glass
// иконка» в настройках дашборда (wkWindow.setIcon). Выбор помнится в userData,
// чтобы окно открывалось сразу с нужным значком, а не мигало стеклянным до
// загрузки страницы. Значок самого .exe (ярлык, закреплённый в панели задач)
// вшит в файл установщиком, и на лету его Windows сменить не даёт.
const iconFile = () => path.join(app.getPath("userData"), "icon.txt");
function iconKind() {
  try { return fs.readFileSync(iconFile(), "utf8").trim() === "tonal" ? "tonal" : "glass"; } catch { return "glass"; }
}
const iconPath = (kind) => path.join(__dirname, "build", kind === "tonal" ? "icon-tonal.png" : "icon.png");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: "#04070a",
    title: "Weathered_Kiwi",
    icon: iconPath(iconKind()),
    autoHideMenuBar: true,
    fullscreenable: true,
    show: false,
    webPreferences: {
      contextIsolation: true, sandbox: true, backgroundThrottling: true,
      preload: path.join(__dirname, "preload.js"),   // мост обновления, см. updater.js
    },
  });
  mainWin = win;
  // На macOS без меню приложения не работают Cmd+C/V/Q — оставляем самое нужное.
  Menu.setApplicationMenu(process.platform === "darwin" ? Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" },
  ]) : null);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { if (mainWin === win) mainWin = null; });
  // Во весь экран. F11 раньше не работал вовсе: ускоритель «togglefullscreen»
  // живёт в стандартном меню, а меню снято (setApplicationMenu(null)) — вместе
  // с ним пропали и его клавиши. Развёрнутое окно — это ещё не весь экран:
  // заголовок с «свернуть / закрыть» остаётся, убирает его только setFullScreen.
  // Esc выводит из полноэкранного, но только если страница сама его не съела
  // (закрытие окошек дашборда тоже на Esc).
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // Сигнал странице — чтобы кнопка «во весь экран» знала, в каком она положении.
  const tell = () => { if (!win.isDestroyed()) win.webContents.send("wk:fullscreen", win.isFullScreen()); };
  win.on("enter-full-screen", tell);
  win.on("leave-full-screen", tell);
  // Что загрузить — вшитый интерфейс или установленное обновление — решает updater.
  updater.attach(win);
  // Внешние ссылки — в обычный браузер, а не в окно программы.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  return win;
}

function showMain() {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show(); mainWin.focus();
    return;
  }
  createWindow();
}

// Второй запуск ярлыка — поднять уже открытое окно, а не плодить копии:
// с виджетами программа живёт и без главного окна, и второй экземпляр открыл
// бы второй набор виджетов поверх первого.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMain);

  // Без идентификатора приложения Windows не показывает уведомления вовсе
  // (или подписывает их «electron.app.Electron»). Тот же appId, что у установщика.
  if (process.platform === "win32") app.setAppUserModelId("org.windstation.weatheredkiwi");

  app.whenReady().then(() => {
    updater.init();
    // Плата отвечает 403 на запись, если у запроса есть заголовок Origin и он
    // не её собственный. Дашборд, открытый с самой платы, Origin не шлёт; из
    // файла он был бы «null». Убираем заголовок у запросов к http://, чтобы
    // программа вела себя как страница с платы.
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["http://*/*"] }, (details, cb) => {
      const h = { ...details.requestHeaders };
      delete h.Origin;
      cb({ requestHeaders: h });
    });
    // METAR соседних аэродромов (вкладка «Анализ → Прогноз»): служба отвечает
    // без CORS, и браузер такой ответ странице не отдаёт. Чтение открытых
    // сводок погоды — ровно то, что страница и так могла бы показать ссылкой.
    session.defaultSession.webRequest.onHeadersReceived({ urls: ["https://aviationweather.gov/api/*"] }, (details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Access-Control-Allow-Origin": ["*"] } });
    });
    ipcMain.handle("wk:fullscreen-toggle", () => {
      if (!mainWin || mainWin.isDestroyed()) return false;
      mainWin.setFullScreen(!mainWin.isFullScreen());
      return mainWin.isFullScreen();
    });
    ipcMain.handle("wk:set-icon", (_e, kind) => {
      const k = kind === "tonal" ? "tonal" : "glass";
      if (k !== iconKind()) { try { fs.writeFileSync(iconFile(), k); } catch { /* только на этот сеанс */ } }
      if (mainWin && !mainWin.isDestroyed()) mainWin.setIcon(nativeImage.createFromPath(iconPath(k)));
      return k;
    });
    ipcMain.handle("wk:fullscreen-state", () => !!(mainWin && !mainWin.isDestroyed() && mainWin.isFullScreen()));
    widgets.init({ showMain });
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  // Виджеты — тоже окна, поэтому программа живёт, пока открыт хоть один из них.
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
