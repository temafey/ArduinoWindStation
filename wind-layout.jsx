import { useState, useRef, useCallback } from "react";
import { LINE, LINE_HI, TEXT, DIM, FAINT, MONO } from "./ui-kit.js";

// ============================================================
// РАСКЛАДКА ГЛАВНОЙ ВКЛАДКИ
// ============================================================
// Порядок блоков перестал быть свойством разметки и стал данными. Раньше место
// каждой панели задавалось тем, в каком месте JSX она написана; теперь разметка
// лишь объявляет, какие блоки вообще бывают, а где они лежат — решает эта
// таблица и человек.
//
// Хранится плоским списком, а не двумя списками по колонкам. Причина простая:
// блок переезжает из колонки в колонку чаще, чем меняет соседей, и при двух
// списках каждый такой переезд был бы удалением из одного и вставкой в другой —
// две операции там, где по смыслу одна смена поля.
//
//   [{ id: "speed", col: 0, hidden: false }, ...]
//
// Правило слияния несимметричное, и это намеренно. Неизвестный сохранённой
// раскладке блок (появился в новой прошивке) добавляется в конец первой
// колонки — он должен быть виден, иначе выглядел бы как пропажа. А блок из
// раскладки, которого сейчас нет (выключен в настройках, нет датчика), молча
// пропускается, но из списка НЕ удаляется: датчик вернётся, и вместе с ним
// вернётся его место, а не хвост колонки.
export function mergeLayout(saved, blocks) {
  const have = new Map(blocks.map((b) => [b.id, b]));
  const out = [];
  const seen = new Set();

  for (const row of saved || []) {
    if (!have.has(row.id)) continue;
    seen.add(row.id);
    out.push({ ...row, block: have.get(row.id) });
  }
  for (const b of blocks) {
    if (seen.has(b.id)) continue;
    // Колонку по умолчанию объявляет сам блок: направление и район осмысленны
    // справа от показаний, а не в хвосте левой колонки.
    out.push({ id: b.id, col: b.col ?? 0, hidden: false, block: b });
  }
  return out;
}

// Сохраняем без поля block: это живой узел разметки, в localStorage ему не место.
// Плюс сюда же возвращаются строки, которых сейчас нет на экране, — иначе
// выключенный на время датчик терял бы своё место навсегда.
export function packLayout(rows, saved) {
  const now = rows.map(({ id, col, hidden }) => ({ id, col, hidden: !!hidden }));
  const live = new Set(now.map((r) => r.id));
  const kept = (saved || []).filter((r) => !live.has(r.id));
  return [...now, ...kept];
}

// Перестановка внутри колонки. Работает по видимому соседу, а не по индексу в
// общем списке: между двумя блоками одной колонки могут лежать блоки другой,
// и шаг «на единицу» перепрыгивал бы через них наугад.
function shift(rows, id, dir) {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return rows;
  const col = rows[i].col;
  let j = -1;
  for (let k = i + dir; k >= 0 && k < rows.length; k += dir) {
    if (rows[k].col === col) { j = k; break; }
  }
  if (j < 0) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Перенос блока к другому: вынуть и вставить перед целью. Так работает
// перетаскивание — при обмене местами блок разной высоты «прыгал» бы мимо
// пальца, а вставка ведёт себя предсказуемо.
function insertBefore(rows, id, targetId) {
  if (id === targetId) return rows;
  const from = rows.findIndex((r) => r.id === id);
  const to = rows.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  const at = next.findIndex((r) => r.id === targetId);
  next.splice(at, 0, { ...moved, col: rows[to].col });
  return next;
}

export function layoutOps(rows, apply) {
  return {
    up: (id) => apply(shift(rows, id, -1)),
    down: (id) => apply(shift(rows, id, +1)),
    swapCol: (id) => apply(rows.map((r) => (r.id === id ? { ...r, col: r.col ? 0 : 1 } : r))),
    toggle: (id) => apply(rows.map((r) => (r.id === id ? { ...r, hidden: !r.hidden } : r))),
    dropOn: (id, targetId) => apply(insertBefore(rows, id, targetId)),
    toCol: (id, col) => apply(rows.map((r) => (r.id === id ? { ...r, col } : r))),
  };
}

// ------------------------------------------------------------
// Перетаскивание
// ------------------------------------------------------------
// На указателях, а не на HTML5 drag-and-drop: последний на сенсорных экранах
// не работает вовсе, а дашборд открывают с телефона чаще, чем с компьютера.
// Цель ищется через elementFromPoint — палец может уйти далеко за пределы
// исходного блока, и никакой обработчик на самом блоке об этом не узнает.
export function useDrag(ops) {
  const [dragging, setDragging] = useState(null);
  const over = useRef(null);

  const start = useCallback((id, e) => {
    e.preventDefault();
    setDragging(id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const move = useCallback((e) => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const box = el?.closest?.("[data-block]");
    over.current = box?.getAttribute("data-block") ?? null;
    // Колонка запоминается отдельно от блока: пустая колонка блоков не
    // содержит, и без этого перетащить туда первый было бы нечем.
    const colEl = el?.closest?.("[data-col]");
    if (colEl) over.current = over.current || `col:${colEl.getAttribute("data-col")}`;
  }, [dragging]);

  const end = useCallback(() => {
    const target = over.current;
    if (dragging && target) {
      if (target.startsWith("col:")) ops.toCol(dragging, Number(target.slice(4)));
      else ops.dropOn(dragging, target);
    }
    over.current = null;
    setDragging(null);
  }, [dragging, ops]);

  return { dragging, start, move, end };
}

// ------------------------------------------------------------
// Оболочка блока в режиме правки
// ------------------------------------------------------------
const btn = {
  background: "transparent", border: `1px solid ${LINE}`, color: DIM,
  fontFamily: MONO, fontSize: 11, lineHeight: 1, padding: "4px 7px",
  cursor: "pointer", minWidth: 26,
};

export function BlockFrame({ row, ops, drag, children }) {
  const held = drag.dragging === row.id;
  return (
    <div
      data-block={row.id}
      onPointerMove={drag.move}
      style={{
        border: `1px dashed ${held ? TEXT : LINE_HI}`,
        padding: 6,
        opacity: held ? 0.45 : row.hidden ? 0.35 : 1,
        // Курсор именно на ручке, а не на всём блоке: внутри живут кнопки и
        // ползунки, и «схватить» их в режиме правки было бы неожиданно.
        transition: "opacity .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
        <div
          onPointerDown={(e) => drag.start(row.id, e)}
          onPointerUp={drag.end}
          onPointerCancel={drag.end}
          title="Тащить"
          style={{
            ...btn, cursor: "grab", touchAction: "none", userSelect: "none",
            color: TEXT, padding: "4px 8px",
          }}
        >⠿</div>
        <div style={{
          flex: 1, minWidth: 60, color: row.hidden ? FAINT : TEXT, fontFamily: MONO,
          fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.block.title}{row.hidden ? " · скрыт" : ""}
        </div>
        <button style={btn} title="Выше" onClick={() => ops.up(row.id)}>↑</button>
        <button style={btn} title="Ниже" onClick={() => ops.down(row.id)}>↓</button>
        <button style={btn} title="В другую колонку" onClick={() => ops.swapCol(row.id)}>⇄</button>
        <button style={btn} title={row.hidden ? "Показать" : "Скрыть"}
                onClick={() => ops.toggle(row.id)}>{row.hidden ? "○" : "●"}</button>
      </div>
      {/* Содержимое в режиме правки не нажимается: клик по кнопке внутри
          панели здесь означал бы «взял блок», а не «нажал кнопку». */}
      <div style={{ pointerEvents: "none" }}>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------
// Полоса управления
// ------------------------------------------------------------
export function LayoutBar({ onDone, onReset, g, accent }) {
  return (
    <div className="pnl" style={{
      border: `1px solid ${LINE}`, borderLeft: `2px solid ${accent}`,
      padding: "11px 14px", marginBottom: 16, display: "flex",
      alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: 11, lineHeight: 1.7, color: DIM }}>
        <span style={{ color: TEXT, fontFamily: MONO, letterSpacing: 2, marginRight: 8 }}>
          РАСКЛАДКА
        </span>
        Тащи за <span style={{ color: TEXT }}>⠿</span> или двигай стрелками.
        <span style={{ color: TEXT }}> ⇄</span> — в другую колонку,
        <span style={{ color: TEXT }}> ●</span> — скрыть блок.
      </div>
      <button onClick={onReset} style={{ ...btn, padding: "6px 12px" }}>Сбросить</button>
      <button onClick={onDone} style={{
        ...btn, padding: "6px 14px", color: TEXT, borderColor: accent,
      }}>Готово</button>
    </div>
  );
}

// Пустая колонка в режиме правки должна существовать физически: иначе перенести
// в неё первый блок было бы некуда — цель перетаскивания ищется по элементам.
export function ColumnDrop({ col, g }) {
  return (
    <div style={{
      border: `1px dashed ${LINE}`, padding: "18px 10px", textAlign: "center",
      color: FAINT, fontFamily: MONO, fontSize: 10, letterSpacing: 1.4,
    }}>
      {col === 0 ? "ЛЕВАЯ КОЛОНКА" : "ПРАВАЯ КОЛОНКА"} · ПУСТО
    </div>
  );
}
