// Тема «Тональная» — в духе приложений Google (Material You / Material 3).
//
// Это не отдельная тема th-*, а «кожа» поверх Liquid Glass (класс sk-material):
// раскладка дока, капли выбора, пружины, желе, искры, наклон блоков — всё,
// что двигается, остаётся тем же. Меняется материал: вместо стекла — плоские
// непрозрачные поверхности, глубину дают тона, а не блики и иней.
//
// Что взято из Material 3, и почему именно так:
//  - поверхности тональные: страница — surface, карточки — surface-container
//    (на светлой — белые карточки на голубовато-сером листе, как в Диске и
//    Gmail); ни рамок, ни теней у карточек — у M3 глубина делается тоном;
//  - большие скругления: карточки 24 px, плитки 20, окна 28, плавающая кнопка
//    настроек — скруглённый квадрат 16 px (FAB), а не круг;
//  - подписи обычными строчными, без разрядки: капитель с разрядкой — приём
//    приборной панели, у Google так не пишут; гарнитура Google Sans / Roboto,
//    где их нет — системный гротеск, цифры моноширинные по ширине;
//  - выбранное — «индикатор» тона secondary-container: пилюля под значком
//    в доке, капля в сегментах (с галочкой, как в сегментированных кнопках M3);
//  - тумблер M3: в выключенном — маленький кружок цвета обводки на тёмном
//    жёлобе с обводкой, во включённом — жёлоб цвета primary и крупный кружок
//    с галочкой; под пальцем кружок вырастает;
//  - ползунок M3 Expressive: толстая дорожка и ручка-черта с зазором;
//  - фильтр-чипы скруглены на 8 px, выбранный — тоном, а не рамкой;
//  - отклик на касание — «state layer»: пятно текущего цвета 12–14 %.
//
// Палитра — тональная от синего зерна, как у самих приложений Google.
// Светлая или тёмная — по настройке «Фон»: «Светлая» (scene light) или «Тёмная».

const DARK = `
    --md-surface: #131314; --md-card: #1e1f20; --md-c-high: #282a2c; --md-c-highest: #333537;
    --md-fl: #2b2d30;
    --md-on: #e3e3e3; --md-on-var: #c4c7c5; --md-outline: #8e918f; --md-outline-var: #444746;
    --md-primary: #a8c7fa; --md-on-primary: #062e6f; --md-pc: #0842a0; --md-on-pc: #d3e3fd;
    --md-sc: #004a77; --md-on-sc: #c2e7ff;
    --md-elev: 0 1px 3px rgba(0,0,0,0.3), 0 4px 8px 3px rgba(0,0,0,0.15);
    --md-ter: #d0bcff; --md-tc: #4a3d7a; --md-on-tc: #e9ddff; --md-mint: #7fd9c4;
    --ink: 227,227,227; --rule: 196,199,197;`;
const LIGHT = `
    --md-surface: #f0f4f9; --md-card: #ffffff; --md-c-high: #e9eef6; --md-c-highest: #dde3ea;
    --md-fl: #ffffff;
    --md-on: #1f1f1f; --md-on-var: #444746; --md-outline: #747775; --md-outline-var: #c4c7c5;
    --md-primary: #0b57d0; --md-on-primary: #ffffff; --md-pc: #d3e3fd; --md-on-pc: #041e49;
    --md-sc: #c2e7ff; --md-on-sc: #001d35;
    --md-elev: 0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15);
    --md-ter: #6b4fc9; --md-tc: #e6deff; --md-on-tc: #21005d; --md-mint: #1b9b84;
    --ink: 31,31,31; --rule: 68,71,70;`;

// Галочка для выбранного сегмента и тумблера — маской, цветом текущего текста.
const CHECK = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M9.55 18 3.85 12.3l1.43-1.42 4.27 4.27 9.17-9.18 1.43 1.43z'/></svg>")}")`;

export const MATERIAL_THEMES = { plain: { label: "По умолчанию" }, glass: { label: "Liquid Glass" }, material: { label: "Тональная" } };

// Цвет значков (шестерёнка, кнопки справа от дока, индикатор вкладки): синие —
// тоны primary/secondary-container, «в цвет фона» — нейтральные тона самой
// поверхности (surface-container-highest под значком, чернила тем же тоном,
// что весь текст; включённое — инвертировано). Значения — через переменные,
// и правила ниже про цвет сами ничего не знают.
const ICONS = {
  blue: `--md-ic: var(--md-pc); --md-on-ic: var(--md-on-pc); --md-ic-hi: var(--md-primary); --md-on-ic-hi: var(--md-on-primary);
    --md-ic-sc: var(--md-sc); --md-on-ic-sc: var(--md-on-sc);`,
  bg: `--md-ic: var(--md-c-highest); --md-on-ic: var(--md-on); --md-ic-hi: var(--md-on); --md-on-ic-hi: var(--md-surface);
    --md-ic-sc: var(--md-c-highest); --md-on-ic-sc: var(--md-on);`,
};
export const MATERIAL_ICONS = { blue: { label: "синие" }, bg: { label: "в цвет фона" } };

export function materialCss(light, icons = "blue") {
  const M = ".app.sk-material.sk-material";
  return `
  :root { ${light ? LIGHT : DARK} --ui-bg: var(--md-surface); color-scheme: ${light ? "light" : "dark"} }
  .ink-dark, .no-glow { --ink: 231,238,246; --rule: 160,180,200; color-scheme: dark }
  html, body, #root { background: var(--md-surface) !important }
  ${M} {
    background-color: var(--md-surface) !important; color: var(--md-on);
    background-image:
      radial-gradient(60% 46% at 100% 0%, color-mix(in srgb, var(--md-primary) ${light ? 20 : 22}%, transparent), transparent 70%),
      radial-gradient(52% 44% at 0% 100%, color-mix(in srgb, var(--md-ter) ${light ? 18 : 20}%, transparent), transparent 70%),
      radial-gradient(40% 34% at 8% 4%, color-mix(in srgb, var(--md-mint) ${light ? 12 : 10}%, transparent), transparent 70%) !important;
    background-attachment: fixed !important;
    --ui-sans: 'Google Sans Text', 'Google Sans', 'Product Sans', Roboto, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    --ui-mono: 'Google Sans Text', 'Google Sans', Roboto, 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
    --pnl-line: transparent; --pnl-head-line: transparent;
    --md-grad: linear-gradient(155deg, color-mix(in srgb, var(--md-primary) ${light ? 9 : 10}%, var(--md-card)), var(--md-card) 58%, color-mix(in srgb, var(--md-ter) ${light ? 8 : 9}%, var(--md-card)));
    --md-lift: 0 1px 2px rgba(0,0,0,${light ? 0.06 : 0.35}), 0 14px 30px -18px color-mix(in srgb, var(--md-primary) ${light ? 55 : 40}%, transparent), inset 0 1px 0 rgba(255,255,255,${light ? 0.9 : 0.05});
    --pnl-bg: var(--md-grad); --pnl-shadow: var(--md-lift); --pnl-blur: none; --pnl-corner: 24px;
    --stat-bg: var(--md-grad); --stat-shadow: var(--md-lift);
    --fl-bg: var(--md-fl); --fl-shadow: var(--md-elev);
    --md-gap: var(--md-card);
    ${ICONS[icons] || ICONS.blue}
  }

  /* ---- никакого стекла: ни инея, ни линзы, ни фаски, ни блика, ни света ---- */
  ${M} *, ${M} *::before, ${M} *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important }
  ${M} :is(.pnl, .stat, .tutor-box)::before, ${M} :is(.pnl, .stat, .tutor-box)::after { display: none !important }
  ${M} .lg-lit { display: none !important }
  /* Свечение у Liquid Glass — правило с !important на четырёх классах; здесь пять. */
  .app.sk-material.sk-material.sk-material.sk-material.sk-material *:not(:where(.ink-dark, .ink-dark *, .no-glow, .no-glow *)) { text-shadow: none !important }
  ${M} :is(.pnl, .stat, .tutor-box) svg:not(.no-glow):not(.no-glow *) { filter: none !important }
  ${M} .stat { border-radius: 20px !important }

  /* ---- типографика: строчные, без разрядки ---- */
  ${M} *:not(svg *):not(:where(.ink-dark *)) { text-transform: none !important; letter-spacing: normal !important }
  /* В немецком существительные пишутся с прописной — строчные их испортили бы,
     поэтому там капитель остаётся капителью (lang ставит wind-i18n.js). */
  html:not([lang="de"]) ${M} .caps { text-transform: lowercase !important }
  html:not([lang="de"]) ${M} .caps::first-letter { text-transform: uppercase !important }
  /* Кнопки панелей: главная — залитая primary, прочие — с обводкой (M3). */
  ${M} button.btn-pri:not(:disabled) { background: var(--md-primary) !important; color: var(--md-on-primary) !important; border-color: transparent !important }
  ${M} button.btn-pri:disabled { background: rgba(var(--ink),0.12) !important; border-color: transparent !important }
  ${M} button.btn { border-color: var(--md-outline) !important; color: var(--md-primary) !important }
  ${M} button.btn:disabled { color: rgba(var(--ink),0.38) !important; border-color: rgba(var(--ink),0.12) !important }
  ${M} :is(button.btn, button.btn-pri) { padding: 10px 20px !important; font-size: 13px !important; font-weight: 500 !important }
  ${M} .pnl > header { border-bottom-color: transparent !important }
  ${M} .pnl > header > :first-child { font-size: 14px !important; font-weight: 500 !important; color: var(--md-on) !important }
  ${M} .ar-gauge-in b { ${light ? "filter: brightness(.68) saturate(1.5)" : ""} }

  /* ---- кнопки: пилюли, состояние наведения — слой текущего цвета ---- */
  ${M} button { border-radius: 999px }
  ${M} button:hover:not(:disabled) { box-shadow: none !important;
    background-image: linear-gradient(rgba(var(--ink),0.08), rgba(var(--ink),0.08)) !important }
  ${M} .lg-touch i { background: radial-gradient(closest-side, rgba(var(--ink),0.16), rgba(var(--ink),0)) !important }
  ${M} .rip { border-color: rgba(var(--ink),0.3) !important }
  ${M} :is(.ar-btn, .gpill) { box-shadow: none !important }
  ${M} .ar-btn { background: var(--md-sc) !important; color: var(--md-on-sc) !important; border-color: transparent !important }
  /* ---- градиенты и пузыри: мягкие цветные пятна дрейфуют под карточками ---- */
  ${M}::before, ${M}::after { content: ""; position: fixed; z-index: 0; pointer-events: none; border-radius: 50%;
    filter: blur(46px); opacity: ${light ? 0.5 : 0.42} }
  ${M}::before { width: 34vmax; height: 34vmax; right: -9vmax; top: 18vh;
    background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--md-primary) 70%, #fff 0%), transparent 68%);
    animation: mdDriftA 38s ease-in-out infinite alternate }
  ${M}::after { width: 28vmax; height: 28vmax; left: -8vmax; bottom: 6vh;
    background: radial-gradient(circle at 60% 40%, color-mix(in srgb, var(--md-ter) 75%, transparent), transparent 68%);
    animation: mdDriftB 46s ease-in-out infinite alternate }
  @keyframes mdDriftA { from { transform: translate(0,0) scale(1) } to { transform: translate(-9vmax, 10vh) scale(1.18) } }
  @keyframes mdDriftB { from { transform: translate(0,0) scale(1) } to { transform: translate(10vmax, -12vh) scale(0.9) } }
  .app.sk-material.eco::before, .app.sk-material.eco::after { animation: none }
  /* Заголовок панели получает цветную чёрточку-«бульбашку» вместо пустоты. */
  ${M} .pnl > header > :first-child { display: inline-flex; align-items: center; gap: 9px }
  ${M} .pnl > header > :first-child::before { display: inline-block !important; content: ""; width: 6px; height: 16px; border-radius: 99px; margin: 0;
    background: linear-gradient(180deg, var(--md-primary), var(--md-ter)) }
  ${M} button.btn-pri:not(:disabled) { background: linear-gradient(135deg, var(--md-primary), color-mix(in srgb, var(--md-primary) 55%, var(--md-ter))) !important;
    box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--md-primary) 80%, transparent) !important }
  ${M} .ar-btn.big { background: linear-gradient(135deg, var(--md-primary), color-mix(in srgb, var(--md-primary) 55%, var(--md-ter))) !important }
  ${M} .dock, ${M} nav:not(.dock *) { background: linear-gradient(160deg, color-mix(in srgb, var(--md-primary) 10%, var(--md-fl)), var(--md-fl) 60%, color-mix(in srgb, var(--md-ter) 9%, var(--md-fl))) !important }
  ${M} .modal-card { background: linear-gradient(160deg, color-mix(in srgb, var(--md-primary) 9%, var(--md-c-high)), var(--md-c-high) 55%, color-mix(in srgb, var(--md-ter) 8%, var(--md-c-high))) !important }
  ${M} .seg-drop i, ${M} .seg-big .seg-drop i { background: linear-gradient(135deg, var(--md-sc), color-mix(in srgb, var(--md-sc) 60%, var(--md-tc))) !important }
  ${M} .liq-range .liq-f { --lc: var(--md-primary) !important; --le: var(--md-ter) !important }
  ${M} .led-card { background: linear-gradient(160deg, color-mix(in srgb, var(--md-primary) 8%, var(--md-c-high)), var(--md-c-high)) !important }
  ${M} .ar-btn.big { background: var(--md-primary) !important; color: var(--md-on-primary) !important; font-weight: 500 !important }
  ${M} .ar-steps b { background: var(--md-pc) !important; color: var(--md-on-pc) !important; border-color: transparent !important }
  ${M} :is(.ar-p, .ar-sens span, .eco-auto) { color: var(--md-primary) !important }
  ${M} :is(.ver-chip, .ar-chip) { border-radius: 8px !important; border-color: var(--md-outline-var) !important;
    background: transparent !important; box-shadow: none !important }
  ${M} :is(input:not([type=range]), select, textarea) { border-radius: 8px !important; background: transparent !important;
    border: 1px solid var(--md-outline) !important; color: var(--md-on) !important; box-shadow: none !important }
  ${M} :is(input:not([type=range]), select, textarea):focus { border: 2px solid var(--md-primary) !important; outline: none !important }
  ${M} button:focus-visible { outline: 2px solid var(--md-primary) !important; outline-offset: 2px }
  ${M} ::selection { background: color-mix(in srgb, var(--md-primary) 30%, transparent) }

  /* ---- док: плавающая панель M3 Expressive с индикатором-пилюлей ---- */
  ${M} .dock { background: var(--md-fl) !important; box-shadow: var(--md-elev) !important; border: 0 !important; border-radius: 28px !important }
  ${M} .dock :is(nav, .dock-bar) { background: transparent !important; box-shadow: none !important; border: 0 !important }
  ${M} nav:not(.dock *) { background: var(--md-fl) !important; box-shadow: var(--md-elev) !important; border: 0 !important }
  ${M} .dock-tabs > button { color: var(--md-on-var) !important }
  ${M} .dock-tabs > button.tab-on { color: var(--md-on-ic-sc) !important; font-weight: 600 !important }
  ${M} .dock-tabs > button::before { display: none !important }
  ${M} nav .tab-mark { background: var(--md-ic-sc) !important; box-shadow: none !important }
  ${M} .dock-bar::before { background: linear-gradient(90deg, transparent, var(--md-primary), transparent) !important; box-shadow: none !important }
  ${M} .dock-row:is(.dock-left, .dock-right) .dock-bar::before { background: linear-gradient(0deg, transparent, var(--md-primary), transparent) !important }
  ${M} .dock-bar::after { background-image: radial-gradient(closest-side, var(--md-primary), transparent) !important }
  ${M} .dock-panel { --md-gap: var(--md-fl) }

  /* Шестерёнка и кнопки справа от дока — круглые, как и во всех темах: значки
     в Liquid Glass круглые, и менять форму вместе с материалом незачем. Две
     кнопки в демо-режиме — одна вытянутая капсула. */
  ${M} .gear-btn { border-radius: 50% !important; background: var(--md-ic) !important; color: var(--md-on-ic) !important;
    border: 0 !important; box-shadow: var(--md-elev) !important }
  /* Пульсирующее кольцо остаётся — по форме кнопки и цветом значка. */
  ${M} .gear-btn::before { border-radius: 50% !important; border-color: color-mix(in srgb, var(--md-ic-hi) 55%, transparent) !important }
  ${M} .gear-btn.fab-pill { border-radius: 999px !important }
  ${M} .gear-btn.fab-pill::before { border-radius: 999px !important }
  ${M} .fab-pill .fab-half { border-radius: 999px !important }
  ${M} .fab-pill .fab-half.is-on { background: var(--md-ic-hi) !important; color: var(--md-on-ic-hi) !important; box-shadow: none !important }
  ${M} .dock-gear::before, ${M} .dock-gear::after { display: none !important }
  ${M} .dock-gear { border-radius: 50% !important; border: 0 !important; background: var(--md-ic) !important; color: var(--md-on-ic) !important; box-shadow: none !important }
  ${M} .dock-open .dock-gear { background: var(--md-ic-hi) !important; color: var(--md-on-ic-hi) !important; box-shadow: none !important }

  /* ---- окна ---- */
  ${M} .modal-card { background: var(--md-c-high) !important; border-radius: 28px !important; box-shadow: var(--md-elev) !important; border: 0 !important }
  ${M} .set-scrim { background: rgba(0,0,0,0.32) }
  ${M} .lg-edge-top { background: linear-gradient(180deg, var(--md-surface), color-mix(in srgb, var(--md-surface) 50%, transparent) 55%, transparent) !important }
  ${M} .lg-edge-bot { background: linear-gradient(0deg, var(--md-surface), color-mix(in srgb, var(--md-surface) 45%, transparent) 55%, transparent) !important }

  /* ---- сегменты: сегментированная кнопка M3 ---- */
  ${M} .seg { background: transparent !important; border: 1px solid var(--md-outline) !important; box-shadow: none !important }
  ${M} .seg > button { color: var(--md-on) !important; font-weight: 500 !important }
  ${M} .seg > button.on { color: var(--md-on-sc) !important }
  ${M} .seg > button.on::before { content: ""; display: inline-block; width: 15px; height: 15px; margin: 0 5px -3px -2px;
    background: currentColor; -webkit-mask: ${CHECK} center / contain no-repeat; mask: ${CHECK} center / contain no-repeat;
    animation: mdCheck .5s var(--ease-spring) both }
  @keyframes mdCheck { from { transform: scale(0) rotate(-30deg); opacity: 0 } to { transform: none; opacity: 1 } }
  ${M} .seg-drop i, ${M} .seg-big .seg-drop i { background: var(--md-sc) !important; box-shadow: none !important }

  /* ---- тумблер M3 ---- */
  ${M} .sw:not(.sw-mini) { --sw-w: 52px; --sw-h: 32px; --sw-k: 24px; --sw-kw: 27px }
  ${M} .sw { --sw-accent: var(--md-primary) !important }
  ${M} .sw-track { background: var(--md-c-highest) !important; border: 2px solid var(--md-outline) !important; box-shadow: none !important }
  ${M} .sw.on .sw-track { border-color: var(--md-primary) !important; box-shadow: none !important }
  ${M} .sw-track::before { background: var(--md-primary) !important; box-shadow: none !important }
  ${M} .sw.on .sw-track::before { opacity: 1 }
  ${M} .sw-shine { display: none }
  ${M} .sw:not(.sw-mini) .sw-knob { width: 24px !important; left: 2px }
  ${M} .sw-knob { background: transparent !important; box-shadow: none !important }
  ${M} .sw-knob::after { inset: 4px !important; height: auto !important; border-radius: 50% !important; opacity: 1 !important;
    background: var(--md-outline) !important; transition: inset .45s var(--ease-spring), background .3s ease !important }
  ${M} .sw.on .sw-knob::after { inset: 0 !important; background: var(--md-on-primary) !important }
  ${M} .sw.on .sw-knob::before { content: ""; position: absolute; inset: 4px; z-index: 1; background: var(--md-primary);
    -webkit-mask: ${CHECK} center / contain no-repeat; mask: ${CHECK} center / contain no-repeat;
    animation: mdCheck .5s var(--ease-spring) .1s both }
  ${M} .sw-mini .sw-knob::before { display: none }
  ${M} .sw:active .sw-knob { background: transparent !important; box-shadow: 0 0 0 8px color-mix(in srgb, var(--md-primary) 14%, transparent) !important;
    transform: translateX(var(--sw-x)) scale(1.12) !important }
  ${M} .sw:active .sw-knob::after { inset: -1px !important }
  ${M} .sw-side.lit { color: var(--md-on) !important; transform: none !important }

  /* ---- ползунок M3 Expressive: толстая дорожка, ручка-черта с зазором ---- */
  ${M} .liq-range { --th: 14px !important; --tc: var(--md-primary) !important }
  ${M} .liq-range .liq { background: var(--md-sc) !important; box-shadow: none !important; border-radius: 999px !important }
  ${M} .liq-range .liq-f { --lc: var(--md-primary) !important; --le: var(--md-primary) !important; box-shadow: none !important }
  ${M} .liq-thumb { width: 4px !important; height: 40px !important; margin: -20px 0 0 -2px !important; border-radius: 2px !important;
    background: var(--md-primary) !important; box-shadow: 0 0 0 5px var(--md-gap) !important }
  ${M} .liq-thumb::before, ${M} .liq-thumb::after { display: none !important }

  /* ---- чипы слоёв карты: фильтр-чип M3 ---- */
  ${M} .gpill { border-radius: 8px !important; background: transparent !important; color: var(--md-on-var) !important;
    border: 1px solid var(--md-outline-var) !important }
  ${M} .gpill.on { background: var(--md-sc) !important; color: var(--md-on-sc) !important; border-color: transparent !important }

  /* ---- жидкие заливки остаются жидкими, но без стеклянного блеска ---- */
  ${M} .liq:not(.liq-range .liq) { background: var(--md-c-highest) !important; box-shadow: none !important }
  ${M} .liq-f { box-shadow: none !important }
  ${M} .sys-bat { background: var(--md-c-highest) !important; box-shadow: none !important }

  /* ---- плитки светодиодов: тональные карточки, свет — заливкой цвета ---- */
  ${M} .led-card { border: 0 !important; background: var(--md-c-high) !important; box-shadow: none !important; border-radius: 20px !important }
  ${M} .led-card.lit { background: color-mix(in srgb, var(--c) 16%, var(--md-c-high)) !important; box-shadow: none !important }
`;
}
