// ============================================================
// ОКНА ИЗ КНОПКИ
// ============================================================
// Любое окно, которое открывается нажатием (версия, Claude, обновление,
// модальные окна), вырастает из того, на что нажали, и уходит обратно в него
// — как стекло в iOS 26, которое не «появляется», а перетекает из кнопки.
//
// Как устроено. Открытие — FLIP: окно уже стоит на своём месте, и анимация
// стартует с рамки кнопки (сдвиг + растяжение) и приходит в «никакого
// transform». Скругление пересчитывается под растяжение, иначе капсула-кнопка
// превращалась бы по дороге в овал. Содержимое проявляется позже рамки:
// растянутый текст хуже, чем никакого.
//
// Закрытие. Родитель убирает окно из дерева сразу — переделывать каждое место,
// где окно закрывают, под отложенное удаление было бы десятком одинаковых
// таймеров. Вместо этого в момент удаления (очистка layout-эффекта: узел ещё
// в документе) снимается копия окна, ставится на то же место поверх всего и
// уезжает обратно в кнопку. Копия — картинка: кликов не ловит, фокуса не берёт.
//
// Только transform, opacity и скругление: композитор, без раскладки страницы.
// «Без движения» (в настройках или в системе) — окна просто появляются.

import { useLayoutEffect, useRef } from "react";

// Что нажали последним. Запоминается в фазе перехвата, до того как обработчик
// кнопки успел что-нибудь закрыть. Кнопка внутри всплывающего окна, которое
// при этом закроется, указывает на хозяина окна (data-morph-owner): иначе
// окно «Обновление», открытое из окошка версии, уходило бы в пустоту.
let last = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => {
    let el = e.target && e.target.closest && e.target.closest("button, a, [role=button], [data-morph-src]");
    if (!el) return;
    const own = el.closest("[data-morph-owner]");
    if (own) el = document.querySelector(own.dataset.morphOwner) || el;
    last = { el, at: performance.now() };
  }, true);
}

export function pressedAnchor(maxAge = 1500) {
  return last && performance.now() - last.at < maxAge ? last.el : null;
}

function quiet() {
  if (typeof window === "undefined") return true;
  return !!document.querySelector(".app.mo-off")
    || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

// Размытие при движении — то же, что у панели настроек, которая проявляется из
// дымки. В эко-режиме фильтр дорог, там остаётся одна прозрачность.
const mb = () => (document.querySelector(".app.eco") ? 0 : 1);

function box(el) {
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { r, rad: Math.min(rad, r.width / 2, r.height / 2) };
}

// Рамка кнопки в координатах окна: сдвиг центра и растяжение.
function from(a, b) {
  const sx = Math.max(0.02, a.r.width / b.width), sy = Math.max(0.02, a.r.height / b.height);
  const dx = a.r.left + a.r.width / 2 - (b.left + b.width / 2);
  const dy = a.r.top + a.r.height / 2 - (b.top + b.height / 2);
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
    borderRadius: `${(a.rad / sx).toFixed(1)}px / ${(a.rad / sy).toFixed(1)}px`,
  };
}

const OPEN_MS = 820, CLOSE_MS = 600;

// Открыть el из anchor. wrap — затемнение под модальным окном: проявляется.
export function morphIn(el, anchor, { wrap } = {}) {
  if (!el || !el.animate || quiet()) return false;
  const a = box(anchor);
  const b = el.getBoundingClientRect();
  if (!a || !b.width || !b.height) return false;
  const rad = getComputedStyle(el).borderRadius || "0px";
  const f = from(a, b);
  el.classList.add("mo-pop");
  el.animate([
    { transformOrigin: "50% 50%", transform: f.transform, borderRadius: f.borderRadius, opacity: 0.5 },
    { transformOrigin: "50% 50%", transform: "none", borderRadius: rad, opacity: 1 },
  ], { duration: OPEN_MS, easing: "cubic-bezier(.3,1.22,.42,1)" });
  const k = mb();
  for (const c of el.children) {
    c.animate([
      { opacity: 0, filter: `blur(${10 * k}px)`, transform: "translateY(10px) scale(.97)" },
      { opacity: 0, filter: `blur(${10 * k}px)`, transform: "translateY(10px) scale(.97)", offset: 0.25 },
      { opacity: 1, filter: "blur(0px)", transform: "none" },
    ], { duration: OPEN_MS + 120, easing: "cubic-bezier(.22,1.1,.3,1)" });
  }
  if (wrap) wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS * 0.6, easing: "ease-out" });
  return true;
}

// Закрыть: копия el уезжает в anchor. wrap — копировать вместе с затемнением
// (модальное окно), sel — где внутри копии само окно.
export function morphOut(el, anchor, { wrap, sel } = {}) {
  if (!el || quiet()) return;
  const host = wrap || el;
  if (!host.isConnected || !host.animate) return;
  const hb = host.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  if (!hb.width || !b.width) return;
  const scroll = el.scrollTop;
  const ghost = host.cloneNode(true);
  ghost.classList.add("morph-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.removeAttribute("id");
  Object.assign(ghost.style, {
    position: "fixed", left: `${hb.left}px`, top: `${hb.top}px`, width: `${hb.width}px`, height: `${hb.height}px`,
    right: "auto", bottom: "auto", margin: "0", pointerEvents: "none", zIndex: "400", boxSizing: "border-box",
  });
  (document.querySelector(".app") || document.body).appendChild(ghost);
  const g = wrap ? (sel && ghost.querySelector(sel)) || ghost : ghost;
  if (scroll) g.scrollTop = scroll;
  const a = box(anchor);
  const rad = getComputedStyle(el).borderRadius || "0px";
  const end = a ? from(a, b) : { transform: "translateY(10px) scale(.92)", borderRadius: rad };
  const anim = g.animate([
    { transformOrigin: "50% 50%", transform: "none", borderRadius: rad, opacity: 1 },
    { transformOrigin: "50% 50%", transform: end.transform, borderRadius: end.borderRadius, opacity: a ? 0.35 : 0 },
  ], { duration: CLOSE_MS, easing: "cubic-bezier(.5,0,.25,1)", fill: "forwards" });
  const k = mb();
  for (const c of g.children) {
    c.animate([
      { opacity: 1, filter: "blur(0px)" },
      { opacity: 0, filter: `blur(${8 * k}px)`, offset: 0.45 },
      { opacity: 0, filter: `blur(${8 * k}px)` },
    ], { duration: CLOSE_MS, fill: "forwards" });
  }
  if (wrap) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" });
  anim.onfinish = () => ghost.remove();
  anim.oncancel = () => ghost.remove();
  // Страховка: вкладка ушла в фон, анимации стоят — копия не должна остаться.
  setTimeout(() => ghost.remove(), CLOSE_MS + 400);
}

// Хук для окна: открыть из кнопки при появлении, уйти в неё при удалении.
// anchor — ref на кнопку; без него берётся то, что нажали последним.
export function useMorph(ref, { anchor, wrapRef, sel } = {}) {
  const anc = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    anc.current = anchor?.current || pressedAnchor();
    morphIn(el, anc.current, { wrap: wrapRef?.current });
    const wrap = wrapRef?.current;
    return () => morphOut(el, anc.current, { wrap, sel });
    // Один раз на жизнь окна: открылось — закрылось.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Стили: окно, которое открывается из кнопки, не играет свою прежнюю
// CSS-анимацию появления — у него теперь эта. Копия при закрытии не
// анимируется ничем, кроме своей.
export const MORPH_CSS = `
.mo-pop, .morph-ghost, .morph-ghost * { animation: none !important }
.morph-ghost { transition: none !important }
`;
