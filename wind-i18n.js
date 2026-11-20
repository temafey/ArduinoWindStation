// Языки интерфейса (с Beta 0.5.0).
//
// Интерфейс написан по-русски, и строки разбросаны по двум десяткам модулей —
// больше тысячи мест. Переписывать каждое на t("…") значило бы трогать весь
// дашборд разом и ломать его с каждой новой строкой, забытой в обёртке. Поэтому
// перевод делается на странице: переводчик смотрит на текстовые узлы и три
// атрибута (title, aria-label, placeholder), и если русский текст есть в
// словаре — подменяет его. Новая строка, которой в словаре ещё нет, просто
// остаётся русской: ничего не ломается, её видно и её можно добавить.
//
// Словарь — пары «шаблон → перевод», где числа заменены на #: «Средняя · 2 мин»
// и «Средняя · 10 мин» — один ключ «Средняя · # мин», числа подставляются
// обратно по порядку. Ключи — wind-i18n-keys.js, переводы — по файлу на язык
// (wind-i18n-<код>.js), массив в том же порядке. Файлы языков грузятся только
// когда язык выбран: русскому не нужно ничего.
//
// React узлы не пересоздаёт, а меняет у них nodeValue, поэтому подмена текста
// с ним уживается: изменившееся значение придёт событием MutationObserver и
// будет переведено снова. Свою же запись переводчик узнаёт по сохранённому
// результату и второй раз не трогает.

export const LANGS = [
  { code: "ru", name: "Русский", en: "Russian" },
  { code: "uk", name: "Українська", en: "Ukrainian" },
  { code: "en", name: "English", en: "English" },
  { code: "es", name: "Español", en: "Spanish" },
  { code: "fr", name: "Français", en: "French" },
  { code: "de", name: "Deutsch", en: "German" },
  { code: "it", name: "Italiano", en: "Italian" },
  { code: "pt", name: "Português", en: "Portuguese" },
  { code: "pl", name: "Polski", en: "Polish" },
  { code: "tr", name: "Türkçe", en: "Turkish" },
  { code: "zh", name: "中文", en: "Chinese" },
  { code: "ja", name: "日本語", en: "Japanese" },
  { code: "ko", name: "한국어", en: "Korean" },
];

const LOADERS = {
  uk: () => import("./wind-i18n-uk.js"),
  en: () => import("./wind-i18n-en.js"),
  es: () => import("./wind-i18n-es.js"),
  fr: () => import("./wind-i18n-fr.js"),
  de: () => import("./wind-i18n-de.js"),
  it: () => import("./wind-i18n-it.js"),
  pt: () => import("./wind-i18n-pt.js"),
  pl: () => import("./wind-i18n-pl.js"),
  tr: () => import("./wind-i18n-tr.js"),
  zh: () => import("./wind-i18n-zh.js"),
  ja: () => import("./wind-i18n-ja.js"),
  ko: () => import("./wind-i18n-ko.js"),
};

export const langInfo = (code) => LANGS.find((l) => l.code === code) || LANGS[0];

// Язык системы — первый из списка предпочтений браузера, который мы знаем.
// Белорусский и казахский интерфейс чаще всего читают по-русски, остальные
// незнакомые — по-английски: это язык, который понимает больше всего людей.
export function systemLang() {
  let list = [];
  try { list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]; }
  catch { list = []; }
  for (const raw of list) {
    const c = String(raw || "").toLowerCase().split(/[-_]/)[0];
    if (LANGS.some((l) => l.code === c)) return c;
    if (c === "be" || c === "kk") return "ru";
  }
  return list.length ? "en" : "ru";
}

// null = «как в системе».
export const resolveLang = (setting) => (setting && LANGS.some((l) => l.code === setting) ? setting : systemLang());

const CYR = /[А-Яа-яЁё]/;
const NUM = /\d+(?:[.,]\d+)?/g;
const ATTRS = ["title", "aria-label", "placeholder"];

let dict = null;          // Map: шаблон → перевод
let current = "ru";
let observer = null;
const textMemo = new WeakMap();   // узел → { src, out }
const attrMemo = new WeakMap();   // элемент → { [атрибут]: { src, out } }

function translate(src) {
  const t = src.trim();
  if (!t || !CYR.test(t)) return null;
  let hit = dict.get(t);
  if (hit == null) {
    const nums = t.match(NUM);
    if (!nums) return null;
    const tpl = dict.get(t.replace(NUM, "#"));
    if (tpl == null) return null;
    let i = 0;
    hit = tpl.replace(/#/g, () => (i < nums.length ? nums[i++] : "#"));
  }
  if (hit === t) return null;
  // Пробелы по краям — часть вёрстки («Сейчас решает устройство: » + число).
  const lead = src.match(/^\s*/)[0], tail = src.match(/\s*$/)[0];
  return lead + hit + tail;
}

const skip = (el) => !el || el.closest("script, style, textarea, [translate='no'], .notranslate");

function doText(n) {
  const v = n.nodeValue;
  const m = textMemo.get(n);
  if (m && v === m.out) return;
  if (skip(n.parentElement)) return;
  const out = translate(v);
  if (out == null) { if (m) textMemo.delete(n); return; }
  textMemo.set(n, { src: v, out });
  n.nodeValue = out;
}

function doAttrs(el) {
  if (skip(el)) return;
  let memo = attrMemo.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    if (memo && memo[a] && memo[a].out === v) continue;
    const out = translate(v);
    if (out == null) continue;
    if (!memo) attrMemo.set(el, (memo = {}));
    memo[a] = { src: v, out };
    el.setAttribute(a, out);
  }
}

function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) doText(n);
  if (root.matches && root.matches("[title],[aria-label],[placeholder]")) doAttrs(root);
  root.querySelectorAll && root.querySelectorAll("[title],[aria-label],[placeholder]").forEach(doAttrs);
}

// Вернуть русский там, где переводчик что-то менял.
function restore(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const m = textMemo.get(n);
    if (m && n.nodeValue === m.out) n.nodeValue = m.src;
    textMemo.delete(n);
  }
  root.querySelectorAll("[title],[aria-label],[placeholder]").forEach((el) => {
    const memo = attrMemo.get(el);
    if (!memo) return;
    for (const a of ATTRS) if (memo[a] && el.getAttribute(a) === memo[a].out) el.setAttribute(a, memo[a].src);
    attrMemo.delete(el);
  });
}

async function loadDict(code) {
  const [{ KEYS }, mod] = await Promise.all([import("./wind-i18n-keys.js"), LOADERS[code]()]);
  const tr = mod.default;
  const m = new Map();
  for (let i = 0; i < KEYS.length; i++) if (tr[i]) m.set(KEYS[i], tr[i]);
  return m;
}

let seq = 0;
// Включить язык. Возвращает обещание, которое разрешается, когда страница
// переведена (или вернулась к русскому).
export async function applyLang(code) {
  const my = ++seq;
  const root = document.body;
  if (!LOADERS[code]) code = "ru";
  try { document.documentElement.lang = code; } catch { /* ignore */ }
  if (code === current && (code === "ru" || dict)) return;
  if (observer) { observer.disconnect(); observer = null; }
  if (dict) restore(root);
  dict = null;
  current = code;
  if (code === "ru") return;
  let m;
  try { m = await loadDict(code); } catch { current = "ru"; return; }
  if (my !== seq) return;
  dict = m;
  walk(root);
  observer = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes") doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true,
                           attributes: true, attributeFilter: ATTRS });
}

// Перевод строки для того, что рисуется не в DOM (холст, уведомления, голос).
// Пока словарь не загружен — исходник.
export function tr(s) {
  if (!dict || typeof s !== "string") return s;
  return translate(s) ?? s;
}
