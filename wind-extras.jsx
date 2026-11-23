// Добавки 0.5.8: свои тревоги, резервная копия журнала, роза ветров за период,
// дневник дня. Оформление — пропсом ui (Panel, Row, Btn), как в остальных модулях.
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { TEXT, DIM, FAINT, LINE, NUM } from "./ui-kit.js";
import { readMinutes, onLog, exportAll, importAll, download, dayKey } from "./wind-log.js";
import { METRICS, metricOf, newRule, ruleText } from "./wind-rules.js";
import { Segments } from "./wind-switch.jsx";

const Note = ({ children }) => (
  <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>{children}</div>
);
const field = { background: "rgba(var(--rule, 255,255,255),0.07)", color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8,
  padding: "5px 8px", fontSize: 12, font: "inherit", minWidth: 0 };

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

// ============================================================
// СВОИ ТРЕВОГИ
// ============================================================
export function RulesPanel({ ui, g, accent, settings, setS }) {
  const { Panel, Btn } = ui;
  const rules = settings.rules || [];
  const set = (next) => setS({ rules: next });
  const patch = (id, p) => set(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const [metric, setMetric] = useState("speed");
  return (
    <Panel title="Свои тревоги" g={g} meta={rules.length ? `${rules.filter((r) => r.on).length} ИЗ ${rules.length} ВКЛ` : "НЕТ ПРАВИЛ"}>
      {!rules.length && <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
        Правило — «если ветер выше 12 м/с дольше 2 минут — сообщи». Добавьте своё: порыв, средний ветер, падение давления или заряд.</div>}
      {rules.map((r) => {
        const m = metricOf(r.metric);
        return (
          <div key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
            <input type="checkbox" checked={!!r.on} onChange={(e) => patch(r.id, { on: e.target.checked })} aria-label="Правило включено"
                   style={{ accentColor: accent }} />
            <span style={{ fontSize: 11.5, color: r.on ? TEXT : FAINT, flex: "1 1 160px" }}>{m.label}</span>
            {m.ops && (
              <select value={r.op} onChange={(e) => patch(r.id, { op: e.target.value })} style={field} aria-label="Условие">
                <option value=">">выше</option><option value="<">ниже</option>
              </select>
            )}
            <input type="number" value={r.value} step={m.id === "pdrop" ? 0.5 : 1} style={{ ...field, width: 64, ...NUM }} aria-label="Порог"
                   onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patch(r.id, { value: v }); }} />
            <span style={{ color: DIM, fontSize: 11 }}>{m.unit}</span>
            {m.id === "speed" && (
              <>
                <span style={{ color: DIM, fontSize: 11 }}>дольше</span>
                <input type="number" min={0} max={120} value={r.hold || 0} style={{ ...field, width: 52, ...NUM }} aria-label="Минут"
                       onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patch(r.id, { hold: Math.max(0, v) }); }} />
                <span style={{ color: DIM, fontSize: 11 }}>мин</span>
              </>
            )}
            <button onClick={() => set(rules.filter((x) => x.id !== r.id))} aria-label="Удалить правило" title="Удалить"
                    style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} style={field} aria-label="Что отслеживать">
          {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <Btn g={g} onClick={() => set([...rules, newRule(metric)])}>ДОБАВИТЬ</Btn>
      </div>
      <Note>Каждое правило срабатывает один раз за «эпизод»: пока условие держится, повторов нет. Идёт через те же
        ворота уведомлений (не больше 33 в сутки), ночью копится в утреннюю сводку. Правила видят только настоящую станцию, не демо.
        {/* Каждое правило — свой текстовый узел: словарь переводов (wind-i18n.js)
            знает строку одного правила, а склейку через «; » не узнал бы. */}
        {rules.some((r) => r.on) && <> Сейчас: {rules.filter((r) => r.on).map((r, i) => (
          <Fragment key={r.id}>{i ? "; " : ""}{ruleText(r)}</Fragment>))}.</>}</Note>
    </Panel>
  );
}

// ============================================================
// РЕЗЕРВНАЯ КОПИЯ
// ============================================================
export function BackupPanel({ ui, g, logKey }) {
  const { Panel, Btn } = ui;
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const j = await exportAll(logKey);
      download(`wind-backup-${logKey.replace(/[^\w-]/g, "_")}-${dayKey(Date.now())}.json`, JSON.stringify(j), "application/json");
      setMsg(`Сохранено: ${j.min.length} минут, ${j.day.length} суток, ${j.ev.length} событий.`);
    } catch { setMsg("Не получилось собрать копию."); }
    setBusy(false);
  };
  const restore = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const n = await importAll(logKey, JSON.parse(await f.text()));
      setMsg(n < 0 ? "Это не копия журнала Weathered_Kiwi." : `Восстановлено записей: ${n}.`);
    } catch { setMsg("Файл не читается."); }
    setBusy(false);
  };
  return (
    <Panel title="Резервная копия" g={g} meta="ЖУРНАЛ СТАНЦИИ">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn g={g} primary disabled={!logKey || busy} onClick={save}>СОХРАНИТЬ КОПИЮ</Btn>
        <Btn g={g} disabled={!logKey || busy} onClick={() => file.current && file.current.click()}>ВОССТАНОВИТЬ</Btn>
        <input ref={file} type="file" accept="application/json,.json" onChange={restore} style={{ display: "none" }} />
        {msg && <span style={{ color: DIM, fontSize: 11 }}>{msg}</span>}
      </div>
      <Note>Журнал лежит в браузере этого устройства и пропадает вместе с «очисткой данных сайта». Копия — один файл
        со всеми минутами, сутками и событиями. Сохраните его в папку Google Диска — и она будет в облаке; восстановление
        докладывает записи, а не стирает имеющиеся.</Note>
    </Panel>
  );
}

// ============================================================
// РОЗА ВЕТРОВ ЗА ПЕРИОД
// ============================================================
const SPANS = [{ id: "1", label: "Сутки", days: 1 }, { id: "7", label: "Неделя", days: 7 }, { id: "30", label: "Месяц", days: 30 }];
const SECT = 16;
const NAMES = ["С", "ССВ", "СВ", "ВСВ", "В", "ВЮВ", "ЮВ", "ЮЮВ", "Ю", "ЮЮЗ", "ЮЗ", "ЗЮЗ", "З", "ЗСЗ", "СЗ", "ССЗ"];
const sect = (d) => Math.floor((((d % 360) + 360 + 11.25) % 360) / 22.5) % SECT;

export function RosePanel({ ui, g, accent, logKey, fc }) {
  const { Panel, Row } = ui;
  const [span, setSpan] = useState("7");
  const P = SPANS.find((s) => s.id === span);
  const rows = useMinutes(logKey, P.days * 86400000);
  const rose = useMemo(() => {
    const sec = Array.from({ length: SECT }, () => ({ n: 0, sum: 0 }));
    let src = "station";
    for (const r of rows) if (Number.isFinite(r.dir) && r.avg >= 1) { const s = sec[sect(r.dir)]; s.n++; s.sum += r.avg; }
    let total = sec.reduce((a, s) => a + s.n, 0);
    // Датчика направления нет — берём направление модели Open-Meteo за те же часы.
    if (total < 30 && fc) {
      src = "model";
      sec.forEach((s) => { s.n = 0; s.sum = 0; });
      const from = Date.now() - P.days * 86400000, to = Date.now();
      for (const p of fc) if (p.t >= from && p.t <= to && Number.isFinite(p.d) && p.s >= 1) { const s = sec[sect(p.d)]; s.n++; s.sum += p.s; }
      total = sec.reduce((a, s) => a + s.n, 0);
    }
    return { sec, total, src };
  }, [rows, fc, P]);
  const max = Math.max(1, ...rose.sec.map((s) => s.n));
  const best = rose.sec.reduce((a, s, i) => (s.n > rose.sec[a].n ? i : a), 0);
  const R = 92, C = 110;
  const petal = (i) => {
    const s = rose.sec[i];
    if (!s.n) return null;
    const r = 8 + (s.n / max) * (R - 8), a0 = ((i * 22.5 - 9) * Math.PI) / 180, a1 = ((i * 22.5 + 9) * Math.PI) / 180;
    const pt = (a, rr) => `${(C + Math.sin(a) * rr).toFixed(1)},${(C - Math.cos(a) * rr).toFixed(1)}`;
    return <path key={i} d={`M${C},${C} L${pt(a0, r)} A${r},${r} 0 0 1 ${pt(a1, r)} Z`} fill={accent}
                 opacity={0.35 + 0.65 * Math.min(1, s.sum / s.n / 12)} />;
  };
  return (
    <Panel title="Роза ветров" g={g} meta={rose.total ? (rose.src === "model" ? "ПО МОДЕЛИ OPEN-METEO" : "ПО ВАШЕМУ ДАТЧИКУ") : "НЕТ ДАННЫХ"}>
      <div className="chip-row" style={{ display: "flex", marginBottom: 10 }}>
        <Segments variant="chips seg-plain" value={span} onChange={setSpan} options={SPANS.map((s) => ({ value: s.id, label: s.label }))} />
      </div>
      {!rose.total ? <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
        Направление не меряется (датчика нет), а прогноз ещё не пришёл. Роза появится, когда будут координаты станции и сеть.</div> : (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <svg viewBox="0 0 220 220" width="220" height="220" style={{ flexShrink: 0, maxWidth: "100%" }} role="img" aria-label="Роза ветров">
            {[0.33, 0.66, 1].map((k) => <circle key={k} cx={C} cy={C} r={8 + k * (R - 8)} fill="none" stroke="rgba(var(--rule, 160,180,200),0.18)" />)}
            {Array.from({ length: SECT }, (_, i) => petal(i))}
            {[["С", 110, 12], ["В", 210, 114], ["Ю", 110, 216], ["З", 10, 114]].map(([t, x, y]) => (
              <text key={t} x={x} y={y} textAnchor="middle" fontSize="11" style={{ fill: DIM }}>{t}</text>
            ))}
          </svg>
          <div style={{ flex: "1 1 160px" }}>
            <Row g={g} k="Чаще всего дует с" v={<>{NAMES[best]}{` · ${Math.round((rose.sec[best].n / rose.total) * 100)} %`}</>} />
            <Row g={g} k="Там в среднем" v={`${(rose.sec[best].sum / rose.sec[best].n).toFixed(1)} м/с`} />
            <Row g={g} k="Учтено" v={`${Math.round(rose.total / (rose.src === "model" ? 1 : 60))} ${rose.src === "model" ? "ч модели" : "ч записи"}`} />
          </div>
        </div>
      )}
      <Note>Длина лепестка — как часто ветер дул с этой стороны, насыщенность — насколько он там был сильным.
        Без датчика направления берётся модель Open-Meteo в точке станции: это не измерение, а то, откуда ветер дул вокруг.</Note>
    </Panel>
  );
}

// ============================================================
// ДНЕВНИК ДНЯ
// ============================================================
const hh = (ms) => `${String(new Date(ms).getHours()).padStart(2, "0")}:${String(new Date(ms).getMinutes()).padStart(2, "0")}`;
function diaryOf(rows, turbineW, rotorD) {
  if (rows.length < 30) return null;
  let peak = null, sum = 0, wh = 0;
  const hours = Array.from({ length: 24 }, () => ({ n: 0, sum: 0 }));
  for (const r of rows) {
    sum += r.avg;
    const gv = r.gust || r.max || 0;
    if (!peak || gv > peak.v) peak = { v: gv, t: r.t };
    const h = hours[new Date(r.t).getHours()];
    h.n++; h.sum += r.avg;
    wh += turbineW(r.avg, rotorD) / 60;
  }
  let calm = null;
  hours.forEach((h, i) => {
    if (h.n < 20) return;
    const a = h.sum / h.n;
    if (!calm || a < calm.a) calm = { h: i, a };
  });
  return { peak, avg: sum / rows.length, wh, calm, hours: hours.map((h) => (h.n ? h.sum / h.n : null)), minutes: rows.length };
}

export function DiaryPanel({ ui, g, accent, logKey, rotorD = 1.5, turbineW }) {
  const { Panel, Row, Btn } = ui;
  const [off, setOff] = useState(0);     // 0 — сегодня, 1 — вчера
  const rows = useMinutes(logKey, 3 * 86400000);
  const day = useMemo(() => {
    const k = dayKey(Date.now() - off * 86400000);
    return diaryOf(rows.filter((r) => dayKey(r.t) === k), turbineW, rotorD);
  }, [rows, off, rotorD, turbineW]);
  const [msg, setMsg] = useState("");
  const share = async () => {
    setMsg("");
    try { await shareDiary(day, off, accent); } catch { setMsg("Не получилось нарисовать."); }
  };
  const label = off ? "вчера" : "сегодня";
  return (
    <Panel title="Дневник дня" g={g} meta={day ? label.toUpperCase() : "МАЛО ДАННЫХ"}>
      <div className="chip-row" style={{ display: "flex", marginBottom: 10 }}>
        <Segments variant="chips seg-plain" value={String(off)} onChange={(v) => setOff(+v)}
                  options={[{ value: "0", label: "Сегодня" }, { value: "1", label: "Вчера" }]} />
      </div>
      {!day ? <div style={{ color: DIM, fontSize: 11 }}>За {label} в журнале меньше получаса записи — дневник пока не из чего писать.</div> : (
        <>
          <div style={{ color: TEXT, fontSize: 12.5, lineHeight: 1.7, marginBottom: 8 }}>
            {label[0].toUpperCase() + label.slice(1)} ветер в среднем {day.avg.toFixed(1)} м/с. Сильнее всего дунуло в {hh(day.peak.t)} — порыв {day.peak.v.toFixed(1)} м/с.
            {day.calm && <> Тише всего было около {String(day.calm.h).padStart(2, "0")}:00 ({day.calm.a.toFixed(1)} м/с).</>}
          </div>
          <svg viewBox="0 0 240 50" preserveAspectRatio="none" style={{ width: "100%", height: 54, display: "block" }} aria-hidden="true">
            {day.hours.map((v, i) => {
              if (v == null) return null;
              const top = Math.max(4, ...day.hours.filter((q) => q != null));
              const h = Math.max(1.5, (v / top) * 46);
              return <rect key={i} x={i * 10 + 1} width={8} y={48 - h} height={h} rx={2} fill={accent} opacity={0.8} />;
            })}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", color: FAINT, fontSize: 9.5, marginTop: 3, ...NUM }}>
            <span>00</span><span>06</span><span>12</span><span>18</span><span>24 ч</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Row g={g} k="Записано" v={`${(day.minutes / 60).toFixed(1)} ч`} />
            <Row g={g} k={`Ветряк ${rotorD.toFixed(1)} м дал бы`} v={`${day.wh.toFixed(day.wh < 100 ? 1 : 0)} Вт·ч`} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <Btn g={g} primary onClick={share}>ПОДЕЛИТЬСЯ КАРТОЧКОЙ</Btn>
            {msg && <span style={{ color: DIM, fontSize: 11 }}>{msg}</span>}
          </div>
        </>
      )}
    </Panel>
  );
}

async function shareDiary(day, off, color) {
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1119"); bg.addColorStop(1, "#04070a");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const sans = "'Segoe UI', sans-serif";
  x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `30px ${sans}`;
  x.fillText(`Дневник ветра · ${new Date(Date.now() - off * 86400000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`, 60, 84);
  x.fillStyle = color; x.font = "600 150px Consolas, monospace";
  x.fillText(day.avg.toFixed(1), 56, 250);
  const w = x.measureText(day.avg.toFixed(1)).width;
  x.fillStyle = "rgba(231,238,246,0.55)"; x.font = `38px ${sans}`;
  x.fillText("м/с в среднем", 76 + w, 250);
  x.fillStyle = "#e7eef6"; x.font = `34px ${sans}`;
  const lines = [`Пик — в ${hh(day.peak.t)}, порыв ${day.peak.v.toFixed(1)} м/с`];
  if (day.calm) lines.push(`Тише всего — около ${String(day.calm.h).padStart(2, "0")}:00`);
  lines.push(`Ветряк дал бы ${day.wh.toFixed(day.wh < 100 ? 1 : 0)} Вт·ч`);
  lines.forEach((t, i) => x.fillText(t, 60, 330 + i * 52));
  const top = Math.max(4, ...day.hours.filter((v) => v != null));
  day.hours.forEach((v, i) => {
    if (v == null) return;
    const h = Math.max(4, (v / top) * 120);
    x.fillStyle = color; x.globalAlpha = 0.85;
    x.fillRect(660 + i * 21, 520 - h, 16, h);
  });
  x.globalAlpha = 1;
  x.fillStyle = "rgba(231,238,246,0.35)"; x.font = `22px ${sans}`;
  x.fillText("по часам, 00–24", 660, 560);
  x.textAlign = "right"; x.fillText("Weathered_Kiwi", W - 60, 600);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  const file = new File([blob], `wind-diary-${Date.now()}.png`, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Дневник ветра" }); return; }
  } catch { return; }
  download(file.name, blob, "image/png");
}
