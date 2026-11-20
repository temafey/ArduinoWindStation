// Светлая тема «По умолчанию».
//
// Белый лист, чёрные тонкие грани у панелей, две маленькие виньетки по углам
// (сама подложка — SCENES.light в wind-custom.jsx). Всё остальное дашборда
// рисовалось под тёмный фон, и вывернуть его наизнанку можно только потому,
// что цвета текста и линеек идут через переменные --ink / --rule (тройки RGB,
// см. ui-kit.js): здесь им дают тёмные значения, и весь инлайн перекрашивается
// сам, включая атрибуты SVG.
//
// Чтобы белое не резало глаз:
//  - фон не #fff, а очень светлый холодный серый, сами панели — белые: лист
//    лежит на столе, а не светит фонариком;
//  - чернила не #000, а графит с синевой (24,28,36), подписи — его прозрачность;
//  - грань чёрная, но в 0.5 px поверх 1 px светлой линии — чёткая, не жирная;
//  - вместо свечения текста (на белом оно мутное гало) — ничего; глубину дают
//    мягкие длинные тени с синим отливом, а не серые;
//  - акцентные цвета (голубой, жёлтый, зелёный) на белом теряют контраст,
//    поэтому в тексте они затемняются через color-mix, а заливки остаются.
//
// «Тёмные островки» (.ink-dark) — карта, снимки «Эфира», сцена камеры: это
// экраны поверх тёмной картинки, и внутри них чернила снова светлые.

export const LIGHT_CSS = `
  :root { --ink: 24,28,36; --rule: 22,26,34; --ui-bg: #f4f5f8; color-scheme: light }
  .ink-dark, .no-glow { --ink: 231,238,246; --rule: 160,180,200; color-scheme: dark }

  /* Чёрное стекло — светлая замена голубо-фиолетовых акцентов Liquid Glass:
     графитовый объём с бликом сверху, тонкая светлая кромка и мягкая тень. */
  :root {
    --blk: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 42%),
           linear-gradient(180deg, #353b47 0%, #161a22 52%, #07090d 100%);
    --blk-shadow: 0 0 0 0.5px rgba(0,0,0,0.75), 0 8px 18px -8px rgba(8,10,16,0.7),
                  inset 0 1px 0.5px rgba(255,255,255,0.55), inset 0 -1px 0.5px rgba(255,255,255,0.12),
                  inset 0 0 12px rgba(255,255,255,0.06);
    --blk-line: linear-gradient(180deg, #4a5160, #0b0d12);
  }
  .app.sc-light {
    color: rgb(24,28,36);
    --pnl-line: rgba(14,16,22,0.86);
    --pnl-head-line: rgba(14,16,22,0.10);
    --pnl-bg: linear-gradient(180deg, #ffffff, rgba(255,255,255,0.94));
    --pnl-shadow: 0 1px 2px rgba(20,32,60,0.06), 0 18px 40px -24px rgba(20,32,60,0.32),
                  inset 0 1px 0 #fff;
    --stat-bg: linear-gradient(90deg, #2a2f3a, rgba(14,16,22,0.55) 60%, transparent)
                 14px 100% / calc(100% - 28px) 2px no-repeat,
               linear-gradient(180deg, #ffffff, rgba(255,255,255,0.94));
    --stat-shadow: 0 1px 2px rgba(20,32,60,0.06), 0 14px 30px -20px rgba(20,32,60,0.30), inset 0 1px 0 #fff;
    /* Плавающее стекло над белым: молочное, с чёрной гранью и тенью. */
    --fl-bg: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.70));
    --fl-shadow: 0 0 0 0.75px rgba(14,16,22,0.85), 0 2px 6px -2px rgba(20,32,60,0.18),
                 0 18px 40px -16px rgba(20,32,60,0.35), inset 0 1px 0 #fff;
  }
  /* Свечение текста на белом — мутное гало. Вне тёмных островков его нет. */
  /* Тройной класс — чтобы перебить свечение темы (.th-liquid:not(.eco) …
     [style*="text-shadow: none"] с !important). */
  .app.sc-light.sc-light.sc-light *:not(:where(.ink-dark, .ink-dark *)) { text-shadow: none !important }
  .app.sc-light.sc-light.sc-light :is(.pnl, .stat, .tutor-box) svg:not(.no-glow):not(.no-glow *) { filter: none }
  /* Цифра в кольце — цветом скорости, но на белом светлые тона (штиль —
     бледно-голубой) не читаются: темнее и насыщеннее того же оттенка. */
  .app.sc-light .ar-gauge-in b { filter: brightness(.68) saturate(1.5) }
  /* Край прокрутки: на белом — молочная дымка, а не тёмная тень. */
  .app.sc-light .lg-edge-top { background: linear-gradient(180deg, rgba(244,245,248,0.92), rgba(244,245,248,0.5) 55%, rgba(244,245,248,0)) }
  .app.sc-light .lg-edge-bot { background: linear-gradient(0deg, rgba(244,245,248,0.9), rgba(244,245,248,0.45) 55%, rgba(244,245,248,0)) }
  .app.sc-light .set-scrim { background: rgba(236,240,248,0.45) }
  .app.sc-light .gear-btn { color: rgba(24,28,36,0.82) }
  .app.sc-light .gear-btn:hover { color: rgb(24,28,36) }
  /* Фаска стекла белая — на белой панели она пропадает, оставим след. */
  .app.sc-light :is(.pnl, .stat, .tutor-box)::before { opacity: .35 }
  .app.sc-light :is(.pnl, .stat, .tutor-box)::after { opacity: .5 }
  .app.sc-light .lg-touch i { background: radial-gradient(closest-side, rgba(14,16,22,0.10), rgba(14,16,22,0)) !important }
  .app.sc-light .rip { border-color: rgba(24,28,36,0.35) !important }
  .app.sc-light ::selection { background: rgba(14,16,22,0.16) }
  .app.sc-light button:focus-visible, .app.sc-light input:focus-visible { outline-color: rgba(24,28,36,0.6) }

  /* Переключатели и сегменты: тёмная капля-стекло на светлом жёлобе. */
  .app.sc-light .seg { background: linear-gradient(180deg, rgba(14,16,22,0.06), rgba(14,16,22,0.03)) !important;
    border-color: rgba(14,16,22,0.55) !important; box-shadow: inset 0 1px 2px rgba(14,16,22,0.08) !important }
  .app.sc-light .seg > button { color: rgba(24,28,36,0.55) }
  .app.sc-light .seg > button:hover { color: rgba(24,28,36,0.9) }
  .app.sc-light .seg > button.on { color: #fff }
  .app.sc-light .seg-drop i, .app.sc-light .seg-big .seg-drop i { background: var(--blk) !important; box-shadow: var(--blk-shadow) !important }
  .app.sc-light .sw-track { background: linear-gradient(180deg, rgba(14,16,22,0.10), rgba(14,16,22,0.05)) !important;
    box-shadow: inset 0 0 0 0.75px rgba(14,16,22,0.6), inset 0 1px 3px rgba(14,16,22,0.14) !important }
  .app.sc-light .sw-knob { box-shadow: 0 0 0 0.75px rgba(14,16,22,0.55), 0 3px 8px -2px rgba(10,14,30,0.45), inset 0 1px 0 #fff !important }
  .app.sc-light .sw-side.lit { color: rgb(24,28,36) }
  .app.sc-light .gpill { color: rgba(24,28,36,0.6);
    background: linear-gradient(180deg, #fff, rgba(255,255,255,0.8)) !important;
    border-color: rgba(14,16,22,0.5) !important; box-shadow: 0 3px 10px -6px rgba(20,32,60,0.35) !important }
  .app.sc-light .gpill.on { color: rgb(24,28,36);
    background: linear-gradient(180deg, color-mix(in srgb, var(--pc) 22%, #fff), #fff) !important;
    border-color: color-mix(in srgb, var(--pc) 70%, #000) !important }

  /* Тумблеры: включённый — чёрная жидкость вместо цвета темы. */
  .app.sc-light .sw, .app.sc-light .sw-mini { --sw-accent: #161a22 !important }
  /* Ползунки: чёрная жидкость с бликом, жёлоб — серым, ручка — с гранью. */
  .app.sc-light .liq-range { --tc: #161a22 !important }
  .app.sc-light .liq-range .liq-f { --lc: linear-gradient(180deg, #4a5160, #12151c 60%, #07090d) !important; --le: #161a22 !important }
  .app.sc-light .liq { background: rgba(14,16,22,0.08) !important; box-shadow: inset 0 0 0 0.75px rgba(14,16,22,0.35) }
  .app.sc-light .liq-thumb { box-shadow: 0 0 0 0.75px rgba(14,16,22,0.6), 0 4px 10px -3px rgba(10,14,30,0.45), inset 0 1px 0 #fff !important }

  /* Чёрточка в шапке панели и линия под плиткой сводки. */
  .app.sc-light .pnl > header > :first-child::before { background: var(--blk-line) !important }
  .app.sc-light .stat::after { background: linear-gradient(90deg, rgba(14,16,22,0.7), rgba(14,16,22,0.3), transparent) !important }
  .app.sc-light .eco-auto { color: rgb(24,28,36) !important; text-decoration: underline }
  /* Шов между пультом и настройками и бусина, что по нему бежит. */
  .app.sc-light .dock-bar::before { background: linear-gradient(90deg, transparent, rgba(14,16,22,0.35) 16%, #161a22 58%, rgba(14,16,22,0.6) 84%, transparent) !important;
    box-shadow: 0 0 calc(var(--mb, 1) * 10px) rgba(8,10,16,0.25) !important }
  .app.sc-light .dock-row:is(.dock-left, .dock-right) .dock-bar::before {
    background: linear-gradient(0deg, transparent, rgba(14,16,22,0.35) 16%, #161a22 58%, rgba(14,16,22,0.6) 84%, transparent) !important }
  .app.sc-light .dock-bar::after { background-image: radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(22,26,34,0.4) 55%, transparent) !important }
  /* Кольцо значка в доке: тёмная фаска. */
  .app.sc-light .dock-tabs > button::before {
    background: linear-gradient(145deg, rgba(14,16,22,0.55), rgba(14,16,22,0.08) 36%, rgba(14,16,22,0) 56%, rgba(14,16,22,0.45)) !important }
  .app.sc-light .dock-tabs > button.tab-on::before {
    background: linear-gradient(145deg, rgba(14,16,22,0.9), rgba(14,16,22,0.18) 34%, rgba(14,16,22,0) 56%, rgba(14,16,22,0.75)) !important }
  /* Шестерёнка при открытых настройках и включённое ручное управление —
     капля чёрного стекла с белым значком. */
  .app.sc-light .dock-open .dock-gear, .app.sc-light .fab-pill .fab-half.is-on {
    background: var(--blk) !important; box-shadow: var(--blk-shadow) !important; color: #fff !important }
  /* Полоса обновления и заставка после него. */
  .app.sc-light { --upd-c: #161a22 }
  .boot-slide .boot-liq .liq-f { --lc: linear-gradient(90deg, #4a5160, #07090d) !important; --le: #07090d !important;
    box-shadow: 0 0 10px rgba(8,10,16,0.35) !important }
  .boot-slide b { box-shadow: 0 0 0 0.75px rgba(0,0,0,0.7), 0 3px 10px rgba(8,10,16,0.45), 0 0 0 4px rgba(14,16,22,0.10) !important }
  /* «Район»: крупная кнопка, шаги, подписи прогноза. */
  .app.sc-light .ar-btn.big { border-color: rgba(14,16,22,0.85) !important; box-shadow: inset 0 1px 0 #fff, 0 10px 24px -12px rgba(8,10,16,0.5) !important }
  .app.sc-light .ar-search input:focus { border-color: rgba(14,16,22,0.85) !important }
  .app.sc-light :is(.ar-p, .ar-sens span) { color: rgb(24,28,36) !important }
  .app.sc-light .ar-steps b { background: var(--blk) !important; border-color: transparent !important; color: #fff !important; box-shadow: var(--blk-shadow) }

  /* Док и круглые кнопки. */
  .app.sc-light .dock-tabs > button { color: rgba(24,28,36,0.55) }
  .app.sc-light .dock-tabs > button.tab-on { color: rgb(24,28,36) }

  /* Модальные окна и всплывашки — белый лист с чёрной гранью. */
  .app.sc-light .modal-card { background: #fff !important; color: rgb(24,28,36);
    box-shadow: 0 0 0 0.75px rgba(14,16,22,0.85), 0 30px 80px -30px rgba(20,32,60,0.45) !important }
  .app.sc-light input:not([type=range]), .app.sc-light select, .app.sc-light textarea {
    background: #fff !important; color: rgb(24,28,36) !important; border-color: rgba(14,16,22,0.45) !important }
`;
