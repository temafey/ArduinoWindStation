// Журнал станции в браузере: минутные агрегаты, суточные сводки и события.
//
// До сих пор всё, что дашборд знал о ветре, жило в памяти вкладки и умирало
// с перезагрузкой: роза «за сеанс», график за пару минут. Статистика, рекорды,
// экспорт, «сегодня против вчера» и показ при офлайне станции требуют одного и
// того же — помнить. IndexedDB, а не localStorage: год минут это полмиллиона
// записей, а localStorage синхронный и упирается в 5 МБ.
//
// Три хранилища, ключ у всех начинается со станции (stationKey) — у двух мачт
// разные журналы:
//   min — минута: n, avg, min, max, gust, dir (векторное среднее) и, если
//         есть, давление, батарея, RSSI, loopMax, sseDrop. Хранится 400 дней;
//   day — сутки (по местному времени): n, sum, max, gust и гистограмма
//         минутных средних по 1 м/с — из неё строятся распределение за любой
//         период, Вейбулл и энергия, не поднимая сотни тысяч минут;
//   ev  — события: перезагрузки, смена аплинка, облако, калибровка, тревоги.
//
// ⚠️ Пишется только настоящая станция. Демо и «район» сюда не попадают:
// выдуманный ветер в журнале испортил бы рекорды навсегда, и по записи этого
// потом не отличить.
const DB_NAME = "wind_log";
const KEEP_DAYS = 400;
const HIST_BINS = 41;          // 0…40 м/с, последняя корзина — «40 и выше»

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        d.createObjectStore("min", { keyPath: ["k", "t"] });
        d.createObjectStore("day", { keyPath: ["k", "d"] });
        d.createObjectStore("ev", { keyPath: ["k", "t", "n"] });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(null);
      rq.onblocked = () => resolve(null);
    } catch { resolve(null); }       // приватный режим, старый WebView
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve) => {
    if (!d) { resolve(null); return; }
    try {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch { resolve(null); }
  }));
}

function range(store, k, from, to) {
  return db().then((d) => new Promise((resolve) => {
    if (!d) { resolve([]); return; }
    try {
      const rq = d.transaction(store).objectStore(store)
        .getAll(IDBKeyRange.bound([k, from], [k, to]));
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => resolve([]);
    } catch { resolve([]); }
  }));
}

// Сутки — по местному времени: «самый ветреный день» человек меряет своим
// календарём, а не гринвичским.
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- запись ----------
let acc = null;              // текущая минута
const listeners = new Set();
function emit() { for (const f of listeners) f(); }
export function onLog(f) { listeners.add(f); return () => listeners.delete(f); }

// Раз в секунду: одна выборка ветра и то, что есть в кадре.
export function logSample(k, speed, gust, dir, frame) {
  if (!k || !Number.isFinite(speed)) return;
  const now = Date.now();
  const t = Math.floor(now / 60000) * 60000;
  if (acc && (acc.k !== k || acc.t !== t)) flush();
  if (!acc) acc = { k, t, n: 0, sum: 0, min: Infinity, max: 0, gust: 0, dx: 0, dy: 0, dn: 0, p: 0, pn: 0, extra: {} };
  acc.n++; acc.sum += speed;
  acc.min = Math.min(acc.min, speed);
  acc.max = Math.max(acc.max, speed);
  if (Number.isFinite(gust)) acc.gust = Math.max(acc.gust, gust);
  if (dir != null && Number.isFinite(dir)) {
    const r = (dir * Math.PI) / 180;
    acc.dx += Math.sin(r); acc.dy += Math.cos(r); acc.dn++;
  }
  const f = frame || {};
  if (f.pressurePresent && Number.isFinite(f.pressureHpa)) { acc.p += f.pressureHpa; acc.pn++; }
  if (f.batteryPresent && Number.isFinite(f.battery)) acc.extra.bat = f.battery;
  if (f.batteryPresent && Number.isFinite(f.batteryPercent)) acc.extra.batP = f.batteryPercent;
  if (Number.isFinite(f.wifiRssi) && f.wifiRssi) acc.extra.rssi = f.wifiRssi;
  if (Number.isFinite(f.loopMax)) acc.extra.loop = Math.max(acc.extra.loop || 0, f.loopMax);
  if (Number.isFinite(f.sseDrop)) acc.extra.drop = (acc.extra.drop || 0) + f.sseDrop;
  if (Number.isFinite(f.speedMv)) acc.extra.mv = f.speedMv;
}

function flush() {
  const a = acc;
  acc = null;
  if (!a || a.n < 10) return;          // огрызок минуты — не минута
  const row = {
    k: a.k, t: a.t, n: a.n,
    avg: +(a.sum / a.n).toFixed(2), min: +a.min.toFixed(2), max: +a.max.toFixed(2), gust: +a.gust.toFixed(2),
    dir: a.dn >= a.n / 2 ? Math.round(((Math.atan2(a.dx, a.dy) * 180) / Math.PI + 360) % 360) : null,
    ...(a.pn ? { p: +(a.p / a.pn).toFixed(1) } : {}),
    ...a.extra,
  };
  const d = dayKey(a.t);
  db().then((dbh) => {
    if (!dbh) return;
    try {
      const t = dbh.transaction(["min", "day"], "readwrite");
      t.objectStore("min").put(row);
      const ds = t.objectStore("day");
      const g = ds.get([a.k, d]);
      g.onsuccess = () => {
        const day = g.result || { k: a.k, d, n: 0, sum: 0, max: 0, gust: 0, hist: new Array(HIST_BINS).fill(0) };
        day.n++; day.sum += row.avg;
        day.max = Math.max(day.max, row.avg);
        day.gust = Math.max(day.gust, row.gust);
        day.hist[Math.min(HIST_BINS - 1, Math.floor(row.avg))]++;
        ds.put(day);
      };
      t.oncomplete = emit;
    } catch { /* база закрыта — минута пропадёт, следующая запишется */ }
  });
}

// Вкладку закрывают — недописанная минута уходит как есть, если в ней хватает выборок.
if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

let evN = 0;
export function logEvent(k, kind, text) {
  if (!k) return;
  tx("ev", "readwrite", (s) => s.put({ k, t: Date.now(), n: evN++, kind, text })).then(emit);
}

// Слежка за кадром: события, которые станция сама не называет, но которые
// видны по смене полей. Перезагрузка — аптайм пошёл назад.
const seen = new Map();
export function watchFrame(k, f) {
  if (!k || !f) return;
  const p = seen.get(k);
  seen.set(k, { up: f.uptime, sta: f.staConnected, ppp: f.pppState, cloud: f.cloudConnected, chg: f.chargeState, adc: f.adcError });
  if (!p) return;
  const RESET = { brownout: "просадка питания", panic: "сбой прошивки", watchdog: "зависание", software: "программный перезапуск",
    external: "кнопка EN", poweron: "включение питания", deepsleep: "выход из сна" };
  if (Number.isFinite(f.uptime) && Number.isFinite(p.up) && f.uptime + 5 < p.up) {
    logEvent(k, f.resetReason === "brownout" ? "brownout" : "reboot", `Перезагрузка: ${RESET[f.resetReason] || f.resetReason || "причина неизвестна"}`);
  }
  if (f.staConnected !== undefined && p.sta !== undefined && f.staConnected !== p.sta) {
    logEvent(k, "net", f.staConnected ? `Домашняя сеть: подключена${f.staSsid ? ` (${f.staSsid})` : ""}` : "Домашняя сеть: потеряна");
  }
  if (f.pppState && p.ppp && f.pppState !== p.ppp) logEvent(k, "net", `4G: ${f.pppState}`);
  if (f.cloudConnected !== undefined && p.cloud !== undefined && f.cloudConnected !== p.cloud) {
    logEvent(k, "cloud", f.cloudConnected ? "Облако: на связи" : `Облако: обрыв${f.cloudError ? ` — ${f.cloudError}` : ""}`);
  }
  if (f.chargeState && p.chg && f.chargeState !== p.chg) {
    const V = { charging: "заряжается", full: "заряжена", discharging: "разряжается", absent: "не обнаружена" };
    logEvent(k, "power", `Батарея: ${V[f.chargeState] || f.chargeState}`);
  }
  if (f.adcError && !p.adc) logEvent(k, "sensor", "Датчик: обрыв или замыкание на землю");
}

// ---------- чтение ----------
export function readMinutes(k, from, to = Date.now()) { return range("min", k, from, to); }
export function readDays(k) { return range("day", k, "", "￿"); }
export function readEvents(k, from = 0) {
  return range("ev", k, from, Date.now() + 1).then((r) => r.sort((a, b) => b.t - a.t));
}

// Старьё — раз в сеанс, через минуту после старта, чтобы не мешать запуску.
let pruned = false;
export function prune() {
  if (pruned) return;
  pruned = true;
  setTimeout(() => {
    const edge = Date.now() - KEEP_DAYS * 86400000;
    db().then((d) => {
      if (!d) return;
      try {
        const t = d.transaction(["min", "ev"], "readwrite");
        for (const name of ["min", "ev"]) {
          const c = t.objectStore(name).openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur) return;
            // Ключ — [станция, время]: старые идут первыми, а дойдя до свежих,
            // прыгаем сразу к следующей станции, не листая её год минут.
            if (cur.value.t < edge) { cur.delete(); cur.continue(); }
            else cur.continue([cur.value.k, Infinity]);
          };
        }
      } catch { /* не вышло — в следующий раз */ }
    });
  }, 60000);
}

// ---------- последний кадр для офлайна ----------
const LAST_KEY = "wind_ui_lastframe";
export function saveLastFrame(k, f) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ k, at: Date.now(), f })); } catch { /* приватный режим */ }
}
export function loadLastFrame(k) {
  try {
    const j = JSON.parse(localStorage.getItem(LAST_KEY));
    return j && j.k === k ? j : null;
  } catch { return null; }
}

// ---------- экспорт ----------
export function toCsv(rows) {
  const cols = ["time", "avg", "min", "max", "gust", "dir", "p", "bat", "rssi"];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push([new Date(r.t).toISOString(), r.avg, r.min, r.max, r.gust, r.dir ?? "", r.p ?? "", r.bat ?? "", r.rssi ?? ""].join(","));
  }
  return lines.join("\n");
}

export function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { HIST_BINS };
