import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import {
  BG, BG_VAR, LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM, glow, glowColor, dropGlow,
  clamp01, polar, wedgePath, FONT_SETS,
} from "./ui-kit.js";
import { KiwiMark, TonalMark, setFavicon } from "./wind-kiwi.jsx";
import { LANGS, langInfo, resolveLang, systemLang, applyLang } from "./wind-i18n.js";
import { chunk, warmUp } from "./wind-guard.jsx";
import {
  mergeLayout, packLayout, layoutOps, useDrag, useResize, BlockFrame, LayoutBar, ROW, GAP,
  tracksFor, spanFor, useViewport,
} from "./wind-layout.jsx";
import { WIDTHS } from "./wind-widths.js";
import DemoControls from "./wind-demo.jsx";
import { CameraWindow } from "./wind-instrument.jsx";

// Отложенная загрузка. Причина не в красоте архитектуры, а в канале: плата
// висит на далёкой точке доступа, и на слабом сигнале сборка идёт со скоростью
// меньше килобайта в секунду, а соединение успевает оборваться раньше, чем
// файл дойдёт целиком. Каждый килобайт первой загрузки — это секунды ожидания.
//
// Разделены ровно те части, которые не нужны для первого экрана: карта мира с
// её таблицами побережий, метеорология с архивом штормов, эфир, справка и
// разрешения. Открытие вкладки теперь стоит одного короткого запроса, зато
// «Основное» — то, ради чего дашборд и открывают, — приходит вдвое быстрее.
// chunk() вместо голого lazy: у каждой части своя граница ошибок и своя
// кнопка повтора. Без неё не догрузившаяся вкладка снимала с экрана всё
// приложение целиком — именно так и получался чёрный экран.
const WorldMap     = chunk(() => import("./wind-map.jsx"));
const LiveWatch    = chunk(() => import("./wind-live.jsx"));
const Meteorology  = chunk(() => import("./wind-meteo.jsx"));
const AnalysisTab  = chunk(() => import("./wind-analysis.jsx"));
import District, { useDistrict, districtToData } from "./wind-district.jsx";
import { backdropCss, loadBgImage, CORNERS, CustomWidgets } from "./wind-custom.jsx";
import { THEMES, themeCss, glassClasses, glassLevel, lensActive, startLens, mountWall,
         GLASS_TINTS, GLASS_LEVEL_DEFAULT } from "./wind-themes.js";
import { APP_VERSION } from "./wind-version.js";
import { useAppUpdate, useUpdateCheck, VerFacts } from "./wind-update.jsx";
import { Switch, Segments, Reveal, SWITCH_CSS } from "./wind-switch.jsx";
import { SystemHero, LedDeck, SYSTEM_CSS } from "./wind-system.jsx";
import { AreaTab, AreaMode, AreaWind, WindCompass, SourceSwitch, AREA_CSS } from "./wind-area.jsx";
import { ECO_AUTO, ecoOn, ECO_CSS, OFFSCREEN_CSS, watchOffscreen } from "./wind-perf.js";
import { useMorph, MORPH_CSS } from "./wind-morph.js";
import { Liquid, LiquidRange, LIQUID_CSS, MOTION_CSS } from "./wind-liquid.jsx";
import { LIGHT_CSS } from "./wind-light.js";
import { MATERIAL_THEMES, MATERIAL_ICONS, materialCss } from "./wind-material.js";
import { mountTapHaptics, setHapticConfig, haptic, canVibrate } from "./wind-haptic.js";
import { useDeviceBattery, deviceKind, DEVICE_NAME } from "./wind-device.js";
import { logSample, watchFrame, prune, saveLastFrame, loadLastFrame } from "./wind-log.js";
import { RulesPanel } from "./wind-extras.jsx";
import { ConnectPanel, HealthPanel, EventsPanel, ZeroWizard, DesktopWidgets, RemotePanel, useEvents } from "./wind-station.jsx";
import { useAlerts, quietNow, ALERT_DEFAULTS } from "./wind-alerts.js";
import { pushNote, useNotifier, requestNotify, sentToday, DAY_LIMIT } from "./wind-notify.js";
import { mountGlassScroll, GLASS_SCROLL_CSS } from "./wind-scroll.js";
import Kiosk from "./wind-kiosk.jsx";
import { useForecast } from "./wind-forecast.js";
import { discover } from "./wind-discover.js";

// Прошивка раздаёт этот дашборд сама (gzip из PROGMEM на порту 80). Если страница
// открыта со станции — API живёт на том же хосте, настройка не нужна и localStorage
// игнорируется (станция точно по этому адресу, раз страница пришла с неё). Порт 80
// отличает станцию от vite dev (5173/5174), открытого с другого устройства по IP ноутбука.
const SERVED_FROM_STATION =
  window.location.protocol === "http:" &&
  (window.location.port === "" || window.location.port === "80") &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname);

// Имя станции, а не IP: его резолвит DNS-сервер на самой плате, поэтому оно
// одинаково работает на всех клиентах точки доступа, включая Android.
const DEFAULT_HOST = SERVED_FROM_STATION ? window.location.host : "MyWindProbeBETA.org";

// Публичная копия на внешнем хостинге. Признак — HTTPS: сама станция слушает
// только HTTP на 192.168.4.1, и подняться на 443 ей нечем.
//
// ПРЯМЫХ данных здесь по-прежнему быть не может, и это не недоделка, а два
// независимых запрета: браузер блокирует запрос с HTTPS-страницы на http://
// (mixed content), а сама плата сидит за CGNAT и снаружи не адресуема.
//
// ⚠️ Но «прямого канала нет» перестало значить «живых данных нет». Станция
// сама выходит наружу и публикует показания на брокер по TLS, а страница
// читает их оттуда по wss:// — в том же защищённом контексте, поэтому правило
// смешанного контента к этому пути не относится вовсе. Демо стало фолбэком,
// а не режимом по умолчанию.
//
// ⚠️ И ещё одно следствие, которое легко потерять: PUBLIC_COPY и !GEO_AVAILABLE
// БОЛЬШЕ НЕ ОДИН И ТОТ ЖЕ ПРИЗНАК. До облака они были взаимоисключающими
// (публичная копия = HTTPS = геолокация есть; копия с платы = HTTP = её нет),
// и один флаг спокойно обслуживал два разных смысла. Теперь их надо различать:
//   PUBLIC_COPY     — «прямого HTTP к плате нет». ЛЕЧИТСЯ облаком.
//   !GEO_AVAILABLE  — «браузер не отдаёт координаты смотрящего». Не лечится
//                     ничем, кроме настоящего HTTPS, и облако тут ни при чём.
// Текст, написанный про один из них, к другому не подходит.
const PUBLIC_COPY = window.location.protocol === "https:";

// Вошёл ли облачный модуль в этот бандл. Константа сборки — её объявляет
// сборка фронтенда, и здесь она читается через try, чтобы старый бандл без
// define не падал с ReferenceError, а честно отвечал «нет».
//
// Это ПЕРВЫЙ из трёх уровней, и смешивать их нельзя:
//   CLOUD_BUILT      — облачный модуль вообще есть в сборке (и учётка зрителя
//                      попала в неё; окончательный ответ даёт CLOUD_CONFIGURED
//                      из самого модуля, но он известен только после загрузки);
//   station.cloudId  — у ЭТОЙ станции есть облачный канал. У чужой мачты без
//                      модема его нет, сколько бы ни было в сборке;
//   cloudPhase       — канал работает ПРЯМО СЕЙЧАС.
// Развести тексты только по первому — значит пообещать владельцу второй
// станции без модема то, чего дашборд не выполнит.
//
// && PUBLIC_COPY — ровно та же охрана, под которой модуль грузится ниже.
// Бандл один на оба места, и без неё тумблер «через облако» появился бы и на
// копии, отданной платой, где модуль никто не подтянет.
const CLOUD_BUILT = PUBLIC_COPY && (() => {
  try { return !!__WIND_CLOUD__; } catch { return false; }
})();

// Облачный модуль грузится обычным динамическим импортом, а не chunk()/lazy и
// не через warmUp(): warmUp дёргает загрузку БЕЗУСЛОВНО через 4 секунды и
// глотает отказ — на копии с платы это был бы 404 при каждом открытии
// страницы. Здесь загрузка происходит только тогда, когда канал действительно
// понадобился, и её отказ виден как cloudPhase = failed.
let cloudModPromise = null;
function loadCloud() {
  if (!CLOUD_BUILT) return Promise.resolve(null);
  if (!cloudModPromise) cloudModPromise = import("./wind-cloud.jsx").catch(() => null);
  return cloudModPromise;
}

// Параметры подключения зрителя живут В МОДУЛЕ, а не здесь. Писать в этом
// файле переменные окружения VITE_* нельзя читать ни одной строкой: Vite
// подставляет значение литералом в тот модуль, где оно написано, — и адрес
// брокера вместе с паролем зрителя уехали бы в entry-чанк, то есть внутрь
// web_content.h и внутрь прошивки. Модуль либо отдаёт готовый объект, либо
// берёт свои умолчания сам, когда полей нет.
// Наружу передаётся РОВНО идентификатор станции. Адрес брокера, логин и
// пароль зрителя дашборд не знает и знать не должен: они читаются из
// переменных окружения внутри самого облачного модуля, и попади хоть одна
// такая строка сюда — сборщик подставил бы её литералом в entry-чанк, то
// есть в прошивку платы и в публичный репозиторий.
function cloudOpts(stationId) {
  return { stationId };
}

// Стадии облачного канала по-русски. Одно состояние вместо трёх булевых:
// «подключаюсь / идёт / кадров нет / станция ушла / не вышло» — это ступени
// одного канала, а не независимые признаки, и тремя флагами они складывались
// бы в невозможные сочетания вроде «подключаюсь и одновременно офлайн».
const CLOUD_PHASE_VIEW = {
  connecting: "подключаюсь",
  live: "идёт",
  stale: "кадров нет",
  offline: "станция ушла",
  failed: "не вышло",
};

// Карта мира и «эфир» тянут данные у службы погоды США, и им надо знать, есть
// ли выход наружу. Угадывать по тому, кто отдал страницу, нельзя: у этой
// прошивки плата держит свою точку и одновременно уходит в домашнюю сеть, так
// что «страница пришла со станции» больше не значит «интернета нет» — если
// браузер сидит в той же домашней сети и открыл плату по её IP, сеть у него есть.
// Обратный случай тоже бывает: клиент подключён к точке самой станции, и тогда
// наружу хода нет, потому что плата ничего не маршрутизирует.
//
// Поэтому не гадаем, а пробуем и честно показываем результат. Ошибка запроса
// сама скажет, что сети нет, — это дешевле одного неверного предположения,
// из-за которого живые слои молча не включались бы.
const ONLINE = true;

// ============================================================
// ЕДИНИЦЫ СКОРОСТИ
// ============================================================
// Прошивка всегда отдаёт м/с — пересчёт целиком на стороне UI, чтобы смена
// единиц не требовала ни перезаливки платы, ни round-trip к ней.
const UNITS = {
  ms:   { label: "м/с",    short: "м/с",    factor: 1,        digits: 1 },
  kmh:  { label: "км/ч",   short: "км/ч",   factor: 3.6,      digits: 0 },
  mph:  { label: "миль/ч", short: "mph",    factor: 2.236936, digits: 0 },
  kt:   { label: "узлы",   short: "kt",     factor: 1.943844, digits: 0 },
  fts:  { label: "фут/с",  short: "ft/s",   factor: 3.280840, digits: 0 },
  bft:  { label: "Бофорт", short: "бфт",    factor: null,     digits: 0 },
};
const UNIT_KEYS = Object.keys(UNITS);

// Beaufort — не линейный пересчёт, а таблица порогов, поэтому вынесен отдельно.
// Описания суши и моря — стандартные формулировки шкалы ВМО: именно они делают
// её метеорологическим инструментом, а не просто раскраской чисел.
const BEAUFORT = [
  { max: 0.5,  scale: 0,  desc: "Штиль",         color: "#94a3b8",
    land: "Дым поднимается вертикально",           sea: "Зеркально гладкое море" },
  { max: 1.6,  scale: 1,  desc: "Тихий",         color: "#67e8f9",
    land: "Дым слегка отклоняется, флюгер не движется", sea: "Рябь без пены на гребнях" },
  { max: 3.4,  scale: 2,  desc: "Лёгкий",        color: "#22d3ee",
    land: "Ветер чувствуется лицом, шелестят листья",   sea: "Короткие волны, гребни стекловидные" },
  { max: 5.5,  scale: 3,  desc: "Слабый",        color: "#34d399",
    land: "Колышутся листья и тонкие ветки, вытянут флаг", sea: "Гребни начинают опрокидываться" },
  { max: 8.0,  scale: 4,  desc: "Умеренный",     color: "#4ade80",
    land: "Поднимается пыль и мелкий мусор, качаются ветки", sea: "Волны удлиняются, местами барашки" },
  { max: 10.8, scale: 5,  desc: "Свежий",        color: "#a3e635",
    land: "Качаются тонкие стволы, на воде появляются волны", sea: "Барашки по всей поверхности" },
  { max: 13.9, scale: 6,  desc: "Сильный",       color: "#facc15",
    land: "Гудят провода, качаются толстые ветки, трудно с зонтом", sea: "Появляются белые пенистые гребни" },
  { max: 17.2, scale: 7,  desc: "Крепкий",       color: "#fb923c",
    land: "Качаются стволы деревьев, идти против ветра трудно", sea: "Пена срывается с гребней полосами" },
  { max: 20.8, scale: 8,  desc: "Очень крепкий", color: "#f97316",
    land: "Ломаются ветки, движение против ветра почти невозможно", sea: "Умеренно высокие длинные волны" },
  { max: 24.5, scale: 9,  desc: "Шторм",         color: "#ef4444",
    land: "Повреждаются крыши, срывает черепицу",  sea: "Высокие волны, гребни опрокидываются" },
  { max: 28.5, scale: 10, desc: "Сильный шторм", color: "#dc2626",
    land: "Деревья вырывает с корнем, значительные разрушения", sea: "Поверхность моря белая от пены" },
  { max: 32.7, scale: 11, desc: "Жёсткий шторм", color: "#b91c1c",
    land: "Обширные разрушения построек",          sea: "Исключительно высокие волны, видимость снижена" },
  { max: Infinity, scale: 12, desc: "Ураган",    color: "#7f1d1d",
    land: "Опустошительные разрушения",            sea: "Воздух заполнен пеной и брызгами" },
];

function beaufort(speedMs) {
  for (const b of BEAUFORT) if (speedMs < b.max) return b;
  return BEAUFORT[BEAUFORT.length - 1];
}

// Возвращает уже отформатированную строку: у Бофорта своя логика (целое число
// баллов), у остальных — множитель и заданная точность.
// Высота окна скорости в строках сетки (ROW = 10 px) — по содержимому:
// кольцо, балл, две карточки и полосы с подписью. Без полос внизу оставалась
// пустая треть окна.
const SPEED_H = 42;

function convertSpeed(speedMs, unitKey, digitsOverride) {
  const u = UNITS[unitKey] ?? UNITS.ms;
  if (u.factor === null) return String(beaufort(speedMs).scale);
  const digits = digitsOverride == null ? u.digits : digitsOverride;
  return (speedMs * u.factor).toFixed(digits);
}

// ============================================================
// КАТАЛОГ СТАНЦИЙ
// ============================================================
// Публичного каталога метеостанций не существует: станция автономна, сидит в
// собственной точке доступа без выхода в интернет и никуда о себе не сообщает.
// Поэтому «ближайшая станция» ищется среди тех, что пользователь сам сохранил
// в этом браузере. Геолокация тут не украшение: она честно выбирает ближайшую
// из своих, а когда сохранять нечего — так и говорит, вместо того чтобы
// показывать выдуманные показания под видом соседской станции.
const STATIONS_KEY = "wind_ui_stations";
const WELCOMED_KEY = "wind_ui_welcomed";
// Какая из сохранённых станций выбрана. Раньше выбранной считалась та, у
// которой host совпал с esp32_host, и это работало ровно до появления облака:
// DEFAULT_HOST одинаков у ЛЮБОЙ станции в режиме точки доступа, поэтому у двух
// разных мачт один и тот же адрес. Подсвечивались обе.
const ACTIVE_KEY = "wind_ui_station";
// Канал до станции: 'direct' (HTTP к плате) или 'cloud' (подписка на брокер).
const LINK_KEY = "wind_ui_link";

// Миграции в обычном смысле нет и не нужно: проверка только на Array, а у
// старых записей cloudId === undefined, что читается как «облака у этой
// станции нет». Тот же контракт, по которому уже живут dirPresent и
// batteryPresent. Дописывать в старые записи cloudId: null НЕ НАДО — это
// завело бы отличие, которого не существует.
function loadStations() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATIONS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// Ключ дедупликации и опознания станции. Адрес перестал быть уникальным
// (см. ACTIVE_KEY), а вот облачный идентификатор уникален по построению —
// это имя ветки топиков на брокере.
// Часы и случайное число на уровне модуля, а не внутри компонента: во время
// рендера их звать нельзя (результат нестабилен между повторными рендерами),
// и правило react-hooks это ловит, даже когда вызов на самом деле сидит в
// обработчике кнопки.
function newStationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stationKey(st) {
  return (st && st.cloudId) || (st && st.host) || "";
}

// Источник по умолчанию. На копии с платы и на dev — всегда станция. На
// публичной копии станция имеет смысл, только если есть куда подключаться:
// хотя бы одна сохранённая станция с облачным идентификатором. Иначе демо,
// как и раньше.
function initialSource() {
  if (!PUBLIC_COPY) return "station";
  return loadStations().some((s) => s.cloudId) ? "station" : "demo";
}

// Канал по умолчанию. Страница, отданная самой платой, — всегда прямой канал:
// API живёт на том же хосте, и облако тут только лишний круг через интернет.
function initialLink() {
  if (SERVED_FROM_STATION) return "direct";
  try {
    const saved = localStorage.getItem(LINK_KEY);
    if (saved === "direct" || saved === "cloud") return saved;
  } catch { /* приватный режим */ }
  return CLOUD_BUILT ? "cloud" : "direct";
}

function persistStations(list) {
  try { localStorage.setItem(STATIONS_KEY, JSON.stringify(list)); } catch { /* приватный режим */ }
}

// Расстояние по большому кругу. Нужна не точность, а порядок сортировки,
// поэтому Земля считается шаром и никаких поправок на эллипсоид нет.
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} м`;
  if (km < 10) return `${km.toFixed(1)} км`;
  return `${Math.round(km)} км`;
}

// Геолокация требует защищённого контекста: по обычному HTTP браузеры её не дают
// (исключение — localhost). Копия на плате как раз отдаётся по HTTP, поэтому там
// поиск ближайшей невозможен — но там он и не нужен, вы уже на станции.
//
// ⚠️ Это НЕ «PUBLIC_COPY наоборот», хотя до облака выглядело именно так. Облако
// чинит доступ к плате и не чинит здесь ничего: браузер закрывает координаты
// не потому, что до станции не достучаться, а потому, что страница пришла по
// HTTP. Поэтому все условия вида !GEO_AVAILABLE остаются как есть — меняются
// только тексты рядом с ними, и только там, где они обещали лишнего. См.
// длинный комментарий у PUBLIC_COPY выше.
const GEO_AVAILABLE =
  typeof navigator !== "undefined" && !!navigator.geolocation && window.isSecureContext;

function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!GEO_AVAILABLE) {
      reject(new Error("unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  });
}

// Отказ и недоступность — разные вещи, и подсказка должна быть разной: в первом
// случае человек сам закрыл доступ, во втором чинить нечего.
function geoErrorText(e) {
  if (e && e.code === 1) return "Доступ к геоданным запрещён. Станцию можно выбрать вручную — «подключить свою станцию».";
  if (e && e.code === 2) return "Браузер не смог определить место. Попробуйте ещё раз или выберите станцию вручную.";
  if (e && e.code === 3) return "Определение места заняло слишком долго. Попробуйте ещё раз или выберите станцию вручную.";
  return "Геолокация в этом браузере недоступна. Станцию можно выбрать вручную.";
}

// ============================================================
// НАСТРОЙКИ
// ============================================================
// Порог тревоги. 17.2 м/с — не произвольное число: это начало 8 баллов по
// Бофорту, международная граница штормового предупреждения, и примерно там же
// лежит High Wind Warning службы погоды США (17.9 м/с). Ниже, с 13.9 м/с
// (7 баллов), идёт предупредительный уровень: идти против ветра уже трудно,
// но ничего ещё не ломается.
const ALARM_WATCH = 13.9;

// Перегрузка шкалы. Второй круг здесь не украшение и не «просто много»:
// у датчика станции предел 30 м/с (SPEED_MAX в прошивке), и всё, что выше, —
// показания за пределами того, на что прибор рассчитан. Отдельный цвет для
// отдельного физического режима: акцент по Бофорту говорит о силе ветра,
// фиолетово-розовый — о том, что мерить эту силу уже нечем.
//
// Это единственное место, где интерфейс отступает от правила «один цвет»,
// и отступает осознанно — потому что состояние тоже единственное в своём роде.
const OVER_A = "#a855f7";   // фиолетовый
const OVER_B = "#ec4899";   // розовый

// Порог второго круга — фиксированные 50 м/с, а не предел датчика.
// Число не произвольное: 49.4 м/с (96 узлов) — граница третьей категории по
// шкале Саффира–Симпсона, с которой ураган считается мощным. Пятьдесят ровно —
// та же граница, округлённая до круглого.
//
// Следствие, о котором надо знать: датчик станции упирается в 30 м/с
// (прошивка обрезает показание на SPEED_MAX), поэтому на живой станции второй
// круг не загорится никогда. Он и не должен: там нечем измерить пятьдесят.
// В демо, где моделируется 05103 с его сотней, он работает как задумано.
const OVER_FROM = 50;   // м/с — начало второго круга
const OVER_SPAN = 50;   // м/с — сколько ветра заполняет его целиком (50 -> 100)

// Варианты акцента. Единственный цветной элемент интерфейса, поэтому выбор
// здесь заметнее любой другой визуальной настройки. «Фосфор» и «янтарь» — это
// цвета люминофора старых монохромных мониторов; на приборной панели они
// выглядят уместно ровно потому, что оттуда и пришли.
const ACCENTS = {
  bft:      { label: "по Бофорту", color: null },
  white:    { label: "белый",      color: "rgb(var(--ink, 231,238,246))" },
  amber:    { label: "янтарь",     color: "#f5b942" },
  phosphor: { label: "фосфор",     color: "#4ade80" },
  ice:      { label: "лёд",        color: "#67e8f9" },
};

// Фон. Не «тема», а именно подложка: дашборд остаётся тёмным в любом случае,
// светлый вариант ему противопоказан — светящийся текст по белому не работает.
const GROUNDS = {
  black:    { label: "чёрный",  bg: "#04070a" },
  graphite: { label: "графит",  bg: "#0b1119" },
  ink:      { label: "чернила", bg: "#0a0d14" },
};

// Уровень тревоги считается по большему из среднего и порыва: ломает вещи
// именно порыв, а не десятиминутное среднее.
function alarmOf(speed, gust, threshold) {
  const v = Math.max(speed, gust);
  if (v >= threshold) return 2;
  if (v >= Math.min(ALARM_WATCH, threshold)) return 1;
  return 0;
}

const ALARM_VIEW = [
  null,
  { name: "ВНИМАНИЕ", color: "#facc15", text: "Ветер усилился — идти против него трудно, мелкие ветки в движении." },
  { name: "ОПАСНО",   color: "#ef4444", text: "Штормовая сила. Ломает ветки, срывает незакреплённое. Уйти с открытого места." },
];

// Android — и приложение (WKNative), и браузер телефона: у дока там нет места
// на лишнюю круглую кнопку.
const ON_ANDROID = typeof window !== "undefined" &&
  (!!window.WKNative || /Android/i.test(navigator.userAgent || ""));

const DEFAULT_SETTINGS = {
  // — вид —
  unit: "ms",
  digits: null,          // null — сколько принято для выбранной единицы
  font: "cascadia",      // ключ из FONT_SETS
  glow: "off",           // off | normal | strong — у стекла свечения нет
  motion: "full",        // full | calm | off — развёртка, плавность цифр, появление панелей
  speedAccent: "bft",    // bft — цвет по Бофорту, white — монохром
  showCompass: true,
  showGrid: true,        // сетка меридианов и параллелей на карте
  // — техника —
  histMinutes: 2,        // окно графика и конвективного анализа
  pollMs: 1000,          // период опроса /api/data, когда потока нет
  useSse: true,          // держать поток /api/stream
  mapQuality: "normal",  // eco | normal | max — ступень тайлов отражаемости
  // Пиксель по умолчанию у обоих слоёв. Радар и модель считают по клеткам, и
  // клетка — это и есть их настоящее разрешение; сглаживание рисует поверх него
  // подробность, которой в данных нет. Кому важнее вид, а не честность, —
  // тумблеры рядом.
  pixelRadar: true,      // отражаемость: пиксель как есть или сглаженная
  pixelCells: true,      // суперклетки: клетки сетки или мягкая заливка
  notifySquall: false,   // уведомление при выполнении критерия шквала
  keepAwake: false,      // не давать экрану гаснуть
  alarmMs: 17.2,         // порог тревоги по ветру, м/с
  // — вид, дополнительно —
  accent: "bft",         // ключ из ACCENTS
  ground: "black",       // ключ из GROUNDS
  density: "normal",     // normal | compact — отступы панелей
  borders: true,         // рамки у панелей
  showCamera: true,      // окно камеры на вкладке «Метео данные»
  // — кастомизация —
  texture: "smooth",     // ключ из TEXTURES — материал подложки
  scene: "liquid",       // ключ из SCENES, либо custom для своей картинки
  bgTint: 8,             // затемнение фона, %. Для своей картинки стоит поднять:
                         // фотография под текстом требует притушения
  customAccent: "",      // свой цвет; пусто — берётся из ACCENTS
  theme: "liquid",       // ключ из THEMES — материал, из которого сделаны панели
  // Стекло. eco: null — решает устройство (телефон → вкл), true/false — выбор
  // человека. glassTint — Clear/Tinted как в iOS 26.1, glassLevel — ползунок
  // силы стекла как в iOS 27. Прежний glassFx (max/blur/off) переведён в них
  // один раз в loadSettings().
  eco: null,
  mode: "dark",          // тема: light | dark — только светлая или тёмная
  skin: "glass",         // стиль: plain («По умолчанию»), glass (Liquid Glass) или material («Тональная»)
  wall: "live",          // обои под Liquid Glass: live | dim | none (scene выводится из mode+skin+wall, см. sceneOf)
  lang: null,            // язык интерфейса: null = как в системе, иначе код из LANGS (wind-i18n.js)
  glassIcon: true,       // значок: true — стеклянная долька (Liquid Glass), false — тональная
  mdIcons: "blue",       // «Тональная»: цвет значков — blue (синие) или bg (в цвет фона)
  glassTint: "clear",
  glassLevel: GLASS_LEVEL_DEFAULT,
  // Пульт управления (док с вкладками): bottom | top — горизонтально,
  // left | right — вертикально по бокам. dockIcons: both — значки с подписью,
  // icons — только значки.
  dockPos: "bottom",
  dockIcons: "both",
  corners: "round",      // sharp | soft | round — скругление панелей
  panelFill: 0,          // заливка панелей, % — плотность фона под текстом
  widgets: [],           // свои виджеты на вкладке «Метео данные»
  layout: [],            // раскладка блоков «Основного»; пусто — как задумано
  pageWidth: "normal",   // ключ из WIDTHS — предел ширины страницы
  uiRev: 2,              // ревизия оформления; см. loadSettings()
  // — анализ —
  activity: "kite",      // профиль занятия в «Анализ → Сейчас»
  mastH: 3,              // высота мачты, м — для пересчёта ветра на высоту
  rotorD: 1.5,           // диаметр ротора условного ветряка, м
  // — голос и тревоги — см. wind-alerts.js
  ...ALERT_DEFAULTS,
  haptics: "normal",     // вибрация: off | soft | normal | strong (wind-haptic.js)
  hapTouch: true,        // отклик на касание окна
  hapSliders: true,      // щелчки ползунков
  hapBoot: true,         // заставка при входе и полоса установки обновления
  notify: false,         // уведомления Windows / Android (wind-notify.js)
  digestHours: 3,        // сводка ветра и прогноза раз в N часов; 0 — без сводок
};

// Тема (светлая/тёмная), стиль и обои — три независимых выбора; внутри дашборда
// их по-прежнему несёт одно поле scene (ключ SCENES / класс sc-*), и оно
// выводится здесь. Своя картинка (wall: "custom") — сцена custom поверх всего.
function sceneOf(s) {
  if (s.wall === "custom") return "custom";
  const light = s.mode === "light";
  if (s.skin !== "glass" || s.wall === "none") return light ? "light" : "plain";
  if (light) return "liquidLight";
  return s.wall === "dim" ? "liquidDark" : "liquid";
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("wind_ui_settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw);
    const s = { ...DEFAULT_SETTINGS, ...saved };
    // Beta 0.2.1: четыре темы свелись к одной, а гарнитурой по умолчанию стала
    // Cascadia. Сохранённые настройки старше этого переводятся один раз —
    // иначе у всех, кто уже заходил, осталась бы тема, которой больше нет.
    // Ревизию смотрим у сохранённого, а не у слитого: умолчания уже несут 2.
    if (!(saved.uiRev >= 2)) {
      Object.assign(s, { theme: "liquid", font: "cascadia", uiRev: 2 },
                    THEMES.liquid.apply(s));
      delete s.glassBlur;
    }
    // 0.2.525: три ступени стекла сменились эко-режимом и ползунком силы.
    // «Без размытия» — это и был эко-режим, «размытие» — стекло без линзы,
    // то есть слабое. Окна выбора ступени в доке больше нет, и без перевода
    // выбранная когда-то ступень осталась бы навсегда.
    if (saved.glassFx && saved.eco === undefined) {
      if (saved.glassFx === "off") s.eco = true;
      if (saved.glassFx === "blur") s.glassLevel = 10;
    }
    delete s.glassFx;
    if (!GLASS_TINTS[s.glassTint]) s.glassTint = "clear";
    if (!["bottom", "top", "left", "right"].includes(s.dockPos)) s.dockPos = "bottom";
    if (s.dockIcons !== "icons") s.dockIcons = "both";
    s.glassLevel = glassLevel(s);
    if (!THEMES[s.theme]) s.theme = "liquid";
    if (!MATERIAL_THEMES[s.skin]) s.skin = "glass";
    if (s.lang != null && !LANGS.some((l) => l.code === s.lang)) s.lang = null;
    if (typeof s.glassIcon !== "boolean") s.glassIcon = true;
    if (!MATERIAL_ICONS[s.mdIcons]) s.mdIcons = "blue";
    if (!["liquidDark", "liquidLight", "plain", "light", "custom"].includes(s.scene)) s.scene = "liquid";
    // 0.5.50: «Тема» — светлая/тёмная, «Фон» стал обоями. Прежнюю сцену разбираем один раз.
    if (!saved.mode) {
      const sc = saved.scene;
      s.mode = sc === "light" ? "light" : "dark";
      s.wall = sc === "custom" ? "custom" : sc === "liquidDark" ? "dim" : sc === "liquid" || sc == null ? "live" : "none";
      if (s.skin !== "material") s.skin = sc === "light" || sc === "plain" ? "plain" : "glass";
    }
    if (s.mode !== "light") s.mode = "dark";
    if (!["live", "dim", "none", "custom"].includes(s.wall)) s.wall = "live";
    s.scene = sceneOf(s);
    if (!FONT_SETS[s.font]) s.font = "cascadia";
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// ============================================================
// ОФОРМЛЕНИЕ
// ============================================================
// Палитра, шрифты и функции свечения переехали в ui-kit.js: у них появился
// второй потребитель — карта мира, — а две копии палитры расходятся всегда,
// вопрос только в том, через сколько правок это заметят.
//
// Инлайн-стили здесь по-прежнему намеренно: дашборд собирается в один
// JS-бандл, а держать половину оформления в отдельном CSS, который невозможно
// перегенерировать без npm, уже один раз выходило боком.

// ============================================================
// ОПЦИОНАЛЬНЫЕ ДАТЧИКИ
// ============================================================
// На станции сейчас стоит только анемометр. Но плата — макетка, и датчики к ней
// добавляют; дашборд к этому готов заранее, по тому же правилу, по которому уже
// работают направление и батарея: показание рисуется, **только** если прошивка
// прислала соответствующий флаг присутствия. Нет флага — нет карточки, а не
// прочерк и не ноль. Ноль вместо отсутствующего датчика — худшее, что может
// сделать метеостанция: 0 °C это мороз, а не «термометра нет».
//
// Имена полей — контракт с прошивкой, менять только синхронно с .ino. Значения
// всегда в СИ и в базовых единицах: пересчёт — дело дашборда, как и со скоростью.
const OPTIONAL_SENSORS = [
  { key: "temp",     flag: "tempPresent",     value: "tempC",       label: "Температура",     unit: "°C",  digits: 1 },
  { key: "humidity", flag: "humidityPresent", value: "humidity",    label: "Влажность",       unit: "%",   digits: 0 },
  { key: "pressure", flag: "pressurePresent", value: "pressureHpa", label: "Давление",        unit: "гПа", digits: 0 },
  { key: "rain",     flag: "rainPresent",     value: "rainMm",      label: "Осадки · час",    unit: "мм",  digits: 1 },
  { key: "lux",      flag: "luxPresent",      value: "lux",         label: "Освещённость",    unit: "лк",  digits: 0 },
  { key: "uv",       flag: "uvPresent",       value: "uvIndex",     label: "УФ-индекс",       unit: "",    digits: 1 },
];

// Точка росы считается, а не измеряется — её не бывает отдельным датчиком.
// Формула Магнуса, та же, что в наставлениях ВМО: погрешность около 0.35 °C
// в диапазоне −45…+60 °C, чего для метеостанции более чем достаточно.
function dewPoint(tC, rh) {
  if (!Number.isFinite(tC) || !Number.isFinite(rh) || rh <= 0) return null;
  const a = 17.625, b = 243.04;
  const g = Math.log(Math.min(rh, 100) / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}

// Ветро-холодовой индекс по формуле Национальной службы погоды США. Она
// определена только для холода и ощутимого ветра — вне этих границ возвращает
// null, а не выдуманное число: «ощущается как» при +20 и штиле не существует.
function windChill(tC, speedMs) {
  const kmh = speedMs * 3.6;
  if (!Number.isFinite(tC) || tC > 10 || kmh < 4.8) return null;
  const v = Math.pow(kmh, 0.16);
  return 13.12 + 0.6215 * tC - 11.37 * v + 0.3965 * tC * v;
}

// Демонстрационная атмосфера. Нужна ровно затем, ради чего вообще существует
// демо-режим: без неё панель «Атмосфера» нельзя увидеть нигде — на станции этих
// датчиков нет, а модель их не отдавала.
//
// Числа связаны между собой, а не набраны случайно, и это не украшательство:
// на несогласованных данных не проверишь ни точку росы, ни «ощущается как».
//
//   * температура ходит суточной волной вокруг среднего;
//   * влажность **выводится** из температуры при почти постоянной точке росы —
//     именно так ведёт себя настоящий воздух за день: к полудню теплеет и
//     влажность падает, к ночи остывает и растёт, а влагосодержание то же;
//   * давление медленно дрейфует и **падает при усилении ветра** — падение
//     давления со шквалом связано в реальности, а не в этой функции;
//   * освещённость и УФ идут по солнцу, по реальному времени суток, поэтому
//     ночью честно ноль;
//   * осадки появляются только на сильном ветре и быстро сходят на нет.
function demoAtmosphere(t, speedMs, hour) {
  const a = 17.625, b = 243.04;

  const tempC = 16 + Math.sin(t * 0.012) * 7 + Math.sin(t * 0.11) * 0.4;
  // Точка росы почти постоянна — она задаётся воздушной массой, а не часом дня.
  const dewC = 9.5 + Math.sin(t * 0.004) * 1.5;
  const gamma = (a * dewC) / (b + dewC);
  const rh = Math.max(12, Math.min(100,
    100 * Math.exp(gamma - (a * tempC) / (b + tempC))));

  // Ветер сильнее — давление ниже. Коэффициент подобран так, чтобы за шквал
  // стрелка проседала на несколько гектопаскалей, как оно и бывает.
  const pressure = 1013 + Math.sin(t * 0.006) * 6 - Math.max(0, speedMs - 6) * 0.5;

  // Солнце: ноль ночью, максимум около часа дня.
  const sun = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const lux = Math.round(sun * sun * 92000);
  const uv = parseFloat((sun * sun * 7.2).toFixed(1));

  const rain = speedMs > 13 ? parseFloat(((speedMs - 13) * 0.35).toFixed(1)) : 0;

  return {
    tempC: parseFloat(tempC.toFixed(1)), tempPresent: true,
    humidity: Math.round(rh), humidityPresent: true,
    pressureHpa: parseFloat(pressure.toFixed(1)), pressurePresent: true,
    rainMm: rain, rainPresent: true,
    lux, luxPresent: true,
    uvIndex: uv, uvPresent: true,
  };
}

// ============================================================
// МЕЛОЧИ
// ============================================================
const DIRECTIONS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const DIR_FULL = ["Север", "Северо-Восток", "Восток", "Юго-Восток", "Юг", "Юго-Запад", "Запад", "Северо-Запад"];
// 16 румбов нужны розе ветров: 8 слишком грубо для распределения, 32 не читается.
const ROSE_16 = ["С", "ССВ", "СВ", "ВСВ", "В", "ВЮВ", "ЮВ", "ЮЮВ", "Ю", "ЮЮЗ", "ЮЗ", "ЗЮЗ", "З", "ЗСЗ", "СЗ", "ССЗ"];

function degToDir(deg) {
  const idx = Math.round(deg / 45) % 8;
  return { short: DIRECTIONS[idx], full: DIR_FULL[idx] };
}

function rssiQuality(rssi) {
  // RSSI=0 означает «клиентов нет» — прошивка в режиме точки доступа отдаёт
  // уровень подключённого клиента, а не роутера. Нулевая шкала как «отличный»
  // вводила бы в заблуждение.
  if (rssi === 0 || rssi < -95) return { label: "—", ok: false };
  if (rssi >= -55) return { label: "отличный", ok: true };
  if (rssi >= -65) return { label: "хороший", ok: true };
  if (rssi >= -75) return { label: "средний", ok: true };
  if (rssi >= -85) return { label: "слабый", ok: true };
  return { label: "плохой", ok: false };
}

// Развёртка углов: последовательность 355° → 5° рисуется как +10°, а не провал −350°.
function unwrapAngles(arr) {
  if (arr.length < 2) return arr;
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) {
    let diff = arr[i] - arr[i - 1];
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    out.push(out[i - 1] + diff);
  }
  return out;
}

// ============================================================
// АНАЛИЗ ВЕТРА
// ============================================================
// Всё, что показывают радары, считается здесь и только из того, что реально
// померила станция. Никаких внешних источников у неё нет: ни осадков, ни
// разрядов, ни доплера — поэтому и «гроза» тут не рисуется как факт, а
// оценивается по признакам, которые анемометр действительно видит.
//
// Что используется, и это не выдумка, а стандартные величины:
//   G  — коэффициент порывистости, пик / среднее. Больше 1.7 — шквалистый ветер.
//   TI — интенсивность турбулентности, σ / среднее. Ходовая величина в
//        ветроэнергетике; выше ~25 % воздух конвективно неустойчив.
//   Шквал по критерию ВМО — внезапный рост скорости не менее чем на 8 м/с,
//        с пиком не ниже 11 м/с. Именно так шквал определяется в наставлениях,
//        и именно это единственный «грозовой» признак, доступный анемометру.
//   Сдвиг — скорость разворота ветра, °/мин. Резкий разворот с усилением —
//        классическая подпись фронта или фронта порывов (gust front).
//   Вращение — устойчивый однонаправленный разворот при высокой турбулентности.
//        Это признак завихрения, а не обнаружение смерча: смерч видит доплер,
//        а не одна точка измерения, и подменять одно другим нельзя.
// Пока ряд не набран, показывать «спокойно» нельзя: это утверждение о погоде,
// а данных для него ещё нет. Отдельное состояние честнее любого из уровней.
const PENDING = {
  key: -1, name: "НАКОПЛЕНИЕ", color: DIM,
  text: "Идёт набор ряда. Оценка появится, когда наберётся несколько секунд измерений.",
};

const LEVELS = [
  { key: 0, name: "СПОКОЙНО",     color: "#94a3b8", text: "Поток ровный, признаков конвекции нет." },
  { key: 1, name: "НЕУСТОЙЧИВО",  color: "#22d3ee", text: "Заметная турбулентность — обычная дневная конвекция." },
  { key: 2, name: "ШКВАЛИСТО",    color: "#facc15", text: "Сильная порывистость или разворот ветра: возможен подход фронта." },
  { key: 3, name: "ШКВАЛ",        color: "#f97316", text: "Рост скорости отвечает критерию шквала ВМО (≥8 м/с, пик ≥11 м/с)." },
  { key: 4, name: "ОПАСНО",       color: "#ef4444", text: "Шквал с вращением или ураганной силой. Уйти с открытого места." },
];

function analyze(hist, speedMax) {
  const n = hist.length;
  if (n < 6) return null;

  const sp = hist.map((h) => h.s);
  const mean = sp.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sp.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const peak = Math.max(...sp);
  const lull = Math.min(...sp);
  // Ниже ~0.6 м/с делить не на что: АЦП там всё равно в мёртвой зоне, и любое
  // отношение к среднему улетает в бесконечность на шуме.
  const calm = mean < 0.6;
  const ti = calm ? 0 : sd / mean;
  const gf = calm ? 1 : peak / mean;

  // Шквал: максимальный рост за любые 60 секунд внутри окна. Скользящий минимум
  // считается в лоб — окно не длиннее 600 отсчётов, и пересчёт идёт раз в секунду.
  let rise = 0;
  for (let i = 1; i < n; i++) {
    let lo = Infinity;
    for (let j = Math.max(0, i - 60); j < i; j++) if (sp[j] < lo) lo = sp[j];
    if (sp[i] - lo > rise) rise = sp[i] - lo;
  }
  const squall = rise >= 8 && peak >= 11;

  // Направление: разворот считается по развёрнутым углам, иначе переход через
  // север выглядел бы как скачок на 360°.
  const dirs = hist.filter((h) => h.d != null).map((h) => h.d);
  let shift = 0, spread = 0, veerFrac = 0, veerSign = 0;
  if (dirs.length > 10) {
    const u = unwrapAngles(dirs);
    const tail = u.slice(-60);
    spread = Math.max(...tail) - Math.min(...tail);
    shift = Math.abs(tail[tail.length - 1] - tail[0]);
    let sum = 0, abs = 0;
    for (let i = 1; i < tail.length; i++) {
      const d = tail[i] - tail[i - 1];
      sum += d;
      abs += Math.abs(d);
    }
    veerFrac = abs > 0 ? Math.abs(sum) / abs : 0;
    veerSign = Math.sign(sum);
  }
  const rotation = spread >= 90 && veerFrac >= 0.7 && ti >= 0.2 && gf >= 1.5;

  let level = 0;
  if (ti >= 0.15 || gf >= 1.4) level = 1;
  if (gf >= 1.7 || shift >= 45 || peak >= 14) level = 2;
  if (squall) level = 3;
  if (squall && (rotation || peak >= 20)) level = 4;

  return {
    mean, sd, peak, lull, ti, gf, rise, squall,
    shift, spread, veerFrac, veerSign, rotation, level,
    axes: {
      gust:  clamp01((gf - 1) / 1.2),
      turb:  clamp01(ti / 0.5),
      shear: clamp01(shift / 120),
      force: clamp01(peak / Math.max(speedMax, 1)),
    },
  };
}

// Роза ветров: пять градаций скорости — так их принято рисовать в климатических
// сводках. Больше делений превращает розу в мусор, меньше — теряет смысл.
const ROSE_BANDS = [
  { min: 0.5, max: 2,  label: "0.5–2" },
  { min: 2,   max: 4,  label: "2–4" },
  { min: 4,   max: 6,  label: "4–6" },
  { min: 6,   max: 10, label: "6–10" },
  { min: 10,  max: Infinity, label: "10+" },
];
const ROSE_COLORS = ["#67e8f9", "#34d399", "#a3e635", "#facc15", "#f97316"];
const ROSE_GRAY = [
  "rgba(var(--ink, 231,238,246),0.16)", "rgba(var(--ink, 231,238,246),0.28)", "rgba(var(--ink, 231,238,246),0.42)",
  "rgba(var(--ink, 231,238,246),0.60)", "rgba(var(--ink, 231,238,246),0.85)",
];

function roseBand(speed) {
  for (let i = 0; i < ROSE_BANDS.length; i++) {
    if (speed < ROSE_BANDS[i].max) return speed < ROSE_BANDS[i].min ? -1 : i;
  }
  return ROSE_BANDS.length - 1;
}

// ============================================================
// ПЛАВНОСТЬ
// ============================================================
// Показания приходят рывками — 20 Гц с платы, раз в секунду в фолбэке, — а
// стрелка и цифры должны идти непрерывно. Экспоненциальное сглаживание к цели
// на requestAnimationFrame: цикл сам останавливается, когда значение доехало,
// поэтому в штиль страница ничего не считает и телефон не греется.
// Шаг сглаживания. В эко-режиме Dashboard ставит 33 мс: стрелка и цифры едут
// 30 раз в секунду, а не 60 — каждый шаг здесь перерисовывает прибор целиком,
// и на телефоне половина этих шагов съедала главный поток, ничего не прибавляя
// глазу.
let SMOOTH_MIN_MS = 0;

function useSmooth(target, tau = 0.22, enabled = true) {
  const [value, setValue] = useState(target);
  const cur = useRef(target);
  const last = useRef(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      cur.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    let alive = true;
    const step = (ts) => {
      if (!alive) return;
      if (SMOOTH_MIN_MS && last.current && ts - last.current < SMOOTH_MIN_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = last.current ? Math.min((ts - last.current) / 1000, 0.1) : 1 / 60;
      last.current = ts;
      const k = 1 - Math.exp(-dt / tau);
      let next = cur.current + (target - cur.current) * k;
      if (Math.abs(target - next) < 0.002) next = target;
      cur.current = next;
      setValue(next);
      if (next !== target) raf = requestAnimationFrame(step);
      else last.current = 0;
    };
    raf = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(raf); last.current = 0; };
  }, [target, tau, enabled]);

  return value;
}

// ============================================================
// БАЗОВЫЕ КОМПОНЕНТЫ
// ============================================================

function Label({ children, g, size = 9 }) {
  return (
    <div className={isCaps(children) ? "caps" : undefined} style={{
      color: DIM, fontSize: size, letterSpacing: 2.4, textTransform: "uppercase",
      textShadow: glow(g, 0.35), fontFamily: SANS, fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

// Единственный «ящик» интерфейса. У приборной панели у каждого блока есть шапка
// с названием и служебной пометкой справа — она же отбивает блок линейкой,
// поэтому лишних рамок и заливок внутри не нужно.
function Panel({ title, meta, children, style, g, delay = 0, bodyStyle }) {
  return (
    <section
      className="pnl"
      style={{
        // Вид панели идёт через переменные, а не константами. Причина
        // механическая: инлайновый стиль сильнее любого правила, и тема,
        // которая хочет сделать панель стеклянной или матовой, до неё иначе
        // просто не дотянется. Значения по умолчанию — прежние, они собраны
        // на :root; заливка из кастомизации входит в --pnl-bg вторым слоем.
        border: "1px solid var(--pnl-line)",
        borderRadius: "var(--pnl-corner)",
        background: "var(--pnl-bg)",
        boxShadow: "var(--pnl-shadow)",
        backdropFilter: "var(--pnl-blur)",
        WebkitBackdropFilter: "var(--pnl-blur)",
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {title && (
        <header style={{
          // Шапка и пометка — как у карточек «Района» (Glass в wind-area.jsx):
          // название чуть крупнее, пометка в виде чипа-таблетки.
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "10px 14px 9px", borderBottom: "1px solid var(--pnl-head-line)",
        }}>
          <span style={{ fontFamily: SANS, fontSize: 9.5, letterSpacing: 2.4, textTransform: "uppercase",
                         color: DIM, textShadow: glow(g, 0.4) }}>{title}</span>
          {meta && <span className={isCaps(meta) ? "ar-chip caps" : "ar-chip"}>{meta}</span>}
        </header>
      )}
      <div style={{ padding: 14, ...bodyStyle }}>{children}</div>
    </section>
  );
}

function Stat({ label, value, unit, g, color, action, big }) {
  return (
    // Плитка сводки — тот же материал, что и панель, поэтому и переменные те
    // же. Без этого «Порыв», «Средняя» и «Аптайм» остались бы прямоугольными
    // и непрозрачными посреди стеклянных панелей.
    <div className="stat" style={{
      border: "1px solid var(--pnl-line)", borderRadius: "var(--pnl-corner)",
      background: "var(--stat-bg, rgba(255,255,255,0.014))",
      boxShadow: "var(--stat-shadow, none)",
      backdropFilter: "var(--pnl-blur)", WebkitBackdropFilter: "var(--pnl-blur)",
      padding: "12px 14px 13px", position: "relative", flex: 1, minWidth: 88,
      display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10,
    }}>
      <Label g={g} size={8}>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{
          ...NUM, color: color || TEXT, fontSize: big ? 32 : 28, fontWeight: 700, letterSpacing: -0.5,
          textShadow: color ? glowColor(color, g, 0.6) : glow(g, 0.8),
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ ...NUM, color: DIM, fontSize: 10, textShadow: glow(g, 0.3) }}>{unit}</span>
        )}
      </div>
      {action}
    </div>
  );
}

// Строка «ключ — значение» с отточием между ними: так набирают таблицы в
// бумажных сводках, и взгляд не теряет строку на широком экране.
function Row({ k, v, g, mono = true }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
      <span style={{ color: DIM, fontFamily: SANS, fontSize: 11, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${FAINT}`, transform: "translateY(-3px)" }} />
      <span style={{
        ...(mono ? NUM : { fontFamily: SANS }), color: TEXT, fontSize: 11,
        textShadow: glow(g, 0.4), textAlign: "right", wordBreak: "break-all",
      }}>
        {v}
      </span>
    </div>
  );
}

// Совместимость со старой прошивкой — МЕХАНИЧЕСКИ, а не «по вниманию автора».
// Правило одно и проверяется здесь: поля нет в кадре → строки нет; поле есть,
// но пустое → честное «нет данных». Нужно потому, что новые поля появляются в
// прошивке не мгновенно и не на всех станциях сразу, а строка «PPP: —» под
// сборкой без модема врёт ровно так же, как 0 °C вместо отсутствующего
// термометра.
//
// ⚠️ `in` отвечает true и на ключ, который дашборд положил в начальное
// состояние сам (hostname, uptime, resetReason, wifiRssi) — то есть ДО первого
// кадра. Поэтому панели, собранные из RowMaybe, показываются только когда
// кадр уже был: см. `frameSeen` на вкладке «Станция».
function RowMaybe({ k, src, f, g, mono = true, fmt }) {
  if (!src || !(f in src)) return null;
  const raw = src[f];
  const empty = raw == null || raw === "";
  return <Row k={k} v={empty ? "нет данных" : fmt ? fmt(raw) : String(raw)} g={g} mono={mono} />;
}

// Значки вкладок: на широком экране скрыты, на телефоне вкладки — крупные значки
// с короткой подписью (см. @media (max-width: 560px)).
const TAB_ORDER = ["wind", "meteo", "radar", "area", "analysis", "system"];
const TAB_ICONS = {
  // Значки — те же линии, что и раньше, но с одной-двумя деталями, которые
  // делают предмет узнаваемым: засечки термометра, цель на радаре, тень под
  // меткой. Больше нельзя: на 20 точках каждая лишняя линия сливается.
  wind: <><path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h16a3 3 0 1 1-3 3" /><path d="M3 16h8" /><path d="M6 20h6a2 2 0 1 0-1.6-3.2" /></>,
  meteo: <><path d="M10 14.8V5a2.5 2.5 0 0 1 5 0v9.8a4 4 0 1 1-5 0z" /><circle cx="12.5" cy="17" r="1.3" fill="currentColor" /><path d="M12.5 9v6.5" /><path d="M18 6h2.5M18 9h2.5M18 12h2.5" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12 18.5 5.5" /><path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2" /><circle cx="15.8" cy="15.6" r="1.1" fill="currentColor" /></>,
  area: <><path d="M12 19.5s-6.5-5-6.5-9.8a6.5 6.5 0 0 1 13 0c0 4.8-6.5 9.8-6.5 9.8z" /><circle cx="12" cy="9.7" r="2.4" /><path d="M7 21.8c1.4.5 3 .7 5 .7s3.6-.2 5-.7" /></>,
  analysis: <><rect x="4.5" y="12" width="3.4" height="7" rx=".9" /><rect x="10.3" y="5" width="3.4" height="14" rx=".9" /><rect x="16.1" y="9" width="3.4" height="10" rx=".9" /><path d="M3 21.5h18" /></>,
  system: <><rect x="6" y="6" width="12" height="12" rx="2.2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><circle cx="12" cy="12" r=".7" fill="currentColor" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
};

// Живой фон под стеклом — холст, который рисует mountWall() (wind-themes.js).
// fps 0 — один кадр и тишина: эко-режим и «без движения».
function LiquidWall({ dark, light, fps }) {
  const ref = useRef(null);
  useEffect(() => mountWall(ref.current, { dark, light, fps }), [dark, light, fps]);
  // Параллакс: фон чуть крупнее экрана и при прокрутке уходит вверх медленнее
  // страницы — стекло кажется висящим над ним. Только при прокрутке: панели
  // и так перерисовывают иней на каждом её кадре, а сдвиг фона от мыши
  // заставил бы их делать это и в покое. Догоняет с инерцией, без рывков.
  useEffect(() => {
    const el = ref.current;
    if (!el || !fps || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0, cur = 0;
    const tick = () => {
      raf = 0;
      const want = -Math.min(window.scrollY * 0.06, 40);
      cur += (want - cur) * 0.1;
      if (Math.abs(want - cur) < 0.15) cur = want; else raf = requestAnimationFrame(tick);
      el.style.transform = `translate3d(0, ${cur.toFixed(1)}px, 0) scale(1.1)`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); el.style.transform = ""; };
  }, [fps]);
  return <canvas ref={ref} className="lg-wall" aria-hidden="true" />;
}

// Сила стекла — ползунок, как в iOS 27. Пока его тянут, значение идёт прямо
// в CSS-переменную корня: перерисовка всего дашборда и пересборка линз на
// каждом шаге ползунка превратили бы перетаскивание в слайд-шоу. В настройки
// оно попадает, когда рука остановилась.
function GlassLevel({ value, onCommit, g, eco }) {
  const [v, setV] = useState(value);
  const pend = useRef(null);
  const timer = useRef(0);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => { if (pend.current == null) setV(value); }, [value]);
  // Закрыли настройки посреди движения — значение не теряется.
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pend.current != null) commit.current(pend.current);
  }, []);
  const move = (n) => {
    setV(n);
    pend.current = n;
    document.querySelector(".app")?.style.setProperty("--lg-k", String(n / 100));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { const p = pend.current; pend.current = null; if (p != null) commit.current(p); }, 280);
  };
  const word = v < 15 ? "иней" : v < 45 ? "мягкое" : v < 80 ? "жидкое" : "прозрачное";
  return (
    <div style={{ marginBottom: 18 }}
         title="Слева — молочное стекло: больше инея, плотнее тонировка, текст читается на любом фоне. Справа — прозрачная линза: меньше инея, ярче фаска, сильнее преломление у края.">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <Label g={g}>Сила стекла</Label>
        <span style={{ fontFamily: MONO, fontSize: 10, color: DIM, letterSpacing: 0.6 }}>{word} · {v}</span>
      </div>
      {/* Цвет постоянный, а не цвет ветра: в штиль акцент почти белый, и
          заливка сливалась бы с дорожкой. */}
      <LiquidRange className="lg-range" min={0} max={100} step={1} value={v} color="#5cc8ff"
                   aria-label="Сила стекла" onChange={(e) => move(Number(e.target.value))} />
      {eco && (
        <div style={{ fontFamily: SANS, fontSize: 10.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
          В эко-режиме ползунок меняет только плотность тонировки: инея и линзы нет.
        </div>
      )}
    </div>
  );
}

// Капля выбора (Liquid Glass, iOS 26): подсветка активной вкладки не появляется
// на новом месте, а перетекает туда с прежнего — по дороге вытягивается и
// становится ниже, как капля, которую тянут по стеклу. Прежняя кнопка ещё в
// дереве и на своём месте, поэтому обе рамки меряются в один момент, и
// перелёт верен при любой прокрутке и ширине окна. Анимация — один transform,
// без единой перерисовки.
let tabMarkFrom = null;

function Tab({ id, active, onClick, children, g, short, fluid }) {
  const on = id === active;
  const markRef = useRef(null);
  useLayoutEffect(() => {
    if (!on) return;
    const el = markRef.current;
    const btn = el && el.parentElement;
    if (!btn) return;
    const prev = tabMarkFrom;
    tabMarkFrom = btn;
    if (!fluid || !prev || prev === btn || !prev.isConnected || !el.animate) return;
    const a = prev.getBoundingClientRect(), b = btn.getBoundingClientRect();
    if (!b.width || !b.height) return;
    // Пульт управления бывает и вертикальным (по бокам экрана): тогда капля
    // перетекает сверху вниз, а не слева направо.
    const vert = Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) >= 2;
    if (!vert && Math.abs(a.top - b.top) > b.height) return;
    const at = (l, t, w, h) => `translate(${l - b.left}px, ${t - b.top}px) scale(${w / b.width}, ${h / b.height})`;
    let mid, land;
    if (vert) {
      // Середина пути: капля накрывает обе вкладки наполовину и сужается.
      const mh = (a.height + b.height) / 2 + Math.abs(a.top - b.top) * 0.42;
      const mt = (a.top + b.top) / 2 + (a.height + b.height) / 4 - mh / 2;
      const mw = b.width * 0.84;
      mid = at(b.left + (b.width - mw) / 2, mt, mw, mh);
      land = at(b.left, b.top - b.height * 0.03, b.width * 0.98, b.height * 1.06);
    } else {
      // Середина пути: капля накрывает обе вкладки наполовину и сплющивается.
      const mw = (a.width + b.width) / 2 + Math.abs(a.left - b.left) * 0.42;
      const ml = (a.left + b.left) / 2 + (a.width + b.width) / 4 - mw / 2;
      const mh = b.height * 0.84;
      mid = at(ml, b.top + (b.height - mh) / 2, mw, mh);
      land = at(b.left - b.width * 0.03, b.top, b.width * 1.06, b.height * 0.98);
    }
    // В пути капля чуть размыта — как стекло, которое тянут быстро. В эко-режиме без этого.
    const mb = document.querySelector(".app.eco") ? 0 : 1;
    el.animate([
      { transform: at(a.left, a.top, a.width, a.height), filter: "blur(0px)" },
      { transform: mid, filter: `blur(${1.6 * mb}px)`, offset: 0.42 },
      { transform: land, filter: "blur(0px)", offset: 0.78 },
      { transform: "none", filter: "blur(0px)" },
    ], { duration: 980, easing: "cubic-bezier(.33,.86,.3,1)" });
  }, [on, fluid]);
  return (
    <button
      data-tab={id}
      className={on ? "tab-on" : undefined}
      onClick={() => onClick(id)}
      aria-label={children} title={children}
      style={{
        position: "relative", background: "transparent", border: "none",
        borderBottom: "2px solid transparent",
        color: on ? TEXT : DIM,
        textShadow: on ? glow(g, 0.8) : "none",
        fontFamily: SANS, fontWeight: 600, fontSize: 10.5, letterSpacing: 2.4,
        textTransform: "uppercase", padding: "9px 2px", marginRight: 20,
        cursor: "pointer", transition: "color .54s ease, text-shadow .54s ease",
      }}
    >
      <svg className="tab-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TAB_ICONS[id]}</svg>
      <span className="tab-lb"><span className="lb-full">{children}</span>{short && <span className="lb-short">{short}</span>}</span>
      {/* Подчёркивание — отдельный узел, а не рамка кнопки: рамку нельзя
          раскрыть от середины, а именно это движение и показывает, что
          переключились сюда, а не просто перекрасили надпись. Key заставляет
          React создать его заново, иначе анимация проиграется лишь однажды. */}
      {on && (
        <span key={id} ref={markRef} className="tab-mark" style={{
          position: "absolute", left: 0, right: 0, bottom: -2, height: 2, background: TEXT,
        }} />
      )}
    </button>
  );
}

// Подвкладка внутри «радара». Отличается от основной сознательно: та отбивается
// линией снизу и капителью, эта — заливкой, иначе два ряда одинаковых вкладок
// читаются как один сломанный.
// Кадр «ничего не пришло»: с ним дашборд стартует и к нему же возвращается при
// смене источника (см. эффект рядом с frameRef).
const EMPTY_DATA = {
  speed: 0, direction: null, gust: 0, dirPresent: false, speedMax: 30,
  ledGreen: "off", ledYellow: "off", ledRed: "off", ledWifi: "off", ledAuto: true,
  battery: null, batteryPercent: null, batteryPresent: false, chargeState: "absent",
  powerSource: null, wifiRssi: 0, adcError: false, hostname: "", uptime: 0,
  resetReason: "poweron",
};

function SubTab({ id, active, onClick, children, g }) {
  const on = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        background: on ? "rgba(var(--ink, 231,238,246),0.08)" : "transparent",
        border: `1px solid ${on ? LINE_HI : "transparent"}`,
        borderBottom: on ? `1px solid ${BG}` : "1px solid transparent",
        marginBottom: -1,
        color: on ? TEXT : DIM,
        textShadow: on ? glow(g, 0.6) : "none",
        fontFamily: SANS, fontWeight: 600, fontSize: 9.5, letterSpacing: 1.8,
        textTransform: "uppercase", padding: "7px 11px",
        cursor: "pointer", transition: "color .27s ease, background .27s ease, border-color .27s ease",
      }}
    >
      {children}
    </button>
  );
}

// Четыре прибора, считающие один и тот же ветер, разъехались по четырём
// вкладкам — и переключаться между ними приходилось, чтобы сложить в голове
// одну картину. Теперь они лежат вместе: конвективный профиль, круговой обзор,
// роза и Бофорт — это разные срезы одного измерения, а не разные приборы.
// Отдельными остались карта мира и эфир: там не наш ветер, а чужие данные.
const RADAR_VIEWS = [
  { id: "conv", label: "Профиль" },
  { id: "map",  label: "Карта мира" },
  { id: "live", label: "Эфир" },
];
const RADAR_OPTS = RADAR_VIEWS.map((v) => ({ value: v.id, label: v.label }));

// Заголовок раздела настроек: «Система», «Тема», «Пульт»… Под ним — блоки, что к нему
// относятся; над ним — тонкая черта (у первого раздела её нет).
function SetSection({ title, first }) {
  return (
    <div className="set-sec" style={{ margin: first ? "0 0 14px" : "26px 0 14px", paddingTop: first ? 0 : 16,
                                       borderTop: first ? "none" : "1px solid rgba(var(--rule, 160,180,200),0.18)" }}>
      <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: 2.2, textTransform: "uppercase", color: TEXT }}>{title}</span>
    </div>
  );
}

function Choice({ label, value, options, onChange, g, hint }) {
  // Стеклянный сегмент с перетекающей каплей (wind-switch.jsx).
  return (
    <div style={{ marginBottom: 18 }} title={typeof hint === "string" ? hint : undefined}>
      <Label g={g}>{label}</Label>
      <Segments value={value} options={options} onChange={onChange} ariaLabel={typeof label === "string" ? label : undefined} />
    </div>
  );
}

// Модальное окно вырастает из кнопки, которой его открыли, и уходит в неё
// обратно (wind-morph.js). Окна, открывшиеся сами (приветствие при первом
// запуске), кнопки не имеют и проявляются по-старому.
// Окно выбора языка. Строки въезжают по очереди (--i — номер строки), выбранная
// отмечена точкой тона темы. Названия языков — на самих языках и переводчику
// не отдаются (translate="no"): «Deutsch» должен оставаться «Deutsch» везде.
function LangPicker({ value, onPick, onClose, g }) {
  const sys = langInfo(systemLang());
  const rows = [{ code: null, name: "Как в системе", sub: sys.name, own: true },
                ...LANGS.map((l) => ({ code: l.code, name: l.name, sub: l.en }))];
  return (
    <Modal onClose={onClose} g={g}>
      <div className="lang-head">
        <span>Выберите язык</span>
        <button type="button" className="set-x" onClick={onClose} aria-label="Закрыть">✕</button>
      </div>
      <div className="lang-list" role="listbox" aria-label="Язык интерфейса">
        {rows.map((r, i) => {
          const on = (value ?? null) === r.code;
          return (
            <button key={r.code || "sys"} type="button" role="option" aria-selected={on}
                    className={"lang-row" + (on ? " on" : "")} style={{ "--i": i }} onClick={() => onPick(r.code)}>
              <b translate={r.own ? undefined : "no"}>{r.name}</b>
              <small translate="no">{r.sub}</small>
              <i className="lang-ck" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="lang-note">Языки, которых нет в списке, появятся в следующих обновлениях. Длинные справочные тексты пока частично на русском.</div>
    </Modal>
  );
}

const LANG_CSS = `
  .lang-cur { margin-top: 7px; font-size: 10.5px; color: rgba(var(--ink, 231,238,246),0.46); line-height: 1.5 }
  .lang-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px;
    font-size: 15px; font-weight: 600 }
  .lang-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px }
  .lang-row { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
    padding: 11px 36px 11px 14px !important; border-radius: 18px !important; cursor: pointer; color: inherit;
    background: rgba(var(--ink, 231,238,246),0.05) !important; border: 1px solid rgba(var(--rule, 160,180,200),0.18) !important;
    animation: langIn .62s var(--ease-spring, cubic-bezier(.2,1.3,.4,1)) both; animation-delay: calc(var(--i) * 28ms);
    transition: background .3s ease, border-color .3s ease, transform .5s var(--ease-spring, ease) }
  .lang-row b { font-size: 13.5px; font-weight: 600 }
  .lang-row small { font-size: 10.5px; opacity: .55 }
  .lang-row:hover { background: rgba(var(--ink, 231,238,246),0.10) !important }
  .lang-row.on { background: color-mix(in srgb, var(--sw-accent, #67e8f9) 20%, transparent) !important;
    border-color: color-mix(in srgb, var(--sw-accent, #67e8f9) 60%, transparent) !important }
  .lang-ck { position: absolute; right: 12px; top: 50%; width: 16px; height: 16px; margin-top: -8px; border-radius: 50%;
    background: var(--sw-accent, #67e8f9); transform: scale(0); opacity: 0;
    transition: transform .55s var(--ease-spring, ease), opacity .3s ease }
  .lang-row.on .lang-ck { transform: scale(1); opacity: 1 }
  .lang-note { margin-top: 14px; font-size: 10.5px; line-height: 1.5; color: rgba(var(--ink, 231,238,246),0.46) }
  @keyframes langIn { from { opacity: 0; transform: translateY(10px) scale(.96) } to { opacity: 1; transform: none } }
  .mo-off .lang-row { animation: none }
  .app.sk-material .lang-row { background: var(--md-c-high) !important; border-color: transparent !important; border-radius: 16px !important }
  .app.sk-material .lang-row.on { background: var(--md-sc) !important; color: var(--md-on-sc) !important }
  .app.sk-material .lang-ck { background: var(--md-primary) }
`;

function Modal({ children, onClose, g }) {
  const bgRef = useRef(null);
  const cardRef = useRef(null);
  useMorph(cardRef, { wrapRef: bgRef, sel: ".modal-card" });
  return (
    <div
      ref={bgRef}
      onClick={onClose}
      className="modal-bg"
      style={{
        position: "fixed", inset: 0, background: "rgba(2,4,7,0.88)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 100,
      }}
    >
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        style={{
          background: BG, border: `1px solid ${LINE_HI}`,
          boxShadow: g === "off" ? "none" : "0 0 40px rgba(160,190,220,0.08)",
          width: "min(480px, 100%)", maxHeight: "88vh", overflowY: "auto",
          padding: "22px 24px", fontFamily: SANS,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Всплывающее окошко у кнопки (версия, Claude): вырастает из неё и в неё же
// уходит. Закрывается мгновенным удалением из дерева — уход доигрывает копия.
function MorphPop({ className, anchor, children, owner }) {
  const ref = useRef(null);
  useMorph(ref, { anchor });
  return <span ref={ref} className={className} data-morph-owner={owner}>{children}</span>;
}

// Бульбашка «Сделано с помощью Claude» (с 0.5.6) — не окно, а часть значка:
// значок приседает и «плавится», из-под него стекает капля на жидкой перемычке
// и раздувается в бульбашку с надписью. Закрытие — капля втягивается обратно,
// и значок её «глотает». Фазы in/out живут здесь, а классы приседания (cl-melt /
// cl-slurp) ставятся прямо на значок — перерисовывать ради них шапку незачем.
function ClaudeDrop({ open, chipRef }) {
  const [phase, setPhase] = useState(null);
  useLayoutEffect(() => {
    const chip = chipRef.current;
    const restart = (add, drop) => {
      if (!chip) return;
      chip.classList.remove(add, drop);
      void chip.offsetWidth;
      chip.classList.add(add);
    };
    if (open) { setPhase("in"); restart("cl-melt", "cl-slurp"); return undefined; }
    if (chip?.classList.contains("cl-melt")) restart("cl-slurp", "cl-melt");
    setPhase((p) => (p ? "out" : null));
    const t = setTimeout(() => setPhase((p) => (p === "out" ? null : p)), 620);
    return () => clearTimeout(t);
  }, [open, chipRef]);
  if (!phase) return null;
  return (
    <span className={`cl-drop cl-${phase}`} role="status">
      <i className="cl-bridge" aria-hidden="true" />
      <span className="cl-bub">
        <i className="cl-bub-sheen" aria-hidden="true" />
        <span className="cl-bub-t">Сделано с помощью Claude</span>
      </span>
    </span>
  );
}

// Подпись, набранная капителью в исходнике («НАЙТИ РЯДОМ»). Тема «Тональная»
// пишет такие обычным предложением — классом, без правки строк.
// Признак — первое слово из двух и больше букв целиком прописное: так ловятся
// и «ПРЕДЕЛ 30 м/с», где единица набрана строчными.
const isCaps = (c) => {
  if (typeof c !== "string") return false;
  // Латинские сокращения (NWS, NOAA, GOES) CSS не отличит от слова капителью
  // и уронил бы в строчные — такую подпись оставляем как есть.
  if (/[A-Z]{2,}/.test(c)) return false;
  const w = c.match(/[А-Яа-яЁё]{2,}/);
  return !!w && w[0] === w[0].toUpperCase();
};

function Btn({ children, onClick, primary, disabled, g, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={(primary ? "btn-pri" : "btn") + (isCaps(children) ? " caps" : "")}
      style={{
        background: primary ? "rgba(var(--ink, 231,238,246),0.12)" : "transparent",
        border: `1px solid ${primary ? "rgba(var(--ink, 231,238,246),0.75)" : LINE}`,
        color: disabled ? DIM : TEXT,
        textShadow: disabled ? "none" : glow(g, primary ? 0.8 : 0.4),
        fontFamily: SANS, fontSize: 11, letterSpacing: 1, fontWeight: 500,
        padding: "9px 14px", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "all .24s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// ПРИБОРЫ
// ============================================================

// Набор компонентов для модулей вкладок. Один объект на весь сеанс: созданный
// внутри дашборда, он был бы новым на каждом кадре потока и снимал бы memo
// со всего, что его получает.
const UI = { Panel, Row, Btn, SubTab, Label, Segments };

function Sparkline({ data, g, height = 54, accent }) {
  // График тянется на всю оставшуюся высоту блока, а параметр height остаётся
  // нижней границей: вне блока (в модальных окнах, на радаре) растягиваться
  // не от чего, и без неё рисунок схлопнулся бы в линию.
  const FILL = { flex: "1 1 auto", minHeight: height, width: "100%" };
  if (data.length < 2) {
    return (
      <div style={{ ...FILL, display: "flex", alignItems: "center", color: DIM, fontSize: 10, fontFamily: SANS }}>
        сбор данных…
      </div>
    );
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 200, h = height;
  const xy = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / range) * (h - 5) - 2.5,
  ]);
  const points = xy.map((p) => `${p[0]},${p[1]}`).join(" ");
  const head = xy[xy.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ ...FILL, display: "block" }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke={LINE} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      ))}
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="rgba(var(--ink, 231,238,246),0.06)" />
      <polyline points={points} fill="none" stroke={TEXT} strokeWidth="1.2"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round"
                style={{ filter: dropGlow("rgba(var(--ink, 231,238,246),0.8)", g, 0.8) }} />
      <circle cx={head[0]} cy={head[1]} r="2" fill={accent} vectorEffect="non-scaling-stroke"
              style={{ filter: dropGlow(accent, g, 1) }} />
    </svg>
  );
}

// ---------------- РАДАР 1: КРУГОВОЙ ОБЗОР ----------------
// Экран кругового обзора: азимут по кругу, скорость — по дальности от центра.
// Каждая точка истории становится эхо-отметкой, свежие ярче старых — именно так
// выглядит послесвечение на настоящем индикаторе. Развёртка вращается сама,
// данных она не создаёт: это метка времени, а не источник.
function PPIScope({ hist, direction, speed, gust, speedMax, unit, accent, g, motion }) {
  const u = UNITS[unit] ?? UNITS.ms;
  const R = 84;
  const rings = [0.25, 0.5, 0.75, 1];
  const gid = "ppisweep";

  // Кадры приходят двадцать раз в секунду, а история пополняется раз в секунду.
  // Готовые элементы отметок кэшируются, чтобы React не пересобирал под две сотни
  // кружков на каждом кадре: одинаковая ссылка на элемент — и поддерево целиком
  // пропускается при сверке.
  const echoNodes = useMemo(() => {
    const echoes = hist.filter((h) => h.d != null).slice(-180);
    const n = echoes.length;
    return echoes.map((h, i) => {
      const age = n > 1 ? i / (n - 1) : 1;
      const p = polar(100, 100, R * clamp01(h.s / speedMax), h.d);
      return (
        <circle key={i} cx={p.x} cy={p.y} r={0.9 + 1.5 * age * age}
                fill={accent} opacity={0.08 + 0.55 * age * age * age} />
      );
    });
  }, [hist, speedMax, accent]);

  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 320, display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse"
                        x1={polar(100, 100, R, -58).x} y1={polar(100, 100, R, -58).y}
                        x2={polar(100, 100, R, 0).x}   y2={polar(100, 100, R, 0).y}>
          <stop offset="0%"   stopColor={accent} stopOpacity="0" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.30" />
        </linearGradient>
        <radialGradient id="ppibg">
          <stop offset="0%" stopColor="rgba(var(--ink, 231,238,246),0.05)" />
          <stop offset="100%" stopColor="rgba(var(--ink, 231,238,246),0)" />
        </radialGradient>
      </defs>

      <circle cx="100" cy="100" r={R} fill="url(#ppibg)" />

      {rings.map((f) => (
        <circle key={f} cx="100" cy="100" r={R * f} fill="none" stroke={LINE}
                strokeWidth="0.7" strokeDasharray={f === 1 ? undefined : "2 4"} />
      ))}

      {/* Азимутальная сетка через 30°, подписи только по сторонам света */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = i * 30;
        const p1 = polar(100, 100, 8, a), p2 = polar(100, 100, R, a);
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={LINE} strokeWidth="0.5" />;
      })}
      {["С", "В", "Ю", "З"].map((lbl, i) => {
        const p = polar(100, 100, R + 10, i * 90);
        return (
          <text key={lbl} x={p.x} y={p.y + 3.5} textAnchor="middle" fill={DIM}
                fontSize="9" fontFamily={SANS} fontWeight="600">{lbl}</text>
        );
      })}

      {/* Подписи дальности — в выбранных единицах, иначе кольца ничего не значат */}
      {rings.map((f) => (
        <text key={`r${f}`} x={100 + R * f * 0.72} y={100 - R * f * 0.72 + 3}
              textAnchor="middle" fill={FAINT} fontSize="6.5" fontFamily={MONO}>
          {u.factor === null ? beaufort(speedMax * f).scale : (speedMax * f * u.factor).toFixed(0)}
        </text>
      ))}

      {/* Развёртка */}
      <g className={motion === "off" ? undefined : `ppi-sweep ${motion === "calm" ? "slow" : ""}`}
         style={{ transformOrigin: "100px 100px", transformBox: "view-box" }}>
        <path d={`M 100 100 L ${polar(100, 100, R, -58).x} ${polar(100, 100, R, -58).y} ` +
                 `A ${R} ${R} 0 0 1 ${polar(100, 100, R, 0).x} ${polar(100, 100, R, 0).y} Z`}
              fill={`url(#${gid})`} />
        <line x1="100" y1="100" x2="100" y2={100 - R} stroke={accent} strokeWidth="1" opacity="0.7"
              style={{ filter: dropGlow(accent, g, 0.9) }} />
      </g>

      {/* Эхо-отметки: чем свежее, тем ярче и крупнее */}
      {echoNodes}

      {/* Текущая отметка с пингом */}
      {direction != null && (() => {
        const p = polar(100, 100, R * clamp01(speed / speedMax), direction);
        const pg = polar(100, 100, R * clamp01(gust / speedMax), direction);
        return (
          <g>
            {gust > speed + 0.3 && (
              <g>
                <line x1={p.x} y1={p.y} x2={pg.x} y2={pg.y} stroke={TEXT} strokeWidth="0.7" opacity="0.35" />
                <circle cx={pg.x} cy={pg.y} r="1.6" fill="none" stroke={TEXT} strokeWidth="0.8" opacity="0.55" />
              </g>
            )}
            {/* r задан и атрибутом: если браузер не умеет анимировать геометрию
                через CSS, кольцо просто останется статичным, а не исчезнет. */}
            {motion !== "off" && (
              <circle className="ping" cx={p.x} cy={p.y} r="3" fill="none" stroke={accent} strokeWidth="0.9" opacity="0.5" />
            )}
            <circle cx={p.x} cy={p.y} r="3" fill={accent} style={{ filter: dropGlow(accent, g, 1.3) }} />
          </g>
        );
      })()}

      <circle cx="100" cy="100" r="1.6" fill={DIM} />
    </svg>
  );
}

// ---------------- РАДАР 2: КОНВЕКТИВНЫЙ ПРОФИЛЬ ----------------
// Четыре оси — четыре независимых признака неустойчивости потока. Многоугольник
// показывает, чем именно опасен ветер прямо сейчас: вытянут вверх — рвёт
// порывами, вправо — разворачивается, и так далее. Форма меняется плавно,
// поэтому подход шквала видно как движение, а не как скачок числа.
function ConvectiveScope({ analysis, accent, g, motion }) {
  const smooth = motion !== "off";
  const AX = [
    { key: "gust",  label: "ПОРЫВ" },
    { key: "shear", label: "СДВИГ" },
    { key: "turb",  label: "ТУРБ" },
    { key: "force", label: "СИЛА" },
  ];
  const a0 = useSmooth(analysis ? analysis.axes.gust : 0, 0.45, smooth);
  const a1 = useSmooth(analysis ? analysis.axes.shear : 0, 0.45, smooth);
  const a2 = useSmooth(analysis ? analysis.axes.turb : 0, 0.45, smooth);
  const a3 = useSmooth(analysis ? analysis.axes.force : 0, 0.45, smooth);
  const vals = [a0, a1, a2, a3];
  const R = 62;

  const pts = vals.map((v, i) => {
    const p = polar(100, 100, R * Math.max(v, 0.02), i * 90);
    return `${p.x},${p.y}`;
  }).join(" ");

  const lvl = analysis ? LEVELS[analysis.level] : PENDING;

  const color = lvl.key <= 0 ? accent : lvl.color;

  return (
    <svg viewBox="0 0 200 172" width="100%" style={{ maxWidth: 320, display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f}
          points={[0, 1, 2, 3].map((i) => {
            const p = polar(100, 100, R * f, i * 90);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none" stroke={LINE} strokeWidth="0.6" strokeDasharray={f === 1 ? undefined : "2 4"} />
      ))}
      {[0, 1, 2, 3].map((i) => {
        const p = polar(100, 100, R, i * 90);
        return <line key={i} x1="100" y1="100" x2={p.x} y2={p.y} stroke={LINE} strokeWidth="0.5" />;
      })}

      <polygon points={pts} fill={color} fillOpacity="0.16" stroke={color} strokeWidth="1.4"
               strokeLinejoin="round" style={{ filter: dropGlow(color, g, 1.1) }} />
      {vals.map((v, i) => {
        const p = polar(100, 100, R * Math.max(v, 0.02), i * 90);
        return <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />;
      })}

      {AX.map((ax, i) => {
        const p = polar(100, 100, R + 15, i * 90);
        return (
          <text key={ax.key} x={p.x} y={p.y + 3} textAnchor="middle" fill={DIM}
                fontSize="8" fontFamily={SANS} fontWeight="600" letterSpacing="1">
            {ax.label}
          </text>
        );
      })}

      {/* Знак вращения появляется только когда признаки вращения реально есть */}
      {analysis && analysis.rotation && (
        <g className={motion === "off" ? undefined : "vortex"}
           style={{ transformOrigin: "100px 100px", transformBox: "view-box" }}>
          <path d="M 100 82 A 18 18 0 1 1 82 100" fill="none" stroke={lvl.color} strokeWidth="1.4" opacity="0.9"
                style={{ filter: dropGlow(lvl.color, g, 1.2) }} />
          <path d="M 100 90 A 10 10 0 1 0 110 100" fill="none" stroke={lvl.color} strokeWidth="1.2" opacity="0.6" />
        </g>
      )}

      <text x="100" y="163" textAnchor="middle" fill={lvl.color} fontSize="12" fontWeight="700"
            fontFamily={SANS} letterSpacing="3"
            style={{ filter: dropGlow(lvl.color, g, 1) }}>
        {lvl.name}
      </text>
    </svg>
  );
}

// ---------------- РАДАР 3: РОЗА ВЕТРОВ ----------------
// Накопительная роза за сеанс: сколько времени ветер дул с каждого румба и с
// какой силой. Классический климатический прибор — и единственный здесь, который
// говорит не о текущей секунде, а о том, откуда вообще дует в этом месте.
function WindRose({ rose, g, mono, motion }) {
  const R = 78;
  const total = rose.total || 1;
  const maxSector = Math.max(1, ...rose.sectors.map((s) => s.reduce((a, b) => a + b, 0)));
  const colors = mono ? ROSE_GRAY : ROSE_COLORS;
  // Шкала строится по самому нагруженному румбу, иначе при равномерном ветре
  // роза схлопывается в точку и ничего не показывает.
  const scale = R / (maxSector / total);

  // Восемь десятков секторов пересобираются раз в секунду вместе с розой, а не
  // на каждом кадре потока.
  const petals = useMemo(() => rose.sectors.map((bands, si) => {
    const a = si * 22.5;
    let r0 = 0;
    return bands.map((count, bi) => {
      if (!count) return null;
      const r1 = r0 + (count / total) * scale;
      const d = wedgePath(100, 100, r0, r1, a - 9.5, a + 9.5);
      r0 = r1;
      return <path key={`${si}-${bi}`} d={d} fill={colors[bi]} strokeWidth="0.4" style={{ stroke: BG_VAR }} />;
    });
  }), [rose.sectors, total, scale, colors]);

  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 320, display: "block", margin: "0 auto" }}
         className={motion === "off" ? undefined : "grow"}>
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx="100" cy="100" r={R * f} fill="none" stroke={LINE}
                strokeWidth="0.6" strokeDasharray={f === 1 ? undefined : "2 4"} />
      ))}

      {petals}

      {[0, 4, 8, 12].map((i) => {
        const p = polar(100, 100, R + 12, i * 22.5);
        return (
          <text key={i} x={p.x} y={p.y + 3.5} textAnchor="middle" fill={DIM}
                fontSize="9" fontFamily={SANS} fontWeight="600">{ROSE_16[i]}</text>
        );
      })}

      <circle cx="100" cy="100" r="15" stroke={LINE} strokeWidth="0.6" style={{ fill: BG_VAR }} />
      <text x="100" y="99" textAnchor="middle" fill={TEXT} fontSize="9" fontFamily={MONO}
            style={{ filter: dropGlow("rgba(var(--ink, 231,238,246),0.7)", g, 0.6) }}>
        {Math.round((rose.calm / Math.max(rose.total + rose.calm, 1)) * 100)}%
      </text>
      <text x="100" y="108" textAnchor="middle" fill={FAINT} fontSize="5.5" fontFamily={SANS} letterSpacing="1">
        ШТИЛЬ
      </text>
    </svg>
  );
}

// ---------------- ШКАЛА БОФОРТА ----------------
// Тринадцать делений с официальными признаками ВМО. Это единственное место, где
// станция говорит не числом, а тем, что человек может увидеть вокруг себя, —
// и потому лучший способ проверить, врёт ли анемометр.
function BeaufortStrip({ speed, g, accent, motion }) {
  const bf = beaufort(speed);
  return (
    <div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 44 }}>
        {BEAUFORT.map((b) => {
          const on = b.scale === bf.scale;
          return (
            <div key={b.scale} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: "100%",
                height: 8 + b.scale * 2.2,
                background: on ? accent : "rgba(var(--ink, 231,238,246),0.10)",
                boxShadow: on && g !== "off" ? `0 0 10px ${accent}` : "none",
                transition: motion === "off" ? "none" : "background .35s ease, box-shadow .35s ease",
              }} />
              <span style={{
                ...NUM, fontSize: 8, color: on ? TEXT : FAINT,
                textShadow: on ? glow(g, 0.6) : "none",
                transition: motion === "off" ? "none" : "color .35s ease",
              }}>
                {b.scale}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: 1.5, color: TEXT,
                      textShadow: glow(g, 0.7) }}>
          {bf.scale} БАЛЛОВ · {bf.desc.toUpperCase()}
        </div>
        <Row k="На суше" v={bf.land} g={g} mono={false} />
        <Row k="На море" v={bf.sea} g={g} mono={false} />
      </div>
    </div>
  );
}

// ============================================================
// МОДАЛЬНЫЕ ОКНА
// ============================================================

function WelcomeModal({ g, onFindNearest, onAddStation, onDismiss, busy, message, stationCount }) {
  return (
    <Modal onClose={onDismiss} g={g}>
      <div style={{ fontSize: 14, letterSpacing: 4, marginBottom: 6, fontWeight: 600, textShadow: glow(g, 1) }}>
        МЕТЕОСТАНЦИИ
      </div>
      <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.7, marginBottom: 18 }}>
        {stationCount > 0
          ? `В этом браузере сохранено станций: ${stationCount}. Можно выбрать ближайшую к вам по координатам.`
          : "Общего каталога станций не существует — каждая станция автономна и работает в своей сети. " +
            "Список ваших станций хранится только в этом браузере и никуда не отправляется."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <Btn onClick={onFindNearest} primary g={g} disabled={busy || !GEO_AVAILABLE}>
          {busy ? "ОПРЕДЕЛЯЮ МЕСТО…" : "ПОДКЛЮЧИТЬСЯ К БЛИЖАЙШЕЙ"}
        </Btn>
        <Btn onClick={onAddStation} g={g}>ПОДКЛЮЧИТЬ СВОЮ СТАНЦИЮ</Btn>
        <Btn onClick={onDismiss} g={g}>ПОСМОТРЕТЬ ДЕМО</Btn>
      </div>

      {/* Условие не тронуто намеренно: это про геолокацию браузера, а её
          облако не чинит — оно чинит доступ к плате. Дополнен только текст,
          чтобы «координат нет» не читалось как «станция потеряна». */}
      {!GEO_AVAILABLE && (
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 12, lineHeight: 1.6 }}>
          Поиск ближайшей недоступен: браузер отдаёт координаты только защищённым
          страницам, а эта копия открыта по обычному HTTP. А где стоит сама станция,
          дашборд знает и так: это её собственные координаты, а не геолокация браузера.
        </div>
      )}

      {message && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginTop: 14,
          fontSize: 11, lineHeight: 1.7, color: "rgba(var(--ink, 231,238,246),0.85)",
        }}>
          {message.text}
          {message.href && (
            <div style={{ marginTop: 9 }}>
              <a href={message.href} style={{ color: TEXT, textShadow: glow(g, 0.8), wordBreak: "break-all" }}>
                {message.href}
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// Окно обновления программы. Стекло — от .modal-card темы Liquid Glass, здесь
// только содержимое. Пока идёт скачивание, закрыть окно нельзя: оборванная
// установка оставила бы человека гадать, что именно у него теперь запущено.
function UpdateModal({ g, accent, up, onClose }) {
  const busy = up.status === "downloading" || up.status === "installing";
  const failed = up.status === "error";
  const pct = Math.round((up.progress || 0) * 100);
  const ver = (v) => `Beta ${v}`;
  const size = up.info.size ? `${(up.info.size / 1048576).toFixed(1)} МБ` : "";
  // Обновляется вся программа (новый установщик / APK), а не один интерфейс:
  // тогда «было» — версия самой программы, и перезапуск выглядит иначе.
  const whole = up.info.kind === "shell";
  const android = typeof window !== "undefined" && !!window.WKNative;
  return (
    <Modal onClose={busy ? () => {} : onClose} g={g}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <div className="upd-ring" style={{ color: accent }}>
          <svg className={busy ? "spin" : ""} width="22" height="22" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{ filter: g === "off" ? "none" : `drop-shadow(0 0 5px ${accent})` }}>
            <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4" />
            <path d="M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, letterSpacing: 3, fontWeight: 600, textShadow: glow(g, 0.9) }}>
            {up.status === "installing" ? "УСТАНАВЛИВАЮ" : busy ? "ЗАГРУЖАЮ" : "ДОСТУПНО ОБНОВЛЕНИЕ"}
          </div>
          <div style={{ color: DIM, fontSize: 11, marginTop: 4, fontFamily: MONO }}>
            {ver(whole && up.shell ? up.shell : up.current)} → <span style={{ color: TEXT }}>{ver(up.info.version)}</span>
            {size && ` · ${size}`}
          </div>
        </div>
      </div>

      {up.info.notes.length > 0 && (
        <div style={{
          border: "1px solid var(--pnl-line)", borderRadius: "var(--pnl-corner)",
          padding: "11px 14px", marginBottom: 16, fontSize: 11.5, lineHeight: 1.75,
          color: "rgba(var(--ink, 231,238,246),0.85)", maxHeight: 220, overflowY: "auto",
          background: "rgba(255,255,255,0.03)",
        }}>
          <div style={{ color: DIM, fontSize: 9.5, letterSpacing: 2.4, marginBottom: 6 }}>ЧТО НОВОГО</div>
          {up.info.notes.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <span style={{ color: accent }}>•</span><span>{n}</span>
            </div>
          ))}
        </div>
      )}

      {busy && (
        <div style={{ marginBottom: 16 }}>
          <div className="upd-track">
            <Liquid className="upd-fill" fast busy v={(up.status === "installing" ? 100 : pct) / 100} color={accent} />
          </div>
          <div style={{ color: DIM, fontSize: 10.5, marginTop: 6, fontFamily: MONO }}>
            {up.status === "installing"
              ? (whole ? (android ? "Подтвердите «Установить» в окне Android…" : "Устанавливаю, программа перезапустится…") : "Применяю и перезапускаю окно…")
              : `${pct} %`}
          </div>
        </div>
      )}

      {failed && (
        <div style={{ color: "#fb923c", fontSize: 11, lineHeight: 1.6, marginBottom: 14 }}>
          Не вышло: {up.error}
        </div>
      )}

      <div style={{ display: "flex", gap: 9 }}>
        <Btn primary g={g} disabled={busy} onClick={up.install} style={{ flex: 1 }}>
          {busy ? "ПОДОЖДИТЕ…" : failed ? "ПОВТОРИТЬ" : "ОБНОВИТЬ СЕЙЧАС"}
        </Btn>
        {!busy && <Btn g={g} onClick={onClose}>ПОЗЖЕ</Btn>}
      </div>
      <div style={{ color: DIM, fontSize: 10, marginTop: 12, lineHeight: 1.6 }}>
        {whole
          ? (android
              ? "Обновляется всё приложение: Android попросит нажать «Установить», потом откройте его снова. Настройки и станции сохраняются."
              : "Обновляется вся программа: она закроется и откроется заново сама. Настройки и станции сохраняются.")
          : "Меняется только интерфейс, окно перезагрузится само. Настройки и станции сохраняются."}
      </div>
    </Modal>
  );
}

function AddStationModal({ g, onSave, onClose, onLocate, locating, coords, testResult, onTest, busy, cloudBuilt }) {
  const [name, setName] = useState("Моя станция");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [via, setVia] = useState("ap");
  // Облачный идентификатор станции — имя ветки топиков на брокере. Поле
  // необязательное и намеренно отделено от `via`: тот отвечает на вопрос «в
  // какой сети искать плату», а облако — не сеть, в которой она стоит.
  // Станция с модемом сидит в своей точке доступа ровно так же, как и без.
  const [cloudId, setCloudId] = useState("");

  const inputStyle = {
    width: "100%", marginTop: 7, background: BG,
    border: `1px solid ${LINE}`, padding: "9px 11px",
    color: TEXT, fontSize: 12, fontFamily: MONO, outline: "none",
  };

  return (
    <Modal onClose={onClose} g={g}>
      <div style={{ fontSize: 13, letterSpacing: 3, marginBottom: 16, fontWeight: 600, textShadow: glow(g, 0.9) }}>
        ПОДКЛЮЧИТЬ СТАНЦИЮ
      </div>

      <Switch
        label="Как станция подключена" g={g} value={via}
        off={{ value: "ap", label: "своя сеть WiFi" }}
        on={{ value: "lan", label: "домашняя сеть" }}
        onChange={(v) => { setVia(v); setHost(v === "ap" ? DEFAULT_HOST : ""); }}
        hint={via === "ap"
          ? "Станция раздаёт собственную сеть WindStation и держит её всегда, даже когда заходит в домашнюю. Пароль задан в secrets.h при сборке прошивки — здесь его нет намеренно: этот дашборд выкладывается публично, и пароль от точки в нём стал бы паролем для всех. Адрес внутри сети станции — MyWindProbeBETA.org."
          : "Если станцию вернули в домашнюю сеть, впишите имя или IP, который ей выдал роутер."}
      />

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Название</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Адрес</Label>
        <input value={host} onChange={(e) => setHost(e.target.value)}
               placeholder="MyWindProbeBETA.org или 192.168.1.50" style={inputStyle} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Идентификатор в облаке</Label>
        <input value={cloudId} onChange={(e) => setCloudId(e.target.value)}
               placeholder="mast" style={inputStyle} />
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
          {cloudBuilt
            ? "Необязательно. Заполняется только у станции с модемом: она сама выходит наружу и публикует показания на брокер, и тогда её видно откуда угодно, а не только из её сети. Это то же имя, что записано в secrets.h как идентификатор станции. Пустое поле — станция работает как раньше, только по своей сети."
            : "Необязательно. В эту сборку дашборда учётка зрителя не попала, поэтому читать облако отсюда всё равно нечем — поле сохранится, но работать начнёт только в сборке с облаком."}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label g={g}>Место установки</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Btn onClick={onLocate} g={g} disabled={locating || !GEO_AVAILABLE}>
            {locating ? "ОПРЕДЕЛЯЮ…" : coords ? "ОБНОВИТЬ КООРДИНАТЫ" : "ПРИВЯЗАТЬ К ТЕКУЩЕМУ МЕСТУ"}
          </Btn>
          <Btn onClick={() => onTest({ host: host.trim(), cloudId: cloudId.trim() })} g={g}
               disabled={busy || (!host.trim() && !cloudId.trim())}>
            {busy ? "ПРОВЕРЯЮ…" : cloudId.trim() ? "ПРОВЕРИТЬ ОБЛАКО" : "ПРОВЕРИТЬ СВЯЗЬ"}
          </Btn>
        </div>
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
          {coords
            ? `Сохранено: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}. По этим координатам станция будет находиться как ближайшая.`
            : GEO_AVAILABLE
              ? "Без координат станция всё равно работает — её просто не найдёт поиск ближайшей."
              : "Координаты недоступны: браузер отдаёт их только защищённым страницам. Речь именно о вашем месте — где стоит сама станция, дашборд узнаёт у неё самой, и для этого геолокация не нужна."}
        </div>
      </div>

      {testResult && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginBottom: 16,
          fontSize: 11, lineHeight: 1.7, color: "rgba(var(--ink, 231,238,246),0.85)",
        }}>
          {testResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} g={g}>ОТМЕНА</Btn>
        <Btn primary g={g} disabled={!host.trim() || !name.trim()}
             onClick={() => onSave({
               name: name.trim(),
               host: host.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
               via,
               // Пустое поле — не пустая строка, а отсутствие ключа: «облака у
               // этой станции нет» читается по undefined, как dirPresent.
               ...(cloudId.trim() ? { cloudId: cloudId.trim() } : {}),
             })}>
          СОХРАНИТЬ
        </Btn>
      </div>
    </Modal>
  );
}

// readOnly — «этот канал не умеет писать». Без него оптимистичный апдейт в
// toggleLed нарисовал бы переключившийся светодиод, а через пять секунд
// очередной кадр отыграл бы его назад: человек увидел бы, что плата «сама
// вернула как было», хотя команда никуда и не уходила.
// ============================================================
// ГЛАВНЫЙ КОМПОНЕНТ
// ============================================================
export default function WindDashboard() {
  const [settings, setSettings] = useState(loadSettings);
  // Вкладка переживает перезагрузку страницы: станция часто открыта на телефоне
  // как «приложение с домашнего экрана», и возвращаться каждый раз на «ветер»
  // при случайном обновлении неудобно.
  const [tab, setTabState] = useState(() => {
    try { return localStorage.getItem("wind_ui_tab") || "wind"; } catch { return "wind"; }
  });
  // Переход между вкладками: старая уезжает (tab-leaving), потом монтируется
  // новая, которая влетает с той стороны, куда указывает порядок вкладок.
  // tab — куда идём (подсвечивается в панели сразу), view — что нарисовано.
  const [shownTab, setShownTab] = useState(tab);
  const [leaving, setLeaving] = useState(false);
  const [tabDir, setTabDir] = useState(1);
  const viewRef = useRef(tab);
  const viewTimer = useRef(null);
  // Стабильная ссылка: внутри только ref и сеттеры состояния, а функцию
  // получают memo-компоненты вкладок.
  const setTab = useCallback((id) => {
    setTabState(id);
    try { localStorage.setItem("wind_ui_tab", id); } catch { /* приватный режим */ }
    if (id === viewRef.current && !viewTimer.current) return;
    const dir = TAB_ORDER.indexOf(id) >= TAB_ORDER.indexOf(viewRef.current) ? 1 : -1;
    setTabDir(dir);
    setLeaving(true);
    // К началу страницы — плавно, а не скачком: прыжок скролла под анимацией
    // читался как сбой.
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* старый WebView */ }
    clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => {
      viewTimer.current = null;
      viewRef.current = id;
      setShownTab(id);
      setLeaving(false);
    }, 380);
  }, []);
  const goArea = useCallback(() => setTab("area"), [setTab]);
  const goWind = useCallback(() => setTab("wind"), [setTab]);
  // Приборов на «радаре» стало шесть, и вываливать их одной простынёй нельзя:
  // страница перестаёт быть приборной панелью и становится свалкой. Выбор
  // переживает перезагрузку по той же причине, что и основная вкладка.
  const [radarView, setRadarViewState] = useState(() => {
    try {
      const saved = localStorage.getItem("wind_ui_radar");
      // Старые вкладки переехали внутрь «Профиля». Без этой строки у всех,
      // кто раньше сидел на «Розе», вкладка бы просто не нашлась и экран
      // остался бы пустым.
      return RADAR_VIEWS.some((v) => v.id === saved) ? saved : "conv";
    } catch { return "conv"; }
  });
  const setRadarView = (id) => {
    setRadarViewState(id);
    try { localStorage.setItem("wind_ui_radar", id); } catch { /* приватный режим */ }
  };
  // Заряд самого устройства: показывается в шапке, пока станция не на связи.
  const deviceBat = useDeviceBattery();
  const devKind = useMemo(deviceKind, []);
  const [showSettings, setShowSettings] = useState(false);
  // Обновление программы (только настольная Weathered_Kiwi, иначе null).
  const update = useAppUpdate();
  const [showUpdate, setShowUpdate] = useState(false);
  const [showClaude, setShowClaude] = useState(false);
  // Закрытие — тоже анимация, но держать плашку в дереве ради неё не нужно:
  // уход в кнопку доигрывает копия (MorphPop → wind-morph.js).
  const claudeRef = useRef(null);
  const verRef = useRef(null);
  const toggleClaude = () => setShowClaude((v) => !v);
  // Бульбашка Claude закрывается и касанием мимо неё, и Esc.
  useEffect(() => {
    if (!showClaude) return undefined;
    const down = (e) => { if (!e.target.closest?.(".claude-wrap")) setShowClaude(false); };
    const key = (e) => { if (e.key === "Escape") setShowClaude(false); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key); };
  }, [showClaude]);
  // Окошко версии: по нажатию на «Beta x.y.z». Открывается и закрывается так же,
  // как плашка Claude — с анимацией, повторным нажатием. Внутри — ручная проверка.
  const uc = useUpdateCheck();
  const [verOpen, setVerOpen] = useState(false);
  // idle | busy | latest | unreached | available | nosupport
  // «latest» — только когда лента ДЕЙСТВИТЕЛЬНО ответила и её версия не новее
  // установленной. Не ответила ни одна — «unreached»: это «не знаю», а не «новее нет».
  const [verPhase, setVerPhase] = useState("idle");
  const [verResult, setVerResult] = useState(null);   // последний ответ оболочки
  const closeVer = () => setVerOpen(false);
  const toggleVer = () => {
    if (verOpen) { closeVer(); return; }
    setVerPhase(!uc.supported ? "nosupport" : update ? "available" : "idle");
    setVerOpen(true);
  };
  const runVerCheck = async () => {
    setVerPhase("busy");
    const st = await uc.check();
    setVerResult(st);
    // reached === undefined — старая оболочка, которая этого ещё не сообщает.
    setVerPhase(st && st.info ? "available" : st && st.reached === false ? "unreached" : st ? "latest" : "unreached");
  };
  useEffect(() => {
    // Обновление пришло само (push), пока окошко открыто, — сразу показываем кнопку.
    if (verOpen && update && verPhase !== "busy" && verPhase !== "available") setVerPhase("available");
  }, [update, verOpen, verPhase]);
  // Плашка наверху убирается до перезапуска: в localStorage не пишется нарочно.
  const [showBanner, setShowBanner] = useState(true);
  const [bannerOut, setBannerOut] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [setView, setSetViewState] = useState(() => {
    try { return localStorage.getItem("wind_ui_setview") || "main"; } catch { return "main"; }
  });
  const setSetView = (id) => {
    setSetViewState(id);
    try { localStorage.setItem("wind_ui_setview", id); } catch { /* приватный режим */ }
  };
  // Читать localStorage без обёртки нельзя: в приватном режиме и внутри
  // песочницы обращение к нему не возвращает null, а бросает — и падало бы всё
  // приложение целиком, хотя адрес станции есть куда взять по умолчанию.
  const [esp32Host, setEsp32Host] = useState(() => {
    if (SERVED_FROM_STATION) return DEFAULT_HOST;
    try { return localStorage.getItem("esp32_host") || DEFAULT_HOST; } catch { return DEFAULT_HOST; }
  });

  const [data, setData] = useState(EMPTY_DATA);
  const [connected, setConnected] = useState(false);
  // История хранится парами: розе ветров и конвективному анализу нужно знать,
  // какому направлению соответствовала какая скорость. Раздельные массивы это
  // соответствие теряли, стоило датчику направления моргнуть.
  const [history, setHistory] = useState([]);
  const [rose, setRose] = useState(() => ({
    sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]), calm: 0, total: 0,
  }));
  // «Данные района» во вкладке «Метео данные»: включены — вместо приборов станции
  // там только данные района. Работают независимо от источника в настройках
  // (станция или демо). Выбор переживает перезагрузку.
  const [areaOn, setAreaOnState] = useState(() => {
    try { return localStorage.getItem("wind_ui_area_on") === "1"; } catch { return false; }
  });
  const setAreaOn = (v) => {
    setAreaOnState(v);
    try { localStorage.setItem("wind_ui_area_on", v ? "1" : "0"); } catch { /* приватный режим */ }
  };
  // Источник данных: сама станция, модель или район вокруг дома.
  // Раньше это был булев demoMode; третье значение не влезало, а «не демо»
  // перестало означать «плата» — теперь условия спрашивают про station явно.
  //
  // ⛔ Четвёртого значения «cloud» здесь НЕТ и быть не должно. source отвечает
  // не только на «откуда цифры», но и на «про что они»: подпись панели
  // «Атмосфера», текст под ней, сброс порыва, метка на карте, заглушка «Точки
  // доступа». Во всех этих местах облако ведёт себя КАК СТАНЦИЯ — это та же
  // мачта и тот же датчик, только другой провод, — и четвёртое значение
  // заставило бы дописать `|| source === "cloud"` в каждое из них.
  const [source, setSourceState] = useState(initialSource);
  // Канал до станции — ортогонально источнику. Переживает перезагрузку тем же
  // приёмом, что и вкладка: страницу открывают с телефона как приложение, и
  // выбор канала терять при каждом обновлении так же неудобно.
  const [link, setLinkState] = useState(initialLink);
  const setLink = (v) => {
    setLinkState(v);
    try { localStorage.setItem(LINK_KEY, v); } catch { /* приватный режим */ }
  };
  const demoMode = source === "demo";
  // isStation — «цифры с этой платы, каким угодно каналом».
  // direct     — «до платы можно достучаться по HTTP» (единственное, что даёт
  //              право звать /api/*: у половины эндпоинтов нет даже CORS).
  // viaCloud   — «цифры приходят подпиской с брокера».
  const isStation = source === "station";
  const direct = isStation && link === "direct";
  const viaCloud = isStation && link === "cloud";
  const district = useDistrict(source === "district" || tab === "area" || (tab === "wind" && areaOn));
  // Картинка живёт отдельно от настроек: она весит сотни килобайт, а настройки
  // читаются и пишутся на каждый чих — держать их в одной записи значило бы
  // гонять этот килобайтный хвост туда-сюда постоянно.
  const [bgImage] = useState(loadBgImage);
  // Режим правки раскладки живёт только в памяти: возвращаться в него после
  // перезагрузки страницы никто не просил, а сохранись он — дашборд открывался
  // бы с пунктирными рамками вместо показаний.
  const [layoutMode, setLayoutMode] = useState(false);
  const viewportW = useViewport();
  // Ширина дорожки берётся из настоящих размеров сетки, а не из догадки:
  // растягивание должно совпадать с тем, что человек видит.
  const gridRef = useRef(null);
  const [time, setTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(null);
  // Когда был зафиксирован нынешний максимум порыва. Само по себе число «14.2»
  // ничего не говорит: чтобы порыв можно было с чем-то сопоставить, нужен
  // момент, когда он случился.
  const [gustAt, setGustAt] = useState(null);
  const gustRef = useRef(0);
  const [ap, setAp] = useState(null);
  const [site, setSite] = useState(null);

  // Каталог станций и мастера подключения.
  const [stations, setStations] = useState(loadStations);
  // Какая станция выбрана — по id, а не по адресу. Миграция в один проход:
  // ключа нет → ищем запись с тем host, который лежит в esp32_host, и берём её
  // id. Сравнение по host держалось ровно до появления облака: DEFAULT_HOST
  // одинаков у любой станции в режиме точки доступа, и две разные мачты
  // подсвечивались бы обе.
  const [activeStationId, setActiveStationIdState] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY);
      if (saved) return saved;
      const host = localStorage.getItem("esp32_host");
      const hit = loadStations().find((st) => st.host === host);
      if (hit) { localStorage.setItem(ACTIVE_KEY, hit.id); return hit.id; }
    } catch { /* приватный режим */ }
    return null;
  });
  const setActiveStationId = (id) => {
    setActiveStationIdState(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* приватный режим */ }
  };
  // Выбранная запись каталога. Если id ещё не проставлен (совсем старый
  // браузерный профиль, в котором миграция ничего не нашла), падаем на прежнее
  // сравнение по адресу — лучше подсветить не ту, чем не подсветить ничего.
  const activeStation = useMemo(
    () => stations.find((st) => st.id === activeStationId)
      || (activeStationId ? null : stations.find((st) => st.host === esp32Host))
      || null,
    [stations, activeStationId, esp32Host]
  );

  // ---------- облачный канал ----------
  // Одно состояние вместо трёх флагов: «подключаюсь», «идёт», «молчит» и
  // «не вышло» — это последовательные стадии одного канала, а не независимые
  // признаки, и тремя булевыми они складывались бы в невозможные сочетания.
  const [cloudPhaseState, setCloudPhase] = useState("connecting");
  // Онлайн ли станция по её собственному retained-статусу. null — ещё не
  // знаем; это не то же самое, что false («станция сказала, что уходит»).
  const [cloudOnline, setCloudOnline] = useState(null);
  // Второй из трёх уровней проверки (см. CLOUD_BUILT). Начальное значение —
  // лучшая синхронная догадка: настоящий ответ даёт CLOUD_CONFIGURED, но он
  // известен только после загрузки модуля.
  const [cloudAvail, setCloudAvail] = useState(CLOUD_BUILT);
  // Нонс загрузки станции. Через облако его смена — единственный способ
  // узнать, что плата перезагрузилась: аптайм в retained-кадре может быть
  // часовой давности, а нонс перевыпускается на каждую загрузку.
  const [cloudSession, setCloudSession] = useState(null);
  // Когда пришёл последний живой кадр и последний кадр состояния. Второе
  // хранится вместе с признаком retained: по нему и только по нему видно,
  // смотрим мы на текущую картину или на слепок, оставленный брокером.
  const [cloudLiveAt, setCloudLiveAt] = useState(null);
  const [cloudStateAt, setCloudStateAt] = useState(null);
  // Клиентские счётчики: сколько живых кадров пришло и сколько пакетов
  // потерялось по разрывам в счётчике q. ⛔ Со счётчиками прошивки
  // (pubDrop, errors) их смешивать нельзя — это разные величины, померенные
  // с разных концов канала.
  const [cloudSeen, setCloudSeen] = useState({ frames: 0 });
  // Счётчики буфера воспроизведения: их знает сам модуль, а не дашборд.
  // Считать пропуски здесь нечем — до onLive доезжает уже развёрнутый кадр
  // без номера пакета, номер разбирается уровнем ниже.
  const [cloudStats, setCloudStats] = useState(null);
  // Падение в демо — ровно один раз за сеанс. Без этой отметки человек,
  // вручную вернувший «станцию», вылетал бы в демо на следующем же тике.
  const fellBackRef = useRef(false);
  const [fellBack, setFellBack] = useState(false);
  const setSource = (v) => {
    fellBackRef.current = false;
    setFellBack(false);
    setSourceState(v);
  };
  // Ответы /api/modem и /api/cloud. null — ещё не спрашивали, false — эндпоинта
  // нет вовсе (404 на сборке без модема или без облака), и тогда панель
  // исчезает, а не показывает пустые строки.
  const [modem, setModem] = useState(null);
  const [cloudApi, setCloudApi] = useState(null);
  const [sysBusy, setSysBusy] = useState("");
  const [showWelcome, setShowWelcome] = useState(() => {
    if (SERVED_FROM_STATION) return false;
    try { return !localStorage.getItem(WELCOMED_KEY); } catch { return true; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState(null);
  const [newCoords, setNewCoords] = useState(null);
  const [testResult, setTestResult] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  const ledManual = useRef({ auto: true, green: "off", yellow: "off", red: "off", wifi: "off" });
  const demoRef = useRef({ speed: 5, dir: 180, t: 0, gust: 0, battery: 4.1 });
  // Ручные значения демо-режима. Живут в state, а не в ref: их двигают
  // ползунками, и перерисовка нужна на каждое движение.
  const [demo, setDemo] = useState({
    manual: false, speed: 9, gustExtra: 3, dir: 210,
    tempC: 16, humidity: 62, pressureHpa: 1013, rainMm: 0, battery: 3.9,
  });
  const [sseActive, setSseActive] = useState(false);
  const histRef = useRef(0);
  // Последнее известное направление. Живой облачный кадр несёт только скорость
  // и порыв (~60 байт на пакет — метка времени и направление туда намеренно не
  // положены), а розе ветров пара «скорость + направление» нужна целиком.
  const dirRef = useRef(null);
  // Журнал (wind-log.js): ключ станции, последний кадр и порыв — ref, потому
  // что пишут в журнал обработчики, которые не пересоздаются на каждый рендер.
  const logKeyRef = useRef(null);
  const frameRef = useRef(null);
  const lastSaveRef = useRef(0);
  // Смена источника (демо / станция / район), адреса или канала — показания
  // прежнего источника выбрасываются. Без этого после выключения демо при
  // молчащей станции «Станция» показывала батарею 92 %, сигнал −53 дБм и
  // горящие светодиоды модели — выдуманные цифры под видом платы.
  const srcKey = `${source}|${esp32Host}|${link}`;
  const srcKeyRef = useRef(srcKey);
  useEffect(() => {
    if (srcKeyRef.current === srcKey) return;
    srcKeyRef.current = srcKey;
    setData(EMPTY_DATA);
    setConnected(false);
    setLastUpdate(null);
    setHistory([]);
    setGustAt(null);
    gustRef.current = 0;
    frameRef.current = null;
    dirRef.current = null;
  }, [srcKey]);

  const g = settings.glow;
  // Системная настройка «меньше движения» перекрывает выбор в дашборде: если
  // человек попросил ОС убрать анимации, спорить с этим нельзя.
  const reduceMotion = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  const motion = reduceMotion ? "off" : settings.motion;
  const smooth = motion !== "off";

  // Эко-режим: решает настройка, а пока её не трогали — устройство (ECO_AUTO).
  // Флаг нужен и в обработчиках, которые не перевешиваются при каждом рендере
  // (applyData), — для них ref.
  const liquid = settings.theme === "liquid";
  // «Тональная» — та же раскладка и движение, но без стекла: линза, свет
  // курсора и живой фон в ней не нужны и не считаются.
  const material = settings.skin === "material";
  const lightScene = settings.scene === "light" || settings.scene === "liquidLight";

  // Язык. Перевод делается на странице (wind-i18n.js), поэтому дашборду
  // достаточно сказать, какой язык включить: всё остальное — переводчик.
  const langCode = resolveLang(settings.lang);
  useEffect(() => { applyLang(langCode); }, [langCode]);
  const [langOpen, setLangOpen] = useState(false);

  // Значок: в шапке, во вкладке браузера и у самой программы — окно и панель
  // задач Windows (wkWindow.setIcon), значок на рабочем столе Android
  // (WKNative.setIcon). Старые оболочки этих мостов не знают — молча мимо.
  const tonalIcon = settings.glassIcon === false;
  useEffect(() => {
    const kind = tonalIcon ? "tonal" : "glass";
    setFavicon(tonalIcon);
    try { window.wkWindow?.setIcon?.(kind); } catch { /* старая оболочка */ }
    try { if (window.WKNative && typeof window.WKNative.setIcon === "function") window.WKNative.setIcon(kind); } catch { /* старая оболочка */ }
  }, [tonalIcon]);
  const eco = ecoOn(settings);
  const ecoRef = useRef(eco);
  ecoRef.current = eco;
  SMOOTH_MIN_MS = eco ? 33 : 0;
  // Жидкие переходы стекла: капля выбора, подсветка от касания.
  const fluid = liquid && motion !== "off";

  // Свет на стекле. Раньше координаты курсора писались ВСЕМ стеклянным блокам,
  // а градиенты брали их в координатах окна через background-attachment:
  // fixed. Замер показал цену: 30 мс видеокарты на кадр при движении мыши —
  // больше, чем всё стекло вместе, — плюс перерисовка всех панелей на каждом
  // кадре прокрутки. Вторая версия рисовала свет фоном в своих координатах
  // блока — 17 мс на кадр: панель перерисовывалась вместе с текстом и
  // свечением. Теперь свет — узел .lg-lit с двумя готовыми слоями (пятно по
  // стеклу и блик по фаске), который вкладывается только в блоки в пределах
  // REACH от курсора и едет transform'ом. Ни одного перерисованного пикселя:
  // слой сдвигает композитор. Блок, из которого свет ушёл, гаснет переходом
  // прозрачности, а через секунду узел убирается.
  //
  // На телефоне без мыши фаску ведёт наклон (Android отдаёт его без запроса
  // разрешения; айфон — нет, и там блик стоит). В эко-режиме света нет.
  useEffect(() => {
    if (!liquid || material || motion === "off" || eco) return undefined;
    const SEL = ".pnl, .stat, .tutor-box, .dock";
    const REACH = 170;
    let rects = null, rectsAt = 0, raf = 0, px = 0, py = 0, has = false, tgt = null, tiltEl = null;
    // Наклон блока под курсором — параллакс глубины: блок чуть поворачивается
    // к мыши. Переменные, а не transform: наведение (.blk:hover) уже задаёт
    // подъём и масштаб, наклон дописывается к ним в CSS, переход сглаживает.
    const untilt = () => { if (tiltEl) { tiltEl.style.removeProperty("--tlx"); tiltEl.style.removeProperty("--tly"); tiltEl = null; } };
    const lights = new Map();                           // блок → { node, g, r, on, t }
    const measure = () => {
      rects = [];
      const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      for (const el of document.querySelectorAll(SEL)) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        rects.push([el, r]);
        // Задержка бегущего блика — от места блока на экране: полоса проходит
        // панели слева направо, как свет по одному большому стеклу.
        const d = `${(((r.left + r.width / 2) / vw) * 1.5 + (Math.max(0, r.top) / vh) * 0.35).toFixed(1)}s`;
        if (el.__lgd !== d) { el.__lgd = d; el.style.setProperty("--lg-d", d); }
      }
      rectsAt = performance.now();
    };
    const light = (el) => {
      let L = lights.get(el);
      if (L && L.node.parentNode === el) return L;
      const node = document.createElement("span");
      node.className = "lg-lit";
      node.setAttribute("aria-hidden", "true");
      const g = document.createElement("i");
      const rim = document.createElement("b");
      const r = document.createElement("i");
      rim.appendChild(r);
      node.append(g, rim);
      el.appendChild(node);
      L = { node, g, r, on: false, t: 0 };
      lights.set(el, L);
      return L;
    };
    const put = () => {
      raf = 0;
      if (!rects || performance.now() - rectsAt > 700) measure();
      const near = new Set();
      const b = has && tgt?.closest ? tgt.closest(".blk") : null;
      if (b !== tiltEl) untilt();
      if (b) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          tiltEl = b;
          b.style.setProperty("--tly", `${(((px - r.left) / r.width - 0.5) * 5).toFixed(2)}deg`);
          b.style.setProperty("--tlx", `${((0.5 - (py - r.top) / r.height) * 5).toFixed(2)}deg`);
        }
      }
      if (has) {
        for (const [el, r] of rects) {
          if (px < r.left - REACH || px > r.right + REACH || py < r.top - REACH || py > r.bottom + REACH) continue;
          near.add(el);
          const L = light(el);
          const tr = `translate3d(${Math.round(px - r.left)}px, ${Math.round(py - r.top)}px, 0)`;
          L.g.style.transform = tr;
          L.r.style.transform = tr;
          if (!L.on) {
            L.on = true; clearTimeout(L.t);
            // Класс — на следующем кадре: узел, вставленный только что, иначе
            // появился бы сразу, без перехода.
            requestAnimationFrame(() => { if (L.on) L.node.classList.add("on"); });
          }
        }
      }
      for (const [el, L] of lights) {
        if (near.has(el) || !L.on) continue;
        L.on = false;
        L.node.classList.remove("on");
        L.t = setTimeout(() => { if (!L.on) { L.node.remove(); lights.delete(el); } }, 1000);
      }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(put); };
    // Касание светит иначе — из точки нажатия (см. обработчик pointerdown);
    // тащить свет за пальцем, который в этот момент листает страницу, незачем.
    const onMove = (e) => { if (e.pointerType === "touch") return; px = e.clientX; py = e.clientY; tgt = e.target; has = true; queue(); };
    const onLeave = () => { has = false; queue(); };
    const onScroll = () => { rects = null; if (has) queue(); };
    const onResize = () => { rects = null; queue(); };
    // Наклон: свет обходит кромку. Не чаще 8 раз в секунду и только при
    // заметном повороте — каждое обновление перерисовывает фаски видимых блоков.
    let tiltA = 135, tiltAt = 0;
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      const now = performance.now();
      if (now - tiltAt < 120) return;
      const a = 135 + Math.max(-45, Math.min(45, e.gamma)) * 1.6 - Math.max(-40, Math.min(40, e.beta - 50)) * 0.9;
      if (Math.abs(a - tiltA) < 5) return;
      tiltA = a; tiltAt = now;
      const deg = `${Math.round(a)}deg`;
      for (const el of document.querySelectorAll(".pnl:not(.off), .stat:not(.off), .dock")) el.style.setProperty("--lg-a", deg);
    };
    const first = setTimeout(measure, 1400);
    const iv = setInterval(() => { if (!document.hidden) measure(); }, 2500);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("deviceorientation", onTilt, { passive: true });
    return () => {
      clearTimeout(first); clearInterval(iv);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onTilt);
      if (raf) cancelAnimationFrame(raf);
      untilt();
      for (const L of lights.values()) { clearTimeout(L.t); L.node.remove(); }
      lights.clear();
      for (const el of document.querySelectorAll(SEL)) {
        el.style.removeProperty("--lg-a"); el.style.removeProperty("--lg-d");
        el.__lgd = undefined;
      }
    };
  }, [liquid, material, motion, eco]);

  // Линза на плавающем стекле: у каждого элемента своя карта под его форму.
  useEffect(() => {
    if (material || !lensActive(settings, eco)) return undefined;
    return startLens(glassLevel(settings));
  }, [settings.theme, settings.glassLevel, eco, material]);

  // Край прокрутки и сворачивание дока. Классы ставятся прямо на узлы, а не
  // через состояние React: иначе каждый порог прокрутки перерисовывал бы весь
  // дашборд ради одного класса. Док сворачивается (CSS — только на телефоне),
  // когда листают вниз, и разворачивается, стоит повести вверх — как панель
  // вкладок в iOS 26.
  useEffect(() => {
    if (!liquid) return undefined;
    let raf = 0, lastY = window.scrollY, top = false, min = false;
    const apply = () => {
      raf = 0;
      const y = window.scrollY, dy = y - lastY;
      const nTop = y > 6;
      if (nTop !== top) { top = nTop; document.querySelector(".lg-edge-top")?.classList.toggle("on", top); }
      if (Math.abs(dy) > 12 || y < 60) {
        const nMin = y > 140 && dy > 0;
        if (nMin !== min) { min = nMin; document.querySelector(".dock-row.dock-bottom")?.classList.toggle("dock-min", min); }
        lastY = y;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.querySelector(".dock-row")?.classList.remove("dock-min");
    };
  }, [liquid]);

  // Скрытая вкладка: бесконечные анимации ставим на паузу, чтобы не жечь батарею.
  useEffect(() => {
    const onVis = () => document.documentElement.classList.toggle("paused", document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Лёгкий виброотклик на касание (wind-haptic.js) — не зависит от настройки
  // движения: это не анимация, а ощущение нажатия.
  useEffect(() => mountTapHaptics(), []);
  // Настройки вибрации — в модуль: он не React и сам их не читает.
  useEffect(() => {
    setHapticConfig({ level: settings.haptics || "normal", touch: settings.hapTouch !== false,
                      sliders: settings.hapSliders !== false, boot: settings.hapBoot !== false });
  }, [settings.haptics, settings.hapTouch, settings.hapSliders, settings.hapBoot]);
  // Тихие часы: экран темнее, вибрации нет. Корень перерисовывается с потоком,
  // так что граница часа ловится сама, отдельный таймер не нужен.
  const night = !!settings.quiet && settings.quietDim !== false && quietNow(settings);
  useEffect(() => { setHapticConfig({ quiet: night }); }, [night]);

  // Всплеск от каждого нажатия: волна расходится от точки касания. На стекле —
  // иначе: стекло загорается изнутри из точки касания и свет расходится по нему
  // до кромки (interactive glass, iOS 26). Пятно вкладывается в сам элемент и
  // обрезается его скруглением, поэтому кнопка светится кнопкой, а панель —
  // панелью. Только transform и opacity: ни одной перерисовки.
  useEffect(() => {
    if (motion === "off") return undefined;
    const TOUCH_HOST = ".dock-tabs > button, .gear-btn, .ar-btn, .ver-chip, .claude-chip, .upd-tab, .dock, .pnl, .stat, .tutor-box";
    const glassTouch = (e) => {
      if (!liquid || layoutMode || !e.target.closest) return false;
      const host = e.target.closest(TOUCH_HOST);
      if (!host) return false;
      const b = host.getBoundingClientRect();
      if (!b.width) return false;
      const sz = Math.round(Math.max(110, Math.min(540, Math.max(b.width, b.height) * 1.15)));
      const t = document.createElement("span");
      t.className = "lg-touch";
      t.setAttribute("aria-hidden", "true");
      const i = document.createElement("i");
      i.style.cssText = `left:${Math.round(e.clientX - b.left)}px;top:${Math.round(e.clientY - b.top)}px;`
        + `width:${sz}px;height:${sz}px;margin:${-sz / 2}px 0 0 ${-sz / 2}px`;
      t.appendChild(i);
      host.appendChild(t);
      setTimeout(() => t.remove(), 1150);
      return true;
    };
    const onDown = (e) => {
      let poke = e.target.closest && e.target.closest("[data-poke]");
      // Всё, что не кнопка и никуда не ведёт, тоже отзывается: берём ближайшую
      // карточку или панель. Интерактивное (кнопки, ссылки, поля, карта) и
      // режим раскладки не трогаем — там нажатие означает своё.
      if (!poke && !layoutMode && e.target.closest) {
        const t = e.target;
        const live = t.closest("button, a, input, select, textarea, label, canvas, .dock-panel, .cl-drop, .modal-card")
          || !["auto", "default", "text"].includes(getComputedStyle(t).cursor);
        if (!live) poke = t.closest(".stat") || t.closest(".pnl");
      }
      if (poke) {
        const kind = poke.dataset.poke || "banner";
        const jelly = kind === "banner"
          ? [{ transform: "none" }, { transform: "scale(1.03, .9)" }, { transform: "scale(.98, 1.06) rotate(-.4deg)" },
             { transform: "scale(1.01, .98) rotate(.3deg)" }, { transform: "none" }]
          : [{ transform: "none" }, { transform: "scale(1.35, .62) rotate(-6deg)" },
             { transform: "scale(.78, 1.34) rotate(8deg)" }, { transform: "scale(1.16, .88) rotate(-4deg)" },
             { transform: "scale(.94, 1.06) rotate(2deg)" }, { transform: "none" }];
        poke.animate(jelly, { duration: kind === "banner" ? 950 : 1200, easing: "cubic-bezier(.2,.8,.3,1)" });
      }
      // Искры — десяток узлов поверх всего экрана на каждое касание: в
      // эко-режиме их нет, отклик дают желе и свет в стекле.
      if (poke && !ecoRef.current) {
        const kind = poke.dataset.poke || "banner";
        const b = poke.getBoundingClientRect();
        const cx = kind === "banner" ? e.clientX : b.left + b.width / 2;
        const cy = kind === "banner" ? e.clientY : b.top + b.height / 2;
        const n = kind === "banner" ? 10 : 14;
        const hue = kind === "chip" && poke.classList.contains("claude-chip") ? "255,154,60" : "170,215,255";
        for (let i = 0; i < n; i += 1) {
          const d = document.createElement("span");
          d.className = "spark";
          d.style.left = `${cx}px`;
          d.style.top = `${cy}px`;
          d.style.background = `rgb(${hue})`;
          d.style.boxShadow = `0 0 8px rgb(${hue})`;
          document.body.appendChild(d);
          const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
          const dist = 34 + Math.random() * 46;
          d.animate([
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist}px)) scale(0)`, opacity: 0 },
          ], { duration: 800 + Math.random() * 400, easing: "cubic-bezier(.1,.7,.3,1)" }).onfinish = () => d.remove();
        }
      }
      if (glassTouch(e)) return;
      const r = document.createElement("span");
      r.className = "rip";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 1100);
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [motion, layoutMode, liquid]);

  const setS = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if ("mode" in patch || "skin" in patch || "wall" in patch) next.scene = sceneOf(next);
      try { localStorage.setItem("wind_ui_settings", JSON.stringify(next)); } catch { /* приватный режим */ }
      return next;
    });
  };

  // История пишется не чаще раза в секунду, иначе окно спарклайна при 20 Гц
  // сжалось бы до нескольких секунд. Длина буфера = окно в минутах × 60.
  const histLen = settings.histMinutes * 60;

  // Роза копится за весь сеанс и живёт дольше окна графика: климатическая
  // картина за две минуты бессмысленна.
  const pushRose = useCallback((speed, dir) => {
    setRose((prev) => {
      if (speed < 0.5 || dir == null) {
        return speed < 0.5 ? { ...prev, calm: prev.calm + 1 } : prev;
      }
      const band = roseBand(speed);
      if (band < 0) return { ...prev, calm: prev.calm + 1 };
      const si = Math.round(((dir % 360) + 360) % 360 / 22.5) % 16;
      const sectors = prev.sectors.map((s, i) => (i === si ? s.map((c, b) => (b === band ? c + 1 : c)) : s));
      return { sectors, calm: prev.calm, total: prev.total + 1 };
    });
  }, []);

  const pushHistory = useCallback((speed, dir) => {
    const now = Date.now();
    if (now - histRef.current < 950) return;
    histRef.current = now;
    setHistory((prev) => [...prev, { s: speed, d: dir }].slice(-Math.max(histLen, 600)));
    pushRose(speed, dir);
    const k = logKeyRef.current;
    if (k) {
      logSample(k, speed, frameRef.current?.gust, dir, frameRef.current);
      if (now - lastSaveRef.current > 30000 && frameRef.current) { lastSaveRef.current = now; saveLastFrame(k, frameRef.current); }
    }
  }, [histLen, pushRose]);

  // live = «кадр приехал только что». Единственный случай, когда это не так —
  // retained-сообщение брокера: зритель, открывший страницу через час после
  // ухода станции, получает её последний кадр МГНОВЕННО, и всё, что считает
  // время от момента приёма, начинает врать.
  //
  // ⛔ Три вещи, которые для retained делать НЕЛЬЗЯ:
  //   1. setLastUpdate(new Date()) — дало бы «КАДР · 0с» под часовой давности
  //      показаниями. Метка берётся из самих часов станции (epoch), а когда
  //      их нет — прочерк: он честнее нуля;
  //   2. pushHistory — history не хранит меток времени ВОВСЕ, позиция в
  //      массиве и есть время. Один старый отсчёт рядом с текущим необратимо
  //      врёт графику и розе, и по виду массива это потом не отличить;
  //   3. setGustAt(new Date()) — подпись «Порыв · 14:32» означала бы, что мы
  //      знаем момент пика. Значение обновляем, момент — нет.
  const lastApplyAt = useRef(0);
  const applyData = useCallback((json, { live = true } = {}) => {
    // Поток идёт 20 раз в секунду, а каждый кадр перерисовывает весь дашборд. В
    // эко-режиме — пять: столько же получают дисплей в корпусе и облако, и для
    // показаний ветра этого с запасом. Замер 2026-11-06 (процессор ×6, планшет
    // 800×1280): перерисовка — две трети оставшейся работы главного потока.
    if (ecoRef.current && live) {
      const now = performance.now();
      if (now - lastApplyAt.current < 195) return;
      lastApplyAt.current = now;
    }
    // Older firmware has no *Present flags — infer from the value being there.
    const normLed = (v) => (v === true ? "on" : v === false || v == null ? "off" : v);
    const norm = {
      ...json,
      ledGreen: normLed(json.ledGreen),
      ledYellow: normLed(json.ledYellow),
      ledRed: normLed(json.ledRed),
      ledWifi: normLed(json.ledWifi),
      speedMax: json.speedMax ?? 30,
      dirPresent: json.dirPresent ?? (json.direction != null),
      batteryPresent: json.batteryPresent ?? (json.battery != null),
      chargeState: json.chargeState ?? (json.battery != null ? "discharging" : "absent"),
      powerSource: json.powerSource ?? (json.chargeState === "charging" ? "external" : null),
    };
    setData(norm);
    setConnected(true);
    frameRef.current = norm;
    if (live && logKeyRef.current) watchFrame(logKeyRef.current, norm);
    dirRef.current = norm.dirPresent ? json.direction : null;
    if (live) {
      setLastUpdate(new Date());
    } else {
      setLastUpdate(json.timeValid && json.epoch ? new Date(json.epoch * 1000) : null);
    }
    if (!live) {
      if (Number.isFinite(json.gust)) gustRef.current = json.gust;
      setGustAt(null);
    } else if (Number.isFinite(json.gust) && json.gust > gustRef.current + 0.05) {
      gustRef.current = json.gust;
      setGustAt(new Date());
    } else if (json.gust < gustRef.current - 0.05) {
      // Сброс порыва на плате — обнуляем и метку, иначе она врёт про старый пик.
      gustRef.current = json.gust;
      setGustAt(null);
    }
    if (live) pushHistory(json.speed, norm.dirPresent ? json.direction : null);
  }, [pushHistory]);

  // Живой кадр из облака. Приходит уже из буфера воспроизведения с шагом 50 мс,
  // поэтому здесь никакой развёртки пачки нет — только раскладка полей.
  // Форма кадра допускается обе: и развёрнутая (speed/gust), и та, что летит
  // по проводу (s/g) — модуль волен отдавать любую, а разбирать это в двух
  // местах смысла нет.
  const applyCloudLive = useCallback((f) => {
    if (!f) return;
    const speed = Number.isFinite(f.speed) ? f.speed : Number.isFinite(f.s) ? f.s : null;
    if (speed == null) return;
    const gust = Number.isFinite(f.gust) ? f.gust : Number.isFinite(f.g) ? f.g : null;
    setData((prev) => (gust == null ? { ...prev, speed } : { ...prev, speed, gust }));
    if (frameRef.current) frameRef.current = { ...frameRef.current, speed, ...(gust == null ? {} : { gust }) };
    setConnected(true);
    setLastUpdate(new Date());
    setCloudLiveAt(Date.now());
    if (gust != null) {
      if (gust > gustRef.current + 0.05) { gustRef.current = gust; setGustAt(new Date()); }
      else if (gust < gustRef.current - 0.05) { gustRef.current = gust; setGustAt(null); }
    }
    setCloudSeen((prev) => ({ frames: prev.frames + 1 }));
    pushHistory(speed, dirRef.current);
  }, [pushHistory]);

  const fetchData = useCallback(async () => {
    if (demoMode) {
      const d = demoRef.current;
      d.t += 0.1;
      if (demo.manual) {
        // Ручной режим: значения берутся с ползунков как есть. Никакого шума
        // сверху — иначе выставленное число дрожало бы и было бы непонятно,
        // ползунок это или модель.
        d.speed = demo.speed;
        d.dir = demo.dir;
        d.gust = Math.max(demo.speed, demo.speed + demo.gustExtra);
        d.battery = demo.battery;
      } else {
        d.speed = Math.max(0, 8 + Math.sin(d.t * 0.7) * 6 + Math.sin(d.t * 2.1) * 3 + (Math.random() - 0.5) * 2);
        d.dir = (d.dir + Math.sin(d.t * 0.3) * 5 + (Math.random() - 0.5) * 8 + 360) % 360;
        d.gust = Math.max(d.gust, d.speed);
        d.battery = Math.max(3.2, 4.1 - d.t * 0.0005);
      }
      const pct = Math.max(0, Math.min(100, Math.round(((d.battery - 3.0) / 1.2) * 100)));
      setData({
        speed: parseFloat(d.speed.toFixed(2)),
        // Демо моделирует R.M. Young 05103: по паспорту у него 0–100 м/с.
        // На живой станции это поле приходит из прошивки и равно пределу
        // того датчика, который действительно стоит — сейчас 30 м/с.
        // Отсюда и разное место, где загорается кольцо перегрузки.
        direction: Math.round(d.dir), dirPresent: true, speedMax: 100,
        gust: parseFloat(d.gust.toFixed(2)),
        // В ручном режиме светодиоды остаются такими, какими их выставил человек:
        // иначе каждый кадр демо перебивал бы нажатие.
        ...(ledManual.current.auto ? {
          ledGreen: pct > 60 ? "on" : "off",
          ledYellow: d.speed > 5 || (pct >= 30 && pct <= 60) ? "on" : "off",
          ledRed: pct < 10 ? "blink" : d.speed > 15 || (pct >= 10 && pct < 30) ? "on" : "off",
          ledWifi: "on", ledAuto: true,
        } : {
          ledGreen: ledManual.current.green, ledYellow: ledManual.current.yellow,
          ledRed: ledManual.current.red, ledWifi: ledManual.current.wifi, ledAuto: false,
        }),
        battery: parseFloat(d.battery.toFixed(2)), batteryPercent: pct, batteryPresent: true,
        chargeState: pct >= 99 ? "full" : "discharging",
        powerSource: pct >= 99 ? "external" : "battery",
        wifiRssi: -55 + Math.round(Math.sin(d.t * 0.2) * 10),
        adcError: false, hostname: "demo", uptime: Math.floor(d.t * 20),
        resetReason: "poweron",
        // Демо показывает и те датчики, которых на плате нет: иначе панель
        // «Атмосфера» невозможно ни увидеть, ни проверить.
        ...demoAtmosphere(d.t, d.speed, new Date().getHours() + new Date().getMinutes() / 60),
        // Ручные значения перекрывают смоделированные — но только те, что есть
        // на ползунках: свет и УФ по-прежнему идут по солнцу.
        ...(demo.manual ? {
          tempC: demo.tempC, humidity: Math.round(demo.humidity),
          pressureHpa: demo.pressureHpa, rainMm: demo.rainMm,
        } : {}),
      });
      setConnected(true);
      pushHistory(d.speed, d.dir);
      setLastUpdate(new Date());
      return;
    }
    if (source === "district") {
      // Район приходит из интернета своим темпом — раз в пять минут, как его
      // и обновляет модель. Здесь только раскладываем последнее, что пришло.
      const mapped = districtToData(district.weather);
      if (!mapped) { setConnected(false); return; }
      setData(mapped);
      setConnected(true);
      pushHistory(mapped.speed, mapped.direction);
      setLastUpdate(new Date());
      return;
    }
    // Через облако плату не опрашивают вовсе: HTTP до неё снаружи нет, а
    // показания приходят подпиской. Ранний выход не оптимизация — без него
    // дашборд раз в секунду стучался бы в недостижимый адрес и раз в секунду
    // же получал бы setConnected(false) поверх живых облачных кадров.
    if (link === "cloud") return;
    try {
      const res = await fetch(`http://${esp32Host}/api/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyData(await res.json());
    } catch {
      setConnected(false);
    }
  }, [demoMode, source, link, district.weather, esp32Host, applyData, pushHistory, demo]);

  useEffect(() => {
    // Через облако интервал НЕ ЗАВОДИТСЯ вообще — не «заводится и сразу
    // выходит»: опрашивать нечего, а возраст кадра пересчитывается по уже
    // тикающему раз в секунду `time` ниже.
    if (viaCloud) return;
    fetchData();
    // Основной канал — SSE. Опрос остаётся как heartbeat/фолбэк: 1000 ms, not 500 —
    // ESP32 отвечает Connection: close, и каждый опрос держит один из 16 TCP-блоков
    // lwIP все 60 с TIME_WAIT. При живом SSE опрос уходит на раз в 5 с.
    const id = setInterval(fetchData, sseActive && direct ? 5000 : settings.pollMs);
    return () => clearInterval(id);
  }, [fetchData, sseActive, direct, viaCloud, settings.pollMs]);

  useEffect(() => {
    // Поток можно выключить: в сетях, которые рвут долгие соединения, опрос
    // надёжнее, хотя и реже. Без этого выключателя дашборд бесконечно
    // переподключался бы каждые 15 секунд и без толку.
    // Не isStation, а direct: поток идёт по HTTP к самой плате, и через
    // облако его нет ни в каком виде. Условие поправлено целиком — недоделка
    // здесь выглядела бы как EventSource, который пересоздаётся каждые 15 с.
    if (!direct || !settings.useSse) return;
    let es = null, retryId = null, closed = false;
    const open = () => {
      es = new EventSource(`http://${esp32Host}/api/stream`);
      es.onmessage = (e) => {
        try {
          applyData(JSON.parse(e.data));
          setSseActive(true);
        } catch { /* битый кадр — пропускаем */ }
      };
      es.onerror = () => {
        es.close();
        setSseActive(false);
        if (!closed) retryId = setTimeout(open, 15000);
      };
    };
    open();
    return () => {
      closed = true;
      if (es) es.close();
      if (retryId) clearTimeout(retryId);
      setSseActive(false);
    };
  }, [direct, esp32Host, applyData, settings.useSse]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Где стоит сама станция. Спрашивается один раз: координаты в прошивке
  // константы из secrets.h и в течение сеанса не меняются. Нужны карте — на
  // копии, отданной платой по HTTP, браузер отказывается сообщать место
  // *смотрящего*, так что место *станции* остаётся единственной реальной точкой.
  useEffect(() => {
    if (!isStation) { setSite(null); return; }
    // Через облако /api/site недостижим так же, как и всё остальное HTTP.
    // Координаты в этом случае берутся из кадра (siteLat/siteLon/siteAltM)
    // или из каталога станций — собирается это ниже, в siteInfo, потому что
    // источник надо не только подставить, но и подписать.
    if (viaCloud) { setSite(null); return; }
    let alive = true;
    fetch(`http://${esp32Host}/api/site`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setSite(j); })
      .catch(() => { /* старая прошивка без этого эндпоинта — просто нет метки */ });
    return () => { alive = false; };
  }, [isStation, viaCloud, esp32Host]);

  // Сведения о точке доступа нужны только на вкладке «система» и почти не меняются —
  // тянем их отдельно и редко, чтобы не мешать потоку данных.
  useEffect(() => {
    // Именно direct: у /api/wifi нет CORS и он живёт на плате, так что по
    // облаку недостижим принципиально, а не «пока не сделали».
    if (!direct || tab !== "system") return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`http://${esp32Host}/api/wifi`);
        if (r.ok && alive) setAp(await r.json());
      } catch { if (alive) setAp(null); }
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [direct, esp32Host, tab]);

  // ---------- облачный канал ----------
  // Модуль подтягивается ОБЫЧНЫМ динамическим импортом и только отсюда: ни
  // chunk(), ни warmUp(). warmUp дёргает загрузку безусловно через четыре
  // секунды и глотает отказ — на копии, отданной платой, это был бы 404 при
  // каждом открытии страницы, причём молча.
  const cloudId = activeStation && activeStation.cloudId ? activeStation.cloudId : null;
  // motion читается через ref нарочно: смена «плавности» в настройках не
  // должна рвать и пересоздавать соединение с брокером.
  const motionRef = useRef(motion);
  useEffect(() => { motionRef.current = motion; }, [motion]);

  useEffect(() => {
    if (!viaCloud || !cloudId) return;
    let alive = true;
    let live = null;
    let statsTimer = null;
    setCloudPhase("connecting");
    setCloudOnline(null);
    setCloudSession(null);
    setCloudLiveAt(null);
    setCloudStateAt(null);
    setCloudSeen({ frames: 0 });
    setCloudStats(null);

    loadCloud().then((mod) => {
      if (!alive) return;
      if (!mod) { setCloudPhase("failed"); return; }
      // Окончательный, третий ответ про учётку: до загрузки было известно
      // только то, что модуль вошёл в сборку.
      setCloudAvail(!!mod.CLOUD_CONFIGURED);
      if (!mod.CLOUD_CONFIGURED) { setCloudPhase("failed"); return; }
      try {
        live = mod.connect({ ...cloudOpts(cloudId), motionOff: motionRef.current === "off" });
      } catch {
        setCloudPhase("failed");
        return;
      }
      live.onState((json, meta) => {
        if (!alive || !json) return;
        const retained = !!(meta && meta.retained);
        setCloudSession(json.sessionId ?? null);
        setCloudStateAt({ at: Date.now(), retained, epoch: json.epoch ?? null, timeValid: !!json.timeValid });
        applyData(json, { live: !retained });
      });
      live.onStatus((st) => { if (alive) setCloudOnline(!!(st && st.online)); });
      live.onLive((f) => { if (alive) applyCloudLive(f); });
      live.onPhase((phase) => { if (alive) setCloudPhase(phase); });
      // Раз в две секунды, и это не опрос сети: цифры уже лежат в буфере
      // воспроизведения на этой же странице. Чаще незачем — кадр идёт раз в
      // 50 мс, а человек читает карточку глазами.
      if (live.stats) {
        statsTimer = setInterval(() => { if (alive) setCloudStats(live.stats()); }, 2000);
      }
    }).catch(() => { if (alive) setCloudPhase("failed"); });

    return () => {
      alive = false;
      if (statsTimer) clearInterval(statsTimer);
      if (live) { try { live.close(); } catch { /* уже закрыт */ } }
    };
  }, [viaCloud, cloudId, applyData, applyCloudLive]);

  // Второй уровень из трёх — «у ЭТОЙ станции канала нет». Это не состояние
  // соединения, а его невозможность, и потому оно ПРОИЗВОДНОЕ от выбранной
  // станции, а не записанное в тот же useState: подключаться некуда, значит
  // и стадии подключения не существует.
  const cloudPhase = viaCloud && !cloudId ? "failed" : cloudPhaseState;

  // Фолбэк в демо — РОВНО ОДИН РАЗ за сеанс. Ручной выбор источника снимает
  // отметку (см. setSource), поэтому человек, вернувший «станцию», больше не
  // выбрасывается обратно на следующем тике.
  useEffect(() => {
    if (cloudPhase !== "failed" || !viaCloud || fellBackRef.current) return;
    fellBackRef.current = true;
    setFellBack(true);
    setSourceState("demo");
  }, [cloudPhase, viaCloud]);

  // Оптимистичный апдейт: сразу меняем локальный state, чтобы кнопка не ждала цикл
  // опроса. Следующий кадр подтвердит или откатит значение с железа.
  // Выход ДО оптимистичного апдейта, а не после: через облако команду
  // отправить нечем (она обязана быть подписанной и уходит только с прямого
  // канала), и нарисованный «переключившийся» светодиод через пять секунд
  // отыграл бы назад следующим кадром — выглядело бы как «плата сама вернула
  // как было». Панель в этом режиме к тому же readOnly, так что сюда
  // попасть нельзя; проверка на всякий случай, а не вместо неё.
  const setLed = async (key, nextValue) => {
    if (viaCloud) return;
    const k = `led${key.charAt(0).toUpperCase() + key.slice(1)}`;
    ledManual.current[key] = nextValue;
    setData((prev) => ({ ...prev, [k]: nextValue }));
    if (!direct) return;
    // Связь рвётся; следующий кадр опроса всё равно вернёт настоящее
    // состояние, поэтому потерянный запрос молча забываем.
    try { await fetch(`http://${esp32Host}/api/led?${key}=${nextValue}`); } catch {}
  };

  const toggleAuto = async () => {
    if (viaCloud) return;
    const nextValue = !data.ledAuto;
    // Уходя в ручной режим, берём то, что горит сейчас, как исходную точку.
    ledManual.current = { auto: nextValue, green: data.ledGreen, yellow: data.ledYellow, red: data.ledRed, wifi: data.ledWifi };
    setData((prev) => ({ ...prev, ledAuto: nextValue }));
    if (!direct) return;
    try { await fetch(`http://${esp32Host}/api/led?auto=${nextValue}`); } catch {}
  };

  // ---------- модем и облако: только по требованию ----------
  // ⛔ Периодически /api/modem НЕ ОПРАШИВАТЬ. `?radio=1` — это четыре AT-раунда
  // синхронно в loop(), а loop() держит 50-герцовый опрос датчика. Блокировка
  // видна ровно в loopMax — то есть регулярный опрос ИСПОРТИЛ БЫ СОБСТВЕННУЮ
  // метрику этой же карточки. Поэтому: голый запрос один раз при открытии
  // вкладки, всё остальное — отдельными кнопками с подписью, во что это
  // обходится плате.
  //
  // Аргумент обязан быть вида `?radio=1`: WebServer выбрасывает аргумент без
  // знака равенства до того, как до него дойдёт hasArg(), и эндпоинт отвечает
  // так, будто ничего не спрашивали. Молча.
  // `reset` — забыть прошлый ответ перед новым запросом. Нужно при смене
  // станции: иначе до прихода ответа (а он может идти 15 с) на карточке
  // висели бы цифры ЧУЖОЙ платы. У кнопки «ОБНОВИТЬ» его нет намеренно —
  // сорвавшееся обновление не должно стирать то, что уже показано.
  const askEndpoint = useCallback(async (path, setter, busyKey, reset) => {
    if (reset) setter(null);
    setSysBusy(busyKey);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(`http://${esp32Host}${path}`, { signal: ctl.signal });
      // 404 — не ошибка связи, а ответ: этой сборки прошивки такой части не
      // досталось (HAS_MODEM 0, SECRET_HAS_CLOUD 0). Панель тогда исчезает.
      if (r.status === 404) { setter(false); return; }
      if (!r.ok) throw new Error(String(r.status));
      setter(await r.json());
    } catch {
      setter((prev) => (prev === null ? false : prev));
    } finally {
      clearTimeout(timer);
      setSysBusy("");
    }
  }, [esp32Host]);

  const askModem = useCallback((q, reset) => askEndpoint(`/api/modem${q ? `?${q}=1` : ""}`, setModem, q || "modem", reset), [askEndpoint]);
  const askCloudApi = useCallback((reset) => askEndpoint("/api/cloud", setCloudApi, "cloud", reset), [askEndpoint]);

  // По одному разу при открытии вкладки. Не интервал — см. комментарий выше.
  useEffect(() => {
    if (!direct || tab !== "system") return;
    askModem(null, true);
    askCloudApi(true);
  }, [direct, tab, esp32Host, askModem, askCloudApi]);


  // Удержание экрана. Блокировка теряется при уходе страницы в фон, поэтому
  // её приходится брать заново по возвращении — иначе настройка «работает»
  // только до первого переключения приложения.
  useEffect(() => {
    if (!settings.keepAwake || !navigator.wakeLock) return;
    let lock = null, alive = true;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      } catch { /* нет разрешения или не защищённый контекст */ }
    };
    const onVis = () => { if (alive && document.visibilityState === "visible" && !lock) acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      if (lock) lock.release().catch(() => {});
    };
  }, [settings.keepAwake]);

  // Остальные части подтягиваются молча, пока читаются показания на первом
  // экране. Пауза перед началом обязательна: иначе они полезли бы в канал
  // одновременно с первым запросом данных и замедлили бы ровно то, ради чего
  // дашборд и открывают.
  useEffect(() => warmUp([Meteorology, WorldMap, LiveWatch]), []);

  // ---------- станции ----------
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch { /* приватный режим */ }
  };

  const selectStation = (st) => {
    setEsp32Host(st.host);
    try { localStorage.setItem("esp32_host", st.host); } catch { /* приватный режим */ }
    setActiveStationId(st.id);
    // setSource("station") теперь БЕЗУСЛОВНО. Прежняя оговорка про PUBLIC_COPY
    // существовала ровно потому, что «станция» на HTTPS была заведомо мёртвой:
    // выбрать её значило получить OFFLINE. Причина исчезла — у станции с
    // облачным идентификатором есть живой канал и с публичной копии.
    setSource("station");
    // Канал выбирается сам: на публичной копии (и когда адреса просто нет)
    // прямого HTTP не будет, значит остаётся облако — если станции есть чем.
    setLink(st.cloudId && (PUBLIC_COPY || !st.host) ? "cloud" : "direct");
  };

  const findNearest = async () => {
    setGeoBusy(true);
    setWelcomeMsg(null);
    try {
      const here = await requestPosition();
      const located = stations.filter((s) => s.lat != null && s.lon != null);
      if (!located.length) {
        setWelcomeMsg({
          text: stations.length
            ? "Место определено, но ни у одной сохранённой станции нет координат. Откройте «подключить свою станцию» и привяжите её к месту."
            : "Место определено, но сохранённых станций нет. Общего каталога станций не существует — станции автономны и о себе никуда не сообщают. Добавьте свою.",
        });
        return;
      }
      const nearest = located
        .map((s) => ({ s, km: distanceKm(here, { lat: s.lat, lon: s.lon }) }))
        .sort((a, b) => a.km - b.km)[0];
      selectStation(nearest.s);
      // ⚠️ Условие ужато намеренно. Текст ниже говорит «показания не
      // подтянуть», и он не должен появляться рядом с идущими показаниями:
      // у станции с облачным идентификатором они как раз идут.
      if (PUBLIC_COPY && !nearest.s.cloudId) {
        setWelcomeMsg({
          text: `Ближайшая — «${nearest.s.name}», ${formatDistance(nearest.km)}. Показания с этой страницы не подтянуть: у этой станции не заполнен идентификатор в облаке, а напрямую сюда не достучаться — страница отдаётся по HTTPS, станция отвечает по HTTP, и такой запрос браузер блокирует. Откройте её напрямую:`,
          href: `http://${nearest.s.host}/`,
        });
      } else {
        setWelcomeMsg({ text: `Подключаюсь к «${nearest.s.name}» — ${formatDistance(nearest.km)}.` });
        setTimeout(dismissWelcome, 1400);
      }
    } catch (e) {
      setWelcomeMsg({ text: geoErrorText(e) });
    } finally {
      setGeoBusy(false);
    }
  };

  const locateForNew = async () => {
    setGeoBusy(true);
    setTestResult("");
    try {
      setNewCoords(await requestPosition());
    } catch (e) {
      setTestResult(geoErrorText(e));
    } finally {
      setGeoBusy(false);
    }
  };

  const testStation = async ({ host, cloudId: formCloudId }) => {
    setTestResult("");
    // Заполнено облачное поле — проверяем ОБЛАКО, а не адрес. Это и убирает
    // прежний тупик: на публичной копии проверить было нечем вообще, и
    // кнопка возвращала объяснение вместо ответа.
    if (formCloudId) {
      if (!cloudAvail) {
        setTestResult(
          "В эту сборку дашборда учётка зрителя не попала, поэтому читать облако отсюда нечем. " +
          "Идентификатор всё равно можно сохранить — он заработает в сборке с облаком."
        );
        return;
      }
      setTestBusy(true);
      try {
        const mod = await loadCloud();
        if (!mod || !mod.CLOUD_CONFIGURED) throw new Error("нет модуля");
        const r = await mod.probeStatus({ ...cloudOpts(formCloudId), timeoutMs: 10000 });
        if (!r || !r.ok) {
          setTestResult(
            `Брокер не подтвердил станцию «${formCloudId}»${r && r.error ? `: ${r.error}` : ""}. ` +
            "Проверьте идентификатор — это то же имя, что записано в secrets.h."
          );
        } else if (r.online) {
          setTestResult(`Станция «${formCloudId}» на связи через облако.`);
        } else {
          setTestResult(
            `Станция «${formCloudId}» в облаке известна, но сейчас офлайн. Идентификатор верный — ` +
            "показания появятся, когда плата выйдет на связь."
          );
        }
      } catch {
        setTestResult("Не вышло спросить брокер. Проверьте, есть ли у этого устройства интернет.");
      } finally {
        setTestBusy(false);
      }
      return;
    }
    if (PUBLIC_COPY) {
      setTestResult(
        `Отсюда проверить нельзя: страница открыта по HTTPS, а станция отвечает по HTTP — такой запрос браузер блокирует. ` +
        `Сохраните станцию и откройте её напрямую по адресу http://${host}/ ` +
        (cloudAvail
          ? "Либо заполните «идентификатор в облаке», если у станции есть модем, — тогда её будет видно и отсюда."
          : "")
      );
      return;
    }
    setTestBusy(true);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`http://${host}/api/data`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      setTestResult(`Станция ответила: ветер ${j.speed} м/с, аптайм ${Math.floor((j.uptime ?? 0) / 60)} мин.`);
    } catch {
      setTestResult("Станция не ответила. Проверьте, что устройство подключено к её сети и адрес указан верно.");
    } finally {
      setTestBusy(false);
    }
  };

  const saveStation = ({ name, host, via, cloudId: newCloudId }) => {
    const st = {
      id: newStationId(),
      name, host, via,
      ...(newCloudId ? { cloudId: newCloudId } : {}),
      lat: newCoords ? newCoords.lat : null,
      lon: newCoords ? newCoords.lon : null,
    };
    // Ключ — облачный идентификатор, если он есть, и только иначе адрес.
    // По одному host дедуплицировать больше нельзя: DEFAULT_HOST одинаков у
    // любой станции в режиме точки доступа, и вторая мачта затирала бы первую.
    const key = stationKey(st);
    const next = [...stations.filter((s) => stationKey(s) !== key), st];
    setStations(next);
    persistStations(next);
    selectStation(st);
    setShowAdd(false);
    setNewCoords(null);
    setTestResult("");
    dismissWelcome();
  };

  const removeStation = (id) => {
    const next = stations.filter((s) => s.id !== id);
    setStations(next);
    persistStations(next);
  };

  // ---------- автоподключение своей станции ----------
  // Установленная программа живёт отдельно от платы, и адрес по умолчанию
  // (имя от DNS самой платы) работает только внутри её точки доступа. Поэтому,
  // пока связи нет, дашборд сам ищет плату — известные адреса, обычные имена,
  // потом свою подсеть — и подключается, ничего не спрашивая. Станция, найденная
  // впервые, сохраняется как «Моя станция» (флаг auto: её адрес потом обновляется).
  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const autoBusy = useRef(false);
  useEffect(() => {
    if (SERVED_FROM_STATION || PUBLIC_COPY || demoMode || source !== "station" || link !== "direct" || connected) return undefined;
    let dead = false, timer = 0;
    const ctl = new AbortController();
    const run = async () => {
      if (dead || autoBusy.current) return;
      autoBusy.current = true;
      let res = null;
      try {
        const list = stationsRef.current;
        res = await discover([esp32Host, ...list.map((x) => x.ip), ...list.map((x) => x.host)], ctl.signal);
      } catch { /* сеть недоступна */ }
      autoBusy.current = false;
      if (dead) return;
      if (!res) { timer = setTimeout(run, 20000); return; }
      const ip = res.j.staIp && res.j.staConnected ? res.j.staIp : null;
      const list = stationsRef.current;
      const hit = list.find((x) => x.host === res.host) || list.find((x) => x.auto);
      if (hit) {
        const upd = { ...hit, host: res.host, ...(ip ? { ip } : {}) };
        const next = list.map((x) => (x.id === hit.id ? upd : x));
        setStations(next); persistStations(next);
        selectStation(upd);
      } else {
        const st = { id: newStationId(), name: "Моя станция", host: res.host, via: "lan", auto: true, lat: null, lon: null, ...(ip ? { ip } : {}) };
        const next = [...list, st];
        setStations(next); persistStations(next);
        selectStation(st);
      }
      setShowWelcome(false);
    };
    timer = setTimeout(run, 4000);
    return () => { dead = true; clearTimeout(timer); ctl.abort(); autoBusy.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, demoMode, source, link, esp32Host]);

  // Пока связь есть — запоминаем домашний адрес платы: имя .local на части
  // устройств не резолвится, а IP остаётся запасным ходом для следующего запуска.
  useEffect(() => {
    if (!connected || SERVED_FROM_STATION || PUBLIC_COPY || !data || !data.staConnected || !data.staIp) return;
    const cur = stationsRef.current.find((x) => x.id === activeStationId);
    if (!cur || cur.ip === data.staIp) return;
    const next = stationsRef.current.map((x) => (x.id === cur.id ? { ...x, ip: data.staIp } : x));
    setStations(next); persistStations(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, data && data.staIp]);

  const resetGust = async () => {
    if (demoMode) {
      demoRef.current.gust = demoRef.current.speed;
      setData((prev) => ({ ...prev, gust: parseFloat(demoRef.current.speed.toFixed(2)) }));
      return;
    }
    // Порыв района считает модель — сбрасывать его нечему и незачем:
    // следующий же кадр вернул бы прежнее число.
    if (source === "district") return;
    // ⚠️ Проверка стоит ДО fetch, а не после. Здесь был голый await fetch без
    // try: на публичной копии каждое нажатие давало непойманный TypeError в
    // консоль и ничего больше.
    if (!direct) return;
    try { await fetch(`http://${esp32Host}/api/gust`); } catch { /* связь рвётся */ }
  };

  // ---------- производные ----------
  const bf = beaufort(data.speed);
  // «По Бофорту» — цвет зависит от силы ветра, остальные варианты постоянные.
  // monoAccent (монохромная роза ветров) включается на всём, что не Бофорт:
  // раскрашивать розу шестью оттенками поверх одноцветного интерфейса глупо.
  const accentPick = ACCENTS[settings.accent] || ACCENTS.bft;
  const monoAccent = settings.accent !== "bft";
  const accent = settings.customAccent || accentPick.color || bf.color;
  // Предел ширины считается здесь, а не рядом с сеткой: от него зависит фон,
  // а фон собирается до разметки. Дорожки берут это же число ниже.
  // «Обычная» ширина растёт вместе с экраном: крупные блоки прибавляют понемногу
  // (1080 → ~1340 на 1920, ~1660 на 2560), а мелочь — шапка, значок, батарея, пульт —
  // увеличивается сильнее через zoom (--zs: 1 → 1.25 на 1920, 1.6 на 2560 и выше).
  // Сетка блоков при этом не масштабируется: на ней держатся перетаскивание и растягивание.
  const pageOpt = WIDTHS[settings.pageWidth] || WIDTHS.normal;
  const pageMax = pageOpt === WIDTHS.normal ? Math.round(1080 + Math.max(0, viewportW - 1400) * 0.5) : pageOpt.px;
  const zs = viewportW > 1500 ? Math.round(Math.min(1.6, 1 + (viewportW - 1500) / 1000 * 0.6) * 100) / 100 : 1;
  const pageWide = { maxWidth: pageMax > 0 ? pageMax : "none" };
  const backdrop = backdropCss(settings, bgImage, pageMax);
  const hasDir = data.dirPresent && data.direction != null;
  const hasBattery = data.batteryPresent && data.battery != null;
  const unit = UNITS[settings.unit] ?? UNITS.ms;
  // Ни одного кадра от текущего источника (история сбрасывается при его смене):
  // показываем прочерки, а не нули из EMPTY_DATA — «0.0 м/с» это штиль, а не
  // «станция молчит». Когда станция пропала уже после данных, остаются её
  // последние цифры, а о связи говорит шапка.
  const noData = !connected && history.length === 0;
  const uptimeMin = Math.floor(data.uptime / 60);
  const uptimeH = Math.floor(uptimeMin / 60);
  // Приписка к аптайму: почему плата стартовала в прошлый раз. Обычное включение
  // ничего не приписывает — в норме это шум. А вот «просадка» рядом с маленьким
  // аптаймом сразу отвечает на вопрос, который иначе выглядит как «станция не
  // пускает телефон»: питание не держит передачу, и плата уходит в ресет.
  const RESET_WHY = {
    brownout: "просадка", panic: "сбой", watchdog: "зависание",
    software: "перезапуск", external: "кнопка EN", deepsleep: "сон",
    unknown: "причина?",
  };
  const resetWhy = RESET_WHY[data.resetReason];
  const rssi = rssiQuality(data.wifiRssi);
  const CHARGE_VIEW = { charging: "заряжается", full: "заряжена", discharging: "разряд" };
  const POWER_VIEW = { external: "от сети", battery: "от батареи" };
  const ageSec = lastUpdate ? Math.round((time - lastUpdate) / 1000) : null;
  const lastUpdateStr = ageSec == null ? "—" : `${ageSec}с`;

  // ---------- виджеты Android ----------
  // Пока приложение открыто, виджет на рабочем столе получает последнее показание
  // отсюда (WKNative.widget → WindWidget.java), раз в 5 секунд. Без приложения он
  // ходит на плату сам по host — поэтому вместе с кадром уезжают адрес и тип связи.
  // Интервал, а не эффект на data: кадры идут 20 раз в секунду, а «нет связи»
  // кадров не шлёт вовсе — виджет должен узнать и об этом.
  const widgetRef = useRef(null);
  widgetRef.current = { d: data, c: connected, src: source, unit: settings.unit, host: esp32Host, link };
  useEffect(() => {
    // Тот же кадр уходит и виджетам Windows (window.wkWidget, desktop/widgets.js).
    const n = typeof window !== "undefined" ? window.WKNative : null;
    const w = typeof window !== "undefined" ? window.wkWidget : null;
    const nOk = n && typeof n.widget === "function";
    if (!nOk && !w) return;
    const push = () => {
      const j = JSON.stringify(widgetRef.current);
      try { if (nOk) n.widget(j); } catch { /* мост занят — следующий раз */ }
      try { if (w) w.push(j); } catch { /* оболочка без виджетов */ }
    };
    const first = setTimeout(push, 1500);
    const id = setInterval(push, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  // ---------- место станции ----------
  // Три источника, и каждый подписывается явно. Выдавать введённое человеком
  // за телеметрию нельзя: координаты из каталога он вбил руками и мог
  // ошибиться, а метка на карте выглядит одинаково убедительно в обоих случаях.
  const siteInfo = useMemo(() => {
    if (!isStation) return null;
    if (site && Number.isFinite(site.lat) && Number.isFinite(site.lon)) {
      return { lat: site.lat, lon: site.lon, altM: site.altM, host: site.host, from: "api" };
    }
    if (Number.isFinite(data.siteLat) && Number.isFinite(data.siteLon)) {
      return { lat: data.siteLat, lon: data.siteLon, altM: data.siteAltM, host: data.hostname, from: "frame" };
    }
    if (activeStation && activeStation.lat != null && activeStation.lon != null) {
      return { lat: activeStation.lat, lon: activeStation.lon, altM: null, host: activeStation.host, from: "catalog" };
    }
    return null;
  }, [isStation, site, data.siteLat, data.siteLon, data.siteAltM, data.hostname, activeStation]);
  // 0/0 в secrets.h означает «не настроено», а не точку в Гвинейском заливе —
  // то же правило, по которому карта не рисует там метку.
  const siteUnset = !!siteInfo && siteInfo.lat === 0 && siteInfo.lon === 0;
  // Подпись «из кадра» зависит от канала, а не от источника поля: те же
  // siteLat/siteLon приходят в кадре и по прямому каналу, если /api/site
  // на этой сборке прошивки ещё нет. Написать там «из облака» значило бы
  // соврать про то, откуда взялась цифра.
  // ---------- журнал, прогноз, тревоги, киоск ----------
  // Журнал ведётся только у настоящей станции, ключ — её запись в каталоге
  // (облачный id или адрес): у двух мачт разные журналы.
  const logKey = isStation ? (stationKey(activeStation) || esp32Host) : null;
  logKeyRef.current = logKey;
  useEffect(() => { prune(); }, []);
  const events = useEvents(logKey);
  const coords = siteInfo && !(siteInfo.lat === 0 && siteInfo.lon === 0)
    ? { lat: siteInfo.lat, lon: siteInfo.lon }
    : district.coords || null;
  const fc = useForecast(coords);
  const fcNow = useMemo(() => {
    if (!fc || !fc.length) return null;
    const now = Date.now();
    return fc.reduce((a, b) => (Math.abs(b.t - now) < Math.abs(a.t - now) ? b : a)).s;
  }, [fc]);
  useAlerts({ settings, data, history, connected: connected && !demoMode, desc: bf.desc, logKey, fc, onStorm: () => setKiosk(true) });
  useNotifier({ settings, data, connected: connected && !demoMode, desc: bf.desc, fc, isStation });
  // Полоса прокрутки — жидкое стекло и плавная прокрутка колесом (wind-scroll.js).
  useEffect(() => mountGlassScroll(), []);
  const [kiosk, setKiosk] = useState(false);
  // Последнее показание, пока станция молчит: в строке над приборами вместо
  // голого «не отвечает» — что и когда было в последний раз.
  const lastSeen = useMemo(() => (logKey && !connected ? loadLastFrame(logKey) : null), [logKey, connected]);
  // Облачная проверка для блока «Подключение» — возвращает текст, а не пишет в state.
  const cloudProbeText = async (id) => {
    if (!cloudAvail) return "В эту сборку дашборда учётка зрителя не попала — читать облако отсюда нечем. Идентификатор всё равно сохранится.";
    try {
      const mod = await loadCloud();
      if (!mod || !mod.CLOUD_CONFIGURED) throw new Error("нет модуля");
      const r = await mod.probeStatus({ ...cloudOpts(id), timeoutMs: 10000 });
      if (!r || !r.ok) return `Брокер не подтвердил станцию «${id}»${r && r.error ? `: ${r.error}` : ""}.`;
      return r.online ? `Станция «${id}» на связи через облако.` : `Станция «${id}» известна брокеру, но сейчас офлайн.`;
    } catch { return "Не вышло спросить брокер. Есть ли у этого устройства интернет?"; }
  };
  const SITE_FROM = {
    api: "ИЗ /API/SITE",
    frame: viaCloud ? "ИЗ ОБЛАКА" : "ИЗ КАДРА",
    catalog: "ИЗ КАТАЛОГА",
  };

  // ---------- строка состояния ----------
  // Одно место вместо цепочки тернарников в разметке. Главное отличие от
  // прежней логики: !connected БОЛЬШЕ НЕ СТОИТ ПЕРВЫМ. На холодном старте
  // станция молчит 25–45 секунд, и всё это время человек читал «НЕТ СВЯЗИ» —
  // надпись про поломку там, где идёт штатный запуск.
  const cloudLiveAge = cloudLiveAt == null ? null : time - cloudLiveAt;
  const linkView = useMemo(() => {
    if (demoMode) return { text: fellBack ? "ДЕМО · ОБЛАКО МОЛЧИТ" : "ДЕМО", live: true };
    if (source === "district") return { text: "РАЙОН", live: connected };
    if (viaCloud) {
      if (cloudPhase === "connecting") return { text: "ПОДКЛЮЧАЮСЬ К ОБЛАКУ", live: false };
      if (cloudPhase === "failed") return { text: "ОБЛАКО НЕ ОТВЕТИЛО", live: false };
      if (cloudOnline === false) return { text: "СТАНЦИЯ ОФЛАЙН", live: false };
      if (cloudLiveAge != null && cloudLiveAge < 3000) return { text: "ПОТОК ОБЛАКА", live: true };
      return { text: "КАДРЫ ОБЛАКА · 5 С", live: true };
    }
    if (!connected) return { text: "НЕТ СВЯЗИ", live: false };
    return { text: sseActive ? "ПОТОК SSE" : "ОПРОС HTTP", live: true };
  }, [demoMode, fellBack, source, viaCloud, cloudPhase, cloudOnline, cloudLiveAge, connected, sseActive]);

  // Сбросить порыв можно там, где сброс что-то меняет: в демо это локальная
  // модель, на прямом канале — команда плате. Через облако команду отправить
  // нечем, и кнопка, которая ничего не делает, хуже отсутствующей.
  const canResetGust = demoMode || direct;
  // Был ли хоть один кадр. Нужно именно здесь: начальное состояние `data` уже
  // содержит ключи hostname/uptime/resetReason/wifiRssi, поэтому проверка
  // `f in src` внутри RowMaybe ответит true ещё до первого ответа станции.
  const frameSeen = lastUpdate != null || connected;

  // Окно графика — подмножество общего буфера: буфер держит 10 минут всегда,
  // чтобы конвективный анализ не терял основание при узком окне графика.
  const windowHist = useMemo(() => history.slice(-histLen), [history, histLen]);
  const analysis = useMemo(() => analyze(windowHist, data.speedMax ?? 30), [windowHist, data.speedMax]);

  const gustText = useMemo(
    () => convertSpeed(data.gust, settings.unit, settings.digits),
    [data.gust, settings.unit, settings.digits]
  );
  const meanText = analysis ? convertSpeed(analysis.mean, settings.unit, settings.digits) : "—";
  const lullText = analysis ? convertSpeed(analysis.lull, settings.unit, settings.digits) : "—";
  const peakText = analysis ? convertSpeed(analysis.peak, settings.unit, settings.digits) : "—";

  const speedSeries = useMemo(() => windowHist.map((h) => h.s), [windowHist]);
  const dirSeries = useMemo(
    () => unwrapAngles(windowHist.filter((h) => h.d != null).map((h) => h.d)),
    [windowHist]
  );

  // Тревога по ветру. Считается от того же, что видит человек на шкале, —
  // от текущей скорости и порыва, а не от статистики за окно.
  // Непрерывного и сглаженного угла здесь больше нет (0.2.525). Когда-то их
  // считали тут для двух приборов сразу, но приборы давно получают сырое
  // направление (WindCompass разворачивает и сглаживает его сам), а угол
  // остался — и перерисовывал весь дашборд: лишний рендер на каждый кадр
  // данных и ещё по одному на каждый кадр экрана, пока направление менялось.

  // Тот же порог, что и у второго круга: 50 м/с — граница мощного урагана.
  const overWind = Math.max(0, data.speed - OVER_FROM);
  const overloaded = overWind > 0.05;
  const overFrac = clamp01(overWind / OVER_SPAN);

  const alarmLevel = alarmOf(data.speed, data.gust, settings.alarmMs);
  const alarm = ALARM_VIEW[alarmLevel];

  const lvl = analysis ? LEVELS[analysis.level] : PENDING;

  // Датчики, которые прошивка действительно прислала. Флаг присутствия —
  // единственный критерий: значение без флага показывать нельзя, потому что
  // отсутствующий датчик и датчик, показавший ноль, — разные вещи.
  const sensors = useMemo(() => OPTIONAL_SENSORS
    .filter((sn) => data[sn.flag] && Number.isFinite(data[sn.value]))
    .map((sn) => ({ ...sn, v: data[sn.value] })), [data]);

  // Производные — только когда есть из чего считать.
  const dew = data.tempPresent && data.humidityPresent ? dewPoint(data.tempC, data.humidity) : null;
  const chill = data.tempPresent ? windChill(data.tempC, data.speed) : null;

  // Уведомление о шквале. Срабатывает на переходе, а не на состоянии: пока
  // критерий выполняется, он выполняется минутами, и повторять сообщение каждый
  // кадр значило бы завалить человека уведомлениями ровно в тот момент, когда
  // ему не до телефона.
  const squallWasOn = useRef(false);
  useEffect(() => {
    const on = !!(analysis && analysis.squall);
    const rising = on && !squallWasOn.current;
    squallWasOn.current = on;
    if (!rising || !settings.notifySquall || quietNow(settings)) return;
    // Через общие ворота: на Android — родное уведомление, везде — лимит 33 в сутки.
    pushNote("Шквал", `Рост ${analysis.rise.toFixed(1)} м/с, пик ${analysis.peak.toFixed(1)} м/с — критерий ВМО выполнен.`,
             "wind-squall", { every: 15 * 60000, urgent: true });
  }, [analysis, settings.notifySquall]);

  // Всё, что за краем экрана, — на паузу: анимации за кадром не видны, но считаются.
  useEffect(() => {
    return watchOffscreen();
  }, []);

  // Что показывает раздвинутая панель внизу. dockView держится ещё на время
  // закрытия, чтобы содержимое не пропало раньше, чем панель сомкнётся.
  // Сама панель стоит в дереве всегда (закрытая, 0fr), поэтому у перехода
  // есть «до» и без отложенного старта.
  const dockWant = showSettings ? "settings" : (demoMode && showDemo ? "demo" : null);
  const dockPos = ["top", "left", "right"].includes(settings.dockPos) ? settings.dockPos : "bottom";
  const [dockView, setDockView] = useState(null);
  const [dockOpen, setDockOpen] = useState(false);
  // Закрытие — такая же анимация, как открытие, только обратная: панель
  // сначала медленно трогается, потом сходится, и капсула оседает. Раньше
  // сворачивание шло той же пружинной кривой, что раскрытие, а у неё почти
  // всё движение — в первые 150 мс: панель захлопывалась.
  const [dockClosing, setDockClosing] = useState(false);
  const dockWas = useRef(false);
  useEffect(() => {
    if (dockWant) {
      setDockView(dockWant);
      setDockOpen(true);
      setDockClosing(false);
      dockWas.current = true;
      return undefined;
    }
    setDockOpen(false);
    if (!dockWas.current) return undefined;
    dockWas.current = false;
    setDockClosing(true);
    // Содержимое убирается, когда панель РЕАЛЬНО сомкнулась (transitionend), а не по
    // таймеру: длительности анимаций меняются (в 0.4.11 они выросли на треть, а
    // таймер остался прежним), и последние ~25 px высоты — поля прокручиваемого
    // блока — схлопывались рывком в момент, когда содержимое уходило из дерева.
    // Таймер остался запасным — на случай, если событие не придёт (движение выключено).
    const done = () => { setDockView(null); setDockClosing(false); };
    const panel = document.querySelector(".dock-panel");
    const onEnd = (e) => { if (e.target === panel && /^grid-template/.test(e.propertyName)) { clearTimeout(t); done(); } };
    const t = setTimeout(() => { if (panel) panel.removeEventListener("transitionend", onEnd); done(); }, 2200);
    if (panel) panel.addEventListener("transitionend", onEnd);
    return () => { clearTimeout(t); if (panel) panel.removeEventListener("transitionend", onEnd); };
  }, [dockWant]);
  const toggleSettings = () => { setShowDemo(false); setShowSettings((v) => !v); };
  const toggleDemo = () => { setShowSettings(false); setShowDemo((v) => !v); };

  const TABS = [
    { id: "wind", label: "Метео данные" },
    { id: "meteo", label: "Метеорология", short: "Метео" },
    { id: "radar", label: "Радар" },
    { id: "area", label: "Район" },
    { id: "analysis", label: "Анализ" },
    { id: "system", label: "Станция" },
  ];

  // Стрелки влево/вправо переключают вкладки; на краю останавливаются.
  // Не мешаем вводу (поля, ползунки, списки) и окнам поверх страницы.
  const tabKeyRef = useRef(null);
  tabKeyRef.current = { tab, TABS, blocked: showSettings || showUpdate || layoutMode };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const { tab: cur, TABS: list, blocked } = tabKeyRef.current;
      if (blocked) return;
      const i = list.findIndex((t) => t.id === cur);
      const next = list[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) { e.preventDefault(); setTab(next.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const utc = `${String(time.getUTCHours()).padStart(2, "0")}:${String(time.getUTCMinutes()).padStart(2, "0")}:${String(time.getUTCSeconds()).padStart(2, "0")}`;

  // Полосы под кольцом скорости: последние 10 минут (или сколько есть) на
  // 12 отрезков; яркая — средняя за отрезок, бледная — максимум. История
  // пишется раз в секунду, поэтому столбики меняются тоже не чаще.
  const speedBars = useMemo(() => {
    const n = Math.min(history.length, 600);
    // Пока истории нет, столбики всё равно стоят — пустыми: окно одной и той
    // же высоты, есть данные или нет, и место под полосы не зияет пустотой.
    if (n < 24) return { bars: Array.from({ length: 12 }, () => ({ wind: 0, gust: 0, t: "данных пока нет" })),
      legend: "ветер станции за последние минуты — появится вместе с данными" };
    const part = history.slice(-n), per = n / 12, out = [];
    for (let i = 0; i < 12; i++) {
      const seg = part.slice(Math.round(i * per), Math.round((i + 1) * per)).map((x) => x.s).filter(Number.isFinite);
      if (!seg.length) continue;
      const avg = seg.reduce((a, b) => a + b, 0) / seg.length, max = Math.max(...seg);
      out.push({ wind: avg, gust: max, t: `средняя ${convertSpeed(avg, settings.unit, 1)} · максимум ${convertSpeed(max, settings.unit, 1)} ${unit.short}` });
    }
    const min = Math.max(1, Math.round(n / 60));
    return { bars: out, legend: `ветер станции за последние ${min} мин (яркий — средняя, бледный — максимум)` };
  }, [history, settings.unit, unit.short]);

  // ---------- блоки главной вкладки ----------
  // Разметка больше не решает, где что лежит. Она лишь объявляет, какие блоки
  // бывают, а порядок и колонку хранит настройка `layout` — иначе перестановка
  // была бы правкой исходника, а не действием человека.
  //
  // Условия остались прежними и стоят здесь же: блока «Атмосфера» не должно
  // существовать, пока станция не прислала ни одного датчика, а раскладка не
  // должна помнить место того, чего нет. Отсутствующий блок просто не попадает
  // в список, и его строка в настройке спокойно дожидается своего датчика.
  const windBlocks = [
    { id: "speed", h: SPEED_H, title: "Скорость ветра", node: (
      // Окно один в один из «Района» (AreaWind в wind-area.jsx): те же кольцо,
      // подписи, карточки и полосы снизу. У района полосы — прогноз, у
      // станции — её собственный ветер за последние минуты. Данные — станции,
      // единицы — из настроек.
      <AreaWind g={g} speed={noData ? null : data.speed} gust={data.gust}
                forecast={speedBars.bars} legend={speedBars.legend}
                chip={`ПРЕДЕЛ ${convertSpeed(data.speedMax ?? 30, settings.unit, 0)} ${unit.short}`}
                scaleMax={data.speedMax ?? 30} unit={unit.short}
                shown={convertSpeed(data.speed, settings.unit, settings.digits)}
                gustShown={gustText} kmh={settings.unit !== "kmh"} />
    ) },
    { id: "stats", h: 14, title: "Порыв · средняя · аптайм", node: (
      <div style={{ display: "flex", gap: 10 }}>
                      <Stat
                        label={gustAt ? `Порыв · ${gustAt.toLocaleTimeString("uk-UA")}` : "Порыв"}
                        value={noData ? "—" : gustText} unit={unit.short} g={g}
                        action={canResetGust && !noData && (
                          <button onClick={resetGust} title="Сбросить порыв" style={{
                            position: "absolute", top: 7, right: 7, background: "transparent",
                            border: `1px solid ${LINE}`, color: DIM, padding: "1px 6px",
                            fontSize: 10, cursor: "pointer", fontFamily: MONO,
                          }}>↺</button>
                        )}
                      />
                      <Stat label={`Средняя · ${settings.histMinutes} мин`} value={meanText} unit={unit.short} g={g} />
                      <Stat label={resetWhy ? `Аптайм · ${resetWhy}` : "Аптайм"}
                            value={noData ? "—" : uptimeH > 0 ? `${uptimeH}ч${uptimeMin % 60}м` : `${uptimeMin}м`}
                            color={data.resetReason === "brownout" ? "#f97316" : undefined} g={g} />
                    </div>
    ) },
    (sensors.length > 0 || dew != null || chill != null) && { id: "air", h: 34, title: "Атмосфера", node: (
      <Panel title="Атмосфера" g={g} delay={60}
                             meta={demoMode ? "МОДЕЛЬ · 6"
                               : source === "district" ? `РАЙОН · ${sensors.length}`
                               : `ДАТЧИКОВ · ${sensors.length}`}>
                        <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {sensors.map((sn) => (
                            <Stat key={sn.key} label={sn.label} unit={sn.unit} g={g}
                                  value={sn.v.toFixed(sn.digits)} />
                          ))}
                          {dew != null && (
                            <Stat label="Точка росы · расчёт" unit="°C" g={g} value={dew.toFixed(1)} />
                          )}
                          {chill != null && (
                            <Stat label="Ощущается как · расчёт" unit="°C" g={g} value={chill.toFixed(1)} />
                          )}
                        </div></Panel>
    ) },
    { id: "speedhist", h: 20, title: "График скорости", node: (
      <Panel title={`Скорость · ${settings.histMinutes} мин`} g={g} delay={80}
                           meta={`МИН ${lullText} · МАКС ${peakText} ${unit.short}`}>
                      <Sparkline data={speedSeries} g={g} accent={accent} /></Panel>
    ) },
    settings.showCamera && { id: "camera", h: 36, title: "Камера", node: (
      <Panel title="Камера" g={g} delay={95}
                             meta={data.cameraPresent && data.cameraUrl ? "ПОТОК" : "НЕ ПОДКЛЮЧЕНА"}>
                        <CameraWindow url={data.cameraPresent ? data.cameraUrl : null}
                                      accent={accent} g={g} motion={eco ? "off" : motion} speedMs={data.speed}
                                      site={siteInfo} now={time} /></Panel>
    ) },
    (settings.widgets || []).length > 0 && { id: "widgets", h: 22, title: "Свои виджеты", node: (
      <CustomWidgets widgets={settings.widgets} g={g} accent={accent} Panel={Panel} />
    ) },
    hasDir && settings.showCompass && { id: "dir", h: 42, title: "Направление", node: (
      <WindCompass windFrom={data.direction} speed={data.speed} gust={data.gust}
                   source={degToDir(data.direction).full.toUpperCase()} accent={accent} g={g} />
    ) },
    hasDir && settings.showCompass && { id: "dirhist", h: 20, title: "График направления", node: (
      <Panel title={`Направление · ${settings.histMinutes} мин`} g={g} delay={120}
                               meta={analysis ? `РАЗБРОС ${Math.round(analysis.spread)}°` : undefined}>
                          <Sparkline data={dirSeries} g={g} accent={accent} /></Panel>
    ) },
    source === "district" && { id: "district", h: 44, title: "Район", node: (
      <Panel title="Район" g={g} delay={140} meta="ИЗ ИНТЕРНЕТА">
                          <District g={g} accent={accent} {...district} /></Panel>
    ) },
  ].filter(Boolean);

  const innerW = Math.min(viewportW - 44, pageMax > 0 ? pageMax : Infinity);
  const tracks = tracksFor(innerW);

  const layoutRows = mergeLayout(settings.layout, windBlocks);
  const lay = layoutOps(layoutRows, (rows) => setS({ layout: packLayout(rows, settings.layout) }));
  const drag = useDrag(lay);
  const resize = useResize(lay, gridRef, tracks);
  const shownRows = layoutRows.filter((r) => layoutMode || !r.hidden);
  // Вся таблица стилей страницы — около 150 КБ текста. Собирать её заново
  // с каждым кадром потока (20 Гц) значило бы три мегабайта мусора в секунду
  // для сборщика памяти; меняется же она только вместе с оформлением.
  const pageCss = useMemo(() => `${SWITCH_CSS}${GLASS_SCROLL_CSS}${themeCss(settings.theme)}
        /* Гарнитура — через переменные: оформление здесь инлайновое, и таскать
           выбранный шрифт пропсами через полсотни компонентов было бы адом. */
        :root { --ui-sans: ${FONT_SETS[settings.font]?.sans || FONT_SETS.cascadia.sans};
                --ui-mono: ${FONT_SETS[settings.font]?.mono || FONT_SETS.cascadia.mono};
                --ui-bg: ${(GROUNDS[settings.ground] || GROUNDS.black).bg};
                --ui-corner: ${CORNERS[settings.corners] ?? 0}px;
                --ui-fill: ${(settings.panelFill || 0) / 100}; }
        /* Вид панели по умолчанию — «приборная» тема. Всё, что тема меняет,
           она меняет здесь: подставляет свои значения этих же переменных. */
        :root { --pnl-line: rgba(var(--rule, 160,180,200),0.15);
                --pnl-head-line: rgba(var(--rule, 160,180,200),0.15);
                --pnl-bg: linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0.008)),
                          rgba(255,255,255,var(--ui-fill, 0));
                --pnl-shadow: none;
                --pnl-blur: none;
                /* Скругление панели отдельной переменной от --ui-corner:
                   у стекла фаска на прямом углу читается как скол, и теме
                   нужно уметь прибавить своё, не отменяя выбор человека. */
                --pnl-corner: var(--ui-corner, 0px); }
        /* Две кривые на весь дашборд. Первая тормозит к концу, вторая
           переваливает за цель и возвращается — от неё движение и кажется
           живым. Держим их переменными, чтобы «сделать медленнее» не
           превращалось в правку полусотни мест. */
        :root { --ease-out: cubic-bezier(.16,.84,.28,1);
                --ease-back: cubic-bezier(.34,1.42,.44,1); }
        * { -webkit-tap-highlight-color: transparent; }
        /* Лигатуры Cascadia Code (=>, !=, ->) — часть того, за что её берут. */
        body { font-feature-settings: "calt" 1, "liga" 1; }

        /* Значок версии в шапке. Вне темы — тонкая рамка, в Liquid Glass его
           переодевает тема. */
        .ver-chip {
          display: inline-block; vertical-align: 2px; margin-left: 9px;
          padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(var(--ink, 231,238,246),0.22);
          font-family: var(--ui-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.8px;
          color: rgba(var(--ink, 231,238,246),0.78); text-shadow: none; white-space: nowrap;
        }
        .bat-glass { display: flex; align-items: center; flex-shrink: 0; padding: 7px 10px;
          border-radius: 14px; border: 1px solid var(--pnl-line); background: var(--pnl-bg);
          box-shadow: var(--pnl-shadow); -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5); }
        .bat-body { position: relative; width: 38px; height: 18px; border-radius: 6px; padding: 2px; box-sizing: border-box;
          border: 1.5px solid var(--bat); }
        .bat-fill { display: block; height: 100%; border-radius: 3px; background: rgba(var(--rule, 255,255,255),0.06); box-shadow: none }
        .bat-fill .liq-f { box-shadow: 0 0 10px var(--bat) }
        .bat-ico { margin-right: 7px; color: rgba(var(--ink, 231,238,246),0.7); flex: none }
        .bat-bolt { position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; line-height: 1; color: #04070a; text-shadow: none }
        .bat-cap { width: 3px; height: 8px; margin-left: 2px; border-radius: 0 2px 2px 0; background: var(--bat); }
        .claude-chip {
          display: inline-flex; align-items: center; gap: 5px; vertical-align: 2px;
          padding: 2px 9px; border-radius: 999px; font-family: var(--ui-mono);
          font-size: 9.5px; font-weight: 700; letter-spacing: 0.8px; white-space: nowrap;
          color: #ff9a3c; border: 1px solid rgba(255,154,60,0.5);
          background: rgba(255,154,60,0.10); text-shadow: 0 0 8px rgba(255,154,60,0.45);
        }
        .dock-row {
          position: fixed; left: 18px; bottom: 18px; z-index: 90;
          display: flex; align-items: flex-end; gap: 12px; max-width: calc(100vw - 36px);
        }
        @media (min-width: 1501px) {
          .dock-row { zoom: var(--zs, 1); max-width: calc((100vw - 36px) / var(--zs, 1)) }
          .dock-row:is(.dock-left, .dock-right) .dock { max-width: calc((100vw - 36px) / var(--zs, 1)) }
        }
        /* Капсула: внизу полоса вкладок, над ней — раздвигающаяся панель.
           Раскрытие — пружина (кривая с перелётом), сама капсула при этом
           ещё и «дышит» (dockBounce), а содержимое выезжает из размытия. */
        .dock {
          display: flex; flex-direction: column; align-items: stretch; width: fit-content; min-width: 0;
          max-width: calc(100vw - 36px); border-radius: 30px; transform-origin: 0 100%;
          border: 1px solid var(--pnl-line); background: var(--pnl-bg); box-shadow: var(--pnl-shadow);
          -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
          transition: min-width .89s cubic-bezier(.6,0,.22,1), box-shadow .81s ease;
        }
        .dock.dock-open { min-width: min(380px, calc(100vw - 36px)); animation: dockBounce 1.08s var(--ease-back);
          transition: min-width 1.01s cubic-bezier(.2,1.15,.3,1), box-shadow .81s ease }
        @keyframes dockBounce {
          0% { transform: scale(1) } 28% { transform: scale(1.018, .985) }
          58% { transform: scale(.996, 1.01) } 100% { transform: scale(1) }
        }
        /* Раскрытие — пружина с перелётом; закрытие — плавный разгон и мягкая
           посадка (ease-in-out): обратное движение без отскока внутрь. */
        .dock-panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .89s cubic-bezier(.6,0,.22,1) }
        .dock-open .dock-panel { grid-template-rows: 1fr; transition: grid-template-rows 1.08s cubic-bezier(.22,1.18,.3,1) }
        .dock.dock-closing { animation: dockSettle .97s cubic-bezier(.3,.7,.35,1) }
        @keyframes dockSettle {
          0% { transform: scale(1) } 55% { transform: scale(.994, 1.006) }
          82% { transform: scale(1.004, .997) } 100% { transform: scale(1) }
        }
        .mo-off .dock.dock-closing { animation: none }
        .dock-clip { min-height: 0; overflow: hidden }
        .dock-scroll {
          max-height: calc(100vh - 150px); overflow-y: auto; padding: 18px 18px 6px; box-sizing: border-box;
          opacity: 0; transform: translateY(26px) scale(.94); filter: blur(calc(var(--mb, 1) * 10px)); transform-origin: 50% 100%;
          transition: opacity .57s ease .1s, transform .84s cubic-bezier(.55,0,.3,1), filter .68s ease .05s;
        }
        .dock-open .dock-scroll {
          opacity: 1; transform: none; filter: none;
          transition: opacity .68s ease .14s, transform 1.15s var(--ease-spring) .1s, filter .68s ease .12s;
        }
        .dock-content > * { animation: rowSlide .81s var(--ease-spring) backwards }
        .dock-demo > div > * { animation: rowSlide .81s var(--ease-spring) backwards }
        .dock-content > *:nth-child(2), .dock-demo > div > *:nth-child(2) { animation-delay: .1s }
        .dock-content > *:nth-child(3), .dock-demo > div > *:nth-child(3) { animation-delay: .16s }
        .dock-content > *:nth-child(4), .dock-demo > div > *:nth-child(4) { animation-delay: .22s }
        .dock-content > *:nth-child(5), .dock-demo > div > *:nth-child(5) { animation-delay: .28s }
        .dock-content > *:nth-child(6), .dock-demo > div > *:nth-child(6) { animation-delay: .34s }
        .dock-content > *:nth-child(7), .dock-demo > div > *:nth-child(7) { animation-delay: .40s }
        .dock-content > *:nth-child(n+8), .dock-demo > div > *:nth-child(n+8) { animation-delay: .46s }
        .dock-bar { display: flex; align-items: center; gap: 2px; padding: 4px 6px 4px 8px;
          border-top: 1px solid transparent; transition: border-color .68s ease }
        .dock-open .dock-bar { border-top-color: transparent }
        /* Тема Liquid Glass красит любой nav как отдельную капсулу в потоке
           страницы (margin: auto, перенос строк, свой фон) — полосе внутри нашей
           капсулы всё это лишнее. */
        .th-liquid nav.dock-bar { margin: 0 !important; flex-wrap: nowrap; width: auto; max-width: 100%;
          justify-content: flex-start; padding: 4px 6px 4px 8px; border-radius: 0;
          background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
          border-top: 1px solid transparent !important }
        .th-liquid .dock-open nav.dock-bar { border-top-color: transparent !important }
        .dock-tabs { display: flex; align-items: center; gap: 2px; overflow-x: auto; scrollbar-width: none; min-width: 0 }
        .dock-tabs::-webkit-scrollbar { display: none }
        .dock-tabs > button { white-space: nowrap; flex: none }
        .dock-gear, .demo-fab { position: relative !important; right: auto !important; bottom: auto !important; left: auto !important; flex: none }
        .th-liquid nav .dock-gear { padding: 0 !important }
        .dock-gear { width: 40px; height: 40px; border: none; background: transparent; box-shadow: none;
          -webkit-backdrop-filter: none; backdrop-filter: none }
        /* Шестерёнка — та же капля стекла, что выбранная вкладка: выпуклая,
           с бликом сверху и отражением снизу. Пока настройки открыты, капля
           загорается — видно, чья это панель. */
        .th-liquid .dock-gear {
          background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.28), rgba(255,255,255,0) 62%),
                      linear-gradient(180deg, rgba(255,255,255,0.17), rgba(255,255,255,0.05)) !important;
          box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.6), inset 0 -1px 0.5px rgba(255,255,255,0.16),
                      inset 0 0 12px rgba(255,255,255,0.07), 0 0 0 0.5px rgba(0,0,0,0.35),
                      0 4px 14px -6px rgba(0,0,0,0.6) !important;
          transition: transform .68s var(--ease-spring), box-shadow .61s ease, background .61s ease !important }
        .th-liquid .dock-gear:hover { box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.75), inset 0 -1px 0.5px rgba(255,255,255,0.2),
                      inset 0 0 14px rgba(255,255,255,0.12), 0 0 0 0.5px rgba(0,0,0,0.35), 0 6px 18px -6px rgba(0,0,0,0.6) !important }
        .th-liquid .dock-open .dock-gear {
          background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.4), rgba(255,255,255,0) 62%),
                      radial-gradient(90% 90% at 50% 100%, rgba(125,211,252,0.28), rgba(125,211,252,0) 70%),
                      linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08)) !important;
          box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.8), inset 0 -1px 0.5px rgba(160,220,255,0.4),
                      inset 0 0 14px rgba(125,211,252,0.18), 0 0 0 0.5px rgba(0,0,0,0.35),
                      0 0 18px -4px rgba(125,211,252,0.45) !important }
        /* Ноутбук и компьютер: вкладки дока крупнее — на телефоне они и так
           на всю ширину. Шрифт задан у кнопки инлайном, отсюда !important. */
        @media (min-width: 561px) {
          .app .dock-row { --bar-h: 66px }
          .th-liquid nav .dock-tabs > button, .dock-tabs > button {
            padding: 12px 20px !important; font-size: 11.5px !important; gap: 10px !important }
          .dock-tabs > button .tab-ic { width: 22px; height: 22px }
          .dock-gear { width: 46px; height: 46px }
          .dock-gear svg { width: 22px; height: 22px }
          /* Пульт снизу и сверху — по центру экрана, как и колонка панелей.
             Круглые кнопки справа от него уравновешивает пустой распор слева
             той же ширины (.dock-spacer), поэтому по центру стоит сам пульт,
             а не пульт вместе с кнопками. Ряд на всю ширину клики не ловит —
             только его дети. */
          .dock-row:not(.dock-left):not(.dock-right) { left: 18px; right: 18px; max-width: none; justify-content: center; pointer-events: none }
          .dock-row:not(.dock-left):not(.dock-right) > * { pointer-events: auto }
          .dock-row:not(.dock-left):not(.dock-right) .dock { transform-origin: 50% 100% }
          .dock-row.dock-top .dock { transform-origin: 50% 0 }
        }
        .dock-spacer { flex: none; pointer-events: none !important; visibility: hidden }
        .dock-row:is(.dock-left, .dock-right) .dock-spacer { display: none }
        /* Подвкладки и ряды фильтров: на узком экране не переносятся «лесенкой»,
           а едут одной строкой; кнопки делят ширину поровну, пока помещаются. */
        .sub-row > button, .chip-row > button { white-space: nowrap }
        .stat > :first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
        /* Шапка панели — одной высоты, есть в ней чип или кнопка или нет: иначе
           у соседних панелей в ряду заголовки и линии под ними стоят вразнобой. */
        .pnl > header { min-height: 38px; box-sizing: border-box }
        .gear-btn {
          position: fixed; right: 18px; bottom: 18px; z-index: 90;
          width: 48px; height: 48px; border-radius: 50%; cursor: pointer; padding: 0;
          display: flex; align-items: center; justify-content: center;
          color: rgba(240,246,252,0.92);
          border: 1px solid var(--pnl-line); background: var(--pnl-bg); box-shadow: var(--pnl-shadow);
          -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
          transition: transform .47s cubic-bezier(.2,.9,.25,1.2), color .27s;
        }
        .gear-btn:active { transform: scale(.92) }
        .gear-btn:hover { transform: rotate(60deg) scale(1.06); color: #fff; }
        .set-scrim { position: fixed; inset: 0; z-index: 89; background: rgba(0,0,0,0.18); animation: setFade .41s ease both }
        .set-scrim.set-scrim-out { animation: setFadeOut .81s ease forwards; pointer-events: none }
        @keyframes setFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes setPop { from { opacity: 0; transform: translateY(18px) scale(.92); filter: blur(calc(var(--mb, 1) * 8px)) } to { opacity: 1; transform: none; filter: none } }
        @keyframes setFade { from { opacity: 0 } to { opacity: 1 } }
        .set-x { background: none; border: 0; color: rgba(var(--ink, 231,238,246),0.6); cursor: pointer; font-size: 13px; }
        /* «More soon» рядом с единственной темой: пунктирная пилюля с бегущим
           бликом — место под будущую тему, а не кнопка. */
        @keyframes moreSoon { from { background-position: 180% 0 } to { background-position: -80% 0 } }
        .more-soon {
          font-family: var(--ui-mono); font-size: 9.5px; letter-spacing: 1.2px;
          padding: 5px 11px; border-radius: 999px; border: 1px dashed rgba(var(--ink, 231,238,246),0.22);
          color: transparent; -webkit-background-clip: text; background-clip: text;
          background-image: linear-gradient(100deg, rgba(var(--ink, 231,238,246),0.38) 35%,
                            rgba(var(--ink, 231,238,246),0.95) 50%, rgba(var(--ink, 231,238,246),0.38) 65%);
          background-size: 250% 100%; animation: moreSoon 3.84s linear infinite;
          user-select: none;
        }
        .mo-off .more-soon { animation: none; color: rgba(var(--ink, 231,238,246),0.45); background: none }

        /* ---------- запуск ---------- */
        @keyframes bootIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bootOut  { to { opacity: 0; transform: scale(1.06) } }
        @keyframes bootArc  { to { stroke-dashoffset: 0 } }
        @keyframes bootSpin { to { transform: rotate(360deg) } }
        @keyframes bootBar  { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes bootName { from { opacity: 0; letter-spacing: 16px }
                              to   { opacity: 1; letter-spacing: 5px } }
        .boot {
          position: fixed; inset: 0; z-index: 900;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 18px; background: var(--ui-bg, #04070a);
          animation: bootIn .27s ease both, bootOut .68s ease-in 3.35s both;
        }
        .boot-mark { animation: bootSpin 2.4s linear infinite; transform-origin: 50% 50% }
        .boot-arc  { animation: bootArc 4.05s cubic-bezier(.45,.05,.2,1) both }
        .boot-dot  { animation: bootIn .81s ease .6s both }
        .boot-name { font-family: var(--ui-mono); font-size: 13px; color: rgb(var(--ink, 231,238,246));
                     animation: bootName 2.16s var(--ease-out) .35s both }
        .boot-bar  { width: 190px; height: 2px; background: rgba(var(--rule, 160,180,200),0.18) }
        .boot-bar i { display: block; height: 100%; background: rgb(var(--ink, 231,238,246));
                      transform-origin: 0 50%;
                      animation: bootBar 4.19s cubic-bezier(.45,.05,.2,1) both }
        .boot-note { font-family: var(--ui-mono); font-size: 9.5px; letter-spacing: 2px;
                     color: rgba(var(--ink, 231,238,246),0.46); text-transform: uppercase;
                     animation: bootIn 1.62s ease 1.1s both }

        /* ---------- ожидание ---------- */
        /* Мерцание вместо крутящегося кружка: кружок одинаков и на полсекунды,
           и на полминуты, а бегущий по блоку блик показывает, что чего-то ждут
           именно здесь, на месте будущего содержимого. */
        @keyframes shimmer { from { background-position: -160% 0 } to { background-position: 260% 0 } }
        .shimmer {
          background-image: linear-gradient(100deg,
            rgba(var(--ink, 231,238,246),0.03) 30%, rgba(var(--ink, 231,238,246),0.11) 48%, rgba(var(--ink, 231,238,246),0.03) 66%);
          background-size: 220% 100%;
          animation: shimmer 2.88s linear infinite;
        }
        @keyframes waitBar { 0% { transform: translateX(-100%) } 100% { transform: translateX(320%) } }
        .wait-bar { position: relative; height: 2px; overflow: hidden;
                    background: rgba(var(--rule, 160,180,200),0.14) }
        .wait-bar i { position: absolute; inset: 0 auto 0 0; width: 32%;
                      background: currentColor; animation: waitBar 2.28s var(--ease-out) infinite }

        /* Подложка задаётся переменной во всех трёх местах сразу: инлайновый
           фон корневого div перекрыл бы выбор, а прозрачный body показал бы
           фон хоста. */
        body, html { background: var(--ui-bg, #04070a); margin: 0 }
        /* Подложка кастомизации ложится слоями на body. Когда она есть,
           корневые обёртки обязаны стать прозрачными — иначе своя заливка
           перекрыла бы её целиком и выбор не дал бы никакого эффекта. */
        body { ${backdrop} }
        #root, .app { background: ${backdrop ? "transparent" : "var(--ui-bg, #04070a)"} }
        button:focus-visible, input:focus-visible { outline: 1px solid rgba(var(--ink, 231,238,246),0.6); outline-offset: 1px; }

        @keyframes pulse   { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes ledBlink{ 0%, 49% { filter: none } 50%, 100% { filter: brightness(0.3) } }
        /* Развёртка кругового обзора. transform-origin задан инлайном в SVG:
           у вложенных <g> проценты считаются от bbox, а не от вьюбокса. */
        @keyframes ppiSweep{ to { transform: rotate(360deg) } }
        @keyframes echoPing{ 0% { r: 3; opacity: .75 } 100% { r: 15; opacity: 0 } }
        @keyframes vortex  { to { transform: rotate(-360deg) } }
        @keyframes rise {
          0%   { opacity: 0; transform: translateY(30px) scale(.95) }
          62%  { opacity: 1; transform: translateY(-5px) scale(1.008) }
          100% { opacity: 1; transform: none }
        }
        /* Курсор подсказчика мигает как в восьмибитных играх — жёсткими шагами,
           без плавного затухания: плавность выдаёт CSS и убивает весь эффект. */
        @keyframes caretBlink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        .tutor-caret { animation: caretBlink 1s steps(1) infinite }

        /* Перегрузка шкалы. Второй круг дышит, кольца частиц вокруг него
           крутятся в разные стороны — так движение читается вихрем, а не
           вращением одной шестерёнки. */
        @keyframes overPulse { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
        @keyframes orbitCW  { to { transform: rotate(360deg) } }
        @keyframes orbitCCW { to { transform: rotate(-360deg) } }
        .over-pulse { animation: overPulse 1.6s ease-in-out infinite }
        .orbit-cw   { animation: orbitCW 2.88s linear infinite }
        .orbit-ccw  { animation: orbitCCW 2.88s linear infinite }

        /* Частицы по экрану летят справа налево со сносом по вертикали.
           Только transform и opacity — свойства, которые браузер считает
           на видеокарте, не трогая вёрстку. */
        @keyframes stormFly {
          from { transform: translate3d(102vw, 0, 0) scale(1); opacity: 0 }
          8%   { opacity: .9 }
          88%  { opacity: .9 }
          to   { transform: translate3d(-6vw, var(--drift, 0), 0) scale(.6); opacity: 0 }
        }
        .storm-bit {
          position: absolute; left: 0; border-radius: 50%;
          will-change: transform, opacity;
          animation: stormFly 2.4s linear infinite;
        }

        /* Тревога добралась до самой шкалы: пульсирует число и кольцо.
           Не мигание в ноль, а именно пульс — резкое исчезновение цифры
           мешало бы её прочитать, а прочитать её в этот момент важнее всего. */
        @keyframes speedAlarm { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
        .speed-alarm { animation: speedAlarm 1.9s ease-in-out infinite }

        /* Винт Young 05103. Вращение задаётся длительностью из JS —
           она обратно пропорциональна скорости ветра. */
        @keyframes youngSpin { to { transform: rotate(360deg) } }
        .young-spin { animation: youngSpin 1.8s linear infinite; transform-box: view-box }

        /* Воронка качается целиком, обломки летают по орбите вокруг неё. */
        @keyframes tornadoSway {
          0%, 100% { transform: rotate(-2.2deg) }
          50%      { transform: rotate(2.2deg) }
        }
        @keyframes debrisOrbit {
          from { transform: rotate(0deg) translateX(var(--orbit, 20px)) scaleX(1) }
          50%  { transform: rotate(180deg) translateX(var(--orbit, 20px)) scaleX(.35) }
          to   { transform: rotate(360deg) translateX(var(--orbit, 20px)) scaleX(1) }
        }
        @keyframes recBlink { 0%, 55% { opacity: 1 } 56%, 100% { opacity: .15 } }
        /* Полосы конденсации бегут по воронке — так глаз считывает вращение.
           Бегущий штрих вместо пересчёта геометрии: ноль работы на кадр. */
        @keyframes funnelBand { to { stroke-dashoffset: var(--fb, -40) } }
        /* Молния редкая и короткая, как в жизни: две вспышки за двенадцать
           секунд. Постоянно сверкающая гроза выглядит гирляндой. */
        @keyframes lightning {
          0%, 5.6%, 100% { opacity: 0 }
          5.8% { opacity: 1 } 6.4% { opacity: .15 } 6.9% { opacity: .9 } 7.6% { opacity: 0 }
        }
        .funnel-band { animation: funnelBand 3.6s linear infinite }
        .lightning { animation: lightning 12s linear infinite; opacity: 0 }
        /* Ночью воронку выхватывает только вспышка. Кадры те же, что у молнии,
           поэтому подсветка синхронна с ней сама собой — без единой строки JS. */
        @keyframes flashLit {
          0%, 5.6%, 100% { opacity: .06 }
          5.8% { opacity: .95 } 6.4% { opacity: .3 } 6.9% { opacity: .85 } 7.6% { opacity: .06 }
        }
        .flash-lit { animation: flashLit 12s linear infinite }
        .tornado-sway { animation: tornadoSway 8.4s ease-in-out infinite; transform-box: view-box }
        .tornado-debris { animation: debrisOrbit 4.08s linear infinite; transform-box: view-box }
        .rec-blink { animation: recBlink 1.6s steps(1) infinite }

        /* Блок сетки и панель внутри него. Высота у блока задана человеком,
           поэтому панель обязана занять её целиком, а её тело — стать
           колонкой: только тогда прибор внутри может растянуться на остаток.
           Правило нарочно привязано к .blk — вне сетки (радар, окна, другие
           вкладки) высота по-прежнему от содержимого. */
        .blk { min-width: 0; min-height: 0 }
        .blk > *, .blk .pnl { height: 100% }
        .pnl { display: flex; flex-direction: column }
        .pnl > div:last-child { display: flex; flex-direction: column; min-height: 0 }
        .blk .pnl > div:last-child { flex: 1 1 auto; overflow: auto }
        /* Полоса прокрутки внутри панели — тонкая и без стрелок: панель это
           прибор, а не документ. */
        .blk .pnl > div:last-child::-webkit-scrollbar { width: 6px; height: 6px }
        .blk .pnl > div:last-child::-webkit-scrollbar-thumb {
          background: rgba(var(--rule, 160,180,200),0.25) }

        /* Плотность, рамки и контраст — классами на корне, чтобы не тащить
           их пропсами в каждый компонент. */
        .dens-compact .pnl > div { padding: 8px 9px }
        .dens-compact .pnl > header { padding: 6px 9px 5px }
        /* Раньше это правило пыталось перебить инлайновый border панели и
           проигрывало — настройка молча ничего не делала. Теперь и рамка, и
           фон живут в переменных, и снять их достаточно один раз. */
        .noborders { --pnl-line: transparent; --pnl-bg: none; --pnl-shadow: none;
                     --pnl-head-line: rgba(var(--rule, 160,180,200),0.12) }

        /* Тревога дышит рамкой, а не мигает целиком: мигающий блок в углу
           экрана раздражает и его начинают игнорировать. */
        @keyframes alarmPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(239,68,68,0) }
          50%      { box-shadow: 0 0 16px rgba(239,68,68,0.35) }
        }
        .alarm-hot { animation: alarmPulse 3s ease-in-out infinite }

        /* Переходы. Раньше двигались только панели при появлении, и от этого
           смена вкладки выглядела как подмена картинки. Теперь у содержимого
           есть вход, у подвкладок — своя, более короткая версия, а у строк
           списка — собственная: список станций иначе прыгает при удалении. */
/* Кривая с перелётом: значение переваливает за единицу и возвращается.
           Именно она отличает «съехало» от «прилетело и встало» — без неё
           движение читается как перерисовка, сколько его ни удлиняй. */
        @keyframes tabfade {
          from { opacity: 0; transform: translateY(26px) scale(.965) }
          to   { opacity: 1; transform: none }
        }
        @keyframes rowin {
          from { opacity: 0; transform: translateX(-22px); filter: blur(calc(var(--mb, 1) * 6px)) }
          to   { opacity: 1; transform: none; filter: none }
        }
        .tabfade { animation: tabfade .84s var(--ease-out) both }
        .rowin   { animation: rowin .59s var(--ease-out) both }

        /* Полоса вкладок: под выбранной проезжает подчёркивание, а не просто
           меняется цвет. Движение показывает, откуда и куда переключились. */
        @keyframes tabmark { from { transform: scaleX(0); opacity: 0 } to { transform: scaleX(1); opacity: 1 } }
        .tab-mark { animation: tabmark .68s var(--ease-out) both; transform-origin: 50% 50% }
        /* Растр отражаемости проявляется, а не выскакивает: подмена готового
           кадра иначе читается как мигание. */
        @keyframes radarFade { from { opacity: 0 } to { opacity: .78 } }
        .radar-fade { animation: radarFade 1.22s ease-out both }

        /* Кнопки и тумблеры: нажатие должно чувствоваться, иначе на телефоне
           непонятно, сработало ли касание. */
        button { transition: background-color .43s ease, border-color .43s ease,
                             color .32s ease, transform .22s var(--ease-spring),
                             box-shadow .32s ease }
        button:not(:disabled):active { transform: scale(.93) }
        @media (hover: hover) {
          button:not(:disabled):hover { border-color: rgba(var(--rule, 160,180,200),0.42) }
          a:hover { border-color: rgba(var(--rule, 160,180,200),0.42) }
        }
        @keyframes grow { from { opacity: 0; transform: scale(.86); filter: blur(calc(var(--mb, 1) * 8px)) } to { opacity: 1; transform: none; filter: none } }

        /* Карта: пинг вокруг активного предупреждения и вокруг EF5 в архиве.
           Радиус анимируется через CSS-геометрию; там, где браузер её не умеет,
           кольцо остаётся статичным — оно и в этом виде читается. */
        @keyframes mapPing { 0% { r: 5; opacity: .7 } 100% { r: 22; opacity: 0 } }
        /* Единственная анимация в дашборде, которая специально тревожит.
           Полсекунды гашения из полутора — заметно, но не мельтешит. */
        @keyframes warnBlink { 0%, 62% { opacity: 1 } 63%, 100% { opacity: .18 } }
        @keyframes alarmEdge {
          0%, 100% { box-shadow: 0 0 0 rgba(255,45,45,0) }
          50%      { box-shadow: 0 0 22px rgba(255,45,45,0.30) }
        }

        .map-ping { animation: mapPing 4s ease-out infinite }
        .map-ping.slow { animation-duration: 8.78s }
        .warn-blink { animation: warnBlink 1.5s steps(1) infinite }
        .detail-extreme { animation: alarmEdge 2.2s ease-in-out infinite }

        .ppi-sweep { animation: ppiSweep 6.5s linear infinite }
        .ppi-sweep.slow { animation-duration: 18.9s }
        .ping { animation: echoPing 3.6s ease-out infinite }
        .vortex { animation: vortex 6.6s linear infinite }
        .grow { animation: grow 1.15s var(--ease-spring) both; transform-origin: 50% 50% }
        /* Панели въезжают снизу при смене вкладки — движение подсказывает, что
           содержимое сменилось целиком, а не обновилось одно число. */
        /* Панели въезжают по очереди, а не разом: волна слева направо читается
           как «прибор собирается», а одновременный въезд — как рывок экрана.
           Порядковый номер приходит переменной --i прямо из раскладки. */
        .pnl { animation: rise .94s var(--ease-out) both }
        /* Внутри сетки едет сама ячейка, а не панель в ней. Иначе движение
           идёт дважды: панель поднимается внутри ячейки, ячейка стоит, и вместо
           одного въезда получается дёрганье содержимого в неподвижной рамке. */
        .blk { animation: rise .94s var(--ease-out) both;
               animation-delay: calc(var(--i, 0) * 65ms) }
        .blk .pnl, .blk > * { animation: none }
        .modal-card { animation: pop .68s var(--ease-spring) both }
        /* Вкладка «Обновление»: точка дышит, пока есть что ставить. */
        .upd-tab {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 95;
          display: flex; align-items: center; padding: 13px 26px; border-radius: 999px; cursor: pointer;
          font-weight: 700; font-size: 13.5px; letter-spacing: 3px; text-transform: uppercase; white-space: nowrap;
          border: 1px solid var(--pnl-line); background: var(--pnl-bg); box-shadow: var(--pnl-shadow);
          -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
          animation: updIn .81s var(--ease-spring) both;
        }
        .upd-tab:hover { transform: translateX(-50%) scale(1.05) }
        .upd-tab:active { transform: translateX(-50%) scale(.95) }
        .upd-tab .upd-dot { width: 9px; height: 9px; margin-right: 11px; vertical-align: 0 }
        @keyframes updIn { from { opacity: 0; transform: translate(-50%, -30px) scale(.8); filter: blur(calc(var(--mb, 1) * 8px)) } to { opacity: 1; transform: translateX(-50%); filter: none } }
        .mo-off .upd-tab { animation: none }
        .upd-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;
                   margin-right: 8px; vertical-align: 1px; animation: updpulse 1.9s ease-in-out infinite }
        @keyframes updpulse { 0%,100% { opacity: .45; box-shadow: 0 0 0 0 currentColor }
                              50% { opacity: 1; box-shadow: 0 0 9px 1px currentColor } }
        .mo-off .upd-dot { animation: none }
        /* Окно обновления. Стекло даёт .modal-card темы; здесь только содержимое. */
        .upd-ring { width: 46px; height: 46px; border-radius: 15px; flex: none; display: grid; place-items: center;
                    background: linear-gradient(160deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05));
                    box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.55), inset 0 -6px 12px rgba(255,255,255,0.04),
                                0 6px 18px -6px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.14) }
        .upd-ring svg.spin { animation: updspin 1.1s linear infinite }
        @keyframes updspin { to { transform: rotate(360deg) } }
        .mo-off .upd-ring svg.spin { animation: none }
        .upd-track { height: 8px; border-radius: 99px; overflow: hidden; position: relative;
                     background: rgba(255,255,255,0.07);
                     box-shadow: inset 0 1px 2px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.10) }
        .upd-fill { height: 100%; border-radius: 99px; transition: width .34s ease;
                    background: linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12)) , var(--upd-c, #67e8f9);
                    background-blend-mode: overlay;
                    box-shadow: 0 0 12px var(--upd-c, #67e8f9) }
        @keyframes pop {
          from { opacity: 0; transform: translateY(18px) scale(.94); filter: blur(calc(var(--mb, 1) * 8px)) }
          to   { opacity: 1; transform: none; filter: none }
        }

        .mo-off .pnl, .mo-off .modal-card, .mo-off .grow { animation: none }
        .mo-off .ppi-sweep, .mo-off .ping, .mo-off .vortex { animation: none }
        .mo-off .map-ping, .mo-off .warn-blink, .mo-off .detail-extreme { animation: none }
        .mo-off .tutor-caret { animation: none }
        .mo-off .tabfade, .mo-off .rowin, .mo-off .radar-fade { animation: none }
        .mo-off .blk, .mo-off .shimmer, .mo-off .wait-bar i { animation: none }
        .mo-off .tab-mark { animation: none }
        .mo-off .alarm-hot, .mo-off .speed-alarm { animation: none }
        .mo-calm .pnl, .mo-calm .blk, .mo-calm .tabfade { animation-duration: .46s }
        .mo-calm .blk { animation-delay: calc(var(--i, 0) * 28ms) }
        .mo-off .over-pulse, .mo-off .orbit-cw, .mo-off .orbit-ccw,
        .mo-off .storm-bit { animation: none }
        .mo-off .young-spin, .mo-off .tornado-sway, .mo-off .tornado-debris,
        .mo-off .rec-blink, .mo-off .funnel-band, .mo-off .lightning,
        .mo-off .flash-lit { animation: none }
        .mo-off button:not(:disabled):active { transform: none }
        .mo-calm .tabfade { animation-duration: .27s }
        .mo-calm .pnl { animation-duration: .34s }
        .mo-calm .warn-blink { animation-duration: 3.24s }
        /* ===== ДИНАМИКА 0.2.404 ===== */
        /* Блоки въезжают пружиной с объёмом и расфокусом. fill-mode backwards,
           а не both: иначе финальный transform: none держал бы блок и глушил
           наведение. */
        @keyframes rise {
          0%   { opacity: 0; transform: perspective(900px) translateY(70px) rotateX(-14deg) scale(.82); filter: blur(calc(var(--mb, 1) * 10px)) }
          55%  { opacity: 1; transform: perspective(900px) translateY(-9px) rotateX(2deg) scale(1.025); filter: none }
          78%  { transform: perspective(900px) translateY(3px) scale(.994) }
          100% { opacity: 1; transform: none }
        }
        .blk { animation: rise 1.15s var(--ease-back) backwards; animation-delay: calc(var(--i, 0) * 70ms);
               transition: transform .51s var(--ease-spring) }
        .blk:hover { transform: translateY(-5px) scale(1.012); z-index: 2 }
        .blk:active { transform: translateY(-1px) scale(.992); transition-duration: .16s }

        @keyframes tabfade {
          0%   { opacity: 0; transform: translateX(46px) scale(.96); filter: blur(calc(var(--mb, 1) * 7px)) }
          60%  { opacity: 1; transform: translateX(-6px) scale(1.006); filter: none }
          100% { opacity: 1; transform: none }
        }
        .tabfade { animation: tabfade .81s var(--ease-back) backwards }

        @keyframes rowSlide { from { opacity: 0; transform: translateX(-18px); filter: blur(calc(var(--mb, 1) * 6px)) } to { opacity: 1; transform: none; filter: none } }
        .rowin { animation: rowSlide .68s var(--ease-spring) backwards }

        /* Шапка */
        @keyframes kiwiBob { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-4px) rotate(5deg) } }
        header > div:first-child > div:first-child > :first-child { animation: kiwiBob 4.08s ease-in-out infinite; transform-origin: 50% 80% }
        header h1 { animation: titleIn 1.22s var(--ease-spring) backwards }
        @keyframes titleIn { from { opacity: 0; transform: translateX(-30px); letter-spacing: 10px; filter: blur(calc(var(--mb, 1) * 8px)) } to { opacity: 1; transform: none; filter: none } }
        @keyframes chipPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,154,60,0.45) } 50% { box-shadow: 0 0 0 7px rgba(255,154,60,0) } }
        .claude-chip { position: relative }
        .claude-chip::after { content: ""; position: absolute; inset: -1px; border-radius: inherit;
          border: 1px solid rgba(255,154,60,0.7); pointer-events: none; animation: chipRing 2.64s ease-out infinite }
        @keyframes chipRing { from { transform: scale(1); opacity: .8 } to { transform: scale(1.35, 1.9); opacity: 0 } }
        .claude-chip svg { animation: spinSlow 9s linear infinite }
        @keyframes spinSlow { to { transform: rotate(360deg) } }
        .ver-chip { transition: transform .41s var(--ease-spring) }
        .ver-chip:hover { transform: scale(1.12) rotate(-3deg) }

        /* Вкладки */
        nav button { transition: transform .6s var(--ease-spring), color .6s ease, text-shadow .6s ease }
        nav button:hover { transform: translateY(-3px) scale(1.06) }

        /* Батарея */
        .bat-glass { animation: batIn 1.08s var(--ease-spring) .2s backwards; transition: transform .41s var(--ease-spring) }
        .bat-glass:hover { transform: scale(1.12) rotate(-2deg) }
        @keyframes batIn { from { opacity: 0; transform: translateY(-24px) scale(.5); filter: blur(calc(var(--mb, 1) * 6px)) } to { opacity: 1; transform: none; filter: none } }
        @keyframes batGlow { 0%,100% { filter: brightness(1) } 50% { filter: brightness(1.35) } }
        .bat-low .bat-body { animation: batAlert .8s steps(2, jump-none) infinite }
        @keyframes batAlert { 0% { opacity: 1 } 100% { opacity: .25 } }

        /* Кнопки: отдача и всплеск */
        button { transition: transform .3s var(--ease-spring), background .27s, border-color .27s, color .27s }
        button:not(:disabled):hover { transform: translateY(-2px) scale(1.04) }
        button:not(:disabled):active { transform: scale(.93) }
        .gear-btn svg { animation: spinSlow 14s linear infinite }
        .gear-btn:hover svg { animation-duration: 1.89s }
        .gear-btn::before { content: ""; position: absolute; inset: -6px; border-radius: 50%;
          border: 1px solid rgba(180,215,255,0.5); animation: gearRing 3.36s ease-out infinite; pointer-events: none }
        @keyframes gearRing { from { transform: scale(.85); opacity: .8 } to { transform: scale(1.5); opacity: 0 } }
        .gear-btn { animation: gearIn 1.08s var(--ease-back) .5s backwards }
        /* Капсула из двух кнопок (демо-режим): ручное управление | во весь экран.
           Сама капсула — .gear-btn (стекло, линза, подсветка касания), половинки
           прозрачны; шов — тонкий светящийся штрих между ними. */
        .gear-btn.fab-pill { width: auto; height: 48px; border-radius: 999px; padding: 0; gap: 0; overflow: visible; position: relative }
        .gear-btn.fab-pill:hover { transform: scale(1.04) }
        .gear-btn.fab-pill::before { border-radius: 999px }
        .fab-pill svg, .fab-pill:hover svg { animation: none !important }
        .fab-pill .fab-half, .th-liquid .fab-pill .fab-half { position: relative; width: 52px; height: 48px; padding: 0; border: none !important;
          background: transparent !important; box-shadow: none !important; color: inherit; cursor: pointer;
          display: flex; align-items: center; justify-content: center; border-radius: 999px !important;
          -webkit-backdrop-filter: none !important; backdrop-filter: none !important }
        .fab-pill .fab-half + .fab-half::before { content: ""; position: absolute; left: 0; top: 11px; bottom: 11px; width: 1px;
          background: linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0)) }
        .fab-pill .fab-half:hover { transform: none; color: #fff }
        .fab-pill .fab-half:active { transform: scale(.88) }
        .fab-pill .fab-half svg { transition: transform .5s var(--ease-liq) }
        .fab-pill .fab-half:hover svg { transform: scale(1.15) }
        /* Включённое ручное управление — капля стекла, как шестерёнка при открытых настройках. */
        .fab-pill .fab-half.is-on, .th-liquid .fab-pill .fab-half.is-on {
          background: radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.4), rgba(255,255,255,0) 62%),
                      radial-gradient(90% 90% at 50% 100%, rgba(125,211,252,0.28), rgba(125,211,252,0) 70%),
                      linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08)) !important;
          box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.8), inset 0 -1px 0.5px rgba(160,220,255,0.4),
                      inset 0 0 14px rgba(125,211,252,0.18), 0 0 14px -4px rgba(125,211,252,0.5) !important;
          color: #fff }
        .dock-row:is(.dock-left, .dock-right) .gear-btn.fab-pill { flex-direction: column; width: 48px; height: auto }
        .dock-row:is(.dock-left, .dock-right) .fab-pill .fab-half { width: 48px; height: 52px }
        .dock-row:is(.dock-left, .dock-right) .fab-pill .fab-half + .fab-half::before { left: 11px; right: 11px; top: 0; bottom: auto; width: auto; height: 1px;
          background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0)) }
        @keyframes gearIn { from { opacity: 0; transform: scale(0) rotate(-240deg); filter: blur(calc(var(--mb, 1) * 8px)) } to { opacity: 1; transform: none; filter: none } }
        .gear-btn:hover { transform: scale(1.12) }

        /* Окно настроек: пружина, дети по очереди */
        @keyframes setPop {
          0% { opacity: 0; transform: translateY(40px) scale(.7) rotate(3deg); filter: blur(8px) }
          60% { opacity: 1; transform: translateY(-6px) scale(1.03) rotate(-.5deg); filter: blur(0) }
          100% { opacity: 1; transform: none; filter: none }
        }

        /* Кнопка демо — по вертикали вровень с серединой полосы вкладок, а не с низом капсулы. */
        .dock-row { --bar-h: 58px }
        .demo-fab { animation: gearIn .81s var(--ease-back) both; margin-bottom: calc((var(--bar-h) - 48px) / 2) }
        .demo-chip { background: rgba(255,255,255,0.06); border: 1px solid var(--chip, rgba(var(--ink, 231,238,246),0.2));
          color: rgba(var(--ink, 231,238,246),0.85); font-family: var(--ui-mono); font-size: 10px; padding: 4px 10px;
          border-radius: 999px; cursor: pointer }
        .banner-out { animation: bannerOut .61s cubic-bezier(.5,0,.8,.4) forwards !important; pointer-events: none }
        @keyframes bannerOut {
          0% { opacity: 1; transform: none; filter: none }
          30% { transform: scale(1.04) translateY(4px) }
          100% { opacity: 0; transform: translateY(-40px) scale(.8) rotate(-2deg); filter: blur(10px) }
        }
        .mo-off .dock.dock-open, .mo-off .dock-content > *, .mo-off .dock-demo > div > * { animation: none }
        .mo-off .dock-panel, .mo-off .dock-scroll, .mo-off .dock { transition: none }
        .paused *, .paused *::before, .paused *::after { animation-play-state: paused !important }
        /* Значок, на который никто не смотрит, не должен крутиться */
        .gear-btn::before { will-change: transform, opacity }
        .gear-btn svg, .claude-chip svg, .bat-fill .liq-in::before { will-change: transform }
        /* Ползунки: круглая стеклянная ручка с пружиной, закруглённая дорожка
           с живой заливкой. Перебивают прежний строгий вид выше. */
        /* Заготовки демо — стеклянные капли: блик сверху, кромка, под пальцем
           приседают и пружинят назад с расходящимся кольцом. */
        .demo-chip { position: relative; isolation: isolate;
          background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04)) !important;
          border: 0.5px solid var(--chip, rgba(255,255,255,0.28)) !important; padding: 5px 12px !important;
          box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(255,255,255,0.12),
                      0 3px 10px -4px rgba(0,0,0,0.55) !important;
          transition: transform .7s var(--ease-spring), background .4s ease, box-shadow .4s ease, color .4s ease !important }
        .demo-chip:hover { background: linear-gradient(180deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08)) !important;
          color: #fff; transform: translateY(-2px) scale(1.06) !important }
        .demo-chip:active { transform: scale(.86, .8) !important; transition-duration: .14s !important }
        .demo-chip::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
          border: 1px solid var(--chip, rgba(140,210,255,0.8)); opacity: 0 }
        .demo-chip:active::after { animation: swRing .8s var(--ease-out) }
        .mo-off .demo-chip:active::after { animation: none }

        /* Пустышки, на которые можно нажать: отклик вместо тишины */
        [data-poke] { cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent }
        .spark { position: fixed; width: 6px; height: 6px; border-radius: 50%; pointer-events: none; z-index: 310 }
        .ver-wrap { position: relative; display: inline-flex }
        .ver-pop {
          position: absolute; top: calc(100% + 12px); left: 0; z-index: 120; width: 236px; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 22px;
          font-family: var(--ui-mono); letter-spacing: .4px; font-weight: 500; text-transform: none;
          border: 1px solid var(--pnl-line); background: var(--pnl-bg); box-shadow: var(--pnl-shadow);
          -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5);
          transform-origin: 24px -6px; animation: claudePop .74s cubic-bezier(.34,1.56,.5,1) both;
        }
        .ver-pop.ver-out { animation: claudeOut .54s cubic-bezier(.5,0,.8,.4) forwards; pointer-events: none }
        .ver-pop-t { font-size: 9.5px; letter-spacing: 2px; text-transform: uppercase; color: rgba(var(--ink, 231,238,246),0.5) }
        .ver-pop-v { font-size: 15px; font-weight: 700; color: rgb(var(--ink, 231,238,246)); margin-top: -6px }
        .ver-state { display: flex; align-items: center; gap: 9px; font-size: 11px; line-height: 1.45; color: rgba(var(--ink, 231,238,246),0.85) }
        .ver-ok { color: #8be28b; text-shadow: 0 0 10px rgba(120,230,120,0.4) }
        .ver-bad { color: #ffb36b }
        .ver-facts { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 10.5px; color: rgba(var(--ink, 231,238,246),0.6) }
        .ver-facts b { font-family: var(--ui-mono); font-weight: 600; color: rgba(var(--ink, 231,238,246),0.9) }
        .ver-spin { width: 14px; height: 14px; border-radius: 50%; flex: none; border: 2px solid rgba(var(--ink, 231,238,246),0.25);
                    border-top-color: rgb(var(--ink, 231,238,246)); animation: bootSpin .8s linear infinite }
        .ver-again { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; font-size: 10px;
                     color: rgba(var(--ink, 231,238,246),0.5); font-family: inherit; text-decoration: underline; text-underline-offset: 3px }
        .mo-off .ver-pop { animation: none }
        @media (max-width: 560px) {
          .ver-wrap { position: static }
          .ver-pop { position: fixed; left: 12px; right: 12px; top: 78px; width: auto; transform-origin: 30% -6px }
        }
        /* Запуск после обновления: полоса-ползунок вместо обычной заставки */
        .boot-up .boot-mark { animation: none }
        .boot-slide { position: relative; width: min(300px, 72vw); height: 6px; border-radius: 999px;
                      background: rgba(var(--rule, 160,180,200),0.18); margin-top: 6px }
        .boot-slide .boot-liq { position: absolute; inset: 0; border-radius: 999px; background: none; box-shadow: none }
        .boot-slide .liq-f { box-shadow: 0 0 14px rgba(125,211,252,0.6) }
        .boot-slide b { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%;
                        background: #fff; box-shadow: 0 0 14px rgba(167,139,250,0.95), 0 0 0 4px rgba(167,139,250,0.22) }
        .boot-pct { font-family: var(--ui-mono); font-size: 13px; font-weight: 700; color: rgb(var(--ink, 231,238,246)); letter-spacing: 2px }
        .boot-stage { font-family: var(--ui-mono); font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
                      color: rgba(var(--ink, 231,238,246),0.6); min-height: 14px }
        .claude-wrap { position: relative; display: inline-flex }
        /* Капля Claude: перемычка + бульбашка, вытекающие из значка (ClaudeDrop). */
        .cl-drop { position: absolute; top: 100%; left: 0; z-index: 120; padding-top: 9px; pointer-events: none }
        .cl-drop.cl-in { pointer-events: auto }
        .cl-bub, .cl-bridge {
          background:
            radial-gradient(130% 100% at 50% 125%, rgba(255,120,30,0.5), rgba(255,120,30,0) 72%),
            linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,190,130,0.14) 50%, rgba(255,140,60,0.22)),
            rgba(60,30,10,0.42);
          -webkit-backdrop-filter: blur(12px) var(--lg-lens,) saturate(140%);
          backdrop-filter: blur(12px) var(--lg-lens,) saturate(140%);
        }
        /* Жидкая перемычка: вогнутые бока (маска двумя кругами), как шейка капли. */
        .cl-bridge { position: absolute; top: -1px; left: 24px; width: 26px; height: 12px;
          -webkit-mask: radial-gradient(circle at 0 50%, transparent 7.5px, #000 8px) left / 51% 100% no-repeat,
                        radial-gradient(circle at 100% 50%, transparent 7.5px, #000 8px) right / 51% 100% no-repeat;
          mask: radial-gradient(circle at 0 50%, transparent 7.5px, #000 8px) left / 51% 100% no-repeat,
                radial-gradient(circle at 100% 50%, transparent 7.5px, #000 8px) right / 51% 100% no-repeat;
          transform-origin: 50% 0 }
        .cl-bub { position: relative; display: block; white-space: nowrap; overflow: hidden; isolation: isolate;
          padding: 11px 16px; border-radius: 18px; transform-origin: 37px 0;
          font-family: var(--ui-mono); font-size: 11px; font-weight: 600; letter-spacing: .5px;
          color: #ffb066; text-shadow: 0 0 10px rgba(255,140,50,0.55);
          box-shadow: 0 0 0 0.5px rgba(255,170,100,0.55), inset 0 1px 0.5px rgba(255,255,255,0.6),
                      inset 0 -1px 1px rgba(255,170,90,0.35), inset 0 0 12px rgba(255,140,50,0.2),
                      0 10px 26px -10px rgba(255,120,30,0.6), 0 4px 12px -6px rgba(0,0,0,0.55) }
        .cl-bub-t { position: relative; display: inline-block }
        .cl-bub-sheen { position: absolute; top: -50%; bottom: -50%; left: 0; width: 30%; z-index: -1; pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
          transform: translateX(-160%) skewX(-18deg) }
        .cl-in .cl-bridge { animation: clBridgeIn 1s cubic-bezier(.3,.7,.3,1) both }
        .cl-in .cl-bub { animation: clBubIn 1.05s cubic-bezier(.3,.7,.35,1) both }
        .cl-in .cl-bub-t { animation: clTextIn .6s var(--ease-out) .34s both }
        .cl-in .cl-bub-sheen { animation: clSheenB 6s var(--ease-out) .55s infinite }
        .cl-out .cl-bridge { animation: clBridgeOut .5s cubic-bezier(.5,0,.75,.5) .08s both }
        .cl-out .cl-bub { animation: clBubOut .5s cubic-bezier(.5,0,.75,.4) both }
        .cl-out .cl-bub-t { animation: clTextOut .16s ease both }
        @keyframes clBubIn {
          0%   { opacity: 0; transform: translateY(-12px) scale(.09, .14); border-radius: 50% }
          14%  { opacity: 1 }
          34%  { transform: translateY(3px) scale(.42, 1.18); border-radius: 46% }
          56%  { transform: translateY(0) scale(1.07, .9); border-radius: 22px }
          74%  { transform: scale(.97, 1.04) }
          88%  { transform: scale(1.01, .99) }
          100% { opacity: 1; transform: none; border-radius: 18px }
        }
        @keyframes clBridgeIn {
          0%   { transform: scale(.25, 0) }
          30%  { transform: scale(.5, 1.7) }
          58%  { transform: scale(1.18, .85) }
          80%  { transform: scale(.95, 1.05) }
          100% { transform: none }
        }
        @keyframes clTextIn { from { opacity: 0; transform: translateY(5px) scale(.94); filter: blur(calc(var(--mb, 1) * 5px)) } to { opacity: 1; transform: none; filter: none } }
        @keyframes clSheenB { 0% { transform: translateX(-160%) skewX(-18deg) } 22%, 100% { transform: translateX(560%) skewX(-18deg) } }
        @keyframes clBubOut {
          0%   { opacity: 1; transform: none; border-radius: 18px }
          30%  { transform: scale(1.04, .93) }
          70%  { opacity: 1; transform: translateY(-4px) scale(.38, .7); border-radius: 46% }
          100% { opacity: 0; transform: translateY(-12px) scale(.08, .12); border-radius: 50% }
        }
        @keyframes clBridgeOut { 0% { transform: none } 50% { transform: scale(.55, 1.35) } 100% { transform: scale(.2, 0) } }
        @keyframes clTextOut { to { opacity: 0; filter: blur(calc(var(--mb, 1) * 4px)) } }
        /* Значок «плавится», отдавая каплю, и «глотает» её обратно. */
        .claude-chip.cl-melt { animation: clMelt .75s cubic-bezier(.3,.7,.35,1) }
        .claude-chip.cl-slurp { animation: clSlurp .65s cubic-bezier(.3,.7,.35,1) .22s }
        @keyframes clMelt { 0% { transform: none } 22% { transform: translateY(1px) scale(1.1, .82) } 48% { transform: scale(.95, 1.09) } 72% { transform: scale(1.02, .98) } 100% { transform: none } }
        @keyframes clSlurp { 0% { transform: none } 35% { transform: translateY(1px) scale(1.12, .84) } 65% { transform: scale(.96, 1.06) } 100% { transform: none } }
        .sc-light .cl-bub, .sc-light .cl-bridge { background:
            radial-gradient(130% 100% at 50% 125%, rgba(255,140,50,0.34), rgba(255,140,50,0) 72%),
            linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,236,220,0.78) 55%, rgba(255,214,180,0.82)) }
        .sc-light .cl-bub { color: #c2560a; text-shadow: none;
          box-shadow: 0 0 0 0.5px rgba(230,130,50,0.5), inset 0 1px 0.5px #fff, 0 10px 24px -12px rgba(230,110,20,0.55) }
        .app.sk-material.sk-material .cl-bub, .app.sk-material.sk-material .cl-bridge { background: var(--md-c-highest);
          -webkit-backdrop-filter: none; backdrop-filter: none }
        .app.sk-material.sk-material .cl-bub { color: var(--md-on); text-shadow: none; box-shadow: var(--md-elev) }
        .mo-off .cl-drop *, .mo-off .claude-chip { animation: none !important }
        .mo-off .cl-out { display: none }

        /* Всплеск от нажатия */
        .rip { position: fixed; width: 280px; height: 280px; margin: -140px 0 0 -140px; border-radius: 50%;
          pointer-events: none; z-index: 300; transform: scale(.05); will-change: transform, opacity;
          background: radial-gradient(circle, rgba(255,255,255,0.45), rgba(150,200,255,0.18) 50%, transparent 70%);
          animation: ripple 1.01s cubic-bezier(.1,.7,.3,1) forwards }
        @keyframes ripple { to { transform: scale(1); opacity: 0 } }

        .mo-off .blk, .mo-off .tabfade, .mo-off .rowin, .mo-off header h1, .mo-off .dock-content, .mo-off .bat-glass, .mo-off .bat-fill, .mo-off .bat-fill::after,
        .mo-off .gear-btn, .mo-off .gear-btn svg, .mo-off .gear-btn::before, .mo-off .claude-chip,
        .mo-off .claude-chip svg, .mo-off .claude-chip::after, .mo-off header > div:first-child > div:first-child > :first-child { animation: none }
        .mo-off .blk:hover, .mo-off button:not(:disabled):hover { transform: none }
        @media (prefers-reduced-motion: reduce) { .rip { display: none } }


        /* Системная просьба убрать движение сильнее любой настройки дашборда. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition-duration: 0ms !important }
        }

        /* Телефон портретом: обе колонки в столбик, нижние карточки 2x2.
           Инлайн-стили перекрываются только с !important. */
        .lb-short { display: none }
        /* Значок рядом с подписью и на компьютере; на телефоне подпись уходит, значок крупнее. */
        .tab-ic { display: block; width: 20px; height: 20px; flex: none }
        .dock-tabs > button { display: inline-flex; align-items: center; gap: 9px }
        /* ---------- телефон ----------
           Нижняя панель на всю ширину: четыре крупных значка с короткой подписью
           и шестерёнка — всё помещается в один ряд, и ничего не мельчает. */
        @media (max-width: 560px) {
          .dock-row { --bar-h: 70px; left: 10px; right: 10px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); max-width: none; gap: 10px }
          .dock { flex: 1; width: auto; max-width: none; min-width: 0 }
          .dock.dock-open { min-width: 0 }
          .dock-bar, .th-liquid nav.dock-bar { padding: 6px 6px 6px 8px !important; justify-content: space-between }
          .dock-tabs { flex: 1; overflow: visible; justify-content: space-around; gap: 0 }
          .th-liquid nav .dock-tabs > button, .dock-tabs > button {
            flex: 1 1 0 !important; display: flex !important; flex-direction: column; align-items: center; gap: 3px;
            padding: 12px 0 !important; min-width: 0; letter-spacing: 0 !important }
          /* Только значки, без подписей: минимализм. Подпись остаётся в aria-label
             и в подсказке, так что читалки экрана и долгое нажатие её видят. */
          .tab-ic { display: block; width: 32px; height: 32px; flex: none }
          .tab-lb { display: none }
          .th-liquid nav .tab-mark { border-radius: 20px }
          .dock-gear { width: 48px; height: 48px }
          header h1 { font-size: 14px !important }
          header { padding: 14px 12px 0 !important }
          /* Шапка — одной строкой: слева знак и название (версия под ним),
             справа батарея, обе половины по центру по вертикали. */
          header > div { padding: 0 !important; flex-wrap: nowrap !important }
          header > div > div:first-child { flex: 1 1 auto }
          header > div > :last-child { flex: none }
          .dock-spacer { display: none }
          .sub-row, .chip-row { flex-wrap: nowrap !important; overflow-x: auto; scrollbar-width: none }
          .sub-row::-webkit-scrollbar, .chip-row::-webkit-scrollbar { display: none }
          .sub-row > button, .chip-row > button { flex: 1 0 auto }
          .stat > :first-child { letter-spacing: 1px !important }
          main { padding-left: 12px !important; padding-right: 12px !important; padding-bottom: 110px !important }
          .upd-tab { top: calc(10px + env(safe-area-inset-top, 0px)); padding: 11px 20px; font-size: 12.5px }
          .dock-scroll { max-height: calc(100vh - 170px) }
        }
        @media (max-width: 820px) {
          /* .wind-grid здесь больше нет: число колонок считает columnsFor(),
             и правило с !important спорило бы с ним за один и тот же стиль. */
          .stat-row  { grid-template-columns: 1fr 1fr !important }
          .live-grid { grid-template-columns: 1fr !important }
          .demo-grid { grid-template-columns: 1fr !important }
        }
        ${SYSTEM_CSS}
        ${AREA_CSS}
        /* ---------- деловой вид приборов ---------- */
        /* Метка у заголовка панели и линия-акцент у плитки: ровный ритм вместо россыпи. */
        .pnl > header > :first-child::before { content: ""; display: inline-block; width: 3px; height: 11px; margin-right: 9px;
          border-radius: 2px; vertical-align: -1px; background: linear-gradient(180deg, #7dd3fc, #a78bfa) }
        .stat::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: 0; height: 2px; border-radius: 2px;
          background: linear-gradient(90deg, rgba(125,211,252,0.7), rgba(167,139,250,0.4), transparent); opacity: .7 }
        .stat { min-height: 88px }
        ${OFFSCREEN_CSS}
        /* Сцена «По умолчанию» — чёрный фон без цветных пятен: переключатель «Станция / Район»
           там белый. На Liquid Glass остаётся стеклянный голубо-фиолетовый. */
        .app.sc-plain .seg-big .seg-drop i {
          background: linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0.14));
          box-shadow: 0 0 0 0.5px rgba(255,255,255,0.4), inset 0 1px .5px rgba(255,255,255,0.7), 0 0 18px -4px rgba(255,255,255,0.55) }
        /* ---------- переход между вкладками ---------- */
        /* Горизонтальный вылет контента не должен расширять страницу: иначе на
           телефоне окно на миг растягивается, и нижняя панель «уезжает» вниз. */
        html, body { overflow-x: clip }
        .app { overflow-x: clip }
        @keyframes tabIn {
          0%   { opacity: 0; transform: translateX(calc(var(--tdir, 1) * 80px)) scale(.94); filter: blur(calc(var(--mb, 1) * 9px)) }
          55%  { opacity: 1; transform: translateX(calc(var(--tdir, 1) * -9px)) scale(1.01); filter: blur(0) }
          100% { opacity: 1; transform: none; filter: none }
        }
        @keyframes tabOut {
          0%   { opacity: 1; transform: none }
          100% { opacity: 0; transform: translateX(calc(var(--tdir, 1) * -64px)) scale(.965); filter: blur(calc(var(--mb, 1) * 7px)) }
        }
        .app:not(.mo-off) .tabfade { animation: tabIn 1.08s cubic-bezier(.22,1.2,.3,1) both }
        .app:not(.mo-off) main.tab-leaving .tabfade { animation: tabOut .38s cubic-bezier(.5,0,.8,.4) both }
        .app.mo-calm .tabfade { animation-duration: .68s }
        .eco-auto { background: none !important; border: none !important; box-shadow: none !important;
          padding: 0 !important; margin: 0; font: inherit; color: #7dd3fc; cursor: pointer;
          text-decoration: underline dotted; text-underline-offset: 3px; border-radius: 4px !important }
        .eco-auto:hover { color: #bae6fd }
        /* Свет от касания вкладывается в элемент — ему нужна точка отсчёта. */
        .th-liquid .ar-btn { position: relative }
        /* Док сворачивается, пока листают вниз, и разворачивается, стоит повести
           вверх (класс ставит дашборд). Только на телефоне: там он занимает
           всю ширину и закрывает цифры, на компьютере — угол. Раскрытый док
           (настройки) не сворачивается никогда. */
        @media (max-width: 560px) {
          .th-liquid .dock-row { transform-origin: 50% 100%; transition: transform .81s var(--ease-spring) }
          .th-liquid .dock-row.dock-min:not(:has(.dock-open)) { transform: translateY(10px) scale(.82) }
          .mo-off .dock-row { transition: none }
        }

        /* ---------- пульт управления ----------
           --mb — множитель размытия в анимациях: в эко-режиме ноль, движение
           остаётся, а дорогой фильтр уходит. */
        .app { --mb: 1 }
        .app.eco { --mb: 0 }

        /* Сверху: полоса вкладок над панелью, настройки раскрываются вниз. */
        .dock-row.dock-top { top: calc(18px + env(safe-area-inset-top, 0px)); bottom: auto; align-items: flex-start }
        .dock-top .dock { flex-direction: column-reverse; transform-origin: 0 0 }
        .dock-top .dock-scroll { transform-origin: 50% 0; transform: translateY(-26px) scale(.94); padding: 6px 18px 18px }
        .dock-top .dock.dock-open .dock-scroll { transform: none }
        .dock-top .demo-fab { margin-bottom: 0; margin-top: calc((var(--bar-h) - 48px) / 2) }
        .app.dockpos-top > header { margin-top: 84px }
        .app.dockpos-top main { padding-bottom: 40px !important }

        /* По бокам: пульт вертикальный, настройки выезжают вбок, к экрану. */
        .dock-row:is(.dock-left, .dock-right) { top: 18px; bottom: 18px; max-width: none; flex-direction: column;
          justify-content: center; gap: 10px }
        .dock-row.dock-left { left: 18px; right: auto; align-items: flex-start }
        .dock-row.dock-right { right: 18px; left: auto; align-items: flex-end }
        .dock-left .dock { flex-direction: row-reverse; transform-origin: 0 50% }
        .dock-right .dock { flex-direction: row; transform-origin: 100% 50% }
        .dock-row:is(.dock-left, .dock-right) .dock { flex: none; width: auto; max-width: calc(100vw - 36px); max-height: calc(100% - 58px); min-width: 0 }
        .dock-row:is(.dock-left, .dock-right) .dock.dock-open { min-width: 0 }
        /* Сбоку панель раскрывается сразу в ширину и в высоту — от середины
           полосы. Раньше росла только ширина, а высота пульта в конце закрытия
           схлопывалась разом: рывок, и значки прыгали вслед за ней. Полоса
           вкладок и панель стоят по центру пульта, а пульт — по центру края
           экрана, поэтому значки не двигаются вовсе, что бы ни раскрывалось. */
        .dock-row:is(.dock-left, .dock-right) .dock { align-items: center }
        .dock-row:is(.dock-left, .dock-right) .dock-bar { align-self: center }
        .dock-row:is(.dock-left, .dock-right) .dock-panel { align-self: center; grid-template-rows: 0fr; grid-template-columns: 0fr;
          transition: grid-template-columns 1.05s cubic-bezier(.4,0,.2,1), grid-template-rows 1.16s cubic-bezier(.4,0,.2,1) }
        .dock-row:is(.dock-left, .dock-right) .dock-open .dock-panel { grid-template-rows: 1fr; grid-template-columns: 1fr;
          transition: grid-template-columns 1.08s cubic-bezier(.22,1.18,.3,1), grid-template-rows 1.08s cubic-bezier(.22,1.1,.3,1) }
        .dock-row:is(.dock-left, .dock-right) .dock-clip { min-height: 0 }
        .dock-row:is(.dock-left, .dock-right) .dock-clip { min-width: 0 }
        .dock-row:is(.dock-left, .dock-right) .dock-scroll { width: min(380px, calc(100vw - 130px)); max-height: calc(100vh - 110px) }
        .dock-left .dock-scroll { transform: translateX(-26px) scale(.94); transform-origin: 0 50% }
        .dock-right .dock-scroll { transform: translateX(26px) scale(.94); transform-origin: 100% 50% }
        .dock-row:is(.dock-left, .dock-right) .dock.dock-open .dock-scroll { transform: none }
        .dock-row:is(.dock-left, .dock-right) .dock-bar,
        .th-liquid .dock-row:is(.dock-left, .dock-right) nav.dock-bar {
          flex-direction: column; justify-content: flex-start; gap: 6px; padding: 8px 5px !important; max-height: 100% }
        .dock-row:is(.dock-left, .dock-right) .dock-tabs { flex: 0 1 auto; flex-direction: column; overflow-x: visible;
          overflow-y: auto; gap: 3px; justify-content: flex-start }
        .th-liquid .dock-row:is(.dock-left, .dock-right) nav .dock-tabs > button,
        .dock-row:is(.dock-left, .dock-right) .dock-tabs > button {
          flex: none !important; display: flex !important; flex-direction: column !important; align-items: center;
          gap: 4px !important; width: 76px; padding: 11px 4px !important; white-space: normal;
          font-size: 8.5px !important; letter-spacing: .6px !important; line-height: 1.15 }
        .dock-row:is(.dock-left, .dock-right) .tab-lb { display: block; text-align: center }
        .dock-row:is(.dock-left, .dock-right) .tab-ic { width: 24px; height: 24px }
        .dock-row:is(.dock-left, .dock-right) .demo-fab { margin: 0 4px }
        .app.dockpos-left, .app.dockpos-right { box-sizing: border-box }
        .app.dockpos-left { padding-left: 104px } .app.dockpos-right { padding-right: 104px }

        /* Только значки. */
        .dock-ic-only .tab-lb { display: none !important }
        /* Компьютер, только значки: капсула раньше была втрое уже обычной и
           терялась внизу экрана. Значки крупнее, кнопки шире — пульт сопоставим
           по весу с обычным. Ширину раскрытой панели настроек он и задаёт, так
           что настройки теперь не уже и не шире самого пульта: при раскрытии
           сверху и снизу min-width снят, ширина не меняется ни на миллиметр. */
        @media (min-width: 561px) {
          .app .dock-row.dock-ic-only { --bar-h: 72px }
          .th-liquid .dock-ic-only:not(.dock-left):not(.dock-right) nav .dock-tabs > button,
          .dock-ic-only:not(.dock-left):not(.dock-right) .dock-tabs > button { padding: 15px 28px !important }
          .dock-ic-only:not(.dock-left):not(.dock-right) .dock-tabs > button .tab-ic { width: 28px; height: 28px }
          .dock-ic-only:not(.dock-left):not(.dock-right) .dock-gear { width: 54px; height: 54px }
          .dock-ic-only:not(.dock-left):not(.dock-right) .dock-gear svg { width: 26px; height: 26px }
          .dock-row:not(.dock-left):not(.dock-right) .dock.dock-open { min-width: 0 }
        }
        .th-liquid .dock-ic-only nav .dock-tabs > button, .dock-ic-only .dock-tabs > button { padding: 12px 14px !important; gap: 0 !important }
        .th-liquid .dock-row.dock-ic-only:is(.dock-left, .dock-right) nav .dock-tabs > button,
        .dock-row.dock-ic-only:is(.dock-left, .dock-right) .dock-tabs > button { width: 54px; padding: 13px 0 !important }
        .app.dockpos-left:has(.dock-ic-only) { padding-left: 82px } .app.dockpos-right:has(.dock-ic-only) { padding-right: 82px }

        @media (max-width: 560px) {
          .dock-row.dock-top { top: calc(10px + env(safe-area-inset-top, 0px)) }
          .app.dockpos-top > header { margin-top: 92px }
          .dock-row:is(.dock-left, .dock-right) { top: calc(10px + env(safe-area-inset-top, 0px)); bottom: calc(10px + env(safe-area-inset-bottom, 0px)) }
          .dock-row.dock-left { left: 8px } .dock-row.dock-right { right: 8px }
          .th-liquid .dock-row:is(.dock-left, .dock-right) nav .dock-tabs > button,
          .dock-row:is(.dock-left, .dock-right) .dock-tabs > button { width: 62px; padding: 10px 2px !important }
          .app.dockpos-left { padding-left: 76px } .app.dockpos-right { padding-right: 76px }
          .app.dockpos-left:has(.dock-ic-only) { padding-left: 66px } .app.dockpos-right:has(.dock-ic-only) { padding-right: 66px }
          .dock-row:is(.dock-left, .dock-right) .dock-scroll { width: calc(100vw - 96px) }
        }

        /* ---------- шов между вкладками и настройками ----------
           Не линия, а свет: при раскрытии шов вырастает от шестерёнки с
           пружиной, и по нему пробегает капля блика — панель «отливается»
           из пульта. Закрывается — шов втягивается обратно в шестерёнку. */
        .dock-bar { position: relative }
        .dock-bar::before, .dock-bar::after { content: ""; position: absolute; pointer-events: none;
          left: 16px; right: 16px; top: -1px; height: 2px; border-radius: 2px }
        .dock-bar::before {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45) 16%, rgba(190,230,255,0.95) 58%, rgba(167,139,250,0.75) 84%, transparent);
          box-shadow: 0 0 calc(var(--mb, 1) * 12px) 1px rgba(125,211,252,0.45);
          transform: scaleX(0); transform-origin: 100% 50%; opacity: 0;
          transition: transform .61s cubic-bezier(.6,0,.3,1), opacity .47s ease .1s }
        .dock-open .dock-bar::before { transform: scaleX(1); opacity: .9;
          transition: transform 1.28s cubic-bezier(.2,1.25,.3,1) .08s, opacity .34s ease .05s }
        .dock-bar::after { top: -7px; height: 14px; opacity: 0;
          background: radial-gradient(closest-side, rgba(228,246,255,0.95), rgba(125,211,252,0.35) 55%, transparent) no-repeat;
          background-size: 90px 14px; background-position: 100% 50% }
        .dock-open .dock-bar::after { animation: seamBead 1.55s cubic-bezier(.45,0,.2,1) .12s both }
        @keyframes seamBead { 0% { opacity: 0; background-position: 100% 50% } 18% { opacity: 1 } 80% { opacity: .9 }
                              100% { opacity: 0; background-position: 0% 50% } }
        .dock-top .dock-bar::before { top: auto; bottom: -1px } .dock-top .dock-bar::after { top: auto; bottom: -7px }
        .dock-row:is(.dock-left, .dock-right) .dock-bar::before, .dock-row:is(.dock-left, .dock-right) .dock-bar::after {
          left: auto; right: auto; top: 16px; bottom: 16px; width: 2px; height: auto }
        .dock-row.dock-left .dock-bar::before { right: -1px } .dock-row.dock-right .dock-bar::before { left: -1px }
        .dock-row:is(.dock-left, .dock-right) .dock-bar::before {
          background: linear-gradient(0deg, transparent, rgba(255,255,255,0.45) 16%, rgba(190,230,255,0.95) 58%, rgba(167,139,250,0.75) 84%, transparent);
          transform: scaleY(0); transform-origin: 50% 100% }
        .dock-row:is(.dock-left, .dock-right) .dock-open .dock-bar::before { transform: scaleY(1) }
        .dock-row.dock-left .dock-bar::after { right: -7px; width: 14px } .dock-row.dock-right .dock-bar::after { left: -7px; width: 14px }
        .dock-row:is(.dock-left, .dock-right) .dock-bar::after { background-size: 14px 90px; background-position: 50% 100% }
        .dock-row:is(.dock-left, .dock-right) .dock-open .dock-bar::after { animation-name: seamBeadV }
        @keyframes seamBeadV { 0% { opacity: 0; background-position: 50% 100% } 18% { opacity: 1 } 80% { opacity: .9 }
                               100% { opacity: 0; background-position: 50% 0% } }
        .mo-off .dock-bar::before { transition: none } .mo-off .dock-open .dock-bar::after { animation: none }
        .mo-off .dock-row .dock-panel { transition: none !important }
        /* «Дыхание» пульта при раскрытии и закрытии — только поперёк полосы
           значков. Общая анимация растягивала капсулу и вдоль, и значки с
           шестерёнкой гуляли на 20 с лишним пикселей. Снизу и сверху высота
           меняется на ~660 px против ~250 у бокового — поэтому и сворачивание
           здесь мягче и дольше: прежняя кривая с разгоном к концу давала
           90 px за кадр в последний миг. */
        @keyframes dockBounceH { 0% { transform: none } 28% { transform: scale(1, .985) } 58% { transform: scale(1, 1.01) } 100% { transform: none } }
        @keyframes dockSettleH { 0% { transform: none } 55% { transform: scale(1, 1.006) } 82% { transform: scale(1, .997) } 100% { transform: none } }
        @keyframes dockBounceV { 0% { transform: none } 28% { transform: scale(.985, 1) } 58% { transform: scale(1.01, 1) } 100% { transform: none } }
        @keyframes dockSettleV { 0% { transform: none } 55% { transform: scale(1.006, 1) } 82% { transform: scale(.997, 1) } 100% { transform: none } }
        .dock-row:is(.dock-bottom, .dock-top) .dock.dock-open { animation-name: dockBounceH }
        .dock-row:is(.dock-bottom, .dock-top) .dock.dock-closing { animation-name: dockSettleH }
        .dock-row:is(.dock-left, .dock-right) .dock.dock-open { animation-name: dockBounceV }
        .dock-row:is(.dock-left, .dock-right) .dock.dock-closing { animation-name: dockSettleV }
        .dock-row:is(.dock-bottom, .dock-top) .dock-panel { transition: grid-template-rows 1.22s cubic-bezier(.4,0,.2,1) }
        .dock-row:is(.dock-bottom, .dock-top) .dock-open .dock-panel { transition: grid-template-rows 1.22s cubic-bezier(.25,1.1,.3,1) }
        .mo-off .dock-row .dock.dock-open, .mo-off .dock-row .dock.dock-closing { animation: none !important }

        /* ---------- обводка значков пульта ----------
           Стеклянное кольцо с градиентом по кромке: блик сверху-слева,
           голубой отсвет снизу-справа. У невыбранных оно едва видно,
           от наведения проявляется, у выбранной горит. Значок при наведении
           приподнимается на пружине, у выбранной — светится. */
        .dock-tabs > button::before { content: ""; position: absolute; inset: 1px; z-index: 1; pointer-events: none;
          border-radius: inherit; padding: 1px;
          background: linear-gradient(145deg, rgba(255,255,255,0.75), rgba(255,255,255,0.10) 36%, rgba(255,255,255,0) 56%, rgba(125,211,252,0.55));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          opacity: .2; transform: scale(.94); transition: opacity .8s ease, transform 1.05s var(--ease-spring) }
        .dock-tabs > button:hover::before { opacity: .6; transform: none }
        .dock-tabs > button.tab-on::before { opacity: 1; transform: none;
          background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(190,230,255,0.30) 34%, rgba(255,255,255,0) 56%, rgba(167,139,250,0.85)) }
        .dock-tabs > button .tab-ic { stroke-width: 1.85; transition: transform 1.05s var(--ease-spring), filter .8s ease, color .8s ease }
        .dock-tabs > button:hover .tab-ic { transform: translateY(-1.5px) scale(1.1) }
        .dock-tabs > button.tab-on .tab-ic { transform: scale(1.06);
          filter: drop-shadow(0 0 calc(var(--mb, 1) * 5px) rgba(160,220,255,0.7)) }
        .noborders .dock-tabs > button::before { opacity: 0 }
        .noborders .dock-tabs > button.tab-on::before { opacity: .8 }
        ${LIQUID_CSS}
        .upd-fill { position: absolute; inset: 0; border-radius: inherit; background: none; box-shadow: none }
        ${MOTION_CSS}
        ${ECO_CSS}
        ${MORPH_CSS}
        ${LANG_CSS}
        ${settings.skin === "material" ? materialCss(settings.mode === "light", settings.mdIcons) : lightScene ? LIGHT_CSS : ""}
      `,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.theme, settings.font, settings.ground, settings.corners, settings.panelFill, backdrop, settings.scene, settings.skin, settings.mode, settings.mdIcons]);
  return (
    <div
      className={`app mo-${motion} dens-${settings.density} th-${settings.theme} sc-${settings.scene || "none"}${settings.scene === "liquidLight" ? " sc-light" : ""}${material ? " sk-material" : ""}`
        + `${settings.borders ? "" : " noborders"}` + ` dockpos-${dockPos}`
        // Что из стекла реально действует: эко, тонировка, линза (только
        // в Chromium) — решение целиком в glassClasses().
        + glassClasses(settings, { eco })}
      style={{
        // Сила стекла (ползунок): из неё тема выводит прозрачность, иней и фаску.
        "--lg-k": glassLevel(settings) / 100, "--zs": zs,
        // Прозрачно, когда фон рисуется слоями на body: инлайновая заливка
        // сильнее любого правила и перекрыла бы их целиком.
        minHeight: "100vh", background: backdrop ? "transparent" : BG,
        color: TEXT, fontFamily: SANS,
        padding: "0 0 40px", boxSizing: "border-box",
      }}
    >
      {/* ============ ШАПКА ============ */}
      <header style={{ padding: "18px 22px 0", zoom: zs > 1 ? zs : undefined }}>
        <div style={{
          ...pageWide, maxWidth: pageMax > 0 ? pageMax / zs : "none", margin: "0 auto", padding: "0 22px", boxSizing: "border-box",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span data-poke="kiwi" style={{ display: "inline-flex", cursor: "pointer" }}>{tonalIcon ? <TonalMark size={36} /> : <KiwiMark size={36} g={g} />}</span>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 1.2,
              fontFamily: SANS, color: TEXT, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9,
            }}>
              <span data-poke="chip" style={{ display: "inline-block" }}>Weathered_Kiwi</span>
              <span className="ver-wrap">
                <span ref={verRef} className="ver-chip" data-poke="chip" role="button" tabIndex={0} onClick={toggleVer}
                      style={{ margin: 0, cursor: "pointer" }}>{APP_VERSION}</span>
                {verOpen && (
                  <MorphPop className="ver-pop" anchor={verRef} owner=".ver-chip">
                    <span className="ver-pop-t">Версия</span>
                    <span className="ver-pop-v">{APP_VERSION}</span>
                    {verPhase === "idle" && (
                      <Btn primary g={g} onClick={runVerCheck} style={{ width: "100%", borderRadius: 999 }}>Найти обновление</Btn>
                    )}
                    {verPhase === "busy" && (
                      <span className="ver-state"><i className="ver-spin" />Сверяю версию с сервером обновлений…</span>
                    )}
                    {verPhase === "latest" && (
                      <>
                        <span className="ver-state ver-ok">✓ Установлена последняя версия</span>
                        <VerFacts r={verResult} />
                        <button className="ver-again" onClick={runVerCheck}>проверить ещё раз</button>
                      </>
                    )}
                    {verPhase === "unreached" && (
                      <>
                        <span className="ver-state ver-bad">Сервер обновлений не ответил — есть ли версия новее, неизвестно. Проверьте интернет.</span>
                        <VerFacts r={verResult} />
                        <button className="ver-again" onClick={runVerCheck}>проверить ещё раз</button>
                      </>
                    )}
                    {verPhase === "available" && update && (
                      <Btn primary g={g} onClick={() => { closeVer(); setShowUpdate(true); }}
                           style={{ width: "100%", borderRadius: 999, color: accent }}>
                        Обновление · {update.info.version}
                      </Btn>
                    )}
                    {verPhase === "nosupport" && (
                      <span className="ver-state">Проверка обновлений есть в программе для Windows и в приложении для Android.</span>
                    )}
                  </MorphPop>
                )}
              </span>
              <span className="claude-wrap">
              <span ref={claudeRef} className="claude-chip" data-poke="chip" role="button" tabIndex={0}
                    onClick={toggleClaude} style={{ cursor: "pointer" }}>
                <i className="cl-sheen" aria-hidden="true" />
                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  {[0, 30, 60, 90, 120, 150].map((a) => (
                    <line key={a} x1="12" y1="2.5" x2="12" y2="21.5" transform={`rotate(${a} 12 12)`} />
                  ))}
                </svg>
                Claude
              </span>
              <ClaudeDrop open={showClaude} chipRef={claudeRef} />
            </span>
            </h1>
          </div>

          {/* Справа — только значок батареи, без подписей. Станция на связи и у неё есть
              батарея — заряд станции; иначе — заряд самого устройства, чтобы значок не горел пустым. */}
          {(() => {
            const stationBat = connected && hasBattery;
            const dev = !stationBat && deviceBat ? deviceBat : null;
            const pct = stationBat ? Math.max(0, Math.min(100, data.batteryPercent))
              : dev ? dev.pct : null;
            const charging = stationBat ? data.chargeState === "charging" : !!(dev && dev.charging);
            const col = pct == null ? "rgba(var(--ink, 231,238,246),0.55)"
              : pct >= 80 ? "#34d399" : pct >= 60 ? "#facc15" : pct >= 20 ? "#fb923c" : "#ef4444";
            const title = pct == null ? "Питание"
              : `${stationBat ? "Батарея станции" : `Батарея ${DEVICE_NAME[devKind]}`}: ${pct}%${charging ? ", заряжается" : ""}`;
            return (
              <div data-poke="chip" className={`bat-glass${pct != null && pct < 20 ? " bat-low" : ""}${dev ? " bat-dev" : ""}`}
                   title={title} style={{ "--bat": col }}>
                {dev && (
                  <svg className="bat-ico" width="16" height="14" viewBox="0 0 24 20" fill="none" stroke="currentColor"
                       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {devKind === "phone" && <><rect x="8" y="1" width="8" height="18" rx="2" /><line x1="11" y1="16.2" x2="13" y2="16.2" /></>}
                    {devKind === "tablet" && <><rect x="3.5" y="2" width="17" height="16" rx="2" /><circle cx="18.2" cy="10" r="0.7" fill="currentColor" /></>}
                    {devKind === "laptop" && <><rect x="4" y="3" width="16" height="10.5" rx="1.5" /><path d="M1.5 16.5h21l-1.6 1.8H3.1z" /></>}
                  </svg>
                )}
                <div className="bat-body">
                  <Liquid className="bat-fill" busy={charging} color="var(--bat)"
                          v={(pct == null ? (data.powerSource === "external" ? 100 : 0) : pct) / 100} />
                  {charging && <span className="bat-bolt" aria-hidden="true">⚡</span>}
                </div>
                <b className="bat-cap" />
              </div>
            );
          })()}
        </div>

      </header>

      <main className={leaving ? "tab-leaving" : undefined} style={{ ...pageWide, margin: "0 auto", padding: "22px 22px 90px", "--tdir": tabDir }}>
        {/* Плашка наверху публичной копии. Состояний теперь четыре, и это не
            украшение: раньше здесь стоял один текст «живого ветра здесь нет»,
            и он стал бы неправдой ровно в тот момент, когда ветер пошёл.
            Порядок веток — от частного к общему. */}
        {(PUBLIC_COPY || viaCloud) && showBanner && (
          <div className={`pnl${bannerOut ? " banner-out" : ""}`} data-poke="banner" style={{
            // Через те же переменные, что и настоящие панели: класс .pnl на
            // этой плашке был, а вид был прошит инлайном — и в стеклянной теме
            // она одна оставалась картонной.
            border: "1px solid var(--pnl-line)", borderLeft: `2px solid ${accent}`,
            borderRadius: "var(--pnl-corner)", background: "var(--pnl-bg)",
            boxShadow: "var(--pnl-shadow)", padding: "11px 14px",
            marginBottom: 20, fontSize: 11, lineHeight: 1.7, color: "rgba(var(--ink, 231,238,246),0.78)",
          }}>
            <button className="set-x" aria-label="Убрать" title="Убрать до перезапуска"
                    style={{ float: "right", marginLeft: 12 }}
                    onClick={() => { setBannerOut(true); setTimeout(() => setShowBanner(false), 680); /* bannerOut — .61 с; прежние 450 мс убирали плашку, пока она ещё была видна */ }}>✕</button>
            {demoMode && fellBack ? (
              /* (г) упали в демо: сказать почему и дать вернуться. */
              <>
                <span style={{ color: TEXT, letterSpacing: 2, fontWeight: 600, textShadow: glow(g, 0.6) }}>ДЕМО · ОБЛАКО МОЛЧИТ</span>
                {" — подключиться к станции через брокер не вышло, и дашборд показывает модель, "}
                чтобы экран не остался пустым. Причина бывает и на этой стороне (нет интернета,
                сеть режет соединение), и на той (станция не выходила на связь, или у неё не
                заполнен идентификатор в облаке). Это не поломка станции: прямо из её сети она
                отвечает как обычно.
                <div style={{ marginTop: 10 }}>
                  <Btn g={g} onClick={() => { setSource("station"); setLink("cloud"); }}>ПОПРОБОВАТЬ ЕЩЁ РАЗ</Btn>
                </div>
              </>
            ) : viaCloud && cloudOnline === false ? (
              /* (в) станция офлайн: показать, когда был последний кадр. */
              <>
                <span style={{ color: TEXT, letterSpacing: 2, fontWeight: 600, textShadow: glow(g, 0.6) }}>СТАНЦИЯ ОФЛАЙН</span>
                {" — брокер держит последний кадр, который она успела отдать, и показания ниже "}
                именно из него. Живыми они не станут, пока плата не выйдет на связь.
                {lastUpdate
                  ? ` Последний кадр — ${lastUpdate.toLocaleString("uk-UA")} (по часам самой станции).`
                  : " Когда именно он снят, сказать нечем: часы станции в нём не были синхронизированы."}
              </>
            ) : viaCloud ? (
              /* (б) идёт через облако — узкая строка, а не простыня. */
              <>
                <span style={{ color: TEXT, letterSpacing: 2, fontWeight: 600, textShadow: glow(g, 0.6) }}>ЧЕРЕЗ ОБЛАКО</span>
                {" — показания настоящие: станция сама выходит наружу и публикует их на брокер. "}
                Запаздывание около секунды — это очередь на плате, а не сеть.
                Управление — во вкладке «Станция»: подписанные команды с ключом оператора
                (сброс порыва, перезагрузка, светодиоды в авто).
              </>
            ) : (
              /* (а) облака нет — прежний текст, слово в слово. */
              <>
                <span style={{ color: TEXT, letterSpacing: 2, fontWeight: 600, textShadow: glow(g, 0.6) }}>ДЕМОНСТРАЦИЯ</span>
                {" — это публичная копия интерфейса, живого ветра здесь нет. "}
                Настоящая станция работает автономно и раздаёт свою сеть{" "}
                <b style={{ color: TEXT }}>WindStation</b>; дашборд с реальными показаниями открывается
                по <b style={{ color: TEXT }}>http://MyWindProbeBETA.org</b> с устройства,
                подключённого к ней. Все настройки ниже — рабочие, их можно потрогать.
                {cloudAvail && " Если у станции есть модем, ей можно вписать идентификатор в облаке — тогда её показания видно и отсюда."}
              </>
            )}
          </div>
        )}

        {/* ---------------- ВЕТЕР ---------------- */}
        {shownTab === "wind" && (
          <div key="wind" className="tabfade">
            {/* Источник вкладки: приборы станции или данные района */}
            {!layoutMode && (
              <SourceSwitch on={areaOn} setOn={setAreaOn} coords={district.coords} place={district.place} g={g}
                            status={isStation ? (connected ? "Показаны приборы станции"
                              : lastSeen ? `Станция не отвечает · последнее ${Number(lastSeen.f.speed).toFixed(1)} м/с в ${new Date(lastSeen.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                              : "Станция не отвечает") : "Показаны приборы"} />
            )}
            {layoutMode && (
              <LayoutBar g={g} accent={accent}
                         onDone={() => setLayoutMode(false)}
                         onReset={() => setS({ layout: [] })} />
            )}
            {areaOn && !layoutMode ? (
              <AreaMode g={g} accent={accent} district={district} onGoArea={goArea} />
            ) : (
            <div ref={gridRef} className="wind-grid" style={{
              display: "grid",
              gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))`,
              gridAutoRows: `${ROW}px`,
              // Плотная укладка: блок уже оставшейся дырки заезжает в неё, а не
              // уходит на новую строку. Без неё свободный размер оставлял бы
              // пустоты везде, где соседи разной ширины.
              gridAutoFlow: "row dense",
              // Зазор между блоками — поля по GAP/2 у каждого блока, значит и у
              // крайних тоже. Отрицательное поле сетки их снимает: внешние края
              // панелей встают вровень с шапкой и переключателем над ними.
              margin: -GAP / 2,
            }}
              onPointerMove={(e) => { drag.move(e); resize.move(e); }}
              onPointerUp={() => { drag.end(); resize.end(); }}
              onPointerCancel={() => { drag.end(); resize.end(); }}
            >
              {shownRows.map((r, i) => {
                const live = resize.live?.id === r.id ? resize.live : r;
                return (
                  <div key={r.id} className="blk"
                       style={{
                         gridColumn: `span ${spanFor(live.w, tracks)}`,
                         gridRow: `span ${live.h}`,
                         padding: GAP / 2,
                         "--i": i,
                       }}>
                    {layoutMode
                      ? <BlockFrame row={r} ops={lay} drag={drag} resize={resize}>{r.block.node}</BlockFrame>
                      : r.block.node}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* ---------------- МЕТЕОРОЛОГИЯ ---------------- */}
        {shownTab === "meteo" && (
          <div key="meteo" className="tabfade">
            <Meteorology g={g} accent={accent} motion={motion} />
          </div>
        )}

        {/* ---------------- РАДАР ---------------- */}
        {shownTab === "radar" && (
          <div key="radar" className="tabfade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Приборов стало шесть, и показывать их одной простынёй нельзя:
                приборная панель превращается в свалку. Каждый прибор — свой экран. */}
            <div className="sub-row" style={{ display: "flex" }}>
              <Segments variant="tabs" ariaLabel="Прибор" value={radarView} onChange={setRadarView}
                        options={RADAR_OPTS} />
            </div>

            {radarView === "conv" && (
              <Panel title="Круговой обзор" g={g} delay={0}
                     meta={`АЗИМУТ · ДАЛЬНОСТЬ = СКОРОСТЬ, ${unit.short}`}>
                {hasDir ? (
                  <>
                    <PPIScope
                      hist={windowHist} direction={data.direction} speed={data.speed} gust={data.gust}
                      speedMax={data.speedMax ?? 30} unit={settings.unit} accent={accent} g={g} motion={motion}
                    />
                    <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>
                      Каждая отметка — одно измерение за последние {settings.histMinutes} мин: угол задаёт
                      направление, удаление от центра — скорость. Свежие ярче старых. Кольцом отмечен порыв.
                      Развёртка вращается для отсчёта времени и данных не добавляет.
                    </div>
                  </>
                ) : (
                  <div style={{ color: DIM, fontSize: 11, lineHeight: 1.7, padding: "24px 4px" }}>
                    Датчик направления не подключён, поэтому азимут неизвестен и круговой
                    обзор строить не из чего. Скорость и всё, что от неё зависит, работает.
                  </div>
                )}
              </Panel>
            )}

            {radarView === "conv" && (
              <Panel title="Конвективный профиль" g={g} delay={70}
                     meta={analysis ? `ОКНО ${settings.histMinutes} МИН` : "НАКОПЛЕНИЕ"}>
                <ConvectiveScope analysis={analysis} accent={accent} g={g} motion={motion} />
                <div style={{
                  marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}`,
                  color: lvl.color, fontSize: 11, lineHeight: 1.6, fontWeight: 500,
                }}>
                  {lvl.text}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Row k="Коэффициент порывистости G" v={analysis ? analysis.gf.toFixed(2) : "—"} g={g} />
                  <Row k="Турбулентность TI" v={analysis ? `${Math.round(analysis.ti * 100)} %` : "—"} g={g} />
                  <Row k="Разворот ветра" v={analysis ? `${Math.round(analysis.shift)}° / мин` : "—"} g={g} />
                  <Row k="Макс. рост за 60 с" v={analysis ? `${analysis.rise.toFixed(1)} м/с` : "—"} g={g} />
                  <Row k="Критерий шквала ВМО" v={analysis && analysis.squall ? "ВЫПОЛНЕН" : "не выполнен"} g={g} mono={false} />
                  <Row k="Признаки вращения" v={analysis && analysis.rotation ? "ЕСТЬ" : "нет"} g={g} mono={false} />
                </div>
              </Panel>
            )}

            {radarView === "conv" && (
              <Panel title="Роза ветров" g={g} delay={140}
                     meta={`ЗА СЕАНС · ${rose.total + rose.calm} ОТСЧЁТОВ`}>
                {hasDir ? (
                  <>
                    <WindRose rose={rose} g={g} mono={monoAccent} motion={motion} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, justifyContent: "center" }}>
                      {ROSE_BANDS.map((b, i) => (
                        <span key={b.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: DIM }}>
                          <span style={{
                            width: 10, height: 10, display: "inline-block",
                            background: (monoAccent ? ROSE_GRAY : ROSE_COLORS)[i],
                          }} />
                          {b.label}
                        </span>
                      ))}
                      <span style={{ fontSize: 9.5, color: FAINT }}>м/с</span>
                    </div>
                    <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6, marginTop: 10 }}>
                      Копится с момента открытия страницы: длина лепестка — доля времени, что ветер
                      дул с этого румба, цвет — с какой силой. В центре доля штиля. История живёт
                      в браузере и обнуляется при перезагрузке.
                    </div>
                  </>
                ) : (
                  <div style={{ color: DIM, fontSize: 11, lineHeight: 1.7, padding: "24px 4px" }}>
                    Роза строится по направлению, а датчика направления на станции нет.
                  </div>
                )}
              </Panel>
            )}

            {radarView === "conv" && (
              <Panel title="Состояние по шкале Бофорта" g={g} delay={210} meta="ПРИЗНАКИ ВМО">
                <BeaufortStrip speed={data.speed} g={g} accent={accent} motion={motion} />
              </Panel>
            )}

            {radarView === "map" && (
              <Panel title="Карта мира" g={g} delay={0}
                     meta={ONLINE ? "ЖИВЫЕ СЛОИ · NWS / NOAA" : "БЕЗ СЕТИ · ТОЛЬКО АРХИВ"}>
                <WorldMap g={g} motion={motion} online={ONLINE} site={siteInfo}
                          showGrid={settings.showGrid} quality={settings.mapQuality}
                          pixelRadar={settings.pixelRadar !== false}
                          pixelCells={settings.pixelCells !== false} />
              </Panel>
            )}

            {radarView === "live" && (
              <Panel title="Эфир" g={g} delay={0}
                     meta={ONLINE ? "СПУТНИК И РАДАР · NOAA" : "БЕЗ СЕТИ"}>
                <LiveWatch g={g} motion={motion} online={ONLINE} />
              </Panel>
            )}
          </div>
        )}
        {/* ---------------- СИСТЕМА ---------------- */}
        {/* ---------------- РАЙОН ---------------- */}
        {shownTab === "area" && (
          <div key="area" className="tabfade">
            <AreaTab g={g} district={district} onGoWeather={goWind} />
          </div>
        )}

        {/* ---------------- АНАЛИЗ ---------------- */}
        {shownTab === "analysis" && (
          <div key="analysis" className="tabfade">
            <AnalysisTab ui={UI} g={g} accent={accent} logKey={logKey} history={history} data={data}
                         coords={coords} settings={settings} setS={setS} isStation={isStation} connected={connected} />
          </div>
        )}

        {/* ---------------- СТАНЦИЯ ---------------- */}
        {shownTab === "system" && (
          <div key="system" className="tabfade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ConnectPanel ui={UI} g={g} accent={accent} stations={stations}
                          activeId={activeStation ? activeStation.id : null}
                          connected={isStation && connected} publicCopy={PUBLIC_COPY} cloudAvail={cloudAvail}
                          servedFromStation={SERVED_FROM_STATION}
                          onSelect={selectStation} onRemove={removeStation} onSave={saveStation}
                          onTestCloud={cloudProbeText} />

            <SystemHero data={data} hasBattery={hasBattery} rssi={rssi} ageSec={ageSec}
                        chargeView={CHARGE_VIEW} powerView={POWER_VIEW} g={g} />

            <LedDeck
              leds={{ green: data.ledGreen, yellow: data.ledYellow, red: data.ledRed, wifi: data.ledWifi }}
              autoMode={data.ledAuto} onSet={setLed} onAutoToggle={toggleAuto} g={g} delay={60}
              readOnly={viaCloud}
              readOnlyNote="Через облако светодиодами не управлять: команда обязана быть подписанной и уходит только по прямому каналу из сети станции. Показанное состояние настоящее — оно приходит в кадре с платы."
            />

            {/* ---- Место станции ---- */}
            {/* Место — вкладка «Станция», а не блок главной страницы. Блоки
                главной адресуются по id, а id блока это ключ СОХРАНЁННОЙ
                раскладки: новый блок появился бы видимым у всех и сдвинул
                чужую сетку. Плюс соседство по смыслу: точка доступа,
                светодиоды и loopMax — один разговор о самочувствии платы. */}
            {isStation && (
              <Panel title="Место станции" g={g} delay={150}
                     meta={siteInfo ? SITE_FROM[siteInfo.from] : "НЕ НАСТРОЕНО"}>
                {!siteInfo ? (
                  <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
                    Координаты не заданы — их можно вписать у станции в каталоге.
                  </div>
                ) : siteUnset ? (
                  <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
                    В <span style={{ ...NUM, fontSize: 10.5 }}>secrets.h</span> не задано: станция
                    отдаёт 0/0, а это значит «координаты не настроены», а не точка в Гвинейском
                    заливе. Метки на карте поэтому тоже нет.
                  </div>
                ) : (
                  <>
                    <Row k="Широта" v={`${siteInfo.lat.toFixed(3)}°`} g={g} />
                    <Row k="Долгота" v={`${siteInfo.lon.toFixed(3)}°`} g={g} />
                    {Number.isFinite(siteInfo.altM) && <Row k="Высота" v={`${Math.round(siteInfo.altM)} м`} g={g} />}
                    {siteInfo.host && <Row k="Адрес" v={siteInfo.host} g={g} />}
                    <div style={{ display: "flex", gap: 10, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
                      <Btn g={g} onClick={() => { setRadarView("map"); setTab("radar"); }}>ПОКАЗАТЬ НА КАРТЕ</Btn>
                      <a href={`https://maps.google.com/?q=${siteInfo.lat},${siteInfo.lon}`}
                         target="_blank" rel="noreferrer"
                         style={{ color: DIM, fontSize: 10.5, fontFamily: SANS }}>
                        открыть в картах ↗
                      </a>
                    </div>
                  </>
                )}
              </Panel>
            )}

            {/* ---- Связь и время ---- */}
            {/* Всё из кадра, поэтому панель работает ПО ОБОИМ КАНАЛАМ. staIp —
                единственный способ узнать адрес платы в домашней сети, не
                открывая роутер, и жил он до сих пор в блоке /api/wifi, то есть
                был недоступен ровно тогда, когда нужен. */}
            {isStation && frameSeen && (
              <Panel title="Связь и время" g={g} delay={180}
                     meta={viaCloud ? "ИЗ КАДРА · ОБЛАКО" : "ИЗ КАДРА"}>
                <RowMaybe k="Домашняя сеть" src={data} f="staSsid" g={g} />
                <RowMaybe k="Подключена" src={data} f="staConnected" g={g} mono={false}
                          fmt={(v) => (v ? "да" : "нет")} />
                <RowMaybe k="IP в домашней сети" src={data} f="staIp" g={g} />
                <RowMaybe k="Имя" src={data} f="hostname" g={g} />
                <RowMaybe k="Часы станции" src={data} f="timeValid" g={g} mono={false}
                          fmt={(v) => (v && data.epoch
                            ? new Date(data.epoch * 1000).toLocaleString("uk-UA")
                            : "не синхронизированы")} />
                <RowMaybe k="Аплинк PPP" src={data} f="pppState" g={g} mono={false} />
                <RowMaybe k="IP через модем" src={data} f="pppIp" g={g} />
                <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
                  <Label g={g}>Самочувствие loop()</Label>
                  <div style={{ marginTop: 7 }}>
                    <RowMaybe k="loopMax" src={data} f="loopMax" g={g} fmt={(v) => `${v} мс`} />
                    <RowMaybe k="Строка телеметрии" src={data} f="logMs" g={g} fmt={(v) => `${v} мс`} />
                    <RowMaybe k="Потеряно кадров SSE" src={data} f="sseDrop" g={g} />
                  </div>
                </div>
                {viaCloud && cloudSession && (
                  <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
                    <Row k="Нонс загрузки" v={String(cloudSession)} g={g} />
                  </div>
                )}
              </Panel>
            )}

            {/* ---- Модем и облако ---- */}
            {/* При direct — то, что видит сама плата. При viaCloud панель не
                исчезает, а показывает КЛИЕНТСКИЕ метрики с явной пометкой.
                ⛔ Смешивать их со счётчиками прошивки (pubDrop, errors) нельзя:
                это разные величины, померенные с разных концов канала. */}
            {viaCloud ? (
              <Panel title="Модем и облако" g={g} delay={210} meta="ПО ДАННЫМ ЗРИТЕЛЯ">
                <Row k="Станция на связи" g={g} mono={false}
                     v={cloudOnline == null ? "ещё не знаю" : cloudOnline ? "да" : "нет"} />
                <Row k="Состояние канала" g={g} mono={false} v={CLOUD_PHASE_VIEW[cloudPhase] || cloudPhase} />
                <Row k="Кадр состояния" g={g} mono={false}
                     v={!cloudStateAt ? "не приходил"
                       : cloudStateAt.retained
                         ? (cloudStateAt.timeValid && cloudStateAt.epoch
                           ? `слепок брокера, снят ${new Date(cloudStateAt.epoch * 1000).toLocaleString("uk-UA")}`
                           : "слепок брокера, когда снят — неизвестно")
                         : `живой, ${Math.round((time - cloudStateAt.at) / 1000)} с назад`} />
                <Row k="Живых кадров показано" v={String(cloudSeen.frames)} g={g} />
                <RowMaybe k="Пакетов потеряно" f="lost" src={cloudStats} g={g} />
                <RowMaybe k="Отброшено переполнением" f="dropped" src={cloudStats} g={g} />
                <RowMaybe k="В буфере сейчас" f="buffered" src={cloudStats} g={g} />
                <RowMaybe k="Запас буфера" f="budgetMs" src={cloudStats} g={g}
                          fmt={(v) => `${Math.round(v)} мс`} />
              </Panel>
            ) : direct && (modem || cloudApi) ? (
              <Panel title="Модем и облако" g={g} delay={210}
                     meta={sysBusy ? "СПРАШИВАЮ…" : modem && cloudApi ? "ПЛАТА ОТВЕТИЛА" : modem ? "ТОЛЬКО МОДЕМ" : "ТОЛЬКО ОБЛАКО"}>
                {modem && (
                  <>
                    <Label g={g}>4G-аплинк</Label>
                    <div style={{ marginTop: 7 }}>
                      <RowMaybe k="Состояние" src={modem} f="state" g={g} mono={false} />
                      <RowMaybe k="IP" src={modem} f="ip" g={g} />
                      <RowMaybe k="Шлюз" src={modem} f="gw" g={g} />
                      <RowMaybe k="Приоритет маршрута" src={modem} f="routePrio" g={g} />
                      <RowMaybe k="Маршрут по умолчанию" src={modem} f="isDefault" g={g} mono={false}
                                fmt={(v) => (v ? "да" : "нет")} />
                      <RowMaybe k="Попыток" src={modem} f="tries" g={g} />
                      <RowMaybe k="Блокировка loop()" src={modem} f="busyMaxMs" g={g} fmt={(v) => `${v} мс`} />
                      <RowMaybe k="Последняя ошибка" src={modem} f="lastError" g={g} mono={false} />
                      <RowMaybe k="Оператор" src={modem} f="operator" g={g} mono={false} />
                      <RowMaybe k="Сигнал" src={modem} f="rssi" g={g} fmt={(v) => `${v} dBm`} />
                      <RowMaybe k="Режим сети" src={modem} f="mode" g={g} mono={false} />
                      <RowMaybe k="Проба TCP" src={modem} f="probe" g={g} mono={false} />
                      <RowMaybe k="Время по NTP" src={modem} f="ntp" g={g} mono={false} />
                      <RowMaybe k="Резолвер" src={modem} f="dns" g={g} mono={false} />
                    </div>
                  </>
                )}
                {cloudApi && (
                  <div style={{ marginTop: modem ? 12 : 0, paddingTop: modem ? 11 : 0,
                                borderTop: modem ? `1px solid ${LINE}` : "none" }}>
                    <Label g={g}>Облачный канал</Label>
                    <div style={{ marginTop: 7 }}>
                      <RowMaybe k="Включён" src={cloudApi} f="enabled" g={g} mono={false} fmt={(v) => (v ? "да" : "нет")} />
                      <RowMaybe k="Подключён" src={cloudApi} f="connected" g={g} mono={false} fmt={(v) => (v ? "да" : "нет")} />
                      <RowMaybe k="Брокер" src={cloudApi} f="host" g={g} />
                      <RowMaybe k="Идентификатор" src={cloudApi} f="stationId" g={g} />
                      <RowMaybe k="Идёт через" src={cloudApi} f="via" g={g} mono={false} />
                      <RowMaybe k="Пришпилен к" src={cloudApi} f="boundIf" g={g} />
                      <RowMaybe k="Подключений" src={cloudApi} f="connects" g={g} />
                      <RowMaybe k="Ошибок" src={cloudApi} f="errors" g={g} />
                      <RowMaybe k="Кадров отдано" src={cloudApi} f="pubLive" g={g} />
                      <RowMaybe k="Кадров потеряно" src={cloudApi} f="pubDrop" g={g} />
                      <RowMaybe k="Команд принято" src={cloudApi} f="cmdOk" g={g} />
                      <RowMaybe k="Команд отвергнуто" src={cloudApi} f="cmdBad" g={g} />
                      <RowMaybe k="Агрегатов в очереди" src={cloudApi} f="aggPending" g={g} />
                      <RowMaybe k="Свободно памяти" src={cloudApi} f="heapFree" g={g} fmt={(v) => `${v} Б`} />
                      <RowMaybe k="Минимум памяти" src={cloudApi} f="heapMin" g={g} fmt={(v) => `${v} Б`} />
                      <RowMaybe k="Последняя ошибка" src={cloudApi} f="lastError" g={g} mono={false} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <Btn g={g} disabled={!!sysBusy} onClick={() => { askModem(null); askCloudApi(); }}>ОБНОВИТЬ</Btn>
                  <Btn g={g} disabled={!!sysBusy || !modem} onClick={() => askModem("radio")}>РАДИО</Btn>
                  <Btn g={g} disabled={!!sysBusy || !modem} onClick={() => askModem("probe")}>ПРОБА TCP</Btn>
                  <Btn g={g} disabled={!!sysBusy || !modem} onClick={() => askModem("ntp")}>ВРЕМЯ NTP</Btn>
                </div>
              </Panel>
            ) : null}

            {isStation && <HealthPanel ui={UI} g={g} accent={accent} logKey={logKey} data={data} fcNow={fcNow} events={events} />}
            {isStation && <EventsPanel ui={UI} g={g} events={events} />}
            {isStation && <RulesPanel ui={UI} g={g} accent={accent} settings={settings} setS={setS} />}
            {direct && <ZeroWizard ui={UI} g={g} host={esp32Host} logKey={logKey} />}
            {viaCloud && cloudAvail && (
              <RemotePanel ui={UI} g={g} sessionId={cloudSession} loadCloud={loadCloud}
                           stationId={activeStation && activeStation.cloudId} logKey={logKey} />
            )}
            <DesktopWidgets ui={UI} g={g} />

            {/* Условие тут про ДОСТУП, а не про источник: /api/wifi живёт на
                плате и не отдаёт даже CORS, поэтому через облако он недостижим
                принципиально. Третья ветка нужна именно для этого — сказать,
                почему пусто, а не показать «нет ответа». */}
            <Panel title="Точка доступа" g={g} delay={120}
                   meta={!direct ? "НЕДОСТУПНО" : ap ? "ОТВЕТ ПОЛУЧЕН" : "НЕТ ОТВЕТА"}>
              {!direct ? (
                <div style={{ color: DIM, fontSize: 11, lineHeight: 1.6 }}>
                  {viaCloud
                    ? "Недоступно через облако: свою сеть плата описывает только по HTTP у себя же, и наружу этого не публикует. То, что станция рассказывает о домашней сети, есть выше — оно приходит в обычном кадре."
                    : demoMode ? "Недоступно в демо-режиме."
                    : "Недоступно в режиме «район»: сеть есть у платы, а плата сейчас не опрашивается."}
                </div>
              ) : ap ? (
                <>
                  <Row k="Сеть" v={ap.current} g={g} />
                  <Row k="Адрес" v={ap.host || ap.ip} g={g} />
                  <Row k="IP" v={ap.ip} g={g} />
                  <Row k="Клиентов" v={String(ap.clients ?? "—")} g={g} />
                  <Row k="Режим" v={ap.apOnly ? "только точка доступа" : ap.mode || "—"} g={g} mono={false} />

                  {/* Uplink: своя точка у платы поднята всегда, а в домашнюю сеть
                      она уходит фоном и не обязана там оказаться. Поэтому это
                      отдельный блок, а не строчка в общем списке. */}
                  {ap.uplinkSsid !== undefined && (
                    <div style={{ marginTop: 12, paddingTop: 11, borderTop: `1px solid ${LINE}` }}>
                      <Label g={g}>Домашняя сеть</Label>
                      {/* Сама сеть, её IP и факт подключения переехали в «Связь
                          и время»: они есть в кадре, а значит доступны обоими
                          каналами. Здесь осталось то, чего в кадре нет вовсе. */}
                      <div style={{ marginTop: 7 }}>
                        <Row k="Сигнал" v={ap.uplinkRssi ? `${ap.uplinkRssi} dBm` : "—"} g={g} />
                        <Row k="Сетей в памяти" v={String((ap.uplinkKnown || []).length || "—")} g={g} />
                      </div>
                      {(ap.uplinkKnown || []).length > 0 && (
                        <div style={{ ...NUM, color: FAINT, fontSize: 10, marginTop: 7, lineHeight: 1.6, wordBreak: "break-all" }}>
                          {ap.uplinkKnown.join(" · ")}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: DIM, fontSize: 11 }}>Станция не ответила на /api/wifi.</div>
              )}
            </Panel>
          </div>
        )}

      </main>

      {/* Нижняя панель слева: вкладки и настройки в одной стеклянной капсуле,
          кнопка ручного управления демо — отдельно, правее неё. */}
      {/* Появляется, только когда есть что ставить, — как значок обновления
          на телефоне. Сверху по центру, чтобы его нельзя было не заметить. */}
      {update && (
        <button className="upd-tab" onClick={() => setShowUpdate(true)}
                title={`Доступна версия ${update.info.version}`}
                style={{ color: accent, textShadow: glow(g, 0.8), fontFamily: SANS }}>
          <i className="upd-dot" style={{ background: accent }} />
          Обновление
        </button>
      )}

      {/* Затемнение под настройками уходит вместе с панелью, а не исчезает разом. */}
      {(showSettings || (dockClosing && dockView === "settings")) && (
        <div className={showSettings ? "set-scrim" : "set-scrim set-scrim-out"} onClick={() => setShowSettings(false)} />
      )}

      {/* Нижняя панель слева. Настройки и ручное управление демо не открываются
          отдельным окном: сама капсула с вкладками раздвигается вверх, и они
          появляются внутри неё. Кнопка демо — отдельно, правее капсулы. */}
      <div className={`dock-row dock-${dockPos}${settings.dockIcons === "icons" ? " dock-ic-only" : ""}`}>
        {/* Распор под круглые кнопки справа: 48 px кнопка + 12 px зазор на каждую. */}
        {(() => { const fabs = (demoMode ? 1 : 0) + (ON_ANDROID ? 0 : 1);
          return fabs > 0 && <span className="dock-spacer" aria-hidden="true" style={{ width: fabs === 2 ? 104 : 48 }} />; })()}
        <div className={dockOpen ? "dock dock-open" : dockClosing ? "dock dock-closing" : "dock"}>
          <div className="dock-panel" aria-hidden={!dockOpen}>
            <div className="dock-clip">
              <div className="dock-scroll">
                {dockView === "settings" && (
                  <div className="dock-content" key="settings">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Label g={g}>Настройки</Label>
            <button className="set-x" onClick={() => setShowSettings(false)} aria-label="Закрыть">✕</button>
          </div>

          <SetSection title="Внешний вид" first />
          <Choice
            label="Тема" g={g} value={settings.mode === "light" ? "light" : "dark"}
            options={[{ value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" }]}
            onChange={(v) => setS({ mode: v })}
            hint="Только светлая или тёмная. Как выглядят панели — выбирается ниже в «Стиле», а картинка за ними — в «Обоях»."
          />
          <Choice
            label="Стиль" g={g} value={MATERIAL_THEMES[settings.skin] ? settings.skin : "glass"}
            options={Object.entries(MATERIAL_THEMES).map(([value, t]) => ({ value, label: t.label }))}
            onChange={(v) => setS({ skin: v })}
            hint="«По умолчанию» — строгие панели с тонкой гранью. Liquid Glass — стекло, блики и линзы, как в iOS 26. «Тональная» — мягкие цветные поверхности с градиентами и крупными скруглениями, как в приложениях на Android. Анимации у всех одни и те же."
          />
          <Reveal open={settings.skin === "material"}>
            <Choice
              label="Цвет значков" g={g} value={settings.mdIcons === "bg" ? "bg" : "blue"}
              options={Object.entries(MATERIAL_ICONS).map(([value, t]) => ({ value, label: t.label }))}
              onChange={(v) => setS({ mdIcons: v })}
              hint="Шестерёнка, кнопки справа от пульта и выбранная вкладка. «Синие» — тон primary; «в цвет фона» — нейтральные, тем же тоном, что поверхности вокруг."
            />
          </Reveal>
          <Reveal open={settings.skin === "glass"}>
            <Choice
              label="Обои" g={g} value={["live", "dim", "none"].includes(settings.wall) ? settings.wall : "live"}
              options={[{ value: "live", label: "Живые" }, { value: "dim", label: "Приглушённые" }, { value: "none", label: "Без обоев" }]}
              onChange={(v) => setS({ wall: v })}
              hint="Цветные пятна и пузыри, которые медленно плывут под стеклом: им есть что преломлять. «Приглушённые» — то же, но темнее (только в тёмной теме). В эко-режиме обои стоят."
            />
          </Reveal>
          <Switch
            label="Liquid Glass иконка" g={g} accent={accent}
            value={tonalIcon ? "off" : "on"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => setS({ glassIcon: v === "on" })}
            hint="Значок в шапке и значок самого приложения. Включено — стеклянная долька киви, выключено — плоская тональная."
          />
          <div style={{ marginBottom: 18 }}>
            <Label g={g}>Язык</Label>
            <Segments
              ariaLabel="Язык" value={settings.lang ? "pick" : "auto"}
              options={[{ value: "auto", label: "По умолчанию" },
                        { value: "pick", label: settings.lang ? langInfo(settings.lang).name : "Выбрать другой" }]}
              onChange={(v) => (v === "auto" ? setS({ lang: null }) : setLangOpen(true))}
            />
            <div className="lang-cur">
              {settings.lang
                ? <>Выбранный язык: <span translate="no">{langInfo(settings.lang).name}</span> · <button type="button" className="eco-auto" onClick={() => setLangOpen(true)}>Выбрать другой</button></>
                : <>Как в системе: <span translate="no">{langInfo(systemLang()).name}</span></>}
            </div>
          </div>
          <Switch
            label="Эко-режим" g={g} accent={accent}
            value={eco ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => setS({ eco: v === "on" })}
            hint="Для телефонов. Стекло остаётся стеклом — тонировка, фаска, блик, подсветка от касания, — но без инея под панелями, без линзы, без бегущего блика и света от курсора; фон стоит, сцена камеры замирает, поток рисуется 5 раз в секунду вместо 20. Показания от этого не меняются."
          />
          <div style={{ margin: "-12px 0 18px", fontFamily: SANS, fontSize: 10.5, color: DIM, lineHeight: 1.5 }}>
            {settings.eco == null
              ? <>Сейчас решает устройство: {ECO_AUTO ? "похоже на телефон — включён" : "компьютер — выключен"}.</>
              : <button type="button" className="eco-auto" onClick={() => setS({ eco: null })}>
                  вернуть автовыбор ({ECO_AUTO ? "здесь — вкл" : "здесь — выкл"})
                </button>}
          </div>
          {!material && <><Choice
            label="Стекло" g={g} value={settings.glassTint === "tinted" ? "tinted" : "clear"}
            options={Object.entries(GLASS_TINTS).map(([value, t]) => ({ value, label: t.label }))}
            onChange={(v) => setS({ glassTint: v })}
            hint="Clear — прозрачное стекло, как в iOS 26. Tinted — плотнее и контрастнее, текст читается на любом фоне (iOS 26.1)."
          />
          <GlassLevel g={g} value={glassLevel(settings)} eco={eco}
                      onCommit={(v) => setS({ glassLevel: v })} /></>}

          <SetSection title="Станция и данные" />
          {/* Станции переехали во вкладку «Станция» — там подключение целиком.
              Здесь осталась только строка: какая выбрана и куда идти. */}
          <div style={{ marginBottom: 18 }}>
            <Label g={g}>Станция</Label>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 9 }}>
              <span style={{ fontSize: 12, color: activeStation ? TEXT : DIM }}>{activeStation ? activeStation.name : "не подключена"}</span>
              <Btn g={g} onClick={() => { setShowSettings(false); setTab("system"); }} style={{ padding: "3px 10px" }}>
                {stations.length ? "УПРАВЛЯТЬ" : "ПОДКЛЮЧИТЬ"}
              </Btn>
            </div>
          </div>

          <Choice
            label="Единицы скорости" g={g} value={settings.unit}
            options={UNIT_KEYS.map((k) => ({ value: k, label: UNITS[k].label }))}
            onChange={(v) => setS({ unit: v, digits: null })}
          />
          {/* Источник — станция или демо. Района здесь нет: данные района
              включаются над приборами («Станция / Район») и во вкладке «Район»
              и работают при любом положении этого тумблера. */}
          <Switch
            label="Демо-режим" g={g} accent={accent}
            value={demoMode ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => setSource(v === "on" ? "demo" : "station")}
            hint="Выключен — показаны приборы станции. Включён — выдуманный ветер для знакомства с дашбордом; ручки — кнопкой рядом с доком."
          />
          {isStation && cloudAvail && (
            <Choice
              label="Канал" g={g} value={link}
              options={[{ value: "direct", label: "напрямую" }, { value: "cloud", label: "облако" }]}
              onChange={(v) => setLink(v)}
            />
          )}
          <SetSection title="Навигация и раскладка" />
          <Choice
            label="Пульт управления" g={g} value={dockPos}
            options={[{ value: "bottom", label: "Снизу" }, { value: "top", label: "Сверху" },
                      { value: "left", label: "Слева" }, { value: "right", label: "Справа" }]}
            onChange={(v) => setS({ dockPos: v })}
            hint="Сверху и снизу пульт горизонтальный, по бокам — вертикальный. Настройки раскрываются из него в сторону экрана."
          />
          <Choice
            label="Значки пульта" g={g} value={settings.dockIcons === "icons" ? "icons" : "both"}
            options={[{ value: "both", label: "С подписями" }, { value: "icons", label: "Только значки" }]}
            onChange={(v) => setS({ dockIcons: v })}
            hint="Подпись всё равно видна в подсказке при наведении и для читалок экрана."
          />

          <div style={{ marginBottom: 6 }}>
            <Btn g={g} onClick={() => { setShowSettings(false); setLayoutMode(true); setTab("wind"); }}>
              КАСТОМИЗИРОВАТЬ РАСКЛАДКУ
            </Btn>
          </div>

          {ON_ANDROID && (
            <>
              <SetSection title="Экран" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "rgba(var(--ink, 231,238,246),0.55)", lineHeight: 1.5 }}>
                  Во весь экран: крупная цифра для телефона на подставке, ночью тусклый красный. Выход — двойное касание.
                </div>
                <Btn g={g} style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => { setShowSettings(false); setKiosk(true); }}>ОТКРЫТЬ</Btn>
              </div>
            </>
          )}

          <SetSection title="Вибрация" />
          <Choice
            label="Сила" g={g} value={settings.haptics || "normal"}
            options={[{ value: "off", label: "выкл" }, { value: "soft", label: "мягко" }, { value: "normal", label: "обычно" }, { value: "strong", label: "сильно" }]}
            onChange={(v) => { setHapticConfig({ level: v }); setS({ haptics: v }); haptic("tap"); }}
            hint={canVibrate()
              ? "Системный отклик, как у клавиатуры: «мягко» — только лёгкие щелчки, «сильно» — жёстче, а упор ползунка бьёт дважды. Уважает системную настройку «Виброотклик» телефона."
              : "На этом устройстве вибромотора нет — настройка заработает на телефоне."}
          />
          <Reveal open={(settings.haptics || "normal") !== "off"}>
              <Switch
                label="Касание окон" g={g} accent={accent}
                value={settings.hapTouch !== false ? "on" : "off"}
                off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
                onChange={(v) => { setHapticConfig({ touch: v === "on" }); setS({ hapTouch: v === "on" }); haptic("tap"); }}
                hint="Короткий щелчок, когда касаешься кнопки или панели. Прокрутка и перетаскивание не отзываются."
              />
              <Switch
                label="Ползунки" g={g} accent={accent}
                value={settings.hapSliders !== false ? "on" : "off"}
                off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
                onChange={(v) => { setHapticConfig({ sliders: v === "on" }); setS({ hapSliders: v === "on" }); haptic("tick"); }}
                hint="Мелкий щелчок на каждом шаге ползунка и упор у края."
              />
              <Switch
                label="Заставка и обновление" g={g} accent={accent}
                value={settings.hapBoot !== false ? "on" : "off"}
                off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
                onChange={(v) => { setHapticConfig({ boot: v === "on" }); setS({ hapBoot: v === "on" }); haptic("boot"); }}
                hint="Одна длинная вибрация при запуске приложения: начинается еле заметно и плавно нарастает к концу загрузки. При обновлении вибрации нет."
              />
          </Reveal>

          <SetSection title="Уведомления и голос" />
          <Switch
            label="Уведомления" g={g} accent={accent}
            value={settings.notify ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => { setS({ notify: v === "on" }); if (v === "on") requestNotify(); }}
            hint={`Windows и Android: сводка ветра с прогнозом, станция пропала или вернулась, ветер растёт, шквал. Не больше ${DAY_LIMIT} в сутки и не чаще раза в 3 минуты — сегодня отправлено ${sentToday()}.`}
          />
          <Reveal open={!!settings.notify}>
            <Choice
              label="Сводка" g={g} value={String(settings.digestHours ?? 3)}
              options={[{ value: "0", label: "без сводок" }, { value: "1", label: "раз в час" }, { value: "3", label: "раз в 3 ч" }, { value: "6", label: "раз в 6 ч" }]}
              onChange={(v) => setS({ digestHours: +v })}
              hint="Сейчас, прогноз на 6 часов и окно для занятия из «Анализа». Новая сводка заменяет прежнюю, а не копится стопкой."
            />
          </Reveal>
          <Choice
            label="Голосовая сводка" g={g} value={String(settings.voiceEvery || 0)}
            options={[{ value: "0", label: "выкл" }, { value: "5", label: "5 мин" }, { value: "15", label: "15 мин" }, { value: "30", label: "30 мин" }]}
            onChange={(v) => setS({ voiceEvery: +v })}
            hint="Синтезатор речи читает ветер и порыв вслух — когда руки заняты. Разово — кнопкой «Сказать» в режиме во весь экран."
          />
          <Switch
            label="Тревога: ветер растёт" g={g} accent={accent}
            value={settings.trendAlarm ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => {
              setS({ trendAlarm: v === "on" });
              if (v === "on" && typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
            }}
            hint={`Когда за 10 минут ветер вырос на ${settings.trendRise || 5} м/с и больше — не по абсолютному порогу. Не чаще раза в 20 минут.`}
          />
          <Switch
            label="Режим «шторм»" g={g} accent={accent}
            value={settings.stormMode ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => setS({ stormMode: v === "on" })}
            hint="Когда ветер резко растёт или порыв выше порога, дашборд сам открывает экран во весь размер: крупная скорость, порыв и кривая. Не чаще раза в 15 минут, ночью молчит."
          />
          <Reveal open={!!settings.stormMode}>
            <Choice label="Порыв от" g={g} value={String(settings.stormGust ?? 15)}
                    options={[10, 15, 20, 25].map((n) => ({ value: String(n), label: `${n} м/с` }))}
                    onChange={(v) => setS({ stormGust: +v })} />
          </Reveal>
          <Switch
            label="Тихие часы" g={g} accent={accent}
            value={settings.quiet ? "on" : "off"}
            off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
            onChange={(v) => setS({ quiet: v === "on" })}
            hint="Ночью без уведомлений и голоса. Что было за ночь — одной сводкой утром."
          />
          <Reveal open={!!settings.quiet}>
              <Choice label="С" g={g} value={String(settings.quietFrom ?? 23)}
                      options={[21, 22, 23, 0].map((h) => ({ value: String(h), label: `${h}:00` }))}
                      onChange={(v) => setS({ quietFrom: +v })} />
              <Choice label="До" g={g} value={String(settings.quietTo ?? 7)}
                      options={[6, 7, 8, 9].map((h) => ({ value: String(h), label: `${h}:00` }))}
                      onChange={(v) => setS({ quietTo: +v })} />
              <Switch label="Приглушить экран и вибрацию" g={g} accent={accent}
                      value={settings.quietDim !== false ? "on" : "off"}
                      off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
                      onChange={(v) => setS({ quietDim: v === "on" })} />
              <Switch label="Утренняя сводка" g={g} accent={accent}
                      value={settings.morning !== false ? "on" : "off"}
                      off={{ value: "off", label: "выкл" }} on={{ value: "on", label: "вкл" }}
                      onChange={(v) => setS({ morning: v === "on" })} />
          </Reveal>
                  </div>
                )}
                {dockView === "demo" && (
                  <div className="dock-content dock-demo" key="demo">
                    <DemoControls demo={demo} setDemo={setDemo} g={g} accent={accent} onClose={() => setShowDemo(false)} />
                  </div>
                )}
              </div>
            </div>
          </div>
          <nav className="dock-bar">
            <div className="dock-tabs">
            {TABS.map((t) => (
              <Tab key={t.id} id={t.id} active={tab} onClick={setTab} g={g} short={t.short} fluid={fluid}>{t.label}</Tab>
            ))}
            </div>
            <button className="gear-btn dock-gear" onClick={toggleSettings}
                    aria-label="Настройки" title="Настройки">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            </button>
          </nav>
        </div>
        {/* Круглые кнопки справа от пульта. В демо-режиме их две — ручное управление
            и «во весь экран», — и стоят они одной вытянутой капсулой с двумя значками,
            а не двумя кружками рядом. Без демо-режима остаётся один кружок. Капсула
            — один элемент стекла (.gear-btn): одна линза, одна фаска; половинки
            внутри — обычные прозрачные кнопки. На Android кнопки «во весь экран»
            нет, и демо стоит кружком. */}
        {(() => {
          const demoBtn = (cls) => (
            <button className={`${cls}${showDemo ? " is-on" : ""}`} onClick={toggleDemo}
                    aria-label="Ручное управление" title="Ручное управление">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" />
              </svg>
            </button>
          );
          const fullIcon = (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          );
          if (demoMode && !ON_ANDROID) {
            return (
              <div className="gear-btn demo-fab fab-pill">
                {demoBtn("fab-half")}
                <button className="fab-half" onClick={() => setKiosk(true)} aria-label="Во весь экран" title="Во весь экран">{fullIcon}</button>
              </div>
            );
          }
          return (
            <>
              {demoMode && demoBtn("gear-btn demo-fab")}
              {!ON_ANDROID && (
                <button className="gear-btn demo-fab" onClick={() => setKiosk(true)} aria-label="Во весь экран" title="Во весь экран">{fullIcon}</button>
              )}
            </>
          );
        })()}
      </div>

      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none", background: "#000",
                                       opacity: night ? 0.42 : 0, transition: "opacity 2.5s ease" }} />

      {kiosk && (
        <Kiosk speedText={convertSpeed(data.speed, settings.unit)} unit={unit.short}
               gustText={convertSpeed(data.gust || 0, settings.unit)} bft={bf} color={accent}
               name={activeStation ? activeStation.name : demoMode ? "Демо" : "Станция"}
               speed={data.speed} gust={data.gust} history={history} onClose={() => setKiosk(false)} />
      )}

      {/* Перегрузка: ветер вышел за предел датчика. Слой поверх всего,
          но кликов не ловит. */}
      {overloaded && <StormParticles intensity={overFrac} motion={motion} />}

      {/* Живой фон под стеклом: без него стеклу нечего преломлять. Только на
          своей сцене — свою картинку пятна не закрашивают. Фильтры линзы
          вставляет startLens() — у каждого плавающего элемента свой. */}
      {liquid && !material && (settings.scene === "liquid" || settings.scene === "liquidDark" || settings.scene === "liquidLight") && (
        <LiquidWall dark={settings.scene === "liquidDark"} light={settings.scene === "liquidLight"} fps={eco || motion === "off" ? 0 : motion === "calm" ? 5 : 8} />
      )}
      {/* Край прокрутки: содержимое уходит под шапку и под док, растворяясь. */}
      {liquid && <div className="lg-edge lg-edge-top" aria-hidden="true" />}
      {liquid && <div className="lg-edge lg-edge-bot" aria-hidden="true" />}

      {update && showUpdate && (
        <UpdateModal g={g} accent={accent} up={update} onClose={() => setShowUpdate(false)} />
      )}

      {langOpen && (
        <LangPicker g={g} value={settings.lang}
                    onPick={(code) => { setS({ lang: code }); setLangOpen(false); }}
                    onClose={() => setLangOpen(false)} />
      )}
      {showWelcome && (
        <WelcomeModal
          g={g} busy={geoBusy} message={welcomeMsg} stationCount={stations.length}
          onFindNearest={findNearest}
          onAddStation={() => { setShowWelcome(false); setTestResult(""); setNewCoords(null); setShowAdd(true); }}
          onDismiss={dismissWelcome}
        />
      )}

      {showAdd && (
        <AddStationModal
          g={g} locating={geoBusy} coords={newCoords} testResult={testResult} busy={testBusy}
          cloudBuilt={cloudAvail}
          onLocate={locateForNew} onTest={testStation} onSave={saveStation}
          onClose={() => { setShowAdd(false); setNewCoords(null); setTestResult(""); }}
        />
      )}

      <style>{pageCss}</style>
    </div>
  );
}

// Полноэкранный слой частиц. Включается только в перегрузке — когда ветер
// вышел за предел, на который рассчитан датчик.
//
// Три вещи, ради которых он написан именно так:
//
//   * координаты и задержки считаются один раз и от индекса, а не от
//     Math.random на каждом рендере. Иначе при потоке 20 Гц вся россыпь
//     дёргалась бы заново двадцать раз в секунду вместо того, чтобы лететь;
//   * всё движение — CSS. React тут не участвует вообще: он ставит шестьдесят
//     div'ов один раз, дальше их двигает композитор браузера на видеокарте;
//   * pointer-events: none по всему слою. Иначе частицы перехватывали бы
//     нажатия, и в самый ответственный момент интерфейс перестал бы слушаться.
function StormParticles({ intensity, motion }) {
  const bits = useMemo(() => Array.from({ length: 110 }).map((_, i) => ({
    i,
    top: ((i * 37) % 100),
    // Мелкая пыль, а не хлопья: от полпикселя до двух. Крупные частицы на
    // весь экран выглядели бы снегопадом, а надо ощущение секущей взвеси.
    size: 0.5 + ((i * 13) % 7) / 4.5,
    dur: (2.1 - Math.min(intensity, 1) * 1.2 + ((i * 11) % 9) / 9).toFixed(2),
    delay: (-((i * 17) % 40) / 10).toFixed(2),
    drift: ((i * 23) % 60) - 30,
    // Больше половины — белёсые: цветными остаются только те, что рядом
    // по смыслу с кольцом перегрузки.
    hue: i % 5,
  })), [intensity]);

  if (motion === "off") return null;

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, overflow: "hidden",
      pointerEvents: "none", zIndex: 90,
    }}>
      {bits.map((b) => (
        <span key={b.i} className="storm-bit" style={{
          top: `${b.top}%`,
          width: b.size, height: b.size,
          background: b.hue === 0 ? OVER_A : b.hue === 1 ? OVER_B : "rgba(var(--ink, 231,238,246),0.85)",
          animationDuration: `${b.dur}s`,
          animationDelay: `${b.delay}s`,
          "--drift": `${b.drift}vh`,
        }} />
      ))}
    </div>
  );
}

