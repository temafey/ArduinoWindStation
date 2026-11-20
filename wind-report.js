// Недельный отчёт одной картинкой: неделя ветра на вашей мачте — для чата,
// почты или просто на память. Рисуется на холсте из журнала (wind-log.js), без
// сети и без чужих шрифтов; делится так же, как снимок состояния: системное
// «Поделиться» там, где оно есть, иначе файл в загрузки.
//
// В отчёте только то, что журнал знает наверняка: минуты, пока дашборд был
// открыт на этом устройстве. Если данных за неделю мало, отчёт так и пишет —
// «пишется N из 168 часов», а не выдаёт неполную неделю за полную.
import { readMinutes, dayKey } from "./wind-log.js";
import { ACTIVITIES, verdict } from "./wind-forecast.js";

const W = 1200, H = 1400;
const SANS = "'Segoe UI', system-ui, sans-serif";
const MONO = "Consolas, 'Cascadia Mono', monospace";
const DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(v < 10 ? 1 : 0) : "—");

// Цвет по силе ветра — тот же ряд, что у колец дашборда: от спокойного к опасному.
function speedColor(v) {
  return v < 3 ? "#7dd3fc" : v < 7 ? "#4ade80" : v < 12 ? "#facc15" : v < 17 ? "#fb923c" : "#ef4444";
}

function round(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

// ---------- расчёт ----------
export function weekStats(rows, act) {
  const days = new Map();
  const rose = Array.from({ length: 16 }, () => ({ n: 0, sum: 0 }));
  const hours = Array.from({ length: 24 }, () => ({ n: 0, ok: 0 }));
  let n = 0, sum = 0, gust = null, ok = 0;
  for (const r of rows) {
    n++; sum += r.avg;
    if (!gust || r.gust > gust.v) gust = { v: r.gust, t: r.t };
    const dk = dayKey(r.t);
    const d = days.get(dk) || { n: 0, sum: 0, max: 0, gust: 0, t: r.t };
    d.n++; d.sum += r.avg; d.max = Math.max(d.max, r.avg); d.gust = Math.max(d.gust, r.gust || 0);
    days.set(dk, d);
    if (Number.isFinite(r.dir) && r.avg >= 1) {
      const s = rose[Math.floor((((r.dir + 11.25) % 360) / 22.5)) % 16];
      s.n++; s.sum += r.avg;
    }
    const h = hours[new Date(r.t).getHours()];
    h.n++;
    const v = verdict(act, r.avg, r.gust);
    if (v && v.lvl === 0) { h.ok++; ok++; }
  }
  return { n, avg: n ? sum / n : NaN, gust, days: [...days.values()].sort((a, b) => a.t - b.t), rose, hours, okMin: ok };
}

// ---------- рисование ----------
export async function renderWeekReport({ logKey, activity, name, color = "#7dd3fc" }) {
  const to = Date.now(), from = to - 7 * 86400000;
  const rows = await readMinutes(logKey, from, to);
  if (rows.length < 60) return null;
  const act = ACTIVITIES.find((a) => a.id === activity) || ACTIVITIES[0];
  const st = weekStats(rows, act);

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d1626"); bg.addColorStop(0.55, "#0a111b"); bg.addColorStop(1, "#05080d");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // мягкое пятно света, как фон дашборда
  const glow = x.createRadialGradient(W * 0.85, 120, 10, W * 0.85, 120, 520);
  glow.addColorStop(0, "rgba(125,211,252,0.18)"); glow.addColorStop(1, "rgba(125,211,252,0)");
  x.fillStyle = glow; x.fillRect(0, 0, W, H);

  const fmtD = (t) => new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  x.fillStyle = "#e7eef6"; x.font = `600 54px ${SANS}`; x.textAlign = "left";
  x.fillText("Неделя ветра", 60, 100);
  x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `28px ${SANS}`;
  x.fillText(`${name || "Станция"} · ${fmtD(from)} – ${fmtD(to)}`, 60, 146);

  // полнота записи
  const hoursLogged = st.n / 60;
  const full = hoursLogged >= 150;
  x.textAlign = "right"; x.fillStyle = full ? "rgba(231,238,246,0.4)" : "#facc15"; x.font = `24px ${SANS}`;
  x.fillText(full ? `записано ${Math.round(hoursLogged)} из 168 ч` : `записано только ${Math.round(hoursLogged)} из 168 ч`, W - 60, 146);

  // четыре плитки
  const tiles = [
    { k: "СРЕДНИЙ ВЕТЕР", v: f1(st.avg), u: "м/с", col: speedColor(st.avg) },
    { k: "СИЛЬНЕЙШИЙ ПОРЫВ", v: f1(st.gust ? st.gust.v : NaN), u: "м/с", col: speedColor(st.gust ? st.gust.v : 0), sub: st.gust ? new Date(st.gust.t).toLocaleString("ru-RU", { weekday: "long", hour: "2-digit", minute: "2-digit" }) : "" },
    { k: `«${act.label.toUpperCase()}» В КОРИДОРЕ`, v: f1(st.okMin / 60), u: "ч", col: color, sub: `${act.ok[0]}–${act.ok[1]} м/с, порыв < ${act.gust}` },
  ];
  const bestDay = st.days.length ? st.days.reduce((a, b) => (b.sum / b.n > a.sum / a.n ? b : a)) : null;
  tiles.push({ k: "САМЫЙ ВЕТРЕНЫЙ ДЕНЬ", v: bestDay ? DAYS[new Date(bestDay.t).getDay()].toUpperCase() : "—", u: bestDay ? `${f1(bestDay.sum / bestDay.n)} м/с` : "", col: "#e7eef6" });
  const tw = (W - 120 - 3 * 20) / 4;
  tiles.forEach((t, i) => {
    const px = 60 + i * (tw + 20), py = 190, ph = 190;
    round(x, px, py, tw, ph, 26);
    x.fillStyle = "rgba(255,255,255,0.055)"; x.fill();
    x.strokeStyle = "rgba(255,255,255,0.14)"; x.lineWidth = 1.5; x.stroke();
    x.textAlign = "left"; x.fillStyle = "rgba(231,238,246,0.5)"; x.font = `600 17px ${SANS}`;
    x.fillText(t.k, px + 22, py + 38);
    x.fillStyle = t.col; x.font = `600 62px ${MONO}`;
    x.fillText(t.v, px + 22, py + 112);
    const vw = x.measureText(t.v).width;
    x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `24px ${SANS}`;
    x.fillText(t.u, px + 30 + vw, py + 112);
    if (t.sub) { x.fillStyle = "rgba(231,238,246,0.4)"; x.font = `19px ${SANS}`; x.fillText(t.sub.length > 30 ? t.sub.slice(0, 29) + "…" : t.sub, px + 22, py + 158); }
  });

  // суточные столбики: средний ветер, чёрточка — максимум минуты, точка — порыв
  const section = (title, py, px = 60) => {
    x.textAlign = "left"; x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `600 20px ${SANS}`;
    x.fillText(title, px, py);
  };
  section("ПО ДНЯМ · СРЕДНИЙ ВЕТЕР, ПОРЫВ ТОЧКОЙ", 440);
  // верх шкалы — кратен четырём, чтобы подписи линий были целыми числами
  const topV = Math.ceil((Math.max(8, ...st.days.map((d) => d.gust)) * 1.1) / 4) * 4;
  const gx = 60, gy = 470, gw = W - 120, gh = 250;
  x.strokeStyle = "rgba(255,255,255,0.08)"; x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const yy = gy + gh - (gh * i) / 4; x.beginPath(); x.moveTo(gx, yy); x.lineTo(gx + gw, yy); x.stroke();
    x.fillStyle = "rgba(231,238,246,0.3)"; x.font = `16px ${SANS}`; x.textAlign = "left"; x.fillText(f1((topV * i) / 4), gx + 4, yy - 5); }
  const slots = 7, sw = gw / slots;
  for (let i = 0; i < slots; i++) {
    const t = to - (6 - i) * 86400000;
    const d = st.days.find((q) => dayKey(q.t) === dayKey(t));
    const cx = gx + i * sw + sw / 2;
    x.textAlign = "center"; x.fillStyle = "rgba(231,238,246,0.6)"; x.font = `22px ${SANS}`;
    x.fillText(DAYS[new Date(t).getDay()], cx, gy + gh + 34);
    if (!d) continue;
    const avg = d.sum / d.n, bw = sw * 0.46;
    const bh = (avg / topV) * gh;
    const grad = x.createLinearGradient(0, gy + gh - bh, 0, gy + gh);
    grad.addColorStop(0, speedColor(avg)); grad.addColorStop(1, "rgba(255,255,255,0.12)");
    round(x, cx - bw / 2, gy + gh - bh, bw, bh, 10); x.fillStyle = grad; x.fill();
    const gyy = gy + gh - (d.gust / topV) * gh;
    x.beginPath(); x.arc(cx, gyy, 7, 0, 7); x.fillStyle = "#fff"; x.fill();
    x.fillStyle = "rgba(231,238,246,0.85)"; x.font = `600 20px ${MONO}`;
    x.fillText(f1(avg), cx, gy + gh - bh - 12 < gyy + 22 ? gyy - 14 : gy + gh - bh - 12);
  }

  // роза ветров (откуда дует) и часы суток в коридоре
  const ry = 790;
  section("ОТКУДА ДУЕТ", ry);
  const rcx = 60 + 250, rcy = ry + 50 + 220, rr = 200;
  x.strokeStyle = "rgba(255,255,255,0.1)"; x.lineWidth = 1.5;
  for (const f of [0.5, 1]) { x.beginPath(); x.arc(rcx, rcy, rr * f, 0, 7); x.stroke(); }
  const maxN = Math.max(1, ...st.rose.map((s) => s.n));
  st.rose.forEach((s, i) => {
    if (!s.n) return;
    const a0 = ((i * 22.5 - 11.25 - 90) * Math.PI) / 180, a1 = ((i * 22.5 + 11.25 - 90) * Math.PI) / 180;
    const len = Math.max(10, (s.n / maxN) * rr);
    x.beginPath(); x.moveTo(rcx, rcy); x.arc(rcx, rcy, len, a0 + 0.02, a1 - 0.02); x.closePath();
    x.fillStyle = speedColor(s.sum / s.n); x.globalAlpha = 0.85; x.fill(); x.globalAlpha = 1;
  });
  x.fillStyle = "rgba(231,238,246,0.7)"; x.font = `600 24px ${SANS}`; x.textAlign = "center";
  [["С", 0, -1], ["В", 1, 0], ["Ю", 0, 1], ["З", -1, 0]].forEach(([l, dx, dy]) => x.fillText(l, rcx + dx * (rr + 28), rcy + dy * (rr + 28) + 8));

  const hx = 640, hw = W - 60 - hx;
  section(`КОГДА ВЕТЕР В КОРИДОРЕ · ${act.label.toUpperCase()}`, ry, hx);
  const hh = 330, hyb = ry + 60 + hh;
  const bwid = hw / 24;
  st.hours.forEach((h, i) => {
    const share = h.n ? h.ok / h.n : 0;
    const bh = Math.max(share > 0 ? 6 : 2, share * hh);
    round(x, hx + i * bwid + 2, hyb - bh, bwid - 4, bh, 5);
    x.fillStyle = share > 0 ? color : "rgba(255,255,255,0.12)"; x.globalAlpha = share > 0 ? 0.35 + 0.65 * share : 1; x.fill(); x.globalAlpha = 1;
  });
  x.fillStyle = "rgba(231,238,246,0.45)"; x.font = `18px ${SANS}`; x.textAlign = "center";
  [0, 6, 12, 18].forEach((h) => x.fillText(`${String(h).padStart(2, "0")}:00`, hx + h * bwid + bwid / 2, hyb + 28));
  const bestH = st.hours.reduce((a, b, i) => (b.n && (!a || b.ok / b.n > st.hours[a.i].ok / Math.max(1, st.hours[a.i].n)) ? { i } : a), null);
  x.textAlign = "left"; x.fillStyle = "#e7eef6"; x.font = `24px ${SANS}`;
  if (bestH && st.hours[bestH.i].ok > 0) {
    x.fillText(`Лучшее время — около ${String(bestH.i).padStart(2, "0")}:00`, hx, hyb + 80);
    x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `21px ${SANS}`;
    x.fillText(`в ${Math.round((st.hours[bestH.i].ok / st.hours[bestH.i].n) * 100)}% минут этого часа ветер подходил`, hx, hyb + 114);
  } else {
    x.fillText("На этой неделе подходящего ветра не было", hx, hyb + 80);
  }

  // подвал
  x.textAlign = "left"; x.fillStyle = "rgba(231,238,246,0.35)"; x.font = `22px ${SANS}`;
  x.fillText("Weathered_Kiwi · данные журнала станции", 60, H - 50);
  x.textAlign = "right";
  x.fillText(new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }), W - 60, H - 50);

  return new Promise((r) => c.toBlob(r, "image/png"));
}

// Отчёт → системное «Поделиться» или файл. Возвращает строку-итог для подписи под кнопкой.
export async function shareWeekReport(opts) {
  const blob = await renderWeekReport(opts);
  if (!blob) return "В журнале меньше часа за неделю — отчёту пока нечего показать.";
  const file = new File([blob], `wind-week-${Date.now()}.png`, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Неделя ветра" }); return "Готово."; }
  } catch { return ""; }          // «Поделиться» отменили — это не ошибка
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "Картинка сохранена в загрузки.";
}
