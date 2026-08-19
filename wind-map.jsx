import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
const WMS_BASE = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows";
// Слой отражаемости покрывает только материковые США. Прямоугольник фиксирован
// намеренно: запрашивать растр по текущему кадру экрана значит на мировом
// масштабе тянуть глобус, из которого почти всё придёт прозрачным.
const CONUS = { west: -127.5, east: -64.0, south: 21.0, north: 51.5 };

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

function LayerToggle({ on, onClick, color, label, count, g, busy }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 7,
        background: on ? "rgba(231,238,246,0.09)" : "transparent",
        border: `1px solid ${on ? LINE_HI : LINE}`,
        color: on ? TEXT : DIM,
        fontFamily: SANS, fontSize: 10, letterSpacing: 1, fontWeight: 500,
        padding: "5px 10px", cursor: "pointer", transition: "all .18s ease",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{
        width: 8, height: 8, flexShrink: 0,
        background: on ? color : "transparent",
        border: `1px solid ${on ? color : LINE_HI}`,
        boxShadow: on ? glowColor(color, g, 0.4) : "none",
      }} />
      {label}
      <span style={{ ...NUM, fontSize: 9, color: on ? DIM : FAINT }}>
        {busy ? "…" : count == null ? "" : count}
      </span>
    </button>
  );
}

// Предупреждающий знак. Появляется с EF3 — там, где разрушаются капитальные
// постройки; ниже он был бы декорацией и обесценивал бы сам себя.
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
export default function WorldMap({ g, motion, online, site, showGrid = true, quality = "normal" }) {
  // Масштаб 1 — мир во всю ширину холста; по вертикали при этом видно примерно
  // от +62° до −62°, то есть обе смерчевые зоны и все тропические бассейны.
  const [view, setView] = useState({ z: 1, cx: 0.5, cy: 0.5 });
  const [layers, setLayers] = useState({
    alerts: true, reports: true, archive: true, radar: false, cities: true, outlook: true,
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
  const [radarUrl, setRadarUrl] = useState(null);      // что запрошено
  const [radarReady, setRadarReady] = useState(null);  // что уже догружено и можно показывать
  const [radarNonce, setRadarNonce] = useState(0);

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
  // Переписан после жалобы на тормоза, и причина была архитектурная, а не в сети.
  //
  // Как было: растр запрашивался на текущий кадр экрана, то есть на **каждое**
  // движение карты уходил новый GetMap на 900 px. Отсюда всё сразу: пауза после
  // каждого перетаскивания, мигание на подмене картинки, и — самое обидное — на
  // мировом масштабе запрашивался кадр во весь глобус, из которого 95% приходило
  // прозрачными: слой покрывает только материковые США.
  //
  // Как стало: растр запрашивается **один раз на фиксированный прямоугольник
  // CONUS** и лежит внутри той же группы, что и контуры суши. Значит панорама и
  // зум двигают его трансформацией на GPU — ни одного запроса. Новый кадр нужен
  // только когда сменилась ступень детализации или прошли четыре минуты.
  // Картинка перед показом догружается в память и подменяется уже готовой, с
  // перекрёстным затуханием — поэтому пустых мест больше не мелькает.
  const conusRect = useMemo(() => {
    const [x0, y0] = project(CONUS.west, CONUS.north);
    const [x1, y1] = project(CONUS.east, CONUS.south);
    return { x: x0 * VW, y: y0 * VW, w: (x1 - x0) * VW, h: (y1 - y0) * VW };
  }, []);

  // Ступени, а не плавный размер: иначе каждый щелчок колеса — новый запрос.
  const radarStep = layers.radar
    ? (view.z < 2 ? 0 : view.z < 6 ? 1 : view.z < 16 ? 2 : 3)
    : -1;

  useEffect(() => {
    if (!layers.radar || !online) { setRadarUrl(null); setRadarReady(null); return; }
    const ladder = quality === "eco" ? [512, 768, 1024, 1280]
      : quality === "max" ? [1024, 1792, 2304, 3072]
      : [768, 1280, 1792, 2304];
    const px = ladder[radarStep] || 1024;
    const p = new URLSearchParams({
      service: "WMS", version: "1.1.1", request: "GetMap",
      layers: "conus_bref_qcd", srs: "EPSG:3857",
      bbox: [toMercX(project(CONUS.west, 0)[0]), toMercY(project(0, CONUS.south)[1]),
             toMercX(project(CONUS.east, 0)[0]), toMercY(project(0, CONUS.north)[1])].join(","),
      width: String(px),
      height: String(Math.max(1, Math.round((px * conusRect.h) / conusRect.w))),
      format: "image/png", transparent: "true",
      stamp: String(radarNonce),
    });
    const url = `${WMS_BASE}?${p}`;

    // Догружаем в память и только потом показываем: <image> с меняющимся href
    // рисует пустоту всё время загрузки, и именно это выглядело как «плохо работает».
    let alive = true;
    setRadarUrl(url);
    const img = new Image();
    img.onload = () => { if (alive) setRadarReady(url); };
    img.onerror = () => { if (alive) setRadarReady(null); };
    img.src = url;
    return () => { alive = false; img.onload = img.onerror = null; };
  }, [layers.radar, online, radarStep, radarNonce, conusRect, quality]);

  useEffect(() => {
    if (!layers.radar) return;
    // Продукт на сервере обновляется раз в несколько минут — чаще спрашивать
    // бессмысленно и невежливо по отношению к бесплатной государственной службе.
    const id = setInterval(() => setRadarNonce((n) => n + 1), 240000);
    return () => clearInterval(id);
  }, [layers.radar]);

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
      const [x, y] = toScreen(a.center.lon, a.center.lat);
      if (x < -60 || x > VW + 60 || y < -60 || y > VH + 60) return null;
      const rings = geometryRings(a.geometry);
      return (
        <g key={a.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick(a)} style={{ cursor: "pointer" }}>
          {rings.map((ring, i) => (
            <path key={i} d={ring.map((c, j) => (j ? "L" : "M") + toScreen(c[0], c[1]).map((n) => n.toFixed(1)).join(" ")).join("") + "Z"}
                  fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1"
                  style={{ filter: dropGlow(color, g, 0.5) }} />
          ))}
          {t >= ALARM_FROM && motion !== "off" && (
            <circle className="map-ping" cx={x} cy={y} r="5" fill="none" stroke={color} strokeWidth="1" />
          )}
          <circle cx={x} cy={y} r="4" fill={color} strokeWidth="1" stroke="var(--ui-bg, #04070a)"
                  style={{ filter: dropGlow(color, g, 1) }} />
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
      return (
        <g key={r.id} onPointerDown={(e) => e.stopPropagation()} onClick={pick(r)} style={{ cursor: "pointer" }}>
          <path d={`M${x - 4} ${y - 4}L${x + 4} ${y + 4}M${x + 4} ${y - 4}L${x - 4} ${y + 4}`}
                stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round"
                style={{ filter: dropGlow("#22d3ee", g, 0.8) }} />
        </g>
      );
    });
  }, [layers.reports, reports, toScreen, g]);

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
      {/* Панель слоёв */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <LayerToggle g={g} on={layers.alerts} color="#ef4444" label="ПРЕДУПРЕЖДЕНИЯ" count={counts.alerts}
                     busy={status.busy} onClick={() => setLayers((l) => ({ ...l, alerts: !l.alerts }))} />
        <LayerToggle g={g} on={layers.reports} color="#22d3ee" label="СМЕРЧИ СЕГОДНЯ" count={counts.reports}
                     busy={status.busy} onClick={() => setLayers((l) => ({ ...l, reports: !l.reports }))} />
        <LayerToggle g={g} on={layers.outlook} color="#facc15" label="СУПЕРКЛЕТКИ"
                     count={outlook ? outlook.length : null} busy={status.busy}
                     onClick={() => setLayers((l) => ({ ...l, outlook: !l.outlook }))} />
        <LayerToggle g={g} on={layers.archive} color="#b91c1c" label="АРХИВ EF" count={counts.archive}
                     onClick={() => setLayers((l) => ({ ...l, archive: !l.archive }))} />
        <LayerToggle g={g} on={layers.radar} color="#a3e635" label="ОТРАЖАЕМОСТЬ"
                     busy={layers.radar && !!radarUrl && !radarReady}
                     count={layers.radar ? (radarReady ? "×" + [1, 2, 3, 4][radarStep] : null) : null}
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
          onWheel={onWheel}
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
            {layers.radar && radarReady && (
              <image key={radarReady} href={radarReady}
                     x={conusRect.x} y={conusRect.y} width={conusRect.w} height={conusRect.h}
                     preserveAspectRatio="none"
                     className={motion === "off" ? undefined : "radar-fade"}
                     style={{ opacity: 0.78, imageRendering: "auto" }} />
            )}
            {LAND_PATHS.map((d, i) => (
              <path key={i} d={d} fill="rgba(231,238,246,0.045)" stroke={LINE_HI}
                    strokeWidth="0.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </g>

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
        Живые слои — служба погоды США: предупреждения <b style={{ color: DIM }}>api.weather.gov</b>,
        донесения о смерчах <b style={{ color: DIM }}>SPC</b>, отражаемость{" "}
        <b style={{ color: DIM }}>NOAA nowCOAST</b> (только материковые США).
        {noGeom > 0 && ` Ещё ${noGeom} предупреждений заданы зонами без контура — на карту они не попали.`}
        {" "}За пределами США живых слоёв нет: открытых бесплатных потоков по смерчам и циклонам,
        доступных браузеру напрямую, не существует, а рисовать выдуманные значки нельзя.
        Архив — обследованные события по записям NWS и NCEI.
        {status.at && ` Обновлено в ${status.at.toLocaleTimeString("uk-UA")}.`}
        {geoState === "off" && " Своё место показать нельзя: браузер отдаёт координаты только защищённым страницам, а эта копия открыта по обычному HTTP."}
        {geoState === "denied" && " Доступ к геоданным закрыт — вернуть его можно только в настройках сайта в браузере, но своё место всегда можно поставить вручную."}
        {me && me.manual && " Ваша отметка поставлена вручную и хранится только в этом браузере."}
        {picking && " Ткните в карту — там и будет ваша отметка."}
      </div>
    </div>
  );
}
