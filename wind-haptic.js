// Вибрация на телефоне — на самой малой силе, как отклик стекла под пальцем.
//
// В приложении Android — через мост WKNative.haptic: системный отклик
// performHapticFeedback (тот же, что у клавиатуры и часиков), без разрешения
// VIBRATE и с уважением к системной настройке «Виброотклик». Он мягче и
// короче любого navigator.vibrate: тот гоняет мотор минимум миллисекунды
// по 5–10, а системный отклик бьёт ровно один такт.
//
// В браузере — navigator.vibrate короткими импульсами, только на сенсорном
// экране. Chrome пускает вибрацию лишь после первого касания страницы, так что
// заставка в браузере молчит, — это ограничение браузера, не наше. Safari на
// iPhone Vibration API не поддерживает вовсе; на компьютере мотора нет.
//
// Виды: "tick" — щелчок шага ползунка, "tap" — касание окна, "edge" — упор
// ползунка в край, "boot" — заставка при входе.

const VIB = { tick: 4, tap: 7, edge: 12, boot: 10 };
const GAP = { tick: 28, tap: 70, edge: 90, boot: 0 };
let last = 0;

// Настройки («Вибрация»). Сила — это не амплитуда (системный отклик её не
// принимает), а сдвиг вида на ступень: «мягко» заменяет каждый вид более лёгким
// (щелчок шага ползунка пропадает совсем), «сильно» — более жёстким, а упор
// ползунка бьёт дважды. Группы выключаются каждая отдельно.
let cfg = { level: "normal", touch: true, sliders: true, boot: true, quiet: false };   // quiet — тихие часы: вибрации нет вовсе
const GROUP = { tick: "sliders", edge: "sliders", tap: "touch", boot: "boot" };
const SHIFT = {
  soft:   { tick: null, tap: "tick", edge: "tap", boot: "tick" },
  normal: {},
  strong: { tick: "tap", tap: "edge", edge: "edge", boot: "edge" },
};
export function setHapticConfig(c) { cfg = { ...cfg, ...c }; }

const native = () => {
  try { return typeof window !== "undefined" && window.WKNative && typeof window.WKNative.haptic === "function"; }
  catch { return false; }
};
let coarse = null;
const touchScreen = () => {
  if (coarse == null) {
    try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch { coarse = false; }
  }
  return coarse;
};

// Есть ли на этом устройстве чем вибрировать — для подсказки в настройках.
export function canVibrate() {
  if (typeof window === "undefined") return false;
  return native() || (touchScreen() && typeof navigator.vibrate === "function");
}

export function haptic(kind = "tap") {
  if (typeof window === "undefined") return;
  if (cfg.quiet || cfg.level === "off" || cfg[GROUP[kind] || "touch"] === false) return;
  const now = performance.now();
  if (now - last < (GAP[kind] ?? 60)) return;
  const shift = SHIFT[cfg.level] || {};
  const k = kind in shift ? shift[kind] : kind;
  if (k === null) return;
  last = now;
  const fire = () => {
    if (native()) {
      try { window.WKNative.haptic(k); } catch { /* старая оболочка */ }
      return;
    }
    if (!touchScreen() || typeof navigator.vibrate !== "function") return;
    try { navigator.vibrate(VIB[k] ?? 7); } catch { /* запрещено до первого касания */ }
  };
  fire();
  if (cfg.level === "strong" && kind === "edge") setTimeout(fire, 70);   // упор — двойной
}

// Долгая тихая вибрация — на всё время полосы установки обновления.
// В приложении Android — системный вибромотор на малой амплитуде
// (WKNative.hapticLong); где амплитудой управлять нельзя, оболочка заменяет
// гул мелким «мурлыканьем» коротких импульсов. В браузере — те же импульсы
// через navigator.vibrate. hapticStop() глушит сразу.
export function hapticLong(ms) {
  if (typeof window === "undefined" || !(ms > 0)) return;
  if (cfg.level === "off" || cfg.boot === false) return;
  const n = Math.round(Math.min(30000, ms));
  try {
    if (window.WKNative && typeof window.WKNative.hapticLong === "function") { window.WKNative.hapticLong(n); return; }
  } catch { /* старая оболочка */ }
  if (!touchScreen() || typeof navigator.vibrate !== "function") return;
  const pat = [];
  for (let t = 0; t < n; t += 140) pat.push(12, 128);
  try { navigator.vibrate(pat); } catch { /* до первого касания нельзя */ }
}

// Нарастающая вибрация на запуск: от почти неощутимой до заметной, плавно (по
// кривой x^2.2, а не ступенькой). Сила — предел, до которого она доходит; уровень
// «Вибрации» сдвигает его, а «выкл» и тихие часы глушат совсем.
const PEAK = { soft: 90, normal: 150, strong: 220 };
export function hapticRamp(ms) {
  if (typeof window === "undefined" || !(ms > 0)) return;
  if (cfg.quiet || cfg.level === "off" || cfg.boot === false) return;
  const n = Math.round(Math.min(30000, ms)), peak = PEAK[cfg.level] || PEAK.normal;
  try {
    if (window.WKNative && typeof window.WKNative.hapticRamp === "function") { window.WKNative.hapticRamp(n, peak); return; }
  } catch { /* старая оболочка */ }
  if (!touchScreen() || typeof navigator.vibrate !== "function") return;
  // Без управления амплитудой — «мурлыканье»: импульсы всё длиннее, паузы всё короче.
  const pat = [], k = Math.max(4, Math.round(n / 90));
  for (let i = 0; i < k; i++) { const x = (i + 1) / k; pat.push(Math.round(6 + 54 * x * x), Math.round(80 - 50 * x)); }
  try { navigator.vibrate(pat); } catch { /* до первого касания нельзя */ }
}

export function hapticStop() {
  if (typeof window === "undefined") return;
  try {
    if (window.WKNative && typeof window.WKNative.hapticStop === "function") { window.WKNative.hapticStop(); return; }
  } catch { /* старая оболочка */ }
  try { if (typeof navigator.vibrate === "function") navigator.vibrate(0); } catch { /* нечего глушить */ }
}

// Касание окна: отклик на отпускание без сдвига, а не на нажатие — иначе
// телефон дёргался бы в начале каждой прокрутки (pointerdown приходит и тогда,
// а pointercancel — уже после). Ползунки и поля ввода отзываются сами.
export function mountTapHaptics() {
  if (typeof window === "undefined") return () => {};
  let down = null;
  const onDown = (e) => {
    if (e.pointerType !== "touch") { down = null; return; }
    if (e.target.closest?.("input, textarea, select, canvas")) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e) => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 12) return;
    haptic("tap");
  };
  const onCancel = () => { down = null; };
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onCancel, { passive: true });
  return () => {
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };
}
