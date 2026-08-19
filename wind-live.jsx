import { useState, useEffect, useMemo } from "react";
import { LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM, glow } from "./ui-kit.js";

// ============================================================
// ЭФИР
// ============================================================
// Что здесь настоящее «сейчас», а что — честная ссылка наружу.
//
// Настоящее: снимки геостационарных спутников GOES и сводная радарная петля
// службы погоды США. Это не архив и не иллюстрация — файлы по этим адресам
// перезаписываются каждые несколько минут, и страница тянет их напрямую с
// серверов NOAA. Открытые, без ключа, без регистрации.
//
// Ссылка наружу: трансляции шторм-чейзеров. Встроить их не выйдет и дело не в
// лени — нет API, который бы сказал «вот эфир, снимающий вот этот смерч».
// Подставить наугад любой попавшийся стрим под конкретную катастрофу — это
// выдать случайное видео за репортаж с места, чего делать нельзя. Поэтому
// кнопки открывают поиск и постоянные каналы, а не притворяются плеером.
//
// Ещё одно ограничение, чисто техническое: превью-копия дашборда публикуется в
// песочнице с жёсткой политикой безопасности, которая режет запросы на чужие
// домены. Там картинки не загрузятся вообще — не потому, что адрес неверный.
// На копии со станции их не будет по другой причине: у станции нет интернета.

// Все адреса проверены живьём: отвечают 200, отдают картинку, ключа не просят.
// Если добавляешь свой — проверь так же, а не «по аналогии»: у NOAA половина
// секторов, которые кажутся очевидными, отдаёт 404, потому что кодов сектора
// нет там, где их ждёшь.
const CATS = [
  { id: "sat",   label: "Спутник" },
  { id: "radar", label: "Радар" },
  { id: "chart", label: "Карты" },
];

const SOURCES = [
  {
    id: "goes19-fd", cat: "sat",
    title: "GOES-19 · полный диск",
    sub: "Западное полушарие целиком, естественные цвета",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/1808x1808.jpg",
    every: "10 минут", ratio: 1,
    note: "Геостационарный спутник над 75° з. д. Днём — естественные цвета, ночью автоматически " +
          "переключается на инфракрасный канал с подсветкой облаков, поэтому картинка не гаснет.",
  },
  {
    id: "goes19-conus", cat: "sat",
    title: "GOES-19 · материковые США",
    sub: "Тот же спутник, крупным планом",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/1250x750.jpg",
    every: "5 минут", ratio: 1250 / 750,
    note: "Секторный снимок обновляется вдвое чаще полного диска — на нём видно, как за час " +
          "разворачивается грозовой фронт.",
  },
  {
    id: "goes19-sp", cat: "sat",
    title: "GOES-19 · Южные равнины",
    sub: "Сектор над смерчевым поясом",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/sp/GEOCOLOR/600x600.jpg",
    every: "5 минут", ratio: 1,
    note: "Оклахома, Канзас, Техас — та самая аллея смерчей. Здесь чаще всего и смотрят, " +
          "когда SPC объявляет повышенный риск: видно, как вдоль сухой линии выстраиваются " +
          "отдельные суперячейки.",
  },
  {
    id: "goes19-ir", cat: "sat",
    title: "GOES-19 · инфракрасный канал",
    sub: "Полоса 10.3 мкм, температура верхушек облаков",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/13/1250x750.jpg",
    every: "5 минут", ratio: 1250 / 750,
    note: "Меряет не свет, а тепло, поэтому работает ночью так же, как днём. Чем холоднее " +
          "верхушка облака, тем выше она забралась — по этому каналу и опознают мощную " +
          "конвекцию: у грозы с пробитой тропопаузой верхушка холоднее минус шестидесяти.",
  },
  {
    id: "goes19-sandwich", cat: "sat",
    title: "GOES-19 · «сэндвич»",
    sub: "Видимый канал поверх инфракрасного",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/Sandwich/1250x750.jpg",
    every: "5 минут", ratio: 1250 / 750,
    note: "Наложение двух каналов сразу: фактура облака берётся из видимого, а цвет — из " +
          "инфракрасного. Получается картинка, где одновременно видно и рельеф верхушки, " +
          "и насколько она холодная. Рабочий продукт синоптиков при разборе гроз.",
  },
  {
    id: "goes19-airmass", cat: "sat",
    title: "GOES-19 · воздушные массы",
    sub: "RGB-композит из каналов водяного пара и озона",
    url: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/AirMass/678x678.jpg",
    every: "10 минут", ratio: 1,
    note: "Не фотография, а раскраска по разнице каналов. Сухой воздух из стратосферы " +
          "получается красным, влажный тропический — зелёным. По границам этих цветов " +
          "видно струйное течение и фронтальные разделы, которых на обычном снимке нет.",
  },
  {
    id: "goes18-fd", cat: "sat",
    title: "GOES-18 · Тихий океан",
    sub: "Западный спутник, полный диск",
    url: "https://cdn.star.nesdis.noaa.gov/GOES18/ABI/FD/GEOCOLOR/1808x1808.jpg",
    every: "10 минут", ratio: 1,
    note: "Спутник над 137° з. д. Здесь рождаются тихоокеанские тайфуны и отсюда приходит " +
          "погода на всё западное побережье.",
  },
  {
    id: "radar-loop", cat: "radar",
    title: "Радарная петля · США",
    sub: "Сводная отражаемость, анимация",
    url: "https://radar.weather.gov/ridge/standard/CONUS_loop.gif",
    every: "несколько минут", ratio: 1.6,
    note: "Готовая анимация службы погоды: последние кадры базовой отражаемости всех радаров " +
          "сети NEXRAD, сшитые в петлю. Тот же продукт, что в слое «отражаемость» на карте, " +
          "только уже с историей движения.",
  },
  {
    id: "radar-sp", cat: "radar",
    title: "Радар · Южные равнины",
    sub: "Отражаемость над смерчевым поясом",
    url: "https://radar.weather.gov/ridge/standard/SOUTHPLAINS_loop.gif",
    every: "несколько минут", ratio: 1.35,
    note: "Тот же радарный продукт, но крупнее и только по аллее смерчей. На таком масштабе " +
          "уже различима форма ячейки — в том числе крюкообразный отголосок, по которому " +
          "и опознают смерчевую суперячейку.",
  },
  {
    id: "radar-se", cat: "radar",
    title: "Радар · Юго-восток США",
    sub: "Отражаемость, побережье Мексиканского залива",
    url: "https://radar.weather.gov/ridge/standard/SOUTHEAST_loop.gif",
    every: "несколько минут", ratio: 1.35,
    note: "Второй по активности смерчевой район страны — Дикси. Смерчи здесь чаще ночные " +
          "и приходят вместе с фронтом, а не с одиночной ячейкой, поэтому картина на радаре " +
          "совсем другая: длинная линия вместо отдельных пятен.",
  },
  {
    id: "wpc-sfc", cat: "chart",
    title: "Приземный анализ · WPC",
    sub: "Фронты, центры давления, изобары",
    url: "https://www.wpc.ncep.noaa.gov/sfc/lrgnamsfcwbg.gif",
    every: "3 часа", ratio: 1.3,
    note: "Классическая синоптическая карта, которую рисует дежурный синоптик Центра " +
          "прогнозов погоды. Холодные фронты — треугольниками, тёплые — полукружиями, " +
          "линии равного давления через 4 гПа. Именно с этой карты начинается любой " +
          "разбор погоды, и она почти не изменилась за сто лет.",
  },
  {
    id: "nhc-atl", cat: "chart",
    title: "Тропический прогноз · NHC",
    sub: "Вероятность образования циклонов на 7 дней",
    url: "https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png",
    every: "6 часов", ratio: 1.45,
    note: "Официальный прогноз Национального центра ураганов по Атлантике: обведены области, " +
          "где в ближайшую неделю может зародиться тропический циклон, с вероятностью в " +
          "процентах. Ровно та картинка, по которой объявляют готовность на побережье.",
  },
];

// Постоянные каналы, а не «эфир прямо сейчас». Проверить, идёт ли трансляция в
// эту секунду, без ключа к API нельзя, и обещать это в подписи нечестно.
const CHASERS = [
  { name: "Поиск живых эфиров о смерчах", url: "https://www.youtube.com/results?search_query=tornado+live+storm+chaser&sp=EgJAAQ%253D%253D" },
  { name: "Ryan Hall, Y'all", url: "https://www.youtube.com/@RyanHallYall/streams" },
  { name: "Max Velocity", url: "https://www.youtube.com/@MaxVelocityWX/streams" },
  { name: "Reed Timmer", url: "https://www.youtube.com/@ReedTimmerWx/streams" },
  { name: "Прогнозы SPC (официально)", url: "https://www.spc.noaa.gov/" },
];

function Frame({ src, g, motion, online }) {
  const [state, setState] = useState("load"); // load | ok | fail
  const [nonce, setNonce] = useState(0);
  const [at, setAt] = useState(null);

  // Кэш пришлось бы обходить в любом случае: у всех этих файлов постоянный
  // адрес, меняется только содержимое, и без метки браузер честно отдаст
  // вчерашний снимок из кэша.
  const url = useMemo(() => `${src.url}?t=${nonce}`, [src.url, nonce]);

  useEffect(() => {
    setState("load");
  }, [url]);

  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => setNonce((n) => n + 1), 300000);
    return () => clearInterval(id);
  }, [online, src.id]);

  return (
    <div style={{ border: `1px solid ${LINE}`, background: "linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0.008))" }}>
      <header style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
        padding: "9px 13px 8px", borderBottom: `1px solid ${LINE}`,
      }}>
        <div>
          <div style={{
            fontFamily: SANS, fontWeight: 600, fontSize: 11, letterSpacing: 1.6,
            color: TEXT, textShadow: glow(g, 0.5), textTransform: "uppercase",
          }}>
            {src.title}
          </div>
          <div style={{ color: DIM, fontSize: 10, marginTop: 3 }}>{src.sub}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Точка «в эфире» загорается только когда кадр действительно
              загрузился: гореть при отвалившемся источнике — это врать. */}
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: state === "ok" ? "#ef4444" : state === "fail" ? FAINT : DIM,
            boxShadow: state === "ok" && g !== "off" ? "0 0 8px #ef4444" : "none",
            animation: state === "ok" && motion !== "off" ? "pulse 2s infinite" : undefined,
          }} />
          <span style={{ ...NUM, fontSize: 9, color: state === "ok" ? TEXT : DIM, letterSpacing: 1 }}>
            {state === "ok" ? "В ЭФИРЕ" : state === "fail" ? "НЕТ СИГНАЛА" : "ПРИЁМ…"}
          </span>
        </div>
      </header>

      <div style={{ position: "relative", background: "#020407", aspectRatio: String(src.ratio) }}>
        {online ? (
          <img
            src={url}
            alt={src.title}
            onLoad={() => { setState("ok"); setAt(new Date()); }}
            onError={() => setState("fail")}
            style={{
              width: "100%", height: "100%", objectFit: "contain", display: "block",
              opacity: state === "ok" ? 1 : 0,
              transition: motion === "off" ? "none" : "opacity .5s ease",
            }}
          />
        ) : null}

        {(state !== "ok" || !online) && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", padding: 20, textAlign: "center",
            color: DIM, fontFamily: SANS, fontSize: 10.5, lineHeight: 1.6,
          }}>
            {!online
              ? "Нет выхода в интернет — спутник отсюда не достать."
              : state === "fail"
                ? "Кадр не пришёл. Либо у устройства нет выхода в интернет (например, вы в точке самой станции), либо запрос к чужому домену заблокирован политикой безопасности страницы."
                : "Принимаю кадр…"}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6 }}>{src.note}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...NUM, fontSize: 9, color: FAINT }}>
            обновление · {src.every}
          </span>
          {at && (
            <span style={{ ...NUM, fontSize: 9, color: FAINT }}>
              кадр принят в {at.toLocaleTimeString("uk-UA")}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={!online}
            style={{
              background: "transparent", border: `1px solid ${LINE}`,
              color: online ? DIM : FAINT, fontFamily: SANS, fontSize: 9.5, letterSpacing: 1,
              padding: "4px 9px", cursor: online ? "pointer" : "default",
            }}
          >
            ОБНОВИТЬ
          </button>
          <a href={src.url} target="_blank" rel="noreferrer noopener" style={{
            border: `1px solid ${LINE}`, color: TEXT, textDecoration: "none",
            fontFamily: SANS, fontSize: 9.5, letterSpacing: 1, padding: "4px 9px",
          }}>
            ОРИГИНАЛ ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LiveWatch({ g, motion, online }) {
  const [only, setOnly] = useState(null);   // id развёрнутого источника или null
  const [cat, setCat] = useState("all");    // раздел

  // Источников стало двенадцать, и вываливать их одной сеткой значит заставить
  // человека листать три экрана ради одной картинки. Разделы дешевле вкладок:
  // одна строка кнопок вместо второго яруса навигации.
  const inCat = cat === "all" ? SOURCES : SOURCES.filter((s) => s.cat === cat);
  const shown = only ? SOURCES.filter((s) => s.id === only) : inCat;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        {[{ id: "all", label: "Все" }, ...CATS].map((c) => {
          const on = c.id === cat;
          return (
            <button key={c.id} onClick={() => { setCat(c.id); setOnly(null); }}
                    style={{
                      background: on ? "rgba(231,238,246,0.09)" : "transparent",
                      border: `1px solid ${on ? LINE_HI : LINE}`,
                      color: on ? TEXT : DIM, textShadow: on ? glow(g, 0.5) : "none",
                      fontFamily: SANS, fontSize: 10, letterSpacing: 1.4,
                      textTransform: "uppercase", padding: "5px 11px", cursor: "pointer",
                    }}>
              {c.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ ...NUM, fontSize: 9.5, color: FAINT }}>
          {inCat.length} из {SOURCES.length}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {inCat.map((s) => (
          <button
            key={s.id}
            onClick={() => setOnly(only === s.id ? null : s.id)}
            style={{
              background: only === s.id ? "rgba(231,238,246,0.09)" : "transparent",
              border: `1px solid ${only === s.id ? LINE_HI : LINE}`,
              color: only === s.id ? TEXT : DIM,
              fontFamily: SANS, fontSize: 10, letterSpacing: 1,
              padding: "5px 10px", cursor: "pointer", transition: "all .18s ease",
            }}
          >
            {s.title}
          </button>
        ))}
        {only && (
          <button onClick={() => setOnly(null)} style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            fontFamily: SANS, fontSize: 10, letterSpacing: 1, padding: "5px 10px", cursor: "pointer",
          }}>
            ПОКАЗАТЬ ВСЁ
          </button>
        )}
      </div>

      <div className="live-grid" style={{
        display: "grid",
        gridTemplateColumns: only ? "1fr" : "1fr 1fr",
        gap: 14, alignItems: "start",
      }}>
        {shown.map((s) => (
          <Frame key={s.id} src={s} g={g} motion={motion} online={online} />
        ))}
      </div>

      <div style={{ border: `1px solid ${LINE}`, padding: "12px 13px" }}>
        <div style={{
          fontFamily: SANS, fontWeight: 600, fontSize: 10, letterSpacing: 2.2,
          color: DIM, textTransform: "uppercase", marginBottom: 9,
        }}>
          Трансляции с земли
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CHASERS.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer noopener" style={{
              border: `1px solid ${LINE}`, color: TEXT, textDecoration: "none",
              fontFamily: SANS, fontSize: 10, letterSpacing: 0.5, padding: "5px 10px",
              textShadow: glow(g, 0.35),
            }}>
              {c.name} ↗
            </a>
          ))}
        </div>
        <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 10 }}>
          Это постоянные адреса каналов, а не проверенный список идущих прямо сейчас эфиров.
          Убедиться, что трансляция в воздухе, без ключа к API невозможно, а писать «в эфире»
          не проверив — значит обманывать. Шторм-чейзеры выходят в эфир в дни вспышек;
          в спокойный день там будет пусто, и это нормально.
        </div>
      </div>

      <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.65, fontFamily: SANS }}>
        Спутниковые кадры — <b style={{ color: DIM }}>NOAA STAR</b> (GOES-19 и GOES-18),
        радарные петли — <b style={{ color: DIM }}>radar.weather.gov</b>, приземный анализ —
        <b style={{ color: DIM }}> Центр прогнозов погоды (WPC)</b>, тропический прогноз —
        <b style={{ color: DIM }}> Национальный центр ураганов (NHC)</b>. Файлы по постоянным
        адресам перезаписываются каждые несколько минут; страница подставляет к адресу метку
        времени, иначе браузер отдал бы вчерашний кадр из кэша.
      </div>
    </div>
  );
}
