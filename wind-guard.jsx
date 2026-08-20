import { Component, Suspense, lazy, useState, useMemo } from "react";
import { LINE, TEXT, DIM, MONO } from "./ui-kit.js";

// ============================================================
// СТРАХОВКА
// ============================================================
// Появилась после чёрного экрана: одна ошибка где угодно в дереве — и React
// снимает с экрана всё приложение целиком, оставляя пустой фон. Без границы
// ошибок такое поведение у него по умолчанию, и выглядит оно как «сайт умер».
//
// Границ теперь две, и они делят ответственность:
//   вокруг всего приложения — последний рубеж, чтобы вместо пустоты остался
//       хотя бы понятный текст и кнопка;
//   вокруг каждой отложенной части — чтобы не догрузившаяся вкладка уносила
//       только себя, а показания станции продолжали идти.
//
// Границу ошибок нельзя написать на хуках: React отдаёт сбой только классовым
// компонентам. Отсюда class — это не стиль, а единственный доступный способ.
class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err) {
    // В консоль — намеренно: на плате логов нет, и единственный способ узнать,
    // что именно упало, это открыть консоль браузера.
    console.error("Дашборд: сбой в поддереве", err);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return this.props.fallback(this.state.err, () => this.setState({ err: null }));
  }
}

const box = {
  border: `1px solid ${LINE}`,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "flex-start",
};

const btn = {
  ...MONO,
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: TEXT,
  background: "transparent",
  border: `1px solid ${LINE}`,
  padding: "7px 14px",
  cursor: "pointer",
};

// ------------------------------------------------------------
// Последний рубеж
// ------------------------------------------------------------
export function AppGuard({ children }) {
  return (
    <Boundary
      fallback={(err) => (
        <div style={{ ...box, margin: "40px auto", maxWidth: 560, color: TEXT }}>
          <div style={{ ...MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Дашборд остановился
          </div>
          <div style={{ color: DIM, fontSize: 12, lineHeight: 1.6 }}>
            Что-то сломалось внутри страницы. Показания станции при этом идут
            дальше — не работает только эта вкладка браузера.
          </div>
          {/* Текст ошибки виден на месте: без него единственный способ понять
              причину — открыть консоль, а на телефоне это почти никто не делает. */}
          <div style={{ ...MONO, fontSize: 11, color: DIM, wordBreak: "break-word" }}>
            {String(err?.message || err)}
          </div>
          <button style={btn} onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}

// ------------------------------------------------------------
// Отложенная часть
// ------------------------------------------------------------
// Импорт повторяется: канал до платы рвётся, и один потерянный запрос не повод
// объявлять вкладку сломанной. Пауза удваивается, чтобы не долбить умирающую
// связь очередями подряд.
function retrying(load, tries = 3, wait = 500) {
  return () =>
    new Promise((resolve, reject) => {
      const attempt = (left, pause) => {
        load().then(resolve, (err) => {
          if (left <= 0) { reject(err); return; }
          setTimeout(() => attempt(left - 1, pause * 2), pause);
        });
      };
      attempt(tries, wait);
    });
}

// Обёртка вокруг lazy, а не просто lazy: провалившийся импорт React запоминает
// навсегда. Тот же компонент после ошибки уже не попробует загрузиться снова,
// сколько его ни перерисовывай, — поэтому по кнопке «повторить» создаётся
// новый, а старый выбрасывается вместе со своей памятью о неудаче.
export function chunk(load) {
  const Chunk = function Chunk(props) {
    const [attempt, setAttempt] = useState(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const Part = useMemo(() => lazy(retrying(load)), [attempt]);

    return (
      <Boundary
        key={attempt}
        fallback={() => (
          <div style={{ ...box, color: TEXT }}>
            <div style={{ color: DIM, fontSize: 12, lineHeight: 1.6 }}>
              Раздел не догрузился — связь со станцией оборвалась на полпути.
            </div>
            <button style={btn} onClick={() => setAttempt((n) => n + 1)}>
              Повторить
            </button>
          </div>
        )}
      >
        <Suspense
          fallback={
            // Текст, а не крутящийся кружок: кружок одинаков и на полсекунды,
            // и на полминуты, а здесь важно понимать, что идёт загрузка.
            <div style={{ ...MONO, color: DIM, fontSize: 11, letterSpacing: 1.5,
                          padding: "28px 4px", textTransform: "uppercase" }}>
              Загрузка раздела…
            </div>
          }
        >
          <Part {...props} />
        </Suspense>
      </Boundary>
    );
  };

  // Тихая подгрузка впрок. Браузер помнит уже загруженные модули, поэтому
  // импорт из lazy потом отдаётся мгновенно и переключение вкладки перестаёт
  // зависеть от того, жив ли канал именно в эту секунду. Отказ проглатывается
  // намеренно: это опережающая загрузка, её провал ничего не ломает — вкладка
  // просто попробует ещё раз, когда её откроют.
  Chunk.preload = () => { load().catch(() => {}); };

  return Chunk;
}

// Порядок важен: первым идёт то, что откроют вероятнее всего. На узком канале
// части приезжают по очереди, и очередь стоит выстроить по спросу.
export function warmUp(parts, delayMs = 4000) {
  const id = setTimeout(() => parts.forEach((p) => p.preload?.()), delayMs);
  return () => clearTimeout(id);
}
