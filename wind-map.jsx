import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SwitchGlyph } from "./wind-switch.jsx";
import { WORLD_RINGS } from "./world-rings.js";
import { EF_SCALE, efInfo, ALARM_FROM, ARCHIVE_SORTED } from "./storm-archive.js";
import { visibleCities } from "./world-cities.js";
import {
  BG, LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM,
  glow, glowColor, dropGlow,
} from "./ui-kit.js";

// ============================================================
// ЧТО ЗДЕСЬ ЧЕСТНО, А ЧТО НЕВОЗМОЖНО
// ============================================================
// Карта показывает три разных сорта данных, и путать их нельзя:
//
//   1. Живые предупреждения службы погоды США (NWS). Настоящие, обновляются
//      каждые полторы минуты, отдаются с CORS — их можно тянуть прямо из
//      браузера без ключа и без сервера-посредника. Покрытие — только США
//      и подконтрольные территории.
//   2. Предварительные донесения о смерчах за сегодня (SPC). Тоже настоящие,
//      это точки касания земли, поданные наблюдателями за текущие сутки.
//   3. Справочный архив разрушительных смерчей (storm-archive.js) — завершённые,
//      обследованные события с официальным рейтингом.
//
// Чего здесь нет и не может быть:
//
//   * Рейтинга EF у активного смерча. Категорию присваивают по наземному
//     обследованию разрушений, обычно через день-два. Пока смерч идёт, у него
//     нет и не может быть EF — есть только «обнаружен радаром» или «подтверждён
//     наблюдателем». Поэтому шкала EF раскрашивает архив, а живой слой —
//     уровень угрозы из самого предупреждения.
//   * Мирового охвата живых данных. Бесплатных, открытых, CORS-доступных
//     потоков по смерчам и циклонам вне США попросту не существует. Рисовать
//     на месте Европы или Азии выдуманные значки было бы враньём, поэтому там
//     живой слой честно пуст, а карта об этом говорит.
//   * Встроенных трансляций и новостной ленты. Нет API, который связывает
//     конкретный смерч с конкретным эфиром шторм-чейзера, а угадывать
//     соответствие — значит подписывать под ураганом случайное видео. Вместо
//     этого кнопки открывают поиск по названию и дате события: это ровно то,
//     что можно сделать честно.
//   * Google Maps. Ей нужен ключ, сеть и её собственные тайлы, а станция
//     раздаёт дашборд из PROGMEM в сети без интернета. Плюс её оформление —
//     ровно противоположность тому, как выглядит этот дашборд. Поэтому карта
//     здесь своя: 84 контура суши, 4724 точки, честная проекция Меркатора,
//     8.8 КБ в gzip и полная работа без сети.

// ============================================================
// ПРОЕКЦИЯ
// ============================================================
// Меркатор в единичный квадрат [0,1]². Он выбран не для красоты: слой
// отражаемости NOAA отдаётся в EPSG:3857, и любая другая проекция потребовала
// бы перепроецировать растр на клиенте.
const MAX_LAT = 85.0511;
const R_EARTH = 6378137;

function project(lon, lat) {
  const x = (lon + 180) / 360;
  const l = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2;
  return [x, y];
}

// Обратная проекция: из единичного квадрата назад в градусы. Нужна ровно для
// одного — поставить свою отметку касанием карты там, где геолокация недоступна.
function unproject(ux, uy) {
  const lon = ux * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * uy))) * 180) / Math.PI;
  return [lon, lat];
}

// Единичные координаты -> метры EPSG:3857 для запроса WMS.
const toMercX = (u) => (u - 0.5) * 2 * Math.PI * R_EARTH;
const toMercY = (v) => (0.5 - v) * 2 * Math.PI * R_EARTH;

// Холст карты. Соотношение почти 2:1 — на нём мир при масштабе 1 занимает всю
// ширину, а по вертикали остаются широты примерно от +62° до −62°, то есть вся
// населённая суша и оба смерчевых пояса.
const VW = 1000, VH = 520;
const Z_MIN = 0.55, Z_MAX = 64;

// ============================================================
// ГЕОМЕТРИЯ СУШИ
// ============================================================
// Разбор дельта-кодированных колец. Делается один раз на модуль: контуры не
// зависят ни от масштаба, ни от данных, а перегонять четыре с лишним тысячи
// точек на каждой перерисовке незачем.
const LAND_PATHS = (() => {
  const out = [];
  for (const ring of WORLD_RINGS.split(";")) {
    let px = 0, py = 0, d = "";
    for (const pt of ring.split(" ")) {
      const c = pt.indexOf(",");
      px += +pt.slice(0, c);
      py += +pt.slice(c + 1);
      const [ux, uy] = project(px / 10, py / 10);
      d += (d ? "L" : "M") + (ux * VW).toFixed(1) + " " + (uy * VW).toFixed(1);
    }
    out.push(d + "Z");
  }
  return out;
})();

// ============================================================
// ИСТОЧНИКИ
// ============================================================
// Всё, что тут перечислено, проверено на CORS: эти адреса отвечают браузеру
// напрямую, без ключа и без прокси. Если добавляешь источник — проверь заголовок
// Access-Control-Allow-Origin, иначе слой молча останется пустым.
const NWS_EVENTS = [
  "Tornado Warning", "Tornado Watch",
  "Tsunami Warning", "Tsunami Advisory",
  "Hurricane Warning", "Tropical Storm Warning",
];
// Повторяющиеся event= API принимает, а вот limit на /alerts/active — нет:
// с ним запрос отвечает 400 Bad Request независимо от остальных параметров.
// Проверено вживую; не добавлять обратно «на всякий случай».
const NWS_URL =
  "https://api.weather.gov/alerts/active?status=actual&" +
  NWS_EVENTS.map((e) => `event=${encodeURIComponent(e)}`).join("&");
const SPC_URL = "https://www.spc.noaa.gov/climo/reports/today_torn.csv";
// Суперклетки. Отдельного потока «вот суперклетка, вот её координаты» не
// существует ни у одной службы мира: суперклетка — это структура внутри грозы,
// её опознают по доплеровской скорости на конкретном радаре, и объектами наружу
// никто не отдаёт. Зато существует ровно то, что нужно: официальный прогноз SPC
// на день, где обведены области, в которых суперклетки и ожидаются. Это тот же
// продукт, по которому работают сами шторм-чейзеры.
//
// Категорийный прогноз несёт в себе и официальные цвета, и подписи, поэтому
// палитру для него выдумывать не надо — она приходит вместе с данными.
const SPC_OUTLOOK_URL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson";
const SPC_TORN_URL = "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson";

// DN — код уровня в продуктах SPC. Подписи русские, цвет берётся из самих данных.
const OUTLOOK_RU = {
  1: "гроз не ожидается", 2: "обычные грозы", 3: "минимальный риск",
  4: "небольшой риск", 5: "повышенный риск", 6: "умеренный риск", 7: "высокий риск",
};
// ---- Отражаемость на весь мир ----
// Было: WMS-растр NOAA на прямоугольник материковых США. Продукт отличный, но
// за границей США под ним пусто, а карта здесь мировая — и «отражаемость»,
// которая кончается на канадской границе, выглядит поломкой, а не ограничением
// источника.
//
// Стало: мозаика RainViewer. Это сводка национальных радарных сетей —
// американской NEXRAD, европейской OPERA, японской, австралийской, бразильской
// и далее, — сшитая в один тайловый слой Меркатора. Ключа не просит, отдаёт
// заголовок Access-Control-Allow-Origin: *, тайлы обычные PNG 256/512.
// Проверено живьём: индекс отвечает 200, тайл z=0 весит 8 КБ и содержит весь
// мир сразу.
//
// Индекс со списком кадров лежит по постоянному адресу; путь внутри него
// меняется каждые десять минут, поэтому кадр берётся оттуда, а не собирается
// из времени руками.
const RV_INDEX = "https://api.rainviewer.com/public/weather-maps.json";
// Схема 6 — NEXRAD Level III: та самая шкала, по которой отражаемость читают
// в США, и единственная здесь, которая на тёмной карте не превращается в кашу.
const RV_COLOR = 6;
// Хвост адреса тайла: сглаживание и показ снега. Ноль в первом поле — сырые
// пиксели радарной сетки, единица — интерполяция. Это и есть настройка
// «пиксельная / обычная»: она не рисуется поверх, а запрашивается у сервера,
// поэтому «пиксельная» — это настоящие ячейки радара, а не эффект.
const rvTail = (pixel) => `${pixel ? 0 : 1}_1.png`;

// ---- Мировой экран суперклеток ----
// Продукта «вот суперклетка» на весь мир не существует — об этом ниже, у
// SPC_OUTLOOK_URL. Но существуют две величины, из которых суперклетку и
// предсказывают: доступная потенциальная энергия неустойчивости (CAPE) и сдвиг
// ветра по высоте. Вихрь суперклетки рождается ровно из их сочетания: энергия
// даёт восходящий поток, сдвиг закручивает его вокруг горизонтальной оси и
// ставит на попа. Одной энергии мало — будет обычная гроза, живущая двадцать
// минут; одного сдвига мало — не будет и грозы.
//
// Open-Meteo отдаёт обе величины по всему миру, без ключа, с CORS и в одном
// запросе на список точек. Отсюда и слой: сетка по видимому куску карты, в
// каждой ячейке — CAPE и сдвиг между 10 м и 500 гПа, и из них простой
// показатель. Это **не** продукт SPC и им не притворяется: у настоящего SCP в
// формуле есть ещё и спиральность приземного слоя, которой в открытых данных
// нет. Здесь честный экран «где сегодня сочетание, из которого получаются
// суперклетки», а не прогноз службы.
const OM_URL = "https://api.open-meteo.com/v1/forecast";
// 24 × 15 — предел, а не вкус: все точки уходят одним запросом в строке адреса,
// и на 32 × 20 сервер отвечает 414 Request-URI Too Large. Проверено живьём.
const CELL_COLS = 24, CELL_ROWS = 15;
// Пороги подобраны по классическим границам: сдвиг 20 м/с в слое 0–6 км —
// граница, с которой грозы становятся организованными, CAPE 1500 Дж/кг —
// умеренная неустойчивость. Единица показателя = обе величины на своих
// границах одновременно, то есть ровно та обстановка, в которой суперклетки и
// живут.
//
// Нижний порог был 0.35 — и летним днём над США загоралась вся страна:
// «сочетание есть» оказывалось верно почти везде и не значило ничего. Слой,
// который горит всегда, — не слой, а фон. Теперь шкала начинается там, где
// обстановка уже заметно организованная, и карта под ней остаётся видна.
const CELL_RAMP = [
  { at: 0.6, color: "#a3e635", label: "складывается" },
  { at: 1.0, color: "#facc15", label: "суперклеточная" },
  { at: 2.0, color: "#f97316", label: "сильная" },
  { at: 3.5, color: "#ef4444", label: "исключительная" },
];
function cellColor(v) {
  let c = null;
  for (const s of CELL_RAMP) if (v >= s.at) c = s.color;
  return c;
}

// ---- Движение шторма ----
// NWS кладёт в предупреждение сегмент TML — время, направление, скорость и
// точку: «...storm...271DEG...19KT...34.68,-81.29». Направление в нём — то,
// ОТКУДА идёт шторм: метеорологическое соглашение, то же самое, по которому
// «северный ветер» дует с севера. Курс движения поэтому DEG + 180, и перепутать
// эти две вещи значит нарисовать конус ровно в противоположную сторону —
// ошибка, которая выглядит как рабочая функция.
function parseMotion(props) {
  const raw = ((props && props.parameters && props.parameters.eventMotionDescription) || [])[0];
  if (!raw) return null;
  const deg = /(\d{1,3})DEG/.exec(raw);
  const kt = /(\d{1,3})KT/.exec(raw);
  if (!deg || !kt) return null;
  // Точек бывает несколько — у линии шквалов их столько, сколько ячеек.
  // Берём первую: конус рисуется от неё, а не от центра всей зоны.
  const pts = [];
  const re = /(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(raw))) {
    const lat = +m[1], lon = +m[2];
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pts.push({ lat, lon });
  }
  return {
    from: +deg[1],
    heading: (+deg[1] + 180) % 360,
    kt: +kt[1],
    kmh: +kt[1] * 1.852,
    at: pts.length ? pts[0] : null,
  };
}

// Точка на сфере в заданном направлении и на заданном расстоянии. Плоское
// приближение здесь не годится: на широте Оклахомы градус долготы вдвое короче
// градуса широты, и конус уехал бы вбок.
function forward(lat, lon, headingDeg, km) {
  const R = 6371, d = km / R, b = (headingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1),
                             Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(((l2 * 180) / Math.PI + 540) % 360) - 180, (p2 * 180) / Math.PI];
}

// Уровень угрозы живого предупреждения. Это не EF и им не притворяется:
// шкала собрана из полей, которые NWS реально кладёт в предупреждение.
// CATASTROPHIC в поле tornadoDamageThreat — это «особо опасная ситуация»,
// формулировка, которую служба применяет считанные разы в год.
function alertThreat(p) {
  const par = p.parameters || {};
  const dmg = (par.tornadoDamageThreat || [])[0];
  const det = (par.tornadoDetection || [])[0];
  if (dmg === "CATASTROPHIC") return 5;
  if (dmg === "CONSIDERABLE") return 4;
  if (p.event === "Tsunami Warning") return 5;
  if (p.event === "Hurricane Warning") return 4;
  if (p.event === "Tornado Warning") return det === "OBSERVED" ? 4 : 3;
  if (p.event === "Tropical Storm Warning" || p.event === "Tsunami Advisory") return 3;
  return 1; // watch — «условия возможны», а не «происходит»
}

const THREAT_COLOR = ["#94a3b8", "#67e8f9", "#facc15", "#f97316", "#ef4444", "#ff2d2d"];

// Разбор CSV донесений SPC. Формат простой, но поле Comments свободное и в нём
// попадаются запятые в кавычках — поэтому не split(',') в лоб.
function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseSpc(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (n) => head.indexOf(n);
  const iLat = idx("lat"), iLon = idx("lon");
  if (iLat < 0 || iLon < 0) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      kind: "report",
      id: `spc-${i}`,
      lat, lon,
      time: (c[idx("time")] || "").trim(),
      fScale: (c[idx("f_scale")] || "").trim(),
      location: (c[idx("location")] || "").trim(),
      county: (c[idx("county")] || "").trim(),
      state: (c[idx("state")] || "").trim(),
      comments: (c[idx("comments")] || "").trim(),
    });
  }
  return out;
}

// Центр тяжести контура — куда ставить отметку. Для предупреждений это
// достаточно: сам контур тоже рисуется, отметка нужна лишь как цель для клика.
function centroid(geometry) {
  if (!geometry) return null;
  const rings = geometry.type === "Polygon" ? geometry.coordinates
    : geometry.type === "MultiPolygon" ? geometry.coordinates.map((p) => p[0])
    : null;
  if (!rings) return null;
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) for (const [lon, lat] of ring) { sx += lon; sy += lat; n++; }
  return n ? { lon: sx / n, lat: sy / n } : null;
}

// Смерчи принято звать местом и годом разом: «Джоплин 2011», «Эль-Рино 2013».
// Без года название не опознать — в Муре смерчи были и в 1999, и в 2013.
function archiveLabel(a) {
  return `${a.name} ${a.date.slice(0, 4)}`;
}

function geometryRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

// ============================================================
// МЕЛКИЕ ЭЛЕМЕНТЫ
// ============================================================

// Слой карты — тот же выбор из двух, что и в настройках, поэтому и вид тот
// же. Цвет слоя переехал с квадратика на сам тумблер: квадратик был легендой,
// и терять её нельзя, а держать рядом и легенду, и переключатель — это два
// значка на одну мысль.
function LayerToggle({ on, onClick, color, label, count, g, busy }) {
  return (
    <button
      onClick={onClick} role="switch" aria-checked={on}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: on ? "rgba(231,238,246,0.09)" : "transparent",
        border: `1px solid ${on ? LINE_HI : LINE}`,
        color: on ? TEXT : DIM,
        fontFamily: SANS, fontSize: 10, letterSpacing: 1, fontWeight: 500,
        padding: "4px 10px 4px 5px", cursor: "pointer", transition: "all .18s ease",
        whiteSpace: "nowrap",
        boxShadow: on ? glowColor(color, g, 0.18) : "none",
      }}
    >
      <SwitchGlyph on={on} accent={color} />
      {label}
      <span style={{ ...NUM, fontSize: 9, color: on ? DIM : FAINT }}>
        {busy ? "…" : count == null ? "" : count}
      </span>
    </button>
  );
}

// Предупреждающий знак. Появляется с EF3 — там, где разрушаются капитальные
// постройки; ниже он был бы декорацией и обесценивал бы сам себя.
// Значок смерча. Крестик, который тут стоял, — это отметка «здесь что-то
// было», и на карте, где рядом лежат зоны предупреждений и области прогноза,
// он читается как мусор. Настоящий значок — воронка: широкая у облака, узкая у
// земли, с вихрем обломков у подошвы. Размер задаётся в пикселях экрана и от
// зума не зависит: значок, растущий вместе с картой, на мировом масштабе
// превращается в пыль, а на подходе закрывает полштата.
function TornadoGlyph({ x, y, s = 11, color, g, motion }) {
  const f = s / 20;
  return (
    <g transform={`translate(${x} ${y}) scale(${f})`}
       style={{ filter: dropGlow(color, g, 0.9) }}>
      {/* Воронка. Кривые, а не прямые: у смерча стенка вогнутая, и прямой
          треугольник читается как ёлка. */}
      <path d="M-9.5 -18 C-10.4 -20.6 10.4 -20.6 9.5 -18
               C6.4 -12.4 4.8 -6.2 2.1 0 L-2.1 0
               C-4.8 -6.2 -6.4 -12.4 -9.5 -18 Z"
            fill={color} fillOpacity="0.26" stroke={color}
            strokeWidth="1.7" strokeLinejoin="round" />
      {/* Пояса конденсации — то, по чему воронку и опознают на видео. */}
      <path d="M-7.9 -14.2 H7.9 M-6.2 -9.6 H6.2 M-4.4 -5 H4.4"
            stroke={color} strokeWidth="0.9" opacity="0.5" />
      {/* Вихрь обломков у земли. Пульсация по ширине читается как вращение:
          кольцо, которое видно с ребра, при повороте меняет ширину. */}
      <g className={motion === "off" ? undefined : "torn-swirl"}>
        <ellipse cx="0" cy="0.8" rx="8.6" ry="2.6" fill="none"
                 stroke={color} strokeWidth="1.4" opacity="0.9" />
        <ellipse cx="0" cy="2" rx="4.6" ry="1.4" fill="none"
                 stroke={color} strokeWidth="1" opacity="0.5" />
      </g>
    </g>
  );
}

// Конус движения. Не стрелка: стрелка обещает точку, а известно только
// направление и скорость на момент последнего обзора радара. Прямоугольник,
// расширяющийся к дальнему концу, говорит правду — чем дальше по времени, тем
// шире разброс. Так это рисуют в профессиональных радарных программах, и
// раскрытие там примерно то же: около двадцати градусов на полчаса вперёд.
function MotionCone({ x0, y0, x1, y1, color, minutes = 30, g }) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (!(len > 1)) return null;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const w0 = 2.4;                        // у смерча — ширина самой воронки
  // Раскрытие ровно по углу, без нижнего порога. Порог тут был, чтобы короткий
  // конус оставался заметным, — и на мелком масштабе делал из него веер шире
  // собственной длины: фигуру, которая обещает разброс в сто с лишним градусов
  // вместо сорока. Пусть лучше конус будет мелким: он мелкий потому, что
  // полчаса хода на этом масштабе — и правда несколько пикселей.
  const w1 = Math.max(w0 + 1.2, len * 0.36);   // ≈ 20° в каждую сторону
  const pt = (d, w) => [x0 + ux * d + nx * w, y0 + uy * d + ny * w];
  const poly = [pt(0, -w0), pt(0, w0), pt(len, w1), pt(len, -w1)]
    .map((c) => c.map((n) => n.toFixed(1)).join(" ")).join(" L");
  // Засечки времени: без них длина конуса ничего не значит. Подписей три только
  // когда конус длинный — на коротком они налезали друг на друга и на название
  // города, и вместо шкалы времени получалась клякса. На коротком остаётся
  // только дальняя: она и есть ответ на вопрос «докуда за полчаса».
  const ks = len > 74 ? [1 / 3, 2 / 3, 1] : [1];
  const marks = ks.map((k) => {
    const w = w0 + (w1 - w0) * k;
    const [ax, ay] = pt(len * k, -w), [bx, by] = pt(len * k, w);
    return { k, ax, ay, bx, by, min: Math.round(minutes * k) };
  });
  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={`M${poly} Z`} fill={color} fillOpacity="0.13"
            stroke={color} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.75" />
      {marks.map((m) => (
        <g key={m.k}>
          <line x1={m.ax} y1={m.ay} x2={m.bx} y2={m.by}
                stroke={color} strokeWidth="0.8" opacity="0.55" />
          {/* Подпись отодвинута наружу вдоль той же нормали, по которой стоит
              засечка, — иначе на конусе, идущем вниз-влево, она ложилась бы
              внутрь заливки и тонула в ней. */}
          <text x={m.bx + nx * 4} y={m.by + ny * 4 + 2.6} fill={color} fontSize="7" fontFamily={SANS}
                textAnchor={nx < -0.3 ? "end" : nx > 0.3 ? "start" : "middle"}
                opacity="0.85" style={{ paintOrder: "stroke", stroke: "#020407", strokeWidth: 2 }}>
            {m.min}′
          </text>
        </g>
      ))}
      <path d={`M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`}
            stroke={color} strokeWidth="1.2" opacity="0.6" strokeDasharray="2 4" />
    </g>
  );
}

function WarnGlyph({ size = 12, color, blink, motion }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}
         className={blink && motion !== "off" ? "warn-blink" : undefined}>
      <path d="M12 2 L23 21 H1 Z" fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 9 V15" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="18.4" r="1.35" fill={color} />
    </svg>
  );
}

function Field({ k, v, g, color }) {
  if (v == null || v === "") return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
      <span style={{ color: DIM, fontFamily: SANS, fontSize: 10.5, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${FAINT}`, transform: "translateY(-3px)" }} />
      <span style={{
        ...NUM, fontSize: 11, color: color || TEXT, textAlign: "right",
        textShadow: glow(g, 0.35), maxWidth: "62%",
      }}>
        {v}
      </span>
    </div>
  );
}

function OutLink({ href, children, g }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
       style={{
         display: "inline-block", border: `1px solid ${LINE}`, padding: "6px 10px",
         color: TEXT, textDecoration: "none", fontFamily: SANS, fontSize: 10,
         letterSpacing: 1, textShadow: glow(g, 0.4), transition: "border-color .18s ease",
       }}>
      {children} ↗
    </a>
  );
}

// ============================================================
// КАРТОЧКА СОБЫТИЯ
// ============================================================
function Detail({ item, g, motion, onClose }) {
  if (!item) return null;

  const isArchive = item.kind === "archive";
  const isAlert = item.kind === "alert";
  const isOutlook = item.kind === "outlook";
  const threat = isArchive ? (item.ef ?? 0)
    : isAlert ? alertThreat(item.props)
    // Уровень прогноза не равен уровню угрозы «сейчас»: это ожидание на день.
    // Поэтому тревожная подача включается только с «повышенного риска».
    : isOutlook ? Math.max(0, (item.props.DN ?? 2) - 2)
    : 1;
  const ef = isArchive && item.ef != null ? efInfo(item.ef) : null;
  const color = ef ? ef.ring : THREAT_COLOR[threat];
  const alarm = threat >= ALARM_FROM;
  const extreme = threat >= 5;

  const title = isArchive ? archiveLabel(item)
    : isAlert ? item.props.event
    : isOutlook ? (item.torn ? "Прогноз смерчей · SPC" : "Прогноз конвекции · SPC")
    : `Донесение о смерче · ${item.time || "время не указано"}`;

  // Поисковые запросы собираются из названия и даты самого события — это
  // единственный честный способ показать эфиры и новости: API, который
  // связывает конкретный смерч с конкретной трансляцией, не существует.
  const query = isArchive ? `${item.name} tornado ${item.date.slice(0, 4)}`
    : isAlert ? `${item.props.event} ${item.props.areaDesc || ""}`.slice(0, 120)
    : isOutlook ? `SPC ${item.props.LABEL || ""} risk severe weather outlook`
    : `tornado ${item.location} ${item.state}`;

  return (
    <div
      className={`detail ${extreme && motion !== "off" ? "detail-extreme" : ""}`}
      style={{
        border: `1px solid ${alarm ? color : LINE}`,
        borderTop: `2px solid ${color}`,
        background: extreme
          ? "linear-gradient(180deg, rgba(107,15,26,0.22), rgba(255,255,255,0.01))"
          : alarm
            ? "linear-gradient(180deg, rgba(249,115,22,0.09), rgba(255,255,255,0.01))"
            : "linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0.008))",
      }}
    >
      {/* Полоса знаков. При высшей категории они мигают вразнобой — это
          единственная анимация в дашборде, которая специально тревожит. */}
      {alarm && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
          borderBottom: `1px solid ${alarm ? color + "55" : LINE}`,
        }}>
          {(extreme ? [0, 1, 2, 3, 4] : [0]).map((i) => (
            <span key={i} style={{ animationDelay: `${i * 0.14}s` }} className={extreme && motion !== "off" ? "warn-blink" : undefined}>
              <WarnGlyph size={13} color={color} motion={motion} />
            </span>
          ))}
          <span style={{
            fontFamily: SANS, fontSize: 9.5, letterSpacing: 2.4, fontWeight: 700,
            color, textShadow: glowColor(color, g, 0.7),
          }}>
            {extreme ? "ОСОБО ОПАСНО" : threat >= 4 ? "ЗНАЧИТЕЛЬНАЯ УГРОЗА" : "ОПАСНО"}
          </span>
        </div>
      )}

      <div style={{ padding: "12px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: SANS, fontSize: 13.5, fontWeight: 600, letterSpacing: 0.4,
              color: TEXT, textShadow: glow(g, 0.6), lineHeight: 1.3,
            }}>
              {title}
            </div>
            <div style={{ color: DIM, fontSize: 10.5, marginTop: 3, fontFamily: SANS }}>
              {isArchive ? `${item.place} · ${item.date.split("-").reverse().join(".")}`
                : isAlert ? (item.props.areaDesc || "").slice(0, 140)
                : isOutlook ? `${item.props.LABEL || "?"} — ${OUTLOOK_RU[item.props.DN] || item.props.LABEL2 || "уровень не назван"}`
                : [item.location, item.county, item.state].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onClose} title="Закрыть" style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            padding: "2px 7px", fontSize: 11, cursor: "pointer", fontFamily: MONO, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Категория крупно — то, ради чего в это окно вообще заходят */}
        {ef && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "13px 0 4px" }}>
            <div style={{
              width: 54, height: 54, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: ef.color, border: `1.5px solid ${ef.ring}`,
              boxShadow: glowColor(ef.ring, g, item.ef >= 4 ? 1.1 : 0.5),
              color: item.ef <= 1 ? "#04070a" : "#fff",
              fontFamily: SANS, fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
            }}>
              {item.scale}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...NUM, fontSize: 12, color: ef.ring, textShadow: glowColor(ef.ring, g, 0.5) }}>
                {ef.wind}
              </div>
              <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.5, marginTop: 3, fontFamily: SANS }}>
                {ef.dmg}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          {isArchive && (
            <>
              <Field k="Погибших" v={item.deaths?.toLocaleString("ru-RU")} g={g}
                     color={item.deaths >= 100 ? color : undefined} />
              <Field k="Пострадавших" v={item.injured?.toLocaleString("ru-RU")} g={g} />
              <Field k="Длина пути" v={item.pathKm ? `${item.pathKm} км` : null} g={g} />
              <Field k="Ширина воронки" v={item.widthM ? `${item.widthM} м` : null} g={g} />
              <Field k="Измеренный ветер" v={item.windKmh ? `${item.windKmh} км/ч` : null} g={g} color={color} />
              <Field k="Координаты" v={`${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`} g={g} />
            </>
          )}

          {isAlert && (() => {
            const p = item.props, par = p.parameters || {};
            const one = (k) => (par[k] || [])[0];
            const DET = { OBSERVED: "подтверждён наблюдателем", RADAR_INDICATED: "обнаружен радаром" };
            const DMG = { CATASTROPHIC: "катастрофические", CONSIDERABLE: "значительные" };
            const fmt = (t) => (t ? new Date(t).toLocaleString("uk-UA") : null);
            return (
              <>
                <Field k="Обнаружение" v={DET[one("tornadoDetection")] || one("tornadoDetection")} g={g} color={color} />
                <Field k="Ожидаемые разрушения" v={DMG[one("tornadoDamageThreat")] || one("tornadoDamageThreat")} g={g} color={color} />
                <Field k="Порыв до" v={one("maxWindGust")} g={g} />
                <Field k="Град до" v={one("maxHailSize") ? `${one("maxHailSize")} дюйма` : null} g={g} />
                <Field k="Срочность" v={p.urgency} g={g} />
                <Field k="Достоверность" v={p.certainty} g={g} />
                <Field k="Опасность" v={p.severity} g={g} />
                <Field k="Выпущено" v={fmt(p.sent)} g={g} />
                <Field k="Действует до" v={fmt(p.expires)} g={g} />
                <Field k="Выпустил" v={p.senderName} g={g} />
                {/* Рейтинга EF тут нет и быть не может — сказать это прямо
                    важнее, чем оставить пустое место, которое читается как недоделка */}
                <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, marginTop: 8 }}>
                  Категории EF у действующего предупреждения нет: её присваивают после наземного
                  обследования разрушений, обычно через день-два. Здесь показан уровень угрозы
                  из самого предупреждения.
                </div>
              </>
            );
          })()}

          {isOutlook && (() => {
            const fmt = (t) => (t ? new Date(t).toLocaleString("uk-UA") : null);
            return (
              <>
                <Field k="Уровень" v={`${item.props.LABEL || "?"} · ${OUTLOOK_RU[item.props.DN] || "—"}`} g={g} color={color} />
                <Field k="Официальное название" v={item.props.LABEL2} g={g} mono={false} />
                <Field k="Действует с" v={fmt(item.props.VALID_ISO)} g={g} />
                <Field k="Действует до" v={fmt(item.props.EXPIRE_ISO)} g={g} />
                <Field k="Выпущен" v={fmt(item.props.ISSUE_ISO)} g={g} />
                <Field k="Синоптик" v={item.props.FORECASTER} g={g} mono={false} />
                <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, marginTop: 8 }}>
                  {item.torn
                    ? "Область, в которой на сегодня ожидаются смерчи. Прогноз, а не наблюдение: он говорит, где условия складываются, а не что смерч есть."
                    : "Область, в которой на сегодня ожидается сильная конвекция — то есть там, где и рождаются суперклетки. Отдельного потока с координатами суперклеток не существует ни у одной службы: суперклетку опознают по доплеровской скорости на конкретном радаре, объектами наружу её никто не отдаёт. Этот прогноз — то, по чему работают и сами шторм-чейзеры."}
                </div>
              </>
            );
          })()}

          {item.kind === "report" && (
            <>
              <Field k="Время (UTC)" v={item.time} g={g} />
              <Field k="Оценка на месте" v={item.fScale || "ещё не оценён"} g={g} />
              <Field k="Координаты" v={`${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`} g={g} />
              <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, marginTop: 8 }}>
                Предварительное донесение за текущие сутки. Часть таких сообщений после проверки
                не подтверждается, а рейтинг появляется только после обследования.
              </div>
            </>
          )}
        </div>

        {(item.note || (isAlert && item.props.description)) && (
          <div style={{
            marginTop: 11, paddingTop: 10, borderTop: `1px solid ${LINE}`,
            color: "rgba(231,238,246,0.8)", fontSize: 11, lineHeight: 1.65, fontFamily: SANS,
            whiteSpace: isAlert ? "pre-wrap" : undefined,
            maxHeight: 260, overflowY: "auto",
          }}>
            {item.note || item.props.description}
          </div>
        )}

        {isAlert && item.props.instruction && (
          <div style={{
            marginTop: 10, padding: "9px 11px", border: `1px solid ${color}55`,
            color: TEXT, fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap",
            maxHeight: 200, overflowY: "auto",
          }}>
            {item.props.instruction}
          </div>
        )}

        {item.comments && (
          <div style={{ marginTop: 11, color: "rgba(231,238,246,0.8)", fontSize: 11, lineHeight: 1.6 }}>
            {item.comments}
          </div>
        )}

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 13 }}>
          <OutLink g={g} href={`https://news.google.com/search?q=${encodeURIComponent(query)}`}>НОВОСТИ</OutLink>
          <OutLink g={g} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query + " storm chaser")}`}>
            ТРАНСЛЯЦИИ
          </OutLink>
          {isAlert && item.props["@id"] && (
            <OutLink g={g} href={item.props["@id"]}>ОФИЦИАЛЬНЫЙ ТЕКСТ</OutLink>
          )}
        </div>
        <div style={{ color: FAINT, fontSize: 9.5, lineHeight: 1.55, marginTop: 8 }}>
          Кнопки открывают поиск по названию и месту события. Встроить сам эфир нельзя:
          API, связывающего конкретный смерч с конкретной трансляцией, не существует —
          подставлять наугад чужое видео под чужую катастрофу нечестно.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// КАРТА
// ============================================================
export default function WorldMap({ g, motion, online, site, showGrid = true, quality = "normal",
                                  pixelRadar = true, pixelCells = true }) {
  // Масштаб 1 — мир во всю ширину холста; по вертикали при этом видно примерно
  // от +62° до −62°, то есть обе смерчевые зоны и все тропические бассейны.
  const [view, setView] = useState({ z: 1, cx: 0.5, cy: 0.5 });
  const [layers, setLayers] = useState({
    // Архив выключен: это справочник прошлых событий, а не то, что происходит
    // сейчас. Включённый по умолчанию, он рассыпал по карте полтора десятка
    // красных точек ещё до того, как придут живые слои, и первое, что видел
    // человек, — катастрофы двадцатилетней давности вперемешку с сегодняшними.
    alerts: true, reports: true, archive: false, radar: true, cities: true, outlook: true,
  });
  // Своё место. Геолокацию браузер отдаёт только защищённым страницам, поэтому
  // на копии со станции (обычный HTTP) синей точки не будет — и это не поломка,
  // а запрет браузера, о котором надо сказать вслух, а не молча ничего не рисовать.
  // Своё место приходит одним из двух путей. Геолокацию браузер отдаёт только
  // защищённым страницам, поэтому на копии со станции (обычный HTTP) остаётся
  // второй путь — касание карты. Он не хуже: точность тут нужна километровая,
  // а не метровая, и человек знает, где он, лучше любого GPS.
  const MANUAL_KEY = "wind_ui_my_place";
  const [me, setMe] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(MANUAL_KEY));
      return raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lon) ? { ...raw, manual: true } : null;
    } catch { return null; }
  });
  const [geoState, setGeoState] = useState("idle"); // idle | busy | denied | off
  const [picking, setPicking] = useState(false);    // ждём касания карты
  const [alerts, setAlerts] = useState(null);
  const [reports, setReports] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: null, at: null });
  const [selected, setSelected] = useState(null);
  const [rv, setRv] = useState(null);                  // {host, path, time} — кадр отражаемости
  const [rvBusy, setRvBusy] = useState(false);
  const [cells, setCells] = useState(null);            // сетка «где сегодня суперклетки»
  const [cellsBusy, setCellsBusy] = useState(false);
  const [cellKey, setCellKey] = useState(null);        // устоявшийся кадр карты

  const svgRef = useRef(null);
  const drag = useRef(null);

  const toScreen = useCallback((lon, lat) => {
    const [ux, uy] = project(lon, lat);
    return [
      (ux - view.cx) * VW * view.z + VW / 2,
      (uy - view.cy) * VW * view.z + VH / 2,
    ];
  }, [view]);

  // ---------- загрузка ----------
  const load = useCallback(async () => {
    if (!online) return;
    setStatus((s) => ({ ...s, busy: true, error: null }));
    // Слои независимы: упавший SPC не должен гасить предупреждения, поэтому
    // allSettled, а не all.
    const [a, r, o, t] = await Promise.allSettled([
      fetch(NWS_URL, { headers: { Accept: "application/geo+json" } }).then((x) => {
        if (!x.ok) throw new Error(`NWS HTTP ${x.status}`);
        return x.json();
      }),
      fetch(SPC_URL).then((x) => {
        if (!x.ok) throw new Error(`SPC HTTP ${x.status}`);
        return x.text();
      }),
      fetch(SPC_OUTLOOK_URL).then((x) => {
        if (!x.ok) throw new Error(`SPC outlook HTTP ${x.status}`);
        return x.json();
      }),
      fetch(SPC_TORN_URL).then((x) => (x.ok ? x.json() : null)),
    ]);

    if (a.status === "fulfilled") {
      setAlerts((a.value.features || []).map((f, i) => ({
        kind: "alert", id: f.id || `a${i}`,
        props: f.properties || {}, geometry: f.geometry,
        center: centroid(f.geometry),
      })));
    }
    if (r.status === "fulfilled") setReports(parseSpc(r.value));

    if (o.status === "fulfilled") {
      const cat = (o.value.features || []).map((f, i) => ({
        kind: "outlook", id: `o${i}`, sort: f.properties?.DN ?? 0,
        props: f.properties || {}, geometry: f.geometry,
        center: centroid(f.geometry), torn: false,
      }));
      const torn = t.status === "fulfilled" && t.value
        ? (t.value.features || []).map((f, i) => ({
            kind: "outlook", id: `t${i}`, sort: 100 + (f.properties?.DN ?? 0),
            props: f.properties || {}, geometry: f.geometry,
            center: centroid(f.geometry), torn: true,
          }))
        : [];
      // Слабые области снизу, сильные сверху — иначе «высокий риск» окажется
      // под «обычными грозами» и потеряется ровно то, ради чего слой есть.
      setOutlook([...cat, ...torn].sort((x, y) => x.sort - y.sort));
    }

    const errs = [a, r, o].filter((x) => x.status === "rejected");
    setStatus({
      busy: false,
      at: new Date(),
      error: errs.length >= 3 ? "Живых слоёв нет — ни один источник не ответил. Скорее всего у этого устройства нет выхода в интернет: так бывает, когда вы подключены к точке самой станции, потому что плата ничего наружу не маршрутизирует. Карта, города и архив работают и без сети."
        : errs.length >= 1 ? "Часть источников не ответила — остальные слои живые."
        : null,
    });
  }, [online]);

  useEffect(() => {
    if (!online) return;
    load();
    // Предупреждения живут минутами, обновлять чаще раза в две минуты бессмысленно
    // и невежливо по отношению к бесплатной государственной службе.
    const id = setInterval(load, 120000);
    return () => clearInterval(id);
  }, [load, online]);

  // ---------- слой отражаемости ----------
  // Тайлы, а не один растр на прямоугольник. Причина простая: слой стал
  // мировым, а мир одним PNG в разумном разрешении не покрыть. Тайлы лежат
  // внутри той же группы, что и контуры суши, поэтому панораму и зум двигает
  // трансформация на GPU, и ни один запрос при этом не уходит — новые тайлы
  // нужны только когда сменилась ступень или пришёл новый кадр.
  useEffect(() => {
    if (!layers.radar || !online) return undefined;
    let alive = true;
    const grab = async () => {
      setRvBusy(true);
      try {
        const j = await (await fetch(RV_INDEX, { cache: "no-store" })).json();
        const past = (j.radar && j.radar.past) || [];
        const last = past[past.length - 1];
        if (alive && last) setRv({ host: j.host, path: last.path, time: last.time * 1000 });
      } catch { /* нет сети — слой просто останется пустым, это видно и так */ }
      if (alive) setRvBusy(false);
    };
    grab();
    // Мозаика пересобирается раз в десять минут — чаще спрашивать нечего.
    const id = setInterval(grab, 300000);
    return () => { alive = false; clearInterval(id); };
  }, [layers.radar, online]);

  // Ступень тайлов. Ступени, а не непрерывный размер: иначе каждый щелчок
  // колеса — новая пачка запросов. Один тайл 512 px на VW/2^z единиц карты,
  // значит при view.z ≈ 2^z / 2 пиксель тайла попадает в пиксель экрана.
  const tileZ = useMemo(() => {
    const bump = quality === "eco" ? -1 : quality === "max" ? 1 : 0;
    const raw = Math.round(Math.log2(Math.max(0.25, view.z * (VW / 512)))) + bump;
    return Math.max(0, Math.min(7, raw));
  }, [view.z, quality]);

  const tiles = useMemo(() => {
    if (!layers.radar || !rv) return [];
    const n = 2 ** tileZ, step = VW / n;
    const halfW = 0.5 / view.z, halfH = ((VH / VW) * 0.5) / view.z;
    const x0 = Math.max(0, Math.floor((view.cx - halfW) * n));
    const x1 = Math.min(n - 1, Math.floor((view.cx + halfW) * n));
    const y0 = Math.max(0, Math.floor((view.cy - halfH) * n));
    const y1 = Math.min(n - 1, Math.floor((view.cy + halfH) * n));
    const out = [];
    // Потолок на всякий случай: ошибка в расчёте кадра не должна превращаться
    // в сотню запросов к чужому серверу.
    for (let x = x0; x <= x1 && out.length < 48; x++) {
      for (let y = y0; y <= y1 && out.length < 48; y++) {
        out.push({
          key: `${rv.path}/${tileZ}/${x}/${y}/${pixelRadar ? "p" : "s"}`,
          x: x * step, y: y * step, s: step,
          href: `${rv.host}${rv.path}/512/${tileZ}/${x}/${y}/${RV_COLOR}/${rvTail(pixelRadar)}`,
        });
      }
    }
    return out;
  }, [layers.radar, rv, tileZ, view, pixelRadar]);

  // ---------- где сегодня рождаются суперклетки ----------
  // Сетка считается по видимому куску карты, а не по всему миру: на весь глобус
  // в разумном числе точек ячейка выходит размером с Европу, и смысла в ней
  // нет. Зато при подходе к region-у сетка сгущается сама, и на масштабе штата
  // ячейка уже около сотни километров — это разрешение самой модели.
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!layers.outlook || !online) return undefined;
    // Карту тянут мышью, и слать запрос на каждый пиксель движения нельзя ни
    // по совести, ни по лимитам бесплатной службы. Считаем по устоявшемуся
    // кадру, огрубляя ключ: мелкое дрожание кадра запроса не стоит.
    const id = setTimeout(() => {
      const v = viewRef.current;
      setCellKey(`${Math.round(Math.log2(v.z) * 2)}|${v.cx.toFixed(2)}|${v.cy.toFixed(2)}`);
    }, 900);
    return () => clearTimeout(id);
  }, [layers.outlook, online, view]);

  useEffect(() => {
    if (!layers.outlook || !online || !cellKey) return undefined;
    const v = viewRef.current;
    const halfW = 0.5 / v.z, halfH = ((VH / VW) * 0.5) / v.z;
    const u0 = Math.max(0, v.cx - halfW), u1 = Math.min(1, v.cx + halfW);
    const v0 = Math.max(0, v.cy - halfH), v1 = Math.min(1, v.cy + halfH);
    const [lonW, latN] = unproject(u0, v0);
    const [lonE, latS] = unproject(u1, v1);
    const dLon = (lonE - lonW) / CELL_COLS, dLat = (latS - latN) / CELL_ROWS;
    const pts = [];
    for (let r = 0; r < CELL_ROWS; r++) {
      for (let c = 0; c < CELL_COLS; c++) {
        pts.push({ lat: latN + dLat * (r + 0.5), lon: lonW + dLon * (c + 0.5) });
      }
    }
    let alive = true;
    (async () => {
      setCellsBusy(true);
      try {
        const q = new URLSearchParams({
          latitude: pts.map((s) => s.lat.toFixed(2)).join(","),
          longitude: pts.map((s) => s.lon.toFixed(2)).join(","),
          hourly: "cape,windspeed_10m,winddirection_10m,windspeed_500hPa,winddirection_500hPa",
          forecast_hours: "1",
          cell_selection: "nearest",
        });
        const j = await (await fetch(`${OM_URL}?${q}`)).json();
        const arr = Array.isArray(j) ? j : [j];
        // Вектор ветра «куда дует»: у метеорологического направления отсчёт
        // «откуда», поэтому +180. Сдвиг — модуль разности векторов, а не
        // разность модулей: два одинаковых по силе, но встречных ветра дают
        // сдвиг вдвое больше каждого из них, и именно он крутит грозу.
        const vec = (spd, dir) => {
          const r = ((dir + 180) * Math.PI) / 180;
          return [spd * Math.sin(r), spd * Math.cos(r)];
        };
        const out = arr.map((o, i) => {
          const h = o && o.hourly;
          if (!h) return null;
          const cape = (h.cape || [])[0];
          const [ax, ay] = vec((h.windspeed_10m || [])[0] || 0, (h.winddirection_10m || [])[0] || 0);
          const [bx, by] = vec((h.windspeed_500hPa || [])[0] || 0, (h.winddirection_500hPa || [])[0] || 0);
          const shear = Math.hypot(bx - ax, by - ay) / 3.6;   // км/ч → м/с
          if (!Number.isFinite(cape)) return null;
          return {
            lat: pts[i].lat, lon: pts[i].lon, cape, shear,
            v: (cape / 1500) * (shear / 20),
          };
        }).filter(Boolean);
        if (alive) setCells({ pts: out, dLon, dLat, at: new Date() });
      } catch { if (alive) setCells(null); }
      if (alive) setCellsBusy(false);
    })();
    return () => { alive = false; };
  }, [cellKey, layers.outlook, online]);

  // ---------- жесты ----------
  // Пересчёт из пикселей события в единицы viewBox: холст тянется по ширине
  // контейнера, поэтому коэффициент считается от реального размера элемента.
  const scaleFactor = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? VW / r.width : 1;
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const f = scaleFactor();
    const dx = (e.clientX - d.x) * f, dy = (e.clientY - d.y) * f;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView((v) => clampView({ ...v, cx: d.cx - dx / (VW * v.z), cy: d.cy - dy / (VW * v.z) }));
  };

  const onPointerUp = () => { drag.current = null; };

  const onWheel = (e) => {
    // Зум к курсору, а не к центру: иначе на любом приближении цель уезжает
    // за край и приходится догонять её перетаскиванием.
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    // Колесо над картой не должно заодно листать страницу. Отменять прокрутку
    // можно только из непассивного слушателя, а React вешает wheel на корень
    // пассивным — поэтому этот обработчик подключается вручную ниже, а не
    // атрибутом onWheel: с атрибутом preventDefault молча ничего не делает, и
    // карта приближается вместе с уезжающим из-под курсора дашбордом.
    e.preventDefault();
    const f = VW / r.width;
    const px = (e.clientX - r.left) * f - VW / 2;
    const py = (e.clientY - r.top) * f - VH / 2;
    setView((v) => {
      const z = Math.max(Z_MIN, Math.min(Z_MAX, v.z * (e.deltaY < 0 ? 1.22 : 1 / 1.22)));
      if (z === v.z) return v;
      return clampView({
        z,
        cx: v.cx + px / (VW * v.z) - px / (VW * z),
        cy: v.cy + py / (VW * v.z) - py / (VW * z),
      });
    });
  };

  // Ссылка на свежий обработчик: слушатель вешается один раз, а замыкание в
  // нём должно быть сегодняшним.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const h = (e) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // Уехать в пустоту нельзя: по вертикали центр держится так, чтобы карта не
  // отрывалась от холста, по горизонтали — то же самое.
  function clampView(v) {
    const halfW = 0.5 / v.z, halfH = (VH / VW) * 0.5 / v.z;
    const cx = halfW >= 0.5 ? 0.5 : Math.max(halfW, Math.min(1 - halfW, v.cx));
    const cy = halfH >= 0.5 ? 0.5 : Math.max(halfH, Math.min(1 - halfH, v.cy));
    return { z: v.z, cx, cy };
  }

  const zoomBy = (m) => setView((v) => clampView({ ...v, z: Math.max(Z_MIN, Math.min(Z_MAX, v.z * m)) }));
  const reset = () => setView({ z: 1, cx: 0.5, cy: 0.5 });
  const flyTo = (lon, lat, z = 14) => {
    const [ux, uy] = project(lon, lat);
    setView(clampView({ z, cx: ux, cy: uy }));
  };

  const pick = (item) => (e) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    setSelected(item);
  };

  // ---------- своё место ----------
  const locate = useCallback((fly) => {
    const ok = typeof navigator !== "undefined" && navigator.geolocation && window.isSecureContext;
    if (!ok) { setGeoState("off"); return; }
    setGeoState("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
        setMe(pos);
        setGeoState("idle");
        if (fly) flyTo(pos.lon, pos.lat, 24);
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
    // flyTo пересоздаётся каждый рендер, но зависит только от setView —
    // держать её в зависимостях значило бы пересоздавать locate вхолостую.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setManual = useCallback((lat, lon) => {
    const pos = { lat, lon, manual: true };
    setMe(pos);
    setPicking(false);
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify({ lat, lon })); } catch { /* приватный режим */ }
  }, []);

  const clearMe = useCallback(() => {
    setMe(null);
    setPicking(false);
    try { localStorage.removeItem(MANUAL_KEY); } catch { /* приватный режим */ }
  }, []);

  // Точку показываем сразу, без нажатия, — но только там, где разрешение уже
  // выдано. Иначе браузер выкинет запрос прав на пустом месте, стоит человеку
  // открыть вкладку, а это худший способ его спросить.
  useEffect(() => {
    if (!window.isSecureContext || !navigator.geolocation || !navigator.permissions) return;
    let alive = true;
    navigator.permissions.query({ name: "geolocation" })
      .then((r) => { if (alive && r.state === "granted") locate(false); })
      .catch(() => { /* Safari до 16 не умеет permissions.query для геолокации */ });
    return () => { alive = false; };
  }, [locate]);

  // ---------- отметки ----------
  const alertNodes = useMemo(() => {
    if (!layers.alerts || !alerts) return null;
    return alerts.filter((a) => a.center).map((a) => {
      const t = alertThreat(a.props);
      const color = THREAT_COLOR[t];
      const torn = a.props.event === "Tornado Warning";
      // Движение известно не всегда, и когда известно — оно указано вместе с
      // точкой самого шторма. Она гораздо ближе к делу, чем центр зоны:
      // зона нарезана по границам округов и её середина может оказаться в
      // сорока километрах от воронки.
      const mot = parseMotion(a.props);
      const at = (mot && mot.at) || a.center;
      const [x, y] = toScreen(at.lon, at.lat);
      if (x < -80 || x > VW + 80 || y < -80 || y > VH + 80) return null;
      const rings = geometryRings(a.geometry);
      let cone = null;
      if (mot && mot.kmh > 1) {
        const [lon2, lat2] = forward(at.lat, at.lon, mot.heading, mot.kmh / 2);  // полчаса хода
        const [x2, y2] = toScreen(lon2, lat2);
        cone = <MotionCone x0={x} y0={y} x1={x2} y1={y2} color={color} minutes={30} g={g} />;
      }
      return (
        <g key={a.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick(a)} style={{ cursor: "pointer" }}>
          {rings.map((ring, i) => (
            <path key={i} d={ring.map((c, j) => (j ? "L" : "M") + toScreen(c[0], c[1]).map((n) => n.toFixed(1)).join(" ")).join("") + "Z"}
                  fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1"
                  style={{ filter: dropGlow(color, g, 0.5) }} />
          ))}
          {cone}
          {t >= ALARM_FROM && motion !== "off" && (
            <circle className="map-ping" cx={x} cy={y} r="5" fill="none" stroke={color} strokeWidth="1" />
          )}
          {torn ? (
            <TornadoGlyph x={x} y={y} s={13} color={color} g={g} motion={motion} />
          ) : (
            <circle cx={x} cy={y} r="4" fill={color} strokeWidth="1" stroke="var(--ui-bg, #04070a)"
                    style={{ filter: dropGlow(color, g, 1) }} />
          )}
        </g>
      );
    });
  }, [layers.alerts, alerts, toScreen, g, motion]);

  // Области прогноза. Цвет обводки — официальный, из самих данных; заливка
  // приглушена до 10%, иначе пастельные цвета SPC съедают всю тёмную карту.
  const outlookNodes = useMemo(() => {
    if (!layers.outlook || !outlook) return null;
    return outlook.map((o) => {
      const stroke = o.props.stroke || "#a3e635";
      const rings = geometryRings(o.geometry);
      if (!rings.length) return null;
      return (
        <g key={o.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick(o)} style={{ cursor: "pointer" }}>
          {rings.map((ring, i) => (
            <path key={i}
                  d={ring.map((c, j) => (j ? "L" : "M") + toScreen(c[0], c[1]).map((n) => n.toFixed(1)).join(" ")).join("") + "Z"}
                  fill={stroke} fillOpacity={o.torn ? 0.16 : 0.10}
                  stroke={stroke} strokeWidth={o.torn ? 1.6 : 1}
                  strokeDasharray={o.torn ? "5 3" : undefined} />
          ))}
        </g>
      );
    });
  }, [layers.outlook, outlook, toScreen]);

  const reportNodes = useMemo(() => {
    if (!layers.reports || !reports) return null;
    return reports.map((r) => {
      const [x, y] = toScreen(r.lon, r.lat);
      if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) return null;
      // Конуса здесь нет и быть не может: в донесениях SPC направления
      // движения нет вовсе — это отметки «смерч наблюдали здесь», собранные
      // после факта. Рисовать им направление значило бы выдумать данные.
      return (
        <g key={r.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick(r)} style={{ cursor: "pointer" }}>
          {/* Прозрачный кружок пошире самой воронки — иначе в неё не попасть
              пальцем: значок узкий, а нажимать по нему надо. */}
          <circle cx={x} cy={y - 5} r="11" fill="transparent" />
          <TornadoGlyph x={x} y={y} s={11} color="#22d3ee" g={g} motion={motion} />
        </g>
      );
    });
  }, [layers.reports, reports, toScreen, g, motion]);

  const archiveNodes = useMemo(() => {
    if (!layers.archive) return null;
    return ARCHIVE_SORTED.map((a) => {
      const [x, y] = toScreen(a.lon, a.lat);
      if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) return null;
      const info = a.ef != null ? efInfo(a.ef) : null;
      const color = info ? info.ring : "#94a3b8";
      const fill = info ? info.color : "#1e293b";
      const alarm = (a.ef ?? 0) >= ALARM_FROM;
      const r = 4 + (a.ef ?? 0) * 0.9;
      return (
        <g key={a.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick({ ...a, kind: "archive" })}
           style={{ cursor: "pointer" }}>
          {a.ef === 5 && motion !== "off" && (
            <circle className="map-ping slow" cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth="1.2" />
          )}
          <circle cx={x} cy={y} r={r} fill={fill} stroke={color} strokeWidth={alarm ? 1.6 : 1}
                  style={{ filter: dropGlow(color, g, alarm ? 1.2 : 0.5) }} />
          {alarm && (
            <path d={`M${x} ${y - r - 8} L${x + 4.5} ${y - r - 1} L${x - 4.5} ${y - r - 1} Z`}
                  fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round"
                  className={a.ef === 5 && motion !== "off" ? "warn-blink" : undefined} />
          )}
        </g>
      );
    });
  }, [layers.archive, toScreen, g, motion]);

  // Пиксельный экран суперклеток. Ячейки рисуются как есть — прямоугольниками
  // сетки модели, без интерполяции: сглаживание красивее, но врёт про
  // разрешение, из которого всё это посчитано. Кому нужна гладкая заливка —
  // тумблер в основных настройках включает размытие поверх тех же ячеек, и это
  // честнее, чем интерполировать значения.
  const cellNodes = useMemo(() => {
    if (!layers.outlook || !cells || !cells.pts.length) return null;
    let cw = 0;
    const rects = cells.pts.map((c, i) => {
      const col = cellColor(c.v);
      if (!col) return null;
      const [ax, ay] = toScreen(c.lon - cells.dLon / 2, c.lat - cells.dLat / 2);
      const [bx, by] = toScreen(c.lon + cells.dLon / 2, c.lat + cells.dLat / 2);
      const x = Math.min(ax, bx), y = Math.min(ay, by);
      const w = Math.abs(bx - ax), h = Math.abs(by - ay);
      if (x > VW || y > VH || x + w < 0 || y + h < 0) return null;
      cw = Math.max(cw, w);
      return (
        <rect key={i} x={x} y={y} width={w + 0.5} height={h + 0.5} fill={col}
              opacity={Math.min(0.34, 0.11 + c.v * 0.07)}
              shapeRendering={pixelCells ? "crispEdges" : "auto"} />
      );
    });
    if (!rects.some(Boolean)) return null;
    const blur = Math.max(2, cw * 0.42);
    return (
      <g style={{ pointerEvents: "none" }}>
        {!pixelCells && (
          <defs>
            <filter id="cellsoft" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation={blur.toFixed(1)} />
            </filter>
          </defs>
        )}
        <g filter={pixelCells ? undefined : "url(#cellsoft)"}>{rects}</g>
      </g>
    );
  }, [layers.outlook, cells, toScreen, pixelCells]);

  // Города — самый тихий слой: точка в один пиксель и подпись. Ни рамок,
  // ни выносок: чем их больше, тем быстрее карта перестаёт быть картой.
  const cityNodes = useMemo(() => {
    if (!layers.cities) return null;
    return visibleCities(view.z).map((c) => {
      const [x, y] = toScreen(c.lon, c.lat);
      if (x < 4 || x > VW - 4 || y < 8 || y > VH - 4) return null;
      return (
        <g key={c.name} style={{ pointerEvents: "none" }}>
          <circle cx={x} cy={y} r="1.6" fill={DIM} />
          <text x={x + 4.5} y={y + 3} fill={DIM} fontSize="8.5" fontFamily={SANS}
                style={{ paintOrder: "stroke", stroke: "#020407", strokeWidth: 2.4, strokeLinejoin: "round" }}>
            {c.name}
          </text>
        </g>
      );
    });
  }, [layers.cities, view.z, toScreen]);

  // Сама станция. Координаты приходят из secrets.h через /api/site, поэтому её
  // положение известно точно и никакой геолокации для этого не нужно — что важно
  // именно на копии, отданной платой по HTTP.
  const siteNode = useMemo(() => {
    if (!site || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) return null;
    // 0/0 в secrets.h означает «не настроено», а не точку в Гвинейском заливе.
    if (site.lat === 0 && site.lon === 0) return null;
    const [x, y] = toScreen(site.lon, site.lat);
    if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) return null;
    return (
      <g style={{ pointerEvents: "none" }}>
        <path d={`M${x} ${y - 11} L${x} ${y}`} stroke={TEXT} strokeWidth="1" opacity="0.6" />
        <path d={`M${x} ${y - 11} l7 3 -7 3 z`} fill={TEXT} opacity="0.85" />
        <circle cx={x} cy={y} r="2.6" stroke={TEXT} strokeWidth="1.4" fill="var(--ui-bg, #04070a)"
                style={{ filter: dropGlow("rgba(231,238,246,0.8)", g, 0.8) }} />
        <text x={x + 7} y={y + 3.5} fill={TEXT} fontSize="8" fontFamily={SANS} opacity="0.8"
              style={{ paintOrder: "stroke", stroke: "#020407", strokeWidth: 2.4, strokeLinejoin: "round" }}>
          станция
        </text>
      </g>
    );
  }, [site, toScreen, g]);

  // Своё место — синяя точка с ореолом точности, как принято во всех картах.
  const meNode = useMemo(() => {
    if (!me) return null;
    const [x, y] = toScreen(me.lon, me.lat);
    if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) return null;
    return (
      <g style={{ pointerEvents: "none" }}>
        {motion !== "off" && (
          <circle className="map-ping slow" cx={x} cy={y} r="6" fill="none" stroke="#3b82f6" strokeWidth="1.2" />
        )}
        <circle cx={x} cy={y} r="9" fill="#3b82f6" opacity="0.16" />
        <circle cx={x} cy={y} r="4.5" fill="#3b82f6" stroke="#dbeafe" strokeWidth="1.4"
                style={{ filter: dropGlow("#3b82f6", g, 1.3) }} />
      </g>
    );
  }, [me, toScreen, g, motion]);

  const landTransform = `translate(${VW / 2 - view.cx * VW * view.z} ${VH / 2 - view.cy * VW * view.z}) scale(${view.z})`;
  const counts = {
    alerts: alerts ? alerts.length : null,
    reports: reports ? reports.length : null,
    archive: ARCHIVE_SORTED.length,
  };
  const noGeom = alerts ? alerts.filter((a) => !a.center).length : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Своя анимация — здесь, а не в общем <style> дашборда: карта грузится
          отдельным куском, и её правила не должны ехать на каждую страницу. */}
      <style>{`
        /* Вихрь обломков у подошвы воронки. Кольцо, которое видно с ребра,
           при вращении меняет ширину — этого хватает, чтобы значок читался
           как крутящийся, и это дешевле любого поворота. */
        @keyframes tornSwirl { 0%, 100% { transform: scaleX(1) } 50% { transform: scaleX(.52) } }
        .torn-swirl { animation: tornSwirl 2.6s ease-in-out infinite;
                      transform-box: fill-box; transform-origin: 50% 50% }
        .mo-off .torn-swirl { animation: none }
        .mo-calm .torn-swirl { animation-duration: 5s }
      `}</style>
      {/* Панель слоёв */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <LayerToggle g={g} on={layers.alerts} color="#ef4444" label="ПРЕДУПРЕЖДЕНИЯ" count={counts.alerts}
                     busy={status.busy} onClick={() => setLayers((l) => ({ ...l, alerts: !l.alerts }))} />
        <LayerToggle g={g} on={layers.reports} color="#22d3ee" label="СМЕРЧИ СЕГОДНЯ" count={counts.reports}
                     busy={status.busy} onClick={() => setLayers((l) => ({ ...l, reports: !l.reports }))} />
        <LayerToggle g={g} on={layers.outlook} color="#facc15" label="СУПЕРКЛЕТКИ"
                     count={cells ? cells.pts.filter((c) => cellColor(c.v)).length
                                  : (outlook ? outlook.length : null)}
                     busy={status.busy || cellsBusy}
                     onClick={() => setLayers((l) => ({ ...l, outlook: !l.outlook }))} />
        <LayerToggle g={g} on={layers.archive} color="#b91c1c" label="АРХИВ EF" count={counts.archive}
                     onClick={() => setLayers((l) => ({ ...l, archive: !l.archive }))} />
        <LayerToggle g={g} on={layers.radar} color="#a3e635" label="ОТРАЖАЕМОСТЬ"
                     busy={layers.radar && (rvBusy || !rv)}
                     count={layers.radar && rv ? `z${tileZ}` : null}
                     onClick={() => setLayers((l) => ({ ...l, radar: !l.radar }))} />
        <LayerToggle g={g} on={layers.cities} color="#94a3b8" label="ГОРОДА"
                     onClick={() => setLayers((l) => ({ ...l, cities: !l.cities }))} />
        <LayerToggle g={g} on={!!me} color="#3b82f6"
                     label={geoState === "busy" ? "ИЩУ…" : me ? (me.manual ? "Я ЗДЕСЬ ·" : "Я ЗДЕСЬ") : "Я ЗДЕСЬ"}
                     onClick={() => (me ? flyTo(me.lon, me.lat, 24) : locate(true))} />
        {/* Ручная отметка — единственный способ показать себя на карте там, где
            браузер не отдаёт координаты. Точность тут нужна километровая, и
            человек знает, где он, лучше любого GPS. */}
        <button
          onClick={() => setPicking((v) => !v)}
          style={{
            background: picking ? "rgba(59,130,246,0.18)" : "transparent",
            border: `1px solid ${picking ? "#3b82f6" : LINE}`,
            color: picking ? TEXT : DIM,
            fontFamily: SANS, fontSize: 10, letterSpacing: 1,
            padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {picking ? "ТКНИ В КАРТУ" : "УКАЗАТЬ ВРУЧНУЮ"}
        </button>
        {me && (
          <button onClick={clearMe} title="Убрать свою отметку" style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            fontFamily: MONO, fontSize: 11, padding: "4px 8px", cursor: "pointer",
          }}>✕</button>
        )}
        {site && site.lat !== 0 && (
          <button onClick={() => flyTo(site.lon, site.lat, 26)} style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            fontFamily: SANS, fontSize: 10, letterSpacing: 1,
            padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
          }}>К СТАНЦИИ</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ ...NUM, fontSize: 9, color: FAINT, whiteSpace: "nowrap" }}>
          ×{view.z < 10 ? view.z.toFixed(1) : Math.round(view.z)}
        </span>
        {[["−", 1 / 1.6], ["+", 1.6]].map(([t, m]) => (
          <button key={t} onClick={() => zoomBy(m)} style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            width: 26, height: 24, cursor: "pointer", fontFamily: MONO, fontSize: 13,
          }}>{t}</button>
        ))}
        <button onClick={reset} style={{
          background: "transparent", border: `1px solid ${LINE}`, color: DIM,
          padding: "4px 9px", cursor: "pointer", fontFamily: SANS, fontSize: 9.5, letterSpacing: 1,
        }}>ВЕСЬ МИР</button>
      </div>

      {/* Холст */}
      <div style={{ position: "relative", border: `1px solid ${LINE}`, background: "#020407" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          style={{ display: "block", touchAction: "none", cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => {
            if (drag.current?.moved) return;
            if (picking) {
              // Пересчёт из пикселей события в единичные координаты: холст тянется
              // по ширине контейнера, поэтому коэффициент берётся от реального размера.
              const r = svgRef.current?.getBoundingClientRect();
              if (!r) return;
              const f = VW / r.width;
              const sx = (e.clientX - r.left) * f;
              const sy = (e.clientY - r.top) * f;
              const ux = (sx - VW / 2) / (VW * view.z) + view.cx;
              const uy = (sy - VH / 2) / (VW * view.z) + view.cy;
              const [lon, lat] = unproject(ux, uy);
              setManual(lat, lon);
              return;
            }
            setSelected(null);
          }}
        >

          {/* Сетка параллелей и меридианов — через 30°, как на любом бланке */}
          <g style={{ pointerEvents: "none", display: showGrid ? undefined : "none" }}>
            {[-60, -30, 0, 30, 60].map((lat) => {
              const y = toScreen(0, lat)[1];
              if (y < 0 || y > VH) return null;
              return <line key={`p${lat}`} x1="0" y1={y} x2={VW} y2={y} stroke={LINE}
                           strokeWidth={lat === 0 ? 0.8 : 0.5} strokeDasharray={lat === 0 ? undefined : "2 5"} />;
            })}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => {
              const x = toScreen(lon, 0)[0];
              if (x < 0 || x > VW) return null;
              return <line key={`m${lon}`} x1={x} y1="0" x2={x} y2={VH} stroke={LINE}
                           strokeWidth={lon === 0 ? 0.8 : 0.5} strokeDasharray={lon === 0 ? undefined : "2 5"} />;
            })}
          </g>

          <g transform={landTransform} style={{ pointerEvents: "none" }}>
            {/* Отражаемость под контурами и внутри той же трансформации: берег
                остаётся читаемым, а панорама и зум двигают растр на GPU без запросов. */}
            {layers.radar && tiles.map((tl) => (
              <image key={tl.key} href={tl.href}
                     x={tl.x} y={tl.y} width={tl.s} height={tl.s}
                     preserveAspectRatio="none"
                     className={motion === "off" ? undefined : "radar-fade"}
                     style={{ opacity: 0.8, imageRendering: pixelRadar ? "pixelated" : "auto" }} />
            ))}
            {LAND_PATHS.map((d, i) => (
              <path key={i} d={d} fill="rgba(231,238,246,0.045)" stroke={LINE_HI}
                    strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </g>

          {cellNodes}
          {outlookNodes}
          {cityNodes}
          {alertNodes}
          {reportNodes}
          {archiveNodes}
          {siteNode}
          {meNode}
        </svg>

        {/* Состояние загрузки поверх холста, чтобы не двигать вёрстку */}
        {(!online || status.error || status.busy) && (
          <div style={{
            position: "absolute", left: 10, bottom: 10, maxWidth: "min(420px, 70%)",
            border: `1px solid ${LINE}`, background: "rgba(4,7,10,0.9)",
            padding: "8px 11px", fontFamily: SANS, fontSize: 10.5, lineHeight: 1.55,
            color: online ? DIM : "rgba(231,238,246,0.75)",
          }}>
            {status.busy ? "Запрашиваю службу погоды…" : status.error}
          </div>
        )}
      </div>

      {/* Легенда EF */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {EF_SCALE.map((e) => (
          <span key={e.key} style={{
            display: "flex", alignItems: "center", gap: 5,
            border: `1px solid ${LINE}`, padding: "3px 7px",
          }}>
            <span style={{ width: 10, height: 10, background: e.color, border: `1px solid ${e.ring}` }} />
            <span style={{ ...NUM, fontSize: 9.5, color: DIM }}>{e.key}</span>
            {e.ef >= ALARM_FROM && <WarnGlyph size={9} color={e.ring} motion="off" />}
          </span>
        ))}
        <span style={{ fontFamily: SANS, fontSize: 9.5, color: FAINT, marginLeft: 4 }}>
          цвет — по обследованной категории
        </span>
      </div>

      {/* Шкала суперклеточного экрана. Без неё цветные квадраты — просто
          раскраска: непонятно, что тёмно-красный хуже жёлтого. */}
      {layers.outlook && cells && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {CELL_RAMP.map((s) => (
            <span key={s.at} style={{
              display: "flex", alignItems: "center", gap: 5,
              border: `1px solid ${LINE}`, padding: "3px 7px",
            }}>
              <span style={{ width: 10, height: 10, background: s.color, opacity: 0.75 }} />
              <span style={{ fontFamily: SANS, fontSize: 9.5, color: DIM }}>{s.label}</span>
            </span>
          ))}
          <span style={{ fontFamily: SANS, fontSize: 9.5, color: FAINT, marginLeft: 4 }}>
            энергия × сдвиг ветра, ячейка — узел модели
          </span>
        </div>
      )}

      {/* Карточка выбранного события */}
      {selected && <Detail item={selected} g={g} motion={motion} onClose={() => setSelected(null)} />}

      {/* Список архива: не всё находится тычком по мелкой точке на мировом масштабе */}
      {!selected && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ARCHIVE_SORTED.slice().reverse().map((a) => {
            const info = a.ef != null ? efInfo(a.ef) : null;
            const color = info ? info.ring : DIM;
            return (
              <button key={a.id}
                      onClick={() => { setSelected({ ...a, kind: "archive" }); flyTo(a.lon, a.lat, 10); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "transparent", border: `1px solid ${LINE}`,
                        borderLeft: `2px solid ${color}`,
                        color: DIM, fontFamily: SANS, fontSize: 10, padding: "4px 9px",
                        cursor: "pointer", transition: "color .18s ease, border-color .18s ease",
                      }}>
                <span style={{ ...NUM, color, fontSize: 9.5 }}>{a.scale}</span>
                {archiveLabel(a)}
              </button>
            );
          })}
        </div>
      )}

      {/* Происхождение данных — на виду, а не в подвале */}
      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.65, fontFamily: SANS }}>
        Предупреждения и донесения о смерчах — служба погоды США:{" "}
        <b style={{ color: DIM }}>api.weather.gov</b> и <b style={{ color: DIM }}>SPC</b>; они
        покрывают только США, потому что открытых потоков по смерчам за её пределами,
        доступных браузеру напрямую, не существует. Конус движения рисуется там, где
        служба сама указала направление и скорость шторма, — у донесений его нет,
        и выдумывать направление для них нельзя. Отражаемость — мировая мозаика{" "}
        <b style={{ color: DIM }}>RainViewer</b>: сводка национальных радарных сетей,
        от NEXRAD до европейской OPERA. Суперклеточный экран считается из энергии
        неустойчивости и сдвига ветра модели <b style={{ color: DIM }}>Open-Meteo</b> и
        показывает сочетание, из которого рождаются суперклетки; это не прогноз службы,
        а расчёт по двум величинам, и над США поверх него лежат настоящие области SPC.
        {noGeom > 0 && ` Ещё ${noGeom} предупреждений заданы зонами без контура — на карту они не попали.`}
        {" "}Архив — обследованные события по записям NWS и NCEI, по умолчанию выключен.
        {status.at && ` Обновлено в ${status.at.toLocaleTimeString("uk-UA")}.`}
        {geoState === "off" && " Своё место показать нельзя: браузер отдаёт координаты только защищённым страницам, а эта копия открыта по обычному HTTP."}
        {geoState === "denied" && " Доступ к геоданным закрыт — вернуть его можно только в настройках сайта в браузере, но своё место всегда можно поставить вручную."}
        {me && me.manual && " Ваша отметка поставлена вручную и хранится только в этом браузере."}
        {picking && " Ткните в карту — там и будет ваша отметка."}
      </div>
    </div>
  );
}
