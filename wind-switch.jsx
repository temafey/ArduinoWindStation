import { useRef, useLayoutEffect, useState } from "react";
import { DIM, SANS, glow } from "./ui-kit.js";

// ============================================================
// ТУМБЛЕР
// ============================================================
// Выбор из двух — это не две кнопки, а одно положение. Пока настройки с двумя
// вариантами рисовались парой кнопок, состояние приходилось вычитывать из
// подсветки: какая из двух ярче. У тумблера состояние читается по позиции, и
// вычитывать нечего — таких настроек в дашборде набралось девять.
//
// Подписи остаются с обеих сторон и остаются нажимаемыми. Голый тумблер годится
// для «да/нет», но здесь половина пар — это «SSE / только опрос» и «своя сеть /
// домашняя сеть», где без слов непонятно, что означает крайнее положение.
//
// Вид — Liquid Glass (с 0.4.15): жёлоб — вдавленное стекло, в нём жидкость
// цвета акцента, шарик — капля стекла. Переключение — бросок капли: присела,
// вытянулась в пути, перелетела, вздрогнула и встала; жёлоб отзывается как
// желе, расходится кольцо и вспышка. Под пальцем шарик становится прозрачной
// линзой. Всё движение — transform и opacity, без перерисовок.

// ------------------------------------------------------------
// Стили
// ------------------------------------------------------------
// Отдаются строкой и вклеиваются в общий <style> дашборда — там же, где живёт
// вся остальная анимация. Отдельного CSS-файла у проекта нет намеренно: бандл
// собирается в один JS, а половина оформления в файле, который нечем
// перегенерировать без npm, уже один раз выходила боком.
export const SWITCH_CSS = `
  .sw { display: inline-flex; align-items: center; background: none !important;
        border: 0 !important; box-shadow: none !important; padding: 3px; cursor: pointer; flex-shrink: 0;
        -webkit-tap-highlight-color: transparent }
  .sw:not(:disabled):hover, .sw:not(:disabled):active { transform: none !important }
  .sw:focus-visible { outline: none }
  .sw:focus-visible .sw-track { outline: 2px solid rgba(255,255,255,0.65); outline-offset: 2px }
  /* Жёлоб — вдавленное стекло: тень внутрь сверху, отсвет снизу, тонкая кромка. */
  .sw-track {
    position: relative; display: block; box-sizing: border-box;
    width: var(--sw-w, 52px); height: var(--sw-h, 28px); border-radius: 999px;
    border: 0.5px solid rgba(255,255,255,0.22);
    background: rgba(255,255,255,0.07);
    box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.55), inset 0 -1px 1px rgba(255,255,255,0.10),
                0 0 0 0.5px rgba(0,0,0,0.25);
    transition: border-color .7s var(--ease-out), box-shadow .7s var(--ease-out);
  }
  /* Жидкость разливается от шарика по жёлобу пружиной — край догоняет с
     перелётом, как вода, которую плеснули. */
  .sw-track::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: radial-gradient(120% 140% at 20% 0%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%),
                var(--sw-accent, #67e8f9);
    opacity: 0; transform: scaleX(.18); transform-origin: 0 50%;
    box-shadow: inset 0 -2px 4px rgba(0,0,0,0.25);
    transition: transform .9s var(--ease-liq, var(--ease-spring)), opacity .55s var(--ease-out);
  }
  .sw.on .sw-track::before { opacity: .9; transform: none }
  .sw.on .sw-track { border-color: color-mix(in srgb, var(--sw-accent, #67e8f9) 70%, #fff);
    box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.35), 0 0 14px -3px var(--sw-accent, #67e8f9) }
  /* Блик пробегает по жидкости при включении — один проход, только transform. */
  .sw-shine { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none }
  .sw-shine::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; opacity: 0;
    background: linear-gradient(105deg, transparent 10%, rgba(255,255,255,0.8) 50%, transparent 90%);
    transform: translateX(-110%) }
  .sw.sw-anim.on .sw-shine::before { animation: swSheen .95s var(--ease-out) .15s }
  @keyframes swSheen { 0% { opacity: 0; transform: translateX(-110%) } 25% { opacity: 1 }
                       100% { opacity: 0; transform: translateX(260%) } }

  /* Шарик — капля стекла: белая, с бликом сверху и тенью. */
  .sw-knob {
    position: absolute; top: 50%; left: 2px; z-index: 1;
    width: var(--sw-kw, 30px); height: var(--sw-k, 22px);
    margin-top: calc(var(--sw-k, 22px) / -2);
    border-radius: 999px;
    background: linear-gradient(180deg, #ffffff, rgba(226,233,246,0.94));
    box-shadow: 0 0 0 0.5px rgba(0,0,0,0.28), 0 2px 7px rgba(0,0,0,0.45),
                inset 0 1px 0.5px #fff, inset 0 -1px 1px rgba(160,180,210,0.35);
    --sw-x: 0px;
    transform: translateX(var(--sw-x));
    transition: transform .9s var(--ease-spring), background .4s ease, box-shadow .4s ease;
  }
  .sw-knob::after { content: ""; position: absolute; left: 16%; right: 16%; top: 1.5px; height: 42%;
    border-radius: 999px; background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0));
    opacity: .85; transition: opacity .4s ease }
  .sw.on .sw-knob { --sw-x: calc(var(--sw-w, 52px) - var(--sw-kw, 30px) - 5px) }
  /* Бросок. Два имени (вкл/выкл): смена имени перезапускает анимацию на
     каждом переключении. */
  .sw.sw-anim.on .sw-knob  { animation: swThrowOn 1s var(--ease-out) both }
  .sw.sw-anim:not(.on) .sw-knob { animation: swThrowOff 1s var(--ease-out) both }
  @keyframes swThrowOn {
    0%   { transform: translateX(0) scale(1, 1) }
    14%  { transform: translateX(-2px) scale(.86, 1.1) }
    42%  { transform: translateX(calc(var(--sw-x) * .62)) scale(1.42, .8) }
    62%  { transform: translateX(calc(var(--sw-x) + 3px)) scale(.84, 1.14) }
    78%  { transform: translateX(calc(var(--sw-x) - 1px)) scale(1.07, .95) }
    90%  { transform: translateX(var(--sw-x)) scale(.98, 1.02) }
    100% { transform: translateX(var(--sw-x)) scale(1, 1) }
  }
  @keyframes swThrowOff {
    0%   { transform: translateX(calc(var(--sw-w, 52px) - var(--sw-kw, 30px) - 5px)) scale(1, 1) }
    14%  { transform: translateX(calc(var(--sw-w, 52px) - var(--sw-kw, 30px) - 3px)) scale(.86, 1.1) }
    42%  { transform: translateX(calc((var(--sw-w, 52px) - var(--sw-kw, 30px) - 5px) * .38)) scale(1.42, .8) }
    62%  { transform: translateX(-3px) scale(.84, 1.14) }
    78%  { transform: translateX(1px) scale(1.07, .95) }
    90%  { transform: translateX(0) scale(.98, 1.02) }
    100% { transform: translateX(0) scale(1, 1) }
  }
  /* Жёлоб вздрагивает от броска, как желе. */
  .sw.sw-anim.on .sw-track { animation: swJellyOn .8s var(--ease-out) }
  .sw.sw-anim:not(.on) .sw-track { animation: swJellyOff .8s var(--ease-out) }
  @keyframes swJellyOn  { 0% { transform: none } 30% { transform: scale(1.07, .9) } 55% { transform: scale(.97, 1.05) }
                          75% { transform: scale(1.015, .99) } 100% { transform: none } }
  @keyframes swJellyOff { 0% { transform: none } 30% { transform: scale(1.07, .9) } 55% { transform: scale(.97, 1.05) }
                          75% { transform: scale(1.015, .99) } 100% { transform: none } }
  /* Под пальцем шарик становится прозрачной линзой и вырастает — как в iOS 26:
     сквозь него видно жидкость в жёлобе. */
  .sw:active .sw-knob {
    animation: none !important;
    background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 62%), rgba(255,255,255,0.06);
    box-shadow: 0 0 0 0.5px rgba(0,0,0,0.3), 0 6px 16px rgba(0,0,0,0.4), 0 0 18px -4px var(--sw-accent, #67e8f9),
                inset 0 1px 0.5px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(255,255,255,0.4), inset 0 0 0 1px rgba(255,255,255,0.35);
    -webkit-backdrop-filter: blur(1.5px) saturate(1.9) brightness(1.15); backdrop-filter: blur(1.5px) saturate(1.9) brightness(1.15);
    transform: translateX(var(--sw-x)) scale(1.28, 1.36); transition-duration: .35s;
  }
  .sw:active .sw-knob::after { opacity: .45 }
  .app.eco .sw:active .sw-knob { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(255,255,255,0.55) }
  /* Кольцо и вспышка расходятся в момент переключения. */
  @keyframes swRing { from { opacity: .7; transform: scale(1) } to { opacity: 0; transform: scale(1.5, 2.1) } }
  @keyframes swFlash { 0% { opacity: .6; transform: scale(.4) } 100% { opacity: 0; transform: scale(2.6) } }
  .sw-ring { position: absolute; inset: -1px; border-radius: 999px; pointer-events: none;
             border: 1.5px solid var(--sw-accent, #67e8f9);
             box-shadow: 0 0 10px var(--sw-accent, #67e8f9);
             animation: swRing .95s var(--ease-out) forwards }
  .sw-flash { position: absolute; top: 50%; width: var(--sw-k, 22px); height: var(--sw-k, 22px);
              margin-top: calc(var(--sw-k, 22px) / -2); border-radius: 50%; pointer-events: none; opacity: 0;
              background: radial-gradient(circle, rgba(255,255,255,0.9), var(--sw-accent, #67e8f9) 40%, transparent 70%);
              animation: swFlash .75s var(--ease-out) .3s }
  .sw.on .sw-flash { right: 3px } .sw:not(.on) .sw-flash { left: 3px }

  .sw-mini { --sw-w: 36px; --sw-h: 20px; --sw-k: 15px; --sw-kw: 20px }
  .sw-side { font-family: ${SANS}; font-size: 10.5px; letter-spacing: .6px;
             cursor: pointer; user-select: none; white-space: nowrap; display: inline-block;
             transition: color .6s var(--ease-out), transform .7s var(--ease-spring), text-shadow .6s ease }
  .sw-side.lit { color: rgb(var(--ink, 231,238,246)); transform: translateY(-1px) scale(1.06); text-shadow: 0 0 10px rgba(255,255,255,0.45) }
  .sw-side:not(.lit) { color: rgba(var(--ink, 231,238,246),0.30); transform: translateY(1px) scale(.96) }
  .mo-off .sw-track, .mo-off .sw-track::before, .mo-off .sw-knob, .mo-off .sw-side { transition: none; animation: none !important }
  .mo-off .sw-ring, .mo-off .sw-flash, .mo-off .sw-shine { display: none }
  @media (prefers-reduced-motion: reduce) {
    .sw-knob, .sw-track { animation: none !important } .sw-ring, .sw-flash, .sw-shine { display: none }
  }

  /* Выбор из нескольких — стеклянный сегмент: жёлоб и капля, которая
     перетекает к выбранному пункту (см. Segments). */
  .seg { position: relative; display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; margin-top: 8px;
         border-radius: 16px; width: fit-content; max-width: 100%; box-sizing: border-box;
         background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.18);
         box-shadow: inset 0 1.5px 3px rgba(0,0,0,0.5), inset 0 -1px 1px rgba(255,255,255,0.08) }
  .seg > button { position: relative; z-index: 1; background: none !important; border: 0 !important; box-shadow: none !important;
         font-family: ${SANS}; font-size: 11px; padding: 6px 13px; border-radius: 13px !important; cursor: pointer;
         color: rgba(var(--ink, 231,238,246),0.5); white-space: nowrap;
         transition: color .6s var(--ease-out), transform .6s var(--ease-spring), text-shadow .6s ease }
  .seg > button:hover { color: rgba(var(--ink, 231,238,246),0.85) }
  .seg > button.on { color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.5) }
  .seg > button:not(:disabled):active { transform: scale(.9) }
  .seg-drop { position: absolute; left: 0; top: 0; z-index: 0; border-radius: 13px; pointer-events: none;
         transition: transform .85s var(--ease-spring), width .85s var(--ease-spring), height .85s var(--ease-spring) }
  .seg-drop i { position: absolute; inset: 0; border-radius: inherit; display: block;
         background: linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.10));
         box-shadow: 0 0 0 0.5px rgba(255,255,255,0.35), 0 4px 12px -3px rgba(0,0,0,0.5),
                     inset 0 1px 0.5px rgba(255,255,255,0.85), inset 0 -1px 1px rgba(255,255,255,0.25),
                     0 0 16px -6px rgba(140,210,255,0.8);
         -webkit-backdrop-filter: saturate(1.6) brightness(1.1); backdrop-filter: saturate(1.6) brightness(1.1) }
  .seg-drop.ga i { animation: segJellyA .85s var(--ease-out) }
  .seg-drop.gb i { animation: segJellyB .85s var(--ease-out) }
  @keyframes segJellyA { 0% { transform: none } 35% { transform: scale(1.2, .76) } 60% { transform: scale(.93, 1.09) } 80% { transform: scale(1.02, .98) } 100% { transform: none } }
  @keyframes segJellyB { 0% { transform: none } 35% { transform: scale(1.2, .76) } 60% { transform: scale(.93, 1.09) } 80% { transform: scale(1.02, .98) } 100% { transform: none } }
  .app.eco .seg-drop i { -webkit-backdrop-filter: none; backdrop-filter: none }
  /* Варианты: подвкладки (мелко, капсом), фильтры, крупный переключатель
     источника «Станция / Район». */
  .seg-tabs { margin-top: 0 }
  .seg-tabs > button { font-weight: 600; font-size: 9.5px; letter-spacing: 1.8px; text-transform: uppercase; padding: 8px 14px }
  .seg-chips { margin-top: 0 }
  .seg-chips > button { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; padding: 6px 12px }
  .seg-chips.seg-plain > button { text-transform: none; letter-spacing: .6px }
  .seg-big { margin-top: 0; border-radius: 999px; padding: 4px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; min-width: 230px }
  .seg-big > button { font-weight: 600; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; padding: 10px 22px; border-radius: 999px !important }
  .seg-big .seg-drop { border-radius: 999px }
  .seg-big .seg-drop i { background: linear-gradient(180deg, rgba(125,211,252,0.42), rgba(167,139,250,0.30));
    box-shadow: 0 0 0 0.5px rgba(255,255,255,0.4), 0 4px 14px -4px rgba(0,0,0,0.5), inset 0 1px 0.5px rgba(255,255,255,0.8),
                inset 0 -1px 1px rgba(255,255,255,0.25), 0 0 20px -4px rgba(125,211,252,0.7) }
  .sub-row > .seg, .chip-row > .seg { flex-wrap: nowrap; flex: none }
  @media (max-width: 560px) { .sub-row > .seg > button, .chip-row > .seg > button { flex: 1 0 auto } }

  /* Стеклянная пилюля-переключатель (слои карты и т.п.): капля стекла,
     при включении — подсветка цветом слоя и расходящееся кольцо. */
  .gpill { position: relative; display: inline-flex; align-items: center; gap: 6px; isolation: isolate;
    border-radius: 999px !important; white-space: nowrap; cursor: pointer;
    font-family: ${SANS}; font-size: 10px; letter-spacing: 1px; font-weight: 500; padding: 4px 11px 4px 4px !important;
    color: rgba(var(--ink, 231,238,246),0.55);
    background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02)) !important;
    border: 0.5px solid rgba(255,255,255,0.2) !important;
    box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.35), 0 3px 10px -5px rgba(0,0,0,0.5) !important;
    transition: transform .7s var(--ease-spring), color .5s ease, box-shadow .6s ease, border-color .6s ease, background .6s ease !important }
  .gpill.on { color: rgb(var(--ink, 231,238,246)); border-color: color-mix(in srgb, var(--pc, #67e8f9) 60%, #fff) !important;
    background: linear-gradient(180deg, color-mix(in srgb, var(--pc, #67e8f9) 26%, transparent), rgba(255,255,255,0.04)) !important;
    box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.55), 0 0 16px -4px var(--pc, #67e8f9), 0 3px 10px -5px rgba(0,0,0,0.5) !important }
  .gpill:not(:disabled):hover { transform: translateY(-2px) scale(1.04) !important }
  .gpill:not(:disabled):active { transform: scale(.9, .84) !important; transition-duration: .14s !important }
  .gpill-ring { position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
    border: 1.5px solid var(--pc, #67e8f9); box-shadow: 0 0 10px var(--pc, #67e8f9); animation: swRing .95s var(--ease-out) forwards }
  .mo-off .gpill-ring { display: none }
  .mo-off .seg-drop { transition: none } .mo-off .seg-drop i { animation: none !important }
`;

// Счётчик переключений: растёт, когда положение отличается от прошлого.
// По нему включается анимация броска (не при первом показе — иначе каждый
// тумблер «бросался» бы при открытии настроек) и перезапускаются кольцо и
// вспышка: новый ключ — новый узел — новый проигрыш.
function useFlips(on) {
  const st = useRef({ last: on, n: 0 });
  if (st.current.last !== on) { st.current.last = on; st.current.n += 1; }
  return st.current.n;
}

function Track({ n }) {
  return (
    <span className="sw-track">
      <span className="sw-shine" />
      <i className="sw-knob" />
      {n > 0 && <i className="sw-ring" key={`r${n}`} />}
      {n > 0 && <i className="sw-flash" key={`f${n}`} />}
    </span>
  );
}

// ------------------------------------------------------------
// Настроечный тумблер
// ------------------------------------------------------------
// on/off — не булевы, а описания двух положений: {value, label}. Половина
// настроек хранит не true/false, а строки («обычная»/«плотная», «ap»/«lan»),
// и приводить их к булевым значило бы держать перевод в каждом месте вызова.
export function Switch({ label, value, on, off, onChange, g, hint, accent }) {
  const isOn = value === on.value;
  const n = useFlips(isOn);
  const go = (v) => { if (v !== value) onChange(v); };

  // Пояснение — подсказкой при наведении, а не абзацем под каждым тумблером.
  return (
    <div style={{ marginBottom: 18 }} title={typeof hint === "string" ? hint : undefined}>
      {/* Тумблер стоит сразу за подписью, а не у правого края: в широкой
          панели настроек он уезжал на полэкрана от своего названия. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start",
                    gap: 16, flexWrap: "wrap" }}>
        <div style={{ color: DIM, fontSize: 9, letterSpacing: 2.4, textTransform: "uppercase",
                      textShadow: glow(g, 0.35), fontFamily: SANS, fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className={`sw-side${isOn ? "" : " lit"}`} onClick={() => go(off.value)}>
            {off.label}
          </span>
          <button
            type="button" role="switch" aria-checked={isOn} aria-label={label}
            className={`sw${isOn ? " on" : ""}${n > 0 ? " sw-anim" : ""}`}
            style={{ "--sw-accent": accent || "#67e8f9" }}
            onClick={() => go(isOn ? off.value : on.value)}
          >
            <Track n={n} />
          </button>
          <span className={`sw-side${isOn ? " lit" : ""}`} onClick={() => go(on.value)}>
            {on.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Тумблер внутри чужой кнопки
// ------------------------------------------------------------
// Без обработчиков и без роли: там, где переключателем работает вся кнопка
// целиком (слой карты, режим светодиодов), вложить в неё вторую кнопку нельзя —
// это недопустимая разметка, и клик всё равно ловил бы внешний элемент.
// Поэтому здесь только вид, а состояние и роль объявляет хозяин.
export function SwitchGlyph({ on, accent }) {
  const n = useFlips(!!on);
  return (
    <span className={`sw sw-mini${on ? " on" : ""}${n > 0 ? " sw-anim" : ""}`} aria-hidden="true"
          style={{ "--sw-accent": accent || "#67e8f9", pointerEvents: "none" }}>
      <Track n={n} />
    </span>
  );
}

// ------------------------------------------------------------
// Сегмент: выбор из нескольких
// ------------------------------------------------------------
// Капля стекла под выбранным пунктом перетекает к новому — пружиной, с
// желейной отдачей на месте. Положение меряется по самой кнопке, поэтому
// работает и когда пункты переносятся на вторую строку.
export function Segments({ value, options, onChange, ariaLabel, variant, style }) {
  const box = useRef(null);
  const [drop, setDrop] = useState(null);
  const flips = useRef(0);
  const last = useRef(value);
  if (last.current !== value) { last.current = value; flips.current += 1; }
  const n = flips.current;
  // Набор пунктов меняется (фильтр «Эфира»): капля должна перемериться.
  const sig = options.map((o) => String(o.value)).join("|");
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const place = () => {
      const b = el.querySelector("button.on");
      if (!b) { setDrop(null); return; }
      setDrop({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
    };
    place();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, sig]);
  return (
    <div className={`seg${variant ? " seg-" + variant : ""}`} ref={box} role="radiogroup" aria-label={ariaLabel} style={style}>
      {drop && (
        <span className={`seg-drop${n > 0 ? (n % 2 ? " ga" : " gb") : ""}`} aria-hidden="true"
              style={{ width: drop.w, height: drop.h, transform: `translate(${drop.x}px, ${drop.y}px)` }}>
          <i />
        </span>
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on}
                  className={on ? "on" : undefined} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Стеклянная пилюля-переключатель
// ------------------------------------------------------------
// Для независимых «вкл/выкл» с подписью и счётчиком (слои карты): внутри
// мини-тумблер, снаружи — капля стекла, которая подсвечивается цветом слоя.
export function GlassPill({ on, onClick, color, children, title, ...rest }) {
  const n = useFlips(!!on);
  return (
    <button type="button" role="switch" aria-checked={!!on} title={title} onClick={onClick}
            className={`gpill${on ? " on" : ""}`} style={{ "--pc": color || "#67e8f9" }} {...rest}>
      <SwitchGlyph on={on} accent={color} />
      {children}
      {n > 0 && <i className="gpill-ring" key={n} aria-hidden="true" />}
    </button>
  );
}
