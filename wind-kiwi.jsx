// Знак станции живёт отдельно от подсказчика намеренно. Знак виден всегда —
// он стоит в шапке, — а подсказчик открывают редко. Пока они лежали в одном
// файле, тридцать килобайт справки приходилось грузить ради одной картинки.
import { useId } from "react";

// ============================================================
// ЗНАК СТАНЦИИ
// ============================================================
// С 0.4.001 — та же стеклянная плитка, что у значка программы (make-icon.js):
// тёмная сцена с пятнами живого фона, иней, фаска, верхний блик и долька киви
// под стеклянной линзой. Сверх значка — движение: по плитке раз в несколько
// секунд проходит отсвет, а отблески на линзе мерцают. Под «меньше движения»
// всё это стоит.
//
// Киви — по-прежнему единственное цветное пятно интерфейса, и исключение
// осознанное: знак узнают по сочетанию зелёной мякоти, светлой сердцевины и
// чёрного венца семечек, а не по силуэту.
const TILE = "M24 2.5c11.4 0 15.6.4 18.3 3.2 2.8 2.7 3.2 6.9 3.2 18.3s-.4 15.6-3.2 18.3c-2.7 2.8-6.9 3.2-18.3 3.2s-15.6-.4-18.3-3.2C2.9 39.6 2.5 35.4 2.5 24s.4-15.6 3.2-18.3C8.4 2.9 12.6 2.5 24 2.5z";
const C = 24, R = 12.2, RX = R, RY = R * 0.86, T = -18;
const SEEDS = Array.from({ length: 12 }, (_, i) => {
  const d = i * 30 + 8, a = (d * Math.PI) / 180;
  return { d, x: C + RX * 0.54 * Math.cos(a), y: C + RY * 0.54 * Math.sin(a) };
});
const RAYS = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180);

const KM_CSS = `
.kiwi-mark .km-sheen { animation: kmSheen 7.8s cubic-bezier(.45,0,.2,1) infinite }
.kiwi-mark .km-tw { animation: kmTw 3.84s ease-in-out infinite; transform-box: fill-box; transform-origin: center }
.kiwi-mark .km-tw.d2 { animation-delay: 1.1s }
.kiwi-mark .km-tw.d3 { animation-delay: 2.2s }
@keyframes kmSheen { 0%, 62% { transform: translateX(-60px) skewX(-20deg) } 100% { transform: translateX(70px) skewX(-20deg) } }
@keyframes kmTw { 0%, 100% { opacity: .35; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.15) } }
@media (prefers-reduced-motion: reduce) { .kiwi-mark .km-sheen, .kiwi-mark .km-tw { animation: none } }
`;

export function KiwiMark({ size = 40, g }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n) => `km${u}${n}`;
  const url = (n) => `url(#${id(n)})`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="kiwi-mark"
         style={{ display: "block", flexShrink: 0, overflow: "visible",
                  filter: g === "off" ? "drop-shadow(0 3px 6px rgba(0,0,0,.45))"
                    : "drop-shadow(0 3px 7px rgba(0,0,0,.5)) drop-shadow(0 0 7px rgba(150,220,90,.35))" }}>
      <defs>
        <linearGradient id={id("base")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#13204a" /><stop offset=".55" stopColor="#0a0e24" /><stop offset="1" stopColor="#05070f" />
        </linearGradient>
        {[["b", "48,104,255"], ["v", "160,80,240"], ["t", "20,190,180"]].map(([n, rgb]) => (
          <radialGradient key={n} id={id(n)}>
            <stop offset="0" stopColor={`rgb(${rgb})`} stopOpacity=".95" />
            <stop offset=".6" stopColor={`rgb(${rgb})`} stopOpacity=".3" />
            <stop offset="1" stopColor={`rgb(${rgb})`} stopOpacity="0" />
          </radialGradient>
        ))}
        <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".85" /><stop offset=".35" stopColor="#fff" stopOpacity=".18" />
          <stop offset=".7" stopColor="#fff" stopOpacity=".06" /><stop offset="1" stopColor="#fff" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id={id("top")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("sheen")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("flesh")} cx=".46" cy=".42" r=".62">
          <stop offset="0" stopColor="#f6ffe6" /><stop offset=".22" stopColor="#d4f0a2" /><stop offset=".55" stopColor="#9ed45c" />
          <stop offset=".86" stopColor="#6fb33a" /><stop offset="1" stopColor="#4f8f2a" />
        </radialGradient>
        <linearGradient id={id("skin")} x1=".2" y1="0" x2=".8" y2="1">
          <stop offset="0" stopColor="#c49a5e" /><stop offset=".5" stopColor="#8a6436" /><stop offset="1" stopColor="#4a3419" />
        </linearGradient>
        <radialGradient id={id("halo")}>
          <stop offset="0" stopColor="#b8ff6a" stopOpacity=".6" /><stop offset=".55" stopColor="#7cff9a" stopOpacity=".16" />
          <stop offset="1" stopColor="#7cff9a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("lens")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".8" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={id("blur")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5" /></filter>
        <filter id={id("soft")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" /></filter>
        <clipPath id={id("clip")}><path d={TILE} /></clipPath>
      </defs>
      <style>{KM_CSS}</style>

      <g clipPath={url("clip")}>
        {/* сцена: тёмное стекло и пятна живого фона под инеем */}
        <rect width="48" height="48" fill={url("base")} />
        <g filter={url("blur")}>
          <circle cx="9" cy="10" r="17" fill={url("b")} opacity=".85" />
          <circle cx="42" cy="38" r="17" fill={url("v")} opacity=".75" />
          <circle cx="6" cy="44" r="12" fill={url("t")} opacity=".55" />
        </g>
        <rect width="48" height="48" fill="#fff" opacity=".035" />
        {/* ореол мякоти */}
        <circle cx={C} cy={C} r={R * 1.6} fill={url("halo")} />
        {/* долька */}
        <g transform={`rotate(${T} ${C} ${C})`}>
          <ellipse cx={C + 0.8} cy={C + 2.6} rx={RX * 1.12} ry={RY * 1.12} fill="#000" opacity=".5" filter={url("soft")} />
          <ellipse cx={C + 0.6} cy={C + 0.9} rx={RX * 1.15} ry={RY * 1.17} fill={url("skin")} />
          <ellipse cx={C} cy={C} rx={RX} ry={RY} fill={url("flesh")} />
          <ellipse cx={C} cy={C} rx={RX * 0.92} ry={RY * 0.92} fill="none" stroke="#e9f8cf" strokeWidth=".42" opacity=".45" />
          {RAYS.map((a, i) => (
            <line key={i} x1={C + RX * 0.3 * Math.cos(a)} y1={C + RY * 0.3 * Math.sin(a)}
                  x2={C + RX * 0.86 * Math.cos(a)} y2={C + RY * 0.86 * Math.sin(a)}
                  stroke="#effbd9" strokeWidth=".27" opacity=".38" strokeLinecap="round" />
          ))}
          {SEEDS.map((sd, i) => (
            <g key={i} transform={`rotate(${sd.d} ${sd.x} ${sd.y})`}>
              <ellipse cx={sd.x} cy={sd.y} rx="1.04" ry=".55" fill="#1b160c" />
              <ellipse cx={sd.x - 0.25} cy={sd.y - 0.25} rx=".36" ry=".17" fill="#fff" opacity=".55" />
            </g>
          ))}
          <ellipse cx={C} cy={C} rx={RX * 0.3} ry={RY * 0.3} fill="#fbfff2" opacity=".9" filter={url("soft")} />
          <ellipse cx={C} cy={C} rx={RX * 0.24} ry={RY * 0.24} fill="#fdfff7" />
        </g>
        {/* линза над долькой: дуга-блик и мерцающие отблески */}
        <path d={`M ${C - R * 0.95} ${C - R * 0.05} A ${R} ${R * 0.9} 0 0 1 ${C + R * 0.15} ${C - R * 0.9}`}
              fill="none" stroke={url("lens")} strokeWidth={R * 0.12} strokeLinecap="round" opacity=".8" />
        <g transform={`rotate(-38 ${C - R * 0.42} ${C - R * 0.5})`}>
          <ellipse className="km-tw" cx={C - R * 0.42} cy={C - R * 0.5} rx={R * 0.16} ry={R * 0.08} fill="#fff" opacity=".85" />
        </g>
        <circle className="km-tw d2" cx={C + R * 0.58} cy={C + R * 0.42} r=".6" fill="#fff" />
        <circle className="km-tw d3" cx={C + R * 0.2} cy={C - R * 0.62} r=".4" fill="#fff" />
        {/* верхний блик стекла и бегущий отсвет */}
        <path d="M6 6.5C10 3.6 16 3 24 3s14 .6 18 3.5c-3 6.5-10.5 9.5-18 9.5S9 13 6 6.5z" fill={url("top")} />
        <rect className="km-sheen" x="0" y="-10" width="14" height="68" fill={url("sheen")} opacity=".55" />
      </g>
      {/* фаска: светлая кромка сверху слева, отсвет снизу справа */}
      <path d={TILE} fill="none" stroke={url("rim")} strokeWidth="1.1" />
    </svg>
  );
}

// ============================================================
// ТОНАЛЬНЫЙ ЗНАК (с 0.5.0)
// ============================================================
// Тот же силуэт плитки и та же долька, но плоско, как значки Material You:
// тональная заливка вместо стекла, без бликов, линзы и свечения. Рисунок —
// одна строка SVG, потому что он же идёт в значок вкладки браузера (favicon);
// make-icon.js повторяет его для значков Windows и Android.
export function tonalSvg(size = 48) {
  const seeds = SEEDS.map((sd) =>
    `<ellipse cx="${sd.x.toFixed(2)}" cy="${sd.y.toFixed(2)}" rx="1.15" ry=".62" fill="#2a2214" transform="rotate(${sd.d} ${sd.x.toFixed(2)} ${sd.y.toFixed(2)})"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">`
    + `<path d="${TILE}" fill="#d6ecc2"/>`
    + `<g transform="rotate(${T} ${C} ${C})">`
    + `<ellipse cx="${C}" cy="${C + 0.6}" rx="${(RX * 1.17).toFixed(2)}" ry="${(RY * 1.19).toFixed(2)}" fill="#7d5c35"/>`
    + `<ellipse cx="${C}" cy="${C}" rx="${RX}" ry="${RY.toFixed(2)}" fill="#86c34f"/>`
    + `<ellipse cx="${C}" cy="${C}" rx="${(RX * 0.8).toFixed(2)}" ry="${(RY * 0.8).toFixed(2)}" fill="#a7d872"/>`
    + seeds
    + `<ellipse cx="${C}" cy="${C}" rx="${(RX * 0.27).toFixed(2)}" ry="${(RY * 0.27).toFixed(2)}" fill="#f3fbe6"/>`
    + `</g></svg>`;
}

const TONAL_URL = () => "data:image/svg+xml," + encodeURIComponent(tonalSvg());

export function TonalMark({ size = 40 }) {
  return (
    <img src={TONAL_URL()} width={size} height={size} alt="" draggable={false} className="kiwi-mark kiwi-tonal"
         style={{ display: "block", flexShrink: 0, filter: "drop-shadow(0 1px 2px rgba(0,0,0,.22))" }} />
  );
}

// Значок вкладки браузера — тот же выбор, что у знака в шапке.
export function setFavicon(tonal) {
  try {
    const link = document.querySelector("link[rel='icon']");
    if (!link) return;
    if (!link.dataset.orig) link.dataset.orig = link.getAttribute("href") || "";
    link.setAttribute("href", tonal ? TONAL_URL() : link.dataset.orig);
  } catch { /* нет документа */ }
}
