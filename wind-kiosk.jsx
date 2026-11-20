// Режим «киоск»: весь экран под одну цифру — для старого планшета на стене.
//
// Никакого стекла, анимаций и свечения: чёрный экран, огромная скорость,
// порыв, балл и часы. Ночью (22–7) — тёмно-красным и тускло, чтобы планшет
// не светил на всю комнату и не сбивал ночное зрение. Выход — Esc, кнопка
// или двойное касание.
//
// Здесь же «поделиться»: снимок состояния картинкой PNG — через системное
// «Поделиться», а где его нет — загрузкой файла.
import { useEffect, useState } from "react";
import { speak, summaryText } from "./wind-alerts.js";

const MONO = "var(--ui-mono, ui-monospace, Consolas, monospace)";
const SANS = "var(--ui-sans, 'Segoe UI', system-ui, sans-serif)";

async function goFull(on) {
  try {
    if (window.wkWindow) {
      const now = await window.wkWindow.isFullscreen();
      if (now !== on) await window.wkWindow.toggleFullscreen();
      return;
    }
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* браузер не дал — киоск работает и в окне */ }
}

export default function Kiosk({ speedText, unit, gustText, bft, color, name, onClose, speed, gust, history }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    goFull(true);
    // Под чёрным экраном прокрутке делать нечего — её полоса торчала бы справа.
    const ov = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    let lock = null;
    navigator.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 1000);
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { clearInterval(t); window.removeEventListener("keydown", k); goFull(false); lock?.release?.(); document.documentElement.style.overflow = ov; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const h = now.getHours();
  const night = h >= 22 || h < 7;
  const fg = night ? "#7a1f1f" : "#e7eef6";
  const dim = night ? "#4a1414" : "rgba(231,238,246,0.45)";
  const btn = { background: "none", border: `1px solid ${dim}`, color: dim, borderRadius: 999, padding: "8px 16px",
    fontFamily: SANS, fontSize: 13, cursor: "pointer" };
  return (
    <div onDoubleClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "#000", color: fg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", userSelect: "none",
    }}>
      <div style={{ position: "absolute", top: 24, left: 28, right: 28, display: "flex", justifyContent: "space-between",
                    fontFamily: MONO, fontSize: "min(3vw, 22px)", color: dim }}>
        <span>{name}</span>
        <span>{now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: "min(34vw, 46vh)", lineHeight: 0.9,
                    fontVariantNumeric: "tabular-nums", color: night ? fg : color }}>{speedText}</div>
      <div style={{ fontFamily: SANS, fontSize: "min(5vw, 34px)", color: dim, marginTop: "2vh" }}>{unit}</div>
      <div style={{ display: "flex", gap: "6vw", marginTop: "5vh", fontFamily: MONO, fontSize: "min(6vw, 44px)" }}>
        <span><span style={{ color: dim, fontFamily: SANS, fontSize: "0.5em" }}>ПОРЫВ </span>{gustText}</span>
        <span><span style={{ color: dim, fontFamily: SANS, fontSize: "0.5em" }}>БФТ </span>{bft.scale}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: "min(3.4vw, 24px)", color: dim, marginTop: "1.5vh" }}>{bft.desc}</div>
      <div style={{ position: "absolute", bottom: 24, display: "flex", gap: 10 }}>
        <button style={btn} onClick={() => speak(summaryText(speed, gust, bft.desc))}>Сказать</button>
        <button style={btn} onClick={() => shareSnapshot({ speedText, unit, gustText, bft, color, name, history })}>Поделиться</button>
        <button style={btn} onClick={onClose}>Выход</button>
      </div>
    </div>
  );
}

// Снимок 1200×630 — размер превью ссылок в мессенджерах, чтобы картинка не обрезалась.
export async function shareSnapshot({ speedText, unit, gustText, bft, color, name, history }) {
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1119"); bg.addColorStop(1, "#04070a");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = "rgba(231,238,246,0.5)";
  x.font = "28px 'Segoe UI', sans-serif";
  x.fillText(name || "Станция", 60, 80);
  x.textAlign = "right";
  x.fillText(new Date().toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }), W - 60, 80);
  x.textAlign = "left";
  x.fillStyle = color;
  x.font = "600 220px Consolas, monospace";
  x.fillText(speedText, 56, 330);
  const sw = x.measureText(speedText).width;
  x.fillStyle = "rgba(231,238,246,0.55)";
  x.font = "40px 'Segoe UI', sans-serif";
  x.fillText(unit, 76 + sw, 330);
  x.fillStyle = "#e7eef6";
  x.font = "40px 'Segoe UI', sans-serif";
  x.fillText(`порыв ${gustText} · ${bft.scale} бфт · ${bft.desc}`, 60, 400);
  // кривая последних 10 минут
  const pts = (history || []).slice(-600).map((h) => h.s).filter(Number.isFinite);
  if (pts.length > 2) {
    const top = Math.max(5, ...pts) * 1.1, y0 = 560, gh = 110;
    x.beginPath();
    pts.forEach((v, i) => { const px = 60 + (i / (pts.length - 1)) * (W - 120), py = y0 - (v / top) * gh; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = color; x.lineWidth = 4; x.lineJoin = "round"; x.stroke();
    x.fillStyle = "rgba(231,238,246,0.35)"; x.font = "22px 'Segoe UI', sans-serif";
    x.fillText("последние 10 минут", 60, 600);
  }
  x.textAlign = "right"; x.fillStyle = "rgba(231,238,246,0.35)"; x.font = "22px 'Segoe UI', sans-serif";
  x.fillText("Weathered_Kiwi", W - 60, 600);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return;
  const file = new File([blob], `wind-${Date.now()}.png`, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Ветер" }); return; }
  } catch { /* отменили — ничего страшного */ return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
