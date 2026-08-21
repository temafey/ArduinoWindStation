import { useState } from "react";
import { DIM, SANS, glow } from "./ui-kit.js";

// ============================================================
// ТУМБЛЕР
// ============================================================
// Выбор из двух — это не две кнопки, а одно положение. Пока настройки с двумя
// вариантами рисовались парой кнопок, состояние приходилось вычитывать из
// подсветки: какая из двух ярче. У тумблера состояние читается по позиции, и
// вычитывать нечего — таких настроек в дашборде набралось девять.
//
// Подписи остаются с обеих сторон и остаются нажимаемыми. Голый тумблер годится
// для «да/нет», но здесь половина пар — это «SSE / только опрос» и «своя сеть /
// домашняя сеть», где без слов непонятно, что означает крайнее положение.

// ------------------------------------------------------------
// Стили
// ------------------------------------------------------------
// Отдаются строкой и вклеиваются в общий <style> дашборда — там же, где живёт
// вся остальная анимация. Отдельного CSS-файла у проекта нет намеренно: бандл
// собирается в один JS, а половина оформления в файле, который нечем
// перегенерировать без npm, уже один раз выходила боком.
export const SWITCH_CSS = `
  .sw { display: inline-flex; align-items: center; background: none;
        border: 0; padding: 2px; cursor: pointer; flex-shrink: 0 }
  .sw-track {
    position: relative; display: block; box-sizing: border-box;
    width: var(--sw-w, 46px); height: var(--sw-h, 24px); border-radius: 999px;
    border: 1px solid var(--pnl-line, rgba(160,180,200,0.30));
    background: rgba(255,255,255,0.045);
    transition: border-color .5s var(--ease-out), background-color .5s var(--ease-out);
  }
  /* Заливка растёт из-под шарика, а не проявляется целиком: так видно, в какую
     сторону переключили, — и это ровно то, чего не умеет пара кнопок. */
  .sw-track::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: var(--sw-accent, #67e8f9); opacity: 0;
    transform: scale(.25); transform-origin: 18% 50%;
    transition: transform .55s var(--ease-back), opacity .45s var(--ease-out);
  }
  .sw.on .sw-track::before { opacity: .26; transform: scale(1) }
  .sw.on .sw-track { border-color: var(--sw-accent, #67e8f9) }
  .sw-knob {
    position: absolute; top: 50%; left: 2px;
    width: var(--sw-k, 18px); height: var(--sw-k, 18px);
    margin-top: calc(var(--sw-k, 18px) / -2);
    border-radius: 999px; background: rgba(231,238,246,0.60);
    box-shadow: 0 1px 5px rgba(0,0,0,0.55);
    transition: transform .55s var(--ease-back), width .3s var(--ease-out),
                background-color .45s var(--ease-out);
  }
  .sw.on .sw-knob {
    background: #e7eef6;
    transform: translateX(calc(var(--sw-w, 46px) - var(--sw-k, 18px) - 4px));
  }
  /* Под пальцем шарик растягивается и отпускает обратно — так ведёт себя
     настоящий тумблер, и без этого нажатие ощущается как промах. */
  .sw:active .sw-knob { width: calc(var(--sw-k, 18px) + 5px) }
  /* Кольцо расходится в момент переключения. Живёт ровно один проигрыш: узел
     появляется по счётчику нажатий, новый ключ перезапускает анимацию. */
  @keyframes swRing { from { opacity: .5; transform: scale(1) }
                      to   { opacity: 0;  transform: scale(1.85) } }
  .sw-ring { position: absolute; inset: -1px; border-radius: 999px; pointer-events: none;
             border: 1px solid var(--sw-accent, #67e8f9);
             animation: swRing .75s var(--ease-out) forwards }
  .sw-mini { --sw-w: 32px; --sw-h: 17px; --sw-k: 12px }
  .sw-side { font-family: ${SANS}; font-size: 10.5px; letter-spacing: .6px;
             cursor: pointer; user-select: none; white-space: nowrap;
             transition: color .45s var(--ease-out), transform .45s var(--ease-back) }
  .sw-side.lit { color: #e7eef6; transform: translateY(-1px) }
  .sw-side:not(.lit) { color: rgba(231,238,246,0.30); transform: translateY(1px) }
  .mo-off .sw-track, .mo-off .sw-track::before,
  .mo-off .sw-knob, .mo-off .sw-side { transition: none }
  .mo-off .sw-ring { display: none }
  .mo-calm .sw-knob, .mo-calm .sw-track::before { transition-duration: .26s }
`;

function Track({ ring }) {
  return (
    <span className="sw-track">
      <i className="sw-knob" />
      {ring > 0 && <i className="sw-ring" key={ring} />}
    </span>
  );
}

// ------------------------------------------------------------
// Настроечный тумблер
// ------------------------------------------------------------
// on/off — не булевы, а описания двух положений: {value, label}. Половина
// настроек хранит не true/false, а строки («обычная»/«плотная», «ap»/«lan»),
// и приводить их к булевым значило бы держать перевод в каждом месте вызова.
export function Switch({ label, value, on, off, onChange, g, hint, accent }) {
  const [ring, setRing] = useState(0);
  const isOn = value === on.value;
  const go = (v) => {
    if (v === value) return;
    setRing((n) => n + 1);
    onChange(v);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 14, flexWrap: "wrap" }}>
        <div style={{ color: DIM, fontSize: 9, letterSpacing: 2.4, textTransform: "uppercase",
                      textShadow: glow(g, 0.35), fontFamily: SANS, fontWeight: 500 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className={`sw-side${isOn ? "" : " lit"}`} onClick={() => go(off.value)}>
            {off.label}
          </span>
          <button
            type="button" role="switch" aria-checked={isOn} aria-label={label}
            className={`sw${isOn ? " on" : ""}`}
            style={{ "--sw-accent": accent || "#67e8f9" }}
            onClick={() => go(isOn ? off.value : on.value)}
          >
            <Track ring={ring} />
          </button>
          <span className={`sw-side${isOn ? " lit" : ""}`} onClick={() => go(on.value)}>
            {on.label}
          </span>
        </div>
      </div>
      {hint && (
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 7, fontFamily: SANS, lineHeight: 1.6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Тумблер внутри чужой кнопки
// ------------------------------------------------------------
// Без обработчиков и без роли: там, где переключателем работает вся кнопка
// целиком (слой карты, режим светодиодов), вложить в неё вторую кнопку нельзя —
// это недопустимая разметка, и клик всё равно ловил бы внешний элемент.
// Поэтому здесь только вид, а состояние и роль объявляет хозяин.
export function SwitchGlyph({ on, accent }) {
  return (
    <span className={`sw sw-mini${on ? " on" : ""}`} aria-hidden="true"
          style={{ "--sw-accent": accent || "#67e8f9", pointerEvents: "none" }}>
      <Track ring={0} />
    </span>
  );
}
