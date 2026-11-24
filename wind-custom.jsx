import { useState, useEffect } from "react";
import { LINE_HI, TEXT, DIM, FAINT, SANS, NUM, glow, noise } from "./ui-kit.js";

// ============================================================
// КАСТОМИЗАЦИЯ
// ============================================================
// Всё оформление дашборда уже шло через CSS-переменные — этот модуль просто
// добавляет к ним слои. Ничего не грузится из интернета: текстуры и сцены
// собраны из градиентов и одного SVG-шума, потому что копия, которую отдаёт
// сама плата, до внешних файлов не дотянется, а во флеше нет места на картинки.
//
// Своя картинка — исключение, но она и не в бандле: пользователь выбирает файл,
// браузер ужимает его до 1600 пикселей и кладёт в localStorage этого браузера.
// Ужимать обязательно: снимок с телефона — это 4-8 МБ, а во всём localStorage
// около пяти, и запись просто провалилась бы.

// ------------------------------------------------------------
// Материал подложки
// ------------------------------------------------------------
// noise() переехал в ui-kit: у него появился второй потребитель — тема
// «матовая», которой тот же микрорельеф нужен на самих панелях.

export const TEXTURES = {
  smooth: { label: "гладкий", layers: [] },
  grain: {
    label: "зернистый",
    layers: [{ image: noise(0.85, 4, 0.5), size: "140px 140px", blend: "overlay", opacity: 0.5 }],
  },
  matte: {
    label: "матовый",
    // Матовость — это очень мелкий шум и полное отсутствие бликов.
    layers: [{ image: noise(1.4, 3, 0.32), size: "90px 90px", blend: "soft-light", opacity: 0.55 }],
  },
  glossy: {
    label: "глянцевый",
    layers: [
      { image: "linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 42%, rgba(255,255,255,0) 68%, rgba(255,255,255,0.05) 100%)",
        size: "cover", blend: "screen", opacity: 1 },
    ],
  },
  brushed: {
    label: "шлифованный",
    layers: [
      { image: "repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, rgba(0,0,0,0) 1px 3px)",
        size: "auto", blend: "overlay", opacity: 1 },
      { image: noise(0.9, 2, 0.25), size: "140px 140px", blend: "overlay", opacity: 0.4 },
    ],
  },
  carbon: {
    label: "карбон",
    layers: [
      { image: "repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0 2px, rgba(0,0,0,0) 2px 5px)", size: "auto", blend: "overlay", opacity: 1 },
      { image: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0 2px, rgba(0,0,0,0) 2px 5px)", size: "auto", blend: "overlay", opacity: 1 },
    ],
  },
  grid: {
    label: "миллиметровка",
    layers: [
      { image: "repeating-linear-gradient(0deg, rgba(120,200,255,0.055) 0 1px, rgba(0,0,0,0) 1px 24px)", size: "auto", blend: "screen", opacity: 1 },
      { image: "repeating-linear-gradient(90deg, rgba(120,200,255,0.055) 0 1px, rgba(0,0,0,0) 1px 24px)", size: "auto", blend: "screen", opacity: 1 },
    ],
  },
  scanlines: {
    label: "развёртка",
    layers: [
      { image: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, rgba(0,0,0,0) 1px 3px)", size: "auto", blend: "multiply", opacity: 1 },
    ],
  },
  vignette: {
    label: "виньетка",
    layers: [
      { image: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)", size: "cover", blend: "multiply", opacity: 1 },
    ],
  },
};

// ------------------------------------------------------------
// Встроенные сцены
// ------------------------------------------------------------
// Не фотографии, а градиенты: на плате под картинки нет флеша, а тянуть их
// из интернета нельзя — у станции его нет. Все тёмные намеренно, светящийся
// текст по светлому фону не читается ни при какой настройке.
export const SCENES = {
  none: { label: "нет", css: null },
  // Просто чёрный. Не «нет»: у «нет» под панелями остаётся цвет подложки и
  // зерно материала, а здесь — ровный #000 без живых пятен .lg-wall.
  // Светлая «По умолчанию»: белый лист, чёрные грани панелей и две маленькие
  // холодные виньетки — справа сверху и слева снизу. Свет падает из угла,
  // поэтому пятна разного тона: сверху голубее, снизу сиреневее.
  light: {
    label: "По умолчанию",
    css: "radial-gradient(38% 34% at 100% 0%, rgba(120,160,230,0.22), rgba(120,160,230,0.07) 55%, rgba(120,160,230,0) 100%), "
       + "radial-gradient(36% 32% at 0% 100%, rgba(150,130,225,0.20), rgba(150,130,225,0.06) 55%, rgba(150,130,225,0) 100%), "
       + "linear-gradient(180deg, #fbfbfd, #f4f5f8)",
  },
  plain: {
    label: "Тёмная по умолчанию",
    css: "linear-gradient(#000, #000)",
  },
  // Основа под Liquid Glass. Сама по себе почти чёрная — цвет ей дают пятна
  // живого фона (.lg-wall в wind-themes.js), которые текут поверх неё.
  liquid: {
    label: "Liquid Glass",
    css: "radial-gradient(130% 100% at 20% 0%, #0b1530 0%, #070c1c 55%, #04060f 100%)",
  },
  // Та же основа, только ночная: подложка почти чёрная, пятна приглушены
  // (тёмная палитра холста, mountWall({ dark: true }) в wind-themes.js).
  liquidDark: {
    label: "Liquid Glass тёмная",
    css: "radial-gradient(130% 100% at 20% 0%, #040813 0%, #02050c 55%, #010208 100%)",
  },
  dusk: {
    label: "сумерки",
    css: "radial-gradient(120% 80% at 50% 105%, #2a1a3c 0%, #12101f 45%, #04070a 100%)",
  },
  storm: {
    label: "гроза",
    css: "radial-gradient(90% 70% at 30% 0%, #1c2a3a 0%, #0a1119 50%, #04070a 100%)",
  },
  aurora: {
    label: "сияние",
    css: "linear-gradient(180deg, #04070a 0%, #06231f 45%, #0a3a2e 70%, #04070a 100%)",
  },
  ember: {
    label: "закат",
    css: "linear-gradient(180deg, #04070a 0%, #1a0f12 40%, #3a1a10 78%, #4a2410 100%)",
  },
  arctic: {
    label: "арктика",
    css: "linear-gradient(200deg, #04070a 0%, #0a1a26 50%, #102c3a 100%)",
  },
  deep: {
    label: "глубина",
    css: "radial-gradient(100% 100% at 50% 0%, #0a1a2e 0%, #050d18 55%, #02040a 100%)",
  },
  mesa: {
    label: "мезосфера",
    css: "linear-gradient(160deg, #0a0512 0%, #1a0b2a 40%, #06131f 100%)",
  },
  custom: { label: "своя картинка", css: null },
};

export const CORNERS = { sharp: 0, soft: 4, round: 10 };

const BG_KEY = "wind_ui_bg_image";

export function loadBgImage() {
  try { return localStorage.getItem(BG_KEY) || null; } catch { return null; }
}
// ------------------------------------------------------------
// Сборка фоновых слоёв
// ------------------------------------------------------------
// Отдаётся готовым куском CSS для body, а не объектом стилей для отдельного
// элемента. Так задумано: подложка на body не создаёт своего контекста
// наложения и потому не может однажды перекрыть содержимое — а фоновый div
// пришлось бы вечно держать под правильным z-index в каждой обёртке.
//
// Порядок слоёв в CSS: первый — сверху. Поэтому затемнение идёт первым,
// затем текстура, и только потом сама сцена — иначе сцена закрасила бы зерно.
export function backdropCss(settings, bgImage, pageMax = 0) {
  const images = [], sizes = [], blends = [], repeats = [];

  // Поля по бокам. Пока предел ширины был просто пределом, содержимое
  // обрывалось по вертикали ровной чертой, и на широком мониторе это читалось
  // как «страница не доехала до края». Теперь фон за колонкой темнеет
  // постепенно: перехода нет, потому что нет и границы.
  //
  // Растяжка начинается ВНУТРИ колонки, а не по её краю: начнись она ровно на
  // границе — там появилась бы та самая черта, только мягче. Полный тон
  // набирается за 240 пикселей снаружи, и на узком экране, где полей нет,
  // слой просто не строится.
  // На светлой сцене тёмные поля и затемнение читались бы серой грязью:
  // поля там — едва заметная холодная тень, а затемнения нет вовсе.
  const light = settings.scene === "light" || settings.scene === "liquidLight";
  const side = light ? "rgba(40,60,110,0.045)" : "rgba(0,0,0,0.34)";
  if (pageMax > 0) {
    const half = `${Math.round(pageMax / 2)}px`;
    const IN = 60, OUT = 240;
    images.push(
      `linear-gradient(to right,` +
      ` ${side} 0,` +
      ` ${side} calc(50% - ${half} - ${OUT}px),` +
      ` rgba(0,0,0,0) calc(50% - ${half} + ${IN}px),` +
      ` rgba(0,0,0,0) calc(50% + ${half} - ${IN}px),` +
      ` ${side} calc(50% + ${half} + ${OUT}px),` +
      ` ${side} 100%)`
    );
    sizes.push("cover"); blends.push("normal"); repeats.push("no-repeat");
  }

  const tint = light ? 0 : Math.max(0, Math.min(90, settings.bgTint || 0)) / 100;
  if (tint > 0) {
    const c = `rgba(0,0,0,${tint.toFixed(2)})`;
    images.push(`linear-gradient(${c}, ${c})`);
    sizes.push("cover"); blends.push("normal"); repeats.push("no-repeat");
  }

  const tex = TEXTURES[settings.texture] || TEXTURES.smooth;
  for (const l of tex.layers) {
    images.push(l.image);
    sizes.push(l.size === "auto" ? "auto" : l.size);
    blends.push(l.blend);
    repeats.push(l.size === "cover" ? "no-repeat" : "repeat");
  }

  if (settings.scene === "custom" && bgImage) {
    images.push(`url("${bgImage}")`);
    sizes.push("cover"); blends.push("normal"); repeats.push("no-repeat");
  } else {
    const sc = SCENES[settings.scene === "liquidLight" ? "light" : settings.scene];
    if (sc?.css) {
      images.push(sc.css);
      sizes.push("cover"); blends.push("normal"); repeats.push("no-repeat");
    }
  }

  if (!images.length) return "";
  // Прокрутка не должна тащить фон за собой, иначе зерно «плывёт» по экрану.
  return `background-image: ${images.join(", ")};
          background-size: ${sizes.join(", ")};
          background-blend-mode: ${blends.join(", ")};
          background-repeat: ${repeats.join(", ")};
          background-position: center;
          background-attachment: fixed;`;
}

// ============================================================
// СВОИ ВИДЖЕТЫ
// ============================================================
export const WIDGET_KINDS = {
  note:      { label: "Заметка",        hint: "Произвольный текст: что проверить, куда смотреть." },
  value:     { label: "Своя величина",  hint: "Число, которое ты вводишь сам: высота мачты, номер датчика." },
  countdown: { label: "Отсчёт до даты", hint: "Сколько осталось до выбранного дня." },
  since:     { label: "Время с момента", hint: "Сколько прошло с выбранного дня — например, с установки мачты." },
  link:      { label: "Ссылка",         hint: "Кнопка на нужную страницу." },
};

function fmtSpan(ms) {
  const past = ms < 0;
  let s = Math.abs(Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  const head = d > 0 ? `${d} д ${h} ч` : h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  return { head, past };
}

export function CustomWidgets({ widgets, g, accent, Panel, delay = 200 }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!widgets?.some((w) => w.kind === "countdown" || w.kind === "since")) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [widgets]);

  if (!widgets?.length) return null;

  return widgets.map((w, i) => {
    let body = null;

    if (w.kind === "note") {
      body = (
        <div style={{ color: "rgba(var(--ink, 231,238,246),0.82)", fontSize: 11.5, lineHeight: 1.65,
                      fontFamily: SANS, whiteSpace: "pre-wrap" }}>
          {w.text || "—"}
        </div>
      );
    } else if (w.kind === "value") {
      body = (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ ...NUM, fontSize: 30, color: TEXT, textShadow: glow(g, 0.8) }}>
            {w.text || "—"}
          </span>
          <span style={{ color: DIM, fontSize: 11, fontFamily: SANS }}>{w.unit || ""}</span>
        </div>
      );
    } else if (w.kind === "countdown" || w.kind === "since") {
      const t = w.date ? new Date(w.date).getTime() : NaN;
      if (!isFinite(t)) {
        body = <div style={{ color: FAINT, fontSize: 11, fontFamily: SANS }}>Дата не задана.</div>;
      } else {
        const { head, past } = fmtSpan(w.kind === "countdown" ? t - now : now - t);
        body = (
          <div>
            <div style={{ ...NUM, fontSize: 26, color: TEXT, textShadow: glow(g, 0.8) }}>{head}</div>
            <div style={{ color: DIM, fontSize: 10, fontFamily: SANS, marginTop: 3 }}>
              {w.kind === "countdown"
                ? (past ? "срок уже прошёл" : "осталось")
                : (past ? "впереди" : "прошло")}
              {" · "}{new Date(t).toLocaleDateString("ru-RU")}
            </div>
          </div>
        );
      }
    } else if (w.kind === "link") {
      body = (
        <a href={w.text || "#"} target="_blank" rel="noreferrer noopener"
           style={{ display: "inline-block", border: `1px solid ${LINE_HI}`, padding: "6px 12px",
                    color: TEXT, textDecoration: "none", fontFamily: SANS, fontSize: 10.5,
                    letterSpacing: 1, textShadow: glow(g, 0.4) }}>
          ОТКРЫТЬ ↗
        </a>
      );
    }

    return (
      <Panel key={w.id} title={w.title || WIDGET_KINDS[w.kind]?.label || "Виджет"}
             g={g} delay={delay + i * 20} meta="СВОЙ">
        {body}
      </Panel>
    );
  });
}
