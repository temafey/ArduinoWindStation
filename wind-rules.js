// Свои тревоги: правило «если <величина> <выше|ниже> <порога> дольше <минут>».
//
// Встроенных тревог две («ветер растёт» и окно занятия), а у каждой мачты свои
// страхи: у кого-то порыв 18 м/с — повод снять тент, у кого-то давление, падающее
// на 3 гПа за три часа, — повод закрыть окна. Правило срабатывает один раз за
// «эпизод»: пока условие держится, повторов нет; ушло и вернулось — снова.
// Вызывается из useAlerts (wind-alerts.js) раз в 5 секунд.
import { readMinutes } from "./wind-log.js";

export const METRICS = [
  { id: "speed", label: "Средний ветер", unit: "м/с", def: 12, hold: 2, ops: true },
  { id: "gust", label: "Порыв сейчас", unit: "м/с", def: 18, hold: 0, ops: true },
  { id: "pdrop", label: "Давление упало за 3 часа", unit: "гПа", def: 3, hold: 0, ops: false },
  { id: "bat", label: "Заряд батареи", unit: "%", def: 20, hold: 0, ops: true, op: "<" },
];
export const metricOf = (id) => METRICS.find((m) => m.id === id) || METRICS[0];

export function newRule(metric = "speed") {
  const m = metricOf(metric);
  return { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, on: true, metric: m.id,
    op: m.op || ">", value: m.def, hold: m.hold };
}

export function ruleText(r) {
  const m = metricOf(r.metric);
  if (m.id === "pdrop") return `${m.label} на ${r.value} ${m.unit} и больше`;
  return `${m.label} ${r.op === "<" ? "ниже" : "выше"} ${r.value} ${m.unit}${r.hold ? ` дольше ${r.hold} мин` : ""}`;
}

function value(st, r, { data, history, logKey }, now) {
  switch (r.metric) {
    case "speed": {
      if (history.length < 30) return null;
      const t = history.slice(-60);
      return t.reduce((a, h) => a + (h.s || 0), 0) / t.length;
    }
    case "gust": return Number.isFinite(data.gust) ? data.gust : null;
    case "bat": return data.batteryPresent && Number.isFinite(data.batteryPercent) ? data.batteryPercent : null;
    case "pdrop": {
      // Давление — из журнала (раз в минуту), а не из живого кадра: за три часа
      // там его нет. Обновляем не чаще раза в минуту, ответ приходит позже тика.
      if (!logKey) return null;
      const c = st.p || (st.p = { at: 0, v: null, busy: false });
      if (!c.busy && now - c.at > 60000) {
        c.busy = true; c.at = now;
        readMinutes(logKey, now - 3.3 * 3600000).then((rows) => {
          const p = rows.filter((x) => Number.isFinite(x.p));
          if (p.length >= 20) {
            const m = (a) => a.reduce((s, x) => s + x.p, 0) / a.length;
            const span = p[p.length - 1].t - p[0].t;
            c.v = span >= 2 * 3600000 ? m(p.slice(0, 5)) - m(p.slice(-5)) : null;
          } else c.v = null;
        }).finally(() => { c.busy = false; });
      }
      return c.v;
    }
    default: return null;
  }
}

// fire(rule, value) вызывается ровно раз за эпизод.
export function stepRules(st, ctx, now, fire) {
  const since = st.since || (st.since = {}), sent = st.sent || (st.sent = {});
  for (const r of ctx.s.rules || []) {
    if (!r || !r.on) { since[r.id] = 0; continue; }
    const v = value(st, r, ctx, now);
    const ok = v != null && (r.metric === "pdrop" ? v >= r.value : r.op === "<" ? v < r.value : v > r.value);
    if (!ok) { since[r.id] = 0; sent[r.id] = false; continue; }
    since[r.id] = since[r.id] || now;
    if (!sent[r.id] && now - since[r.id] >= (r.hold || 0) * 60000) { sent[r.id] = true; fire(r, v); }
  }
}
