import { useState, useEffect, useRef } from "react";
import {
  LINE, LINE_HI, TEXT, DIM, FAINT, SANS, MONO, NUM, glow, noise,
} from "./ui-kit.js";
import { WIDTHS } from "./wind-widths.js";
import { THEMES } from "./wind-themes.js";

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
function saveBgImage(v) {
  try {
    if (v) localStorage.setItem(BG_KEY, v);
    else localStorage.removeItem(BG_KEY);
    return true;
  } catch {
    return false;   // не влезло — квота localStorage около пяти мегабайт
  }
}

// Снимок с телефона — это несколько мегабайт, а места около пяти на всё.
// Поэтому ужимаем: длинная сторона 1600, JPEG. Разница на глаз незаметна,
// а в хранилище влезает с запасом.
function shrink(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("не картинка")); };
    img.src = url;
  });
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
  if (pageMax > 0) {
    const half = `${Math.round(pageMax / 2)}px`;
    const IN = 60, OUT = 240;
    images.push(
      `linear-gradient(to right,` +
      ` rgba(0,0,0,0.34) 0,` +
      ` rgba(0,0,0,0.34) calc(50% - ${half} - ${OUT}px),` +
      ` rgba(0,0,0,0) calc(50% - ${half} + ${IN}px),` +
      ` rgba(0,0,0,0) calc(50% + ${half} - ${IN}px),` +
      ` rgba(0,0,0,0.34) calc(50% + ${half} + ${OUT}px),` +
      ` rgba(0,0,0,0.34) 100%)`
    );
    sizes.push("cover"); blends.push("normal"); repeats.push("no-repeat");
  }

  const tint = Math.max(0, Math.min(90, settings.bgTint || 0)) / 100;
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
    const sc = SCENES[settings.scene];
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

let seq = 0;
function newId() {
  // Date.now() тут был бы очевиднее, но двух виджетов в одну миллисекунду
  // хватило бы для совпадения — счётчик надёжнее и короче.
  seq += 1;
  return `w${seq}_${Math.random().toString(36).slice(2, 7)}`;
}

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
        <div style={{ color: "rgba(231,238,246,0.82)", fontSize: 11.5, lineHeight: 1.65,
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

// ============================================================
// ПАНЕЛЬ НАСТРОЙКИ
// ============================================================
function Head({ children, g }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: 1.8, textTransform: "uppercase",
                  color: DIM, textShadow: glow(g, 0.4), margin: "4px 0 6px" }}>
      {children}
    </div>
  );
}

function Tiles({ table, value, onPick, g, accent }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {Object.keys(table).map((k) => {
        const on = k === value;
        return (
          <button key={k} onClick={() => onPick(k)}
                  style={{
                    background: on ? "rgba(231,238,246,0.09)" : "transparent",
                    border: `1px solid ${on ? accent : LINE}`,
                    color: on ? TEXT : DIM, textShadow: on ? glow(g, 0.5) : "none",
                    fontFamily: SANS, fontSize: 10, letterSpacing: 1.1,
                    padding: "5px 10px", cursor: "pointer",
                  }}>
            {table[k].label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, suffix, onChange, g, accent }) {
  return (
    <div style={{ margin: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: DIM, fontFamily: SANS, fontSize: 10.5 }}>{label}</span>
        <span style={{ ...NUM, fontSize: 10.5, color: TEXT }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))}
             style={{ width: "100%", accentColor: accent, marginTop: 3 }} />
    </div>
  );
}

export default function Customize({ settings, setS, g, accent, onEditLayout }) {
  const [bgImage, setBgImage] = useState(loadBgImage);
  const [msg, setMsg] = useState(null);
  const [draft, setDraft] = useState({ kind: "note", title: "", text: "", unit: "", date: "" });
  const fileRef = useRef(null);

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg("Ужимаю…");
    try {
      const url = await shrink(f);
      if (!saveBgImage(url)) {
        setMsg("Картинка не поместилась в хранилище браузера. Попробуй файл поменьше.");
        return;
      }
      setBgImage(url);
      setS({ scene: "custom" });
      setMsg(`Готово, ${Math.round(url.length / 1024)} КБ после сжатия.`);
    } catch {
      setMsg("Этот файл не удалось прочитать как картинку.");
    }
  };

  const dropFile = () => {
    saveBgImage(null);
    setBgImage(null);
    if (settings.scene === "custom") setS({ scene: "none" });
    setMsg(null);
  };

  const widgets = settings.widgets || [];
  const addWidget = () => {
    if (!draft.title && !draft.text && !draft.date) return;
    setS({ widgets: [...widgets, { ...draft, id: newId() }] });
    setDraft({ kind: draft.kind, title: "", text: "", unit: "", date: "" });
  };
  const dropWidget = (id) => setS({ widgets: widgets.filter((w) => w.id !== id) });
  const move = (i, d) => {
    const next = [...widgets];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setS({ widgets: next });
  };

  const btn = {
    background: "transparent", border: `1px solid ${LINE_HI}`, color: TEXT,
    fontFamily: SANS, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase",
    padding: "5px 11px", cursor: "pointer",
  };
  const field = {
    ...NUM, fontSize: 11, padding: "5px 8px", background: "transparent",
    border: `1px solid ${LINE}`, color: TEXT, minWidth: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6, fontFamily: SANS, marginBottom: 4 }}>
        Оформление живёт в этом браузере и никуда не уходит. Ничего не грузится из
        интернета: текстуры и сцены собраны из градиентов, поэтому работают и на копии,
        которую отдаёт сама плата.
      </div>

      {/* Тема идёт первой: она разом переставляет материал, скругление и
          свечение, и выбирать их по одному имеет смысл уже после неё. Своя
          картинка при этом не трогается — тема меняет сцену, только если
          сцены нет вовсе. */}
      <Head g={g}>Тема</Head>
      <Tiles table={THEMES} value={settings.theme} g={g} accent={accent}
             onPick={(v) => setS({ theme: v, ...(THEMES[v].apply?.(settings) || {}) })} />
      <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6, fontFamily: SANS, margin: "6px 0 4px" }}>
        {THEMES[settings.theme]?.hint}
      </div>
      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, fontFamily: SANS, margin: "0 0 12px" }}>
        Тема выставляет материал подложки, скругление, заливку и свечение — всё это
        ниже можно поменять под себя, тема их только предлагает.
      </div>

      {/* Раскладка правится не здесь, а на самой странице: переставлять
          блоки, не видя их, — гадание. Кнопка лишь уводит туда и включает
          режим правки. */}
      <Head g={g}>Ширина страницы</Head>
      <Tiles table={WIDTHS} value={settings.pageWidth} g={g} accent={accent}
             onPick={(v) => setS({ pageWidth: v })} />
      <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6, fontFamily: SANS, margin: "2px 0 10px" }}>
        На широком экране появляется третья колонка — но только если ширина это
        позволяет. При пределе в 1080 её не будет даже на огромном мониторе:
        колонка вышла бы уже трёхсот пикселей, и график в ней стал бы полоской.
      </div>

      <Head g={g}>Раскладка</Head>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "2px 0 10px" }}>
        <button onClick={onEditLayout} style={{
          background: "transparent", border: `1px solid ${accent}`, color: TEXT,
          fontFamily: MONO, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase",
          padding: "8px 14px", cursor: "pointer",
        }}>Кастомизировать раскладку</button>
        <div style={{ flex: 1, minWidth: 180, color: DIM, fontSize: 11, lineHeight: 1.6, fontFamily: SANS }}>
          Откроет «Основное» и даст переставить любые блоки — тащить за уголок или
          двигать стрелками. Часы и знак станции остаются на месте.
        </div>
      </div>

      <Head g={g}>Материал подложки</Head>
      <Tiles table={TEXTURES} value={settings.texture} g={g} accent={accent}
             onPick={(v) => setS({ texture: v })} />

      <Head g={g}>Сцена</Head>
      <Tiles table={SCENES} value={settings.scene} g={g} accent={accent}
             onPick={(v) => {
               if (v === "custom" && !bgImage) { fileRef.current?.click(); return; }
               setS({ scene: v });
             }} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{ display: "none" }} />
        <button style={btn} onClick={() => fileRef.current?.click()}>
          {bgImage ? "заменить картинку" : "загрузить картинку"}
        </button>
        {bgImage && <button style={btn} onClick={dropFile}>убрать</button>}
      </div>
      {msg && (
        <div style={{ color: FAINT, fontSize: 10, fontFamily: SANS, marginTop: 5 }}>{msg}</div>
      )}

      {settings.scene !== "none" && (
        <Slider label="Затемнение фона" value={settings.bgTint} min={0} max={90} suffix=" %"
                onChange={(v) => setS({ bgTint: v })} g={g} accent={accent} />
      )}

      <Head g={g}>Свой цвет</Head>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input type="color" value={settings.customAccent || "#67e8f9"}
               onChange={(e) => setS({ customAccent: e.target.value })}
               style={{ width: 42, height: 28, padding: 0, background: "transparent",
                        border: `1px solid ${LINE}`, cursor: "pointer" }} />
        <span style={{ ...NUM, fontSize: 10.5, color: DIM }}>
          {settings.customAccent || "не задан"}
        </span>
        {settings.customAccent && (
          <button style={btn} onClick={() => setS({ customAccent: "" })}>сбросить</button>
        )}
      </div>
      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, fontFamily: SANS, marginTop: 5 }}>
        Свой цвет перекрывает выбор акцента в основных настройках. Цвет по Бофорту при этом
        перестаёт работать: он меняется вместе с ветром, и постоянный цвет — прямо
        противоположное намерение.
      </div>

      <Head g={g}>Панели</Head>
      <Tiles table={{ sharp: { label: "острые углы" }, soft: { label: "скруглённые" }, round: { label: "круглые" } }}
             value={settings.corners} g={g} accent={accent} onPick={(v) => setS({ corners: v })} />
      <Slider label="Заливка панелей" value={settings.panelFill} min={0} max={40} suffix=" %"
              onChange={(v) => setS({ panelFill: v })} g={g} accent={accent} />

      <Head g={g}>Свои виджеты</Head>
      {widgets.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {widgets.map((w, i) => (
            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 6,
                                     padding: "5px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ ...NUM, fontSize: 9, color: FAINT, width: 18 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, color: TEXT, fontFamily: SANS, fontSize: 11,
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {w.title || WIDGET_KINDS[w.kind]?.label}
              </span>
              <span style={{ ...NUM, fontSize: 9, color: FAINT }}>{WIDGET_KINDS[w.kind]?.label}</span>
              <button style={{ ...btn, padding: "2px 7px" }} onClick={() => move(i, -1)}>↑</button>
              <button style={{ ...btn, padding: "2px 7px" }} onClick={() => move(i, 1)}>↓</button>
              <button style={{ ...btn, padding: "2px 7px" }} onClick={() => dropWidget(w.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      <Tiles table={WIDGET_KINDS} value={draft.kind} g={g} accent={accent}
             onPick={(v) => setDraft({ ...draft, kind: v })} />
      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, fontFamily: SANS, margin: "5px 0" }}>
        {WIDGET_KINDS[draft.kind]?.hint}
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <input value={draft.title} placeholder="заголовок" style={{ ...field, flex: "1 1 130px" }}
               onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        {(draft.kind === "note" || draft.kind === "value" || draft.kind === "link") && (
          <input value={draft.text}
                 placeholder={draft.kind === "link" ? "https://…" : draft.kind === "value" ? "число" : "текст"}
                 style={{ ...field, flex: "1 1 130px" }}
                 onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        )}
        {draft.kind === "value" && (
          <input value={draft.unit} placeholder="ед." style={{ ...field, width: 70 }}
                 onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        )}
        {(draft.kind === "countdown" || draft.kind === "since") && (
          <input type="date" value={draft.date} style={{ ...field, flex: "1 1 130px" }}
                 onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        )}
        <button style={btn} onClick={addWidget}>добавить</button>
      </div>

      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.55, fontFamily: SANS, marginTop: 8 }}>
        Виджеты появляются на вкладке «Основное» под остальными панелями и переживают
        перезагрузку страницы. Хранятся они там же, где настройки, — в этом браузере.
      </div>
    </div>
  );
}
