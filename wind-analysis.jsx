// Вкладка «Анализ»: что делать с ветром, а не только сколько его.
//
// Три экрана, и у каждого свой вопрос:
//   «Сейчас»     — можно ли заниматься своим делом и когда будет можно; ветер на
//                  высоте; сегодня против вчера; тенденция давления;
//   «Статистика» — распределение, Вейбулл, энергия ветряка, рекорды, календарь,
//                  экспорт. Всё из журнала (wind-log.js), то есть за то время,
//                  пока дашборд был открыт на этом устройстве;
//   «Прогноз»    — врёт ли прогноз именно здесь и что показывают соседи.
//
// Оформление берётся из дашборда пропсом ui (Panel, Row, Btn, SubTab, Label):
// вторая копия панели разошлась бы с первой при первой же правке темы.
import { useState, useEffect, useMemo } from "react";
import { TEXT, DIM, FAINT, LINE, NUM, SANS } from "./ui-kit.js";
import { readMinutes, readDays, onLog, toCsv, download, dayKey, HIST_BINS } from "./wind-log.js";
import { useForecast, ACTIVITIES, verdict, windows, isCorrected, calEnabled, setCalEnabled, getCal, calKey, refitCorrection } from "./wind-forecast.js";
import { requestNotify, notifyAllowed } from "./wind-notify.js";
import { shareWeekReport } from "./wind-report.js";
import { LiquidRange } from "./wind-liquid.jsx";
import { Segments } from "./wind-switch.jsx";

const V_COLOR = ["#4ade80", "#facc15", "#ef4444"];

function whenText(ms) {
  const d = new Date(ms), now = new Date();
  const day = dayKey(ms) === dayKey(now) ? "сегодня"
    : dayKey(ms) === dayKey(now.getTime() + 86400000) ? "завтра"
    : d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
  return `${day} ${String(d.getHours()).padStart(2, "0")}:00`;
}

// ============================================================
// СТАТИСТИКА
// ============================================================
// Ланцош, g=7 — точности с запасом для Γ(1+1/k) при k от 1 до 4.
function gamma(z) {
  const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < 9; i++) x += p[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

// Вейбулл методом моментов (Justus): k = (σ/μ)^-1.086, c = μ / Γ(1 + 1/k).
// Для ветроэнергетики этого хватает — разница с максимумом правдоподобия
// меньше, чем ошибка любительского анемометра.
export function weibull(hist) {
  let n = 0, s = 0, s2 = 0;
  hist.forEach((c, i) => { const v = i + 0.5; n += c; s += c * v; s2 += c * v * v; });
  if (n < 30) return null;
  const mu = s / n, sd = Math.sqrt(Math.max(1e-6, s2 / n - mu * mu));
  const k = Math.min(10, Math.max(0.5, (sd / mu) ** -1.086));
  const c = mu / gamma(1 + 1 / k);
  return { k, c, mu, n };
}
const wpdf = (v, k, c) => (k / c) * (v / c) ** (k - 1) * Math.exp(-((v / c) ** k));

// Кривая мощности условного ветряка: старт 3 м/с, номинал на 12, стоп на 25.
// Cp 0.35 — хороший малый ветряк; теоретический предел Беца 0.59.
const RHO = 1.225, CP = 0.35, V_IN = 3, V_RATED = 12, V_OUT = 25;
export function turbineW(v, d) {
  if (v < V_IN || v >= V_OUT) return 0;
  const a = Math.PI * (d / 2) ** 2;
  return 0.5 * RHO * a * CP * Math.min(v, V_RATED) ** 3;
}

function sumHist(days) {
  const h = new Array(HIST_BINS).fill(0);
  for (const d of days) d.hist.forEach((c, i) => { h[i] += c; });
  return h;
}

// ============================================================
// ГРАФИКИ — один простой линейный
// ============================================================
function Lines({ series, height = 120, from, to, yMax, labels }) {
  const W = 600, H = height, pad = 4;
  const top = yMax || Math.max(5, ...series.flatMap((s) => s.pts.map((p) => p[1]).filter(Number.isFinite))) * 1.1;
  const x = (t) => pad + ((t - from) / Math.max(1, to - from)) * (W - pad * 2);
  const y = (v) => H - pad - (v / top) * (H - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={y(top * f)} y2={y(top * f)} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => {
          let d = "", up = false;
          for (const [t, v] of s.pts) {
            if (!Number.isFinite(v)) { up = false; continue; }
            d += `${up ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`;
            up = true;
          }
          return <path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={s.w || 1.6}
                       strokeDasharray={s.dash} opacity={s.op ?? 1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9.5, marginTop: 4, ...NUM }}>
        {(labels || []).map((l, i) => <span key={i}>{l}</span>)}
        <span>{top.toFixed(0)} м/с ↑</span>
      </div>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: DIM }}>
          <i style={{ width: 14, height: 2, background: it.color, display: "inline-block", opacity: it.op ?? 1 }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Chips({ value, options, onChange }) {
  return (
    <div className="chip-row" style={{ display: "flex" }}>
      <Segments variant="chips seg-plain" value={value} onChange={onChange}
                options={options.map((o) => ({ value: o.id, label: o.label }))} />
    </div>
  );
}

const Note = ({ children }) => (
  <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>{children}</div>
);

// Минуты из журнала, перечитываются при каждой записанной минуте.
function useMinutes(k, spanMs) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!k) { setRows([]); return undefined; }
    let dead = false;
    const load = () => readMinutes(k, Date.now() - spanMs).then((r) => { if (!dead) setRows(r); });
    load();
    const off = onLog(load);
    return () => { dead = true; off(); };
  }, [k, spanMs]);
  return rows;
}
function useDays(k) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!k) { setRows([]); return undefined; }
    let dead = false;
    const load = () => readDays(k).then((r) => { if (!dead) setRows(r); });
    load();
    const off = onLog(load);
    return () => { dead = true; off(); };
  }, [k]);
  return rows;
}

// Средний за последние 10 минут из живой истории (раз в секунду).
export function recentAvg(history, sec = 600) {
  const part = history.slice(-sec).map((h) => h.s).filter(Number.isFinite);
  if (part.length < 30) return null;
  return part.reduce((a, b) => a + b, 0) / part.length;
}

// ============================================================
// ВКЛАДКА
// ============================================================
const VIEWS = [
  { id: "now", label: "Сейчас" },
  { id: "stats", label: "Статистика" },
  { id: "fc", label: "Прогноз" },
];

export default function AnalysisTab({ ui, g, accent, logKey, history, data, coords, settings, setS, isStation, connected }) {
  const { Panel } = ui;
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem("wind_ui_anview") || "now"; } catch { return "now"; }
  });
  const setView = (v) => { setViewState(v); try { localStorage.setItem("wind_ui_anview", v); } catch { /* приватный режим */ } };
  const fc = useForecast(coords);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="sub-row" style={{ display: "flex" }}>
        <Segments variant="tabs" ariaLabel="Раздел" value={view} onChange={setView}
                  options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
      </div>
      {!logKey && view !== "fc" && (
        <Panel title="Журнал" g={g} meta="НЕ ВЕДЁТСЯ">
          <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
            Журнал пишется только с настоящей станции — демо и «район» в него не попадают,
            иначе выдуманный ветер навсегда испортил бы рекорды. Подключите станцию во вкладке «Станция».
          </div>
        </Panel>
      )}
      {view === "now" && <NowView {...{ ui, g, accent, logKey, history, data, fc, settings, setS, isStation, connected }} />}
      {view === "stats" && <StatsView {...{ ui, g, accent, logKey, settings, setS }} />}
      {view === "fc" && <ForecastView {...{ ui, g, accent, logKey, fc, coords, settings, setS }} />}
    </div>
  );
}

function NowView({ ui, g, accent, logKey, history, data, fc, settings, setS, isStation, connected }) {
  const { Panel, Row } = ui;
  const act = ACTIVITIES.find((a) => a.id === settings.activity) || ACTIVITIES[0];
  // Без связи вердикта нет: «нельзя» по нулю, которого никто не мерил, — неправда.
  const avg = !connected ? null : recentAvg(history) ?? (Number.isFinite(data.speed) ? data.speed : null);
  const v = verdict(act, avg, data.gust);
  const wins = useMemo(() => windows(fc, act), [fc, act]);
  const day = useMinutes(logKey, 2 * 86400000);
  const mastH = settings.mastH || 3;

  // Сегодня против вчера — средние по 15 минут, ось — время суток.
  const cmp = useMemo(() => {
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const t0 = today0.getTime(), y0 = t0 - 86400000;
    const bins = (from) => {
      const b = new Array(96).fill(null).map(() => [0, 0]);
      for (const r of day) {
        if (r.t < from || r.t >= from + 86400000) continue;
        const i = Math.floor((r.t - from) / 900000);
        b[i][0] += r.avg; b[i][1]++;
      }
      return b.map(([s, n], i) => [i * 900000, n ? s / n : NaN]);
    };
    const now = Date.now() - t0;
    return { today: bins(t0).filter(([t]) => t <= now), yest: bins(y0) };
  }, [day]);

  // Давление: разница за 3 часа — классический признак смены погоды.
  const ptrend = useMemo(() => {
    const ps = day.filter((r) => Number.isFinite(r.p));
    if (ps.length < 30) return null;
    const last = ps[ps.length - 1];
    const old = ps.find((r) => r.t >= last.t - 3 * 3600000);
    if (!old || last.t - old.t < 2 * 3600000) return null;
    const dp = last.p - old.p;
    const text = dp <= -3 ? "быстро падает — вероятно усиление ветра и ненастье"
      : dp <= -1 ? "падает — погода портится"
      : dp >= 3 ? "быстро растёт — возможен сильный ветер на прояснении"
      : dp >= 1 ? "растёт — погода улучшается" : "стоит";
    return { dp, text };
  }, [day]);

  return (
    <>
      <Panel title="Можно ли сейчас" g={g} meta={avg == null ? "НАКОПЛЕНИЕ" : "СРЕДНИЙ ЗА 10 МИН"}>
        <Chips value={act.id} options={ACTIVITIES} accent={accent} onChange={(id) => setS({ activity: id })} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: 34, fontWeight: 600, letterSpacing: 1,
                         color: v ? V_COLOR[v.lvl] : DIM }}>
            {v ? v.text.toUpperCase() : "—"}
          </span>
          <span style={{ color: DIM, fontSize: 11.5 }}>
            {v ? `${v.why} · ветер ${avg.toFixed(1)} м/с, порыв ${(data.gust || 0).toFixed(1)}` : connected ? "жду данных" : "нет связи со станцией"}
          </span>
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div className="caps" style={{ color: DIM, fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>
            ОКНА ПО ПРОГНОЗУ · 48 Ч{isCorrected(fc) ? " · С ПОПРАВКОЙ НА ВАШУ МАЧТУ" : ""}
          </div>
          {!fc ? <div style={{ color: FAINT, fontSize: 11 }}>нет координат или прогноз не ответил</div>
            : wins.length === 0 ? <div style={{ color: DIM, fontSize: 11 }}>подходящего ветра в ближайшие двое суток нет</div>
            : wins.slice(0, 4).map((w) => (
              <Row key={w.from} g={g} k={`${whenText(w.from)} – ${String(new Date(w.to).getHours()).padStart(2, "0")}:00`}
                   v={`до ${w.peak.toFixed(0)} м/с`} />
            ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div className="caps" style={{ color: DIM, fontSize: 10, letterSpacing: 2 }}>СООБЩИТЬ, КОГДА ОТКРОЕТСЯ ОКНО · {act.label.toUpperCase()}</div>
            <Segments variant="chips seg-plain" ariaLabel="Уведомление об окне" value={settings.winAlert ? "on" : "off"}
                      onChange={(v) => { setS({ winAlert: v === "on" }); if (v === "on") requestNotify(); }}
                      options={[{ value: "off", label: "выкл" }, { value: "on", label: "вкл" }]} />
          </div>
          {settings.winAlert && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ color: DIM, fontSize: 11 }}>ветер должен держаться</span>
                <Chips value={settings.winHold || 15} accent={accent} onChange={(id) => setS({ winHold: id })}
                       options={[{ id: 10, label: "10 мин" }, { id: 15, label: "15 мин" }, { id: 30, label: "30 мин" }]} />
              </div>
              <Note>
                Придёт уведомление, когда ветер {act.ok[0]}–{act.ok[1]} м/с (порывы ниже {act.gust}) продержится
                {" "}{settings.winHold || 15} мин подряд. Заранее — если по прогнозу окно откроется в ближайшие полтора часа,
                и если ветер вот-вот выйдет из коридора. Работает, пока дашборд или приложение запущены.
                {!notifyAllowed() && " Сейчас уведомления для этого окна выключены — разрешите их в браузере или в настройках телефона."}
              </Note>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Сегодня и вчера" g={g} meta="СРЕДНЕЕ ЗА 15 МИН">
        {day.length < 20 ? (
          <div style={{ color: DIM, fontSize: 11 }}>Журнал только начал копиться — кривые появятся через полчаса работы.</div>
        ) : (
          <>
            <Lines from={0} to={86400000} labels={["00:00", "06:00", "12:00", "18:00", "24:00"]}
                   series={[
                     { id: "y", pts: cmp.yest, color: TEXT, op: 0.35, dash: "4 4", w: 1.2 },
                     { id: "t", pts: cmp.today, color: accent },
                   ]} />
            <Legend items={[{ label: "сегодня", color: accent }, { label: "вчера", color: TEXT, op: 0.35 }]} />
          </>
        )}
      </Panel>

      <Panel title="Ветер на высоте" g={g} meta={`ОТ ${mastH} М · α = 1/7`}>
        {[10, 30, 100].map((h) => (
          <Row key={h} g={g} k={`${h} м`} v={avg == null ? "—" : `${(avg * (h / mastH) ** (1 / 7)).toFixed(1)} м/с`} />
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, color: DIM, fontSize: 11 }}>
          Высота мачты
          <input type="number" min={1} max={100} step={0.5} value={mastH}
                 onChange={(e) => setS({ mastH: Math.max(1, Math.min(100, +e.target.value || 3)) })}
                 style={{ width: 70, background: "transparent", color: TEXT, border: `1px solid ${LINE}`, padding: "4px 8px", ...NUM }} />
          м
        </label>
        <Note>Степенной закон для открытой местности: с высотой ветер растёт, потому что земля его тормозит. Над лесом или
          городом рост сильнее (α ≈ 0.25–0.4), над водой слабее (α ≈ 0.1) — это оценка, а не измерение.</Note>
      </Panel>

      {ptrend && (
        <Panel title="Давление" g={g} meta="ЗА 3 ЧАСА">
          <Row g={g} k="Изменение" v={`${ptrend.dp > 0 ? "+" : ""}${ptrend.dp.toFixed(1)} гПа`} />
          <Note>{ptrend.text}</Note>
        </Panel>
      )}
    </>
  );
}

const PERIODS = [
  { id: "day", label: "Сутки", days: 1 },
  { id: "week", label: "Неделя", days: 7 },
  { id: "month", label: "Месяц", days: 31 },
  { id: "all", label: "Всё время", days: 100000 },
];

function StatsView({ ui, g, accent, logKey, settings, setS }) {
  const { Panel, Row, Btn } = ui;
  const [period, setPeriod] = useState("week");
  const [repBusy, setRepBusy] = useState(false);
  const [repMsg, setRepMsg] = useState("");
  const makeReport = async () => {
    setRepBusy(true); setRepMsg("");
    try { setRepMsg(await shareWeekReport({ logKey, activity: settings.activity, color: accent })); }
    catch { setRepMsg("Не получилось нарисовать отчёт."); }
    setRepBusy(false);
  };
  const days = useDays(logKey);
  const P = PERIODS.find((p) => p.id === period);
  const sel = useMemo(() => {
    const edge = dayKey(Date.now() - (P.days - 1) * 86400000);
    return days.filter((d) => d.d >= edge);
  }, [days, P]);
  const hist = useMemo(() => sumHist(sel), [sel]);
  const total = hist.reduce((a, b) => a + b, 0);
  const wb = useMemo(() => weibull(hist), [hist]);
  const rotorD = settings.rotorD || 1.5;

  const energy = useMemo(() => {
    if (!total) return null;
    let wh = 0;
    hist.forEach((c, i) => { wh += (c / 60) * turbineW(i + 0.5, rotorD); });
    const hours = total / 60;
    return { kwh: wh / 1000, avgW: wh / hours, year: (wh / hours) * 8760 / 1000 };
  }, [hist, total, rotorD]);

  const rec = useMemo(() => {
    if (!days.length) return null;
    const gust = days.reduce((a, b) => (b.gust > a.gust ? b : a));
    const windy = days.filter((d) => d.n >= 60).reduce((a, b) => (!a || b.sum / b.n > a.sum / a.n ? b : a), null);
    const calm = days.filter((d) => d.n >= 60).reduce((a, b) => (!a || b.sum / b.n < a.sum / a.n ? b : a), null);
    return { gust, windy, calm, count: days.length };
  }, [days]);

  const shown = hist.slice(0, Math.max(8, hist.findLastIndex((c) => c > 0) + 2));
  const maxC = Math.max(1, ...shown);

  const exportRows = async (kind) => {
    const rows = await readMinutes(logKey, P.days > 1000 ? 0 : Date.now() - P.days * 86400000);
    const name = `wind-${logKey.replace(/[^\w-]/g, "_")}-${period}`;
    if (kind === "csv") download(`${name}.csv`, toCsv(rows));
    else download(`${name}.json`, JSON.stringify(rows.map(({ k, ...r }) => r)), "application/json");
  };

  return (
    <>
      <Chips value={period} options={PERIODS} accent={accent} onChange={setPeriod} />

      <Panel title="Распределение скоростей" g={g} meta={total ? `${Math.round(total / 60)} Ч ЗАПИСИ` : "ПУСТО"}>
        {!total ? <div style={{ color: DIM, fontSize: 11 }}>За этот период в журнале ничего нет.</div> : (
          <>
            <svg viewBox={`0 0 ${shown.length * 10} 100`} preserveAspectRatio="none" style={{ width: "100%", height: 130, display: "block" }}>
              {shown.map((c, i) => (
                <rect key={i} x={i * 10 + 1} width={8} y={100 - (c / maxC) * 96} height={(c / maxC) * 96}
                      fill={accent} opacity={0.75} />
              ))}
              {wb && (
                <path fill="none" stroke={TEXT} strokeWidth={1.2} vectorEffect="non-scaling-stroke" opacity={0.7}
                      d={shown.map((_, i) => {
                        const v = i + 0.5;
                        const y = 100 - (wpdf(v, wb.k, wb.c) * total / maxC) * 96;
                        return `${i ? "L" : "M"}${i * 10 + 5},${Math.max(0, y).toFixed(1)}`;
                      }).join("")} />
              )}
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9.5, marginTop: 4, ...NUM }}>
              <span>0</span><span>{Math.round(shown.length / 2)}</span><span>{shown.length} м/с</span>
            </div>
            {wb && (
              <div style={{ marginTop: 10 }}>
                <Row g={g} k="Средний ветер" v={`${wb.mu.toFixed(1)} м/с`} />
                <Row g={g} k="Вейбулл, форма k" v={wb.k.toFixed(2)} />
                <Row g={g} k="Вейбулл, масштаб c" v={`${wb.c.toFixed(1)} м/с`} />
                <Row g={g} k="Штиль (< 1 м/с)" v={`${Math.round((hist[0] / total) * 100)} %`} />
                <Row g={g} k="Больше 5 м/с" v={`${Math.round((hist.slice(5).reduce((a, b) => a + b, 0) / total) * 100)} %`} />
              </div>
            )}
            <Note>Столбики — доля минут с таким средним ветром, линия — распределение Вейбулла по ним. k около 2 — обычный
              ветреный край, меньше 1.5 — ветер «рваный»: много штиля и редкие сильные порывы.</Note>
          </>
        )}
      </Panel>

      <Panel title="Энергия ветряка" g={g} meta={`РОТОР ${rotorD} М`}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, color: DIM, fontSize: 11, marginBottom: 10 }}>
          Диаметр ротора
          <LiquidRange className="rng" thick={5} color={accent} wrapStyle={{ flex: 1 }} min={0.5} max={6} step={0.1} value={rotorD}
                       onChange={(e) => setS({ rotorD: +e.target.value })} style={{ "--rng-accent": accent }} />
          <span style={{ ...NUM, color: TEXT, minWidth: 44 }}>{rotorD.toFixed(1)} м</span>
        </label>
        {energy ? (
          <>
            <Row g={g} k="Средняя мощность" v={`${energy.avgW.toFixed(1)} Вт`} />
            <Row g={g} k="Выработка за период" v={`${energy.kwh.toFixed(2)} кВт·ч`} />
            <Row g={g} k="В пересчёте на год" v={`${Math.round(energy.year)} кВт·ч`} />
          </>
        ) : <div style={{ color: DIM, fontSize: 11 }}>Нет записей за период.</div>}
        <Note>Условный малый ветряк: старт с 3 м/с, номинал на 12, остановка на 25, КПД ротора 0.35. Ветер берётся с
          высоты мачты — на столбе выше ветряк даст больше (см. «Ветер на высоте»).</Note>
      </Panel>

      <Panel title="Рекорды" g={g} meta={rec ? `${rec.count} СУТ.` : "ПУСТО"}>
        {!rec ? <div style={{ color: DIM, fontSize: 11 }}>Рекорды появятся вместе с журналом.</div> : (
          <>
            <Row g={g} k="Сильнейший порыв" v={`${rec.gust.gust.toFixed(1)} м/с · ${rec.gust.d}`} />
            {rec.windy && <Row g={g} k="Самый ветреный день" v={`${(rec.windy.sum / rec.windy.n).toFixed(1)} м/с · ${rec.windy.d}`} />}
            {rec.calm && <Row g={g} k="Самый тихий день" v={`${(rec.calm.sum / rec.calm.n).toFixed(1)} м/с · ${rec.calm.d}`} />}
          </>
        )}
      </Panel>

      <Panel title="Календарь" g={g} meta="СРЕДНИЙ ВЕТЕР ЗА ДЕНЬ · 26 НЕДЕЛЬ">
        <Calendar days={days} accent={accent} />
      </Panel>

      <Panel title="Отчёт за неделю" g={g} meta="КАРТИНКА 1200×1400">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn g={g} primary disabled={!logKey || repBusy} onClick={makeReport}>{repBusy ? "Рисую…" : "Поделиться отчётом"}</Btn>
          {repMsg && <span style={{ color: DIM, fontSize: 11 }}>{repMsg}</span>}
        </div>
        <Note>Средний ветер, сильнейший порыв, часы в вашем коридоре для занятия «{(ACTIVITIES.find((a) => a.id === settings.activity) || ACTIVITIES[0]).label}»,
          ветер по дням, роза и лучшие часы суток — одной картинкой. На телефоне откроется «Поделиться», на компьютере
          картинка сохранится в загрузки.</Note>
      </Panel>

      <Panel title="Экспорт" g={g} meta="МИНУТНЫЕ АГРЕГАТЫ">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn g={g} disabled={!logKey} onClick={() => exportRows("csv")}>CSV</Btn>
          <Btn g={g} disabled={!logKey} onClick={() => exportRows("json")}>JSON</Btn>
        </div>
        <Note>За выбранный выше период: время (UTC), средний, минимум, максимум, порыв, направление, давление, батарея,
          сигнал. Excel открывает CSV напрямую.</Note>
      </Panel>
    </>
  );
}

function Calendar({ days, accent }) {
  const map = useMemo(() => new Map(days.map((d) => [d.d, d.n ? d.sum / d.n : 0])), [days]);
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 7 * 26 + 1 - ((end.getDay() + 6) % 7));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells = [];
  for (let d = new Date(start), i = 0; d <= end; d.setDate(d.getDate() + 1), i++) {
    const k = dayKey(d.getTime());
    cells.push({ k, col: Math.floor(i / 7), row: i % 7, v: map.get(k) });
  }
  const cols = Math.max(1, ...cells.map((c) => c.col)) + 1;
  return (
    <>
      <svg viewBox={`0 0 ${cols * 12} ${7 * 12}`} style={{ width: "100%", display: "block" }}>
        {cells.map((c) => (
          <rect key={c.k} x={c.col * 12} y={c.row * 12} width={10} height={10} rx={2}
                fill={c.v == null ? "rgba(255,255,255,0.05)" : accent}
                opacity={c.v == null ? 1 : 0.15 + Math.min(1, c.v / 10) * 0.85}>
            <title>{c.v == null ? `${c.k}: нет записи` : `${c.k}: ${c.v.toFixed(1)} м/с`}</title>
          </rect>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9.5, marginTop: 6 }}>
        <span>полгода назад</span><span>ярче — ветренее, 10 м/с и выше — полный цвет</span><span>сегодня</span>
      </div>
    </>
  );
}

// ============================================================
// ПРОГНОЗ ПРОТИВ СТАНЦИИ И СОСЕДИ
// ============================================================
function ForecastView({ ui, g, accent, logKey, fc, coords, settings, setS }) {
  const { Panel, Row } = ui;
  const ckey = calKey(coords);
  const [calRev, setCalRev] = useState(0);
  const cal = useMemo(() => getCal(ckey), [ckey, calRev, fc]); // eslint-disable-line react-hooks/exhaustive-deps
  const calOn = calEnabled();
  // Свежая поправка — при открытии вкладки и когда пришёл прогноз.
  useEffect(() => {
    if (!fc || !logKey || !coords) return;
    refitCorrection({ coords, logKey, fc }).then(() => setCalRev((r) => r + 1));
  }, [fc, logKey, ckey]); // eslint-disable-line react-hooks/exhaustive-deps
  const mins = useMinutes(logKey, 2 * 86400000);
  const mastH = settings.mastH || 3;
  // Станцию приводим к 10 м: прогноз дан на этой высоте, а мачта обычно ниже,
  // и без поправки «прогноз завышает» было бы просто разницей высот.
  const to10 = (10 / mastH) ** (1 / 7);
  const cmp = useMemo(() => {
    const byH = new Map();
    for (const r of mins) {
      const h = Math.floor(r.t / 3600000) * 3600000;
      const b = byH.get(h) || [0, 0]; b[0] += r.avg; b[1]++; byH.set(h, b);
    }
    const st = [...byH].filter(([, [, n]]) => n >= 20).map(([t, [s, n]]) => [t + 1800000, (s / n) * to10]).sort((a, b) => a[0] - b[0]);
    const from = Date.now() - 48 * 3600000, to = Date.now() + 24 * 3600000;
    const f = (fc || []).filter((p) => p.t >= from && p.t <= to).map((p) => [p.t + 1800000, p.s0 ?? p.s]);
    // Прогноз с поправкой — на тот же уровень 10 м, что и станция на графике.
    const fx = cal && calOn ? (fc || []).filter((p) => p.t >= from && p.t <= to).map((p) => [p.t + 1800000, (p.s0 ?? p.s) * cal.k * to10]) : [];
    let n = 0, bias = 0, mae = 0;
    for (const [t, v] of st) {
      const p = (fc || []).find((q) => Math.abs(q.t + 1800000 - t) < 60000);
      if (!p) continue;
      const m = p.s0 ?? p.s;
      n++; bias += m - v; mae += Math.abs(m - v);
    }
    return { st, f, fx, from, to, n, bias: n ? bias / n : 0, mae: n ? mae / n : 0 };
  }, [mins, fc, to10, cal, calOn]);

  // «Завышает на 27%» — это 1/k − 1: модель дует в 1/k раза сильнее мачты.
  const over = cal ? 1 / cal.k - 1 : 0;
  const overText = !cal ? "" : Math.abs(over) < 0.04 ? "почти не ошибается"
    : over > 0 ? `завышает ветер на ${Math.round(over * 100)}%` : `занижает ветер на ${Math.round(-over * 100)}%`;
  return (
    <>
      <Panel title="Поправка к прогнозу" g={g} meta={cal ? `${cal.n} Ч СРАВНЕНИЯ` : "КОПИТСЯ"}>
        {!coords ? <div style={{ color: DIM, fontSize: 11 }}>Нужны координаты станции — без них нечего сравнивать с моделью.</div>
          : !logKey ? <div style={{ color: DIM, fontSize: 11 }}>Журнал ведётся только с настоящей станции — подключите её во вкладке «Станция».</div>
          : !cal ? (
            <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
              Пока мало данных: нужны сутки журнала с заметным ветром, чтобы понять, в какую сторону модель
              ошибается именно у вас. Оставьте дашборд открытым — поправка появится сама.
            </div>
          ) : (
            <>
              <Row g={g} k="Модель у вас" v={overText} mono={false} />
              <Row g={g} k="Множитель среднего / порывов" v={`× ${cal.k.toFixed(2)} / × ${cal.kg.toFixed(2)}`} />
              <Row g={g} k="Ошибка, м/с" v={`${cal.mae0.toFixed(1)} → ${cal.mae1.toFixed(1)}`} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ color: DIM, fontSize: 11 }}>Применять поправку в окнах и сводках</span>
                <Segments variant="chips seg-plain" ariaLabel="Поправка прогноза" value={calOn ? "on" : "off"}
                          onChange={(v) => { setCalEnabled(v === "on"); setCalRev((r) => r + 1); }}
                          options={[{ value: "off", label: "выкл" }, { value: "on", label: "вкл" }]} />
              </div>
              <Note>Множитель посчитан по {cal.n} часам журнала за последние две недели; ошибка «до → после» — на тех же
                часах, на новых она будет немного больше. Поправка меняет и «окна по прогнозу», и сводки; станция против
                модели ниже по-прежнему сравнивается с сырой моделью.</Note>
            </>
          )}
      </Panel>
      <Panel title="Станция против прогноза" g={g} meta="OPEN-METEO · 10 М">
        {!coords ? <div style={{ color: DIM, fontSize: 11 }}>Нужны координаты станции — их задают в secrets.h или в каталоге.</div>
          : !fc ? <div style={{ color: DIM, fontSize: 11 }}>Прогноз не ответил.</div> : (
            <>
              <Lines from={cmp.from} to={cmp.to} labels={["−48 ч", "−24 ч", "сейчас", "+24 ч"]}
                     series={[
                       { id: "f", pts: cmp.f, color: TEXT, op: 0.45, dash: "4 3", w: 1.2 },
                       ...(cmp.fx.length ? [{ id: "fx", pts: cmp.fx, color: accent, op: 0.55, dash: "2 3", w: 1.4 }] : []),
                       { id: "s", pts: cmp.st, color: accent },
                     ]} />
              <Legend items={[{ label: "станция, приведена к 10 м", color: accent }, { label: "прогноз", color: TEXT, op: 0.45 },
                              ...(cmp.fx.length ? [{ label: "прогноз с поправкой", color: accent, op: 0.55 }] : [])]} />
              <div style={{ marginTop: 12 }}>
                {cmp.n >= 3 ? (
                  <>
                    <Row g={g} k="Прогноз в среднем" v={`${cmp.bias >= 0 ? "завышает" : "занижает"} на ${Math.abs(cmp.bias).toFixed(1)} м/с`} mono={false} />
                    <Row g={g} k="Средняя ошибка" v={`${cmp.mae.toFixed(1)} м/с`} />
                    <Row g={g} k="Сравнено часов" v={String(cmp.n)} />
                  </>
                ) : <div style={{ color: DIM, fontSize: 11 }}>Для оценки нужно хотя бы три часа журнала.</div>}
              </div>
              <Note>Если прогноз здесь стабильно завышает, это не обязательно ошибка модели: мачту прикрывают деревья и
                дома, а модель их не видит. Тогда вычитайте эту поправку, читая прогноз.</Note>
            </>
          )}
      </Panel>
      <Neighbors ui={ui} g={g} coords={coords} accent={accent} />
    </>
  );
}

// METAR ближайших аэродромов. aviationweather.gov не отдаёт CORS, поэтому из
// браузера запрос не пройдёт — работает в программе Weathered_Kiwi (оболочка
// дописывает заголовок). Иначе — честная подпись и модельный ветер в точке.
function Neighbors({ ui, g, coords }) {
  const { Panel, Row } = ui;
  const [st, setSt] = useState(null);       // null — ещё не спрашивали
  useEffect(() => {
    if (!coords) return undefined;
    // Вне программы запрос заведомо упрётся в CORS — не шумим в консоль зря.
    if (typeof window === "undefined" || !window.wkWindow) { setSt({ ok: false }); return undefined; }
    let dead = false;
    const d = 1.2;
    const bbox = [coords.lat - d, coords.lon - d * 1.5, coords.lat + d, coords.lon + d * 1.5].map((v) => v.toFixed(2)).join(",");
    fetch(`https://aviationweather.gov/api/data/metar?bbox=${bbox}&format=json`)
      .then((r) => (r.status === 204 ? [] : r.json()))
      .then((j) => {
        if (dead || !Array.isArray(j)) return;
        const near = j.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.wspd))
          .map((m) => ({ ...m, km: km(coords, m) })).sort((a, b) => a.km - b.km).slice(0, 5);
        setSt({ ok: true, near });
      })
      .catch(() => { if (!dead) setSt({ ok: false }); });
    return () => { dead = true; };
  }, [coords && coords.lat.toFixed(2), coords && coords.lon.toFixed(2)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel title="Соседи" g={g} meta="METAR АЭРОДРОМОВ">
      {!coords ? <div style={{ color: DIM, fontSize: 11 }}>Нужны координаты станции.</div>
        : !st ? <div style={{ color: DIM, fontSize: 11 }}>спрашиваю…</div>
        : !st.ok ? <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>Служба METAR не пускает запросы из браузера.
            В программе Weathered_Kiwi этот блок работает; здесь для сравнения остаётся прогноз выше.</div>
        : !st.near.length ? <div style={{ color: DIM, fontSize: 11 }}>В радиусе ~130 км аэродромов с METAR нет.</div>
        : st.near.map((m) => (
          <Row key={m.icaoId} g={g} k={`${m.icaoId} · ${Math.round(m.km)} км`}
               v={`${(m.wspd * 0.5144).toFixed(1)} м/с${m.wgst ? `, порыв ${(m.wgst * 0.5144).toFixed(0)}` : ""}${Number.isFinite(m.wdir) ? ` · ${m.wdir}°` : ""}`} />
        ))}
      <Note>Аэродром меряет на 10 м и на открытом поле. Сильно больше, чем у вас, — норма для низкой мачты;
        сильно меньше — повод проверить датчик.</Note>
    </Panel>
  );
}
function km(a, b) {
  const r = Math.PI / 180, R = 6371;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
