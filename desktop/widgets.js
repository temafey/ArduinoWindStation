// Виджеты рабочего стола Windows: маленькие окна без рамки поверх обоев.
//
// Настоящая панель виджетов Windows 11 (Win+W) пускает только упакованные
// MSIX-приложения со своим COM-поставщиком — для Electron это отдельная
// программа на C#. Поэтому виджет здесь — окно: прозрачное, без рамки, без
// кнопки на панели задач, тянется за край и помнит, где стоял.
//
// Два вида, как на Android: «ring» (кольцо, квадрат) и «wide» (панель). Код
// один — раскладку виджет выбирает по пропорциям окна. Размер — три ступени
// в меню и Ctrl+колесо: прозрачное окно Windows за край не тянется (у него нет
// рамки, за которую браться), а resizable на прозрачном окне Electron прямо
// называет ненадёжным.
//
// Данные: открытое главное окно раз в несколько секунд отдаёт кадр (wkw:frame),
// оболочка раздаёт его всем виджетам. Без главного окна виджет сам ходит на
// /api/data по сохранённому адресу — но только при прямой связи: через облако
// HTTP до платы нет.
const { app, BrowserWindow, ipcMain, Menu, screen } = require("electron");
const fs = require("fs");
const path = require("path");

const SIZES = { ring: [190, 190], wide: [380, 180] };
let file = null;
let saved = [];               // [{ id, kind, x, y, w, h, top }]
const wins = new Map();       // id → BrowserWindow
let lastFrame = null;
let hooks = { showMain: () => {} };

function load() {
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch { saved = []; }
  if (!Array.isArray(saved)) saved = [];
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(file, JSON.stringify(saved.map(({ remember, ...r }) => r))); } catch { /* диск занят — сохраним в следующий раз */ }
  }, 400);
}

// Окно, которое стояло на отключённом мониторе, вернулось бы за край экрана
// и пропало бы из виду навсегда.
function onScreen(b) {
  const area = screen.getDisplayMatching(b).workArea;
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - b.width);
  const y = Math.min(Math.max(b.y, area.y), area.y + area.height - b.height);
  return { ...b, x, y };
}

function open(rec) {
  const [dw, dh] = SIZES[rec.kind] || SIZES.ring;
  const area = screen.getPrimaryDisplay().workArea;
  const b = onScreen({
    width: rec.w || dw, height: rec.h || dh,
    x: rec.x ?? area.x + area.width - (rec.w || dw) - 24 - wins.size * 24,
    y: rec.y ?? area.y + 24 + wins.size * 24,
  });
  const w = new BrowserWindow({
    ...b,
    frame: false, transparent: true, backgroundColor: "#00000000",
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: !!rec.top, hasShadow: false,
    title: "Weathered_Kiwi · виджет",
    webPreferences: {
      contextIsolation: true, sandbox: true,
      preload: path.join(__dirname, "widget-preload.js"),
    },
  });
  w.loadFile(path.join(__dirname, "widget.html"), { query: { kind: rec.kind } });
  wins.set(rec.id, w);
  const remember = () => {
    if (w.isDestroyed()) return;
    const r = w.getBounds();
    Object.assign(rec, { x: r.x, y: r.y, w: r.width, h: r.height });
    save();
  };
  w.on("moved", remember);
  w.on("resized", remember);
  rec.remember = remember;
  w.on("closed", () => wins.delete(rec.id));
  w.webContents.once("did-finish-load", () => { if (lastFrame) w.webContents.send("wkw:frame", lastFrame); });
  return w;
}

function add(kind) {
  const rec = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: SIZES[kind] ? kind : "ring", top: false };
  saved.push(rec);
  save();
  open(rec);
  return list();
}

function remove(id) {
  saved = saved.filter((r) => r.id !== id);
  save();
  const w = wins.get(id);
  if (w && !w.isDestroyed()) w.close();
}

// Размер — множитель от исходного, от 0.7 до 2.
function scale(rec, w, k) {
  const [dw, dh] = SIZES[rec.kind] || SIZES.ring;
  rec.k = Math.max(0.7, Math.min(2, k));
  const r = w.getBounds();
  w.setBounds(onScreen({ x: r.x, y: r.y, width: Math.round(dw * rec.k), height: Math.round(dh * rec.k) }));
  rec.remember && rec.remember();
}

function list() { return saved.map(({ id, kind, top }) => ({ id, kind, top })); }

function idOf(sender) {
  for (const [id, w] of wins) if (!w.isDestroyed() && w.webContents === sender) return id;
  return null;
}

function init(h) {
  hooks = { ...hooks, ...h };
  file = path.join(app.getPath("userData"), "widgets.json");
  load();
  for (const rec of saved) open(rec);

  ipcMain.on("wkw:frame", (_e, json) => {
    lastFrame = json;
    for (const w of wins.values()) if (!w.isDestroyed()) w.webContents.send("wkw:frame", json);
  });
  ipcMain.handle("wkw:open", (_e, kind) => add(kind));
  ipcMain.handle("wkw:list", () => list());
  ipcMain.handle("wkw:close-all", () => { for (const r of [...saved]) remove(r.id); return list(); });
  // Меню по правой кнопке: всё управление виджетом — здесь, а не кнопками на
  // нём самом. На стекле размером с ладонь любая кнопка — это мусор.
  ipcMain.on("wkw:menu", (e) => {
    const id = idOf(e.sender);
    const rec = saved.find((r) => r.id === id);
    const w = wins.get(id);
    if (!rec || !w) return;
    Menu.buildFromTemplate([
      { label: "Открыть Weathered_Kiwi", click: () => hooks.showMain() },
      { type: "separator" },
      { label: "Поверх всех окон", type: "checkbox", checked: !!rec.top,
        click: (m) => { rec.top = m.checked; w.setAlwaysOnTop(rec.top); save(); } },
      { label: "Кольцо", type: "radio", checked: rec.kind === "ring",
        click: () => { rec.kind = "ring"; scale(rec, w, rec.k || 1); } },
      { label: "Панель", type: "radio", checked: rec.kind === "wide",
        click: () => { rec.kind = "wide"; scale(rec, w, rec.k || 1); } },
      { type: "separator" },
      ...[["Маленький", 0.8], ["Средний", 1], ["Большой", 1.4]].map(([label, k]) => ({
        label, type: "radio", checked: Math.abs((rec.k || 1) - k) < 0.05, click: () => scale(rec, w, k),
      })),
      { type: "separator" },
      { label: "Убрать виджет", click: () => remove(id) },
    ]).popup({ window: w });
  });
  ipcMain.on("wkw:open-main", () => hooks.showMain());
  // Перетаскивание — руками, а не -webkit-app-region: drag. Область
  // перетаскивания Windows забирает себе и правую кнопку (показывает системное
  // меню окна), и тогда своё меню виджета не открыть ничем.
  ipcMain.on("wkw:move", (e, x, y) => {
    const w = wins.get(idOf(e.sender));
    if (w && Number.isFinite(x) && Number.isFinite(y)) w.setPosition(Math.round(x), Math.round(y));
  });
  ipcMain.on("wkw:zoom", (e, dir) => {
    const id = idOf(e.sender), rec = saved.find((r) => r.id === id), w = wins.get(id);
    if (rec && w) scale(rec, w, (rec.k || 1) * (dir > 0 ? 1.1 : 1 / 1.1));
  });
}

module.exports = { init };
