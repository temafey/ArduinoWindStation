import { LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM, glow, glowColor } from "./ui-kit.js";
import { SwitchGlyph } from "./wind-switch.jsx";

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
  { label: "Штиль",     patch: { speed: 0.2, gustExtra: 0, tempC: 18, humidity: 60, pressureHpa: 1020, rainMm: 0 } },
  { label: "Свежий",    patch: { speed: 9, gustExtra: 3, tempC: 15, humidity: 65, pressureHpa: 1012, rainMm: 0 } },
  { label: "Шквал",     patch: { speed: 16, gustExtra: 9, tempC: 12, humidity: 88, pressureHpa: 999, rainMm: 6 } },
  { label: "Шторм",     patch: { speed: 26, gustExtra: 11, tempC: 9, humidity: 92, pressureHpa: 986, rainMm: 14 } },
  { label: "Ураган",    patch: { speed: 36, gustExtra: 14, tempC: 22, humidity: 95, pressureHpa: 958, rainMm: 25 } },
  { label: "Мороз",     patch: { speed: 12, gustExtra: 4, tempC: -18, humidity: 70, pressureHpa: 1030, rainMm: 0 } },
  // Мировой рекорд порыва у поверхности — 113 м/с, остров Барроу, 1996 год.
  // Он же примерно и есть потолок, выше которого измерений просто не бывает.
  { label: "Рекорд Земли", patch: { speed: 96, gustExtra: 17, tempC: 26, humidity: 96, pressureHpa: 920, rainMm: 30 } },
  { label: "3 категория",  patch: { speed: 52, gustExtra: 12, tempC: 27, humidity: 94, pressureHpa: 955, rainMm: 22 } },
  { label: "Сверх шкалы",  patch: { speed: 112, gustExtra: 8, tempC: 24, humidity: 97, pressureHpa: 905, rainMm: 30 } },
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
      <input
        type="range"
        className="rng"
        min={f.min} max={f.max} step={f.step} value={value}
        onChange={(e) => onChange(f.key, parseFloat(e.target.value))}
        style={{ "--rng-accent": accent }}
        aria-label={f.label}
      />
    </div>
  );
}

export default function DemoControls({ demo, setDemo, g, accent, alarmLevel }) {
  const set = (key, v) => setDemo((d) => ({ ...d, [key]: v }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {/* Переключателем работает вся кнопка, поэтому внутри стоит не тумблер,
            а его вид: вложенная кнопка была бы недопустимой разметкой, а клик
            всё равно ловила бы внешняя. */}
        <button
          onClick={() => setDemo((d) => ({ ...d, manual: !d.manual }))}
          role="switch" aria-checked={demo.manual}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "transparent",
            border: `1px solid ${demo.manual ? LINE_HI : LINE}`,
            color: demo.manual ? TEXT : DIM,
            textShadow: demo.manual ? glow(g, 0.6) : "none",
            fontFamily: SANS, fontSize: 10, letterSpacing: 1.4, fontWeight: 600,
            padding: "5px 12px 5px 6px", cursor: "pointer", textTransform: "uppercase",
          }}
        >
          <SwitchGlyph on={demo.manual} accent={accent} />
          {demo.manual ? "Ручное" : "Автомодель"}
        </button>
        <span style={{ color: FAINT, fontSize: 10, fontFamily: SANS, lineHeight: 1.5 }}>
          {demo.manual
            ? "Значения берутся с ползунков и не меняются сами."
            : "Модель крутит ветер сама — включи ручное, чтобы задать вручную."}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
        {PRESETS.map((p) => {
          // Заготовка включает ручной режим сама: иначе модель тут же затрёт
          // выставленное, и нажатие выглядит как будто ничего не произошло.
          const hot = p.patch.speed >= 17.2;
          return (
            <button
              key={p.label}
              onClick={() => setDemo((d) => ({ ...d, manual: true, ...p.patch }))}
              style={{
                background: "transparent",
                border: `1px solid ${LINE}`,
                borderLeft: `2px solid ${hot ? "#ef4444" : LINE_HI}`,
                color: DIM, fontFamily: SANS, fontSize: 10, letterSpacing: 0.5,
                padding: "5px 10px", cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="demo-grid" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px",
        opacity: demo.manual ? 1 : 0.45,
        pointerEvents: demo.manual ? undefined : "none",
        transition: "opacity .25s ease",
      }}>
        {FIELDS.map((f) => (
          <Slider key={f.key} f={f} value={demo[f.key]} onChange={set} g={g} accent={accent} />
        ))}
      </div>

      {alarmLevel > 0 && (
        <div style={{
          marginTop: 12, border: `1px solid ${alarmLevel > 1 ? "#ef4444" : "#facc15"}`,
          borderLeft: `2px solid ${alarmLevel > 1 ? "#ef4444" : "#facc15"}`,
          padding: "8px 11px", fontSize: 10.5, lineHeight: 1.55,
          color: "rgba(231,238,246,0.85)", fontFamily: SANS,
        }}>
          Тревога сработала — так она и выглядит на живой станции. Порог задаётся
          в дополнительных настройках.
        </div>
      )}

      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 12, fontFamily: SANS }}>
        Демо моделирует R.M. Young 05103 — у него по паспорту 0–100 м/с, поэтому и шкала здесь
        размечена до сотни. Фиолетовое кольцо загорается на 50 м/с и заполняется целиком к сотне:
        50 м/с это почти ровно граница урагана третьей категории по шкале Саффира–Симпсона,
        с которой его считают мощным.

        На вашей станции стоит датчик 0–30 м/с, и прошивка обрезает показание на этой отметке —
        значит второго кольца там не будет никогда, потому что нечем измерить пятьдесят.
        Менять предел в прошивке нельзя: это множитель калибровки, а не предел показа,
        и от него зависит каждое показание.

        Ползунки живут только в демо-режиме. На подключённой станции такой панели нет и не будет:
        орган управления, двигающий показания ветра, — это уже не отладка, а подделка данных.
        История, роза ветров и конвективный анализ считаются от этих значений так же, как от
        настоящих, поэтому шквал, поставленный руками, честно доедет до всех приборов.
      </div>
    </div>
  );
}
