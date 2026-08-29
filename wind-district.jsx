import { useState, useEffect, useCallback, useRef } from "react";
import {
  LINE, LINE_HI, TEXT, DIM, FAINT, SANS, NUM, glow,
} from "./ui-kit.js";

// ============================================================
// РЕЖИМ «РАЙОН»
// ============================================================
// Третий источник данных рядом со станцией и демо. Показывает погоду вокруг
// дома, а не на мачте, и берётся целиком из интернета.
//
// Зачем он вообще нужен, если станция стоит во дворе: мачта меряет одну точку
// одним датчиком. Она не знает ни давления, ни осадков, ни качества воздуха,
// а при разряженном аккумуляторе не знает ничего. Район отвечает всегда и
// закрывает те величины, которых на плате физически нет.
//
// Почему не «государственная станция». Классический способ — METAR с
// ближайшего аэродрома, их выпускают государственные аэронавигационные службы.
// Для Киева это не работает: UKKK (Жуляны), UKBB (Борисполь) и UKLL (Львов)
// на запрос отдают пустоту — гражданское воздушное пространство закрыто, и
// сводки не выпускаются с 2022 года. Проверено, не предположение. Открытого
// веб-интерфейса у Укргидрометцентра тоже нет.
//
// Поэтому источников два, и у каждого своя роль:
//
//   Open-Meteo    — погода. Модельный реанализ ICON/ECMWF с шагом порядка
//                   километра, куда уже вошли наблюдения государственных
//                   станций. Не «датчик за окном», но и не выдумка.
//   SaveEcoBot    — воздух. Сеть народных датчиков, ближайшие стоят в
//                   сотнях метров. По пыли им верить можно: для неё их и
//                   ставили, и показания соседних точек сходятся.
//
// У SaveEcoBot берётся ТОЛЬКО воздух. Температуру оттуда не берём сознательно:
// в выдаче попадаются −142 °C и +40 °C у соседних домов в один и тот же час.
// Датчик за 30 долларов, висящий на солнечной стороне или в подъезде, меряет
// что угодно, кроме погоды. Пыль он меряет честно, температуру — нет.

const OM_WEATHER = "https://api.open-meteo.com/v1/forecast";
const OM_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const ECO = "https://api.saveecobot.com/output.json";

const COORD_KEY = "wind_district_coords";

// Погода обновляется у модели раз в 15 минут — чаще спрашивать нечего.
const WEATHER_MS = 5 * 60 * 1000;
// Выдача SaveEcoBot — единый файл на всю страну, около 370 КБ. Поэтому редко.
const ECO_MS = 20 * 60 * 1000;

// Коды ВМО. Полная таблица избыточна: соседние коды отличаются интенсивностью,
// а не явлением, и в одну строку подписи всё равно не влезут.
const WMO = {
  0: "ясно", 1: "почти ясно", 2: "переменная облачность", 3: "пасмурно",
  45: "туман", 48: "изморозь",
  51: "морось", 53: "морось", 55: "сильная морось",
  56: "ледяная морось", 57: "ледяная морось",
  61: "слабый дождь", 63: "дождь", 65: "ливень",
  66: "ледяной дождь", 67: "ледяной дождь",
  71: "слабый снег", 73: "снег", 75: "сильный снег", 77: "снежные зёрна",
  80: "ливневый дождь", 81: "ливень", 82: "сильный ливень",
  85: "снегопад", 86: "сильный снегопад",
  95: "гроза", 96: "гроза с градом", 99: "гроза с крупным градом",
};

function weatherText(code) {
  return WMO[code] ?? `код ВМО ${code}`;
}

// Европейский индекс качества воздуха. Границы — из регламента EEA.
export function aqiLevel(v) {
  if (v == null) return { label: "нет данных", color: FAINT };
  if (v <= 20) return { label: "отличный", color: "#4ade80" };
  if (v <= 40) return { label: "хороший", color: "#a3e635" };
  if (v <= 60) return { label: "средний", color: "#facc15" };
  if (v <= 80) return { label: "плохой", color: "#fb923c" };
  if (v <= 100) return { label: "очень плохой", color: "#f87171" };
  return { label: "опасный", color: "#c084fc" };
}

function km(aLat, aLon, bLat, bLon) {
  const dy = (aLat - bLat) * 111.0;
  const dx = (aLon - bLon) * 111.0 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

// ------------------------------------------------------------
// Приведение к тому же виду, в котором приходят данные с платы.
// Благодаря этому режим подставляется в готовый дашборд целиком:
// стрелка, график, роза ветров и анализ шквала работают без правок.
// ------------------------------------------------------------
export function districtToData(w) {
  if (!w) return null;
  const c = w.current;
  // Освещённость меряется в люксах, модель отдаёт ватты на квадратный метр.
  // Переводной множитель для дневного света — около 120 лм/Вт.
  const lux = Math.round((c.shortwave_radiation ?? 0) * 120);
  return {
    speed: parseFloat((c.wind_speed_10m ?? 0).toFixed(2)),
    gust: parseFloat((c.wind_gusts_10m ?? c.wind_speed_10m ?? 0).toFixed(2)),
    direction: Math.round(c.wind_direction_10m ?? 0),
    dirPresent: true,
    // Шкала как у станции: в городе на десяти метрах сотня не бывает,
    // а кольцо перегрузки должно означать то же, что и на мачте.
    speedMax: 30,

    tempC: c.temperature_2m, tempPresent: true,
    humidity: Math.round(c.relative_humidity_2m ?? 0), humidityPresent: true,
    // Давление на уровне моря, а не на высоте точки: именно его показывают
    // сводки и барометры, и только его осмысленно сравнивать между городами.
    pressureHpa: c.pressure_msl, pressurePresent: true,
    rainMm: c.precipitation ?? 0, rainPresent: true,
    lux, luxPresent: true,
    uvIndex: c.uv_index ?? 0, uvPresent: true,

    // Питания и светодиодов у района нет — это величины платы.
    battery: null, batteryPercent: null, batteryPresent: false,
    chargeState: "unknown", powerSource: "external",
    ledGreen: "off", ledYellow: "off", ledRed: "off",
    ledWifi: "on", ledAuto: false,
    wifiRssi: null, adcError: false,
    hostname: "район", uptime: 0,
  };
}

// ------------------------------------------------------------
// Загрузка
// ------------------------------------------------------------
export function useDistrict(active) {
  const [coords, setCoordsState] = useState(() => {
    try {
      const raw = localStorage.getItem(COORD_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [sensors, setSensors] = useState(null);
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);
  const ecoAt = useRef(0);

  const setCoords = useCallback((c) => {
    setCoordsState(c);
    try { localStorage.setItem(COORD_KEY, JSON.stringify(c)); } catch { /* приватный режим */ }
  }, []);

  // Место берётся у браузера, а не вшивается в код: координаты мачты — это
  // домашний адрес, а дашборд лежит в публичном репозитории.
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Браузер не умеет определять место.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setError(null);
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === 1
            ? "Доступ к геоданным закрыт. Разрешение можно выдать во вкладке НАСТРОЙКИ → ДОПОЛНИТЕЛЬНЫЕ."
            : "Место определить не удалось."
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  }, [setCoords]);

  const load = useCallback(async () => {
    if (!coords) return;
    const { lat, lon } = coords;
    const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;

    try {
      const res = await fetch(
        `${OM_WEATHER}?${q}&wind_speed_unit=ms&timezone=auto&current=` +
        "temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m," +
        "precipitation,weather_code,pressure_msl,surface_pressure,cloud_cover," +
        "wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,uv_index," +
        "shortwave_radiation,visibility"
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWeather(await res.json());
      setError(null);
    } catch {
      setError("Погоду загрузить не удалось: нет выхода в интернет либо источник недоступен.");
    }

    try {
      const res = await fetch(
        `${OM_AIR}?${q}&timezone=auto&current=` +
        "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide," +
        "european_aqi,birch_pollen,grass_pollen,alder_pollen"
      );
      if (res.ok) setAir(await res.json());
    } catch { /* воздух не критичен — погода уже есть */ }

    // Народные датчики: тяжёлый общий файл, поэтому по своему таймеру.
    if (Date.now() - ecoAt.current > ECO_MS) {
      try {
        const res = await fetch(ECO);
        if (res.ok) {
          const all = await res.json();
          const near = all
            .map((s) => {
              const sLat = parseFloat(s.latitude), sLon = parseFloat(s.longitude);
              if (!isFinite(sLat) || !isFinite(sLon)) return null;
              const pol = {};
              for (const p of s.pollutants || []) pol[p.pol] = p.value;
              // Берём только те точки, что действительно меряют пыль.
              if (pol["PM2.5"] == null && pol.PM10 == null) return null;
              return {
                id: s.id,
                name: s.localName || s.stationName || "без названия",
                city: s.cityName,
                d: km(lat, lon, sLat, sLon),
                pm25: pol["PM2.5"], pm10: pol.PM10, aqi: pol["Air Quality Index"],
              };
            })
            .filter(Boolean)
            .sort((a, b) => a.d - b.d)
            .slice(0, 4);
          setSensors(near);
          ecoAt.current = Date.now();
        }
      } catch { /* сеть датчиков не отвечает — не беда */ }
    }
  }, [coords]);

  useEffect(() => {
    if (!active || !coords) return;
    load();
    const id = setInterval(load, WEATHER_MS);
    return () => clearInterval(id);
  }, [active, coords, load]);

  return { coords, setCoords, locate, locating, weather, air, sensors, error, reload: load };
}

// ------------------------------------------------------------
// Панель
// ------------------------------------------------------------
function Row({ k, v }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
      <span style={{ color: DIM, fontFamily: SANS, fontSize: 10.5, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${FAINT}`, transform: "translateY(-3px)" }} />
      <span style={{ ...NUM, fontSize: 10.5, color: TEXT, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export default function District({ g, accent, coords, setCoords, locate, locating,
                                   weather, air, sensors, error }) {
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState({ lat: "", lon: "" });

  const c = weather?.current;
  const a = air?.current;
  const lvl = aqiLevel(a?.european_aqi);

  const btn = {
    background: "transparent", border: `1px solid ${LINE_HI}`, color: TEXT,
    fontFamily: SANS, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
    padding: "6px 12px", cursor: "pointer", textShadow: glow(g, 0.4),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!coords && (
        <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.65, fontFamily: SANS }}>
          Чтобы показать погоду вокруг дома, нужно знать, где этот дом. Место берётся
          у браузера и остаётся в этом браузере — ни на плату, ни куда-либо ещё оно
          не уходит. Можно и ввести вручную, если разрешение выдавать не хочется.
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <button style={btn} onClick={locate} disabled={locating}>
              {locating ? "определяю…" : "определить место"}
            </button>
            <button style={btn} onClick={() => setManual((v) => !v)}>ввести вручную</button>
          </div>
          {manual && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {["lat", "lon"].map((k) => (
                <input key={k} value={draft[k]} inputMode="decimal"
                       placeholder={k === "lat" ? "широта" : "долгота"}
                       onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                       style={{
                         ...NUM, fontSize: 11, width: 96, padding: "5px 8px",
                         background: "transparent", border: `1px solid ${LINE}`, color: TEXT,
                       }} />
              ))}
              <button style={btn} onClick={() => {
                const lat = parseFloat(draft.lat), lon = parseFloat(draft.lon);
                if (isFinite(lat) && isFinite(lon)) setCoords({ lat, lon });
              }}>принять</button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: "#fb923c", fontSize: 11, lineHeight: 1.6, fontFamily: SANS,
                      borderLeft: `2px solid #fb923c`, paddingLeft: 9 }}>
          {error}
        </div>
      )}

      {coords && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...NUM, fontSize: 9.5, color: FAINT }}>
            {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)}
          </span>
          <span style={{ flex: 1 }} />
          <button style={{ ...btn, fontSize: 9, padding: "4px 9px" }} onClick={locate} disabled={locating}>
            {locating ? "…" : "уточнить"}
          </button>
        </div>
      )}

      {c && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEXT,
                        textShadow: glow(g, 0.45), marginBottom: 6 }}>
            {weatherText(c.weather_code)}
          </div>
          <Row k="Ощущается как" v={`${c.apparent_temperature?.toFixed(1)} °C`} />
          <Row k="Точка росы" v={`${c.dew_point_2m?.toFixed(1)} °C`} />
          <Row k="Облачность" v={`${c.cloud_cover} %`} />
          <Row k="Видимость" v={c.visibility != null ? `${(c.visibility / 1000).toFixed(1)} км` : "—"} />
          <Row k="Давление у земли" v={`${c.surface_pressure?.toFixed(1)} гПа`} />
        </div>
      )}

      {a && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEXT,
                           textShadow: glow(g, 0.45) }}>Воздух</span>
            <span style={{ ...NUM, fontSize: 11, color: lvl.color }}>
              {a.european_aqi ?? "—"} · {lvl.label}
            </span>
          </div>
          <Row k="Мелкая пыль PM2.5" v={`${a.pm2_5 ?? "—"} мкг/м³`} />
          <Row k="Пыль PM10" v={`${a.pm10 ?? "—"} мкг/м³`} />
          <Row k="Диоксид азота" v={`${a.nitrogen_dioxide ?? "—"} мкг/м³`} />
          <Row k="Озон" v={`${a.ozone ?? "—"} мкг/м³`} />
          {(a.birch_pollen > 0 || a.grass_pollen > 0 || a.alder_pollen > 0) && (
            <Row k="Пыльца, берёза / трава"
                 v={`${a.birch_pollen ?? 0} / ${a.grass_pollen ?? 0} зёрен/м³`} />
          )}
        </div>
      )}

      {sensors?.length > 0 && (
        <div>
          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEXT,
                        textShadow: glow(g, 0.45), marginBottom: 5 }}>
            Датчики рядом
          </div>
          {sensors.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 8,
                                     padding: "4px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ ...NUM, fontSize: 10, color: accent, whiteSpace: "nowrap" }}>
                {s.d < 1 ? `${Math.round(s.d * 1000)} м` : `${s.d.toFixed(1)} км`}
              </span>
              <span style={{ flex: 1, minWidth: 0, color: DIM, fontFamily: SANS, fontSize: 10.5,
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              <span style={{ ...NUM, fontSize: 10, color: TEXT, whiteSpace: "nowrap" }}>
                PM2.5 {s.pm25 ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.65, fontFamily: SANS }}>
        Погода — Open-Meteo: модель ICON/ECMWF с шагом около километра, куда уже вошли
        наблюдения государственных станций. Это не датчик за окном, но и не выдумка.
        Воздух — Open-Meteo и сеть SaveEcoBot; расстояния до её точек считаются от твоего
        места. С народных датчиков берётся только пыль: температуру они врут откровенно —
        в выдаче попадаются минус сто сорок и плюс сорок у соседних домов в один час.
        METAR ближайших аэродромов подключить нельзя: Жуляны, Борисполь и Львов сводок
        не выпускают — гражданское небо закрыто.
      </div>
    </div>
  );
}
