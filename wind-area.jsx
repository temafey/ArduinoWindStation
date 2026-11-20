// Вкладка «Район»: что происходит вокруг прямо сейчас — и компас ветра.
//
// Данные берёт тот же useDistrict (wind-district.jsx), что и режим «район», но
// вкладка не зависит от выбранного источника: место определяется по запросу, а
// погода, прогноз и воздух грузятся, пока вкладка открыта.
//
// Компас ветра: стрелка ветра рисуется в мировых координатах, а картушка
// поворачивается за телефоном. Как ни держи устройство, стрелка показывает
// настоящее направление ветра: повернулся лицом к точке «откуда» — ветер в лицо.
import { memo, useState, useEffect, useRef, useMemo, useId } from "react";
import { TEXT, DIM, SANS, glow } from "./ui-kit.js";
import { weatherText, aqiLevel } from "./wind-district.jsx";
import { Liquid } from "./wind-liquid.jsx";
import { Segments } from "./wind-switch.jsx";

const ARR8 = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const FROM_WORDS = ["северного", "северо-восточного", "восточного", "юго-восточного", "южного", "юго-западного", "западного", "северо-западного"];
const rumb = (deg) => ARR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const fromWord = (deg) => FROM_WORDS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// fill — тело растягивается на всю высоту окна (окно тянет сетка до соседа),
// и лишнее место забирает тот, у кого flex: 1.
function Glass({ title, meta, children, delay = 0, style, g, fill }) {
  return (
    <section className="pnl" style={{
      ...(fill ? { display: "flex", flexDirection: "column" } : null),
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
          <span style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: 2.4, textTransform: "uppercase",
                         color: DIM, textShadow: glow(g, 0.4) }}>{title}</span>
          {meta}
        </header>
      )}
      <div style={fill ? { padding: 14, flex: 1, display: "flex", flexDirection: "column" } : { padding: 14 }}>{children}</div>
    </section>
  );
}

// ============================================================
// КОМПАС
// ============================================================
// Азимут, куда смотрит верх телефона (0° = север, по часовой). Источники:
//   • приложение Android — родной датчик (WKNative.startCompass → __wkHeading);
//   • iOS — webkitCompassHeading;
//   • остальное — deviceorientationabsolute (Chrome/WebView), формула с учётом наклона.
function tiltHeading(alpha, beta, gamma) {
  const r = Math.PI / 180;
  // Лёжа (наклон меньше ~45°) формула ниже не определена — там верх телефона
  // смотрит туда, куда указывает 360° − alpha.
  if (Math.abs(Math.cos(beta * r) * Math.cos(gamma * r)) >= 0.7) return (360 - alpha + 360) % 360;
  const x = beta * r, y = gamma * r, z = alpha * r;
  const cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;
  let h = Math.atan(vx / vy);
  if (vy < 0) h += Math.PI; else if (vx < 0) h += 2 * Math.PI;
  return (h * 180) / Math.PI;
}
const diff = (a, b) => ((a - b + 540) % 360) - 180;       // кратчайшая разница углов

function useHeading(enabled) {
  const [heading, setHeading] = useState(null);
  const [cont, setCont] = useState(0);                      // непрерывный угол: без скачка 359° → 1°
  const [state, setState] = useState("off");              // off | wait | ok | none | denied
  const last = useRef(null);
  const contRef = useRef(0);

  useEffect(() => {
    if (!enabled) { setState("off"); return undefined; }
    setState("wait");
    let gotAny = false;
    const feed = (raw) => {
      gotAny = true;
      // Сглаживание по кругу: стрелка не дрожит, но успевает за поворотом.
      const prev = last.current;
      const v = prev == null ? raw : (prev + diff(raw, prev) * 0.28 + 360) % 360;
      contRef.current += prev == null ? v : diff(v, prev);
      last.current = v;
      setHeading(v);
      setCont(contRef.current);
      setState("ok");
    };
    const cleanups = [];

    if (typeof window !== "undefined" && window.WKNative && window.WKNative.startCompass) {
      window.__wkHeading = feed;
      window.WKNative.startCompass();
      cleanups.push(() => { try { window.WKNative.stopCompass(); } catch { /* уже закрыто */ } window.__wkHeading = null; });
    } else {
      const onAbs = (e) => { if (e.alpha != null) feed(e.webkitCompassHeading != null ? e.webkitCompassHeading : tiltHeading(e.alpha, e.beta ?? 0, e.gamma ?? 0)); };
      const onRel = (e) => {
        if (e.webkitCompassHeading != null) feed(e.webkitCompassHeading);
        else if (e.absolute && e.alpha != null) feed(tiltHeading(e.alpha, e.beta ?? 0, e.gamma ?? 0));
      };
      const start = () => {
        window.addEventListener("deviceorientationabsolute", onAbs, true);
        window.addEventListener("deviceorientation", onRel, true);
      };
      cleanups.push(() => {
        window.removeEventListener("deviceorientationabsolute", onAbs, true);
        window.removeEventListener("deviceorientation", onRel, true);
      });
      const DOE = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null;
      if (DOE && typeof DOE.requestPermission === "function") {        // iOS: разрешение по нажатию
        DOE.requestPermission().then((r) => { if (r === "granted") start(); else setState("denied"); }).catch(() => setState("denied"));
      } else {
        start();
      }
    }
    // Датчика нет (компьютер, планшет без магнитометра): за две секунды ни одного отсчёта.
    const t = setTimeout(() => { if (!gotAny) setState("none"); }, 2500);
    return () => { clearTimeout(t); cleanups.forEach((f) => f()); last.current = null; };
  }, [enabled]);

  return { heading, cont, state };
}

export function WindCompass({ windFrom, speed, gust, source, accent, g }) {
  const [on, setOn] = useState(false);
  const { heading, cont, state } = useHeading(on);
  const live = state === "ok" && heading != null;
  const h = live ? heading : 0;                  // для подписей, 0…360
  const hc = live ? cont : 0;                    // для поворота, без скачков
  const hasWind = Number.isFinite(windFrom);
  const arrowAng = hasWind ? windFrom - hc : 0;           // стрелка «откуда» в координатах экрана
  const facing = hasWind && state === "ok" && Math.abs(diff(windFrom, h)) < 12;

  const ticks = useMemo(() => Array.from({ length: 36 }, (_, i) => i * 10), []);
  const R = 118;
  const pt = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [130 + r * Math.cos(a), 130 + r * Math.sin(a)]; };

  return (
    <Glass g={g} title="Компас ветра" delay={120}
           meta={<span className="ar-chip">{source}</span>}>
      <div className="ar-compass-wrap">
        <svg viewBox="0 0 260 260" className="ar-compass" aria-label="Компас ветра">
          <defs>
            <radialGradient id="arGlass" cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </radialGradient>
          </defs>
          <circle cx="130" cy="130" r="126" fill="url(#arGlass)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
          {/* Картушка: поворачивается против хода телефона, и север остаётся севером */}
          <g className="ar-rose" style={{ transform: `rotate(${-hc}deg)`, transformOrigin: "130px 130px" }}>
            {ticks.map((d) => {
              const long = d % 90 === 0, mid = d % 30 === 0;
              const [x1, y1] = pt(d, R - (long ? 14 : mid ? 9 : 5)), [x2, y2] = pt(d, R);
              return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2}
                           stroke={d === 0 ? "#ff6b6b" : "rgba(var(--ink, 231,238,246),0.6)"} strokeWidth={long ? 2.2 : mid ? 1.4 : 0.8} />;
            })}
            {[["С", 0], ["В", 90], ["Ю", 180], ["З", 270]].map(([l, d]) => {
              const [x, y] = pt(d, R - 28);
              return <text key={l} x={x} y={y + 5} textAnchor="middle" fontSize="16" fontWeight="700" fontFamily={SANS}
                           fill={l === "С" ? "#ff6b6b" : "rgba(var(--ink, 231,238,246),0.85)"}
                           transform={`rotate(${h} ${x} ${y})`}>{l}</text>;
            })}
          </g>
          {/* Ветер: в координатах экрана, уже со всеми поправками */}
          {hasWind && (
            <g className="ar-wind" style={{ transform: `rotate(${arrowAng}deg)`, transformOrigin: "130px 130px" }}>
              {/* линия потока: от точки «откуда» через центр на другую сторону */}
              <line x1="130" y1="30" x2="130" y2="212" stroke={accent} strokeWidth="3" strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${accent})` }} opacity="0.9" />
              <path d="M130 226 L118 202 L130 208 L142 202 Z" fill={accent} style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
              {/* точка «откуда» */}
              <circle cx="130" cy="26" r="11" fill={accent} style={{ filter: `drop-shadow(0 0 10px ${accent})` }} />
              <circle cx="130" cy="26" r="4" fill="#04070a" />
            </g>
          )}
          <circle cx="130" cy="130" r="30" fill="rgba(4,7,10,0.55)" stroke="rgba(255,255,255,0.2)" />
          <text x="130" y="128" textAnchor="middle" fontSize="20" fontWeight="700" fill={TEXT} fontFamily="var(--ui-mono)">
            {hasWind ? (Number.isFinite(speed) ? speed.toFixed(1) : "—") : "—"}
          </text>
          <text x="130" y="144" textAnchor="middle" fontSize="9" fill={DIM} fontFamily={SANS} letterSpacing="1">М/С</text>
          {/* Куда смотрит телефон — неподвижная метка сверху */}
          <path d="M130 -2 L121 14 L139 14 Z" fill="#fff" transform="translate(0 2)" style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.8))" }} />
        </svg>
        {facing && <div className="ar-face">лицом к ветру</div>}
      </div>

      <div className="ar-wind-line">
        {hasWind
          ? <>Ветер {fromWord(windFrom)} направления: <b>{Math.round(windFrom)}° · {rumb(windFrom)}</b>
              {Number.isFinite(gust) && gust > (speed || 0) + 0.5 ? <> · порывы до <b>{gust.toFixed(1)}</b> м/с</> : null}</>
          : "Направление ветра пока неизвестно."}
      </div>

      <div className="ar-compass-ctl">
        <button className={"ar-btn" + (on ? " on" : "")} onClick={() => setOn((v) => !v)}>
          {on ? "Выключить компас" : "Включить компас"}
        </button>
        <span className="ar-note">
          {state === "off" && "Включите: стрелка будет следить за ветром, как бы ни был повёрнут телефон."}
          {state === "wait" && "Ищу датчик направления…"}
          {state === "ok" && `Телефон смотрит на ${Math.round(h)}° (${rumb(h)}). Повернитесь лицом к точке ● — ветер будет в лицо.`}
          {state === "none" && "На этом устройстве нет датчика компаса — картушка стоит неподвижно, север вверху."}
          {state === "denied" && "Доступ к датчикам закрыт. Разрешите его в настройках браузера."}
        </span>
      </div>
    </Glass>
  );
}

// ============================================================
// ЧТО ПРОИСХОДИТ
// ============================================================
function weatherEmoji(code, isDay = 1) {
  if (code === 0) return isDay ? "☀️" : "🌙";
  if (code <= 2) return isDay ? "🌤️" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "·";
}

// Ближайшие осадки по 15-минутным шагам на два часа вперёд.
function nowcast(w) {
  const m = w?.minutely_15;
  if (!m || !m.time) return null;
  const now = Date.now();
  const steps = m.time.map((t, i) => ({ at: new Date(t).getTime(), mm: m.precipitation[i] || 0 })).filter((s) => s.at + 15 * 60000 > now);
  if (!steps.length) return null;
  const wet = (s) => s.mm >= 0.1;
  const rainingNow = wet(steps[0]);
  const first = steps.find((s) => (rainingNow ? !wet(s) : wet(s)));
  const mins = first ? Math.max(0, Math.round((first.at - now) / 60000)) : null;
  if (rainingNow) return mins == null ? "Осадки идут и в ближайшие 2 часа не закончатся." : `Осадки идут, прекратятся примерно через ${mins} мин.`;
  return mins == null ? "В ближайшие 2 часа осадков не ожидается." : `Осадки начнутся примерно через ${mins} мин.`;
}

// Тревожные признаки — по порогам, а не по «официальному предупреждению»: открытого
// источника предупреждений для Украины нет, и выдавать их за официальные нельзя.
function signs(c, a) {
  const out = [];
  if (!c) return out;
  if (c.wind_gusts_10m >= 20) out.push({ lvl: "bad", t: `Очень сильные порывы ветра до ${c.wind_gusts_10m.toFixed(0)} м/с` });
  else if (c.wind_gusts_10m >= 15) out.push({ lvl: "warn", t: `Сильные порывы до ${c.wind_gusts_10m.toFixed(0)} м/с — шквальный ветер` });
  else if (c.wind_speed_10m >= 10) out.push({ lvl: "warn", t: `Сильный ветер ${c.wind_speed_10m.toFixed(1)} м/с` });
  if (c.weather_code >= 95) out.push({ lvl: "bad", t: weatherText(c.weather_code) });
  else if (c.weather_code === 65 || c.weather_code === 82 || c.weather_code === 75) out.push({ lvl: "warn", t: weatherText(c.weather_code) });
  if (c.precipitation >= 4) out.push({ lvl: "warn", t: `Сильные осадки: ${c.precipitation} мм/ч` });
  if (c.visibility != null && c.visibility < 1000) out.push({ lvl: "warn", t: `Плохая видимость: ${(c.visibility / 1000).toFixed(1)} км` });
  if (c.temperature_2m <= -15) out.push({ lvl: "warn", t: `Сильный мороз: ${c.temperature_2m.toFixed(0)} °C` });
  if (c.temperature_2m >= 33) out.push({ lvl: "warn", t: `Сильная жара: ${c.temperature_2m.toFixed(0)} °C` });
  if (c.uv_index >= 8) out.push({ lvl: "warn", t: `Очень высокий УФ-индекс: ${c.uv_index.toFixed(0)}` });
  if (a && a.european_aqi >= 80) out.push({ lvl: "warn", t: `Плохой воздух: индекс ${a.european_aqi}` });
  return out;
}

// ============================================================
// РЕЖИМ «ДАННЫЕ РАЙОНА» во вкладке «Метео данные»
// ============================================================
// Переключатель «Станция / Район» стоит наверху вкладки. Включён район — вместо
// приборов станции показываются только данные района: скорость ветра и компас
// рядом, погода сейчас, что дальше, тревожные признаки, воздух. Выключен — обычные
// приборы. Место выбирается во вкладке «Район».
const BFT = [
  [0.3, "штиль"], [1.6, "тихий ветер"], [3.4, "лёгкий ветер"], [5.5, "слабый ветер"], [8.0, "умеренный ветер"],
  [10.8, "свежий ветер"], [13.9, "сильный ветер"], [17.2, "крепкий ветер"], [20.8, "очень крепкий ветер"],
  [24.5, "шторм"], [28.5, "сильный шторм"], [32.7, "жестокий шторм"], [Infinity, "ураган"],
];
function beaufort(v) {
  const i = BFT.findIndex(([max]) => v < max);
  return { n: i, word: BFT[i][1] };
}
const windColor = (v) => (v < 1.6 ? "#7dd3fc" : v < 5.5 ? "#4ade80" : v < 10.8 ? "#facc15" : v < 17.2 ? "#fb923c" : "#ff5d5d");

const SOURCE_OPTS = [{ value: false, label: "Станция" }, { value: true, label: "Район" }];

export function SourceSwitch({ on, setOn, coords, place, status, g }) {
  return (
    <div className="ar-switch">
      <Segments variant="big" ariaLabel="Источник данных" value={on} onChange={setOn}
                options={SOURCE_OPTS} />
      <div className="ar-switch-note">
        {on
          ? (coords ? <>Показаны данные района: <b>{place || coords.name || "ваше место"}</b></> : "Район включён, но место не выбрано")
          : status}
      </div>
    </div>
  );
}

// Тот же блок показывает и станцию: подпись, предел шкалы и единицы приходят
// пропсами, а сам вид остаётся один. speed/gust — всегда м/с; в выбранных
// единицах дашборд присылает уже готовые строки (shown/gustShown/unit).
// Полосы снизу — прогноз района на 12 часов или, у станции, её собственный
// ветер за последние минуты: forecast — [{ wind, gust, t? }], t — подсказка
// столбика, legend — подпись под ними.
export function AreaWind({ speed, gust, forecast = [], g, chip = "РАЙОН · МОДЕЛЬ", scaleMax = 25, shown, gustShown, unit = "м/с", kmh = true,
                           legend = "ветер на ближайшие 12 часов (яркий — скорость, бледный — порывы)", style }) {
  const v = Number.isFinite(speed) ? speed : 0;
  const col = windColor(v);
  const bf = beaufort(v);
  const C = 2 * Math.PI * 54;
  const frac = Math.max(0.02, Math.min(1, v / scaleMax));
  const max = Math.max(10, ...forecast.map((x) => x.gust ?? x.wind));
  const mid = `arLiq${useId().replace(/:/g, "")}`;
  return (
    <Glass g={g} title="Скорость ветра" delay={40} meta={<span className="ar-chip">{chip}</span>} style={style} fill>
      <div className="ar-gauge">
        <svg viewBox="0 0 140 140" aria-label="Скорость ветра">
          <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(var(--rule, 255,255,255),0.1)" strokeWidth="9" />
          <circle className="ar-ring" cx="70" cy="70" r="54" fill="none" stroke={col} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 70 70)"
                  style={{ filter: `drop-shadow(0 0 8px ${col})`, transition: "stroke-dasharray 1.22s var(--ease-spring), stroke .68s" }} />
          {/* Жидкость в кольце: по залитой дуге бегут пузырьки и блик.
              Маска — та же дуга, поэтому пузырьки не выходят за заливку. */}
          <mask id={mid}>
            <circle className="ar-ring" cx="70" cy="70" r="54" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 70 70)"
                    style={{ transition: "stroke-dasharray 1.22s var(--ease-spring)" }} />
          </mask>
          {/* pathLength="360": узор пузырьков укладывается в окружность целым
              числом периодов. Без этого в одной точке узор обрывался на
              полуслове, и вращение возило этот шов по кольцу. */}
          <g mask={`url(#${mid})`} style={{ pointerEvents: "none" }}>
            <g className="liq-ring">
              <circle cx="70" cy="70" r="56" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.2"
                      strokeLinecap="round" pathLength="360" strokeDasharray="0.1 11.9 0.1 23.9" />
              <circle cx="70" cy="70" r="51.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6"
                      strokeLinecap="round" pathLength="360" strokeDasharray="0.1 19.9 0.1 9.9" />
            </g>
            <circle cx="70" cy="70" r="57" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
          </g>
        </svg>
        <div className="ar-gauge-in">
          <b style={{ color: col }}>{shown ?? v.toFixed(1)}</b>
          <span>{unit}</span>
        </div>
      </div>
      <div className="ar-bft"><b>{bf.n}</b> балл · {bf.word}</div>
      <div className="ar-facts" style={{ marginTop: 12 }}>
        <div><span>Порывы</span><b>{gustShown ?? (Number.isFinite(gust) ? gust.toFixed(1) : "—")} {unit}</b></div>
        {kmh && <div><span>Скорость</span><b>{(v * 3.6).toFixed(0)} км/ч</b></div>}
      </div>
      {forecast.length > 0 && (
        <>
          <div className="ar-bars" aria-hidden="true">
            {forecast.map((x, i) => (
              <div key={i} className="ar-bar" title={x.t ?? `${String(x.h).padStart(2, "0")}:00 · ${x.wind.toFixed(1)} м/с`}>
                <i className="gu" style={{ height: `${Math.max(4, ((x.gust ?? x.wind) / max) * 100)}%` }} />
                <Liquid dir="y" className="sp" v={Math.max(0.03, x.wind / max)} color={windColor(x.wind)} />
              </div>
            ))}
          </div>
          <div className="ar-legend">{legend}</div>
        </>
      )}
    </Glass>
  );
}

function AreaModeView({ g, accent, district, onGoArea }) {
  const { coords, weather, air, sensors, place, loadedAt, error } = district;
  const c = weather?.current;
  const a = air?.current;
  const lvl = aqiLevel(a?.european_aqi);

  if (!coords) {
    return (
      <Glass g={g} title="Район" delay={40}>
        <div className="ar-where">
          <div className="ar-sub" style={{ margin: 0, maxWidth: 460, lineHeight: 1.7 }}>
            Данные района включены, но место не выбрано. Определите его во вкладке «Район» —
            и здесь появятся скорость и направление ветра, погода, осадки, прогноз и воздух.
          </div>
          <button className="ar-btn big" onClick={onGoArea}>Выбрать место</button>
        </div>
      </Glass>
    );
  }

  const hourly = weather?.hourly;
  const strip = hourly ? hourly.time.map((t, i) => ({
    h: new Date(t).getHours(), temp: hourly.temperature_2m[i], pop: hourly.precipitation_probability?.[i],
    code: hourly.weather_code[i], wind: hourly.wind_speed_10m[i], gust: hourly.wind_gusts_10m?.[i],
  })).filter((x, i) => new Date(hourly.time[i]).getTime() > Date.now() - 3600000).slice(0, 12) : [];

  const nc = nowcast(weather);
  const alerts = signs(c, a);
  const ageMin = loadedAt ? Math.max(0, Math.round((Date.now() - loadedAt.getTime()) / 60000)) : null;

  return (
    <div className="ar-mode">
      <Glass g={g} title="Мой район" delay={0}
             meta={ageMin != null ? <span className="ar-chip">данные {ageMin === 0 ? "только что" : `${ageMin} мин назад`}</span> : null}>
        <div className="ar-where">
          <div>
            <div className="ar-place">{place || coords.name || "Ваше место"}</div>
            <div className="ar-sub">{coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}</div>
          </div>
          <button className="ar-btn" onClick={onGoArea}>Изменить место</button>
        </div>
        {error && <div className="ar-err">{error}</div>}
      </Glass>

      {!c && !error && <div className="ar-sub" style={{ padding: "0 4px" }}>Загружаю данные района…</div>}

      {c && (
        <>
          {/* Скорость и направление ветра — отдельные карточки рядом */}
          <div className="ar-pair">
            {/* Высотой с компас рядом: лишнее место забирают полосы прогноза
                (.ar-bars — flex: 1), так что ни зазора под окном, ни пустоты в нём. */}
            <AreaWind speed={c.wind_speed_10m} gust={c.wind_gusts_10m} forecast={strip} g={g} />
            <WindCompass windFrom={c.wind_direction_10m} speed={c.wind_speed_10m} gust={c.wind_gusts_10m}
                         source="РАЙОН · МОДЕЛЬ" accent={accent} g={g} />
          </div>

          <div className="ar-pair">
            <Glass g={g} title="Сейчас" delay={80}
                   meta={<span className="ar-chip">{weatherText(c.weather_code)}</span>}>
              <div className="ar-now">
                <div className="ar-emoji">{weatherEmoji(c.weather_code, c.is_day)}</div>
                <div>
                  <div className="ar-temp">{Math.round(c.temperature_2m)}<small>°C</small></div>
                  <div className="ar-sub">ощущается как {Math.round(c.apparent_temperature)}°</div>
                </div>
              </div>
              <div className="ar-facts">
                <div><span>Влажность</span><b>{Math.round(c.relative_humidity_2m)} %</b></div>
                <div><span>Давление</span><b>{Math.round(c.pressure_msl)} гПа</b></div>
                <div><span>Облачность</span><b>{c.cloud_cover} %</b></div>
                <div><span>Видимость</span><b>{c.visibility != null ? `${(c.visibility / 1000).toFixed(1)} км` : "—"}</b></div>
                <div><span>Точка росы</span><b>{c.dew_point_2m != null ? `${c.dew_point_2m.toFixed(1)} °C` : "—"}</b></div>
                <div><span>УФ-индекс</span><b>{c.uv_index != null ? c.uv_index.toFixed(1) : "—"}</b></div>
              </div>
            </Glass>

            <Glass g={g} title="Что дальше" delay={100}>
              {nc && <div className="ar-nowcast">{nc}</div>}
              <div className="ar-strip">
                {strip.map((x, i) => (
                  <div key={i} className="ar-hour">
                    <span className="ar-h">{String(x.h).padStart(2, "0")}</span>
                    <span className="ar-e">{weatherEmoji(x.code, x.h >= 6 && x.h < 21 ? 1 : 0)}</span>
                    <b>{Math.round(x.temp)}°</b>
                    <span className="ar-p">{x.pop != null ? `${x.pop}%` : ""}</span>
                    <span className="ar-w">{x.wind.toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="ar-legend">час · погода · °C · вероятность осадков · ветер м/с</div>
            </Glass>
          </div>

          <div className="ar-pair">
            <Glass g={g} title="Тревожные признаки" delay={120}
                   meta={<span className="ar-chip">по порогам, не официально</span>}>
              {alerts.length === 0
                ? <div className="ar-ok">✓ Ничего опасного: ветер, осадки и воздух в норме.</div>
                : alerts.map((x, i) => <div key={i} className={"ar-alert " + x.lvl}>{x.lvl === "bad" ? "⚠" : "•"} {x.t}</div>)}
              <div className="ar-legend" style={{ marginTop: 10 }}>
                Это оценка по данным модели. Официальные предупреждения — у Укргидрометцентра и в приложениях тревог.
              </div>
            </Glass>

            {a && (
              <Glass g={g} title="Воздух" delay={140}
                     meta={<span className="ar-chip" style={{ color: lvl.color }}>{a.european_aqi ?? "—"} · {lvl.label}</span>}>
                <div className="ar-facts">
                  <div><span>PM2.5</span><b>{a.pm2_5 ?? "—"} мкг/м³</b></div>
                  <div><span>PM10</span><b>{a.pm10 ?? "—"} мкг/м³</b></div>
                  <div><span>NO₂</span><b>{a.nitrogen_dioxide ?? "—"} мкг/м³</b></div>
                  <div><span>Озон</span><b>{a.ozone ?? "—"} мкг/м³</b></div>
                </div>
                {sensors && sensors.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="ar-legend" style={{ marginBottom: 6 }}>Народные датчики рядом (SaveEcoBot)</div>
                    {sensors.map((s) => (
                      <div key={s.id} className="ar-sens">
                        <span>{s.d < 1 ? `${Math.round(s.d * 1000)} м` : `${s.d.toFixed(1)} км`}</span>
                        <em>{s.name}</em>
                        <b>PM2.5 {s.pm25 ?? "—"}</b>
                      </div>
                    ))}
                  </div>
                )}
              </Glass>
            )}
          </div>
        </>
      )}
      <div className="ar-legend" style={{ padding: "0 4px" }}>
        Погода — Open-Meteo (модель ICON/ECMWF, шаг около километра), воздух — Open-Meteo и SaveEcoBot.
      </div>
    </div>
  );
}

// ============================================================
// ВКЛАДКА «РАЙОН» — только выбор места и справка о нём
// ============================================================
const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

function AreaTabView({ g, district, onGoWeather }) {
  const { coords, setCoords, locate, locating, weather, sensors, error, place, loadedAt, searchPlace } = district;
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null);            // null | "search" | "manual"
  const [draft, setDraft] = useState({ lat: "", lon: "" });

  const find = async () => {
    setBusy(true);
    try { setResults(await searchPlace(q)); } catch { setResults([]); }
    setBusy(false);
  };
  const pick = (r) => {
    setCoords({ lat: r.lat, lon: r.lon, name: [r.name, r.admin].filter(Boolean).join(", "), src: "search" });
    setResults(null); setMode(null); setQ("");
  };
  const manual = () => {
    const lat = parseFloat(String(draft.lat).replace(",", ".")), lon = parseFloat(String(draft.lon).replace(",", "."));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      setCoords({ lat, lon, src: "manual" });
      setMode(null);
    }
  };
  const srcNote = { gps: "по GPS / сети телефона", ip: "приблизительно, по IP", search: "выбрано по названию", manual: "введено вручную" }[coords?.src] || "";
  const ageMin = loadedAt ? Math.max(0, Math.round((Date.now() - loadedAt.getTime()) / 60000)) : null;
  const daily = weather?.daily;

  return (
    <div className="ar-grid">
      {/* ---- Подключение ---- */}
      <Glass g={g} title="Подключение" delay={0} style={{ gridColumn: "1 / -1" }}
             meta={<span className="ar-chip">{coords ? "место выбрано" : "место не выбрано"}</span>}>
        <div className="ar-where">
          <div>
            <div className="ar-place">{coords ? (place || coords.name || "Ваше место") : "Где вы находитесь?"}</div>
            <div className="ar-sub">
              {coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}${srcNote ? " · " + srcNote : ""}` :
                "Определите место по запросу или задайте его сами. Оно хранится только на этом устройстве."}
            </div>
          </div>
          <div className="ar-actions">
            <button className="ar-btn big" onClick={locate} disabled={locating}>
              {locating ? "Определяю…" : coords ? "Определить заново" : "Определить, где я"}
            </button>
          </div>
        </div>
        {error && <div className="ar-err">{error}</div>}
        {coords && (
          <div style={{ marginTop: 14 }}>
            <button className="ar-btn" onClick={onGoWeather}>Показать метео данные →</button>
          </div>
        )}
      </Glass>

      {/* ---- Ввести вручную ---- */}
      <Glass g={g} title="Ввести вручную" delay={40} style={{ gridColumn: "1 / -1" }}>
        <div className="ar-actions">
          <button className={"ar-btn" + (mode === "search" ? " on" : "")} onClick={() => setMode(mode === "search" ? null : "search")}>По названию</button>
          <button className={"ar-btn" + (mode === "manual" ? " on" : "")} onClick={() => setMode(mode === "manual" ? null : "manual")}>По координатам</button>
        </div>
        {mode === "search" && (
          <div className="ar-search">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: Софіївська Борщагівка"
                     onKeyDown={(e) => { if (e.key === "Enter") find(); }} />
              <button className="ar-btn" onClick={find} disabled={busy || q.trim().length < 2}>{busy ? "…" : "Искать"}</button>
            </div>
            {results && results.length === 0 && <div className="ar-sub" style={{ marginTop: 8 }}>Ничего не найдено. Попробуйте написать по-украински.</div>}
            {results && results.map((r, i) => (
              <button key={i} className="ar-res" onClick={() => pick(r)}>
                <b>{r.name}</b><span>{[r.admin, r.country].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}
        {mode === "manual" && (
          <div className="ar-search">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={draft.lat} inputMode="decimal" placeholder="широта, например 50.409"
                     onChange={(e) => setDraft({ ...draft, lat: e.target.value })} />
              <input value={draft.lon} inputMode="decimal" placeholder="долгота, например 30.359"
                     onChange={(e) => setDraft({ ...draft, lon: e.target.value })} />
              <button className="ar-btn" onClick={manual}>Принять</button>
            </div>
          </div>
        )}
        {!mode && <div className="ar-sub" style={{ marginTop: 12 }}>Если определение не сработало или не хочется давать доступ к геоданным.</div>}
      </Glass>

      {/* ---- О месте и источники: чтобы вкладка не пустовала ---- */}
      <div className="ar-pair" style={{ gridColumn: "1 / -1" }}>
      {coords && (
        <Glass g={g} title="О месте" delay={80}>
          <div className="ar-facts">
            <div><span>Широта</span><b>{coords.lat.toFixed(4)}°</b></div>
            <div><span>Долгота</span><b>{coords.lon.toFixed(4)}°</b></div>
            <div><span>Высота</span><b>{weather?.elevation != null ? `${Math.round(weather.elevation)} м` : "—"}</b></div>
            <div><span>Часовой пояс</span><b>{weather?.timezone_abbreviation || weather?.timezone || "—"}</b></div>
            <div><span>Восход</span><b>{daily?.sunrise?.[0] ? hhmm(daily.sunrise[0]) : "—"}</b></div>
            <div><span>Закат</span><b>{daily?.sunset?.[0] ? hhmm(daily.sunset[0]) : "—"}</b></div>
          </div>
        </Glass>
      )}

      <Glass g={g} title="Источники данных" delay={120}>
        <div className="ar-facts">
          <div><span>Погода</span><b>Open-Meteo</b></div>
          <div><span>Воздух</span><b>Open-Meteo, SaveEcoBot</b></div>
          <div><span>Датчиков рядом</span><b>{sensors ? sensors.length : "—"}</b></div>
          <div><span>Обновлено</span><b>{ageMin == null ? "—" : ageMin === 0 ? "только что" : `${ageMin} мин назад`}</b></div>
        </div>
        <div className="ar-legend" style={{ marginTop: 12 }}>
          Запросы уходят только с координатами, никуда больше место не пересылается и нигде, кроме этого
          устройства, не хранится.
        </div>
      </Glass>

      </div>

      <Glass g={g} title="Как это работает" delay={160} style={{ gridColumn: "1 / -1" }}>
        <div className="ar-steps">
          <div><b>1</b><span>Определите место или задайте вручную.</span></div>
          <div><b>2</b><span>Откройте «Метео данные»: погода, осадки, прогноз, воздух и компас ветра для вашего района.</span></div>
          <div><b>3</b><span>Компас ветра включается кнопкой и показывает направление ветра, как бы вы ни повернули телефон.</span></div>
        </div>
      </Glass>
    </div>
  );
}

export const AREA_CSS = `
.ar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px }
.ar-chip { font-family: var(--ui-mono); font-size: 9.5px; letter-spacing: .6px; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  border: 1px solid rgba(var(--ink, 231,238,246),0.25); background: rgba(255,255,255,0.07); color: rgba(var(--ink, 231,238,246),0.85) }
.ar-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px }
.ar-sub { font-family: var(--ui-sans); font-size: 11.5px; color: rgba(var(--ink, 231,238,246),0.6); margin-top: 4px; line-height: 1.5 }
.ar-where { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap }
.ar-place { font-family: var(--ui-sans); font-size: 22px; font-weight: 700; color: rgb(var(--ink, 231,238,246)); text-shadow: 0 0 16px rgba(160,205,255,0.4) }
.ar-actions { display: flex; gap: 10px; flex-wrap: wrap }
.ar-btn { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-family: var(--ui-sans); font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: rgb(var(--ink, 231,238,246));
  padding: 11px 18px; border-radius: 999px; border: 1px solid rgba(var(--ink, 231,238,246),0.3);
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05)); box-shadow: inset 0 1px .5px rgba(255,255,255,0.4);
  transition: transform .54s var(--ease-spring), background .41s }
.ar-btn:hover:not(:disabled) { transform: translateY(-2px) scale(1.03) }
.ar-btn:disabled { opacity: .55 }
.ar-btn.big { padding: 14px 24px; font-weight: 700; border-color: rgba(125,211,252,0.7); box-shadow: inset 0 1px .5px rgba(255,255,255,0.5), 0 0 24px -6px rgba(125,211,252,0.6) }
.ar-btn.on { border-color: rgba(139,226,139,0.7); box-shadow: 0 0 20px -6px rgba(139,226,139,0.7) }
.ar-search { margin-top: 14px; display: flex; flex-direction: column; gap: 8px }
.ar-search input { flex: 1; min-width: 0; padding: 11px 16px; border-radius: 999px; font-size: 13px; font-family: var(--ui-sans); color: rgb(var(--ink, 231,238,246));
  background: rgba(0,0,0,0.25); border: 1px solid rgba(var(--ink, 231,238,246),0.25); outline: none }
.ar-search input:focus { border-color: rgba(125,211,252,0.8) }
.ar-res { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; cursor: pointer; padding: 10px 14px; border-radius: 16px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(var(--ink, 231,238,246),0.15); color: rgb(var(--ink, 231,238,246)); font-family: var(--ui-sans); font-size: 13px }
.ar-res span { font-size: 10.5px; color: rgba(var(--ink, 231,238,246),0.55) }
.ar-err { margin-top: 12px; padding: 9px 12px; border-left: 2px solid #fb923c; color: #fdba74; font-size: 11.5px; line-height: 1.55; font-family: var(--ui-sans) }

.ar-now { display: flex; align-items: center; gap: 16px }
.ar-emoji { font-size: 54px; line-height: 1; filter: drop-shadow(0 0 16px rgba(160,205,255,0.5)) }
.ar-temp { font-family: var(--ui-mono); font-size: 52px; font-weight: 700; line-height: 1; color: rgb(var(--ink, 231,238,246)); text-shadow: 0 0 18px rgba(160,205,255,0.5) }
.ar-temp small { font-size: 18px; font-weight: 500; margin-left: 3px; opacity: .6 }
.ar-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-top: 14px }
.ar-facts div { display: flex; flex-direction: column; gap: 2px }
.ar-facts span { font-family: var(--ui-sans); font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; color: rgba(var(--ink, 231,238,246),0.45) }
.ar-facts b { font-family: var(--ui-mono); font-size: 13px; font-weight: 600; color: rgb(var(--ink, 231,238,246)) }

.ar-nowcast { font-family: var(--ui-sans); font-size: 13.5px; font-weight: 600; color: rgb(var(--ink, 231,238,246)); margin-bottom: 12px; line-height: 1.45;
  text-shadow: 0 0 12px rgba(160,205,255,0.35) }
.ar-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin }
.ar-hour { flex: none; width: 52px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px; border-radius: 18px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(var(--ink, 231,238,246),0.12); font-family: var(--ui-mono) }
.ar-h { font-size: 10.5px; color: rgba(var(--ink, 231,238,246),0.6) }
.ar-e { font-size: 20px; line-height: 1 }
.ar-hour b { font-size: 13px; color: rgb(var(--ink, 231,238,246)) }
.ar-p { font-size: 10px; color: #7dd3fc; min-height: 12px }
.ar-w { font-size: 10px; color: rgba(var(--ink, 231,238,246),0.55) }
.ar-legend { font-family: var(--ui-sans); font-size: 10px; line-height: 1.6; color: rgba(var(--ink, 231,238,246),0.38) }
.ar-ok { font-family: var(--ui-sans); font-size: 13px; color: #8be28b; text-shadow: 0 0 10px rgba(120,230,120,0.35); line-height: 1.5 }
.ar-alert { font-family: var(--ui-sans); font-size: 13px; line-height: 1.5; padding: 6px 0; color: #fcd34d }
.ar-alert.bad { color: #ff8585; font-weight: 600 }
.ar-sens { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(var(--ink, 231,238,246),0.1); font-size: 11px }
.ar-sens span { font-family: var(--ui-mono); color: #7dd3fc; white-space: nowrap }
.ar-sens em { flex: 1; min-width: 0; font-style: normal; color: rgba(var(--ink, 231,238,246),0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--ui-sans) }
.ar-sens b { font-family: var(--ui-mono); font-weight: 600; white-space: nowrap }

.ar-compass-wrap { position: relative; display: grid; place-items: center }
.ar-compass { width: min(300px, 82vw); height: auto; overflow: visible }
.ar-rose, .ar-wind { transition: transform .16s linear }
.ar-face { position: absolute; bottom: 4px; padding: 4px 12px; border-radius: 999px; font-family: var(--ui-sans); font-size: 11px; letter-spacing: 1.5px;
  text-transform: uppercase; color: #8be28b; border: 1px solid rgba(139,226,139,0.6); background: rgba(40,90,40,0.35); animation: arFace .54s var(--ease-spring) both }
@keyframes arFace { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
.ar-wind-line { text-align: center; margin: 12px 0 14px; font-family: var(--ui-sans); font-size: 13px; line-height: 1.55; color: rgba(var(--ink, 231,238,246),0.85) }
.ar-wind-line b { font-family: var(--ui-mono); color: rgb(var(--ink, 231,238,246)) }
.ar-compass-ctl { display: flex; flex-direction: column; align-items: center; gap: 10px }
.ar-note { font-family: var(--ui-sans); font-size: 11px; line-height: 1.55; text-align: center; color: rgba(var(--ink, 231,238,246),0.5); max-width: 340px }
.ar-mode { display: flex; flex-direction: column; gap: 14px }
.ar-switch { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px }
.ar-switch-note { font-family: var(--ui-sans); font-size: 11.5px; color: rgba(var(--ink, 231,238,246),0.6); min-width: 0 }
.ar-switch-note b { color: rgb(var(--ink, 231,238,246)); font-weight: 600 }
.ar-gauge { position: relative; width: 168px; height: 168px; margin: 4px auto 6px }
.ar-gauge svg { width: 100%; height: 100% }
.ar-gauge-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center }
.ar-gauge-in b { font-family: var(--ui-mono); font-size: 40px; font-weight: 700; line-height: 1; text-shadow: 0 0 18px currentColor }
.ar-gauge-in span { font-family: var(--ui-sans); font-size: 10px; letter-spacing: 2px; color: rgba(var(--ink, 231,238,246),0.5); margin-top: 3px }
.ar-bft { text-align: center; font-family: var(--ui-sans); font-size: 13px; color: rgba(var(--ink, 231,238,246),0.85) }
.ar-bft b { font-family: var(--ui-mono); font-size: 15px; color: rgb(var(--ink, 231,238,246)) }
.ar-bars { display: flex; align-items: flex-end; gap: 5px; flex: 1 0 64px; min-height: 64px; margin-top: 14px }
.ar-bar { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end }
.ar-bar i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 4px 4px 2px 2px }
/* Ячейка столбика видна всегда: двенадцать мест читаются шкалой, даже пока данных нет. */
.ar-bar::before { content: ""; position: absolute; inset: 0; border-radius: 4px 4px 2px 2px; background: rgba(255,255,255,0.035) }
.ar-bar .gu { background: rgba(255,255,255,0.14) }
.ar-bar .sp { position: absolute; left: 18%; right: 18%; top: 0; bottom: 0; border-radius: 4px 4px 2px 2px;
  background: none; box-shadow: none }
.ar-steps { display: flex; flex-direction: column; gap: 10px }
.ar-steps div { display: flex; align-items: center; gap: 14px; font-family: var(--ui-sans); font-size: 12.5px; line-height: 1.5; color: rgba(var(--ink, 231,238,246),0.8) }
.ar-steps b { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-family: var(--ui-mono); font-size: 13px;
  border: 1px solid rgba(125,211,252,0.6); color: #7dd3fc; background: rgba(125,211,252,0.1) }
.mo-off .ar-rose, .mo-off .ar-wind, .mo-off .ar-face { transition: none; animation: none }
`;

// Обе вкладки района от кадра станции не зависят: их пропсы — данные района,
// которые приходят раз в пять минут. memo снимает с них перерисовку на каждом
// кадре потока (20 Гц) — при условии, что district и колбэки стабильны.
export const AreaMode = memo(AreaModeView);
export const AreaTab = memo(AreaTabView);
