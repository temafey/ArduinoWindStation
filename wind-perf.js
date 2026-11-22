// Эко-режим — для телефонов и планшетов. С 0.2.525 это настройка («Эко-режим»
// в настройках дока), а не только автоматика; автоматика осталась умолчанием.
//
// Откуда взялся: на телефоне дашборд упирался не в стекло, а в процессор.
// Замер 2026-11-05 (headless Chrome, процессор замедлен вчетверо, экран
// 412×915, демо-источник): главный поток был занят 983 мс из каждой секунды —
// 25 кадров/с даже в прежнем облегчённом режиме. Из чего это складывалось:
//   • окно камеры: 20 обломков и 10 полос воронки — CSS-анимации внутри SVG,
//     и каждый их кадр перекладывает весь SVG (тысячи узлов в секунду);
//   • сглаживание угла в корне дашборда, которое никто не читал, но которое
//     перерисовывало весь дашборд на каждом кадре (убрано совсем);
//   • свет курсора через background-attachment: fixed — перерисовка всех
//     панелей на каждое движение и на каждый кадр прокрутки (переделан для
//     всех режимов, см. wind-themes.js);
//   • backdrop-filter под каждой панелью: подложку надо считать заново под
//     каждой плиткой, пока под ней что-то движется.
//
// Эко-режим снимает всё, что глаз на телефоне почти не замечает, и оставляет
// само стекло: тонировку, фаску, блик сверху, капсулу дока с лёгким размытием,
// подсветку от касания (она без единой перерисовки). Панели становятся
// плотнее — без инея под ними текст должен читаться и так.
//
// Автоматически включается на Android, в приложении и на небольшом сенсорном
// экране. Ручной флаг прежних версий тоже понимается:
//   localStorage.wind_ui_perf = "1" — считать устройство слабым, "0" — нет.
function detect() {
  try {
    const f = localStorage.getItem("wind_ui_perf");
    if (f === "1") return true;
    if (f === "0") return false;
    if (/Android/i.test(navigator.userAgent) || window.WKNative) return true;
    return window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
  } catch { return false; }
}
export const ECO_AUTO = typeof window !== "undefined" && detect();

// null — «как решит устройство», true/false — выбор человека в настройках.
export function ecoOn(settings) {
  return settings.eco == null ? ECO_AUTO : !!settings.eco;
}

export const ECO_CSS = `
/* ---------- эко-режим (wind-perf.js) ---------- */
/* Стекло без инея: тонировка плотнее ровно настолько, насколько её раньше
   добирало размытие. Фаска и блик сверху остаются — они нарисованы один раз. */
.app.eco { --pnl-blur: none;
  --pnl-bg: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04) 42%, rgba(255,255,255,0.06)),
            rgba(255,255,255,var(--ui-fill, 0)), rgba(12,16,26,calc(var(--lg-tint-a, 0.2) + 0.36));
  --stat-bg: linear-gradient(90deg, rgba(125,211,252,0.7), rgba(167,139,250,0.4), transparent)
               14px 100% / calc(100% - 28px) 2px no-repeat,
             linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.05)),
             rgba(12,16,26,calc(var(--lg-tint-a, 0.2) + 0.34)) }
.app.eco :is(.pnl, .stat, .tutor-box), .app.eco nav:not(.dock-bar), .app.eco .ver-chip,
.app.eco .bat-glass, .app.eco .cl-bub, .app.eco .cl-bridge, .app.eco .claude-chip {
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important }
/* Бегущий блик: хоть он и едет одним композитором, это слой на каждую
   панель и кадр на каждый кадр анимации. В эко его нет — подсветка верхней
   трети и так нарисована в заливке. */
.app.eco :is(.pnl, .stat, .tutor-box)::after { content: none !important }
/* Док — единственное стекло, которому размытие оставлено: он плавает над
   цифрами, и без инея под ним читалась бы каша. Капсула маленькая, и
   размытие ей обходится дёшево; линзы и дисперсии нет. */
.app.eco :is(.dock, .gear-btn:not(.dock-gear), .upd-tab, .ver-pop) {
  -webkit-backdrop-filter: blur(10px) saturate(1.5) !important; backdrop-filter: blur(10px) saturate(1.5) !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05)), rgba(12,16,26,0.58) !important }
.app.eco .modal-bg { -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  background: rgba(2,4,8,0.74) !important }
.app.eco .modal-card { -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03)), rgba(14,18,28,0.97) !important;
  animation: pop .61s var(--ease-spring) both !important }
/* Декоративные кольца и вращения: не несут смысла, а работают постоянно —
   и каждый их кадр будит отрисовку всего экрана. */
.app.eco .gear-btn::before, .app.eco .claude-chip::after, .app.eco .cl-sheen::before, .app.eco .sys-dot.ok::after,
.app.eco .more-soon { animation: none !important }
.app.eco .gear-btn svg, .app.eco .claude-chip svg,
.app.eco header > div:first-child > div:first-child > :first-child { animation: none !important }
/* Развёртка радара и вихрь конвекции — поворот группы внутри SVG, то есть
   перекладка всего SVG на кадр. Шагами — около 8 кадров в секунду. */
.app.eco .ppi-sweep { animation-timing-function: steps(52) !important }
.app.eco .ppi-sweep.slow { animation-timing-function: steps(112) !important }
.app.eco .vortex { animation-timing-function: steps(44) !important }
/* Вход вкладки без размытия: filter: blur на весь экран во время анимации — самый дорогой кадр. */
@keyframes tabInLite {
  0%   { opacity: 0; transform: translateX(calc(var(--tdir, 1) * 60px)) scale(.96) }
  60%  { opacity: 1; transform: translateX(calc(var(--tdir, 1) * -6px)) scale(1.006) }
  100% { opacity: 1; transform: none }
}
.app.eco:not(.mo-off) .tabfade { animation: tabInLite .81s cubic-bezier(.22,1.2,.3,1) both !important }
.app.eco .dock-scroll { filter: none !important }
/* Кольцо «Скорость ветра» — главный пожиратель кадров на слабом планшете
   (замер 2026-11-06, процессор ×6, поток станции 20 Гц). Переход
   stroke-dasharray длиной 0.9 с перезапускается с каждым кадром данных и не
   кончается никогда, а свойство это не композиторское: браузер пересчитывает
   стили и перерисовывает SVG со свечением на КАЖДОМ кадре экрана — 167
   пересчётов стилей в секунду вместо десяти. В эко кольцо встаёт на место
   сразу, без свечения. */
.app.eco .ar-ring { transition: none !important; filter: none !important }
`;

// Для любого режима: всё, что вышло за край экрана, на паузе. Анимации за кадром
// не видны, но считаются каждый кадр — на телефоне это и есть главная цена
// окна камеры, которое лежит под сгибом.
export const OFFSCREEN_CSS = `
.pnl.off *, .pnl.off *::before, .pnl.off *::after,
.stat.off *, .stat.off *::before, .stat.off *::after { animation-play-state: paused !important }
.pnl.off::after, .stat.off::after { animation-play-state: paused !important }
`;

export function watchOffscreen() {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle("off", !e.isIntersecting);
  }, { rootMargin: "120px 0px" });
  const seen = new Set();
  const scan = () => {
    document.querySelectorAll(".pnl, .stat").forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
  };
  scan();
  // Блоки появляются и исчезают (вкладки, режим района): присматриваем за дом-деревом.
  let timer = 0;
  const mo = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; scan(); for (const el of [...seen]) if (!el.isConnected) { io.unobserve(el); seen.delete(el); } }, 250);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => { clearTimeout(timer); io.disconnect(); mo.disconnect(); };
}
