import { Component, Suspense, lazy, memo, useState, useMemo, useEffect, useRef } from "react";
import { LINE, TEXT, DIM, MONO } from "./ui-kit.js";
import { APP_VERSION } from "./wind-version.js";
import { Liquid } from "./wind-liquid.jsx";
import { hapticRamp, hapticStop } from "./wind-haptic.js";

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
  fontFamily: MONO,
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
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Дашборд остановился
          </div>
          <div style={{ color: DIM, fontSize: 12, lineHeight: 1.6 }}>
            Что-то сломалось внутри страницы. Показания станции при этом идут
            дальше — не работает только эта вкладка браузера.
          </div>
          {/* Текст ошибки виден на месте: без него единственный способ понять
              причину — открыть консоль, а на телефоне это почти никто не делает. */}
          <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, wordBreak: "break-word" }}>
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
            // Не кружок: кружок одинаков и на полсекунды, и на полминуты. Здесь
            // на месте будущего содержимого стоят его же очертания, по которым
            // бежит блик, — видно и что грузится, и куда это встанет.
            <div style={{ padding: "6px 0 2px" }}>
              <div className="wait-bar" style={{ color: TEXT, marginBottom: 16 }}><i /></div>
              <div style={{ fontFamily: MONO, color: DIM, fontSize: 10, letterSpacing: 1.6,
                            textTransform: "uppercase", marginBottom: 12 }}>
                Загрузка раздела…
              </div>
              {[64, 148, 96].map((h, i) => (
                <div key={i} className="shimmer" style={{
                  height: h, marginBottom: 10, border: `1px solid ${LINE}`,
                  animationDelay: `${i * 260}ms`,
                }} />
              ))}
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
  // memo: корень дашборда перерисовывается с каждым кадром потока (20 Гц), а
  // карта, эфир и метеорология от кадра не зависят вовсе — их пропсы меняются
  // только вместе с настройками. Без memo каждая из них пересобиралась бы
  // двадцать раз в секунду впустую.
  const Part = memo(Chunk);
  Part.preload = () => { load().catch(() => {}); };

  return Part;
}

// Порядок важен: первым идёт то, что откроют вероятнее всего. На узком канале
// части приезжают по очереди, и очередь стоит выстроить по спросу.
export function warmUp(parts, delayMs = 4000) {
  const id = setTimeout(() => parts.forEach((p) => p.preload?.()), delayMs);
  return () => clearTimeout(id);
}

// ============================================================
// ЗАПУСК
// ============================================================
// Экран первой загрузки. Нужен не для красоты: между тем, как браузер получил
// страницу, и тем, как дашборд нарисовал первые показания, проходит секунда с
// лишним — и всё это время человек смотрит на пустой фон, не понимая, работает
// оно вообще или нет. Полоса, которая заполняется, отвечает на этот вопрос
// раньше, чем появятся цифры.
//
// Живёт снаружи дашборда и о нём ничего не знает: узел рисуется поверх, а через
// заданное время убирается совсем. Оставлять его прозрачным нельзя — невидимый
// слой поверх страницы съедал бы нажатия.
const BOOT_MS = 3900;

// После обновления заставка другая: та же, но с полосой-ползунком, и идёт она
// дольше — тем дольше, чем тяжелее обновление (метку ставит wind-update.jsx перед
// установкой). Сама установка к этому моменту уже закончена; полоса показывает
// ход подготовки интерфейса и даёт увидеть, что именно поставилось.
const POST_KEY = "wk_post_update";
function readPostUpdate() {
  try {
    const j = JSON.parse(localStorage.getItem(POST_KEY) || "null");
    // Метка свежая: старая (оставшаяся от сорвавшейся установки) не в счёт.
    return j && Date.now() - j.t < 120000 ? j : null;
  } catch { return null; }
}
const STAGES = [
  [0.00, "Проверка файлов"], [0.22, "Применение обновления"],
  [0.62, "Подготовка интерфейса"], [0.90, "Запуск"],
];

export function Boot() {
  const [gone, setGone] = useState(() => {
    // Уважает ту же настройку, что и остальное движение. Кто выключил анимации,
    // тот не должен получить полторы секунды заставки при каждом заходе.
    try {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      return JSON.parse(localStorage.getItem("wind_ui_settings") || "{}").motion === "off";
    } catch { return false; }
  });
  // После обновления сначала идёт полоса установки, а когда она дошла до
  // конца — программа «запускается заново»: та же заставка, что при обычном
  // входе, со своим стуком. Поэтому up — состояние, и в конце полосы оно
  // сбрасывается, а не прячет заставку. Новый ключ корня (ниже) заставляет
  // заставку смонтироваться заново, с начала всех своих анимаций.
  const [up, setUp] = useState(readPostUpdate);
  // Обновление молчит целиком, вместе с «повторным запуском» после полосы: вибрация
  // — только у обычного входа.
  const afterUpdate = useRef(!!up);
  // 5 с на любое обновление плюс 10 мс на каждый килобайт: файл в 600 КБ — около
  // 11 с, а «тяжёлое» обновление в несколько мегабайт — до потолка в 25 с.
  const dur = up ? Math.min(25000, 5000 + ((up.size || 600000) / 1024) * 10 + (up.notes || 0) * 150) : BOOT_MS;
  const [p, setP] = useState(0);

  useEffect(() => { if (up) { try { localStorage.removeItem(POST_KEY); } catch { /* приватный режим */ } } }, [up]);

  useEffect(() => {
    if (gone) return undefined;
    if (!up) {
      // Обычный вход: одна длинная вибрация, которая нарастает вместе с загрузкой —
      // от самой слабой до заметной к моменту, когда заставка заканчивается.
      if (!afterUpdate.current) hapticRamp(dur);
      const id = setTimeout(() => setGone(true), dur);
      return () => { clearTimeout(id); hapticStop(); };
    }
    const t0 = Date.now();
    const id = setInterval(() => {
      const x = Math.min(1, (Date.now() - t0) / dur);
      setP(x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);   // плавный разгон и торможение
      if (x >= 1) clearInterval(id);
    }, 50);
    const end = setTimeout(() => { setP(0); setUp(null); }, dur + 450);
    return () => { clearInterval(id); clearTimeout(end); };
  }, [gone, up, dur]);

  if (gone) return null;

  const stage = STAGES.filter(([at]) => p >= at).pop()[1];
  return (
    <div key={up ? "up" : "fresh"} className={up ? "boot boot-up" : "boot"} style={up ? {
      animation: `bootIn .2s ease both, bootOut .5s ease-in ${(dur - 50) / 1000}s both`,
    } : undefined}>
      <div className="boot-mark">
        <svg viewBox="0 0 100 100" width="86" height="86">
          {/* Кольцо собирается из дуги: штрих-пунктир длиной в окружность,
              смещение которого и есть «сколько уже нарисовано». После
              обновления дуга идёт вровень с полосой. */}
          <circle cx="50" cy="50" r="34" fill="none" stroke={LINE} strokeWidth="1" />
          <circle className="boot-arc" cx="50" cy="50" r="34" fill="none"
                  stroke={TEXT} strokeWidth="2" strokeLinecap="butt"
                  strokeDasharray="214" strokeDashoffset={up ? 214 * (1 - p) : 214}
                  style={up ? { animation: "none" } : undefined}
                  transform="rotate(-90 50 50)" />
          <circle className="boot-dot" cx="50" cy="16" r="3" fill={TEXT} />
        </svg>
      </div>
      <div className="boot-name">WEATHERED_KIWI</div>
      {up ? (
        <>
          <div className="boot-slide"><Liquid fast busy v={p} color="linear-gradient(90deg, #7dd3fc, #a78bfa)" edge="#a78bfa" className="boot-liq" /><b style={{ left: `${p * 100}%` }} /></div>
          <div className="boot-pct">{Math.round(p * 100)}%</div>
          <div className="boot-stage">{stage}</div>
          <div className="boot-note">{up.from} → {up.to}</div>
        </>
      ) : (
        <>
          <div className="boot-bar"><i /></div>
          <div className="boot-note">Ветроизмерительная станция · {APP_VERSION}</div>
        </>
      )}
    </div>
  );
}
