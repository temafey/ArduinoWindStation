import { TEXT, DIM, FAINT, SANS, NUM, glow } from "./ui-kit.js";
import { SwitchGlyph } from "./wind-switch.jsx";
import { LiquidRange } from "./wind-liquid.jsx";

// ============================================================
// РУЧНОЕ УПРАВЛЕНИЕ ДЕМО-РЕЖИМОМ
// ============================================================
// Модель сама по себе крутит правдоподобный ветер, но проверить на ней нечего:
// нельзя ни поймать шквал, ни посмотреть, как выглядит ураган, ни довести
// батарею до нуля — приходится сидеть и ждать, когда синусоида дойдёт куда надо.
// Здесь всё то же самое ставится руками за секунду.
//
// Панель существует **только** в демо-режиме и нигде больше. На живой станции
// ползунок «скорость ветра» — это не отладка, а подделка показаний, и такого
// органа управления у метеостанции быть не должно.

const FIELDS = [
  // Верхняя граница ползунка выше предела прибора намеренно: иначе режим
  // перегрузки, ради которого второй круг и существует, нечем было бы вызвать.
  { key: "speed",       label: "Скорость",    unit: "м/с",  min: 0,    max: 120,  step: 0.5, digits: 1 },
  { key: "gustExtra",   label: "Порыв сверх", unit: "м/с",  min: 0,    max: 40,   step: 0.5, digits: 1 },
  { key: "dir",         label: "Направление", unit: "°",    min: 0,    max: 359,  step: 1,   digits: 0 },
  { key: "tempC",       label: "Температура", unit: "°C",   min: -40,  max: 50,   step: 0.1, digits: 1 },
  { key: "humidity",    label: "Влажность",   unit: "%",    min: 0,    max: 100,  step: 1,   digits: 0 },
  { key: "pressureHpa", label: "Давление",    unit: "гПа",  min: 950,  max: 1050, step: 0.1, digits: 1 },
  { key: "rainMm",      label: "Осадки",      unit: "мм/ч", min: 0,    max: 30,   step: 0.1, digits: 1 },
  { key: "battery",     label: "Батарея",     unit: "В",    min: 3.0,  max: 4.2,  step: 0.01, digits: 2 },
];

// Заготовки: то, ради чего панель и нужна — довести дашборд до состояния,
// которого иначе пришлось бы ждать часами или не дождаться вовсе.
const PRESETS = [
  { label: "Штиль",  patch: { speed: 0.2, gustExtra: 0, tempC: 18, humidity: 60, pressureHpa: 1020, rainMm: 0 } },
  { label: "Свежий", patch: { speed: 9, gustExtra: 3, tempC: 15, humidity: 65, pressureHpa: 1012, rainMm: 0 } },
  { label: "Шквал",  patch: { speed: 16, gustExtra: 9, tempC: 12, humidity: 88, pressureHpa: 999, rainMm: 6 } },
  { label: "Шторм",  patch: { speed: 26, gustExtra: 11, tempC: 9, humidity: 92, pressureHpa: 986, rainMm: 14 } },
  { label: "Ураган", patch: { speed: 36, gustExtra: 14, tempC: 22, humidity: 95, pressureHpa: 958, rainMm: 25 } },
  { label: "Рекорд", patch: { speed: 96, gustExtra: 17, tempC: 26, humidity: 96, pressureHpa: 920, rainMm: 30 } },
];

function Slider({ f, value, onChange, g, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: DIM, fontSize: 10, fontFamily: SANS, letterSpacing: 0.5 }}>{f.label}</span>
        <span style={{ ...NUM, fontSize: 11, color: TEXT, textShadow: glow(g, 0.4) }}>
          {value.toFixed(f.digits)}
          <span style={{ color: FAINT, fontSize: 9 }}>{f.unit ? " " + f.unit : ""}</span>
        </span>
      </div>
      <LiquidRange
        className="rng" thick={5} color={accent}
        min={f.min} max={f.max} step={f.step} value={value}
        onChange={(e) => onChange(f.key, parseFloat(e.target.value))}
        style={{ "--rng-accent": accent }}
        aria-label={f.label}
      />
    </div>
  );
}

export default function DemoControls({ demo, setDemo, g, accent, onClose }) {
  const set = (key, v) => setDemo((d) => ({ ...d, [key]: v }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setDemo((d) => ({ ...d, manual: !d.manual }))}
          role="switch" aria-checked={demo.manual}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", border: 0,
            color: demo.manual ? TEXT : DIM, fontFamily: SANS, fontSize: 10.5, letterSpacing: 1.2,
            fontWeight: 600, padding: 0, cursor: "pointer", textTransform: "uppercase",
          }}
        >
          <SwitchGlyph on={demo.manual} accent={accent} />
          {demo.manual ? "Ручное" : "Авто"}
        </button>
        <button className="set-x" onClick={onClose} aria-label="Скрыть">✕</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="demo-chip"
            onClick={() => setDemo((d) => ({ ...d, manual: true, ...p.patch }))}
            style={p.patch.speed >= 17.2 ? { "--chip": "rgba(239,68,68,0.6)" } : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px",
        opacity: demo.manual ? 1 : 0.4, pointerEvents: demo.manual ? undefined : "none",
        transition: "opacity .34s ease",
      }}>
        {FIELDS.map((f) => (
          <Slider key={f.key} f={f} value={demo[f.key]} onChange={set} g={g} accent={accent} />
        ))}
      </div>
    </div>
  );
}
