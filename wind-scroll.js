// Полоса прокрутки из жидкого стекла и плавная прокрутка колесом.
//
// Родную полосу Windows (серую, плоскую) стилем не исправить: ::-webkit-scrollbar
// не умеет ни backdrop-filter, ни движения. Поэтому родная прячется, а вместо неё
// стоит своя капля стекла: иней и насыщенность фона под ней, фаска, верхний
// блик и бегущий отсвет — тот же материал, что у дока.
//
// «Плывучесть» — пружина, а не линейный сдвиг:
//   • колесо задаёт цель, страница доплывает до неё с затуханием (lerp на кадр),
//     поэтому прокрутка не дёргается ступенями по 100 пикселей;
//   • капля догоняет своё место пружиной и тянется по скорости: при быстром
//     ходе вытягивается вдоль и худеет поперёк, на остановке — пружинит назад;
//   • в покое полоса гаснет до намёка и проявляется, стоит тронуть страницу.
//
// Только мышь (pointer: fine): на сенсорных экранах у системы своя полоса
// поверх содержимого и своя инерция пальца, и спорить с ней незачем.
//
// Колесо не перехватывается там, где у элемента своя прокрутка или своя
// реакция на колесо (карта зовёт preventDefault, окна и док прокручиваются
// сами), и при Ctrl — это масштаб страницы.
export const GLASS_SCROLL_CSS = `
html.gs-on { scrollbar-width: none }
html.gs-on::-webkit-scrollbar { display: none }
.gs-track { position: fixed; top: 84px; bottom: 96px; right: 5px; width: 18px; z-index: 95;
  opacity: .28; transition: opacity .68s ease; pointer-events: auto; touch-action: none }
.gs-track.gs-show, .gs-track:hover, .gs-track.gs-drag { opacity: 1 }
.gs-track.gs-none { display: none }
.gs-thumb { position: absolute; left: 4px; right: 4px; top: 0; border-radius: 999px; cursor: grab;
  will-change: transform; transform-origin: 50% 50%;
  background:
    linear-gradient(180deg, rgba(255,255,255,.42), rgba(255,255,255,.10) 38%, rgba(255,255,255,.06) 70%, rgba(255,255,255,.20)),
    linear-gradient(90deg, rgba(120,170,255,.22), rgba(190,120,255,.16));
  border: 1px solid rgba(255,255,255,.38);
  box-shadow: inset 0 1px 1px rgba(255,255,255,.75), inset 0 -1px 2px rgba(255,255,255,.18),
    inset 1px 0 0 rgba(255,255,255,.22), 0 4px 14px rgba(0,0,0,.35), 0 0 12px rgba(140,180,255,.25);
  backdrop-filter: blur(10px) saturate(1.8) brightness(1.15);
  -webkit-backdrop-filter: blur(10px) saturate(1.8) brightness(1.15);
  transition: left .47s cubic-bezier(.3,1.5,.5,1), right .47s cubic-bezier(.3,1.5,.5,1), box-shadow .41s ease;
  overflow: hidden }
.gs-track:hover .gs-thumb, .gs-track.gs-drag .gs-thumb { left: 2px; right: 2px;
  box-shadow: inset 0 1px 1px rgba(255,255,255,.85), inset 0 -1px 2px rgba(255,255,255,.22),
    0 6px 20px rgba(0,0,0,.4), 0 0 18px rgba(150,190,255,.45) }
.gs-track.gs-drag .gs-thumb { cursor: grabbing }
/* бегущий отсвет внутри капли */
.gs-thumb::after { content: ""; position: absolute; left: -40%; right: -40%; height: 46px; top: -60px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.55), transparent);
  transform: skewY(-24deg); animation: gsSheen 5.52s cubic-bezier(.45,0,.2,1) infinite; opacity: .7 }
/* верхний блик — капля читается выпуклой */
.gs-thumb::before { content: ""; position: absolute; left: 2px; right: 2px; top: 2px; height: 34%;
  border-radius: 999px; background: linear-gradient(180deg, rgba(255,255,255,.6), rgba(255,255,255,0)) }
@keyframes gsSheen { 0% { top: -60px } 55%, 100% { top: calc(100% + 60px) } }
@media (prefers-reduced-motion: reduce) { .gs-thumb::after { animation: none; display: none } }
`;

function scrollableParent(el, dy) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (!(n instanceof Element)) continue;
    const st = getComputedStyle(n);
    if (!/(auto|scroll|overlay)/.test(st.overflowY)) continue;
    if (n.scrollHeight <= n.clientHeight + 1) continue;
    // свой край уже достигнут — колесо отдаётся странице, как у браузера
    if (dy > 0 && n.scrollTop + n.clientHeight >= n.scrollHeight - 1) continue;
    if (dy < 0 && n.scrollTop <= 0) continue;
    return n;
  }
  return null;
}

export function mountGlassScroll() {
  if (typeof window === "undefined" || !window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  root.classList.add("gs-on");
  const track = document.createElement("div");
  track.className = "gs-track";
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div");
  thumb.className = "gs-thumb";
  track.appendChild(thumb);
  document.body.appendChild(track);

  let target = window.scrollY, animating = false, raf = 0;
  let pos = 0, vel = 0, lastY = window.scrollY, stretch = 0, hideT = 0, drag = null;
  const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

  const geom = () => {
    const th = track.clientHeight || 1;
    const max = maxScroll();
    const ratio = window.innerHeight / Math.max(1, root.scrollHeight);
    const h = Math.max(36, Math.min(th, th * ratio));
    return { th, h, max, room: th - h };
  };

  const show = () => {
    track.classList.add("gs-show");
    clearTimeout(hideT);
    hideT = setTimeout(() => track.classList.remove("gs-show"), 1300);
  };

  const frame = () => {
    raf = 0;
    const { h, max, room } = geom();
    track.classList.toggle("gs-none", max < 4);
    // 1) страница плывёт к цели
    if (animating) {
      const y = window.scrollY, d = target - y;
      if (Math.abs(d) < 0.6) { window.scrollTo(0, target); animating = false; }
      else window.scrollTo(0, y + d * (reduce ? 1 : 0.16));
    }
    // 2) капля догоняет своё место пружиной и тянется по скорости
    const want = max > 0 ? (window.scrollY / max) * room : 0;
    const k = 0.22, damp = 0.68;
    vel = (vel + (want - pos) * k) * damp;
    pos += vel;
    const dy = window.scrollY - lastY;
    lastY = window.scrollY;
    stretch += (Math.min(0.45, Math.abs(dy) / 260) - stretch) * 0.18;
    const sy = 1 + stretch, sx = 1 - stretch * 0.45;
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translate3d(0, ${pos.toFixed(2)}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    if (animating || Math.abs(want - pos) > 0.3 || Math.abs(vel) > 0.05 || stretch > 0.004) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const onWheel = (e) => {
    if (e.defaultPrevented || e.ctrlKey || drag) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (!dy || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (scrollableParent(e.target, dy)) return;
    e.preventDefault();
    if (!animating) target = window.scrollY;
    target = Math.max(0, Math.min(maxScroll(), target + dy));
    animating = true;
    show(); kick();
  };
  // Чужая прокрутка (клавиши, якоря, scrollTo из кода) — цель отпускаем.
  const onScroll = () => { if (!animating) target = window.scrollY; show(); kick(); };
  const onResize = () => kick();

  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { room, max, h } = geom();
    const r = track.getBoundingClientRect();
    const onThumb = e.target === thumb;
    // нажатие мимо капли — капля приезжает под курсор (тоже плавно)
    if (!onThumb && room > 0) {
      target = Math.max(0, Math.min(max, ((e.clientY - r.top - h / 2) / room) * max));
      animating = true; kick();
    }
    drag = { y: e.clientY, start: onThumb ? window.scrollY : target, room, max };
    track.classList.add("gs-drag");
    track.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag || drag.room <= 0) return;
    target = Math.max(0, Math.min(drag.max, drag.start + ((e.clientY - drag.y) / drag.room) * drag.max));
    animating = true; show(); kick();
  };
  const onUp = () => { drag = null; track.classList.remove("gs-drag"); };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  track.addEventListener("pointerdown", onDown);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerup", onUp);
  track.addEventListener("pointercancel", onUp);
  // высота страницы меняется сама (вкладки, раскрытые панели) — следим
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(kick) : null;
  if (ro) ro.observe(document.body);
  kick();

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (ro) ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(hideT);
    track.remove();
    root.classList.remove("gs-on");
  };
}
