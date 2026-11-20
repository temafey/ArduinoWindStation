import { useEffect, useRef } from "react";
import { haptic } from "./wind-haptic.js";

// Жидкая заливка: батарея, ползунки, столбики, прогресс обновления.
//
// Заливка не стоит, а «плавает»: у края бежит волна, по поверхности —
// блик, а при смене значения край догоняет его пружиной с перелётом, как
// вода, которую качнули. Всё движение — transform на псевдоэлементах, то есть
// работа композитора без единой перерисовки: на стекле, где каждая лишняя
// перерисовка будит размытие под панелью, иначе было нельзя.
//
// Разметка:
//   .liq        — дорожка: обрезает всё, что вылезает (волна у края)
//   .liq-f      — сама заливка, её ширина (или высота) и есть значение
//     ::after   — волна у края: полоса с маской-синусоидой, едет вдоль края
//   .liq-in     — своя обрезка для блика, чтобы он не выходил за заливку
//     ::before  — блик-волна по поверхности
//     ::after   — неподвижный глянец сверху
//
// dir="x" — заливка слева направо, "y" — снизу вверх.
// color — фон заливки (можно градиент), edge — цвет волны у края (по
// умолчанию тот же; у градиента его надо дать сплошным, иначе узкая полоса
// края покажет весь градиент сжатым).

export function Liquid({ v, color, edge, dir = "x", fast, busy, className = "", style, children }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)) * 100;
  const cls = `liq liq-${dir}${fast ? " liq-fast" : ""}${busy ? " liq-busy" : ""}`
    + `${p < 0.5 ? " liq-empty" : ""}${p > 99.5 ? " liq-full" : ""}${className ? " " + className : ""}`;
  const fill = { [dir === "x" ? "width" : "height"]: `${p.toFixed(2)}%` };
  if (color) fill["--lc"] = color;
  if (edge || color) fill["--le"] = edge || color;
  return (
    <span className={cls} style={style} aria-hidden="true">
      <span className="liq-f" style={fill}><span className="liq-in" /></span>
      {children}
    </span>
  );
}

// Ползунок: жидкая дорожка под настоящей стеклянной ручкой. Родная ручка
// input прозрачна и нужна только как зона нажатия — рисует ручку отдельный
// элемент .liq-thumb, потому что у псевдоэлемента ручки нет ни линзы
// (backdrop-filter с SVG-фильтром), ни слоёв блика, ни своих переменных.
// Положение — та же арифметика, что у браузера: центр ручки tw/2 + v·(W − tw).
// Дорожка лежит ПОД ручкой в той же капсуле дока/панели, поэтому линза
// преломляет именно жидкость и подписи под ней — в этом весь эффект.
// При движении ручка растягивается вдоль хода пропорционально скорости и
// пружинит назад (ось Y сжимается — объём сохраняется), под пальцем она
// вырастает и становится прозрачной, как у iOS 26.
export function LiquidRange({ value, min = 0, max = 100, color, thick, className = "", wrapStyle, onInput, ...rest }) {
  const v = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const wrap = useRef(null), thumb = useRef(null), prev = useRef(v), t = useRef(0);
  // Щелчки вибрации: 24 «зубца» на всю дорожку, независимо от шага ползунка —
  // у батареи шаг 0.01 В, и щелчок на каждый шаг слился бы в гул. У края —
  // удар посильнее, как упор.
  const notch = useRef(Math.round(v * 24));
  useEffect(() => () => clearTimeout(t.current), []);
  const squash = (e) => {
    if (onInput) onInput(e);
    const w = wrap.current, th = thumb.current;
    if (!w || !th) return;
    const nv = max > min ? (Number(e.target.value) - min) / (max - min) : 0;
    const nn = Math.round(nv * 24);
    if (nn !== notch.current) { notch.current = nn; haptic(nv <= 0 || nv >= 1 ? "edge" : "tick"); }
    const tw = parseFloat(getComputedStyle(th).width) || 44;
    const dx = Math.abs(nv - prev.current) * Math.max(1, w.offsetWidth - tw);
    prev.current = nv;
    const k = Math.min(0.34, dx * 0.045);
    th.style.setProperty("--sx", (1 + k).toFixed(3));
    th.style.setProperty("--sy", (1 - k * 0.55).toFixed(3));
    clearTimeout(t.current);
    t.current = setTimeout(() => { th.style.setProperty("--sx", "1"); th.style.setProperty("--sy", "1"); }, 70);
  };
  return (
    <span ref={wrap} className="liq-range" style={{ "--th": thick ? `${thick}px` : undefined, "--v": v, "--tc": color, ...wrapStyle }}>
      <Liquid v={v} color={color} fast className="liq-track" />
      <input type="range" min={min} max={max} value={value} className={className} onInput={squash} {...rest} />
      <span ref={thumb} className="liq-thumb" aria-hidden="true" />
    </span>
  );
}

// Волна у края. Маски — SVG одной синусоиды, повторённой вдоль края; полоса
// длиннее края на период и уезжает ровно на период — шов не виден.
const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const EDGE_X = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='6' height='14'><path d='M0 0H3.75C5.5 2 5.5 5 3.75 7C2 9 2 12 3.75 14H0Z'/></svg>`);
const EDGE_Y = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='14' height='5'><path d='M0 5V1.75C2 0 5 0 7 1.75C9 3.5 12 3.5 14 1.75V5Z'/></svg>`);
const SHEEN = svg(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='12' preserveAspectRatio='none' viewBox='0 0 28 12'><path d='M0 4C5 1 9 1 14 4S23 7 28 4' fill='none' stroke='white' stroke-width='1.6' stroke-opacity='.75'/></svg>`);

// Пружины. linear() — настоящая кривая затухающего колебания (ζ ≈ 0.5), а не
// кубическая «спинка»: перелёт, лёгкий недолёт и спокойная посадка. Браузер
// без linear() оставляет прежние cubic-bezier — @supports ниже.
export const SPRING = "linear(0, 0.042, 0.148, 0.293, 0.455, 0.616, 0.763, 0.89, 0.99, 1.064, 1.113, 1.139, 1.148, 1.142, 1.127, 1.105, 1.081, 1.058, 1.036, 1.017, 1.002, 0.991, 0.984, 0.979, 0.978, 0.979, 0.981, 0.984, 0.988, 0.991, 0.995, 0.997, 1, 1.001, 1.002, 1.003, 1)";
export const SPRING_SOFT = "linear(0, 0.044, 0.15, 0.287, 0.431, 0.569, 0.691, 0.793, 0.874, 0.936, 0.98, 1.009, 1.027, 1.036, 1.038, 1.037, 1.033, 1.028, 1.022, 1.017, 1.012, 1.008, 1.005, 1.003, 1.001, 1, 0.999, 0.999, 1)";

export const LIQUID_CSS = `
  /* --ease-spring — для переходов и анимаций в две точки; многоступенчатые
     анимации остаются на --ease-back: кривая с колебанием применяется к
     каждому отрезку между ключевыми кадрами, и пружина дрожала бы на каждом. */
  :root { --ease-liq: cubic-bezier(.34,1.5,.5,1); --ease-spring: cubic-bezier(.32,1.56,.48,1) }
  @supports (transition-timing-function: linear(0, 1)) {
    :root { --ease-spring: ${SPRING_SOFT}; --ease-liq: ${SPRING} }
  }
  .liq { position: relative; display: block; overflow: hidden; isolation: isolate;
    background: rgba(var(--rule, 255,255,255),0.11); box-shadow: inset 0 1px 2px rgba(0,0,0,0.45) }
  .liq-f { position: absolute; left: 0; bottom: 0; border-radius: inherit;
    background: var(--lc, #5cc8ff); box-shadow: 0 0 12px -2px var(--le, #5cc8ff) }
  .liq-x .liq-f { top: 0; transition: width 1.49s var(--ease-liq), background-color .68s }
  .liq-y .liq-f { right: 0; transition: height 1.49s var(--ease-liq), background-color .68s }
  .liq-fast .liq-f { transition-duration: .74s }
  /* Волна у края — продолжение самой заливки, а не наклейка поверх: тот же
     цвет и тот же глянец (.liq-in::after), заход внутрь на 2 px, а у
     переднего края заливки углы прямые — скругление там вырезало бы зазубрины
     между волной и телом. Полоса стоит на месте во всю высоту края, едет
     маска: так глянец у полосы совпадает с телом пиксель в пиксель.
     Перерисовка — полоса 6 px, дешевле любого слоя. */
  .liq-x .liq-f, .liq-x .liq-in { border-top-right-radius: 0; border-bottom-right-radius: 0 }
  /* Вертикальная заливка (столбики): верхние углы скруглены, а волна у края
     к бокам затухает — иначе в узком столбике она обрывалась с обеих сторон
     ровным срезом, и заливка выглядела плоской лодочкой, а не жидкостью. Теперь
     поверхность — мениск: в середине волна, к стенкам она сходит на нет. */
  .liq-y .liq-f, .liq-y .liq-in { border-top-left-radius: 3px; border-top-right-radius: 3px }
  .liq-f::after { content: ""; position: absolute; pointer-events: none }
  .liq-x .liq-f::after { top: 0; bottom: 0; right: -4px; width: 6px;
    background: linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0) 55%, rgba(0,0,0,0.12)), var(--le, #5cc8ff);
    -webkit-mask: ${EDGE_X} 0 0 / 6px 14px repeat-y; mask: ${EDGE_X} 0 0 / 6px 14px repeat-y;
    animation: liqEdgeX 1.8s linear infinite }
  .liq-y .liq-f::after { left: 0; right: 0; top: -3px; height: 5px;
    background: linear-gradient(rgba(255,255,255,0.38), rgba(255,255,255,0.33)), var(--le, #5cc8ff);
    -webkit-mask: ${EDGE_Y} 0 0 / 14px 5px repeat-x, linear-gradient(90deg, transparent, #000 34%, #000 66%, transparent) 0 0 / 100% 100% no-repeat;
    mask: ${EDGE_Y} 0 0 / 14px 5px repeat-x, linear-gradient(90deg, transparent, #000 34%, #000 66%, transparent) 0 0 / 100% 100% no-repeat;
    -webkit-mask-composite: source-in; mask-composite: intersect;
    animation: liqEdgeY 2.04s linear infinite }
  .liq-empty .liq-f::after, .liq-full .liq-f::after { opacity: 0 }
  .liq-in { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none }
  .liq-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: -28px; right: 0;
    background: ${SHEEN} 0 0 / 28px 100% repeat-x; opacity: .5; mix-blend-mode: overlay;
    animation: liqSheen 3.12s linear infinite; will-change: transform }
  .liq-in::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0) 55%, rgba(0,0,0,0.12)) }
  .liq-busy .liq-f::after { animation-duration: .94s }
  .liq-busy .liq-in::before { animation-duration: 1.49s; opacity: .8 }
  @keyframes liqEdgeX { to { -webkit-mask-position: 0 14px; mask-position: 0 14px } }
  @keyframes liqEdgeY { to { -webkit-mask-position: 14px 0, 0 0; mask-position: 14px 0, 0 0 } }
  @keyframes liqSheen { to { transform: translate3d(28px, 0, 0) } }

  /* Ползунок. Родные дорожка и ручка прозрачны (ручка — зона нажатия шириной
     --tw), все !important: старые правила .lg-range / .rng красили их по-своему,
     а вид теперь один на все ползунки. */
  .liq-range { position: relative; display: block; --tw: 46px }
  .liq-range > .liq-track { position: absolute; left: 0; right: 0; top: 50%; height: var(--th, 7px);
    margin-top: calc(var(--th, 7px) / -2); border-radius: 999px; pointer-events: none;
    background: rgba(255,255,255,0.10);
    box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.5), inset 0 -1px 1px rgba(255,255,255,0.10),
                0 0 0 0.5px rgba(255,255,255,0.14), 0 1px 0 rgba(255,255,255,0.08) }
  .liq-range > input { -webkit-appearance: none !important; appearance: none !important; position: relative; z-index: 1;
    display: block; width: 100% !important; height: 34px !important; margin: 0 !important; padding: 0;
    background: transparent !important; cursor: grab; border-radius: 0 !important; outline: none;
    touch-action: pan-y; -webkit-tap-highlight-color: transparent }
  .liq-range > input:active { cursor: grabbing }
  .liq-range > input::-webkit-slider-runnable-track { height: 34px !important; background: transparent !important;
    box-shadow: none !important; border: none !important; filter: none !important }
  .liq-range > input::-moz-range-track { height: 34px; background: transparent !important; border: none }
  .liq-range > input::-moz-range-progress { background: transparent !important }
  .liq-range > input::-webkit-slider-thumb { -webkit-appearance: none !important; appearance: none !important;
    width: var(--tw) !important; height: 34px !important; margin: 0 !important; border: none !important;
    border-radius: 0 !important; background: transparent !important; box-shadow: none !important; transform: none !important }
  .liq-range > input::-moz-range-thumb { width: var(--tw) !important; height: 34px !important; border: none !important;
    border-radius: 0 !important; background: transparent !important; box-shadow: none !important; transform: none !important }

  /* Ручка: стеклянная капсула. Слои снизу вверх — линза (backdrop-filter
     с --lg-lens, её ставит startLens по размеру ручки; без линзы — просто
     размытие), белая «заливка» покоя (::before, под пальцем гаснет — ручка
     становится прозрачной линзой), глянец сверху (::after), фаска и тень
     (box-shadow), свечение цвета заливки. Всё движение — transform. */
  .liq-thumb { position: absolute; z-index: 2; top: 50%; height: 28px; width: var(--tw); margin: -14px 0 0 calc(var(--tw) / -2);
    left: calc(var(--tw) / 2 + (100% - var(--tw)) * var(--v, 0)); border-radius: 999px; pointer-events: none;
    --ps: 1; --sx: 1; --sy: 1;
    transform: scale(calc(var(--ps) * var(--sx)), calc(var(--ps) * var(--sy)));
    transition: transform .55s var(--ease-liq), box-shadow .45s ease;
    background: linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.12));
    -webkit-backdrop-filter: blur(1.5px) var(--lg-lens,) saturate(1.9) brightness(1.1);
    backdrop-filter: blur(1.5px) var(--lg-lens,) saturate(1.9) brightness(1.1);
    box-shadow: inset 0 1.2px 0.5px rgba(255,255,255,0.95), inset 0 -1.5px 1px rgba(255,255,255,0.42),
                inset 0 0 0 0.6px rgba(255,255,255,0.38), inset 0 0 14px rgba(255,255,255,0.16),
                0 0 0 0.5px rgba(0,0,0,0.30), 0 7px 14px -5px rgba(0,0,0,0.6),
                0 0 16px -4px color-mix(in srgb, var(--tc, #7dd3fc) 70%, transparent) }
  .liq-thumb::before { content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: linear-gradient(180deg, #ffffff, #e4ecf8); opacity: .66; transition: opacity .5s ease }
  .liq-thumb::after { content: ""; position: absolute; left: 12%; right: 12%; top: 1.5px; height: 44%;
    border-radius: 999px; pointer-events: none;
    background: linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0));
    opacity: .9; transition: opacity .5s ease }
  .liq-range > input:hover ~ .liq-thumb { --ps: 1.06 }
  .liq-range > input:active ~ .liq-thumb { --ps: 1.3 }
  .liq-range > input:active ~ .liq-thumb::before { opacity: .12 }
  .liq-range > input:active ~ .liq-thumb::after { opacity: .5 }
  .liq-range > input:active ~ .liq-thumb {
    box-shadow: inset 0 1.2px 0.5px rgba(255,255,255,1), inset 0 -1.5px 1px rgba(255,255,255,0.55),
                inset 0 0 0 1px rgba(255,255,255,0.5), inset 0 0 18px rgba(255,255,255,0.22),
                0 0 0 0.5px rgba(0,0,0,0.32), 0 12px 22px -6px rgba(0,0,0,0.6),
                0 0 26px -2px color-mix(in srgb, var(--tc, #7dd3fc) 85%, transparent) }
  .liq-range > input:focus-visible ~ .liq-thumb { outline: 2px solid rgba(255,255,255,0.7); outline-offset: 2px }
  /* Эко: линзы нет, ручка плотнее. */
  .app.eco .liq-thumb { -webkit-backdrop-filter: none; backdrop-filter: none }
  .app.eco .liq-thumb::before { opacity: .92 }
  .app.eco .liq-range > input:active ~ .liq-thumb::before { opacity: .6 }
  .mo-off .liq-thumb, .mo-off .liq-thumb::before, .mo-off .liq-thumb::after { transition: none }

  /* Кольцо прибора: пузырьки бегут по залитой дуге. Маска — та же дуга. */
  .liq-ring { animation: liqRing 10.8s linear infinite; transform-origin: 70px 70px; transform-box: view-box }
  @keyframes liqRing { to { transform: rotate(360deg) } }

  .mo-off .liq-f::after, .mo-off .liq-in::before, .mo-off .liq-ring { animation: none }
  .mo-off .liq-f { transition: none }
  @media (prefers-reduced-motion: reduce) {
    .liq-f::after, .liq-in::before, .liq-ring { animation: none }
  }
`;

// Общая динамика: наклон блока к курсору, быстрое нажатие и пружинный
// отпуск. Только мышь и не в эко-режиме — наклон стеклянной панели заставляет
// перерисовать иней под ней.
export const MOTION_CSS = `
  @media (hover: hover) and (pointer: fine) {
    .app:not(.mo-off):not(.eco) .blk:hover {
      transform: perspective(1100px) rotateX(var(--tlx, 0deg)) rotateY(var(--tly, 0deg)) translateY(-5px) scale(1.012) }
    .app:not(.mo-off):not(.eco) .blk:hover:active {
      transform: perspective(1100px) rotateX(var(--tlx, 0deg)) rotateY(var(--tly, 0deg)) translateY(-1px) scale(.992) }
  }
  .app:not(.mo-off) button:not(:disabled):active { transition-duration: .12s }
`;
