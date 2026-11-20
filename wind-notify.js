// Уведомления Windows и Android — через одни ворота и с жёстким лимитом.
//
// Куда уходит: на Android — родной мост WKNative.note (WebView API Notification
// не умеет), в программе Windows и в браузере — обычный Notification (Electron
// показывает его тостом Windows; appUserModelId задан в desktop/main.js).
//
// Главное здесь — не спамить:
//   • не больше 33 уведомлений за скользящие сутки, на всё вместе;
//   • между любыми двумя — не меньше 3 минут (срочное — шквал — без паузы,
//     но в те же 33);
//   • одна тема (tag) — одно уведомление: новая сводка заменяет прежнюю, а не
//     ложится стопкой, и одна тема не чаще своего интервала;
//   • тихие часы — ничего, кроме того, что накопится в утреннюю сводку.
// Учёт — в localStorage: лимит переживает перезагрузку страницы, иначе каждое
// обновление вкладки обнуляло бы счётчик.
import { useEffect, useRef } from "react";
import { quietNow } from "./wind-alerts.js";
import { ACTIVITIES, windows } from "./wind-forecast.js";

export const DAY_LIMIT = 33;
const GAP_MS = 3 * 60000;
const KEY = "wind_ui_notes";

function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}
function save(j) { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* приватный режим */ } }

const native = () => (typeof window !== "undefined" && window.WKNative && typeof window.WKNative.note === "function" ? window.WKNative : null);

export function notifyAllowed() {
  const n = native();
  if (n) { try { return n.notifyAllowed(); } catch { return false; } }
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}
export function requestNotify() {
  const n = native();
  if (n) { try { n.requestNotify(); } catch { /* старое приложение */ } return; }
  if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

// Сколько отправлено за последние сутки — для подписи в настройках.
export function sentToday() {
  const j = load(), edge = Date.now() - 86400000;
  return (j.sent || []).filter((t) => t > edge).length;
}

// opts.every — минимальный интервал для этой темы, мс; opts.urgent — без общей паузы.
export function pushNote(title, body, tag = "wind", { every = 30 * 60000, urgent = false } = {}) {
  const now = Date.now();
  const j = load();
  const sent = (j.sent || []).filter((t) => t > now - 86400000);
  const last = sent.length ? sent[sent.length - 1] : 0;
  const byTag = j.tag || {};
  if (sent.length >= DAY_LIMIT) return false;
  if (!urgent && now - last < GAP_MS) return false;
  if (byTag[tag] && now - byTag[tag] < every) return false;
  let ok = false;
  const n = native();
  try {
    if (n) { if (n.notifyAllowed()) { n.note(title, body, tag); ok = true; } }
    else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const note = new Notification(title, { body, tag, renotify: false, silent: !urgent });
      note.onclick = () => { try { window.focus(); } catch { /* окно закрыто */ } note.close(); };
      ok = true;
    }
  } catch { ok = false; }
  if (!ok) return false;
  sent.push(now);
  byTag[tag] = now;
  save({ sent, tag: byTag });
  return true;
}

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(v < 10 ? 1 : 0) : "—");
const hh = (ms) => `${String(new Date(ms).getHours()).padStart(2, "0")}:00`;

// Текст сводки: сейчас, ближайшие 6 часов по прогнозу и окно для своего занятия.
export function digestText({ data, desc, fc, activity }) {
  const parts = [`Сейчас ${f1(data.speed)} м/с, порывы ${f1(data.gust)}${desc ? ` — ${desc.toLowerCase()}` : ""}.`];
  if (fc && fc.length) {
    const now = Date.now();
    const next = fc.filter((p) => p.t > now && p.t <= now + 6 * 3600000);
    if (next.length) {
      const peak = next.reduce((a, b) => (b.s > a.s ? b : a));
      const gust = Math.max(...next.map((p) => p.g || 0));
      parts.push(`До ${hh(next[next.length - 1].t)}: до ${f1(peak.s)} м/с к ${hh(peak.t)}, порывы до ${f1(gust)}.`);
    }
    const act = ACTIVITIES.find((a) => a.id === activity);
    if (act) {
      const w = windows(fc, act, 24)[0];
      parts.push(w ? `${act.label}: окно ${hh(w.from)}–${hh(w.to)}.` : `${act.label}: подходящего ветра в ближайшие сутки нет.`);
    }
  }
  return parts.join(" ");
}

// Сводка по расписанию и события связи. Тревоги (тренд, шквал) шлют сами,
// через pushNote, — здесь только то, что идёт по часам.
export function useNotifier({ settings, data, connected, desc, fc, isStation }) {
  const live = useRef({});
  live.current = { settings, data, connected, desc, fc, isStation };
  const seenAt = useRef(0);
  const wasUp = useRef(false);
  const toldDown = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const { settings: s, data, connected, desc, fc, isStation } = live.current;
      if (!s.notify || quietNow(s)) return;
      const now = Date.now();
      if (connected) {
        seenAt.current = now;
        if (wasUp.current && toldDown.current) {
          pushNote("Станция снова на связи", `Ветер ${f1(data.speed)} м/с.`, "wind-link", { every: 30 * 60000 });
        }
        wasUp.current = true;
        toldDown.current = false;
        const every = (s.digestHours || 0) * 3600000;
        if (every > 0) pushNote("Ветер", digestText({ data, desc, fc, activity: s.activity }), "wind-digest", { every });
      } else if (isStation && wasUp.current && !toldDown.current && now - seenAt.current > 5 * 60000) {
        toldDown.current = true;
        pushNote("Станция молчит", "Пять минут без показаний. Питание, сеть или облако — подробности во вкладке «Станция».", "wind-link", { every: 30 * 60000 });
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);
}
