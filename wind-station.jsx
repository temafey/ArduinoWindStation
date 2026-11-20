// Вкладка «Станция» (бывшая «Система»): подключение своей станции и её здоровье.
//
// Подключение переехало сюда из настроек и стало одним блоком вместо мастера
// в окне: «найти рядом», «вписать адрес или облачный id», «проверить»,
// «подключить» — и тут же список сохранённых. Настройки — про то, как
// дашборд выглядит; к какой мачте он подключён — это про станцию.
//
// Оформление — из дашборда пропсом ui, как во вкладке «Анализ».
import { useState, useEffect, useMemo, useRef } from "react";
import { TEXT, DIM, FAINT, LINE, NUM, SANS } from "./ui-kit.js";
import { readMinutes, readEvents, onLog, logEvent } from "./wind-log.js";

const Note = ({ children }) => (
  <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>{children}</div>
);

function Field({ label, value, onChange, placeholder, type = "text", mono = true }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ color: DIM, fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", fontFamily: SANS }}>{label}</span>
      <input value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
             autoComplete="off" spellCheck={false}
             style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, background: "rgba(0,0,0,0.25)",
                      border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", color: TEXT, fontSize: 12,
                      fontFamily: mono ? NUM.fontFamily : SANS, outline: "none" }} />
    </label>
  );
}

// ============================================================
// ПОДКЛЮЧЕНИЕ
// ============================================================
// Адреса, по которым станция отвечает без всякой настройки: имя от её
// собственного DNS, адрес точки доступа и mDNS-метка (в домашней сети).
const CANDIDATES = ["MyWindProbeBETA.org", "192.168.4.1", "mywindprobebeta.local"];

async function probe(host, ms = 3500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`http://${host}/api/data`, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return Number.isFinite(j.speed) ? j : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function ConnectPanel({ ui, g, accent, stations, activeId, connected, publicCopy, cloudAvail,
  onSelect, onRemove, onSave, onTestCloud, servedFromStation }) {
  const { Panel, Btn, Row } = ui;
  const [busy, setBusy] = useState("");
  const [found, setFound] = useState(null);          // [{ host, j }]
  const [name, setName] = useState("Моя станция");
  const [addr, setAddr] = useState("");
  const [cloudId, setCloudId] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(!stations.length);

  const scan = async () => {
    setBusy("scan"); setMsg(""); setFound(null);
    const known = stations.map((s) => s.host).filter(Boolean);
    const hosts = [...new Set([...known, ...CANDIDATES])];
    const res = await Promise.all(hosts.map(async (host) => ({ host, j: await probe(host) })));
    const ok = res.filter((r) => r.j);
    // Одна плата отвечает и по имени, и по IP — показываем её один раз.
    const seen = new Set();
    setFound(ok.filter((r) => { const id = r.j.hostname || r.host; if (seen.has(id)) return false; seen.add(id); return true; }));
    setBusy("");
  };

  const test = async () => {
    setBusy("test"); setMsg("");
    if (cloudId.trim()) setMsg(await onTestCloud(cloudId.trim()));
    else {
      const j = await probe(addr.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), 6000);
      setMsg(j ? `Станция ответила: ветер ${j.speed} м/с, аптайм ${Math.floor((j.uptime ?? 0) / 60)} мин.`
        : "Не ответила. Устройство должно быть в сети станции (WindStation) или в той же домашней сети.");
    }
    setBusy("");
  };

  const save = (host, via) => {
    const h = (host || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    onSave({ name: name.trim() || "Моя станция", host: h, via, ...(cloudId.trim() ? { cloudId: cloudId.trim() } : {}) });
    setFound(null); setAddr(""); setCloudId(""); setMsg(""); setOpen(false);
  };

  return (
    <Panel title="Подключение" g={g}
           meta={connected ? "НА СВЯЗИ" : stations.length ? "НЕТ ОТВЕТА" : "НЕ НАСТРОЕНО"}>
      {stations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {stations.map((st) => {
            const on = st.id === activeId;
            return (
              <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                                        border: `1px solid ${on ? accent : LINE}`, borderRadius: 10 }}>
                <i style={{ width: 7, height: 7, borderRadius: 9, flexShrink: 0,
                            background: on ? (connected ? "#4ade80" : "#facc15") : "rgba(var(--rule, 255,255,255),0.18)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: TEXT }}>{st.name}</div>
                  <div style={{ ...NUM, fontSize: 10, color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[st.host, st.cloudId && `облако: ${st.cloudId}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {!on && <Btn g={g} onClick={() => onSelect(st)} style={{ padding: "3px 10px" }}>выбрать</Btn>}
                <Btn g={g} onClick={() => onRemove(st.id)} style={{ padding: "3px 9px" }}>✕</Btn>
              </div>
            );
          })}
        </div>
      )}

      {!open ? (
        <Btn g={g} onClick={() => setOpen(true)}>+ ПОДКЛЮЧИТЬ СТАНЦИЮ</Btn>
      ) : (
        <div style={{ borderTop: stations.length ? `1px solid ${LINE}` : "none", paddingTop: stations.length ? 12 : 0 }}>
          {/* Шаг 1 — найти рядом. С публичной копии (HTTPS) до HTTP-платы
              браузер не пустит, поэтому там сразу второй шаг. */}
          {!publicCopy && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Btn g={g} primary disabled={!!busy} onClick={scan}>{busy === "scan" ? "ИЩУ…" : "НАЙТИ РЯДОМ"}</Btn>
                <span style={{ color: DIM, fontSize: 10.5 }}>
                  {servedFromStation ? "вы уже на станции" : "подключитесь к сети WindStation или домашней — и нажмите"}
                </span>
              </div>
              {found && (found.length === 0 ? (
                <Note>Никто не ответил ни по одному из обычных адресов. Впишите адрес ниже — его видно в Serial или в роутере.</Note>
              ) : found.map((r) => (
                <div key={r.host} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Row g={g} k={r.host} v={`${r.j.speed.toFixed(1)} м/с · ${Math.floor((r.j.uptime ?? 0) / 60)} мин`} />
                  </div>
                  <Btn g={g} primary onClick={() => save(r.host, r.host === "192.168.4.1" || r.host === CANDIDATES[0] ? "ap" : "lan")}>
                    ПОДКЛЮЧИТЬ
                  </Btn>
                </div>
              )))}
            </div>
          )}

          <Field label="Название" value={name} onChange={setName} mono={false} />
          {!publicCopy && <Field label="Адрес" value={addr} onChange={setAddr} placeholder="MyWindProbeBETA.org или 192.168.1.50" />}
          {(cloudAvail || publicCopy) && (
            <Field label={publicCopy ? "Идентификатор в облаке" : "Идентификатор в облаке (необязательно)"}
                   value={cloudId} onChange={setCloudId} placeholder="mast" />
          )}
          {msg && <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 11px", fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn g={g} disabled={!!busy || (!addr.trim() && !cloudId.trim())} onClick={test}>
              {busy === "test" ? "ПРОВЕРЯЮ…" : "ПРОВЕРИТЬ"}
            </Btn>
            <Btn g={g} primary disabled={!addr.trim() && !cloudId.trim()} onClick={() => save(addr, "lan")}>ПОДКЛЮЧИТЬ</Btn>
            {stations.length > 0 && <Btn g={g} onClick={() => { setOpen(false); setMsg(""); }}>ОТМЕНА</Btn>}
          </div>
          <Note>
            {publicCopy
              ? "Эта страница открыта по HTTPS, а плата отвечает по HTTP — напрямую браузер к ней не пустит. Отсюда станцию видно только через облако: впишите её идентификатор (SECRET_MQTT_STATION_ID)."
              : "Пароль сети WindStation здесь не спрашивается и не хранится: он задан в secrets.h при сборке прошивки. Облачный идентификатор нужен, только если у станции есть модем и её хочется видеть издалека."}
          </Note>
        </div>
      )}
    </Panel>
  );
}

// ============================================================
// ЗДОРОВЬЕ: история диагностики, автономия, датчик, GPS
// ============================================================
function Spark({ pts, color, height = 34 }) {
  const ok = pts.filter((p) => Number.isFinite(p[1]));
  if (ok.length < 2) return <div style={{ height, color: FAINT, fontSize: 10, display: "flex", alignItems: "center" }}>копится…</div>;
  const t0 = ok[0][0], t1 = ok[ok.length - 1][0];
  const lo = Math.min(...ok.map((p) => p[1])), hi = Math.max(...ok.map((p) => p[1]));
  const span = hi - lo || 1;
  const d = ok.map(([t, v], i) => `${i ? "L" : "M"}${(((t - t0) / Math.max(1, t1 - t0)) * 200).toFixed(1)},${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function useMinutes(k, span) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!k) { setRows([]); return undefined; }
    let dead = false;
    const load = () => readMinutes(k, Date.now() - span).then((r) => { if (!dead) setRows(r); });
    load();
    const off = onLog(load);
    return () => { dead = true; off(); };
  }, [k, span]);
  return rows;
}

// Линейная регрессия заряда за последние часы разряда — через сколько
// часов процент дойдёт до 5. Только пока станция действительно разряжается:
// на зарядке «прогноз автономии» был бы бессмыслицей.
function autonomy(rows, data) {
  if (!data.batteryPresent || data.chargeState !== "discharging") return null;
  const pts = rows.filter((r) => Number.isFinite(r.batP) && r.t > Date.now() - 6 * 3600000);
  if (pts.length < 60) return { wait: true };
  const n = pts.length, mx = pts.reduce((a, r) => a + r.t, 0) / n, my = pts.reduce((a, r) => a + r.batP, 0) / n;
  let sxy = 0, sxx = 0;
  for (const r of pts) { sxy += (r.t - mx) * (r.batP - my); sxx += (r.t - mx) ** 2; }
  const slope = sxy / sxx * 3600000;            // % в час
  if (!(slope < -0.05)) return { flat: true, slope };
  return { hours: Math.max(0, ((data.batteryPercent ?? my) - 5) / -slope), slope };
}

// Датчик залип: час ровного нуля при ощутимом прогнозе, или полчаса
// одного и того же ненулевого числа (настоящий ветер так не стоит).
function stuck(rows, fcNow) {
  const hour = rows.filter((r) => r.t > Date.now() - 3600000);
  if (hour.length < 45) return null;
  const allZero = hour.every((r) => r.max < 0.05);
  if (allZero && Number.isFinite(fcNow) && fcNow >= 4) {
    return `Целый час ровно ноль, а прогноз здесь ${fcNow.toFixed(0)} м/с. Чашки заклинило, отошёл провод или ноль откалиброван слишком высоко.`;
  }
  const half = hour.slice(-30);
  const flat = half.length >= 25 && half.every((r) => r.avg > 0.5 && r.max - r.min < 0.02);
  if (flat) return `Полчаса одно и то же значение ${half[0].avg.toFixed(2)} м/с без малейшего разброса. Живой ветер так не стоит — похоже на наводку или обрыв.`;
  return null;
}

export function HealthPanel({ ui, g, accent, logKey, data, fcNow, events }) {
  const { Panel, Row } = ui;
  const rows = useMinutes(logKey, 86400000);
  const auto = useMemo(() => autonomy(rows, data), [rows, data.batteryPresent, data.chargeState, data.batteryPercent]); // eslint-disable-line react-hooks/exhaustive-deps
  const warn = useMemo(() => stuck(rows, fcNow), [rows, fcNow]);
  const brown = events.filter((e) => e.kind === "brownout" && e.t > Date.now() - 7 * 86400000).length;
  // Средние по 15 минут: минутный шум RSSI и loopMax рисовался бы щёткой.
  const s = (f) => {
    const b = new Map();
    for (const r of rows) {
      if (!Number.isFinite(r[f])) continue;
      const t = Math.floor(r.t / 900000) * 900000, x = b.get(t) || [0, 0];
      x[0] += r[f]; x[1]++; b.set(t, x);
    }
    return [...b].sort((a, c) => a[0] - c[0]).map(([t, [v, n]]) => [t, v / n]);
  };
  return (
    <Panel title="Здоровье" g={g} meta={logKey ? "ЗА СУТКИ" : "ЖУРНАЛ НЕ ВЕДЁТСЯ"}>
      {warn && (
        <div style={{ border: "1px solid rgba(250,204,21,0.5)", borderRadius: 8, padding: "9px 11px", color: "#facc15",
                      fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>⚠ {warn}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        {[["loopMax, мс", "loop", accent], ["Сигнал, dBm", "rssi", "#67e8f9"], ["Батарея, В", "bat", "#4ade80"], ["Скорость, м/с", "avg", TEXT]].map(([lab, f, c]) => (
          <div key={f}>
            <div style={{ color: DIM, fontSize: 9.5, letterSpacing: 1.5, marginBottom: 4 }}>{lab}</div>
            <Spark pts={s(f)} color={c} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {auto && (
          <Row g={g} k="Автономия" mono={false}
               v={auto.wait ? "считаю, нужен час разряда" : auto.flat ? "расход не виден" : `≈ ${auto.hours < 48 ? `${auto.hours.toFixed(0)} ч` : `${(auto.hours / 24).toFixed(1)} сут`} (${auto.slope.toFixed(1)} %/ч)`} />
        )}
        <Row g={g} k="Просадок питания за неделю" v={String(brown)} />
        {data.gpsFix && Number.isFinite(data.gpsLat) && (
          <Row g={g} k="GPS модема" v={`${data.gpsLat.toFixed(3)}, ${data.gpsLon.toFixed(3)}`} />
        )}
      </div>
      {brown > 0 && <Note>Просадка — это ресет от питания: батарея не держит ток передачи. Снаружи выглядит как «станция пропадает».</Note>}
    </Panel>
  );
}

// ============================================================
// ЖУРНАЛ СОБЫТИЙ
// ============================================================
const EV_ICON = { reboot: "↻", brownout: "⚡", net: "≋", cloud: "☁", power: "▮", sensor: "◎", zero: "0", alarm: "!", cmd: "›", window: "◐" };
export function useEvents(k) {
  const [ev, setEv] = useState([]);
  useEffect(() => {
    if (!k) { setEv([]); return undefined; }
    let dead = false;
    const load = () => readEvents(k, Date.now() - 30 * 86400000).then((r) => { if (!dead) setEv(r); });
    load();
    const off = onLog(load);
    return () => { dead = true; off(); };
  }, [k]);
  return ev;
}

export function EventsPanel({ ui, g, events }) {
  const { Panel } = ui;
  const [all, setAll] = useState(false);
  const list = all ? events : events.slice(0, 8);
  return (
    <Panel title="События" g={g} meta={`${events.length} ЗА 30 ДНЕЙ`}>
      {!events.length ? <div style={{ color: DIM, fontSize: 11 }}>Пока тихо. Сюда попадают перезагрузки, смена сети, облако, батарея, калибровки и тревоги.</div> : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {list.map((e) => (
            <div key={`${e.t}-${e.n}`} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ width: 14, textAlign: "center", color: e.kind === "brownout" || e.kind === "sensor" ? "#facc15" : DIM }}>{EV_ICON[e.kind] || "·"}</span>
              <span style={{ ...NUM, color: FAINT, fontSize: 10, minWidth: 86 }}>
                {new Date(e.t).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span style={{ fontSize: 11.5, color: TEXT, lineHeight: 1.45 }}>{e.text}</span>
            </div>
          ))}
          {events.length > 8 && (
            <button onClick={() => setAll((v) => !v)} style={{ marginTop: 8, background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 10.5, textAlign: "left", padding: 0 }}>
              {all ? "свернуть" : `показать все ${events.length}`}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}

// ============================================================
// КАЛИБРОВКА НУЛЯ
// ============================================================
// Над /api/zero: остановить чашки → 10 с смотреть на отсчёт и разброс →
// принять. Итог только в RAM платы, поэтому в конце — строка константы для
// исходника (её отдаёт сама плата).
export function ZeroWizard({ ui, g, host, logKey }) {
  const { Panel, Row, Btn } = ui;
  const [step, setStep] = useState(0);        // 0 — начало, 1 — замер, 2 — итог
  const [z, setZ] = useState(null);
  const [samples, setSamples] = useState([]);
  const [err, setErr] = useState("");
  const timer = useRef(null);
  const ask = (q = "") => fetch(`http://${host}/api/zero${q}`, { cache: "no-store" }).then((r) => r.json());
  useEffect(() => () => clearInterval(timer.current), []);
  const start = () => {
    setErr(""); setSamples([]); setStep(1);
    let n = 0;
    timer.current = setInterval(async () => {
      try {
        const j = await ask(); setZ(j);
        setSamples((s) => [...s, j.speedMv]);
      } catch { setErr("плата не ответила"); }
      if (++n >= 10) clearInterval(timer.current);
    }, 1000);
  };
  const accept = async () => {
    try {
      const j = await ask("?set="); setZ(j); setStep(2);
      logEvent(logKey, "zero", `Ноль откалиброван: ${j.zeroMv} мВ`);
    } catch { setErr("плата не приняла"); }
  };
  const reset = async () => {
    try { const j = await ask("?reset=1"); setZ(j); setStep(2); logEvent(logKey, "zero", `Ноль сброшен к константе: ${j.zeroMv} мВ`); } catch { setErr("плата не ответила"); }
  };
  const spread = samples.length > 1 ? Math.max(...samples) - Math.min(...samples) : null;
  return (
    <Panel title="Калибровка нуля" g={g} meta={["ГОТОВО К ЗАМЕРУ", samples.length < 10 ? `ЗАМЕР ${samples.length}/10` : "ЗАМЕР ГОТОВ", "ПРИНЯТО"][step]}>
      {step === 0 && (
        <>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, color: TEXT }}>1. Остановите чашки рукой или закройте датчик от ветра.</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, color: TEXT, marginTop: 4 }}>2. Нажмите «Замер» — десять секунд дашборд смотрит, что видит пин.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn g={g} primary onClick={start}>ЗАМЕР</Btn>
            <Btn g={g} onClick={reset}>ВЕРНУТЬ КОНСТАНТУ</Btn>
          </div>
        </>
      )}
      {step >= 1 && z && (
        <>
          <Row g={g} k="Отсчёт сейчас" v={`${z.speedMv} мВ`} />
          <Row g={g} k="Действующий ноль" v={`${z.zeroMv} мВ`} />
          {spread != null && <Row g={g} k="Разброс за замер" v={`${spread.toFixed(1)} мВ`} />}
        </>
      )}
      {step === 1 && samples.length >= 10 && (
        <>
          {spread > 15 && <Note>Разброс больше 15 мВ — чашки, похоже, ещё крутятся или на проводе наводка. Лучше повторить.</Note>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn g={g} primary onClick={accept}>ПРИНЯТЬ</Btn>
            <Btn g={g} onClick={start}>ПОВТОРИТЬ</Btn>
          </div>
        </>
      )}
      {step === 2 && z && (
        <>
          <Note>Принято, но только до перезагрузки: прошивка не пишет NVS. Чтобы навсегда — вставьте строку в .ino:</Note>
          <div style={{ ...NUM, fontSize: 11, background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: 8, marginTop: 8, userSelect: "all", wordBreak: "break-all" }}>{z.constant}</div>
          <div style={{ marginTop: 12 }}><Btn g={g} onClick={() => setStep(0)}>ЗАНОВО</Btn></div>
        </>
      )}
      {err && <Note>{err}</Note>}
    </Panel>
  );
}

// ============================================================
// ВИДЖЕТЫ WINDOWS
// ============================================================
export function DesktopWidgets({ ui, g }) {
  const { Panel, Btn } = ui;
  const w = typeof window !== "undefined" ? window.wkWidget : null;
  const [list, setList] = useState([]);
  useEffect(() => { if (w) w.list().then(setList).catch(() => {}); }, [w]);
  if (!w) return null;
  const run = (p) => p.then(setList).catch(() => {});
  return (
    <Panel title="Виджеты Windows" g={g} meta={list.length ? `НА СТОЛЕ: ${list.length}` : "НЕТ"}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn g={g} onClick={() => run(w.open("ring"))}>+ КОЛЬЦО</Btn>
        <Btn g={g} onClick={() => run(w.open("wide"))}>+ ПАНЕЛЬ</Btn>
        {list.length > 0 && <Btn g={g} onClick={() => run(w.closeAll())}>УБРАТЬ ВСЕ</Btn>}
      </div>
      <Note>Виджет стоит на рабочем столе, пока работает программа — даже если её окно закрыто. Перетаскивается
        мышью, двойной щелчок открывает программу, правая кнопка — размер, вид, «поверх окон» и «убрать».
        Ctrl + колесо меняет размер.</Note>
    </Panel>
  );
}

// ============================================================
// УДАЛЁННЫЕ КОМАНДЫ (через облако)
// ============================================================
export function RemotePanel({ ui, g, sessionId, loadCloud, stationId, logKey }) {
  const { Panel, Btn } = ui;
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState("");
  const NAMES = { "gust-reset": "Сброс порыва", reboot: "Перезагрузка", led: "Светодиоды: авто" };
  const run = async (op, args = "") => {
    if (op === "reboot" && !window.confirm("Перезагрузить станцию? Связь пропадёт на полминуты.")) return;
    setBusy(op); setRes("");
    try {
      const mod = await loadCloud();
      const r = await mod.sendCommand({ user, password: pass, keyHex: key.trim(), sessionId, stationId, op, args });
      setRes(`${NAMES[op]}: ${r.ok ? "выполнено" : "отказ"}${r.detail ? ` — ${r.detail}` : ""}`);
      logEvent(logKey, "cmd", `Команда «${NAMES[op]}» через облако: ${r.ok ? "ок" : `отказ (${r.detail})`}`);
    } catch { setRes("Не вышло отправить."); }
    setBusy("");
  };
  const ready = user && pass && /^[0-9a-fA-F]{64}$/.test(key.trim()) && sessionId;
  return (
    <Panel title="Управление через облако" g={g} meta="ПОДПИСАННЫЕ КОМАНДЫ">
      <Field label="Логин оператора" value={user} onChange={setUser} />
      <Field label="Пароль оператора" value={pass} onChange={setPass} type="password" />
      <Field label="Ключ команд (64 hex)" value={key} onChange={setKey} type="password" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.keys(NAMES).map((op) => (
          <Btn key={op} g={g} disabled={!ready || !!busy} onClick={() => run(op, op === "led" ? "auto=true" : "")}>
            {busy === op ? "ЖДУ ОТВЕТА…" : NAMES[op].toUpperCase()}
          </Btn>
        ))}
      </div>
      {res && <Note>{res}</Note>}
      <Note>{sessionId ? "" : "Нонс станции ещё не пришёл — кнопки оживут с первым кадром состояния. "}
        Логин и ключ живут только в этой вкладке и никуда не сохраняются. Станция проверяет подпись сама —
        чужой без ключа не сделает ничего, даже зная пароль брокера.</Note>
    </Panel>
  );
}
