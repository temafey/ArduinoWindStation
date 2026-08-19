// Общие токены оформления и геометрия. Раньше всё это жило внутри
// wind-dashboard.jsx, но с появлением карты (wind-map.jsx) появился второй
// потребитель, а две копии палитры расходятся всегда — вопрос только в том,
// через сколько правок это заметят.
//
// Стиль — приборный бланк: тёмный фон с холодным отливом, тонкие линейки,
// подписи гротеском капителью, все числа моноширинные и с табличными цифрами.
// Свечение осталось настройкой, но перестало быть главным приёмом.

export const BG = "#04070a";
// То же самое, но через переменную — для мест, где цвет задаётся CSS-свойством
// (инлайновый style, в том числе на SVG). В презентационный атрибут SVG это
// подставлять нельзя: var() там не разворачивается, и фон окажется прибит
// к чёрному, что бы ни выбрал пользователь.
export const BG_VAR = "var(--ui-bg, #04070a)";
export const LINE = "rgba(160,180,200,0.15)";
export const LINE_HI = "rgba(160,180,200,0.30)";
export const TEXT = "#e7eef6";
export const DIM = "rgba(231,238,246,0.46)";
export const FAINT = "rgba(231,238,246,0.24)";

// Шрифты идут через CSS-переменные, а не константами. Причина: гарнитура стала
// настройкой, а оформление здесь живёт инлайн-стилями — протаскивать выбранный
// шрифт пропсами через полсотни компонентов было бы адом. Переменная ставится
// один раз на :root в блоке <style>, а fallback внутри var() держит вид, если
// переменной почему-то нет (серверный рендер, старый браузер).
//
// Ни одна гарнитура не скачивается: станция раздаёт дашборд в сети без
// интернета, поэтому в списках только то, что уже стоит в системе.
export const MONO = "var(--ui-mono, ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace)";
// Подписи и связный текст — гротеском: сплошной моноширинный набор читается как
// вывод терминала, а не как приборная панель.
export const SANS = "var(--ui-sans, 'Inter', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif)";

// Наборы для настройки «Гарнитура». Каждый задаёт обе переменные: у приборной
// панели подписи и числа обязаны быть разными, иначе таблица теряет строку.
export const FONT_SETS = {
  grotesk: {
    label: "гротеск",
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', system-ui, sans-serif",
    mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Roboto Mono', monospace",
  },
  mono: {
    label: "моноширинный",
    sans: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Roboto Mono', monospace",
    mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Roboto Mono', monospace",
  },
  serif: {
    label: "антиква",
    sans: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace",
  },
  system: {
    label: "системный",
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, Consolas, 'Courier New', monospace",
  },
};

// tabular-nums обязателен везде, где цифра меняется на месте: без него разряды
// пляшут при каждом обновлении и панель выглядит дёргано.
export const NUM = { fontFamily: MONO, fontVariantNumeric: "tabular-nums" };

const GLOW_MUL = { off: 0, normal: 1, strong: 1.9 };

export function glow(level, base = 1) {
  const m = (GLOW_MUL[level] ?? 1) * base;
  if (m === 0) return "none";
  return `0 0 ${4 * m}px rgba(226,236,246,${0.35 * Math.min(m, 1.2)}), ` +
         `0 0 ${14 * m}px rgba(226,236,246,${0.14 * Math.min(m, 1.2)})`;
}

export function glowColor(color, level, base = 1) {
  const m = (GLOW_MUL[level] ?? 1) * base;
  if (m === 0) return "none";
  return `0 0 ${5 * m}px ${color}, 0 0 ${18 * m}px ${color}88`;
}

// drop-shadow для SVG: то же самое, но фильтром, иначе свечение не ложится на пути.
export function dropGlow(color, level, base = 1) {
  const m = (GLOW_MUL[level] ?? 1) * base;
  if (m === 0) return undefined;
  return `drop-shadow(0 0 ${5 * m}px ${color})`;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Полярные координаты SVG: 0° — север (вверх), угол растёт по часовой стрелке,
// как на любом азимутальном приборе.
export function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function wedgePath(cx, cy, r0, r1, a0, a1) {
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r1} ${r1} 0 ${large} 1 ${p1.x} ${p1.y} ` +
         `L ${p2.x} ${p2.y} A ${r0} ${r0} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
}
