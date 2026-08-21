import { noise } from "./ui-kit.js";

// ============================================================
// ТЕМЫ
// ============================================================
// Тема — это материал, из которого сделан интерфейс, а не набор цветов.
// Цвета здесь и так настраиваются (акцент, подложка, сцена), и ещё одна
// палитра ничего бы не добавила. Разница между темами — физика поверхности:
// как она отражает свет, есть ли у неё толщина и видно ли сквозь неё.
//
// Устроено на CSS-переменных панели (--pnl-*), а не на правках компонентов:
// панелей в дашборде под сотню, и тема, которую надо протаскивать пропсами,
// умерла бы на третьей.
//
// ---- Что взято из чужой работы и что из неё выброшено ----
//
// «Стеклянная» идёт за Liquid Glass из iOS 26. Apple описывает материал тремя
// слоями — блик, тень и подсветка, — и главный приём там не размытие, а
// линзирование: стекло не рассеивает свет, а преломляет его к краям, как
// настоящая линза (developer.apple.com/videos/play/wwdc2025/219).
//
// Линзирование в вебе делают SVG-фильтром с картой смещения, который
// подставляют в backdrop-filter: url(#…). Здесь этого нет — сознательно:
//   * такой backdrop-filter понимает только Chromium. Safari и Firefox
//     показывают вместо стекла пустое место, а половина заходов на этот
//     дашборд — с айфона;
//   * карта смещения — это PNG рядом с бандлом. У станции нет интернета,
//     а во флеше свободно около шестидесяти килобайт;
//   * карту приходится пересчитывать при каждой смене размера блока — а тут
//     размеры блоков пользователь тянет мышью.
// Остаются два слоя, которые воспроизводятся честно: подсветка
// (backdrop-filter: blur + saturate — размытие с усилением цвета, отчего фон
// под стеклом «горит», как у Apple) и блик по фаске (градиентная рамка в
// маске, ярче сверху-слева). Толщину даёт внутренняя тень снизу.
//
// «Матовая» — противоположность. Матовая поверхность рассеивает свет во все
// стороны и потому не даёт бликов вовсе, а чёрный на ней выглядит глубже и
// ровнее, чем на глянце. Значит, из интерфейса убирается всё зеркальное:
// свечение текста, внешние тени, светлые кромки. Вместо них — микрорельеф
// настоящим шумом и одна мягкая тень внутрь, от которой панель читается как
// углубление, а не как наклейка.
//
// «Фосфор» — своя. Дашборд и так наполовину состоит из радарной развёртки,
// картушки и шкал; довести его до электронно-лучевой трубки было ближе всего.
// Строчная развёртка, зелёный люминофор, кадровая полоса, ползущая по экрану,
// и лёгкое мерцание накала.

// Блик по фаске. Ярче всего сверху-слева — оттуда в интерфейсе всегда светит,
// — быстро гаснет и слегка возвращается снизу-справа отражением от подложки.
const RING =
  "linear-gradient(148deg, rgba(255,255,255,0.95), rgba(255,255,255,0.34) 18%," +
  " rgba(255,255,255,0.05) 42%, rgba(255,255,255,0.02) 62%, rgba(255,255,255,0.45))";

export const THEMES = {
  instrument: {
    label: "приборная",
    hint: "Как было: тонкие линейки, ровный фон, ничего лишнего между цифрой и глазом.",
    apply: () => ({ texture: "smooth", corners: "sharp", panelFill: 0, glow: "normal" }),
    css: "",
  },

  glass: {
    label: "стеклянная",
    hint: "Панели из стекла: фон под ними размывается и набирает цвет, по фаске идёт блик, " +
          "по стеклу раз в несколько секунд проходит отсвет. Теме нужна сцена — сквозь " +
          "стекло должно быть что-то видно, поэтому пустой фон она заменяет на «глубину».",
    apply: (s) => ({
      texture: "glossy", corners: "round", panelFill: 4, glow: "normal",
      // Сцену трогаем, только если её нет: чужую картинку затирать нельзя.
      ...(s.scene === "none" ? { scene: "deep", bgTint: 22 } : {}),
    }),
    css: `
      .th-glass {
        --pnl-line: rgba(255,255,255,0.20);
        --pnl-head-line: rgba(255,255,255,0.13);
        --pnl-bg: linear-gradient(152deg, rgba(255,255,255,0.18), rgba(255,255,255,0.055) 46%,
                  rgba(255,255,255,0.11)), rgba(255,255,255,var(--ui-fill, 0));
        /* Подсветка: не просто размытие, а размытие с усилением цвета —
           именно от saturate фон под стеклом кажется светящимся. */
        --pnl-blur: blur(20px) saturate(180%) brightness(1.08);
        /* Тень наружу отделяет панель от фона, две внутренние дают толщину:
           светлая сверху — кромка, тёмная снизу — дно. */
        --pnl-shadow: 0 16px 40px -14px rgba(0,0,0,0.72),
                      inset 0 1px 0 rgba(255,255,255,0.34),
                      inset 0 -1px 0 rgba(0,0,0,0.34);
      }
      /* Скругление прибавляется к выбранному, а не подменяет его: настройка
         «Панели» остаётся живой, но острый угол у стекла невозможен. */
      .th-glass { --pnl-corner: calc(var(--ui-corner, 0px) + 12px) }
      .th-glass .pnl { position: relative; overflow: hidden; isolation: isolate }
      .th-glass .pnl > * { position: relative; z-index: 1 }
      /* Фаска. Рамку рисует градиент, а не border: у border один цвет на все
         четыре стороны, а блик обязан быть ярче сверху-слева и гаснуть книзу.
         Маска вырезает середину, оставляя ровно однопиксельное кольцо. */
      .th-glass .pnl::before {
        content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
        border-radius: inherit; padding: 1px; background: ${RING};
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor; mask-composite: exclude;
      }
      /* Отсвет. Идёт под содержимым — по стеклу, а не по цифрам. Задержка
         своя у каждого блока, иначе все панели вспыхивали бы разом. */
      @keyframes glassSheen {
        0%   { transform: translateX(-170%) skewX(-16deg); opacity: 0 }
        14%  { opacity: 1 }
        58%  { opacity: 1 }
        100% { transform: translateX(330%) skewX(-16deg); opacity: 0 }
      }
      .th-glass .pnl::after {
        content: ""; position: absolute; top: -20%; bottom: -20%; left: 0; width: 24%;
        z-index: 0; pointer-events: none;
        background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.13), rgba(255,255,255,0));
        animation: glassSheen 9s var(--ease-out) infinite;
        animation-delay: calc(var(--i, 0) * 1.1s);
      }
      .th-glass { --stat-bg: rgba(255,255,255,0.10);
                  --stat-shadow: 0 10px 26px -14px rgba(0,0,0,0.7),
                                 inset 0 1px 0 rgba(255,255,255,0.24) }
      /* Кнопки становятся пилюлями — там же, откуда взят материал. */
      .th-glass button, .th-glass input { border-radius: 999px }
      .th-glass > header, .th-glass nav {
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        backdrop-filter: blur(14px) saturate(160%);
      }
      .th-glass .modal-card {
        -webkit-backdrop-filter: blur(26px) saturate(180%);
        backdrop-filter: blur(26px) saturate(180%);
        background: rgba(255,255,255,0.09);
      }
      .mo-off.th-glass .pnl::after { display: none }
      .mo-calm.th-glass .pnl::after { animation-duration: 14s }
    `,
  },

  matte: {
    label: "матовая",
    hint: "Чёрная матовая плёнка: бликов нет ни одного, свечение выключено, поверхность " +
          "держит микрозерно. Чёрный от этого выглядит глубже и ровнее, чем на глянце.",
    apply: () => ({ texture: "matte", corners: "soft", panelFill: 0, glow: "off", scene: "none" }),
    css: `
      .th-matte {
        --pnl-line: rgba(150,164,178,0.11);
        --pnl-head-line: rgba(150,164,178,0.085);
        --pnl-bg: linear-gradient(180deg, rgba(255,255,255,0.016), rgba(0,0,0,0.14)),
                  rgba(255,255,255,var(--ui-fill, 0));
        /* Ни одной тени наружу: тень наружу — это свет, отражённый мимо, а
           матовая поверхность отражает всё рассеянно. Внутрь — можно: это не
           блик, а затенение, от него панель читается как углубление. */
        --pnl-shadow: inset 0 1px 0 rgba(255,255,255,0.035),
                      inset 0 -20px 34px -26px rgba(0,0,0,0.92);
      }
      .th-matte .pnl { position: relative; overflow: hidden }
      .th-matte .pnl > * { position: relative; z-index: 1 }
      /* Микрорельеф. Градиентом его не изобразить — матовость и есть шум. */
      .th-matte .pnl::after {
        content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background-image: ${noise(1.1, 3, 0.42)};
        background-size: 120px 120px; mix-blend-mode: soft-light; opacity: 0.5;
      }
      .th-matte { --stat-bg: rgba(0,0,0,0.16);
                  --stat-shadow: inset 0 -14px 26px -22px rgba(0,0,0,0.9) }
      .th-matte button { border-radius: 5px }
      .th-matte .modal-bg { background: rgba(2,3,4,0.94) }
    `,
  },

  crt: {
    label: "фосфор",
    hint: "Электронно-лучевая трубка: зелёный люминофор, строчная развёртка, кадровая " +
          "полоса и мерцание накала. Тема ставит зелёный акцент — без него это просто " +
          "полосатый экран.",
    apply: () => ({
      texture: "scanlines", corners: "sharp", panelFill: 0,
      glow: "strong", accent: "phosphor", scene: "none",
    }),
    veil: true,
    css: `
      .th-crt {
        --ui-bg: #030806;
        --pnl-line: rgba(120,255,170,0.22);
        --pnl-head-line: rgba(120,255,170,0.15);
        --pnl-bg: linear-gradient(180deg, rgba(80,255,150,0.045), rgba(80,255,150,0.008)),
                  rgba(255,255,255,var(--ui-fill, 0));
        /* Люминофор светится с той стороны стекла, поэтому свечение идёт
           внутрь панели, а не наружу. */
        --pnl-shadow: inset 0 0 26px -8px rgba(80,255,150,0.38);
      }
      .th-crt { --stat-bg: rgba(80,255,150,0.035);
                --stat-shadow: inset 0 0 18px -8px rgba(80,255,150,0.35) }
      .th-crt .pnl { position: relative; overflow: hidden }
      .th-crt .pnl > * { position: relative; z-index: 1 }
      .th-crt .pnl::after {
        content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background-image: repeating-linear-gradient(0deg,
          rgba(0,0,0,0.30) 0 1px, rgba(0,0,0,0) 1px 3px);
      }
      /* Плёнка поверх всего. Отдельным узлом, а не фоном body: строки обязаны
         стоять на месте при прокрутке — у настоящей трубки они привязаны к
         экрану, а не к изображению. Кликов не ловит и лежит выше модальных
         окон: развёртка не кончается на краю диалога. */
      @keyframes crtRoll  { from { transform: translateY(-140%) } to { transform: translateY(900%) } }
      @keyframes crtFlick { 0%, 100% { opacity: .97 } 7% { opacity: 1 } 11% { opacity: .9 }
                            44% { opacity: 1 } 47% { opacity: .93 } }
      .veil { position: fixed; inset: 0; pointer-events: none; z-index: 890 }
      .veil-crt {
        background:
          repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, rgba(0,0,0,0) 1px 3px),
          radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.58) 100%);
        animation: crtFlick 5.5s steps(1) infinite;
      }
      .veil-crt i {
        position: absolute; left: 0; right: 0; height: 11%;
        background: linear-gradient(180deg, rgba(180,255,210,0),
                    rgba(180,255,210,0.055), rgba(180,255,210,0));
        animation: crtRoll 7s linear infinite;
      }
      .mo-off .veil-crt, .mo-off .veil-crt i { animation: none }
      .mo-calm .veil-crt i { animation-duration: 13s }
    `,
  },
};

export function themeCss(key) {
  return THEMES[key]?.css || "";
}
