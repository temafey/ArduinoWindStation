import { useState, useEffect, useCallback, useRef } from "react";

// Прошивка раздаёт этот дашборд сама (gzip из PROGMEM на порту 80). Если страница
// открыта со станции — API живёт на том же хосте, настройка не нужна и localStorage
// игнорируется (станция точно по этому адресу, раз страница пришла с неё). Порт 80
// отличает станцию от vite dev (5173/5174), открытого с другого устройства по IP ноутбука.
const SERVED_FROM_STATION =
  window.location.protocol === "http:" &&
  (window.location.port === "" || window.location.port === "80") &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname);

// Kept as the mDNS name on purpose — it is portable across networks, unlike a hardcoded IP.
// Caveat on Windows: .local resolves unreliably through the system resolver, so fetch() can
// throw and the dashboard shows "офлайн" while the station is fine. Chrome resolves .local
// itself for typed URLs, which is why the API still opens in a tab. Fix per-machine by
// entering the IP in the settings dialog — that is stored in localStorage and wins over this.
const DEFAULT_HOST = SERVED_FROM_STATION ? window.location.host : "windstation.local";

// Directions
const DIRECTIONS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const DIR_FULL = ["Север", "Северо-Восток", "Восток", "Юго-Восток", "Юг", "Юго-Запад", "Запад", "Северо-Запад"];

function degToDir(deg) {
  const idx = Math.round(deg / 45) % 8;
  return { short: DIRECTIONS[idx], full: DIR_FULL[idx] };
}

function beaufort(speed) {
  if (speed < 0.5) return { scale: 0, desc: "Штиль", color: "#64748b" };
  if (speed < 1.6) return { scale: 1, desc: "Тихий", color: "#06b6d4" };
  if (speed < 3.4) return { scale: 2, desc: "Лёгкий", color: "#22d3ee" };
  if (speed < 5.5) return { scale: 3, desc: "Слабый", color: "#34d399" };
  if (speed < 8.0) return { scale: 4, desc: "Умеренный", color: "#4ade80" };
  if (speed < 10.8) return { scale: 5, desc: "Свежий", color: "#a3e635" };
  if (speed < 13.9) return { scale: 6, desc: "Сильный", color: "#facc15" };
  if (speed < 17.2) return { scale: 7, desc: "Крепкий", color: "#fb923c" };
  if (speed < 20.8) return { scale: 8, desc: "Очень крепкий", color: "#f97316" };
  if (speed < 24.5) return { scale: 9, desc: "Шторм", color: "#ef4444" };
  if (speed < 28.5) return { scale: 10, desc: "Сильный шторм", color: "#dc2626" };
  if (speed < 32.7) return { scale: 11, desc: "Жёсткий шторм", color: "#b91c1c" };
  return { scale: 12, desc: "Ураган", color: "#7f1d1d" };
}

function batteryColor(pct) {
  if (pct > 50) return "#22c55e";
  if (pct > 20) return "#facc15";
  return "#ef4444";
}

function rssiQuality(rssi) {
  // RSSI=0 означает «нет подключения» (WiFi.RSSI() при disconnected). Нулевая шкала вводила бы в заблуждение как «отличный».
  if (rssi === 0 || rssi < -95) return { label: "—", color: "#64748b" };
  if (rssi >= -55) return { label: "отличный", color: "#22c55e" };
  if (rssi >= -65) return { label: "хороший",  color: "#a3e635" };
  if (rssi >= -75) return { label: "средний",  color: "#facc15" };
  if (rssi >= -85) return { label: "слабый",   color: "#fb923c" };
  return { label: "плохой", color: "#ef4444" };
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

// Compass SVG component
function Compass({ direction, speed }) {
  const bf = beaufort(speed);
  const dir = degToDir(direction);

  return (
    <div style={{ position: "relative", width: 320, height: 320 }}>
      <svg viewBox="0 0 200 200" width="320" height="320">
        <circle cx="100" cy="100" r="95" fill="none" stroke="#1e293b" strokeWidth="2" />
        <circle cx="100" cy="100" r="85" fill="none" stroke="#334155" strokeWidth="1" />

        {Array.from({ length: 72 }).map((_, i) => {
          const angle = (i * 5 - 90) * (Math.PI / 180);
          const isMajor = i % 9 === 0;
          const r1 = isMajor ? 76 : 80;
          const r2 = 85;
          return (
            <line
              key={i}
              x1={100 + r1 * Math.cos(angle)}
              y1={100 + r1 * Math.sin(angle)}
              x2={100 + r2 * Math.cos(angle)}
              y2={100 + r2 * Math.sin(angle)}
              stroke={isMajor ? "#94a3b8" : "#475569"}
              strokeWidth={isMajor ? 2 : 0.8}
            />
          );
        })}

        {["С", "В", "Ю", "З"].map((label, i) => {
          const angle = (i * 90 - 90) * (Math.PI / 180);
          const r = 67;
          return (
            <text
              key={label}
              x={100 + r * Math.cos(angle)}
              y={100 + r * Math.sin(angle) + 5}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="14"
              fontWeight="bold"
              fontFamily="'JetBrains Mono', monospace"
            >
              {label}
            </text>
          );
        })}

        <circle
          cx="100" cy="100" r="55"
          fill="none"
          stroke={bf.color}
          strokeWidth="3"
          opacity="0.4"
          style={{ filter: `drop-shadow(0 0 8px ${bf.color})` }}
        />

        <g
          transform={`rotate(${direction}, 100, 100)`}
          style={{ transition: "transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <polygon
            points="100,20 93,55 100,48 107,55"
            fill={bf.color}
            style={{ filter: `drop-shadow(0 0 6px ${bf.color})` }}
          />
          <polygon
            points="100,180 93,145 100,152 107,145"
            fill="#475569"
            opacity="0.5"
          />
          <circle cx="100" cy="100" r="6" fill="#0f172a" stroke={bf.color} strokeWidth="2" />
        </g>

        <text x="100" y="97" textAnchor="middle" fill="#f8fafc" fontSize="22" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
          {dir.short}
        </text>
        <text x="100" y="115" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="'JetBrains Mono', monospace">
          {Math.round(direction)}°
        </text>
      </svg>
    </div>
  );
}

// Speed gauge arc
function SpeedGauge({ speed, gust, maxSpeed = 30 }) {
  const bf = beaufort(speed);
  const pct = Math.min(speed / maxSpeed, 1);
  const gustPct = Math.min(gust / maxSpeed, 1);

  const startAngle = -225;
  const endAngle = 45;
  const range = endAngle - startAngle;
  const currentAngle = startAngle + range * pct;
  const gustAngle = startAngle + range * gustPct;

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arc(cx, cy, r, startA, endA) {
    const s = polarToCartesian(cx, cy, r, startA);
    const e = polarToCartesian(cx, cy, r, endA);
    const large = endA - startA > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  return (
    <div style={{ position: "relative", width: 280, height: 200 }}>
      <svg viewBox="0 0 200 150" width="280" height="200">
        <path d={arc(100, 110, 80, startAngle, endAngle)} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />

        {gust > speed && (
          <path d={arc(100, 110, 80, startAngle, gustAngle)} fill="none" stroke={bf.color} strokeWidth="12" strokeLinecap="round" opacity="0.2" />
        )}

        <path
          d={arc(100, 110, 80, startAngle, currentAngle)}
          fill="none"
          stroke={bf.color}
          strokeWidth="12"
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 10px ${bf.color})`,
            transition: "all 0.25s ease-out"
          }}
        />

        {[0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxSpeed * f)).map((val) => {
          const a = startAngle + range * (val / maxSpeed);
          const p = polarToCartesian(100, 110, 62, a);
          return (
            <text key={val} x={p.x} y={p.y + 4} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="'JetBrains Mono', monospace">
              {val}
            </text>
          );
        })}

        <text x="100" y="100" textAnchor="middle" fill="#f8fafc" fontSize="36" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
          {speed.toFixed(1)}
        </text>
        <text x="100" y="118" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="'JetBrains Mono', monospace">
          м/с
        </text>
        <text x="100" y="136" textAnchor="middle" fill={bf.color} fontSize="11" fontFamily="'JetBrains Mono', monospace">
          {bf.desc}
        </text>
      </svg>
    </div>
  );
}

// LED control panel.
// Каждый LED в одном из режимов "off" | "on" | "blink" (клик в ручном режиме
// циклически: выкл → вкл → мигание). Семантика в авто-режиме — в подписи.
function LEDPanel({ leds, autoMode, onToggle, onAutoToggle }) {
  const items = [
    { key: "green",  label: "Батарея", color: "#22c55e" },
    { key: "yellow", label: "Жёлтый",  color: "#eab308" },
    { key: "red",    label: "Красный", color: "#ef4444" },
    { key: "wifi",   label: "WiFi",    color: "#22c55e" },
  ];
  const MODE_TEXT = { off: "OFF", on: "ON", blink: "МИГ" };

  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 16,
      padding: "20px 24px",
      border: "1px solid #1e293b",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ color: "#94a3b8", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: "uppercase" }}>
          Светодиоды
        </span>
        <button
          onClick={onAutoToggle}
          style={{
            background: autoMode ? "#1d4ed8" : "#1e293b",
            color: autoMode ? "#dbeafe" : "#64748b",
            border: "1px solid " + (autoMode ? "#3b82f6" : "#334155"),
            borderRadius: 8,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            transition: "all 0.3s"
          }}
        >
          {autoMode ? "АВТО ●" : "РУЧНОЙ"}
        </button>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {items.map(({ key, label, color }) => {
          const mode = leds[key] ?? "off";
          const isLit = mode === "on" || mode === "blink";
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => !autoMode && onToggle(key)}
                disabled={autoMode}
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: "50%",
                  border: `2px solid ${isLit ? color : "#334155"}`,
                  background: isLit
                    ? `radial-gradient(circle at 40% 35%, ${color}dd, ${color}44)`
                    : "#0a0f1a",
                  boxShadow: isLit ? `0 0 24px ${color}88, 0 0 48px ${color}33` : "none",
                  cursor: autoMode ? "default" : "pointer",
                  opacity: autoMode ? 0.6 : 1,
                  transition: "all 0.4s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: mode === "blink" ? "ledBlink 1s steps(1) infinite" : undefined,
                }}
              >
                <span style={{
                  fontSize: 9,
                  color: isLit ? "#fff" : "#475569",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {MODE_TEXT[mode] ?? "OFF"}
                </span>
              </button>
              <span style={{ fontSize: 9, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1, textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sparkline mini chart
function Sparkline({ data, color, height = 50 }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 200;
  const h = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#grad-${color.replace("#","")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Info card
function InfoCard({ label, value, unit, color = "#94a3b8", action }) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 12,
      padding: "14px 18px",
      border: "1px solid #1e293b",
      flex: 1,
      minWidth: 100,
      position: "relative",
    }}>
      <div style={{ color: "#64748b", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ color, fontSize: 24, fontWeight: "bold", fontFamily: "'JetBrains Mono', monospace" }}>
          {value}
        </span>
        {unit && <span style={{ color: "#475569", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{unit}</span>}
      </div>
      {action}
    </div>
  );
}

// Settings modal
function SettingsModal({ host, demoMode, onSave, onClose }) {
  const [value, setValue] = useState(host);
  // WiFi-сети станции: /api/wifi отдаёт текущую сеть и сохранённые SSID (без паролей).
  const [wifi, setWifi] = useState(null);
  const [wifiErr, setWifiErr] = useState(false);
  const [newSsid, setNewSsid] = useState("");
  const [newPass, setNewPass] = useState("");
  const [busy, setBusy] = useState(false);

  const loadWifi = useCallback(async () => {
    try {
      const res = await fetch(`http://${host}/api/wifi`);
      if (!res.ok) throw new Error();
      setWifi(await res.json());
      setWifiErr(false);
    } catch {
      setWifi(null);
      setWifiErr(true);  // старая прошивка или станция офлайн
    }
  }, [host]);

  useEffect(() => {
    if (!demoMode) loadWifi();
  }, [demoMode, loadWifi]);

  const addNet = async () => {
    const ssid = newSsid.trim();
    if (!ssid || busy) return;
    setBusy(true);
    try {
      await fetch(`http://${host}/api/wifi?add=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(newPass)}`);
      setNewSsid("");
      setNewPass("");
      await loadWifi();
    } finally {
      setBusy(false);
    }
  };

  const delNet = async (ssid) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`http://${host}/api/wifi?del=${encodeURIComponent(ssid)}`);
      await loadWifi();
    } finally {
      setBusy(false);
    }
  };

  const [switchMsg, setSwitchMsg] = useState("");
  const connectNet = async (ssid) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`http://${host}/api/wifi?connect=${encodeURIComponent(ssid)}`);
      setSwitchMsg(`Станция переключается на «${ssid}»… Если это другая подсеть (hotspot) — ` +
        `дашборд потеряет связь; открой станцию по её новому IP с устройства в той сети.`);
    } catch {
      setSwitchMsg("");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: "100%",
    marginTop: 6,
    background: "#020617",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e2e8f0",
    fontSize: 13,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(2, 6, 23, 0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: "#0f172a",
        borderRadius: 16,
        padding: 28,
        border: "1px solid #1e293b",
        width: "min(440px, 92vw)",
        maxHeight: "90vh",
        overflowY: "auto",
        boxSizing: "border-box",
        fontFamily: "'JetBrains Mono', monospace",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", color: "#f8fafc", fontSize: 16, letterSpacing: 2, textTransform: "uppercase" }}>
          Настройки
        </h3>
        <label style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
          Хост ESP32
        </label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="windstation.local"
          disabled={SERVED_FROM_STATION}
          style={{ ...inputStyle, opacity: SERVED_FROM_STATION ? 0.5 : 1 }}
        />
        <div style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>
          {SERVED_FROM_STATION
            ? "Страница открыта с самой станции — хост определяется автоматически."
            : "По умолчанию: windstation.local (mDNS). На Windows имя резолвится ненадёжно — если дашборд пишет «офлайн», а станция отвечает, впиши сюда IP: 192.168.1.223"}
        </div>

        {/* WiFi-сети станции */}
        <div style={{ borderTop: "1px solid #1e293b", marginTop: 18, paddingTop: 14 }}>
          <label style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
            WiFi-сети станции
          </label>
          {demoMode ? (
            <div style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>Недоступно в демо-режиме.</div>
          ) : wifiErr ? (
            <div style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>
              Станция не ответила на /api/wifi — офлайн или старая прошивка.
            </div>
          ) : !wifi ? (
            <div style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>Загрузка…</div>
          ) : (
            <>
              {wifi.current ? (
                <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 6 }}>
                  Подключена к «{wifi.current}» · IP: <span style={{ color: "#38bdf8" }}>{wifi.ip}</span>
                </div>
              ) : (
                <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 6 }}>
                  Не подключена к WiFi (работает своя точка доступа).
                </div>
              )}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {(wifi.nets ?? []).map((n) => (
                  <div key={n.ssid} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "#020617", border: "1px solid #1e293b", borderRadius: 8,
                    padding: "6px 10px",
                  }}>
                    <span style={{ color: "#e2e8f0", fontSize: 12 }}>
                      {n.ssid}
                      {n.ssid === wifi.current && (
                        <span style={{ color: "#22c55e", fontSize: 10, marginLeft: 8 }}>● подключена</span>
                      )}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      {n.ssid !== wifi.current && (
                        <button onClick={() => connectNet(n.ssid)} disabled={busy} title="Переключиться на эту сеть" style={{
                          background: "transparent", border: "1px solid #3b82f6", color: "#93c5fd",
                          borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}>
                          → подключить
                        </button>
                      )}
                      <button onClick={() => delNet(n.ssid)} disabled={busy} title="Удалить сеть" style={{
                        background: "transparent", border: "1px solid #334155", color: "#64748b",
                        borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                      }}>
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
                {switchMsg && (
                  <div style={{ color: "#38bdf8", fontSize: 10, marginTop: 4 }}>{switchMsg}</div>
                )}
                {(wifi.nets ?? []).length === 0 && (
                  <div style={{ color: "#475569", fontSize: 10 }}>
                    Сохранённых сетей нет — станция знает только сеть из портала настройки.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input
                  value={newSsid}
                  onChange={(e) => setNewSsid(e.target.value)}
                  placeholder="SSID (напр. hotspot телефона)"
                  style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 120 }}
                />
                <input
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Пароль"
                  type="password"
                  style={{ ...inputStyle, marginTop: 0, flex: 1, minWidth: 120 }}
                />
                <button onClick={addNet} disabled={busy || !newSsid.trim()} style={{
                  background: "#1d4ed8", border: "1px solid #3b82f6", color: "#dbeafe",
                  borderRadius: 8, padding: "8px 12px", fontSize: 12,
                  cursor: busy || !newSsid.trim() ? "default" : "pointer",
                  opacity: busy || !newSsid.trim() ? 0.5 : 1, fontFamily: "inherit", whiteSpace: "nowrap",
                }}>
                  + Добавить
                </button>
              </div>
              <div style={{ color: "#475569", fontSize: 10, marginTop: 6 }}>
                Станция выбирает самую сильную из доступных сетей при загрузке и потере связи.
                Удаление вступает в силу после перезагрузки станции. Если ни одна сеть не найдена —
                станция поднимет точку доступа «WindStation-Setup» с порталом настройки.
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            Отмена
          </button>
          <button onClick={() => onSave(value.trim() || DEFAULT_HOST)} style={{
            background: "#1d4ed8", border: "1px solid #3b82f6", color: "#dbeafe",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

// Main dashboard
export default function WindDashboard() {
  const [esp32Host, setEsp32Host] = useState(() =>
    SERVED_FROM_STATION ? DEFAULT_HOST : (localStorage.getItem("esp32_host") || DEFAULT_HOST)
  );
  const [showSettings, setShowSettings] = useState(false);

  const [data, setData] = useState({
    speed: 0, direction: null, gust: 0, dirPresent: false, speedMax: 30,
    ledGreen: "off", ledYellow: "off", ledRed: "off", ledWifi: "off", ledAuto: true,
    battery: null, batteryPercent: null, batteryPresent: false, chargeState: "absent",
    powerSource: null,
    wifiRssi: 0, adcError: false,
    hostname: "", uptime: 0,
  });
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState({ speed: [], dir: [] });
  const [demoMode, setDemoMode] = useState(false);
  const [time, setTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(null);

  const demoRef = useRef({ speed: 5, dir: 180, t: 0, gust: 0, battery: 4.1 });
  // SSE поток с прошивки (/api/stream, кадр каждые 250 мс). Если он жив,
  // опрос /api/data уходит в фоновый heartbeat раз в 5 с.
  const [sseActive, setSseActive] = useState(false);
  // История пишется не чаще раза в секунду, иначе окно «2 мин» на спарклайне
  // при 4 Гц превратилось бы в 30 секунд.
  const histRef = useRef(0);

  const applyData = useCallback((json) => {
    // Older firmware has no *Present flags — infer from the value being there.
    // LED fields: new firmware sends mode strings "off"/"on"/"blink", old sends
    // booleans and no ledWifi — normalize both shapes to strings.
    const normLed = (v) => v === true ? "on" : (v === false || v == null) ? "off" : v;
    const norm = {
      ...json,
      ledGreen:  normLed(json.ledGreen),
      ledYellow: normLed(json.ledYellow),
      ledRed:    normLed(json.ledRed),
      ledWifi:   normLed(json.ledWifi),
      speedMax: json.speedMax ?? 30,
      dirPresent: json.dirPresent ?? (json.direction != null),
      batteryPresent: json.batteryPresent ?? (json.battery != null),
      // Firmware older than the CHRG wiring sends no chargeState at all.
      chargeState: json.chargeState ?? (json.battery != null ? "discharging" : "absent"),
      // Left null on firmware that cannot tell — better a missing label than a wrong
      // "от батареи" while the cable is actually in. "charging" alone still proves it.
      powerSource: json.powerSource ?? (json.chargeState === "charging" ? "external" : null),
    };
    setData(norm);
    setConnected(true);
    setLastUpdate(new Date());
    const now = Date.now();
    if (now - histRef.current >= 950) {
      histRef.current = now;
      setHistory(prev => ({
        speed: [...prev.speed.slice(-119), json.speed],
        dir:   norm.dirPresent ? [...prev.dir.slice(-119), json.direction] : prev.dir,
      }));
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (demoMode) {
      const d = demoRef.current;
      d.t += 0.1;
      d.speed = Math.max(0, 8 + Math.sin(d.t * 0.7) * 6 + Math.sin(d.t * 2.1) * 3 + (Math.random() - 0.5) * 2);
      d.dir = (d.dir + Math.sin(d.t * 0.3) * 5 + (Math.random() - 0.5) * 8 + 360) % 360;
      d.gust = Math.max(d.gust, d.speed);
      d.battery = Math.max(3.2, 4.1 - d.t * 0.0005);

      const pct = Math.max(0, Math.min(100, Math.round((d.battery - 3.0) / 1.2 * 100)));
      setData({
        speed: parseFloat(d.speed.toFixed(1)),
        direction: Math.round(d.dir),
        dirPresent: true,
        speedMax: 30,
        gust: parseFloat(d.gust.toFixed(1)),
        // Зеркалим авто-логику прошивки: зелёный = батарея >60%,
        // жёлтый/красный = ветер ИЛИ заряд, красный мигает при <10%.
        ledGreen: pct > 60 ? "on" : "off",
        ledYellow: (d.speed > 5 || (pct >= 30 && pct <= 60)) ? "on" : "off",
        ledRed: pct < 10 ? "blink" : (d.speed > 15 || (pct >= 10 && pct < 30)) ? "on" : "off",
        ledWifi: "on",
        ledAuto: true,
        battery: parseFloat(d.battery.toFixed(2)),
        batteryPercent: pct,
        batteryPresent: true,
        chargeState: pct >= 99 ? "full" : "discharging",
        powerSource: pct >= 99 ? "external" : "battery",
        wifiRssi: -55 + Math.round(Math.sin(d.t * 0.2) * 10),
        adcError: false,
        hostname: "demo",
        uptime: Math.floor(d.t * 20),
      });
      setConnected(true);
      setHistory(prev => ({
        speed: [...prev.speed.slice(-119), d.speed],
        dir:   [...prev.dir.slice(-119),   d.dir],
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
  }, [demoMode, esp32Host, applyData]);

  useEffect(() => {
    fetchData();
    // Основной канал — SSE (4 Гц). Опрос остаётся как heartbeat/фолбэк:
    // 1000 ms, not 500: the ESP32 web server answers with Connection: close, so every
    // poll holds one of lwIP's 16 TCP PCBs (CONFIG_LWIP_MAX_ACTIVE_TCP) for the whole
    // 60 s TIME_WAIT (CONFIG_LWIP_TCP_MSL). At 2 Hz that oversubscribes the pool ~7x
    // and the station intermittently stops answering. При живом SSE опрос — раз в 5 с.
    const id = setInterval(fetchData, sseActive && !demoMode ? 5000 : 1000);
    return () => clearInterval(id);
  }, [fetchData, sseActive, demoMode]);

  // Подписка на /api/stream. Старая прошивка ответит 404 → onerror → ретрай через
  // 15 с, дашборд тем временем живёт на обычном опросе.
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

  // Оптимистичный апдейт: сразу меняем локальный state, чтобы кнопка не ждала 2-секундный цикл опроса. Следующий poll подтвердит или откатит значение с железа.
  // Клик циклически переключает режим: выкл → вкл → мигание → выкл.
  const toggleLed = async (key) => {
    const NEXT_MODE = { off: "on", on: "blink", blink: "off" };
    const k = `led${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const nextValue = NEXT_MODE[data[k]] ?? "on";
    setData(prev => ({ ...prev, [k]: nextValue }));
    if (demoMode) return;
    await fetch(`http://${esp32Host}/api/led?${key}=${nextValue}`);
  };

  const toggleAuto = async () => {
    const nextValue = !data.ledAuto;
    setData(prev => ({ ...prev, ledAuto: nextValue }));
    if (demoMode) return;
    await fetch(`http://${esp32Host}/api/led?auto=${nextValue}`);
  };

  const resetGust = async () => {
    if (demoMode) {
      demoRef.current.gust = demoRef.current.speed;
      setData(prev => ({ ...prev, gust: parseFloat(demoRef.current.speed.toFixed(1)) }));
      return;
    }
    await fetch(`http://${esp32Host}/api/gust`);
  };

  const saveHost = (newHost) => {
    localStorage.setItem("esp32_host", newHost);
    setEsp32Host(newHost);
    setShowSettings(false);
    setDemoMode(false);
  };

  const toggleDemo = () => setDemoMode(m => !m);

  const bf = beaufort(data.speed);
  const hasDir = data.dirPresent && data.direction != null;
  const hasBattery = data.batteryPresent && data.battery != null;
  const dir = hasDir ? degToDir(data.direction) : null;
  const uptimeMin = Math.floor(data.uptime / 60);
  const uptimeH = Math.floor(uptimeMin / 60);
  const kmh = (data.speed * 3.6).toFixed(0);
  const batColor = batteryColor(data.batteryPercent ?? 0);
  // Under charge the pack sits at the charger's 4.2 V long before it is actually full,
  // so the percentage overstates. Say "заряжается" instead of implying a real level.
  const CHARGE_VIEW = {
    charging:    { label: "заряжается", color: "#38bdf8" },
    full:        { label: "заряжена",   color: "#22c55e" },
    discharging: { label: "разряд",     color: batColor  },
  };
  const charge = CHARGE_VIEW[data.chargeState] ?? null;
  // Derived from the charger's own status lines, not from a voltage guess: the TP4056
  // can only assert CHRG or STDBY while its input is powered.
  const POWER_VIEW = {
    external: { label: "от сети",    color: "#38bdf8" },
    battery:  { label: "от батареи", color: "#94a3b8" },
  };
  const power = POWER_VIEW[data.powerSource] ?? null;
  const powerSuffix = power ? ` · ${power.label}` : "";
  const rssi = rssiQuality(data.wifiRssi);
  const lastUpdateStr = lastUpdate
    ? `${Math.round((time - lastUpdate) / 1000)}с назад`
    : "—";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #020617 0%, #0f172a 50%, #020617 100%)",
      color: "#f8fafc",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: "24px 32px",
      boxSizing: "border-box",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "fixed",
        top: "20%",
        left: "30%",
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${bf.color}08, transparent 70%)`,
        pointerEvents: "none",
        transition: "background 2s ease",
      }} />

      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24,
        borderBottom: "1px solid #1e293b",
        paddingBottom: 16,
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${bf.color}, #e2e8f0)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: 3,
          }}>
            WIND STATION
          </h1>
          <div style={{ color: "#475569", fontSize: 11, marginTop: 4, letterSpacing: 1 }}>
            МЕТЕОСТАНЦИЯ ВЕТРА v1.1 · {demoMode ? "DEMO" : esp32Host}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, color: "#e2e8f0", fontWeight: 600 }}>
            {time.toLocaleTimeString("uk-UA")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444",
              boxShadow: connected ? "0 0 8px #22c55e88" : "0 0 8px #ef444488",
              animation: connected ? undefined : "pulse 1s infinite",
            }} />
            <span style={{ color: connected ? "#22c55e" : "#ef4444", fontSize: 11 }}>
              {connected ? (demoMode ? "ДЕМО" : (sseActive ? "ONLINE ⚡" : "ONLINE")) : "OFFLINE"}
            </span>
            <button onClick={toggleDemo} style={{
              background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
              borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer",
              marginLeft: 8, fontFamily: "inherit",
            }}>
              {demoMode ? "→ LIVE" : "→ DEMO"}
            </button>
            <button onClick={() => setShowSettings(true)} title="Настройки" style={{
              background: "#1e293b", border: "1px solid #334155", color: "#94a3b8",
              borderRadius: 6, padding: "2px 8px", fontSize: 10, cursor: "pointer",
              fontFamily: "inherit",
            }}>
              ⚙
            </button>
          </div>
        </div>
      </div>

      {/* Main grid; колонка направления рендерится только при живом датчике
          (текущий датчик — только скорость, dirPresent:false → колонки две).
          На телефоне складывается в одну колонку (см. @media внизу). */}
      <div className="main-grid" style={{
        display: "grid",
        gridTemplateColumns: hasDir ? "1fr 1fr 1fr" : "1fr 1fr",
        gap: 24,
        maxWidth: hasDir ? 1200 : 900,
        margin: "0 auto",
      }}>
        {/* Left — Compass (только с датчиком направления) */}
        {hasDir && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ color: "#64748b", fontSize: 10, letterSpacing: 3, textTransform: "uppercase" }}>
              Направление ветра
            </div>
            <Compass direction={data.direction} speed={data.speed} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, color: "#e2e8f0" }}>{dir.full}</div>
            </div>
          </div>
        )}

        {/* Center — Speed Gauge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{ color: "#64748b", fontSize: 10, letterSpacing: 3, textTransform: "uppercase" }}>
            Скорость ветра
          </div>
          <SpeedGauge speed={data.speed} gust={data.gust} maxSpeed={data.speedMax ?? 30} />
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <InfoCard
              label="Порыв"
              value={data.gust.toFixed(1)}
              unit="м/с"
              color="#f97316"
              action={
                <button onClick={resetGust} title="Сбросить порыв" style={{
                  position: "absolute", top: 8, right: 8,
                  background: "transparent", border: "1px solid #334155",
                  color: "#64748b", borderRadius: 4, padding: "2px 6px",
                  fontSize: 9, cursor: "pointer", fontFamily: "inherit",
                }}>
                  ↺
                </button>
              }
            />
            <InfoCard label="км/ч" value={kmh} color="#38bdf8" />
          </div>
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
            <InfoCard label="Шкала Бофорта" value={bf.scale} color={bf.color} />
            <InfoCard label="Аптайм" value={uptimeH > 0 ? `${uptimeH}ч ${uptimeMin % 60}м` : `${uptimeMin}м`} color="#a78bfa" />
          </div>
        </div>

        {/* Right — LED + History */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <LEDPanel
            leds={{
              green:  data.ledGreen,
              yellow: data.ledYellow,
              red:    data.ledRed,
              wifi:   data.ledWifi,
            }}
            autoMode={data.ledAuto}
            onToggle={toggleLed}
            onAutoToggle={toggleAuto}
          />

          <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, border: "1px solid #1e293b" }}>
            <div style={{ color: "#64748b", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
              Скорость — 2 мин
            </div>
            <Sparkline data={history.speed} color={bf.color} height={60} />
          </div>

          {hasDir && (
            <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, border: "1px solid #1e293b" }}>
              <div style={{ color: "#64748b", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Направление — 2 мин
              </div>
              <Sparkline data={unwrapAngles(history.dir)} color="#38bdf8" height={60} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom row — battery / wifi / last update / adc status */}
      <div className="bottom-grid" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 16,
        maxWidth: 1200,
        margin: "24px auto 0",
      }}>
        <InfoCard
          label={(hasBattery ? "Батарея" : "Батарея · нет") + powerSuffix}
          value={hasBattery ? data.battery.toFixed(2) : "—"}
          unit={hasBattery ? "V" : ""}
          color={hasBattery ? batColor : "#475569"}
        />
        <InfoCard
          label={hasBattery && charge ? `Заряд · ${charge.label}` : "Заряд"}
          value={hasBattery ? data.batteryPercent : "—"}
          unit={hasBattery ? "%" : ""}
          color={hasBattery ? (charge?.color ?? batColor) : "#475569"}
        />
        <InfoCard label={`WiFi · ${rssi.label}`} value={data.wifiRssi} unit="dBm" color={rssi.color} />
        <InfoCard
          label={data.adcError ? "ADC · ОШИБКА" : "Обновлено"}
          value={data.adcError ? "ERR" : lastUpdateStr}
          color={data.adcError ? "#ef4444" : "#94a3b8"}
        />
      </div>

      {showSettings && (
        <SettingsModal host={esp32Host} demoMode={demoMode} onSave={saveHost} onClose={() => setShowSettings(false)} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes ledBlink {
          0%, 49% { filter: none; }
          50%, 100% { filter: brightness(0.25); }
        }
        /* Телефон/планшет портретом: колонки в столбик, нижние карточки 2×2.
           Инлайн-стили перекрываются только с !important. */
        @media (max-width: 900px) {
          .main-grid { grid-template-columns: 1fr !important; }
          .bottom-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
