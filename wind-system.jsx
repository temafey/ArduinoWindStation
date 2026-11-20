// Вкладка «Станция» (бывшая «Система»): состояние станции и светодиоды.
//
// Живёт отдельным файлом по той же причине, что wind-switch.jsx: у неё свои стили
// (SYSTEM_CSS вклеивается в общий <style> дашборда) и своя логика жестов.
//
// Светодиоды здесь — четыре «лампы»-карточки:
//   • нажатие — включить / выключить;
//   • свайп влево-вправо — режим (статичный ↔ мигающий);
//   • свайп вверх-вниз — цвет.
// Цвет — это выбор физического светодиода, которым управляет карточка. Цветов
// ровно четыре, по числу светодиодов на плате, и два слота не могут держать один:
// при смене слот меняется цветом с тем, у кого нужный цвет был. Выбор живёт в
// localStorage, на плату не уходит (плата про него не знает и знать не должна).
import { useState, useRef, useEffect } from "react";
import { TEXT, DIM, FAINT, SANS, NUM, glow } from "./ui-kit.js";
import { SwitchGlyph } from "./wind-switch.jsx";
import { Liquid } from "./wind-liquid.jsx";

// ---------- общая стеклянная панель ----------
// Те же переменные --pnl-*, что у Panel в дашборде: тема красит её сама.
function Glass({ title, meta, children, delay = 0, style, bodyStyle, g }) {
  return (
    <section className="pnl" style={{
      border: "1px solid var(--pnl-line)", borderRadius: "var(--pnl-corner)",
      background: "var(--pnl-bg)", boxShadow: "var(--pnl-shadow)",
      backdropFilter: "var(--pnl-blur)", WebkitBackdropFilter: "var(--pnl-blur)",
      animationDelay: `${delay}ms`, ...style,
    }}>
      {title && (
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "10px 14px 9px", borderBottom: "1px solid var(--pnl-head-line)",
        }}>
          <span style={{
            fontFamily: SANS, fontSize: 9.5, letterSpacing: 2.4, textTransform: "uppercase",
            color: DIM, textShadow: glow(g, 0.4),
          }}>{title}</span>
          {meta}
        </header>
      )}
      <div style={{ padding: 14, ...bodyStyle }}>{children}</div>
    </section>
  );
}

// ============================================================
// СОСТОЯНИЕ: батарея, сигнал, связь
// ============================================================
function signalBars(rssi) {
  if (!rssi || rssi < -95) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

export function SystemHero({ data, hasBattery, rssi, ageSec, chargeView, powerView, g }) {
  const pct = hasBattery ? Math.max(0, Math.min(100, data.batteryPercent ?? 0)) : 0;
  const batColor = pct > 60 ? "#4ade80" : pct > 30 ? "#facc15" : "#ff5d5d";
  const charging = hasBattery && data.chargeState === "charging";
  const bars = signalBars(data.wifiRssi);
  const fresh = ageSec != null && ageSec <= 3;
  const stale = ageSec != null && ageSec > 10;

  return (
    <div className="sys-hero">
      {/* ---- Батарея ---- */}
      <Glass g={g} title="Батарея" delay={0}
             meta={hasBattery && data.powerSource
               ? <span className="sys-chip">{powerView[data.powerSource]}</span> : null}>
        <div className="sys-big" style={{ color: hasBattery ? batColor : DIM }}>
          {hasBattery ? pct : "—"}<small>{hasBattery ? "%" : ""}</small>
        </div>
        <Liquid className="sys-bat" style={{ "--bc": batColor }} busy={charging} v={(hasBattery ? pct : 0) / 100}
                color={`linear-gradient(90deg, color-mix(in srgb, ${batColor} 70%, #000), ${batColor})`} edge={batColor} />
        <div className="sys-row">
          <span style={NUM}>{hasBattery ? `${data.battery.toFixed(2)} V` : "нет батареи"}</span>
          {hasBattery && chargeView[data.chargeState] && (
            <span className="sys-chip">{charging ? "⚡ " : ""}{chargeView[data.chargeState]}</span>
          )}
        </div>
      </Glass>

      {/* ---- Сигнал ---- */}
      <Glass g={g} title="Сигнал" delay={60}
             meta={<span className="sys-chip">{rssi.label}</span>}>
        <div className="sys-sig">
          <div className="sys-bars" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <i key={i} className={i < bars ? "on" : ""} style={{ height: 10 + i * 9 }} />)}
          </div>
          <div className="sys-big sys-big-sm">
            {data.wifiRssi || "—"}<small>{data.wifiRssi ? "dBm" : ""}</small>
          </div>
        </div>
        <div className="sys-row" style={{ color: FAINT }}>
          <span>{data.wifiRssi ? "сигнал клиента точки" : "клиентов на точке нет"}</span>
        </div>
      </Glass>

      {/* ---- Связь ---- */}
      <Glass g={g} title="Связь" delay={120}
             meta={data.adcError ? <span className="sys-chip sys-bad">ADC · ошибка</span> : null}>
        <div className="sys-live">
          <i className={"sys-dot" + (fresh ? " ok" : stale ? " bad" : " mid")} />
          <div>
            <div className="sys-big sys-big-sm" style={{ color: TEXT }}>
              {ageSec == null ? "—" : `${ageSec}`}<small>{ageSec == null ? "" : "с назад"}</small>
            </div>
            <div className="sys-row" style={{ color: FAINT, marginTop: 4 }}>
              {ageSec == null ? "кадров ещё не было" : fresh ? "данные идут" : stale ? "данные устарели" : "небольшая пауза"}
            </div>
          </div>
        </div>
      </Glass>
    </div>
  );
}

// ============================================================
// СВЕТОДИОДЫ
// ============================================================
const LEDS = [
  { id: "green",  name: "Зелёный", fn: "Батарея", c: "#4ade80" },
  { id: "yellow", name: "Жёлтый",  fn: "Предупреждение", c: "#facc15" },
  { id: "red",    name: "Красный", fn: "Тревога",  c: "#ff5d5d" },
  { id: "wifi",   name: "Синий",   fn: "WiFi",    c: "#38bdf8" },
];
const BY_ID = Object.fromEntries(LEDS.map((l) => [l.id, l]));
const SLOTS_KEY = "wind_ui_led_slots";
const PREF_KEY = "wind_ui_led_modes";
const SWIPE_PX = 34;

function loadSlots() {
  try {
    const a = JSON.parse(localStorage.getItem(SLOTS_KEY) || "null");
    // Только перестановка четырёх известных цветов; всё прочее — порядок по умолчанию.
    if (Array.isArray(a) && a.length === 4 && new Set(a).size === 4 && a.every((x) => BY_ID[x])) return a;
  } catch { /* битое значение — по умолчанию */ }
  return LEDS.map((l) => l.id);
}
function loadPref() {
  const d = { green: "on", yellow: "on", red: "on", wifi: "on" };
  try {
    const o = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    for (const k of Object.keys(d)) if (o[k] === "blink") d[k] = "blink";
  } catch { /* по умолчанию */ }
  return d;
}
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* нет вибро */ } };

export function LedDeck({ leds, autoMode, onSet, onAutoToggle, g, delay, readOnly, readOnlyNote }) {
  const [slots, setSlots] = useState(loadSlots);
  const [pref, setPref] = useState(loadPref);
  const [drag, setDrag] = useState(null);          // { i, dx, dy }
  const [popDir, setPopDir] = useState({});         // слот → направление смены цвета
  const [flash, setFlash] = useState(false);
  const gest = useRef(null);
  const locked = autoMode || readOnly;

  useEffect(() => { try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch { /* приватный режим */ } }, [slots]);
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* приватный режим */ } }, [pref]);

  const nudge = () => { setFlash(true); setTimeout(() => setFlash(false), 900); buzz(20); };

  const tap = (i) => {
    const id = slots[i];
    const lit = leds[id] === "on" || leds[id] === "blink";
    onSet(id, lit ? "off" : pref[id]);
    buzz(12);
  };
  const swipeMode = (i) => {
    const id = slots[i];
    const next = pref[id] === "blink" ? "on" : "blink";
    setPref((p) => ({ ...p, [id]: next }));
    if (leds[id] === "on" || leds[id] === "blink") onSet(id, next);
    buzz(14);
  };
  const swipeColor = (i, dir) => {          // dir: +1 — вверх, −1 — вниз
    const order = LEDS.map((l) => l.id);
    const cur = slots[i];
    const want = order[(order.indexOf(cur) + dir + order.length) % order.length];
    const j = slots.indexOf(want);
    const next = slots.slice();
    next[i] = want; next[j] = cur;           // тот, у кого был нужный цвет, получает наш
    setSlots(next);
    setPopDir((d) => ({ ...d, [i]: dir, [j]: -dir }));
    buzz(16);
  };

  const down = (e, i) => {
    gest.current = { i, x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* уже отпущен */ }
  };
  const move = (e) => {
    const s = gest.current; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) s.moved = true;
    if (locked) return;
    // Карточка тянется за пальцем по одной оси — той, где ушли дальше.
    const horiz = Math.abs(dx) >= Math.abs(dy);
    const cl = (v) => Math.sign(v) * Math.min(26, Math.abs(v) * 0.45);
    setDrag({ i: s.i, dx: horiz ? cl(dx) : 0, dy: horiz ? 0 : cl(dy) });
  };
  const up = (e) => {
    const s = gest.current; gest.current = null; setDrag(null);
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (locked) { if (!s.moved || Date.now() - s.t < 600) nudge(); return; }
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_PX) {
      if (Math.abs(dx) >= Math.abs(dy)) swipeMode(s.i); else swipeColor(s.i, dy < 0 ? 1 : -1);
    } else if (!s.moved && Date.now() - s.t < 600) {
      tap(s.i);
    }
  };
  const key = (e, i) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); locked ? nudge() : tap(i); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); locked ? nudge() : swipeMode(i); }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); locked ? nudge() : swipeColor(i, e.key === "ArrowUp" ? 1 : -1); }
  };

  return (
    <Glass g={g} title="Светодиоды" delay={delay}
           meta={(
             /* Переключателем работает вся кнопка целиком, поэтому внутри стоит не
                тумблер, а его вид: вложенная кнопка была бы недопустимой разметкой. */
             <button className={"led-auto" + (flash ? " flash" : "")} onClick={onAutoToggle}
                     role="switch" aria-checked={autoMode} disabled={readOnly}
                     style={{ opacity: readOnly ? 0.5 : 1 }}>
               <SwitchGlyph on={autoMode} />
               {autoMode ? "АВТО" : "РУЧНОЙ"}
             </button>
           )}>
      <div className="led-grid">
        {slots.map((id, i) => {
          const led = BY_ID[id];
          const mode = leds[id] ?? "off";
          const lit = mode === "on" || mode === "blink";
          const dragging = drag && drag.i === i;
          const shownMode = lit ? mode : pref[id];
          return (
            <div key={i} role="button" tabIndex={0}
                 aria-label={`${led.name}, ${led.fn}: ${lit ? (mode === "blink" ? "мигает" : "горит") : "выключен"}`}
                 className={["led-card", lit && "lit", mode === "blink" && "blink", locked && "dis", dragging && "drag"]
                   .filter(Boolean).join(" ")}
                 style={{ "--c": led.c, "--dx": `${dragging ? drag.dx : 0}px`, "--dy": `${dragging ? drag.dy : 0}px`,
                          "--pdy": popDir[i] || 0 }}
                 onPointerDown={(e) => down(e, i)} onPointerMove={move} onPointerUp={up}
                 onPointerCancel={() => { gest.current = null; setDrag(null); }}
                 onKeyDown={(e) => key(e, i)}>
              {/* key = цвет: при смене цвета шар создаётся заново и влетает с той
                  стороны, куда провели пальцем */}
              <div className="led-orb" key={id} />
              <div className="led-name">{led.name}</div>
              <div className="led-fn">{led.fn}</div>
              <div className="led-mode">{lit ? (mode === "blink" ? "мигающий" : "статичный") : "выключен"}</div>
              <div className="led-pips" aria-hidden="true">
                <span>‹</span>
                <i className={shownMode === "on" ? "on" : ""} />
                <i className={shownMode === "blink" ? "on" : ""} />
                <span>›</span>
              </div>
              <div className="led-dots" aria-hidden="true">
                {LEDS.map((l) => <i key={l.id} className={l.id === id ? "on" : ""} style={{ "--dc": l.c }} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="led-help">
        {readOnly
          ? (readOnlyNote || "Только чтение.")
          : autoMode
            ? "Сейчас светодиодами управляет авто-режим. Переключите на «Ручной», чтобы управлять самим."
            : "Нажатие — вкл/выкл · свайп ← → — режим (статичный / мигающий) · свайп ↑ ↓ — цвет"}
      </div>
    </Glass>
  );
}

// ============================================================
// СТИЛИ
// ============================================================
export const SYSTEM_CSS = `
.sys-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px }
.sys-big { font-family: var(--ui-mono); font-variant-numeric: tabular-nums; font-size: 46px; font-weight: 700; line-height: 1;
  letter-spacing: -1px; text-shadow: 0 0 18px currentColor }
.sys-big small { font-size: 15px; font-weight: 500; letter-spacing: 1px; margin-left: 5px; opacity: .6; text-shadow: none }
.sys-big-sm { font-size: 38px }
.sys-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px;
  font-family: var(--ui-mono); font-size: 11px; color: rgba(var(--ink, 231,238,246),0.75) }
.sys-chip { font-family: var(--ui-mono); font-size: 9.5px; letter-spacing: .8px; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  border: 1px solid rgba(var(--ink, 231,238,246),0.25); background: rgba(var(--rule, 255,255,255),0.07); color: rgba(var(--ink, 231,238,246),0.85) }
.sys-bad { color: #ff7b7b; border-color: rgba(255,123,123,0.5); background: rgba(255,90,90,0.12) }

.sys-bat { position: relative; height: 14px; margin-top: 14px; border-radius: 999px; overflow: hidden;
  background: rgba(var(--rule, 255,255,255),0.09); box-shadow: inset 0 1px 3px rgba(0,0,0,0.5) }

.sys-sig { display: flex; align-items: flex-end; gap: 16px }
.sys-bars { display: flex; align-items: flex-end; gap: 5px; height: 46px }
.sys-bars i { width: 11px; border-radius: 4px; background: rgba(var(--rule, 255,255,255),0.14); transition: background .54s, box-shadow .54s }
.sys-bars i.on { background: linear-gradient(180deg, #a5f3fc, #38bdf8); box-shadow: 0 0 12px rgba(56,189,248,0.7) }

.sys-live { display: flex; align-items: center; gap: 16px }
.sys-dot { width: 22px; height: 22px; border-radius: 50%; flex: none; position: relative }
.sys-dot.ok { background: #4ade80; box-shadow: 0 0 18px #4ade80 }
.sys-dot.mid { background: #facc15; box-shadow: 0 0 16px #facc15 }
.sys-dot.bad { background: #ff5d5d; box-shadow: 0 0 16px #ff5d5d }
.sys-dot.ok::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid #4ade80;
  animation: sysPing 1.6s ease-out infinite }
@keyframes sysPing { from { transform: scale(1); opacity: .9 } to { transform: scale(2.4); opacity: 0 } }

.led-auto { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-family: var(--ui-sans); font-size: 10px;
  letter-spacing: 1.5px; padding: 5px 12px 5px 8px; border-radius: 999px; color: rgb(var(--ink, 231,238,246));
  border: 1px solid rgba(var(--ink, 231,238,246),0.3); background: rgba(var(--rule, 255,255,255),0.07) }
.led-auto.flash { animation: ledFlash 1.22s ease }
@keyframes ledFlash { 0%,100% { box-shadow: none } 25%,75% { box-shadow: 0 0 0 4px rgba(255,154,60,0.7), 0 0 22px rgba(255,154,60,0.6) } }

.led-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px }
@media (max-width: 760px) { .led-grid { grid-template-columns: repeat(2, 1fr) } }
.led-card { position: relative; min-height: 210px; padding: 16px 12px 14px; border-radius: 30px; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  cursor: pointer; user-select: none; -webkit-user-select: none; touch-action: none; -webkit-tap-highlight-color: transparent;
  border: 1px solid rgba(255,255,255,0.16);
  background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03));
  box-shadow: inset 0 1px .5px rgba(255,255,255,0.35), 0 14px 30px -18px rgba(0,0,0,0.7);
  transform: translate(var(--dx, 0px), var(--dy, 0px));
  transition: transform .68s var(--ease-spring), box-shadow .61s ease, background .61s ease, border-color .61s ease, opacity .41s }
.led-card.drag { transition: box-shadow .61s ease, background .61s ease }
.led-card:focus-visible { outline: 2px solid rgba(var(--ink, 231,238,246),0.7); outline-offset: 3px }
.led-card:active:not(.drag) { transform: scale(.97) }
.led-card.dis { opacity: .6 }
.led-card.lit { border-color: color-mix(in srgb, var(--c) 55%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 24%, transparent), rgba(255,255,255,0.04));
  box-shadow: inset 0 1px .5px rgba(255,255,255,0.4), 0 0 44px -8px color-mix(in srgb, var(--c) 65%, transparent), 0 14px 30px -18px rgba(0,0,0,0.7) }

.led-orb { width: 78px; height: 78px; border-radius: 50%; margin-bottom: 8px; pointer-events: none;
  animation: ledPop .81s var(--ease-back) both;
  background: radial-gradient(circle at 35% 28%, rgba(255,255,255,0.32), rgba(255,255,255,0.04) 55%, transparent 72%),
              color-mix(in srgb, var(--c) 16%, #1b2232);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 -10px 16px rgba(0,0,0,0.35);
  transition: background .61s ease, box-shadow .61s ease }
.led-card.lit .led-orb {
  background: radial-gradient(circle at 35% 28%, #fff 0%, color-mix(in srgb, var(--c) 80%, #fff) 26%, var(--c) 62%, color-mix(in srgb, var(--c) 55%, #000) 100%);
  box-shadow: 0 0 28px 4px color-mix(in srgb, var(--c) 75%, transparent), 0 0 80px 12px color-mix(in srgb, var(--c) 40%, transparent),
              inset 0 -10px 16px rgba(0,0,0,0.25) }
.led-card.blink .led-orb { animation: ledPop .81s var(--ease-back) both, ledPulse 1s ease-in-out .6s infinite }
@keyframes ledPulse { 0%,100% { filter: brightness(1) } 50% { filter: brightness(.3) saturate(.6) } }
@keyframes ledPop {
  from { opacity: 0; transform: translateY(calc(var(--pdy, 0) * 40px)) scale(.5) }
  60% { opacity: 1; transform: translateY(calc(var(--pdy, 0) * -5px)) scale(1.1) }
  to { opacity: 1; transform: none }
}
.led-name { font-family: var(--ui-sans); font-size: 13px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; color: rgb(var(--ink, 231,238,246));
  text-shadow: 0 0 12px color-mix(in srgb, var(--c) 60%, transparent) }
.led-fn { font-family: var(--ui-sans); font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(var(--ink, 231,238,246),0.5) }
.led-mode { font-family: var(--ui-mono); font-size: 10.5px; margin-top: 6px; color: rgba(var(--ink, 231,238,246),0.8) }
.led-card:not(.lit) .led-mode { color: rgba(var(--ink, 231,238,246),0.4) }
.led-pips { display: flex; align-items: center; gap: 7px; margin-top: 8px; color: rgba(var(--ink, 231,238,246),0.35); font-size: 15px; line-height: 1 }
.led-pips i { width: 7px; height: 7px; border-radius: 50%; background: rgba(var(--rule, 255,255,255),0.2); transition: all .47s var(--ease-spring) }
.led-pips i.on { width: 18px; border-radius: 999px; background: var(--c); box-shadow: 0 0 10px var(--c) }
.led-dots { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px }
.led-dots i { width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--dc) 45%, rgba(255,255,255,0.1)); opacity: .55;
  transition: all .47s var(--ease-spring) }
.led-dots i.on { height: 16px; border-radius: 999px; opacity: 1; background: var(--dc); box-shadow: 0 0 10px var(--dc) }
.led-help { margin-top: 14px; font-family: var(--ui-sans); font-size: 10.5px; line-height: 1.55; color: rgba(var(--ink, 231,238,246),0.5) }
.mo-off .led-orb, .mo-off .led-card.blink .led-orb, .mo-off .sys-dot::after, .mo-off .led-auto.flash { animation: none }
`;
