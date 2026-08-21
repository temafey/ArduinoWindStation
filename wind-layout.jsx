import { useState, useRef, useEffect, useCallback } from "react";
import { LINE, LINE_HI, TEXT, DIM, FAINT, MONO } from "./ui-kit.js";

// ============================================================
// РАСКЛАДКА ГЛАВНОЙ ВКЛАДКИ
// ============================================================
// Место и размер блока перестали быть свойством разметки и стали данными.
// Разметка объявляет, какие блоки бывают; всё остальное решает эта таблица
// и человек.
//
//   [{ id: "speed", w: 6, h: 42, hidden: false }, ...]
//
// w — ширина в дорожках сетки из двенадцати. Двенадцать, а не десять и не
// шестнадцать, по одной причине: это число делится на 2, 3, 4 и 6, поэтому
// половина, треть и четверть выражаются целыми дорожками без остатка.
//
// h — высота в строках по ROW пикселей. Высота задаётся явно, а не берётся от
// содержимого: пока её определяло содержимое, «сделать блок квадратным» было
// невозможно в принципе — никакой размер не был свойством блока.
//
// Промежутки сделаны отступом внутри ячейки, а не gap сетки. Это не мелочь:
// при gap высота блока в N строк равнялась бы N*ROW плюс (N-1)*gap, и заданные
// пиксели переставали бы совпадать с настоящими.
export const TRACKS = 12;
export const ROW = 10;
export const GAP = 14;

export const W_MIN = 2;
export const H_MIN = 10;
export const H_MAX = 120;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

// Правило слияния несимметричное, и это намеренно. Неизвестный раскладке блок
// (появился в новой прошивке) добавляется видимым — иначе новая панель
// выглядела бы пропажей. А блок из раскладки, которого сейчас нет (выключен,
// нет датчика), пропускается, но из списка НЕ удаляется: датчик вернётся вместе
// со своим местом, а не в хвост.
export function mergeLayout(saved, blocks) {
  const have = new Map(blocks.map((b) => [b.id, b]));
  const out = [];
  const seen = new Set();

  for (const row of saved || []) {
    const b = have.get(row.id);
    if (!b) continue;
    seen.add(row.id);
    out.push(normalize(row, b));
  }
  for (const b of blocks) {
    if (seen.has(b.id)) continue;
    out.push(normalize(null, b));
  }
  return out;
}

// Старые раскладки хранили колонку и масштаб, а не ширину с высотой. Читаем и
// такие: масштаб превращается в высоту, колонка забывается. Иначе переход на
// свободный размер стёр бы всё, что человек уже расставил.
function normalize(row, block) {
  const w = clamp(row?.w ?? Math.round(TRACKS / 2), W_MIN, TRACKS);
  const base = block.h ?? 26;
  const h = clamp(row?.h ?? Math.round(base * (row?.scale || 1)), H_MIN, H_MAX);
  return { id: block.id, w, h, hidden: !!row?.hidden, block };
}

// Сохраняем без поля block: это живой узел разметки, в localStorage ему не
// место. Строки, которых сейчас нет на экране, возвращаются как были.
export function packLayout(rows, saved) {
  const now = rows.map(({ id, w, h, hidden }) => ({ id, w, h, hidden: !!hidden }));
  const live = new Set(now.map((r) => r.id));
  return [...now, ...(saved || []).filter((r) => !live.has(r.id))];
}

function move(rows, id, dir) {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Перенос: вынуть и вставить перед целью. При обмене местами блок другого
// размера прыгал бы мимо пальца, а вставка ведёт себя предсказуемо.
function insertBefore(rows, id, targetId) {
  if (id === targetId) return rows;
  const from = rows.findIndex((r) => r.id === id);
  if (from < 0 || !rows.some((r) => r.id === targetId)) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(next.findIndex((r) => r.id === targetId), 0, moved);
  return next;
}

export function layoutOps(rows, apply) {
  const patch = (id, fn) => apply(rows.map((r) => (r.id === id ? { ...r, ...fn(r) } : r)));
  return {
    up: (id) => apply(move(rows, id, -1)),
    down: (id) => apply(move(rows, id, +1)),
    toggle: (id) => patch(id, (r) => ({ hidden: !r.hidden })),
    wider: (id, d) => patch(id, (r) => ({ w: clamp(r.w + d, W_MIN, TRACKS) })),
    taller: (id, d) => patch(id, (r) => ({ h: clamp(r.h + d, H_MIN, H_MAX) })),
    setSize: (id, w, h) => patch(id, () => ({ w: clamp(w, W_MIN, TRACKS), h: clamp(h, H_MIN, H_MAX) })),
    dropOn: (id, targetId) => apply(insertBefore(rows, id, targetId)),
  };
}

// ------------------------------------------------------------
// Сколько дорожек помещается
// ------------------------------------------------------------
// Ширина хранится в дорожках из двенадцати всегда, а вот сколько их рисовать —
// зависит от экрана. На телефоне дорожка одна: треть экрана шириной в сто
// пикселей не показывает ничего, и любая доля там — обман.
export function tracksFor(width) {
  if (width < 700) return 1;
  if (width < 1100) return 6;
  return TRACKS;
}

// Ширина блока в дорожках текущей сетки. При одной дорожке всё занимает её
// целиком; при шести доля сохраняется, но не мельче половины — иначе на
// планшете четверть превращалась бы в столбик шириной с палец.
export function spanFor(w, tracks) {
  if (tracks <= 1) return 1;
  if (tracks === TRACKS) return clamp(w, W_MIN, TRACKS);
  const part = Math.round((w / TRACKS) * tracks);
  return clamp(Math.max(part, Math.round(tracks / 2)), 1, tracks);
}

export function useViewport() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return w;
}

// ------------------------------------------------------------
// Перетаскивание и растягивание
// ------------------------------------------------------------
// На указателях, а не на HTML5 drag-and-drop: последний на сенсорных экранах не
// работает вовсе, а дашборд открывают с телефона чаще, чем с компьютера.
export function useDrag(ops) {
  const [dragging, setDragging] = useState(null);
  const over = useRef(null);

  const start = useCallback((id, e) => {
    e.preventDefault();
    setDragging(id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  // Цель ищется через elementFromPoint: палец уходит далеко за пределы своего
  // блока, и обработчик на самом блоке об этом никогда не узнает.
  const moveTo = useCallback((e) => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    over.current = el?.closest?.("[data-block]")?.getAttribute("data-block") ?? over.current;
  }, [dragging]);

  const end = useCallback(() => {
    if (dragging && over.current) ops.dropOn(dragging, over.current);
    over.current = null;
    setDragging(null);
  }, [dragging, ops]);

  return { dragging, start, move: moveTo, end };
}

// Растягивание. Ширина считается от настоящей ширины дорожки, а не от догадки:
// сетка сжимается вместе с окном, и любое зашитое число разошлось бы с ней при
// первом же изменении размера.
export function useResize(ops, gridRef, tracks) {
  const [live, setLive] = useState(null);
  const from = useRef(null);

  const start = useCallback((row, axis, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const box = gridRef.current?.getBoundingClientRect();
    from.current = {
      id: row.id, axis, x: e.clientX, y: e.clientY, w: row.w, h: row.h,
      track: box ? box.width / Math.max(1, tracks) : 100,
    };
    setLive({ id: row.id, w: row.w, h: row.h });
  }, [gridRef, tracks]);

  const move = useCallback((e) => {
    const f = from.current;
    if (!f) return;
    // Дорожек хранится двенадцать, а нарисовано может быть шесть или одна: шаг
    // мыши пересчитывается в хранимые доли, иначе на планшете блок ехал бы вдвое.
    const perTrack = f.track * (Math.max(1, tracks) / TRACKS);
    const w = f.axis === "y" ? f.w : clamp(f.w + Math.round((e.clientX - f.x) / perTrack), W_MIN, TRACKS);
    const h = f.axis === "x" ? f.h : clamp(f.h + Math.round((e.clientY - f.y) / ROW), H_MIN, H_MAX);
    setLive({ id: f.id, w, h });
  }, [tracks]);

  const end = useCallback(() => {
    const f = from.current;
    if (f && live) ops.setSize(f.id, live.w, live.h);
    from.current = null;
    setLive(null);
  }, [live, ops]);

  return { live, start, move, end };
}

// ------------------------------------------------------------
// Оболочка блока в режиме правки
// ------------------------------------------------------------
const btn = {
  background: "transparent", border: `1px solid ${LINE}`, color: DIM,
  fontFamily: MONO, fontSize: 11, lineHeight: 1, padding: "3px 6px",
  cursor: "pointer", minWidth: 24,
};

// Ручки лежат ВНУТРИ рамки, а не по её краю снаружи. Снаружи они попадали в
// соседнюю ячейку сетки, и указатель ловила кнопка соседнего блока — тянуть за
// край не получалось вовсе. Слой поднят выше содержимого по той же причине.
const grip = {
  position: "absolute", touchAction: "none", zIndex: 6,
  background: "rgba(231,238,246,0.10)",
};

export function BlockFrame({ row, ops, drag, resize, children }) {
  const held = drag.dragging === row.id;
  const sizing = resize.live?.id === row.id;
  const w = sizing ? resize.live.w : row.w;
  const h = sizing ? resize.live.h : row.h;

  return (
    <div
      data-block={row.id}
      onPointerMove={drag.move}
      style={{
        position: "relative", height: "100%", boxSizing: "border-box",
        border: `1px dashed ${held || sizing ? TEXT : LINE_HI}`,
        padding: 5,
        opacity: held ? 0.4 : row.hidden ? 0.35 : 1,
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
        <div
          onPointerDown={(e) => drag.start(row.id, e)}
          onPointerUp={drag.end}
          onPointerCancel={drag.end}
          title="Тащить, чтобы переставить"
          style={{ ...btn, cursor: "grab", touchAction: "none", userSelect: "none", color: TEXT }}
        >⠿</div>
        <div style={{
          flex: 1, minWidth: 40, color: row.hidden ? FAINT : TEXT, fontFamily: MONO,
          fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.block.title}{row.hidden ? " · скрыт" : ""}
        </div>
        <span style={{ ...btn, cursor: "default", color: FAINT, minWidth: 0, padding: "3px 5px" }}>
          {w}/{TRACKS} · {h * ROW}
        </span>
        <button style={btn} title="Уже" onClick={() => ops.wider(row.id, -1)}>◄</button>
        <button style={btn} title="Шире" onClick={() => ops.wider(row.id, +1)}>►</button>
        <button style={btn} title="Ниже" onClick={() => ops.taller(row.id, -4)}>▲</button>
        <button style={btn} title="Выше" onClick={() => ops.taller(row.id, +4)}>▼</button>
        <button style={btn} title="Раньше в порядке" onClick={() => ops.up(row.id)}>↰</button>
        <button style={btn} title="Позже в порядке" onClick={() => ops.down(row.id)}>↳</button>
        <button style={btn} title={row.hidden ? "Показать" : "Скрыть"}
                onClick={() => ops.toggle(row.id)}>{row.hidden ? "○" : "●"}</button>
      </div>

      {/* Содержимое в правке не нажимается: клик по кнопке внутри панели здесь
          означал бы «взял блок», а не «нажал кнопку». */}
      <div style={{ pointerEvents: "none", flex: 1, minHeight: 0 }}>{children}</div>

      {/* Ручки по краю и в углу. Три штуки, а не одна: тянуть только за угол
          значит всегда менять обе стороны разом, а чаще нужна одна. */}
      <div onPointerDown={(e) => resize.start(row, "x", e)} onPointerMove={resize.move}
           onPointerUp={resize.end} onPointerCancel={resize.end} title="Ширина"
           style={{ ...grip, top: 34, right: 0, bottom: 20, width: 9, cursor: "ew-resize" }} />
      <div onPointerDown={(e) => resize.start(row, "y", e)} onPointerMove={resize.move}
           onPointerUp={resize.end} onPointerCancel={resize.end} title="Высота"
           style={{ ...grip, left: 20, right: 20, bottom: 0, height: 9, cursor: "ns-resize" }} />
      {/* Угол объявлен последним: он перекрывает оба края, и тянуть за него
          должно менять обе стороны, а не ту, чья ручка оказалась сверху. */}
      <div onPointerDown={(e) => resize.start(row, "xy", e)} onPointerMove={resize.move}
           onPointerUp={resize.end} onPointerCancel={resize.end} title="Размер"
           style={{
             ...grip, right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize",
             background: "transparent",
             borderRight: `2px solid ${TEXT}`, borderBottom: `2px solid ${TEXT}`,
           }} />
    </div>
  );
}

// ------------------------------------------------------------
// Полоса управления
// ------------------------------------------------------------
export function LayoutBar({ onDone, onReset, accent }) {
  return (
    <div className="pnl" style={{
      border: "1px solid var(--pnl-line)", borderLeft: `2px solid ${accent}`,
      borderRadius: "var(--pnl-corner)", background: "var(--pnl-bg)",
      boxShadow: "var(--pnl-shadow)",
      padding: "11px 14px", marginBottom: 14, display: "flex",
      alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 240, fontSize: 11, lineHeight: 1.7, color: DIM }}>
        <span style={{ color: TEXT, fontFamily: MONO, letterSpacing: 2, marginRight: 8 }}>РАСКЛАДКА</span>
        Тащи за <span style={{ color: TEXT }}>⠿</span>, чтобы переставить. Тяни за правый
        край, нижний край или <span style={{ color: TEXT }}>угол</span> — размер меняется в обе
        стороны свободно. <span style={{ color: TEXT }}>●</span> — скрыть блок.
      </div>
      <button onClick={onReset} style={{ ...btn, padding: "6px 12px" }}>Сбросить</button>
      <button onClick={onDone} style={{ ...btn, padding: "6px 14px", color: TEXT, borderColor: accent }}>
        Готово
      </button>
    </div>
  );
}
