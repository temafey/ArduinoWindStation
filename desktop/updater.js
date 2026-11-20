// Обновление интерфейса «по воздуху», без установщика.
//
// Весь дашборд программы — один файл app/index.html. Обновление — это замена
// именно его: оболочка (Electron) меняется редко и ставится установщиком, а
// интерфейс — каждый день. Новый index.html кладётся в папку данных пользователя
// (userData/updates/<версия>/), и окно перечитывает его оттуда. Установленные
// файлы программы не трогаются, права администратора не нужны.
//
// Откуда берётся обновление — «лента»: папка (или адрес) с двумя файлами,
// latest.json и index.html. Ленту собирает desktop/rebuild.ps1 в desktop/feed/, а
// serve-phone.ps1 раздаёт её по сети. Где искать ленту, по порядку:
//   1. переменная окружения WK_UPDATE_FEED;
//   2. файл feed.txt в папке данных программы (одна строка: путь или адрес);
//   3. desktop/feed рядом с исходниками (программа собрана на этой же машине);
//   4. по сети: адрес, найденный в прошлый раз (userData/lan-feed.txt), вшитый при
//      сборке (lan-feed.txt рядом с программой) и этот же компьютер (127.0.0.1).
//      Не отвечает ничего — перебор соседей по сети (порт 8765).
//   5. Google Диск, папка Kiwi_Drop/updates: адреса файлов вшиты в drive-feed.json.
//      Это и есть «обновления везде»: дома первой ответит своя сеть, вне дома — Диск.
//
// Push: если лента — папка на этом компьютере, за latest.json следит fs.watch; если
// по сети — программа держит открытым <лента>/events (Server-Sent Events), и сервер
// сам сообщает о новой версии. Опрос раз в десять минут остаётся запасным.
//
// Доверие: sha256 из latest.json сверяется с файлом до установки — это ловит битый
// файл. Подмену ленты ловит подпись: latest.json из сети (и домашней, и Диска)
// принимается, только если поле sig — верная подпись Ed25519 ключом, который лежит
// лишь на компьютере сборки (feed-sign.js). Открытый ключ — FEED_PUBKEY ниже. Без
// подписи сетевая лента считается молчащей. Локальная папка подписи не требует: кто
// пишет на этот диск, тот и так владеет программой. http пускается только из своей
// сети (127.*, 10.*, 192.168.*, 172.16–31.*), https — откуда угодно.
const { app, ipcMain, net } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const http = require("http");
const rawNet = require("net");
const { spawn } = require("child_process");

const PORT = 8765;
const FEED_PUBKEY = crypto.createPublicKey({
  key: Buffer.from("MCowBQYDK2VwAyEA1A0VEKthK7PaBPQqKD4roxjC+TIBxjCPp18HaSzSl6s=", "base64"),
  format: "der", type: "spki",
});
// Строка обязана совпадать байт в байт с той, что подписывает feed-sign.js.
const feedMessage = (j) => ["wk-feed-v1", j.version, j.file, String(j.sha256).toLowerCase(), j.size].join("\n");
function feedSigned(j) {
  try { return !!j.sig && crypto.verify(null, Buffer.from(feedMessage(j), "utf8"), FEED_PUBKEY, Buffer.from(j.sig, "base64")); }
  catch { return false; }
}

// ---------- самообновление оболочки ----------
// Обновление одного интерфейса не меняет версию программы в «Параметры →
// Приложения»: там версия установщика, которым её ставили. Поэтому есть второй
// уровень — shell.json на Диске (свежий установщик, его версия, хеш и подпись
// Ed25519 над shellMessage). Новее своей оболочки — программа скачивает
// установщик и ставит его тихо (/S), с перезапуском (--force-run).
// Строка обязана совпадать с той, что подписывает feed-sign.js --shell.
const shellMessage = (kind, e) => ["wk-shell-v1", kind, e.version, e.file, String(e.sha256).toLowerCase(), e.size].join("\n");
// Только копия из установщика: рядом лежит его деинсталлятор. Программа, собранная
// на этой машине (desktop/out), пересобирается хуком, ставить поверх неё нечего.
const installedCopy = () => app.isPackaged &&
  fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
let shellInfo = null;   // { version, file, sha256, size } — если на Диске оболочка новее
let feedNotes = null;   // заметки из latest.json: { version, notes, date }

async function checkShell() {
  shellInfo = null;
  if (!driveFiles()["shell.json"]) return false;
  try {
    const e = (JSON.parse(await readText(GDRIVE, "shell.json")) || {}).exe;
    if (!e || !e.sig || !crypto.verify(null, Buffer.from(shellMessage("exe", e), "utf8"), FEED_PUBKEY, Buffer.from(e.sig, "base64"))) return false;
    state.shellLatest = String(e.version);
    if (installedCopy() && cmpVer(e.version, app.getVersion()) > 0) shellInfo = e;
    return true;
  } catch { return false; }
}

// Лента на Google Диске: общего каталога у файлов там нет, только у каждого свой id.
const GDRIVE = "gdrive:";
let driveIds = null;
function driveFiles() {
  if (driveIds === null) {
    try { driveIds = JSON.parse(fs.readFileSync(path.join(__dirname, "drive-feed.json"), "utf8")).files || {}; }
    catch { driveIds = {}; }
  }
  return driveIds;
}
function feedUrl(base, name) {
  if (base === GDRIVE) {
    const id = driveFiles()[name];
    if (!id) throw new Error("на Диске нет файла " + name);
    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  }
  return base.replace(/\/?$/, "/") + name;
}
// latest / reached / checkedAt — что проверка УЗНАЛА, а не только вывод из этого.
// Без них «обновления нет» и «до ленты не достучались» выглядели одинаково, и
// дашборд честно писал «последняя версия», ни с кем не поговорив.
// shell — версия самой программы (установщика), shellLatest — последняя на Диске.
const state = { status: "idle", current: "", info: null, progress: 0, error: "",
                latest: "", reached: false, checkedAt: 0, via: "",
                shell: "", shellLatest: "" };
let feedBase = null;   // откуда пришёл найденный latest.json
let feedSha = "";
let lastGoodBase = ""; // лента, которая отвечала в последний раз (для push по сети)
let lastScan = 0;
let win = null;

const updDir = () => path.join(app.getPath("userData"), "updates");

function cmpVer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// Активное обновление — только если оно новее вшитого в программу интерфейса.
// После переустановки вшитый может оказаться свежее: тогда старая копия в
// userData просто игнорируется, а не «побеждает» из-за того, что она была первой.
function readActive() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(updDir(), "active.json"), "utf8"));
    if (fs.existsSync(j.file) && cmpVer(j.version, app.getVersion()) > 0) return j;
  } catch { /* нет обновления — нормальное состояние */ }
  return null;
}
const currentVersion = () => (readActive() || { version: app.getVersion() }).version;
const appHtml = () => (readActive() || { file: path.join(__dirname, "app", "index.html") }).file;

// ---------- адреса ----------
const isPrivate = (u) => {
  try { return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$)/.test(new URL(u).hostname); } catch { return false; }
};
const isUrl = (s) => s === GDRIVE || /^https:\/\//i.test(s) || (/^http:\/\//i.test(s) && isPrivate(s));

function feedCandidates() {
  const list = [];
  if (process.env.WK_UPDATE_FEED) list.push(process.env.WK_UPDATE_FEED);
  try {
    const t = fs.readFileSync(path.join(app.getPath("userData"), "feed.txt"), "utf8").trim();
    if (t) list.push(t);
  } catch { /* файла нет */ }
  // Собранная программа лежит в desktop/out/<имя>/, лента — в desktop/feed.
  list.push(path.resolve(path.dirname(process.execPath), "..", "..", "feed"));
  list.push(path.join(__dirname, "feed"));
  // Установленная из установщика программа лежит не рядом с исходниками: ленту
  // она берёт по сети у компьютера, где собирается интерфейс.
  for (const f of [path.join(app.getPath("userData"), "lan-feed.txt"), path.join(__dirname, "lan-feed.txt")]) {
    try { const t = fs.readFileSync(f, "utf8").trim(); if (t && !list.includes(t)) list.push(t); } catch { /* файла нет */ }
  }
  list.push(`http://127.0.0.1:${PORT}/feed/`);
  if (driveFiles()["latest.json"]) list.push(GDRIVE);
  return list;
}

// fetch с таймаутом: недоступный адрес в локальной сети иначе висит десятки секунд.
async function fetchT(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await net.fetch(url, { cache: "no-store", signal: ac.signal }); } finally { clearTimeout(t); }
}

async function readText(base, name) {
  if (isUrl(base)) {
    const r = await fetchT(feedUrl(base, name), base === GDRIVE ? 10000 : 3000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  }
  return fs.promises.readFile(path.join(base, name), "utf8");
}

// Файл целиком в память (это один html, ~0.6 МБ) с отчётом о ходе.
async function readFileProgress(base, name, size, onProgress) {
  const chunks = [];
  let got = 0;
  if (isUrl(base)) {
    const r = await fetchT(feedUrl(base, name), 30000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const total = Number(r.headers.get("content-length")) || size || 0;
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value)); got += value.length;
      if (total) onProgress(Math.min(1, got / total));
    }
  } else {
    const p = path.join(base, name);
    const total = (await fs.promises.stat(p)).size;
    await new Promise((resolve, reject) => {
      fs.createReadStream(p).on("data", (c) => { chunks.push(c); got += c.length; onProgress(got / total); })
        .on("end", resolve).on("error", reject);
    });
  }
  return Buffer.concat(chunks);
}

// Соседи по сети: перебор /24 каждого своего IPv4-адреса, порт раздачи открыт — это она.
// Нужно, когда адрес компьютера сменился (другая сеть, DHCP).
function scanLan() {
  return new Promise((resolve) => {
    const hosts = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family === "IPv4" && !a.internal) {
          const pre = a.address.slice(0, a.address.lastIndexOf(".") + 1);
          for (let i = 1; i < 255; i++) hosts.push(pre + i);
        }
      }
    }
    if (!hosts.length) return resolve(null);
    let left = hosts.length, done = false, next = 0, active = 0;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const pump = () => {
      while (active < 48 && next < hosts.length && !done) {
        const h = hosts[next++]; active++;
        const sock = rawNet.connect({ host: h, port: PORT, timeout: 300 });
        let over = false;
        const end = (ok) => {
          if (over) return; over = true;
          sock.destroy(); active--; left--;
          if (ok) finish(`http://${h}:${PORT}/feed/`);
          else if (left <= 0) finish(null);
          else pump();
        };
        sock.once("connect", () => end(true));
        sock.once("timeout", () => end(false));
        sock.once("error", () => end(false));
      }
    };
    pump();
    setTimeout(() => finish(null), 20000);
  });
}

function pub() {
  return { status: state.status, current: state.current, info: state.info,
           progress: state.progress, error: state.error,
           latest: state.latest, reached: state.reached, checkedAt: state.checkedAt, via: state.via,
           shell: app.getVersion(), shellLatest: state.shellLatest };
}
function push() {
  if (win && !win.isDestroyed()) win.webContents.send("wk:state", pub());
  return pub();
}

// Одна попытка по всем адресам. true — какая-то лента ответила.
async function tryFeeds() {
  for (const base of feedCandidates()) {
    try {
      const j = JSON.parse(await readText(base, "latest.json"));
      if (!j || !j.version) continue;
      if (isUrl(base) && !feedSigned(j)) continue;   // неподписанная сетевая лента — как молчащая
      lastGoodBase = base;
      state.latest = String(j.version);
      feedNotes = { version: String(j.version), notes: Array.isArray(j.notes) ? j.notes : [], date: j.date || "" };
      state.via = base === GDRIVE ? "internet" : isUrl(base) ? "lan" : "local";
      if (cmpVer(j.version, state.current) > 0) {
        feedBase = base; feedSha = String(j.sha256 || "");
        state.status = "available"; state.error = ""; state.progress = 0;
        state.info = { version: j.version, notes: Array.isArray(j.notes) ? j.notes : [],
                       date: j.date || "", size: j.size || 0, file: j.file || "index.html" };
      } else {
        state.status = "idle"; state.info = null;
      }
      return true;
    } catch { /* эта лента недоступна — пробуем следующую */ }
  }
  return false;
}

async function check() {
  if (state.status === "downloading" || state.status === "installing") return pub();
  state.current = currentVersion();
  let ok = await tryFeeds();
  // Ни одна лента не ответила: адрес мог смениться. Ищем соседей, но не чаще раза
  // в две минуты — перебор сети не должен идти при каждом опросе.
  if (!ok && Date.now() - lastScan > 120000) {
    lastScan = Date.now();
    const found = await scanLan();
    if (found) {
      try { fs.writeFileSync(path.join(app.getPath("userData"), "lan-feed.txt"), found); } catch { /* только чтение */ }
      ok = await tryFeeds();
    }
  }
  // Ленты нет нигде. Это не «обновлений нет», а «не знаю» — reached=false, и
  // дашборд так и пишет. Последнюю известную версию не стираем: она ещё правда.
  // Оболочка: если на Диске программа новее своей — предлагаем её целиком, а не
  // один интерфейс (в ней тот же интерфейс, только версия в системе станет верной).
  const shellOk = await checkShell();
  if (shellInfo && (!state.info || cmpVer(shellInfo.version, state.info.version) >= 0)) {
    const same = feedNotes && cmpVer(feedNotes.version, shellInfo.version) === 0;
    state.info = { kind: "shell", version: shellInfo.version, notes: same ? feedNotes.notes : [],
                   date: same ? feedNotes.date : "", size: shellInfo.size, file: shellInfo.file };
    state.status = "available"; state.error = ""; state.progress = 0;
  }
  state.reached = ok || shellOk;
  state.checkedAt = Date.now();
  if (!ok && state.status !== "error") { state.status = "idle"; state.info = null; }
  return push();
}

async function install() {
  if ((state.status !== "available" && state.status !== "error") || !state.info) return pub();
  const info = state.info;
  state.status = "downloading"; state.progress = 0; state.error = ""; push();
  if (info.kind === "shell") return installShell(info);
  try {
    const data = await readFileProgress(feedBase, info.file, info.size, (p) => { state.progress = p; push(); });
    if (feedSha && crypto.createHash("sha256").update(data).digest("hex") !== feedSha.toLowerCase()) {
      throw new Error("контрольная сумма не сошлась — файл повреждён");
    }
    state.status = "installing"; state.progress = 1; push();
    const dir = path.join(updDir(), info.version);
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, "index.html");
    await fs.promises.writeFile(file + ".part", data);
    await fs.promises.rename(file + ".part", file);
    await fs.promises.writeFile(path.join(updDir(), "active.json"),
                                JSON.stringify({ version: info.version, file }));
    // Старые копии больше не нужны.
    for (const d of await fs.promises.readdir(updDir())) {
      if (d !== info.version && d !== "active.json") fs.promises.rm(path.join(updDir(), d), { recursive: true, force: true }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 900));   // дать увидеть «Устанавливаю»
    state.current = info.version; state.info = null; state.status = "idle";
    if (win && !win.isDestroyed()) win.loadFile(file);
  } catch (e) {
    state.status = "error"; state.error = String((e && e.message) || e);
    push();
  }
  return pub();
}

// Установщик целиком (~80 МБ): скачать, сверить хеш из подписанного shell.json,
// запустить тихо и выйти — установщик сам закроет остатки и запустит новую версию.
async function installShell(info) {
  try {
    const e = shellInfo;
    if (!e) throw new Error("описание программы устарело — проверьте ещё раз");
    const data = await readFileProgress(GDRIVE, e.file, e.size, (p) => { state.progress = p; push(); });
    // Не сошлось почти всегда потому, что Диск ещё выгружает новый установщик
    // (~80 МБ), а маленький shell.json уже на месте. Ставить такое нельзя.
    if (crypto.createHash("sha256").update(data).digest("hex") !== String(e.sha256).toLowerCase()) {
      throw new Error("новая версия ещё загружается на сервер — попробуйте через пару минут");
    }
    state.status = "installing"; state.progress = 1; push();
    const f = path.join(app.getPath("temp"), `Weathered_Kiwi-Setup-${info.version}.exe`);
    await fs.promises.writeFile(f, data);
    spawn(f, ["/S", "/currentuser", "--force-run"], { detached: true, stdio: "ignore" }).unref();
    setTimeout(() => app.quit(), 1500);
  } catch (err) {
    state.status = "error"; state.error = String((err && err.message) || err);
    push();
  }
  return pub();
}

function attach(w) {
  win = w;
  w.loadFile(appHtml());
}

// ---------- push ----------
// Лента — папка на этом же компьютере: за latest.json просто следим. Папки может
// ещё не быть (лента создаётся при первой сборке), тогда пробуем снова раз в минуту.
function watchFeed() {
  let debounce = null;
  const onChange = (_ev, name) => {
    if (name && name !== "latest.json") return;
    clearTimeout(debounce);
    debounce = setTimeout(() => { check().catch(() => {}); }, 600);
  };
  let watching = 0;
  for (const base of feedCandidates()) {
    if (isUrl(base)) continue;
    try {
      if (!fs.existsSync(base)) continue;
      fs.watch(base, onChange).on("error", () => {});
      watching++;
    } catch { /* папка недоступна — не страшно, останется опрос */ }
  }
  if (!watching) setTimeout(watchFeed, 60 * 1000);
}

// Лента по сети: держим открытым <лента>/events. Сервер пишет туда `event: update`,
// когда в ленте появился новый latest.json. Оборвалось — переподключаемся с
// нарастающей паузой; после нескольких неудач забываем адрес (он мог смениться).
let sseFails = 0;
function listenFeed() {
  // Push умеет только своя раздача по http. У Диска его нет — там остаётся опрос
  // дашборда раз в десять минут и при возвращении в окно.
  if (!/^http:\/\//i.test(lastGoodBase)) { setTimeout(listenFeed, 30 * 1000); return; }
  const url = lastGoodBase.replace(/\/?$/, "/") + "events";
  let ended = false;
  const retry = () => {
    if (ended) return; ended = true;
    sseFails++;
    if (sseFails === 3) {
      try { fs.unlinkSync(path.join(app.getPath("userData"), "lan-feed.txt")); } catch { /* нет */ }
      lastGoodBase = ""; lastScan = 0; check().catch(() => {});
    }
    setTimeout(listenFeed, Math.min(30000, 2000 * (sseFails + 1)));
  };
  const req = http.get(url, { timeout: 45000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); retry(); return; }
    sseFails = 0;
    check().catch(() => {});             // догнать пропущенное, пока не было связи
    let buf = "";
    res.setEncoding("utf8");
    res.on("data", (c) => {
      buf += c;
      if (buf.includes("event: update")) { buf = ""; check().catch(() => {}); }
      if (buf.length > 4000) buf = buf.slice(-200);
    });
    res.on("end", retry);
    res.on("error", retry);
  });
  req.on("timeout", () => req.destroy());
  req.on("error", retry);
}

function init() {
  watchFeed();
  ipcMain.handle("wk:state", () => { state.current = currentVersion(); return pub(); });
  ipcMain.handle("wk:check", () => check());
  ipcMain.handle("wk:install", () => install());
  // Первая проверка сразу после запуска, потом — слушаем ленту по сети.
  setTimeout(() => { check().catch(() => {}).finally(listenFeed); }, 1500);
}

module.exports = { init, attach };
