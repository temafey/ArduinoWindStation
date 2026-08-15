import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// Прошивка раздаёт этот дашборд сама (gzip из PROGMEM на порту 80). Если страница
// открыта со станции — API живёт на том же хосте, настройка не нужна и localStorage
// игнорируется (станция точно по этому адресу, раз страница пришла с неё). Порт 80
// отличает станцию от vite dev (5173/5174), открытого с другого устройства по IP ноутбука.
const SERVED_FROM_STATION =
  window.location.protocol === "http:" &&
  (window.location.port === "" || window.location.port === "80") &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname);

// Имя станции, а не IP: его резолвит DNS-сервер на самой плате, поэтому оно
// одинаково работает на всех клиентах точки доступа, включая Android.
const DEFAULT_HOST = SERVED_FROM_STATION ? window.location.host : "MyWindProbeBETA.org";

// Публичная копия на внешнем хостинге. Признак — HTTPS: сама станция слушает
// только HTTP на 192.168.4.1, и подняться на 443 ей нечем.
//
// Живых данных здесь не может быть в принципе, и это не недоделка, а два
// независимых запрета: браузер блокирует запрос с HTTPS-страницы на http://
// (mixed content), а сама плата сидит в изолированной точке доступа без выхода
// в интернет и снаружи не адресуема. Поэтому публичная копия честно объявляет
// себя демонстрацией, а не молча висит с надписью OFFLINE.
const PUBLIC_COPY = window.location.protocol === "https:";

const APP_VERSION = "BETA";

// ============================================================
// ЕДИНИЦЫ СКОРОСТИ
// ============================================================
// Прошивка всегда отдаёт м/с — пересчёт целиком на стороне UI, чтобы смена
// единиц не требовала ни перезаливки платы, ни round-trip к ней.
const UNITS = {
  ms:   { label: "м/с",    short: "м/с",    factor: 1,        digits: 1 },
  kmh:  { label: "км/ч",   short: "км/ч",   factor: 3.6,      digits: 0 },
  mph:  { label: "миль/ч", short: "mph",    factor: 2.236936, digits: 0 },
  kt:   { label: "узлы",   short: "kt",     factor: 1.943844, digits: 0 },
  fts:  { label: "фут/с",  short: "ft/s",   factor: 3.280840, digits: 0 },
  bft:  { label: "Бофорт", short: "бфт",    factor: null,     digits: 0 },
};
const UNIT_KEYS = Object.keys(UNITS);

// Beaufort — не линейный пересчёт, а таблица порогов, поэтому вынесен отдельно.
const BEAUFORT = [
  { max: 0.5,  scale: 0,  desc: "Штиль",          color: "#94a3b8" },
  { max: 1.6,  scale: 1,  desc: "Тихий",          color: "#67e8f9" },
  { max: 3.4,  scale: 2,  desc: "Лёгкий",         color: "#22d3ee" },
  { max: 5.5,  scale: 3,  desc: "Слабый",         color: "#34d399" },
  { max: 8.0,  scale: 4,  desc: "Умеренный",      color: "#4ade80" },
  { max: 10.8, scale: 5,  desc: "Свежий",         color: "#a3e635" },
  { max: 13.9, scale: 6,  desc: "Сильный",        color: "#facc15" },
  { max: 17.2, scale: 7,  desc: "Крепкий",        color: "#fb923c" },
  { max: 20.8, scale: 8,  desc: "Очень крепкий",  color: "#f97316" },
  { max: 24.5, scale: 9,  desc: "Шторм",          color: "#ef4444" },
  { max: 28.5, scale: 10, desc: "Сильный шторм",  color: "#dc2626" },
  { max: 32.7, scale: 11, desc: "Жёсткий шторм",  color: "#b91c1c" },
  { max: Infinity, scale: 12, desc: "Ураган",     color: "#7f1d1d" },
];

function beaufort(speedMs) {
  for (const b of BEAUFORT) if (speedMs < b.max) return b;
  return BEAUFORT[BEAUFORT.length - 1];
}

// Возвращает уже отформатированную строку: у Бофорта своя логика (целое число
// баллов), у остальных — множитель и заданная точность.
function convertSpeed(speedMs, unitKey, digitsOverride) {
  const u = UNITS[unitKey] ?? UNITS.ms;
  if (u.factor === null) return String(beaufort(speedMs).scale);
  const digits = digitsOverride == null ? u.digits : digitsOverride;
  return (speedMs * u.factor).toFixed(digits);
}

// ============================================================
// КАТАЛОГ СТАНЦИЙ
// ============================================================
// Публичного каталога метеостанций не существует: станция автономна, сидит в
// собственной точке доступа без выхода в интернет и никуда о себе не сообщает.
// Поэтому «ближайшая станция» ищется среди тех, что пользователь сам сохранил
// в этом браузере. Геолокация тут не украшение: она честно выбирает ближайшую
// из своих, а когда сохранять нечего — так и говорит, вместо того чтобы
// показывать выдуманные показания под видом соседской станции.
const STATIONS_KEY = "wind_ui_stations";
const WELCOMED_KEY = "wind_ui_welcomed";

function loadStations() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATIONS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistStations(list) {
  try { localStorage.setItem(STATIONS_KEY, JSON.stringify(list)); } catch { /* приватный режим */ }
}

// Расстояние по большому кругу. Нужна не точность, а порядок сортировки,
// поэтому Земля считается шаром и никаких поправок на эллипсоид нет.
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  if (km < 10) return `${km.toFixed(1)} км`;
  return `${Math.round(km)} км`;
}

// Геолокация требует защищённого контекста: по обычному HTTP браузеры её не дают
// (исключение — localhost). Копия на плате как раз отдаётся по HTTP, поэтому там
// поиск ближайшей невозможен — но там он и не нужен, вы уже на станции.
const GEO_AVAILABLE =
  typeof navigator !== "undefined" && !!navigator.geolocation && window.isSecureContext;

function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!GEO_AVAILABLE) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  });
}

// Отказ и недоступность — разные вещи, и подсказка должна быть разной: в первом
// случае человек сам закрыл доступ, во втором чинить нечего.
function geoErrorText(e) {
  if (e && e.code === 1) return "Доступ к геоданным запрещён. Станцию можно выбрать вручную — «подключить свою станцию».";
  if (e && e.code === 2) return "Браузер не смог определить место. Попробуйте ещё раз или выберите станцию вручную.";
  if (e && e.code === 3) return "Определение места заняло слишком долго. Попробуйте ещё раз или выберите станцию вручную.";
  return "Геолокация в этом браузере недоступна. Станцию можно выбрать вручную.";
}

// ============================================================
// НАСТРОЙКИ
// ============================================================
const DEFAULT_SETTINGS = {
  unit: "ms",
  digits: null,        // null — сколько принято для выбранной единицы
  glow: "normal",      // off | normal | strong
  histMinutes: 2,      // окно спарклайна
  speedAccent: "bft",  // bft — цвет по Бофорту, white — как весь остальной UI
  showCompass: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("wind_ui_settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// ============================================================
// ОФОРМЛЕНИЕ
// ============================================================
// Фон строго чёрный, весь текст белый и светящийся — свечение делается
// text-shadow'ом в два слоя (ближний резкий ореол + дальнее размытие).
// Инлайн-стили здесь намеренно: дашборд собирается в один JS-бандл без
// CSS-модулей, а держать половину оформления в отдельном файле, который
// невозможно перегенерировать без npm, уже один раз выходило боком.
const GLOW_MUL = { off: 0, normal: 1, strong: 1.9 };

function glow(level, base = 1) {
  const m = (GLOW_MUL[level] ?? 1) * base;
  if (m === 0) return "none";
  return `0 0 ${4 * m}px rgba(255,255,255,${0.45 * Math.min(m, 1.2)}), ` +
         `0 0 ${14 * m}px rgba(255,255,255,${0.18 * Math.min(m, 1.2)})`;
}

function glowColor(color, level, base = 1) {
  const m = (GLOW_MUL[level] ?? 1) * base;
  if (m === 0) return "none";
  return `0 0 ${5 * m}px ${color}, 0 0 ${18 * m}px ${color}88`;
}

const MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Roboto Mono', monospace";
const LINE = "rgba(255,255,255,0.14)";
const DIM = "rgba(255,255,255,0.42)";

// ============================================================
// МЕЛОЧИ
// ============================================================
const DIRECTIONS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const DIR_FULL = ["Север", "Северо-Восток", "Восток", "Юго-Восток", "Юг", "Юго-Запад", "Запад", "Северо-Запад"];

function degToDir(deg) {
  const idx = Math.round(deg / 45) % 8;
  return { short: DIRECTIONS[idx], full: DIR_FULL[idx] };
}

function rssiQuality(rssi) {
  // RSSI=0 означает «клиентов нет» — прошивка в режиме точки доступа отдаёт
  // уровень подключённого клиента, а не роутера. Нулевая шкала как «отличный»
  // вводила бы в заблуждение.
  if (rssi === 0 || rssi < -95) return { label: "—", ok: false };
  if (rssi >= -55) return { label: "отличный", ok: true };
  if (rssi >= -65) return { label: "хороший", ok: true };
  if (rssi >= -75) return { label: "средний", ok: true };
  if (rssi >= -85) return { label: "слабый", ok: true };
  return { label: "плохой", ok: false };
}

// Развёртка углов: последовательность 355° → 5° рисуется как +10°, а не провал −350°.
function unwrapAngles(arr) {
  if (arr.length < 2) return arr;
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    let diff = arr[i] - arr[i - 1];
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    out.push(out[i - 1] + diff);
  }
  return out;
}

// ============================================================
// КОМПОНЕНТЫ
// ============================================================

function Label({ children, g, size = 9 }) {
  return (
    <div style={{
      color: DIM, fontSize: size, letterSpacing: 3, textTransform: "uppercase",
      textShadow: glow(g, 0.5), fontFamily: MONO,
    }}>
      {children}
    </div>
  );
}

// Единственный «ящик» во всём UI: тонкая рамка на чёрном, без заливки и скруглений
// сверх минимума. Всё остальное — типографика.
function Panel({ children, style }) {
  return (
    <div style={{
      border: `1px solid ${LINE}`,
      background: "rgba(255,255,255,0.015)",
      padding: "14px 16px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function Stat({ label, value, unit, g, color, action }) {
  return (
    <Panel style={{ flex: 1, minWidth: 92, position: "relative" }}>
      <Label g={g}>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 7 }}>
        <span style={{
          color: color || "#fff", fontSize: 22, fontWeight: 600, fontFamily: MONO,
          textShadow: color ? glowColor(color, g, 0.7) : glow(g),
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ color: DIM, fontSize: 11, fontFamily: MONO, textShadow: glow(g, 0.4) }}>
            {unit}
          </span>
        )}
      </div>
      {action}
    </Panel>
  );
}

function Compass({ direction, accent, g }) {
  const dir = degToDir(direction);
  const white = "#ffffff";
  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 280, display: "block" }}>
      <circle cx="100" cy="100" r="94" fill="none" stroke={LINE} strokeWidth="1" />

      {Array.from({ length: 72 }).map((_, i) => {
        const angle = (i * 5 - 90) * (Math.PI / 180);
        const isMajor = i % 9 === 0;
        const r1 = isMajor ? 76 : 82;
        return (
          <line
            key={i}
            x1={100 + r1 * Math.cos(angle)} y1={100 + r1 * Math.sin(angle)}
            x2={100 + 88 * Math.cos(angle)} y2={100 + 88 * Math.sin(angle)}
            stroke={white}
            strokeWidth={isMajor ? 1.6 : 0.6}
            opacity={isMajor ? 0.85 : 0.28}
          />
        );
      })}

      {["С", "В", "Ю", "З"].map((label, i) => {
        const angle = (i * 90 - 90) * (Math.PI / 180);
        return (
          <text
            key={label}
            x={100 + 64 * Math.cos(angle)} y={100 + 64 * Math.sin(angle) + 5}
            textAnchor="middle" fill={white} fontSize="13" fontWeight="600" fontFamily={MONO}
            style={{ filter: g === "off" ? undefined : `drop-shadow(0 0 4px rgba(255,255,255,0.7))` }}
          >
            {label}
          </text>
        );
      })}

      <g transform={`rotate(${direction}, 100, 100)`}
         style={{ transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
        <polygon points="100,22 93,56 100,49 107,56" fill={accent}
                 style={{ filter: g === "off" ? undefined : `drop-shadow(0 0 6px ${accent})` }} />
        <polygon points="100,178 93,144 100,151 107,144" fill={white} opacity="0.25" />
        <circle cx="100" cy="100" r="5" fill="#000" stroke={accent} strokeWidth="1.6" />
      </g>

      <text x="100" y="97" textAnchor="middle" fill={white} fontSize="20" fontWeight="700" fontFamily={MONO}
            style={{ filter: g === "off" ? undefined : "drop-shadow(0 0 6px rgba(255,255,255,0.8))" }}>
        {dir.short}
      </text>
      <text x="100" y="114" textAnchor="middle" fill={DIM} fontSize="9" fontFamily={MONO}>
        {Math.round(direction)}°
      </text>
    </svg>
  );
}

function SpeedGauge({ speedMs, gustMs, maxSpeed, unit, digits, accent, g }) {
  const pct = Math.min(speedMs / maxSpeed, 1);
  const gustPct = Math.min(gustMs / maxSpeed, 1);
  const startAngle = -225, endAngle = 45;
  const range = endAngle - startAngle;

  const polar = (cx, cy, r, a) => {
    const rad = (a * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arc = (cx, cy, r, a1, a2) => {
    const s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a2);
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
  };

  const u = UNITS[unit] ?? UNITS.ms;
  const value = convertSpeed(speedMs, unit, digits);
  // Деления подписываются в выбранных единицах, иначе шкала спорила бы с числом
  // в центре: 30 на дуге и 108 в центре читаются как ошибка.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    frac: f,
    text: u.factor === null
      ? String(beaufort(maxSpeed * f).scale)
      : (maxSpeed * f * u.factor).toFixed(0),
  }));

  return (
    <svg viewBox="0 0 200 152" width="100%" style={{ maxWidth: 300, display: "block" }}>
      <path d={arc(100, 110, 80, startAngle, endAngle)} fill="none"
            stroke="rgba(255,255,255,0.10)" strokeWidth="10" strokeLinecap="round" />

      {gustMs > speedMs && (
        <path d={arc(100, 110, 80, startAngle, startAngle + range * gustPct)} fill="none"
              stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity="0.18" />
      )}

      <path
        d={arc(100, 110, 80, startAngle, startAngle + range * pct)}
        fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round"
        style={{
          filter: g === "off" ? undefined : `drop-shadow(0 0 8px ${accent})`,
          transition: "all 0.25s ease-out",
        }}
      />

      {ticks.map((t, i) => {
        const p = polar(100, 110, 62, startAngle + range * t.frac);
        return (
          <text key={i} x={p.x} y={p.y + 3} textAnchor="middle" fill={DIM} fontSize="8" fontFamily={MONO}>
            {t.text}
          </text>
        );
      })}

      <text x="100" y="100" textAnchor="middle" fill={accent} fontSize="34" fontWeight="700" fontFamily={MONO}
            style={{ filter: g === "off" ? undefined : `drop-shadow(0 0 10px ${accent})` }}>
        {value}
      </text>
      <text x="100" y="118" textAnchor="middle" fill="#fff" fontSize="10" fontFamily={MONO} opacity="0.75"
            style={{ filter: g === "off" ? undefined : "drop-shadow(0 0 4px rgba(255,255,255,0.7))" }}>
        {u.short}
      </text>
    </svg>
  );
}

function Sparkline({ data, g, height = 56 }) {
  if (data.length < 2) {
    return <div style={{ height, display: "flex", alignItems: "center", color: DIM, fontSize: 10, fontFamily: MONO }}>
      сбор данных…
    </div>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 200, h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="rgba(255,255,255,0.07)" />
      <polyline
        points={points} fill="none" stroke="#fff" strokeWidth="1.2"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round"
        style={{ filter: g === "off" ? undefined : "drop-shadow(0 0 4px rgba(255,255,255,0.8))" }}
      />
    </svg>
  );
}

function Tab({ id, active, onClick, children, g }) {
  const on = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${on ? "#fff" : "transparent"}`,
        color: on ? "#fff" : DIM,
        textShadow: on ? glow(g) : glow(g, 0.25),
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: 3,
        textTransform: "uppercase",
        padding: "8px 2px",
        marginRight: 22,
        cursor: "pointer",
        transition: "color .2s, text-shadow .2s, border-color .2s",
      }}
    >
      {children}
    </button>
  );
}

// Ряд настройки: подпись слева, набор взаимоисключающих кнопок справа.
function Choice({ label, value, options, onChange, g, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Label g={g}>{label}</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              style={{
                background: on ? "rgba(255,255,255,0.10)" : "transparent",
                border: `1px solid ${on ? "rgba(255,255,255,0.75)" : LINE}`,
                color: on ? "#fff" : DIM,
                textShadow: on ? glow(g, 0.8) : "none",
                fontFamily: MONO, fontSize: 11,
                padding: "5px 11px",
                cursor: "pointer",
                transition: "all .18s",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <div style={{ color: DIM, fontSize: 10, marginTop: 7, fontFamily: MONO, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, g }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#000", border: `1px solid rgba(255,255,255,0.35)`,
          boxShadow: g === "off" ? "none" : "0 0 40px rgba(255,255,255,0.10)",
          width: "min(480px, 100%)", maxHeight: "88vh", overflowY: "auto",
          padding: "22px 24px", fontFamily: MONO,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, g, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? "rgba(255,255,255,0.12)" : "transparent",
        border: `1px solid ${primary ? "rgba(255,255,255,0.8)" : LINE}`,
        color: disabled ? DIM : "#fff",
        textShadow: disabled ? "none" : glow(g, primary ? 0.9 : 0.5),
        fontFamily: MONO, fontSize: 11, letterSpacing: 1,
        padding: "9px 14px", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "all .18s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Приветственное окно. Показывается только там, где выбор вообще имеет смысл:
// страница, открытая с самой станции, уже знает, к чему подключена.
function WelcomeModal({ g, onFindNearest, onAddStation, onDismiss, busy, message, stationCount }) {
  return (
    <Modal onClose={onDismiss} g={g}>
      <div style={{ fontSize: 15, letterSpacing: 4, textShadow: glow(g, 1.1), marginBottom: 6 }}>
        МЕТЕОСТАНЦИИ
      </div>
      <div style={{ color: DIM, fontSize: 11, lineHeight: 1.7, marginBottom: 18 }}>
        {stationCount > 0
          ? `В этом браузере сохранено станций: ${stationCount}. Можно выбрать ближайшую к вам по координатам.`
          : "Общего каталога станций не существует — каждая станция автономна и работает в своей сети. " +
            "Список ваших станций хранится только в этом браузере и никуда не отправляется."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <Btn onClick={onFindNearest} primary g={g} disabled={busy || !GEO_AVAILABLE}>
          {busy ? "ОПРЕДЕЛЯЮ МЕСТО…" : "ПОДКЛЮЧИТЬСЯ К БЛИЖАЙШЕЙ"}
        </Btn>
        <Btn onClick={onAddStation} g={g}>ПОДКЛЮЧИТЬ СВОЮ СТАНЦИЮ</Btn>
        <Btn onClick={onDismiss} g={g}>ПОСМОТРЕТЬ ДЕМО</Btn>
      </div>

      {!GEO_AVAILABLE && (
        <div style={{ color: DIM, fontSize: 10, marginTop: 12, lineHeight: 1.6 }}>
          Поиск ближайшей недоступен: браузер отдаёт координаты только защищённым
          страницам, а эта копия открыта по обычному HTTP.
        </div>
      )}

      {message && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginTop: 14,
          fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.85)",
        }}>
          {message.text}
          {message.href && (
            <div style={{ marginTop: 9 }}>
              <a
                href={message.href}
                style={{ color: "#fff", textShadow: glow(g, 0.8), wordBreak: "break-all" }}
              >
                {message.href}
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// Подключение своей станции. Два пути, потому что их физически два: своя сеть
// станции (всегда работает, адрес фиксирован) и адрес в домашней сети, если
// станцию туда вернули.
function AddStationModal({ g, onSave, onClose, onLocate, locating, coords, testResult, onTest, busy }) {
  const [name, setName] = useState("Моя станция");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [via, setVia] = useState("ap");

  const inputStyle = {
    width: "100%", marginTop: 7, background: "#000",
    border: `1px solid ${LINE}`, padding: "9px 11px",
    color: "#fff", fontSize: 12, fontFamily: MONO, outline: "none",
  };

  return (
    <Modal onClose={onClose} g={g}>
      <div style={{ fontSize: 14, letterSpacing: 3, textShadow: glow(g, 1), marginBottom: 16 }}>
        ПОДКЛЮЧИТЬ СТАНЦИЮ
      </div>

      <Choice
        label="Как станция подключена" g={g} value={via}
        options={[
          { value: "ap", label: "своя сеть WiFi" },
          { value: "lan", label: "домашняя сеть" },
        ]}
        onChange={(v) => { setVia(v); setHost(v === "ap" ? DEFAULT_HOST : ""); }}
        hint={via === "ap"
          ? "Станция раздаёт собственную сеть и ни к чему не подключается — так она настроена по умолчанию. Подключитесь к сети WindStation (пароль <AP-пароль>), адрес тогда всегда MyWindProbeBETA.org."
          : "Если станцию вернули в домашнюю сеть, впишите имя или IP, который ей выдал роутер."}
      />

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Название</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Адрес</Label>
        <input
          value={host} onChange={(e) => setHost(e.target.value)}
          placeholder="MyWindProbeBETA.org или 192.168.1.50" style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Место установки</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Btn onClick={onLocate} g={g} disabled={locating || !GEO_AVAILABLE}>
            {locating ? "ОПРЕДЕЛЯЮ…" : coords ? "ОБНОВИТЬ КООРДИНАТЫ" : "ПРИВЯЗАТЬ К ТЕКУЩЕМУ МЕСТУ"}
          </Btn>
          <Btn onClick={() => onTest(host.trim())} g={g} disabled={busy || !host.trim()}>
            {busy ? "ПРОВЕРЯЮ…" : "ПРОВЕРИТЬ СВЯЗЬ"}
          </Btn>
        </div>
        <div style={{ color: DIM, fontSize: 10, marginTop: 8, lineHeight: 1.6 }}>
          {coords
            ? `Сохранено: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}. По этим координатам станция будет находиться как ближайшая.`
            : GEO_AVAILABLE
              ? "Без координат станция всё равно работает — её просто не найдёт поиск ближайшей."
              : "Координаты недоступны: браузер отдаёт их только защищённым страницам."}
        </div>
      </div>

      {testResult && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginBottom: 16,
          fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.85)",
        }}>
          {testResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} g={g}>ОТМЕНА</Btn>
        <Btn
          primary g={g} disabled={!host.trim() || !name.trim()}
          onClick={() => onSave({ name: name.trim(), host: host.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), via })}
        >
          СОХРАНИТЬ
        </Btn>
      </div>
    </Modal>
  );
}

function LEDPanel({ leds, autoMode, onToggle, onAutoToggle, g }) {
  const items = [
    { key: "green", label: "Батарея" },
    { key: "yellow", label: "Жёлтый" },
    { key: "red", label: "Красный" },
    { key: "wifi", label: "WiFi" },
  ];
  const MODE_TEXT = { off: "OFF", on: "ON", blink: "МИГ" };

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Label g={g}>Светодиоды</Label>
        <button
          onClick={onAutoToggle}
          style={{
            background: autoMode ? "rgba(255,255,255,0.10)" : "transparent",
            border: `1px solid ${autoMode ? "rgba(255,255,255,0.75)" : LINE}`,
            color: autoMode ? "#fff" : DIM,
            textShadow: autoMode ? glow(g, 0.8) : "none",
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "3px 10px", cursor: "pointer",
          }}
        >
          {autoMode ? "АВТО" : "РУЧНОЙ"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        {items.map(({ key, label }) => {
          const mode = leds[key] ?? "off";
          const isLit = mode === "on" || mode === "blink";
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, flex: 1 }}>
              <button
                onClick={() => !autoMode && onToggle(key)}
                disabled={autoMode}
                style={{
                  width: "100%", maxWidth: 58, aspectRatio: "1",
                  border: `1px solid ${isLit ? "#fff" : LINE}`,
                  background: isLit ? "rgba(255,255,255,0.12)" : "transparent",
                  boxShadow: isLit && g !== "off"
                    ? `0 0 14px rgba(255,255,255,0.45), inset 0 0 14px rgba(255,255,255,0.18)`
                    : "none",
                  color: isLit ? "#fff" : DIM,
                  textShadow: isLit ? glow(g, 0.8) : "none",
                  cursor: autoMode ? "default" : "pointer",
                  opacity: autoMode ? 0.75 : 1,
                  fontFamily: MONO, fontSize: 9,
                  transition: "all .3s",
                  animation: mode === "blink" ? "ledBlink 1s steps(1) infinite" : undefined,
                }}
              >
                {MODE_TEXT[mode] ?? "OFF"}
              </button>
              <span style={{ fontSize: 8, color: DIM, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {autoMode && (
        <div style={{ color: DIM, fontSize: 10, marginTop: 12, fontFamily: MONO, lineHeight: 1.5 }}>
          В авто-режиме цвета задаёт прошивка. Переключи в «ручной», чтобы управлять вручную.
        </div>
      )}
    </Panel>
  );
}

// ============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================
export default function WindDashboard() {
  const [settings, setSettings] = useState(loadSettings);
  // Вкладка переживает перезагрузку страницы: станция часто открыта на телефоне
  // как «приложение с домашнего экрана», и возвращаться каждый раз на «ветер»
  // при случайном обновлении неудобно.
  const [tab, setTabState] = useState(() => {
    try { return localStorage.getItem("wind_ui_tab") || "wind"; } catch { return "wind"; }
  });
  const setTab = (id) => {
    setTabState(id);
    try { localStorage.setItem("wind_ui_tab", id); } catch { /* приватный режим */ }
  };
  const [esp32Host, setEsp32Host] = useState(() =>
    SERVED_FROM_STATION ? DEFAULT_HOST : (localStorage.getItem("esp32_host") || DEFAULT_HOST)
  );

  const [data, setData] = useState({
    speed: 0, direction: null, gust: 0, dirPresent: false, speedMax: 30,
    ledGreen: "off", ledYellow: "off", ledRed: "off", ledWifi: "off", ledAuto: true,
    battery: null, batteryPercent: null, batteryPresent: false, chargeState: "absent",
    powerSource: null, wifiRssi: 0, adcError: false, hostname: "", uptime: 0,
  });
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState({ speed: [], dir: [] });
  const [demoMode, setDemoMode] = useState(PUBLIC_COPY);
  const [time, setTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(null);
  const [ap, setAp] = useState(null);

  // Каталог станций и мастера подключения.
  const [stations, setStations] = useState(loadStations);
  const [showWelcome, setShowWelcome] = useState(() => {
    // Страница, открытая с самой станции, уже знает, к чему подключена, —
    // спрашивать её о ближайшей бессмысленно.
    if (SERVED_FROM_STATION) return false;
    try { return !localStorage.getItem(WELCOMED_KEY); } catch { return true; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState(null);
  const [newCoords, setNewCoords] = useState(null);
  const [testResult, setTestResult] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const demoRef = useRef({ speed: 5, dir: 180, t: 0, gust: 0, battery: 4.1 });
  const [sseActive, setSseActive] = useState(false);
  const histRef = useRef(0);

  const g = settings.glow;
  const setS = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("wind_ui_settings", JSON.stringify(next)); } catch { /* приватный режим */ }
      return next;
    });
  };

  // История пишется не чаще раза в секунду, иначе окно спарклайна при 20 Гц
  // сжалось бы до нескольких секунд. Длина буфера = окно в минутах × 60.
  const histLen = settings.histMinutes * 60;

  const applyData = useCallback((json) => {
    // Older firmware has no *Present flags — infer from the value being there.
    const normLed = (v) => (v === true ? "on" : v === false || v == null ? "off" : v);
    const norm = {
      ...json,
      ledGreen: normLed(json.ledGreen),
      ledYellow: normLed(json.ledYellow),
      ledRed: normLed(json.ledRed),
      ledWifi: normLed(json.ledWifi),
      speedMax: json.speedMax ?? 30,
      dirPresent: json.dirPresent ?? (json.direction != null),
      batteryPresent: json.batteryPresent ?? (json.battery != null),
      chargeState: json.chargeState ?? (json.battery != null ? "discharging" : "absent"),
      powerSource: json.powerSource ?? (json.chargeState === "charging" ? "external" : null),
    };
    setData(norm);
    setConnected(true);
    setLastUpdate(new Date());
    const now = Date.now();
    if (now - histRef.current >= 950) {
      histRef.current = now;
      setHistory((prev) => ({
        speed: [...prev.speed, json.speed].slice(-histLen),
        dir: norm.dirPresent ? [...prev.dir, json.direction].slice(-histLen) : prev.dir,
      }));
    }
  }, [histLen]);

  const fetchData = useCallback(async () => {
    if (demoMode) {
      const d = demoRef.current;
      d.t += 0.1;
      d.speed = Math.max(0, 8 + Math.sin(d.t * 0.7) * 6 + Math.sin(d.t * 2.1) * 3 + (Math.random() - 0.5) * 2);
      d.dir = (d.dir + Math.sin(d.t * 0.3) * 5 + (Math.random() - 0.5) * 8 + 360) % 360;
      d.gust = Math.max(d.gust, d.speed);
      d.battery = Math.max(3.2, 4.1 - d.t * 0.0005);
      const pct = Math.max(0, Math.min(100, Math.round(((d.battery - 3.0) / 1.2) * 100)));
      setData({
        speed: parseFloat(d.speed.toFixed(2)),
        direction: Math.round(d.dir), dirPresent: true, speedMax: 30,
        gust: parseFloat(d.gust.toFixed(2)),
        ledGreen: pct > 60 ? "on" : "off",
        ledYellow: d.speed > 5 || (pct >= 30 && pct <= 60) ? "on" : "off",
        ledRed: pct < 10 ? "blink" : d.speed > 15 || (pct >= 10 && pct < 30) ? "on" : "off",
        ledWifi: "on", ledAuto: true,
        battery: parseFloat(d.battery.toFixed(2)), batteryPercent: pct, batteryPresent: true,
        chargeState: pct >= 99 ? "full" : "discharging",
        powerSource: pct >= 99 ? "external" : "battery",
        wifiRssi: -55 + Math.round(Math.sin(d.t * 0.2) * 10),
        adcError: false, hostname: "demo", uptime: Math.floor(d.t * 20),
      });
      setConnected(true);
      setHistory((prev) => ({
        speed: [...prev.speed, d.speed].slice(-histLen),
        dir: [...prev.dir, d.dir].slice(-histLen),
      }));
      setLastUpdate(new Date());
      return;
    }
    try {
      const res = await fetch(`http://${esp32Host}/api/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyData(await res.json());
    } catch {
      setConnected(false);
    }
  }, [demoMode, esp32Host, applyData, histLen]);

  useEffect(() => {
    fetchData();
    // Основной канал — SSE. Опрос остаётся как heartbeat/фолбэк: 1000 ms, not 500 —
    // ESP32 отвечает Connection: close, и каждый опрос держит один из 16 TCP-блоков
    // lwIP все 60 с TIME_WAIT. При живом SSE опрос уходит на раз в 5 с.
    const id = setInterval(fetchData, sseActive && !demoMode ? 5000 : 1000);
    return () => clearInterval(id);
  }, [fetchData, sseActive, demoMode]);

  useEffect(() => {
    if (demoMode) return;
    let es = null, retryId = null, closed = false;
    const open = () => {
      es = new EventSource(`http://${esp32Host}/api/stream`);
      es.onmessage = (e) => {
        try {
          applyData(JSON.parse(e.data));
          setSseActive(true);
        } catch { /* битый кадр — пропускаем */ }
      };
      es.onerror = () => {
        es.close();
        setSseActive(false);
        if (!closed) retryId = setTimeout(open, 15000);
      };
    };
    open();
    return () => {
      closed = true;
      if (es) es.close();
      if (retryId) clearTimeout(retryId);
      setSseActive(false);
    };
  }, [demoMode, esp32Host, applyData]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Сведения о точке доступа нужны только на вкладке «система» и почти не меняются —
  // тянем их отдельно и редко, чтобы не мешать потоку данных.
  useEffect(() => {
    if (demoMode || tab !== "system") return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`http://${esp32Host}/api/wifi`);
        if (r.ok && alive) setAp(await r.json());
      } catch { if (alive) setAp(null); }
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [demoMode, esp32Host, tab]);

  // Оптимистичный апдейт: сразу меняем локальный state, чтобы кнопка не ждала цикл
  // опроса. Следующий кадр подтвердит или откатит значение с железа.
  const toggleLed = async (key) => {
    const NEXT_MODE = { off: "on", on: "blink", blink: "off" };
    const k = `led${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const nextValue = NEXT_MODE[data[k]] ?? "on";
    setData((prev) => ({ ...prev, [k]: nextValue }));
    if (demoMode) return;
    await fetch(`http://${esp32Host}/api/led?${key}=${nextValue}`);
  };

  const toggleAuto = async () => {
    const nextValue = !data.ledAuto;
    setData((prev) => ({ ...prev, ledAuto: nextValue }));
    if (demoMode) return;
    await fetch(`http://${esp32Host}/api/led?auto=${nextValue}`);
  };

  // ---------- станции ----------
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch { /* приватный режим */ }
  };

  const selectStation = (st) => {
    setEsp32Host(st.host);
    try { localStorage.setItem("esp32_host", st.host); } catch { /* приватный режим */ }
    // На публичной копии данные всё равно не подтянуть — демо остаётся включённым,
    // иначе дашборд просто повис бы с надписью OFFLINE.
    if (!PUBLIC_COPY) setDemoMode(false);
  };

  const findNearest = async () => {
    setGeoBusy(true);
    setWelcomeMsg(null);
    try {
      const here = await requestPosition();
      const located = stations.filter((s) => s.lat != null && s.lon != null);
      if (!located.length) {
        setWelcomeMsg({
          text: stations.length
            ? "Место определено, но ни у одной сохранённой станции нет координат. Откройте «подключить свою станцию» и привяжите её к месту."
            : "Место определено, но сохранённых станций нет. Общего каталога станций не существует — станции автономны и о себе никуда не сообщают. Добавьте свою.",
        });
        return;
      }
      const nearest = located
        .map((s) => ({ s, km: distanceKm(here, { lat: s.lat, lon: s.lon }) }))
        .sort((a, b) => a.km - b.km)[0];
      selectStation(nearest.s);
      if (PUBLIC_COPY) {
        setWelcomeMsg({
          text: `Ближайшая — «${nearest.s.name}», ${formatDistance(nearest.km)}. Показания с этой страницы не подтянуть: она отдаётся по HTTPS, а станция отвечает по HTTP, и такой запрос браузер блокирует. Откройте её напрямую:`,
          href: `http://${nearest.s.host}/`,
        });
      } else {
        setWelcomeMsg({ text: `Подключаюсь к «${nearest.s.name}» — ${formatDistance(nearest.km)}.` });
        setTimeout(dismissWelcome, 1400);
      }
    } catch (e) {
      setWelcomeMsg({ text: geoErrorText(e) });
    } finally {
      setGeoBusy(false);
    }
  };

  const locateForNew = async () => {
    setGeoBusy(true);
    setTestResult("");
    try {
      setNewCoords(await requestPosition());
    } catch (e) {
      setTestResult(geoErrorText(e));
    } finally {
      setGeoBusy(false);
    }
  };

  const testStation = async (host) => {
    setTestResult("");
    if (PUBLIC_COPY) {
      setTestResult(
        `Отсюда проверить нельзя: страница открыта по HTTPS, а станция отвечает по HTTP — такой запрос браузер блокирует. ` +
        `Сохраните станцию и откройте её напрямую по адресу http://${host}/`
      );
      return;
    }
    setTestBusy(true);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`http://${host}/api/data`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setTestResult(`Станция ответила: ветер ${j.speed} м/с, аптайм ${Math.floor((j.uptime ?? 0) / 60)} мин.`);
    } catch {
      setTestResult("Станция не ответила. Проверьте, что устройство подключено к её сети и адрес указан верно.");
    } finally {
      setTestBusy(false);
    }
  };

  const saveStation = ({ name, host, via }) => {
    const st = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name, host, via,
      lat: newCoords ? newCoords.lat : null,
      lon: newCoords ? newCoords.lon : null,
    };
    // Один адрес — одна запись: повторное добавление того же хоста обновляет её,
    // а не плодит дубликаты, между которыми потом не отличить нужную.
    const next = [...stations.filter((s) => s.host !== host), st];
    setStations(next);
    persistStations(next);
    selectStation(st);
    setShowAdd(false);
    setNewCoords(null);
    setTestResult("");
    dismissWelcome();
  };

  const removeStation = (id) => {
    const next = stations.filter((s) => s.id !== id);
    setStations(next);
    persistStations(next);
  };

  const resetGust = async () => {
    if (demoMode) {
      demoRef.current.gust = demoRef.current.speed;
      setData((prev) => ({ ...prev, gust: parseFloat(demoRef.current.speed.toFixed(2)) }));
      return;
    }
    await fetch(`http://${esp32Host}/api/gust`);
  };

  const bf = beaufort(data.speed);
  const accent = settings.speedAccent === "white" ? "#ffffff" : bf.color;
  const hasDir = data.dirPresent && data.direction != null;
  const hasBattery = data.batteryPresent && data.battery != null;
  const unit = UNITS[settings.unit] ?? UNITS.ms;
  const uptimeMin = Math.floor(data.uptime / 60);
  const uptimeH = Math.floor(uptimeMin / 60);
  const rssi = rssiQuality(data.wifiRssi);
  const CHARGE_VIEW = { charging: "заряжается", full: "заряжена", discharging: "разряд" };
  const POWER_VIEW = { external: "от сети", battery: "от батареи" };
  const lastUpdateStr = lastUpdate ? `${Math.round((time - lastUpdate) / 1000)}с` : "—";

  // Скорость конвертирует сам SpeedGauge (ему нужны ещё и подписи делений),
  // здесь считается только порыв — он показывается отдельной карточкой.
  const gustText = useMemo(
    () => convertSpeed(data.gust, settings.unit, settings.digits),
    [data.gust, settings.unit, settings.digits]
  );

  const TABS = [
    { id: "wind", label: "Ветер" },
    { id: "system", label: "Система" },
    { id: "settings", label: "Настройки" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      color: "#fff",
      fontFamily: MONO,
      padding: "20px 22px 40px",
      boxSizing: "border-box",
    }}>
      {/* Шапка */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: 5,
            color: "#fff", textShadow: glow(g, 1.15),
          }}>
            MYWINDPROBE
          </h1>
          <div style={{ color: DIM, fontSize: 9, letterSpacing: 2, marginTop: 5 }}>
            {APP_VERSION} · {demoMode ? "DEMO" : esp32Host}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 17, fontWeight: 600, textShadow: glow(g, 0.8) }}>
            {time.toLocaleTimeString("uk-UA")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", marginTop: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? "#fff" : "rgba(255,255,255,0.3)",
              boxShadow: connected && g !== "off" ? "0 0 8px rgba(255,255,255,0.9)" : "none",
              animation: connected ? undefined : "pulse 1.4s infinite",
            }} />
            <span style={{ fontSize: 9, letterSpacing: 2, color: connected ? "#fff" : DIM, textShadow: connected ? glow(g, 0.6) : "none" }}>
              {connected ? (demoMode ? "DEMO" : sseActive ? "ONLINE" : "POLL") : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>

      {/* Публичная копия — сразу сказать, что это витрина, а не живая станция */}
      {PUBLIC_COPY && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "11px 14px", marginTop: 16,
          fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.75)",
        }}>
          <span style={{ color: "#fff", letterSpacing: 2, textShadow: glow(g, 0.7) }}>ДЕМОНСТРАЦИЯ</span>
          {" — это публичная копия интерфейса, живого ветра здесь нет. "}
          Настоящая станция работает автономно и раздаёт свою сеть{" "}
          <b style={{ color: "#fff" }}>WindStation</b>; дашборд с реальными показаниями открывается
          по <b style={{ color: "#fff" }}>http://MyWindProbeBETA.org</b> с устройства,
          подключённого к ней. Все настройки ниже — рабочие, их можно потрогать.
        </div>
      )}

      {/* Вкладки */}
      <div style={{ borderBottom: `1px solid ${LINE}`, marginTop: 16, marginBottom: 22 }}>
        {TABS.map((t) => (
          <Tab key={t.id} id={t.id} active={tab} onClick={setTab} g={g}>{t.label}</Tab>
        ))}
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* ---------------- ВЕТЕР ---------------- */}
        {tab === "wind" && (
          <div className="wind-grid" style={{
            display: "grid",
            gridTemplateColumns: hasDir && settings.showCompass ? "1fr 1fr" : "1fr",
            gap: 26,
            alignItems: "start",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <Label g={g}>Скорость ветра</Label>
              <SpeedGauge
                speedMs={data.speed} gustMs={data.gust} maxSpeed={data.speedMax ?? 30}
                unit={settings.unit} digits={settings.digits} accent={accent} g={g}
              />
              <div style={{ color: "#fff", fontSize: 12, letterSpacing: 2, textShadow: glow(g, 0.7) }}>
                {bf.desc.toUpperCase()} · {bf.scale} БФТ
              </div>

              <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
                <Stat
                  label="Порыв" value={gustText} unit={unit.short} g={g}
                  action={
                    <button onClick={resetGust} title="Сбросить порыв" style={{
                      position: "absolute", top: 8, right: 8, background: "transparent",
                      border: `1px solid ${LINE}`, color: DIM, padding: "1px 6px",
                      fontSize: 10, cursor: "pointer", fontFamily: MONO,
                    }}>↺</button>
                  }
                />
                <Stat label="Аптайм" value={uptimeH > 0 ? `${uptimeH}ч${uptimeMin % 60}м` : `${uptimeMin}м`} g={g} />
              </div>

              <Panel style={{ width: "100%", boxSizing: "border-box" }}>
                <Label g={g}>Скорость · {settings.histMinutes} мин</Label>
                <div style={{ marginTop: 8 }}>
                  <Sparkline data={history.speed} g={g} />
                </div>
              </Panel>
            </div>

            {hasDir && settings.showCompass && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <Label g={g}>Направление</Label>
                <Compass direction={data.direction} accent={accent} g={g} />
                <div style={{ fontSize: 13, letterSpacing: 2, textShadow: glow(g, 0.7) }}>
                  {degToDir(data.direction).full.toUpperCase()}
                </div>
                <Panel style={{ width: "100%", boxSizing: "border-box" }}>
                  <Label g={g}>Направление · {settings.histMinutes} мин</Label>
                  <div style={{ marginTop: 8 }}>
                    <Sparkline data={unwrapAngles(history.dir)} g={g} />
                  </div>
                </Panel>
              </div>
            )}
          </div>
        )}

        {/* ---------------- СИСТЕМА ---------------- */}
        {tab === "system" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <Stat
                label={hasBattery ? `Батарея${data.powerSource ? " · " + POWER_VIEW[data.powerSource] : ""}` : "Батарея · нет"}
                value={hasBattery ? data.battery.toFixed(2) : "—"} unit={hasBattery ? "V" : ""} g={g}
              />
              <Stat
                label={hasBattery && CHARGE_VIEW[data.chargeState] ? `Заряд · ${CHARGE_VIEW[data.chargeState]}` : "Заряд"}
                value={hasBattery ? data.batteryPercent : "—"} unit={hasBattery ? "%" : ""} g={g}
              />
              <Stat label={`Сигнал · ${rssi.label}`} value={data.wifiRssi || "—"} unit={data.wifiRssi ? "dBm" : ""} g={g} />
              <Stat
                label={data.adcError ? "ADC · ОШИБКА" : "Обновлено"}
                value={data.adcError ? "ERR" : lastUpdateStr} g={g}
              />
            </div>

            <LEDPanel
              leds={{ green: data.ledGreen, yellow: data.ledYellow, red: data.ledRed, wifi: data.ledWifi }}
              autoMode={data.ledAuto} onToggle={toggleLed} onAutoToggle={toggleAuto} g={g}
            />

            <Panel>
              <Label g={g}>Точка доступа</Label>
              <div style={{ marginTop: 10, fontSize: 11, lineHeight: 2, color: "rgba(255,255,255,0.8)" }}>
                {demoMode ? (
                  <div style={{ color: DIM }}>Недоступно в демо-режиме.</div>
                ) : ap ? (
                  <>
                    <Row k="Сеть" v={ap.current} g={g} />
                    <Row k="Адрес" v={ap.host || ap.ip} g={g} />
                    <Row k="IP" v={ap.ip} g={g} />
                    <Row k="Клиентов" v={String(ap.clients ?? "—")} g={g} />
                    <Row k="Режим" v={ap.apOnly ? "только точка доступа" : ap.mode || "—"} g={g} />
                  </>
                ) : (
                  <div style={{ color: DIM }}>Станция не ответила на /api/wifi.</div>
                )}
              </div>
              <div style={{ color: DIM, fontSize: 10, marginTop: 12, lineHeight: 1.6 }}>
                Станция ни к каким сетям не подключается и раздаёт только свою.
                Список сетей и переключение из прошивки убраны.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- НАСТРОЙКИ ---------------- */}
        {tab === "settings" && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 22 }}>
              <Label g={g}>Станции</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
                {stations.length === 0 && (
                  <div style={{ color: DIM, fontSize: 10, lineHeight: 1.6 }}>
                    Пока ни одной. Список хранится только в этом браузере и никуда не отправляется —
                    общего каталога станций не существует.
                  </div>
                )}
                {stations.map((s) => {
                  const active = s.host === esp32Host;
                  return (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      border: `1px solid ${active ? "rgba(255,255,255,0.55)" : LINE}`, padding: "8px 10px",
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, textShadow: active ? glow(g, 0.6) : "none" }}>
                          {s.name}{active ? " ●" : ""}
                        </div>
                        <div style={{ color: DIM, fontSize: 10, wordBreak: "break-all" }}>
                          {s.host} · {s.lat != null ? "с координатами" : "без координат"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {!active && (
                          <Btn g={g} onClick={() => selectStation(s)} style={{ padding: "4px 9px" }}>выбрать</Btn>
                        )}
                        <Btn g={g} onClick={() => removeStation(s.id)} style={{ padding: "4px 9px" }}>✕</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Btn g={g} onClick={() => { setTestResult(""); setNewCoords(null); setShowAdd(true); }}>
                  + ПОДКЛЮЧИТЬ СТАНЦИЮ
                </Btn>
                <Btn g={g} disabled={!GEO_AVAILABLE} onClick={() => { setWelcomeMsg(null); setShowWelcome(true); }}>
                  НАЙТИ БЛИЖАЙШУЮ
                </Btn>
              </div>
              {!GEO_AVAILABLE && (
                <div style={{ color: DIM, fontSize: 10, marginTop: 8, lineHeight: 1.6 }}>
                  Поиск ближайшей недоступен: координаты браузер отдаёт только защищённым страницам,
                  а эта копия открыта по HTTP. На самой станции он и не нужен — вы уже подключены к ней.
                </div>
              )}
            </div>

            <Choice
              label="Единицы скорости" g={g} value={settings.unit}
              options={UNIT_KEYS.map((k) => ({ value: k, label: UNITS[k].label }))}
              onChange={(v) => setS({ unit: v, digits: null })}
              hint="Прошивка всегда меряет в м/с — пересчёт делает дашборд, плату перезаливать не нужно."
            />
            <Choice
              label="Знаков после запятой" g={g} value={settings.digits}
              options={[
                { value: null, label: "авто" },
                { value: 0, label: "0" },
                { value: 1, label: "1" },
                { value: 2, label: "2" },
              ]}
              onChange={(v) => setS({ digits: v })}
              hint="«Авто» — сколько принято для выбранной единицы. У Бофорта всегда целое."
            />
            <Choice
              label="Свечение" g={g} value={settings.glow}
              options={[
                { value: "off", label: "выкл" },
                { value: "normal", label: "обычное" },
                { value: "strong", label: "сильное" },
              ]}
              onChange={(v) => setS({ glow: v })}
            />
            <Choice
              label="Цвет скорости" g={g} value={settings.speedAccent}
              options={[
                { value: "bft", label: "по Бофорту" },
                { value: "white", label: "белый" },
              ]}
              onChange={(v) => setS({ speedAccent: v })}
              hint="Единственный цветной элемент интерфейса. «Белый» делает дашборд полностью монохромным."
            />
            <Choice
              label="Окно графика" g={g} value={settings.histMinutes}
              options={[
                { value: 1, label: "1 мин" },
                { value: 2, label: "2 мин" },
                { value: 5, label: "5 мин" },
                { value: 10, label: "10 мин" },
              ]}
              onChange={(v) => setS({ histMinutes: v })}
              hint="История живёт в браузере и обнуляется при перезагрузке страницы."
            />
            <Choice
              label="Компас" g={g} value={settings.showCompass}
              options={[
                { value: true, label: "показывать" },
                { value: false, label: "скрыть" },
              ]}
              onChange={(v) => setS({ showCompass: v })}
              hint={hasDir
                ? "Датчик направления подключён."
                : "Датчик направления не подключён — компас скрыт в любом случае."}
            />
            <Choice
              label="Источник данных" g={g} value={demoMode}
              options={[
                { value: false, label: "станция" },
                { value: true, label: "демо" },
              ]}
              onChange={(v) => setDemoMode(v)}
              hint={PUBLIC_COPY
                ? "На публичной копии «станция» всегда даст OFFLINE: с HTTPS-страницы браузер не пустит запрос на http:// к плате, и снаружи она всё равно не адресуема."
                : "Демо рисует правдоподобный ветер без железа — удобно для проверки интерфейса."}
            />

            <button
              onClick={() => { setSettings({ ...DEFAULT_SETTINGS }); localStorage.removeItem("wind_ui_settings"); }}
              style={{
                background: "transparent", border: `1px solid ${LINE}`, color: DIM,
                fontFamily: MONO, fontSize: 11, padding: "7px 14px", cursor: "pointer", marginTop: 4,
              }}
            >
              Сбросить настройки
            </button>
          </div>
        )}
      </div>

      {showWelcome && (
        <WelcomeModal
          g={g} busy={geoBusy} message={welcomeMsg} stationCount={stations.length}
          onFindNearest={findNearest}
          onAddStation={() => { setShowWelcome(false); setTestResult(""); setNewCoords(null); setShowAdd(true); }}
          onDismiss={dismissWelcome}
        />
      )}

      {showAdd && (
        <AddStationModal
          g={g} locating={geoBusy} coords={newCoords} testResult={testResult} busy={testBusy}
          onLocate={locateForNew} onTest={testStation} onSave={saveStation}
          onClose={() => { setShowAdd(false); setNewCoords(null); setTestResult(""); }}
        />
      )}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        body { background: #000; margin: 0; }
        button:focus-visible, input:focus-visible { outline: 1px solid rgba(255,255,255,0.6); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes ledBlink { 0%, 49% { filter: none; } 50%, 100% { filter: brightness(0.3); } }
        /* Телефон портретом: обе колонки в столбик, нижние карточки 2x2.
           Инлайн-стили перекрываются только с !important. */
        @media (max-width: 820px) {
          .wind-grid { grid-template-columns: 1fr !important; }
          .stat-row  { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Row({ k, v, g }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: DIM }}>{k}</span>
      <span style={{ color: "#fff", textShadow: glow(g, 0.5), textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}
