// ============================================================
// ТЕМА
// ============================================================
// Тема — это материал, из которого сделан интерфейс, а не набор цветов.
// С Beta 0.2.1 тема одна — Liquid Glass. Четыре прежние (приборная,
// стеклянная, матовая, фосфор) убраны: одна доведённая тема лучше четырёх
// наполовину. Таблица THEMES оставлена таблицей: новые темы встанут рядом,
// а в кастомизации до тех пор висит «More soon».
//
// Устроено на CSS-переменных панели (--pnl-*), а не на правках компонентов:
// панелей в дашборде под сотню, и тема, которую надо протаскивать пропсами,
// умерла бы на третьей. Инлайновый стиль сильнее любого правила, поэтому
// туда, где компонент прибил вид инлайном (модальное окно, вкладки),
// тема дотягивается только через !important — других мест для него нет.
//
// ---- Что здесь от Apple ----
//
// Liquid Glass описан слоями (WWDC25, «Meet Liquid Glass»), и здесь все они:
//
//   1. Линза. Стекло не рассеивает свет, а преломляет его к краям: у кромки
//      видно то, что лежит дальше под стеклом, чуть вытянутым. Карта смещения
//      считается под ТОЧНУЮ форму каждого плавающего элемента (скругление,
//      пропорции) — см. «Линза» ниже.
//   2. Дисперсия. Каналы R, G и B смещаются по-разному — по кромке выступает
//      тонкая радужная кайма, как у настоящего стекла.
//   3. Иней и насыщенность — фон под стеклом становится молочным и набирает цвет.
//   4. Блик по фаске — кольцо, ярче сверху-слева и снизу-справа; плюс свет
//      от курсора (на телефоне — от наклона, где браузер отдаёт его без
//      разрешения).
//   5. Подсветка от касания (iOS 26, interactive glass): стекло загорается
//      из точки, где его тронули, и свет расходится по нему.
//   6. Капля выбора: подсветка активной вкладки не перескакивает, а перетекает
//      к новой, растягиваясь по дороге (morphing).
//   7. Сворачивание панели вкладок при прокрутке вниз и мягкий край прокрутки
//      (scroll edge effect): содержимое уходит под стекло, растворяясь.
//   8. Clear / Tinted (iOS 26.1): прозрачное или тонированное стекло.
//   9. Ползунок силы стекла (iOS 27): от инея почти без преломления до
//      прозрачной линзы.
//  10. Толщина — тёмная кайма снаружи, двойная тень, кромка внутри.
//
// ---- Где линза, а где нет — и почему ----
//
// Прежде линза стояла на каждой панели и была самым дорогим, что есть в
// дашборде: 58 мс видеокарты на кадр против 19 без неё (headless Chrome,
// SwiftShader, 1440×900, замер 2026-11-05). Снимки крупным планом показали, что
// на панелях её не видно ВОВСЕ: под ними — плавный градиент фона, а преломлять
// плавный градиент — всё равно что не преломлять. Видна она там, где под
// стеклом есть детали: на доке, кнопках, всплывающих окнах, которые плавают
// над цифрами и подписями. Поэтому теперь линза — на плавающем стекле, а
// панели получают иней, блик и свет без неё.
//
// SVG-фильтр в backdrop-filter понимает только Chromium. Safari и Firefox на
// url() в backdrop-filter показывают пустое место вместо стекла, поэтому
// линза ставится только там, где её нарисуют (lensSupported()).
//
// ---- Цена ----
//
// Подложку под панелью считывать дорого само по себе: из 19 мс на кадр 9.5 —
// это просто факт наличия backdrop-filter, размытие сверху добавляет лишь 2.5.
// Отсюда два решения. На сцене «По умолчанию» (ровный чёрный) панели вовсе без
// фильтра: размывать чёрное незачем. В эко-режиме (wind-perf.js) фильтров под
// панелями нет совсем, а стекло рисуется плотнее, чтобы текст читался и так.

// ============================================================
// СТУПЕНИ И ПЕРЕКЛЮЧАТЕЛИ
// ============================================================

// Линза только в Chromium — см. шапку файла. userAgentData есть только там;
// для старых Chromium без него — проверка строки, Edge и Opera туда же.
export function lensSupported() {
  if (typeof navigator === "undefined") return false;
  // Пустой список брендов бывает (подменённая строка браузера, часть
  // встраиваемых WebView) — тогда судим по строке, а не отвечаем «нет».
  const brands = navigator.userAgentData?.brands;
  if (brands && brands.length) return brands.some((b) => /Chromium/.test(b.brand));
  return /Chrome\//.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS|EdgiOS/.test(navigator.userAgent);
}

// Прежние ступени эффектов. С 0.2.525 их заменили эко-режим и ползунок силы,
// а таблица осталась для старого блока кастомизации (wind-custom.jsx).
export const GLASS_FX = {
  max:  { label: "максимум" },
  blur: { label: "размытие" },
  off:  { label: "без размытия" },
};

// Clear / Tinted — как в iOS 26.1 (Настройки → Экран и яркость → Liquid Glass).
export const GLASS_TINTS = {
  clear:  { label: "Clear" },
  tinted: { label: "Tinted" },
};

// Сила стекла, 0…100 — как ползунок iOS 27. Ниже порога линзу не ставим:
// смещение в пару пикселей не видно, а фильтр стоит как полный.
export const GLASS_LEVEL_DEFAULT = 72;
const LENS_FROM = 15;

export function glassLevel(settings) {
  const v = Number(settings.glassLevel);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : GLASS_LEVEL_DEFAULT;
}

// Классы на корень: что реально действует.
export function glassClasses(settings, { eco = false } = {}) {
  let c = "";
  if (settings.glassTint === "tinted") c += " lg-tinted";
  if (eco) return c + " eco";
  if (lensSupported() && glassLevel(settings) >= LENS_FROM) c += " lg-lens";
  return c;
}

// Линза включена? Ответ для менеджера фильтров (startLens).
export function lensActive(settings, eco) {
  return settings.theme === "liquid" && !eco && lensSupported() && glassLevel(settings) >= LENS_FROM;
}

// ============================================================
// ЛИНЗА
// ============================================================
// У каждого плавающего элемента свой фильтр: карта смещения считается под его
// размер и скругление. Общая карта, растянутая на блок (как было), годилась
// для панелей, но не для дока: у капсулы 650×58 фаска вышла бы в 65 пикселей
// по горизонтали и в 6 по вертикали, а у кнопки-круга — квадратной.
//
// Как устроена карта. Для каждой точки — расстояние до края скруглённого
// прямоугольника (SDF). У самой кромки (полоса BEZEL) смещение смотрит внутрь,
// по нормали к краю, и растёт к кромке квадратично: так ведёт себя выпуклая
// фаска — у края видно то, что лежит глубже под стеклом. Внутри полосы смещения
// нет, и середина стекла показывает фон как есть.
//
// Кодирование: feDisplacementMap с primitiveUnits = objectBoundingBox умножает
// смещение по X на ширину блока, а по Y — на высоту. Поэтому масштаб подобран
// так, чтобы и узкая сторона влезла в диапазон канала, а dx и dy пересчитаны
// каждый в свою долю.
const LENS_SEL = ".dock, .gear-btn:not(.dock-gear), .upd-tab, .ver-pop, .modal-card, .liq-thumb";
const SVGNS = "http://www.w3.org/2000/svg";

function lensMap(W, H, radius, maxPx) {
  const k = Math.min(1, 200 / Math.max(W, H));        // карта не больше 200 точек по длинной стороне
  const mw = Math.max(8, Math.round(W * k)), mh = Math.max(8, Math.round(H * k));
  const cv = document.createElement("canvas");
  cv.width = mw; cv.height = mh;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const hw = W / 2, hh = H / 2, r = Math.min(radius, hw, hh);
  const bezel = Math.max(6, Math.min(22, Math.min(W, H) * 0.34));
  const scale = (2.1 * maxPx) / Math.min(W, H);
  const sdf = (x, y) => {
    const qx = Math.abs(x - hw) - (hw - r), qy = Math.abs(y - hh) - (hh - r);
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const img = ctx.createImageData(mw, mh);
  const e = 0.75;
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const x = ((i + 0.5) * W) / mw, y = ((j + 0.5) * H) / mh;
      const d = sdf(x, y), s = -d;                    // s — глубина под кромкой, ≥ 0 внутри
      let dx = 0, dy = 0;
      if (s >= 0 && s < bezel) {
        const nx = sdf(x + e, y) - sdf(x - e, y), ny = sdf(x, y + e) - sdf(x, y - e);
        const n = Math.hypot(nx, ny) || 1;
        const t = 1 - s / bezel;
        const m = maxPx * t * t;
        dx = (-nx / n) * m; dy = (-ny / n) * m;       // внутрь — к середине стекла
      }
      const o = (j * mw + i) * 4;
      img.data[o] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + dx / (scale * W))));
      img.data[o + 1] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + dy / (scale * H))));
      img.data[o + 2] = 128;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: cv.toDataURL("image/png"), scale };
}

// Фильтр: три смещения одной картой с разной силой (R сильнее всех, B слабее)
// и сборка каналов обратно. Это и есть дисперсия.
function filterNode(id) {
  const f = document.createElementNS(SVGNS, "filter");
  f.setAttribute("id", id);
  f.setAttribute("x", "0"); f.setAttribute("y", "0");
  f.setAttribute("width", "1"); f.setAttribute("height", "1");
  f.setAttribute("primitiveUnits", "objectBoundingBox");
  f.setAttribute("color-interpolation-filters", "sRGB");
  f.innerHTML =
    `<feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>` +
    ["r", "g", "b"].map((c) =>
      `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="d${c}"/>`).join("") +
    `<feColorMatrix in="dr" type="matrix" result="r" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>` +
    `<feColorMatrix in="dg" type="matrix" result="g" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"/>` +
    `<feColorMatrix in="db" type="matrix" result="b" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"/>` +
    `<feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>`;
  return f;
}

// Менеджер линз: находит плавающее стекло, держит каждому свой фильтр и
// пересчитывает карту, когда элемент меняет размер (док раздвигается). Пока
// идёт переход размера, старая карта растягивается — это читается как то же
// жидкое стекло, а пересчёт по каждому кадру перехода был бы мусором.
export function startLens(level) {
  if (typeof document === "undefined" || typeof ResizeObserver === "undefined") return () => {};
  const k = Math.max(0, Math.min(1, level / 100));
  const maxPx = 3 + 11 * k;                           // 3…14 px у самой кромки
  const disp = 0.10 + 0.14 * k;                       // разница сил R и B
  const host = document.createElementNS(SVGNS, "svg");
  host.setAttribute("width", "0"); host.setAttribute("height", "0");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.appendChild(host);

  const items = new Map();                            // el → { f, t, w, h }
  let seq = 0;
  const build = (el, it) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w < 8 || h < 8) return;
    if (Math.abs(w - it.w) < 2 && Math.abs(h - it.h) < 2) return;
    // Растянутая линза дока. Пока док раскрывался, карта закрытой полосы тянулась
    // на всё окно — и преломление получалось толстым, волнистым, с радужной
    // каймой по краям; по окончании перехода карта пересчитывалась под новый размер
    // и всё это исчезало. Теперь раскрытый док оставляет карту закрытой полосы —
    // вид, который было видно только в движении, держится, пока окно открыто.
    // Пересчёт — когда док снова обычного (полосного) размера, например при смене
    // подписей на значки.
    if (it.stretch && it.w && (w > it.w * 1.6 || h > it.h * 1.6)) return;
    it.w = w; it.h = h;
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    // Окна и всплывашки строят карту для уменьшенной копии: карта растягивается до
    // реального размера, а вместе с ней и смещение, и кромка — тот же растянутый вид,
    // но с первого кадра и при любом размере окна.
    const st = it.k || 1;
    const m = lensMap(w / st, h / st, rad / st, maxPx);
    if (!m) return;
    const kids = it.f.children;
    kids[0].setAttribute("href", m.url);
    kids[1].setAttribute("scale", (m.scale).toFixed(4));
    kids[2].setAttribute("scale", (m.scale * (1 - disp / 2)).toFixed(4));
    kids[3].setAttribute("scale", (m.scale * (1 - disp)).toFixed(4));
    el.style.setProperty("--lg-lens", `url(#${it.f.id})`);
  };
  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      const it = items.get(en.target);
      if (!it) continue;
      clearTimeout(it.t);
      it.t = setTimeout(() => build(en.target, it), it.w ? 110 : 0);
    }
  });
  const scan = () => {
    for (const el of document.querySelectorAll(LENS_SEL)) {
      if (items.has(el)) continue;
      const it = { f: filterNode(`lgl-${++seq}`), t: 0, w: 0, h: 0,
                   stretch: el.matches(".dock"),
                   k: el.matches(".modal-card, .ver-pop") ? 2.2 : el.matches(".upd-tab") ? 1.6 : 1 };
      host.appendChild(it.f);
      items.set(el, it);
      ro.observe(el);
    }
    for (const [el, it] of items) {
      if (el.isConnected) continue;
      ro.unobserve(el); clearTimeout(it.t); it.f.remove(); items.delete(el);
    }
  };
  scan();
  let timer = 0;
  const mo = new MutationObserver(() => {
    if (!timer) timer = setTimeout(() => { timer = 0; scan(); }, 200);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    mo.disconnect(); ro.disconnect(); clearTimeout(timer);
    for (const [el, it] of items) { clearTimeout(it.t); el.style.removeProperty("--lg-lens"); }
    items.clear(); host.remove();
  };
}

// ============================================================
// ЖИВОЙ ФОН
// ============================================================
// Пять мягких пятен текут под стеклом. Рисуются на крошечном холсте (192 точки
// по длинной стороне), который видеокарта растягивает на весь экран: размытое
// пятно при растяжке не теряет ничего, а вместо четырёх слоёв по 90vmax с
// will-change (на телефоне с плотностью 2.6 — это ~70 МБ видеопамяти) остаётся
// одна текстура в сотню килобайт.
//
// Кадры — 8 в секунду, и это осознанно: пятна сдвигаются на несколько точек
// в секунду, шаг меньше точки глазу не виден, а каждое изменение фона
// заставляет пересчитаться всё стекло, что над ним. В эко-режиме фон стоит.
const WALL = [
  // x, y — центр в долях экрана; r — радиус в vmax; tx, ty, ts — куда течёт; dur — полупериод, с.
  { x: 0.10, y: 0.06, r: 46, tx: 22, ty: 16, ts: 0.15, dur: 38, c: [48, 104, 255, 0.50], d: [26, 42, 108, 0.60] },
  { x: 0.92, y: 0.22, r: 45, tx: -18, ty: 24, ts: -0.10, dur: 46, c: [150, 70, 235, 0.40], d: [52, 34, 98, 0.48] },
  { x: 0.24, y: 1.00, r: 45, tx: 26, ty: -14, ts: 0.20, dur: 52, c: [20, 190, 180, 0.32], d: [12, 64, 72, 0.42] },
  { x: 0.94, y: 1.04, r: 35, tx: -24, ty: -20, ts: 0.10, dur: 41, c: [235, 120, 90, 0.28], d: [36, 44, 62, 0.46] },
  // Пятое — холодный свет посередине: без него середина экрана, где и стоят
  // панели, оставалась самой тёмной, и стеклу там нечего было подсвечивать.
  { x: 0.55, y: 0.48, r: 30, tx: -10, ty: 12, ts: 0.18, dur: 57, c: [90, 150, 255, 0.16], d: [40, 60, 120, 0.22] },
];

export function mountWall(canvas, { dark = false, fps = 8 } = {}) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};
  let raf = 0, last = 0, w = 0, h = 0;
  const t0 = performance.now() - 20000;               // не с нуля: в первую секунду пятна не стоят в углах
  const size = () => {
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    const k = 192 / Math.max(vw, vh);
    w = Math.max(16, Math.round(vw * k)); h = Math.max(16, Math.round(vh * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const draw = (now) => {
    const vmax = Math.max(w, h) / 100;
    ctx.clearRect(0, 0, w, h);
    const sec = (now - t0) / 1000;
    for (const b of WALL) {
      // Туда-обратно по косинусу: у краёв пути пятно замедляется, как жидкость,
      // а не разворачивается рывком, как у прежнего linear alternate.
      const p = (1 - Math.cos((Math.PI * sec) / b.dur)) / 2;
      const cx = b.x * w + b.tx * vmax * p, cy = b.y * h + b.ty * vmax * p;
      const r = b.r * vmax * (1 + b.ts * p);
      const [R, G, B, A] = dark ? b.d : b.c;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(${R},${G},${B},${A})`);
      gr.addColorStop(0.55, `rgba(${R},${G},${B},${(A * 0.42).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    }
  };
  const step = (now) => {
    raf = 0;
    if (document.hidden) return;
    if (now - last >= 1000 / fps - 4) { last = now; draw(now); }
    raf = requestAnimationFrame(step);
  };
  const onResize = () => { size(); draw(performance.now()); };
  const onVis = () => { if (!document.hidden && fps > 0 && !raf) raf = requestAnimationFrame(step); };
  size(); draw(performance.now());
  window.addEventListener("resize", onResize);
  if (fps > 0) {
    raf = requestAnimationFrame(step);
    document.addEventListener("visibilitychange", onVis);
  }
  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
  };
}

// ============================================================
// МАТЕРИАЛ
// ============================================================
// Кольцо фаски: ярко сверху-слева, гаснет к середине, возвращается снизу-
// справа отражением от подложки. Угол — переменная: от наклона телефона
// свет обходит кромку, как у настоящего стекла под лампой.
const RING_STOPS =
  "rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.30) 14%," +
  " rgba(255,255,255,0.06) 34%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.05) 66%," +
  " rgba(255,255,255,0.32) 86%, rgba(255,255,255,0.72) 100%";
const RING = `linear-gradient(var(--lg-a), ${RING_STOPS})`;

// Свет курсора и бегущий блик — оба движутся transform'ом, а не фоном.
// Замер 2026-11-05 (headless Chrome, 1440×900): блик, бегущий через
// background-position, перерисовывал панель целиком на каждом кадре прохода —
// вместе с её текстом, свечением и графикой, — и стоил 9 мс видеокарты на кадр
// в покое; свет курсора, нарисованный фоном по координатам, — ещё 17 мс на
// кадр движения мыши. Сдвиг готового слоя делает композитор, не трогая ни
// одного пикселя панели, поэтому оба эффекта теперь — отдельные слои, которые
// только едут: блик — ::after, свет — узел .lg-lit, который дашборд вкладывает
// в блоки рядом с курсором (wind-dashboard.jsx).
//
// Бегущий блик: узкая полоса со слабой радугой по краям — свет, прошедший
// сквозь толщу стекла, а не белая черта. Слой — 60% ширины блока, полоса
// в нём прямая, а наклон даёт skewX самого слоя. Наклонный градиент в прямом
// слое не годится: на высокой узкой плитке полоса упирается в край слоя, и
// край виден ступенькой. Здесь края слоя всегда прозрачны.
const SHEEN =
  "linear-gradient(90deg, rgba(255,255,255,0) 14%, rgba(150,200,255,0.10) 34%," +
  " rgba(255,255,255,0.24) 46.5%, rgba(255,255,255,0.28) 52%, rgba(255,210,240,0.11) 65%," +
  " rgba(255,255,255,0) 86%)";

const GLASS = ":is(.pnl, .stat, .tutor-box)";

export const THEMES = {
  liquid: {
    label: "Liquid Glass",
    hint: "Жидкое стекло: плавающие элементы преломляют то, что под ними, и по кромке " +
          "расходится радужная дисперсия; блик следует за курсором, стекло загорается " +
          "от касания, капля выбора перетекает между вкладками. Под стеклом течёт живой фон.",
    apply: (s) => ({
      texture: "smooth", corners: "round", panelFill: 0, glow: "off",
      // Свою картинку не затираем: под стеклом она лучше любой сцены.
      // Тёмный вариант той же сцены и чёрный фон «По умолчанию» — тоже выбор
      // человека, их не сбрасываем.
      ...(["custom", "liquidDark", "plain", "light"].includes(s.scene)
        ? {} : { scene: "liquid", bgTint: 8 }),
    }),
    css: `
      /* Угол света на фаске — ненаследуемый: дашборд пишет его на сами блоки
         (наклон телефона), и смена не расходится по всему содержимому. */
      @property --lg-a  { syntax: "<angle>";  inherits: false; initial-value: 135deg }

      .th-liquid {
        /* Сила стекла (ползунок, 0…1) приходит инлайном с корня. Из неё
           выводится всё остальное: чем стекло «сильнее», тем оно прозрачнее,
           тем меньше инея и ярче фаска. */
        --lg-k: .72;
        --lg-tint-a: calc(0.30 - var(--lg-k) * 0.16);
        --lg-blur-r: calc(20px - var(--lg-k) * 11px);
        --lg-sat: calc(1.35 + var(--lg-k) * 0.55);
        --lg-spec: calc(0.55 + var(--lg-k) * 0.45);
        --pnl-line: rgba(255,255,255,0.10);
        --pnl-head-line: rgba(255,255,255,0.09);
        /* Белый налёт сверху и тёмная тонировка под ним: стекло тёмного
           режима. Без тонировки над ярким пятном фона текст тонул бы. */
        --pnl-bg: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.045) 34%,
                  rgba(255,255,255,0.035) 62%, rgba(255,255,255,0.06)), rgba(255,255,255,var(--ui-fill, 0)),
                  rgba(8,12,22,var(--lg-tint-a));
        /* Снаружи: кайма iOS 27, близкая тень, далёкая тень. Внутри: кромка
           сверху, отражение снизу, свечение толщи стекла у края. */
        --pnl-shadow: 0 0 0 0.5px rgba(0,0,0,0.42),
                      0 2px 6px -1px rgba(0,0,0,0.30),
                      0 22px 54px -20px rgba(0,0,0,0.70),
                      inset 0 1px 0.5px rgba(255,255,255,0.42),
                      inset 0 -1px 0.5px rgba(255,255,255,0.10),
                      inset 0 0 18px rgba(255,255,255,0.05);
        --pnl-corner: calc(var(--ui-corner, 0px) + 14px);
        /* Над живым фоном размытие почти ничего не меняет — фон и так мягкий,
           — а насыщенность заметна сразу: стекло набирает цвет. */
        --pnl-blur: blur(calc(var(--lg-blur-r) * 0.5)) saturate(var(--lg-sat));
        /* Плитки сводки: та же тонировка, плюс линия-акцент снизу — она
           раньше жила в ::after и пропадала под глянцем темы. */
        --stat-bg: linear-gradient(90deg, rgba(125,211,252,0.7), rgba(167,139,250,0.4), transparent)
                     14px 100% / calc(100% - 28px) 2px no-repeat,
                   linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)),
                   rgba(8,12,22,calc(var(--lg-tint-a) - 0.02));
        --stat-shadow: 0 0 0 0.5px rgba(0,0,0,0.38), 0 14px 30px -16px rgba(0,0,0,0.7),
                       inset 0 1px 0.5px rgba(255,255,255,0.36),
                       inset 0 -1px 0.5px rgba(255,255,255,0.08);
        /* Плавающее стекло (док, кнопки, всплывашки): тоньше и прозрачнее
           панелей — под ним живое содержимое, и его должно быть видно. */
        --fl-bg: linear-gradient(180deg, rgba(255,255,255,0.17), rgba(255,255,255,0.05) 52%, rgba(255,255,255,0.09)),
                 rgba(10,14,24,calc(var(--lg-tint-a) * 0.85));
        --fl-shadow: 0 0 0 0.5px rgba(0,0,0,0.48), 0 2px 6px -2px rgba(0,0,0,0.40),
                     0 18px 40px -14px rgba(0,0,0,0.72),
                     inset 0 1px 0.5px rgba(255,255,255,0.55), inset 0 -1px 0.5px rgba(255,255,255,0.16),
                     inset 0 0 16px rgba(255,255,255,0.06);
        /* Пружина Apple: быстрый старт, заметный перелёт, спокойный возврат. */
        --ease-back: cubic-bezier(.32,1.56,.48,1);
      }
      /* Tinted (iOS 26.1): стекло плотнее и контрастнее. В iOS 26 разница
         была едва заметна, в iOS 27 её сделали настоящей — так и здесь. */
      .th-liquid.lg-tinted { --lg-tint-a: calc(0.64 - var(--lg-k) * 0.14);
                             --pnl-line: rgba(255,255,255,0.16) }
      /* На своей картинке иней — главное: фотография под цифрами иначе
         спорит с ними. На ровном чёрном фильтр не нужен вовсе. */
      .th-liquid.sc-custom { --pnl-blur: blur(var(--lg-blur-r)) saturate(var(--lg-sat)) }
      .th-liquid.sc-plain  { --pnl-blur: none }
      .th-liquid.sc-light  { --pnl-blur: none }

      .th-liquid ${GLASS} { position: relative; overflow: hidden; isolation: isolate; --lg-a: 135deg }
      .th-liquid ${GLASS} > * { position: relative; z-index: 1 }
      /* Окно подсказчика свёрстано восьмибитной рамкой инлайном — в стекле
         оно становится такой же панелью, как остальные. */
      .th-liquid .tutor-box {
        border: 1px solid var(--pnl-line) !important; border-radius: var(--pnl-corner);
        background: var(--pnl-bg) !important; box-shadow: var(--pnl-shadow) !important;
        -webkit-backdrop-filter: var(--pnl-blur); backdrop-filter: var(--pnl-blur);
      }

      /* Фаска. Рамку рисует градиент в маске, а не border: у border один цвет
         на все стороны, а блик обязан гаснуть к середине. Слой неподвижен и
         рисуется один раз — свет курсора по фаске едет отдельным слоем. */
      .th-liquid ${GLASS}::before {
        content: ""; position: absolute; inset: 0; z-index: 3; pointer-events: none;
        --lg-a: inherit;
        border-radius: inherit; padding: 1.2px;
        background: ${RING};
        opacity: calc(0.62 + var(--lg-spec) * 0.3);
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude;
      }
      /* Бегущий блик. Слой лежит ПОВЕРХ содержимого — цифры и подписи
         оказываются за стеклом, и свет проходит по ним; белый поверх — то же,
         что screen, без отдельного слоя смешивания. Подсветка верхней трети
         живёт в самой заливке (--pnl-bg): она неподвижна. */
      .th-liquid ${GLASS}::after {
        content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 60%; z-index: 2;
        pointer-events: none; background: ${SHEEN};
        transform: translateX(-160%) skewX(-22deg);
        animation: lgSheen 14.4s ease-in-out var(--lg-d, 0s) infinite;
      }
      /* Блик идёт по панелям по очереди слева направо: дашборд раздаёт каждой
         задержку от её места на экране (--lg-d), и полоса читается как свет по
         одному большому стеклу. Проход — треть цикла, остальное время полоса
         стоит за краем. Путь с запасом: у скошенного слоя углы выступают,
         и на высокой плитке они не должны выглядывать. */
      @keyframes lgSheen {
        0%        { transform: translateX(-160%) skewX(-22deg) }
        34%, 100% { transform: translateX(235%) skewX(-22deg) }
      }

      /* Свет курсора (interactive glass): мягкое пятно по стеклу и яркий
         блик по фаске, там, где курсор ближе всего. Узел вкладывает дашборд —
         только в блоки рядом с курсором — и двигает transform'ом: слои
         нарисованы один раз, едет готовая картинка. Фаска — кольцо в маске,
         внутри которого едет пятно, поэтому блик идёт ровно по кромке. */
      .lg-lit { position: absolute !important; inset: 0; z-index: 3 !important; pointer-events: none;
                border-radius: inherit; overflow: hidden; opacity: 0; transition: opacity .61s ease }
      .lg-lit.on { opacity: 1 }
      .lg-lit > i, .lg-lit > b > i { position: absolute; left: 0; top: 0; border-radius: 50%; will-change: transform }
      .lg-lit > i { width: 560px; height: 560px; margin: -280px 0 0 -280px;
                    background: radial-gradient(closest-side, rgba(255,255,255,calc(0.08 + var(--lg-spec) * 0.06)),
                                rgba(255,255,255,0.04) 55%, rgba(255,255,255,0)) }
      .lg-lit > b { position: absolute; inset: 0; border-radius: inherit; padding: 1.3px;
                    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                    -webkit-mask-composite: xor; mask-composite: exclude }
      .lg-lit > b > i { width: 290px; height: 290px; margin: -145px 0 0 -145px;
                        background: radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 45%, rgba(255,255,255,0)) }

      /* Свечение того, что за стеклом. Тень текста наследуется, поэтому
         одного правила на панель хватает на все подписи внутри; приборная
         графика светится фильтром. Фильтр — только на листьях и только на
         svg: на обёртке он запер бы position: fixed внутри панели, а на
         карте, кадрах спутника и сцене камеры (.no-glow) пересчитывался бы
         на каждом кадре их собственной анимации. */
      .th-liquid:not(.eco) ${GLASS} {
        text-shadow: 0 0 6px color-mix(in srgb, currentColor 50%, transparent), 0 0 14px rgba(170,210,255,0.40) }
      /* Цифры с выключенным свечением несут инлайновое text-shadow: none, и
         оно сильнее наследования. Перебиваем только его — включённое цветное
         свечение остаётся своим. */
      .th-liquid:not(.eco) ${GLASS} [style*="text-shadow: none"] {
        text-shadow: 0 0 6px color-mix(in srgb, currentColor 50%, transparent), 0 0 14px rgba(170,210,255,0.40) !important }
      .th-liquid:not(.eco) ${GLASS} svg:not(.no-glow):not(.no-glow *) {
        filter: drop-shadow(0 0 5px rgba(160,205,255,0.45)) }

      /* Наведение: стекло чуть приподнимается. */
      .th-liquid .pnl { transition: box-shadow .68s var(--ease-out), transform .68s var(--ease-spring) }
      .th-liquid .stat { transition: transform .61s var(--ease-spring) }
      .th-liquid .stat:hover { transform: translateY(-2px) scale(1.012) }

      /* Кнопки — пилюли, и пилюли жидкие. Обычная кнопка внутри панели под
         пальцем проминается; стеклянный элемент управления (вкладка дока,
         шестерёнка, кнопки «Района») — наоборот, вырастает: так ведёт себя
         interactive glass в iOS 26. Инлайновую заливку не трогаем. */
      .th-liquid button, .th-liquid input[type="text"], .th-liquid input[type="number"],
      .th-liquid input:not([type]), .th-liquid select { border-radius: 999px }
      .th-liquid button { transition: transform .68s var(--ease-spring), background-color .34s ease,
                                      border-color .25s ease, color .25s ease, box-shadow .3s ease }
      .th-liquid button:hover:not(:disabled) { box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.28),
                                               0 6px 16px -8px rgba(0,0,0,0.6) }
      .th-liquid button:active:not(:disabled) { transform: scale(0.95); transition-duration: .16s }
      .th-liquid :is(.dock-tabs > button, .gear-btn, .ar-btn, .ver-chip):active:not(:disabled) {
        transform: scale(1.09) !important; transition: transform .3s cubic-bezier(.3,1.6,.5,1) !important }
      .th-liquid textarea { border-radius: 14px }

      /* Вкладки на стеклянной капсуле, активная — капля стекла внутри неё. */
      .th-liquid nav {
        border: none !important; border-image: none !important;
        width: fit-content; max-width: calc(100% - 8px); box-sizing: border-box;
        margin: 12px auto 14px !important; padding: 4px; border-radius: 999px;
        display: flex; flex-wrap: wrap; justify-content: center; gap: 2px;
        background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
        box-shadow: 0 0 0 0.5px rgba(0,0,0,0.42), 0 16px 40px -18px rgba(0,0,0,0.75),
                    inset 0 1px 0.5px rgba(255,255,255,0.40), inset 0 -1px 0.5px rgba(255,255,255,0.10);
        -webkit-backdrop-filter: var(--pnl-blur); backdrop-filter: var(--pnl-blur);
      }
      .th-liquid nav button { padding: 8px 16px !important; margin-right: 0 !important;
                              isolation: isolate; letter-spacing: 1.6px !important }
      /* Капля выбора. Движение — из дашборда (FLIP в Tab): капля перетекает от
         прежней вкладки к новой, растягиваясь по дороге. Здесь только вид:
         выпуклое стекло с бликом сверху и отражением снизу. */
      .th-liquid nav .tab-mark {
        inset: 0 !important; height: auto !important; bottom: 0 !important; z-index: -1;
        border-radius: 999px; transform-origin: 0 0; animation: none !important;
        background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.30), rgba(255,255,255,0) 60%),
                    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.09)) !important;
        box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.62), inset 0 -1px 0.5px rgba(255,255,255,0.16),
                    inset 0 0 12px rgba(255,255,255,0.08), 0 4px 14px -6px rgba(0,0,0,0.55);
      }
      .th-liquid > header { border-bottom-color: transparent !important; border-image: none !important }

      /* ---------------- плавающее стекло ----------------
         Док, кнопки-круги, вкладка обновления, всплывашка версии. Линза —
         своя у каждого (--lg-lens ставит startLens()), остальное общее. */
      .th-liquid :is(.dock, .gear-btn:not(.dock-gear), .upd-tab, .ver-pop) {
        border-color: rgba(255,255,255,0.12) !important;
        background: var(--fl-bg) !important; box-shadow: var(--fl-shadow) !important;
        -webkit-backdrop-filter: blur(calc(var(--lg-blur-r) * 0.45)) var(--lg-lens,) saturate(var(--lg-sat)) brightness(1.06) !important;
        backdrop-filter: blur(calc(var(--lg-blur-r) * 0.45)) var(--lg-lens,) saturate(var(--lg-sat)) brightness(1.06) !important;
      }
      .th-liquid .dock { position: relative; isolation: isolate; --lg-a: 135deg }
      /* Фаска дока — то же кольцо, что у панелей; капсула главная, её кромка
         обязана читаться первой. */
      .th-liquid .dock::before {
        content: ""; position: absolute; inset: 0; z-index: 3; pointer-events: none;
        --lg-a: inherit;
        border-radius: inherit; padding: 1.2px;
        background: ${RING};
        opacity: calc(0.6 + var(--lg-spec) * 0.35);
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude;
      }
      .th-liquid .dock::after {
        content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
        border-radius: inherit;
        background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 45%);
      }

      /* Подсветка от касания (interactive glass): свет загорается в точке
         касания и расходится по стеклу. Только transform и opacity — без
         единой перерисовки. Узел вставляет дашборд и сам же убирает. */
      .lg-touch { position: absolute !important; inset: 0; border-radius: inherit; overflow: hidden;
                  pointer-events: none; z-index: 4 !important }
      .lg-touch i { position: absolute; width: 260px; height: 260px; margin: -130px 0 0 -130px;
                    border-radius: 50%; will-change: transform, opacity;
                    background: radial-gradient(closest-side, rgba(255,255,255,0.30), rgba(190,220,255,0.13) 46%, rgba(255,255,255,0));
                    animation: lgTouch 1.08s cubic-bezier(.2,.8,.25,1) forwards }
      @keyframes lgTouch { 0% { transform: scale(.12); opacity: 1 } 55% { opacity: .85 }
                           100% { transform: scale(1.7); opacity: 0 } }

      /* Модальное окно — самое толстое стекло: за ним живой дашборд, и
         размытие тут не украшение, а читаемость. Появляется не проявлением,
         а «материализуясь» (iOS 26): стекло сгущается из размытия. */
      .th-liquid .modal-bg { background: rgba(2,4,8,0.38) !important;
                             -webkit-backdrop-filter: blur(6px) saturate(120%) !important;
                             backdrop-filter: blur(6px) saturate(120%) !important }
      .th-liquid .modal-card {
        position: relative;
        background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05)),
                    rgba(16,20,30,calc(0.30 + var(--lg-tint-a))) !important;
        border: 1px solid rgba(255,255,255,0.16) !important; border-radius: 30px !important;
        box-shadow: 0 0 0 0.5px rgba(0,0,0,0.5), 0 40px 90px -30px rgba(0,0,0,0.85),
                    inset 0 1px 0.5px rgba(255,255,255,0.45) !important;
        /* Размытие 10 px, а не 30: под тридцатью линзу не разглядеть — преломляется
           уже смазанная картинка, и растянутая кромка (см. startLens) пропадала. */
        -webkit-backdrop-filter: blur(10px) var(--lg-lens,) saturate(190%) !important;
        backdrop-filter: blur(10px) var(--lg-lens,) saturate(190%) !important;
        animation: lgMaterialize .81s var(--ease-back) both !important;
      }
      @keyframes lgMaterialize {
        0%   { opacity: 0; transform: translateY(14px) scale(.9); filter: blur(10px) saturate(1.8) }
        60%  { opacity: 1; filter: blur(0) }
        100% { opacity: 1; transform: none; filter: none }
      }

      /* Значок версии в шапке — маленькая капля того же стекла. */
      .th-liquid .ver-chip {
        background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
        border: none; box-shadow: 0 0 0 0.5px rgba(0,0,0,0.4), inset 0 1px 0.5px rgba(255,255,255,0.5);
        -webkit-backdrop-filter: blur(10px) saturate(180%); backdrop-filter: blur(10px) saturate(180%);
      }

      /* ---------------- край прокрутки ----------------
         Scroll edge effect: содержимое, уходящее под шапку и под док, не
         обрезается чертой, а растворяется. Размытие нарастает к краю — маска
         по высоте, одно размытие на всю полосу. */
      .lg-edge { position: fixed; left: 0; right: 0; pointer-events: none; z-index: 80 }
      .lg-edge-top { top: 0; height: calc(64px + env(safe-area-inset-top, 0px)); opacity: 0;
                     transition: opacity .61s ease;
                     background: linear-gradient(180deg, rgba(3,5,10,0.62), rgba(3,5,10,0.22) 55%, rgba(3,5,10,0)) }
      .lg-edge-top.on { opacity: 1 }
      .lg-edge-bot { bottom: 0; height: calc(96px + env(safe-area-inset-bottom, 0px));
                     background: linear-gradient(0deg, rgba(3,5,10,0.55), rgba(3,5,10,0.18) 55%, rgba(3,5,10,0)) }
      .th-liquid:not(.eco) .lg-edge {
        -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px) }
      .th-liquid:not(.eco) .lg-edge-top { -webkit-mask: linear-gradient(#000 30%, transparent); mask: linear-gradient(#000 30%, transparent) }
      .th-liquid:not(.eco) .lg-edge-bot { -webkit-mask: linear-gradient(0deg, #000 30%, transparent); mask: linear-gradient(0deg, #000 30%, transparent) }
      .th-liquid.sc-plain .lg-edge { -webkit-backdrop-filter: none; backdrop-filter: none }

      /* Тонкие стеклянные полосы прокрутки. */
      .th-liquid ::-webkit-scrollbar { width: 10px; height: 10px }
      .th-liquid ::-webkit-scrollbar-track { background: transparent }
      .th-liquid ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px;
                                             border: 3px solid transparent; background-clip: padding-box }
      .th-liquid ::selection { background: rgba(120,170,255,0.38) }

      /* ---------------- живой фон ----------------
         Корень — свой контекст наложения: иначе холст с z-index: -1 ушёл бы
         под фон body (сцена рисуется там), и пятен не было бы видно вовсе. */
      .th-liquid { position: relative; z-index: 0 }
      .lg-wall { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1;
                 pointer-events: none; display: block }

      /* ---------------- доступность ----------------
         «Понизить прозрачность» и «Повысить контраст» — системные просьбы,
         и стекло их слушается так же, как iOS. Тройной класс — не опечатка:
         правило обязано пересилить .sc-custom и .lg-tinted, которые сами по
         два класса, а порядок в файле от медиазапроса не зависит. */
      @media (prefers-reduced-transparency: reduce) {
        .th-liquid.th-liquid.th-liquid { --lg-tint-a: 0.82; --pnl-blur: none }
        .th-liquid :is(.dock, .gear-btn:not(.dock-gear), .upd-tab, .ver-pop, .modal-card) {
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important }
      }
      @media (prefers-contrast: more) {
        .th-liquid.th-liquid.th-liquid { --pnl-line: rgba(255,255,255,0.42); --lg-tint-a: 0.7 }
        .th-liquid:not(.eco) ${GLASS} { text-shadow: none }
      }

      .mo-calm.th-liquid ${GLASS}::after { animation-duration: 27s }
      .mo-off.th-liquid ${GLASS}::after { animation: none }
      .mo-off.th-liquid button:active:not(:disabled) { transform: none !important }
      .mo-off.th-liquid .stat:hover { transform: none }
      .mo-off.th-liquid .modal-card { animation: none !important }
      .mo-off .lg-touch, .mo-off .lg-lit { display: none }
    `,
  },
};

export function themeCss(key) {
  return (THEMES[key] || THEMES.liquid).css;
}
