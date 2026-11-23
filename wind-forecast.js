// Прогноз ветра Open-Meteo в точке станции — общий для «Анализа» и «Станции»
// (датчик залип, если прогноз дует, а станция молчит). Отдельный файл, чтобы
// вкладка «Станция» не тянула за собой весь «Анализ».
import { useState, useEffect, useMemo } from "react";
import { readMinutes } from "./wind-log.js";

// ============================================================
// ПРОГНОЗ (Open-Meteo) — общий кэш на полчаса
// ============================================================
// Модель считает ветер для ячейки сетки в 10 м над ровным местом, а мачта
// стоит у домов и деревьев, поэтому прогноз врёт на вашей точке почти всегда
// в одну и ту же сторону. Поправка (ниже) — это эта сторона, посчитанная из
// журнала станции; хук возвращает уже исправленные s/g, а сырые значения модели
// остаются в s0/g0 — для честного сравнения «станция против прогноза».
const fcCache = new Map();
const keyOf = (c) => (c ? `${c.lat.toFixed(2)},${c.lon.toFixed(2)}` : "");

export function useForecast(coords) {
  const key = keyOf(coords);
  const [raw, setRaw] = useState(() => fcCache.get(key)?.v || null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const f = () => setRev((r) => r + 1);
    calSubs.add(f);
    return () => { calSubs.delete(f); };
  }, []);
  useEffect(() => {
    if (!key) return undefined;
    const hit = fcCache.get(key);
    if (hit && Date.now() - hit.at < 1800000) { setRaw(hit.v); return undefined; }
    let dead = false;
    // 14 прошедших суток нужны поправке: по ним модель сверяется со станцией.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(3)}&longitude=${coords.lon.toFixed(3)}` +
      "&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m&wind_speed_unit=ms&past_days=14&forecast_days=3&timeformat=unixtime";
    fetch(url).then((r) => r.json()).then((j) => {
      const h = j && j.hourly;
      if (!h || !Array.isArray(h.time)) return;
      const v = h.time.map((t, i) => ({ t: t * 1000, s: h.wind_speed_10m[i], g: h.wind_gusts_10m[i], d: h.wind_direction_10m ? h.wind_direction_10m[i] : null }));
      fcCache.set(key, { at: Date.now(), v });
      if (!dead) setRaw(v);
    }).catch(() => {});
    return () => { dead = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // rev — смена поправки (пересчёт или тумблер): без него мемо не заметило бы её.
  return useMemo(() => applyCal(raw, key), [raw, key, rev]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Сырые часы модели → исправленные. Нет поправки или она выключена — тот же
// массив, чтобы зависимости мемо у потребителей не дёргались зря.
function applyCal(raw, key) {
  if (!raw) return raw;
  const c = calEnabled() ? getCal(key) : null;
  if (!c) return raw;
  return raw.map((p) => ({ ...p, s: p.s * c.k, g: p.g * c.kg, s0: p.s, g0: p.g }));
}

// Прогноз исправлен поправкой? У исправленных точек есть сырое значение s0.
export const isCorrected = (fc) => !!(fc && fc.length && fc[0].s0 !== undefined);

// ============================================================
// ПОПРАВКА ПРОГНОЗА ПОД ВАШУ МАЧТУ
// ============================================================
// Множитель k: исправленный = модель × k. Метод наименьших квадратов через
// ноль — ветер не бывает отрицательным, и штиль модели должен остаться
// штилем, поэтому добавки (смещение) нет, а есть только масштаб. Свой
// множитель kg у порывов: лес по-разному гасит среднее и порыв.
// Хранится в localStorage по ключу точки прогноза, а не станции: прогноз и
// есть точка.
const CAL_KEY = "wind_ui_fccal";
const calSubs = new Set();
const calLoad = () => { try { const j = JSON.parse(localStorage.getItem(CAL_KEY)); return j && typeof j === "object" ? j : {}; } catch { return {}; } };
const calSave = (j) => { try { localStorage.setItem(CAL_KEY, JSON.stringify(j)); } catch { /* приватный режим */ } };
const calEmit = () => { for (const f of calSubs) f(); };

export function calEnabled() { return calLoad().on !== false; }
export function setCalEnabled(on) { const j = calLoad(); j.on = !!on; calSave(j); calEmit(); }
export function getCal(key) { const c = (calLoad().by || {})[key]; return c && Number.isFinite(c.k) ? c : null; }
export const calKey = keyOf;

const LS = (pairs, f) => {
  let num = 0, den = 0;
  for (const p of pairs) { num += p.st * f(p); den += f(p) * f(p); }
  return den > 0 ? num / den : NaN;
};

// raw — часы модели (s0 или s), rows — минутные строки журнала.
// Нужно хотя бы сутки совпавших часов и заметный ветер в модели, иначе
// множитель шумит — тогда поправки нет, и это честнее выдуманной.
export function fitCorrection(raw, rows) {
  if (!raw || !rows || !rows.length) return null;
  const byH = new Map();
  for (const r of rows) {
    const h = Math.floor(r.t / 3600000) * 3600000;
    const b = byH.get(h) || { n: 0, s: 0, g: 0 };
    b.n++; b.s += r.avg; b.g = Math.max(b.g, r.gust || r.max || 0);
    byH.set(h, b);
  }
  const pairs = [];
  for (const p of raw) {
    const b = byH.get(p.t);
    if (!b || b.n < 40) continue;
    const m = p.s0 ?? p.s, mg = p.g0 ?? p.g;
    if (!Number.isFinite(m) || !Number.isFinite(mg)) continue;
    pairs.push({ st: b.s / b.n, stg: b.g, m, mg });
  }
  if (pairs.length < 24) return null;
  const meanM = pairs.reduce((a, p) => a + p.m, 0) / pairs.length;
  if (meanM < 1) return null;
  const clamp = (x) => Math.max(0.35, Math.min(3, x));
  const k = clamp(LS(pairs, (p) => p.m) || 1);
  const kg = clamp(LS(pairs.map((p) => ({ st: p.stg, m: p.mg })), (p) => p.m) || k);
  const mae = (f) => pairs.reduce((a, p) => a + Math.abs(f(p.m) - p.st), 0) / pairs.length;
  return { k, kg, n: pairs.length, mae0: mae((m) => m), mae1: mae((m) => m * k), at: Date.now() };
}

// Пересчёт: читает 14 суток журнала и сохраняет поправку. Вызывается из
// «Анализа», не чаще раза в шесть часов, если не force.
export async function refitCorrection({ coords, logKey, fc, force = false }) {
  const key = keyOf(coords);
  if (!key || !logKey || !fc) return null;
  const j = calLoad();
  const old = (j.by || {})[key];
  if (!force && old && Date.now() - old.at < 6 * 3600000) return old;
  const rows = await readMinutes(logKey, Date.now() - 14 * 86400000);
  const fit = fitCorrection(fc, rows);
  const now = calLoad();
  now.by = now.by || {};
  if (fit) now.by[key] = fit; else if (!old) return null;
  calSave(now);
  calEmit();
  return fit || old;
}


// ============================================================
// ЗАНЯТИЯ
// ============================================================
// Коридоры — средний ветер, м/с; gust — порыв, выше которого «нельзя» при
// любом среднем. Числа — общепринятые ориентиры для любителя, а не правила
// безопасности: кайтер с большим опытом и маленьким кайтом уйдёт и в 18.
export const ACTIVITIES = [
  { id: "kite",  label: "Кайт",         ok: [6, 13],  edge: [4, 16], gust: 18 },
  { id: "surf",  label: "Виндсерф",     ok: [7, 15],  edge: [5, 18], gust: 21 },
  { id: "sail",  label: "Парусник",     ok: [3, 10],  edge: [2, 13], gust: 15 },
  { id: "drone", label: "Дрон",         ok: [0, 7],   edge: [0, 10], gust: 12 },
  { id: "para",  label: "Параплан",     ok: [1, 5],   edge: [0, 7],  gust: 8 },
  // Работы на высоте прекращаются при 15 м/с (правила охраны труда);
  // «на грани» с 10 — кран и монтаж крупных листов останавливают раньше.
  { id: "work",  label: "Работа на высоте", ok: [0, 10], edge: [0, 15], gust: 15 },
];

export function verdict(act, avg, gust) {
  if (!act || !Number.isFinite(avg)) return null;
  if (Number.isFinite(gust) && gust >= act.gust) return { lvl: 2, text: "нельзя", why: `порывы ${gust.toFixed(1)} м/с` };
  if (avg >= act.ok[0] && avg <= act.ok[1]) return { lvl: 0, text: "можно", why: `в коридоре ${act.ok[0]}–${act.ok[1]} м/с` };
  if (avg >= act.edge[0] && avg <= act.edge[1]) {
    return { lvl: 1, text: "на грани", why: avg < act.ok[0] ? "слабовато" : "крепковато" };
  }
  return { lvl: 2, text: "нельзя", why: avg < act.edge[0] ? "ветра не хватит" : "слишком сильно" };
}

// Окна возможностей: подряд идущие часы прогноза, где занятие «можно».
export function windows(fc, act, hours = 48) {
  if (!fc || !act) return [];
  const now = Date.now(), out = [];
  let cur = null;
  for (const p of fc) {
    if (p.t < now - 3600000 || p.t > now + hours * 3600000) continue;
    const v = verdict(act, p.s, p.g);
    if (v && v.lvl === 0) {
      if (!cur) cur = { from: p.t, to: p.t + 3600000, peak: p.s };
      else { cur.to = p.t + 3600000; cur.peak = Math.max(cur.peak, p.s); }
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

