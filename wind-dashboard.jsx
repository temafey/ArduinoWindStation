import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  BG, BG_VAR, LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM,
  glow, glowColor, dropGlow, clamp01, polar, wedgePath, FONT_SETS,
} from "./ui-kit.js";
import { KiwiMark } from "./wind-kiwi.jsx";
import { chunk, warmUp } from "./wind-guard.jsx";
import DemoControls from "./wind-demo.jsx";
import { Compass, CameraWindow } from "./wind-instrument.jsx";

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
const Tutor        = chunk(() => import("./wind-tutor.jsx"));
const Permissions  = chunk(() => import("./wind-permissions.jsx"));
const Meteorology  = chunk(() => import("./wind-meteo.jsx"));
import District, { useDistrict, districtToData } from "./wind-district.jsx";
import Customize, { backdropCss, loadBgImage, CORNERS, CustomWidgets } from "./wind-custom.jsx";

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
// Живых данных здесь не может быть в принципе, и это не недоделка, а два
// независимых запрета: браузер блокирует запрос с HTTPS-страницы на http://
// (mixed content), а сама плата сидит в изолированной точке доступа без выхода
// в интернет и снаружи не адресуема. Поэтому публичная копия честно объявляет
// себя демонстрацией, а не молча висит с надписью OFFLINE.
const PUBLIC_COPY = window.location.protocol === "https:";

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

const APP_VERSION = "BETA";

// Индекс станции в подзаголовке шапки. Он локальный: настоящие индексы ИКАО
// выдаёт национальная метеослужба, самодельная станция в этих списках не значится.
// Формат сохранён (4 латинские буквы) просто потому, что так короче имени.
const STATION_ID = "MWPB";

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

function loadStations() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATIONS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
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
  white:    { label: "белый",      color: "#e7eef6" },
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

const DEFAULT_SETTINGS = {
  // — вид —
  unit: "ms",
  digits: null,          // null — сколько принято для выбранной единицы
  font: "grotesk",       // ключ из FONT_SETS
  glow: "normal",        // off | normal | strong
  motion: "full",        // full | calm | off — развёртка, плавность цифр, появление панелей
  speedAccent: "bft",    // bft — цвет по Бофорту, white — монохром
  showCompass: true,
  showGrid: true,        // сетка меридианов и параллелей на карте
  // — техника —
  histMinutes: 2,        // окно графика и конвективного анализа
  pollMs: 1000,          // период опроса /api/data, когда потока нет
  useSse: true,          // держать поток /api/stream
  mapQuality: "normal",  // eco | normal | max — детализация растра отражаемости
  notifySquall: false,   // уведомление при выполнении критерия шквала
  keepAwake: false,      // не давать экрану гаснуть
  alarmMs: 17.2,         // порог тревоги по ветру, м/с
  // — вид, дополнительно —
  accent: "bft",         // ключ из ACCENTS
  ground: "black",       // ключ из GROUNDS
  density: "normal",     // normal | compact — отступы панелей
  borders: true,         // рамки у панелей
  showCamera: true,      // окно камеры на вкладке «Основное»
  // — кастомизация —
  texture: "smooth",     // ключ из TEXTURES — материал подложки
  scene: "none",         // ключ из SCENES, либо custom для своей картинки
  bgTint: 35,            // затемнение фона, %. По умолчанию не ноль: любая
                         // картинка под светящимся текстом требует притушения
  customAccent: "",      // свой цвет; пусто — берётся из ACCENTS
  corners: "sharp",      // sharp | soft | round — скругление панелей
  panelFill: 0,          // заливка панелей, % — плотность фона под текстом
  widgets: [],           // свои виджеты на вкладке «Основное»
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("wind_ui_settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
  "rgba(231,238,246,0.16)", "rgba(231,238,246,0.28)", "rgba(231,238,246,0.42)",
  "rgba(231,238,246,0.60)", "rgba(231,238,246,0.85)",
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

// Непрерывный угол: 355° → 5° должно быть поворотом на +10°, а не отскоком через
// весь круг. Накапливаем развёрнутое значение, а сглаживание уже поверх него.
function useContinuousAngle(deg) {
  const [cont, setCont] = useState(deg ?? 0);
  const prev = useRef(deg ?? 0);
  useEffect(() => {
    if (deg == null) return;
    let d = deg - prev.current;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    prev.current = deg;
    if (d !== 0) setCont((c) => c + d);
  }, [deg]);
  return cont;
}

// ============================================================
// БАЗОВЫЕ КОМПОНЕНТЫ
// ============================================================

function Label({ children, g, size = 9 }) {
  return (
    <div style={{
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
        border: `1px solid ${LINE}`,
        borderRadius: "var(--ui-corner, 0px)",
        // Второй слой — заливка из кастомизации: поверх картинки текст иначе
        // не читается, а без картинки она равна нулю и ничего не меняет.
        background: "linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0.008)), rgba(255,255,255,var(--ui-fill, 0))",
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {title && (
        <header style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
          padding: "9px 13px 8px", borderBottom: `1px solid ${LINE}`,
        }}>
          <Label g={g}>{title}</Label>
          {meta && (
            <span style={{ ...NUM, fontSize: 9, color: FAINT, letterSpacing: 1, whiteSpace: "nowrap" }}>
              {meta}
            </span>
          )}
        </header>
      )}
      <div style={{ padding: title ? "13px" : "13px 14px", ...bodyStyle }}>{children}</div>
    </section>
  );
}

function Stat({ label, value, unit, g, color, action, big }) {
  return (
    <div style={{
      border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.014)",
      padding: "10px 12px 11px", position: "relative", flex: 1, minWidth: 88,
    }}>
      <Label g={g} size={8}>{label}</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 6 }}>
        <span style={{
          ...NUM, color: color || TEXT, fontSize: big ? 26 : 21, fontWeight: 600,
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

function Tab({ id, active, onClick, children, g }) {
  const on = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        position: "relative", background: "transparent", border: "none",
        borderBottom: `2px solid ${on ? TEXT : "transparent"}`,
        color: on ? TEXT : DIM,
        textShadow: on ? glow(g, 0.8) : "none",
        fontFamily: SANS, fontWeight: 600, fontSize: 10.5, letterSpacing: 2.4,
        textTransform: "uppercase", padding: "9px 2px", marginRight: 20,
        cursor: "pointer", transition: "color .22s ease, border-color .22s ease, text-shadow .22s ease",
      }}
    >
      {children}
    </button>
  );
}

// Подвкладка внутри «радара». Отличается от основной сознательно: та отбивается
// линией снизу и капителью, эта — заливкой, иначе два ряда одинаковых вкладок
// читаются как один сломанный.
function SubTab({ id, active, onClick, children, g }) {
  const on = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        background: on ? "rgba(231,238,246,0.08)" : "transparent",
        border: `1px solid ${on ? LINE_HI : "transparent"}`,
        borderBottom: on ? `1px solid ${BG}` : "1px solid transparent",
        marginBottom: -1,
        color: on ? TEXT : DIM,
        textShadow: on ? glow(g, 0.6) : "none",
        fontFamily: SANS, fontWeight: 600, fontSize: 9.5, letterSpacing: 1.8,
        textTransform: "uppercase", padding: "7px 11px",
        cursor: "pointer", transition: "color .2s ease, background .2s ease, border-color .2s ease",
      }}
    >
      {children}
    </button>
  );
}

// Порядок не случаен: сначала то, что меряет сама станция, потом то, что
// приходит извне. Карта и эфир стоят последними, потому что без интернета их
// не будет вовсе.
const SETTINGS_VIEWS = [
  { id: "main",   label: "Основные" },
  { id: "extra",  label: "Дополнительные" },
  { id: "custom", label: "Кастомизация" },
];

const RADAR_VIEWS = [
  { id: "ppi",  label: "Обзор" },
  { id: "conv", label: "Профиль" },
  { id: "rose", label: "Роза" },
  { id: "bft",  label: "Бофорт" },
  { id: "map",  label: "Карта мира" },
  { id: "live", label: "Эфир" },
];

function Choice({ label, value, options, onChange, g, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Label g={g}>{label}</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              style={{
                background: on ? "rgba(231,238,246,0.10)" : "transparent",
                border: `1px solid ${on ? "rgba(231,238,246,0.7)" : LINE}`,
                color: on ? TEXT : DIM,
                textShadow: on ? glow(g, 0.7) : "none",
                fontFamily: SANS, fontSize: 11, padding: "5px 11px",
                cursor: "pointer", transition: "all .18s ease",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && (
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 7, fontFamily: SANS, lineHeight: 1.6 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, g }) {
  return (
    <div
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

function Btn({ children, onClick, primary, disabled, g, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: primary ? "rgba(231,238,246,0.12)" : "transparent",
        border: `1px solid ${primary ? "rgba(231,238,246,0.75)" : LINE}`,
        color: disabled ? DIM : TEXT,
        textShadow: disabled ? "none" : glow(g, primary ? 0.8 : 0.4),
        fontFamily: SANS, fontSize: 11, letterSpacing: 1, fontWeight: 500,
        padding: "9px 14px", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "all .18s ease",
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

function SpeedGauge({ speedMs, gustMs, maxSpeed, unit, digits, accent, g, smooth, alarm = 0, motion }) {
  // Второй круг: от 50 м/с до 100, где 100 — предел настоящего 05103.
  // На этой отметке оба круга оказываются полными разом.
  const over = Math.max(0, speedMs - OVER_FROM);
  const overFrac = clamp01(over / OVER_SPAN);
  const overload = over > 0.05;
  const shown = useSmooth(speedMs, 0.2, smooth);
  const shownGust = useSmooth(gustMs, 0.35, smooth);
  const u = UNITS[unit] ?? UNITS.ms;
  const value = convertSpeed(shown, unit, digits);

  // Полный круг, а не дуга на 270°. Обрезанная дуга требует подписанных концов,
  // подписи требуют насечки, насечка требует делений — и минимализм кончается.
  // У кольца концов нет: ноль и предел в одной точке сверху, и объяснять нечего.
  const R = 76, C = 2 * Math.PI * R;
  const RO = 90, CO = 2 * Math.PI * RO;   // второй круг снаружи первого
  const frac = clamp01(shown / maxSpeed);
  const gustFrac = clamp01(shownGust / maxSpeed);

  // Поле намеренно шире круга: пояса частиц в перегрузке лежат на радиусе
  // до 105, а их свечение уходит ещё дальше. При viewBox 0..200 всё, что
  // выходило за 200, срезалось краем — по бокам это было особенно заметно,
  // потому что там пояс проходит горизонтально и обрезался длинной дугой.
  // Поля прозрачные, поэтому в обычном режиме их не видно.
  return (
    <svg viewBox="-20 -20 240 240" width="100%" style={{ maxWidth: 348, display: "block" }}>
      <defs>
        <linearGradient id="overRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={OVER_A} />
          <stop offset="100%" stopColor={OVER_B} />
        </linearGradient>
      </defs>

      {/* Начало кольца — сверху, поэтому вся группа повёрнута на -90°. */}
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(231,238,246,0.08)" strokeWidth="9" />

        {/* Порыв — призрачное кольцо позади основного */}
        {shownGust > shown + 0.05 && (
          <circle cx="100" cy="100" r={R} fill="none" stroke={TEXT} strokeWidth="9"
                  strokeLinecap="round" opacity="0.15"
                  strokeDasharray={`${C * gustFrac} ${C}`} />
        )}

        <circle cx="100" cy="100" r={R} fill="none" stroke={accent} strokeWidth="9"
                strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`}
                className={alarm >= 2 && motion !== "off" ? "speed-alarm" : undefined}
                style={{ filter: dropGlow(accent, g, alarm >= 2 ? 2.2 : 1.4) }} />

        {/* Второй круг — снаружи первого, чтобы оба читались одновременно.
            Появляется, только когда первый уже заполнен целиком. */}
        {overload && (
          <>
            <circle cx="100" cy="100" r={RO} fill="none" stroke={OVER_A} strokeWidth="6"
                    opacity="0.16" />
            <circle cx="100" cy="100" r={RO} fill="none" stroke="url(#overRingGrad)" strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={`${CO * Math.max(overFrac, 0.008)} ${CO}`}
                    className={motion === "off" ? undefined : "over-pulse"}
                    style={{ filter: dropGlow(OVER_B, g, 2.4) }} />
          </>
        )}
      </g>

      {/* Частицы вокруг второго круга: три кольца на разной скорости, чтобы
          движение читалось как вихрь, а не как вращение одной шестерёнки.
          Все они внутри одной группы с CSS-вращением — ни одного пересчёта
          на кадр, что при потоке 20 Гц принципиально. */}
      {overload && motion !== "off" && [0, 1, 2, 3].map((ring) => {
        // Плотный пояс вплотную к кольцу: четыре слоя по два-три десятка точек
        // на каждом. Оборот за доли секунды — на такой скорости отдельные точки
        // уже не считываются, и пояс воспринимается сплошным вихрем, чего и надо.
        const rr = RO + 4 + ring * 3.5;
        const n = 22 + ring * 6;
        const dur = Math.max(0.22, 0.62 - overFrac * 0.34 + ring * 0.07).toFixed(3);
        const col = ring % 2 ? OVER_A : OVER_B;
        return (
          <g key={ring} className={ring % 2 ? "orbit-ccw" : "orbit-cw"}
             style={{ animationDuration: `${dur}s`,
                      transformBox: "fill-box", transformOrigin: "center" }}>
            {/* Ось вращения берётся из габаритов группы. При нечётном числе
                частиц габариты чуть несимметричны, и центр уезжал бы на доли
                единицы — на скорости в три оборота в секунду это заметное
                дрожание. Невидимая окружность делает габариты строго
                симметричными и прибивает ось к центру шкалы. */}
            <circle cx="100" cy="100" r={rr} fill="none" stroke="none" />
            {Array.from({ length: n }).map((_, i) => {
              const deg = (i * 360) / n - 90;
              const a = deg * (Math.PI / 180);
              // Каждая четвёртая — не точка, а короткий штрих по касательной.
              // Смазанный след читается как скорость сильнее, чем сама скорость.
              if (i % 4 === 0) {
                const span = 5 + ((i * 5) % 6);
                const a2 = (deg + span) * (Math.PI / 180);
                return (
                  <path key={i}
                        d={`M ${(100 + rr * Math.cos(a)).toFixed(1)} ${(100 + rr * Math.sin(a)).toFixed(1)}
                            A ${rr} ${rr} 0 0 1 ${(100 + rr * Math.cos(a2)).toFixed(1)} ${(100 + rr * Math.sin(a2)).toFixed(1)}`}
                        fill="none" stroke={col} strokeWidth={0.8 + ((i * 3) % 4) / 5}
                        strokeLinecap="round" opacity={0.55 + ((i * 3) % 4) / 10}
                        style={{ filter: dropGlow(col, g, 1.1) }} />
                );
              }
              return (
                <circle key={i}
                        cx={100 + rr * Math.cos(a)} cy={100 + rr * Math.sin(a)}
                        r={0.45 + ((i * 7) % 5) / 6}
                        fill={col} opacity={0.5 + ((i * 3) % 5) / 10}
                        style={{ filter: dropGlow(col, g, 0.9) }} />
              );
            })}
          </g>
        );
      })}

      {/* При тревоге пульсирует само число, а не только значок в шапке:
          на шкалу смотрят, в угол — нет. */}
      <text x="100" y="96" textAnchor="middle" fill={accent} fontSize="42" fontWeight="700"
            fontFamily={MONO}
            className={alarm >= 2 && motion !== "off" ? "speed-alarm" : undefined}
            style={{ filter: dropGlow(accent, g, alarm >= 2 ? 2.2 : 1.5), fontVariantNumeric: "tabular-nums" }}>
        {value}
      </text>
      <text x="100" y="116" textAnchor="middle" fill={TEXT} fontSize="10" fontFamily={SANS}
            letterSpacing="3" opacity="0.7">
        {u.short.toUpperCase()}
      </text>

      {/* Подпись появляется только в перегрузке — она объясняет второй круг */}
      {overload && (
        <text x="100" y="132" textAnchor="middle" fill={OVER_B} fontSize="7.5" fontFamily={SANS}
              letterSpacing="2.4" fontWeight="700"
              className={motion === "off" ? undefined : "over-pulse"}
              style={{ filter: dropGlow(OVER_B, g, 1.4) }}>
          {`СВЫШЕ ${convertSpeed(OVER_FROM, unit, 0)} ${u.short.toUpperCase()}`}
        </text>
      )}
    </svg>
  );
}

function Sparkline({ data, g, height = 54, accent }) {
  if (data.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", color: DIM, fontSize: 10, fontFamily: SANS }}>
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
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={h * f} x2={w} y2={h * f} stroke={LINE} strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      ))}
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="rgba(231,238,246,0.06)" />
      <polyline points={points} fill="none" stroke={TEXT} strokeWidth="1.2"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round"
                style={{ filter: dropGlow("rgba(231,238,246,0.8)", g, 0.8) }} />
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
          <stop offset="0%" stopColor="rgba(231,238,246,0.05)" />
          <stop offset="100%" stopColor="rgba(231,238,246,0)" />
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
            style={{ filter: dropGlow("rgba(231,238,246,0.7)", g, 0.6) }}>
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
                background: on ? accent : "rgba(231,238,246,0.10)",
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

      {!GEO_AVAILABLE && (
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 12, lineHeight: 1.6 }}>
          Поиск ближайшей недоступен: браузер отдаёт координаты только защищённым
          страницам, а эта копия открыта по обычному HTTP.
        </div>
      )}

      {message && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginTop: 14,
          fontSize: 11, lineHeight: 1.7, color: "rgba(231,238,246,0.85)",
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

function AddStationModal({ g, onSave, onClose, onLocate, locating, coords, testResult, onTest, busy }) {
  const [name, setName] = useState("Моя станция");
  const [host, setHost] = useState(DEFAULT_HOST);
  const [via, setVia] = useState("ap");

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

      <Choice
        label="Как станция подключена" g={g} value={via}
        options={[
          { value: "ap", label: "своя сеть WiFi" },
          { value: "lan", label: "домашняя сеть" },
        ]}
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
        <Label g={g}>Место установки</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Btn onClick={onLocate} g={g} disabled={locating || !GEO_AVAILABLE}>
            {locating ? "ОПРЕДЕЛЯЮ…" : coords ? "ОБНОВИТЬ КООРДИНАТЫ" : "ПРИВЯЗАТЬ К ТЕКУЩЕМУ МЕСТУ"}
          </Btn>
          <Btn onClick={() => onTest(host.trim())} g={g} disabled={busy || !host.trim()}>
            {busy ? "ПРОВЕРЯЮ…" : "ПРОВЕРИТЬ СВЯЗЬ"}
          </Btn>
        </div>
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
          {coords
            ? `Сохранено: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}. По этим координатам станция будет находиться как ближайшая.`
            : GEO_AVAILABLE
              ? "Без координат станция всё равно работает — её просто не найдёт поиск ближайшей."
              : "Координаты недоступны: браузер отдаёт их только защищённым страницам."}
        </div>
      </div>

      {testResult && (
        <div style={{
          border: `1px solid ${LINE}`, padding: "10px 12px", marginBottom: 16,
          fontSize: 11, lineHeight: 1.7, color: "rgba(231,238,246,0.85)",
        }}>
          {testResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onClose} g={g}>ОТМЕНА</Btn>
        <Btn primary g={g} disabled={!host.trim() || !name.trim()}
             onClick={() => onSave({ name: name.trim(), host: host.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), via })}>
          СОХРАНИТЬ
        </Btn>
      </div>
    </Modal>
  );
}

function LEDPanel({ leds, autoMode, onToggle, onAutoToggle, g, delay }) {
  const items = [
    { key: "green", label: "Батарея" },
    { key: "yellow", label: "Жёлтый" },
    { key: "red", label: "Красный" },
    { key: "wifi", label: "WiFi" },
  ];
  const MODE_TEXT = { off: "OFF", on: "ON", blink: "МИГ" };

  return (
    <Panel title="Светодиоды" g={g} delay={delay}
           meta={
             <button onClick={onAutoToggle} style={{
               background: autoMode ? "rgba(231,238,246,0.10)" : "transparent",
               border: `1px solid ${autoMode ? "rgba(231,238,246,0.7)" : LINE}`,
               color: autoMode ? TEXT : DIM, textShadow: autoMode ? glow(g, 0.7) : "none",
               fontFamily: SANS, fontSize: 9, letterSpacing: 1.5,
               padding: "3px 10px", cursor: "pointer",
             }}>
               {autoMode ? "АВТО" : "РУЧНОЙ"}
             </button>
           }>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
        {items.map(({ key, label }) => {
          const mode = leds[key] ?? "off";
          const isLit = mode === "on" || mode === "blink";
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, flex: 1 }}>
              <button
                onClick={() => !autoMode && onToggle(key)}
                disabled={autoMode}
                style={{
                  width: "100%", maxWidth: 58, aspectRatio: "1",
                  border: `1px solid ${isLit ? TEXT : LINE}`,
                  background: isLit ? "rgba(231,238,246,0.12)" : "transparent",
                  boxShadow: isLit && g !== "off"
                    ? "0 0 14px rgba(231,238,246,0.4), inset 0 0 14px rgba(231,238,246,0.16)"
                    : "none",
                  color: isLit ? TEXT : DIM,
                  textShadow: isLit ? glow(g, 0.7) : "none",
                  cursor: autoMode ? "default" : "pointer",
                  opacity: autoMode ? 0.75 : 1,
                  fontFamily: MONO, fontSize: 9,
                  transition: "all .3s ease",
                  animation: mode === "blink" ? "ledBlink 1s steps(1) infinite" : undefined,
                }}
              >
                {MODE_TEXT[mode] ?? "OFF"}
              </button>
              <span style={{ fontSize: 8, color: DIM, fontFamily: SANS, letterSpacing: 1.2, textTransform: "uppercase" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      {autoMode && (
        <div style={{ color: DIM, fontSize: 10.5, marginTop: 12, fontFamily: SANS, lineHeight: 1.5 }}>
          В авто-режиме цвета задаёт прошивка. Переключи в «ручной», чтобы управлять вручную.
        </div>
      )}
    </Panel>
  );
}

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
  const setTab = (id) => {
    setTabState(id);
    try { localStorage.setItem("wind_ui_tab", id); } catch { /* приватный режим */ }
  };
  // Приборов на «радаре» стало шесть, и вываливать их одной простынёй нельзя:
  // страница перестаёт быть приборной панелью и становится свалкой. Выбор
  // переживает перезагрузку по той же причине, что и основная вкладка.
  const [radarView, setRadarViewState] = useState(() => {
    try { return localStorage.getItem("wind_ui_radar") || "ppi"; } catch { return "ppi"; }
  });
  const setRadarView = (id) => {
    setRadarViewState(id);
    try { localStorage.setItem("wind_ui_radar", id); } catch { /* приватный режим */ }
  };
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

  const [data, setData] = useState({
    speed: 0, direction: null, gust: 0, dirPresent: false, speedMax: 30,
    ledGreen: "off", ledYellow: "off", ledRed: "off", ledWifi: "off", ledAuto: true,
    battery: null, batteryPercent: null, batteryPresent: false, chargeState: "absent",
    powerSource: null, wifiRssi: 0, adcError: false, hostname: "", uptime: 0,
  });
  const [connected, setConnected] = useState(false);
  // История хранится парами: розе ветров и конвективному анализу нужно знать,
  // какому направлению соответствовала какая скорость. Раздельные массивы это
  // соответствие теряли, стоило датчику направления моргнуть.
  const [history, setHistory] = useState([]);
  const [rose, setRose] = useState(() => ({
    sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]), calm: 0, total: 0,
  }));
  // Источник данных: сама станция, модель или район вокруг дома.
  // Раньше это был булев demoMode; третье значение не влезало, а «не демо»
  // перестало означать «плата» — теперь условия спрашивают про station явно.
  const [source, setSource] = useState(PUBLIC_COPY ? "demo" : "station");
  const demoMode = source === "demo";
  const district = useDistrict(source === "district");
  // Картинка живёт отдельно от настроек: она весит сотни килобайт, а настройки
  // читаются и пишутся на каждый чих — держать их в одной записи значило бы
  // гонять этот килобайтный хвост туда-сюда постоянно.
  const [bgImage] = useState(loadBgImage);
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

  const demoRef = useRef({ speed: 5, dir: 180, t: 0, gust: 0, battery: 4.1 });
  // Ручные значения демо-режима. Живут в state, а не в ref: их двигают
  // ползунками, и перерисовка нужна на каждое движение.
  const [demo, setDemo] = useState({
    manual: false, speed: 9, gustExtra: 3, dir: 210,
    tempC: 16, humidity: 62, pressureHpa: 1013, rainMm: 0, battery: 3.9,
  });
  const [sseActive, setSseActive] = useState(false);
  const histRef = useRef(0);

  const g = settings.glow;
  // Системная настройка «меньше движения» перекрывает выбор в дашборде: если
  // человек попросил ОС убрать анимации, спорить с этим нельзя.
  const reduceMotion = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  const motion = reduceMotion ? "off" : settings.motion;
  const smooth = motion !== "off";

  const setS = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
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
  }, [histLen, pushRose]);

  const applyData = useCallback((json) => {
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
    setLastUpdate(new Date());
    if (Number.isFinite(json.gust) && json.gust > gustRef.current + 0.05) {
      gustRef.current = json.gust;
      setGustAt(new Date());
    } else if (json.gust < gustRef.current - 0.05) {
      // Сброс порыва на плате — обнуляем и метку, иначе она врёт про старый пик.
      gustRef.current = json.gust;
      setGustAt(null);
    }
    pushHistory(json.speed, norm.dirPresent ? json.direction : null);
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
        ledGreen: pct > 60 ? "on" : "off",
        ledYellow: d.speed > 5 || (pct >= 30 && pct <= 60) ? "on" : "off",
        ledRed: pct < 10 ? "blink" : d.speed > 15 || (pct >= 10 && pct < 30) ? "on" : "off",
        ledWifi: "on", ledAuto: true,
        battery: parseFloat(d.battery.toFixed(2)), batteryPercent: pct, batteryPresent: true,
        chargeState: pct >= 99 ? "full" : "discharging",
        powerSource: pct >= 99 ? "external" : "battery",
        wifiRssi: -55 + Math.round(Math.sin(d.t * 0.2) * 10),
        adcError: false, hostname: "demo", uptime: Math.floor(d.t * 20),
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
    try {
      const res = await fetch(`http://${esp32Host}/api/data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyData(await res.json());
    } catch {
      setConnected(false);
    }
  }, [demoMode, source, district.weather, esp32Host, applyData, pushHistory, demo]);

  useEffect(() => {
    fetchData();
    // Основной канал — SSE. Опрос остаётся как heartbeat/фолбэк: 1000 ms, not 500 —
    // ESP32 отвечает Connection: close, и каждый опрос держит один из 16 TCP-блоков
    // lwIP все 60 с TIME_WAIT. При живом SSE опрос уходит на раз в 5 с.
    const id = setInterval(fetchData, sseActive && source === "station" ? 5000 : settings.pollMs);
    return () => clearInterval(id);
  }, [fetchData, sseActive, source, settings.pollMs]);

  useEffect(() => {
    // Поток можно выключить: в сетях, которые рвут долгие соединения, опрос
    // надёжнее, хотя и реже. Без этого выключателя дашборд бесконечно
    // переподключался бы каждые 15 секунд и без толку.
    if (source !== "station" || !settings.useSse) return;
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
  }, [source, esp32Host, applyData, settings.useSse]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Где стоит сама станция. Спрашивается один раз: координаты в прошивке
  // константы из secrets.h и в течение сеанса не меняются. Нужны карте — на
  // копии, отданной платой по HTTP, браузер отказывается сообщать место
  // *смотрящего*, так что место *станции* остаётся единственной реальной точкой.
  useEffect(() => {
    if (source !== "station") { setSite(null); return; }
    let alive = true;
    fetch(`http://${esp32Host}/api/site`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setSite(j); })
      .catch(() => { /* старая прошивка без этого эндпоинта — просто нет метки */ });
    return () => { alive = false; };
  }, [source, esp32Host]);

  // Сведения о точке доступа нужны только на вкладке «система» и почти не меняются —
  // тянем их отдельно и редко, чтобы не мешать потоку данных.
  useEffect(() => {
    if (source !== "station" || tab !== "system") return;
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
  }, [source, esp32Host, tab]);

  // Оптимистичный апдейт: сразу меняем локальный state, чтобы кнопка не ждала цикл
  // опроса. Следующий кадр подтвердит или откатит значение с железа.
  const toggleLed = async (key) => {
    const NEXT_MODE = { off: "on", on: "blink", blink: "off" };
    const k = `led${key.charAt(0).toUpperCase() + key.slice(1)}`;
    const nextValue = NEXT_MODE[data[k]] ?? "on";
    setData((prev) => ({ ...prev, [k]: nextValue }));
    if (source !== "station") return;
    // Связь рвётся; следующий кадр опроса всё равно вернёт настоящее
    // состояние, поэтому потерянный запрос молча забываем.
    try { await fetch(`http://${esp32Host}/api/led?${key}=${nextValue}`); } catch {}
  };

  const toggleAuto = async () => {
    const nextValue = !data.ledAuto;
    setData((prev) => ({ ...prev, ledAuto: nextValue }));
    if (source !== "station") return;
    try { await fetch(`http://${esp32Host}/api/led?auto=${nextValue}`); } catch {}
  };


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
  useEffect(() => warmUp([Meteorology, WorldMap, Tutor, LiveWatch, Permissions]), []);

  // ---------- станции ----------
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem(WELCOMED_KEY, "1"); } catch { /* приватный режим */ }
  };

  const selectStation = (st) => {
    setEsp32Host(st.host);
    try { localStorage.setItem("esp32_host", st.host); } catch { /* приватный режим */ }
    if (!PUBLIC_COPY) setSource("station");
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
      if (PUBLIC_COPY) {
        setWelcomeMsg({
          text: `Ближайшая — «${nearest.s.name}», ${formatDistance(nearest.km)}. Показания с этой страницы не подтянуть: она отдаётся по HTTPS, а станция отвечает по HTTP, и такой запрос браузер блокирует. Откройте её напрямую:`,
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

  const testStation = async (host) => {
    setTestResult("");
    if (PUBLIC_COPY) {
      setTestResult(
        `Отсюда проверить нельзя: страница открыта по HTTPS, а станция отвечает по HTTP — такой запрос браузер блокирует. ` +
        `Сохраните станцию и откройте её напрямую по адресу http://${host}/`
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

  const saveStation = ({ name, host, via }) => {
    const st = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name, host, via,
      lat: newCoords ? newCoords.lat : null,
      lon: newCoords ? newCoords.lon : null,
    };
    // Один адрес — одна запись: повторное добавление того же хоста обновляет её,
    // а не плодит дубликаты, между которыми потом не отличить нужную.
    const next = [...stations.filter((s) => s.host !== host), st];
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

  const resetGust = async () => {
    if (demoMode) {
      demoRef.current.gust = demoRef.current.speed;
      setData((prev) => ({ ...prev, gust: parseFloat(demoRef.current.speed.toFixed(2)) }));
      return;
    }
    // Порыв района считает модель — сбрасывать его нечему и незачем:
    // следующий же кадр вернул бы прежнее число.
    if (source === "district") return;
    await fetch(`http://${esp32Host}/api/gust`);
  };

  // ---------- производные ----------
  const bf = beaufort(data.speed);
  // «По Бофорту» — цвет зависит от силы ветра, остальные варианты постоянные.
  // monoAccent (монохромная роза ветров) включается на всём, что не Бофорт:
  // раскрашивать розу шестью оттенками поверх одноцветного интерфейса глупо.
  const accentPick = ACCENTS[settings.accent] || ACCENTS.bft;
  const monoAccent = settings.accent !== "bft";
  const accent = settings.customAccent || accentPick.color || bf.color;
  const backdrop = backdropCss(settings, bgImage);
  const hasDir = data.dirPresent && data.direction != null;
  const hasBattery = data.batteryPresent && data.battery != null;
  const unit = UNITS[settings.unit] ?? UNITS.ms;
  const uptimeMin = Math.floor(data.uptime / 60);
  const uptimeH = Math.floor(uptimeMin / 60);
  const rssi = rssiQuality(data.wifiRssi);
  const CHARGE_VIEW = { charging: "заряжается", full: "заряжена", discharging: "разряд" };
  const POWER_VIEW = { external: "от сети", battery: "от батареи" };
  const ageSec = lastUpdate ? Math.round((time - lastUpdate) / 1000) : null;
  const lastUpdateStr = ageSec == null ? "—" : `${ageSec}с`;

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
  // Непрерывный угол для стрелки и для модели анемометра. Считается здесь,
  // а не внутри компаса: тот же угол нужен второму прибору, а два независимых
  // накопителя разошлись бы на переходе через север.
  const dirCont = useContinuousAngle(hasDir ? data.direction : null);
  const dirAngle = useSmooth(dirCont, 0.3, smooth);

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
    if (!rising || !settings.notifySquall) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification("Шквал", {
        body: `Рост ${analysis.rise.toFixed(1)} м/с, пик ${analysis.peak.toFixed(1)} м/с — критерий ВМО выполнен.`,
        tag: "windprobe-squall",
      });
    } catch { /* часть браузеров требует сервис-воркер — тогда просто тихо */ }
  }, [analysis, settings.notifySquall]);

  const TABS = [
    { id: "wind", label: "Основное" },
    { id: "meteo", label: "Метеорология" },
    { id: "radar", label: "Радар" },
    { id: "system", label: "Система" },
    { id: "settings", label: "Настройки" },
  ];

  const utc = `${String(time.getUTCHours()).padStart(2, "0")}:${String(time.getUTCMinutes()).padStart(2, "0")}:${String(time.getUTCSeconds()).padStart(2, "0")}`;

  return (
    <div
      className={`app mo-${motion} dens-${settings.density}${settings.borders ? "" : " noborders"}`}
      style={{
        minHeight: "100vh", background: BG, color: TEXT, fontFamily: SANS,
        padding: "0 0 40px", boxSizing: "border-box",
      }}
    >
      {/* ============ ШАПКА-БЛАНК ============ */}
      <header style={{ borderBottom: `1px solid ${LINE}`, padding: "16px 22px 0" }}>
        <div style={{
          maxWidth: 1080, margin: "0 auto",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap",
        }}>
          {/* Левый угол — знак, под ним подсказчик. Он именно отдельный блок,
              а не реплика киви: логотип ничего не говорит, он логотип. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, flex: "1 1 320px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {/* Знак станции — киви вполоборота, как на эмодзи: половинка,
                  срезанная под углом. Единственное цветное пятно в интерфейсе,
                  и это осознанно — одноцветный силуэт киви от любого другого
                  фрукта в разрезе не отличить. */}
              <KiwiMark size={40} g={g} />
              <div>
                <h1 style={{
                  // Разрядка меньше прежней: она ставилась под сплошные
                  // прописные, а в смешанном начертании растаскивает слово.
                  margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 1.6,
                  fontFamily: SANS, color: TEXT, textShadow: glow(g, 1),
                }}>
                  Weathered_Kiwi
                </h1>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1.8, marginTop: 4, textTransform: "uppercase" }}>
                  Автоматическая ветроизмерительная станция · {STATION_ID} · {APP_VERSION}
                </div>
              </div>
            </div>

            <Tutor g={g} motion={motion} accent={accent} />
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ ...NUM, fontSize: 20, fontWeight: 600, letterSpacing: 1, textShadow: glow(g, 0.8) }}>
              {time.toLocaleTimeString("uk-UA")}
            </div>
            {/* Дата и UTC — чтобы засечённый порыв можно было к чему-то привязать:
                одно «14:28:51» через сутки уже ничего не значит. */}
            <div style={{ ...NUM, fontSize: 9.5, color: DIM, letterSpacing: 1, marginTop: 3 }}>
              {time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
              {" · "}
              {time.toLocaleDateString("ru-RU", { weekday: "short" })}
            </div>
            <div style={{ ...NUM, fontSize: 9, color: FAINT, letterSpacing: 1.5, marginTop: 2 }}>
              {utc} UTC
            </div>

            {/* Тревога — прямо под часами, как просили. Появляется только когда
                есть о чём тревожить: постоянно висящая плашка перестаёт
                читаться на второй день. */}
            {alarm && (
              <div className={`alarm ${alarmLevel > 1 && motion !== "off" ? "alarm-hot" : ""}`}
                   style={{
                     marginTop: 8, display: "inline-flex", alignItems: "center", gap: 7,
                     border: `1px solid ${alarm.color}`, borderLeft: `3px solid ${alarm.color}`,
                     padding: "5px 9px", textAlign: "left",
                   }}>
                <svg width="12" height="12" viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}
                     className={alarmLevel > 1 && motion !== "off" ? "warn-blink" : undefined}>
                  <path d="M12 2 L23 21 H1 Z" fill="none" stroke={alarm.color} strokeWidth="2.4" strokeLinejoin="round" />
                  <path d="M12 9 V15" stroke={alarm.color} strokeWidth="2.6" strokeLinecap="round" />
                  <circle cx="12" cy="18.4" r="1.4" fill={alarm.color} />
                </svg>
                <span style={{
                  fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  color: alarm.color, textShadow: glowColor(alarm.color, g, 0.7),
                }}>
                  {alarm.name}
                </span>
                <span style={{ ...NUM, fontSize: 10, color: TEXT }}>
                  {convertSpeed(Math.max(data.speed, data.gust), settings.unit, settings.digits)} {unit.short}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Строка состояния: канал, свежесть кадра, питание, сигнал */}
        <div style={{
          maxWidth: 1080, margin: "12px auto 0",
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0,
          borderTop: `1px solid ${LINE}`, fontSize: 9.5, letterSpacing: 1.4,
        }}>
          <StatusCell g={g} first>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", display: "inline-block", marginRight: 7,
              background: connected ? (source === "station" ? accent : DIM) : "rgba(231,238,246,0.3)",
              boxShadow: connected && g !== "off" ? `0 0 8px ${source === "station" ? accent : DIM}` : "none",
              animation: connected ? undefined : "pulse 1.4s infinite",
              verticalAlign: "middle",
            }} />
            {!connected ? "НЕТ СВЯЗИ"
              : demoMode ? "ДЕМО"
              : source === "district" ? "РАЙОН"
              : sseActive ? "ПОТОК SSE" : "ОПРОС HTTP"}
          </StatusCell>
          <StatusCell g={g}>
            ИСТОЧНИК · {demoMode ? "МОДЕЛЬ" : source === "district" ? "OPEN-METEO" : esp32Host}
          </StatusCell>
          <StatusCell g={g}>КАДР · {lastUpdateStr}</StatusCell>
          <StatusCell g={g}>
            ПИТАНИЕ · {hasBattery ? `${data.batteryPercent}%` : data.powerSource === "external" ? "СЕТЬ" : "—"}
          </StatusCell>
          <StatusCell g={g}>СИГНАЛ · {data.wifiRssi ? `${data.wifiRssi} dBm` : "—"}</StatusCell>
          {analysis && (
            <StatusCell g={g} color={analysis.level > 1 ? lvl.color : undefined}>
              РЕЖИМ · {lvl.name}
            </StatusCell>
          )}
        </div>

        {/* Вкладки */}
        <nav style={{ maxWidth: 1080, margin: "0 auto", borderTop: `1px solid ${LINE}` }}>
          {TABS.map((t) => (
            <Tab key={t.id} id={t.id} active={tab} onClick={setTab} g={g}>{t.label}</Tab>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 22px 0" }}>
        {/* Публичная копия — сразу сказать, что это витрина, а не живая станция */}
        {PUBLIC_COPY && (
          <div className="pnl" style={{
            border: `1px solid ${LINE}`, borderLeft: `2px solid ${accent}`, padding: "11px 14px",
            marginBottom: 20, fontSize: 11, lineHeight: 1.7, color: "rgba(231,238,246,0.78)",
          }}>
            <span style={{ color: TEXT, letterSpacing: 2, fontWeight: 600, textShadow: glow(g, 0.6) }}>ДЕМОНСТРАЦИЯ</span>
            {" — это публичная копия интерфейса, живого ветра здесь нет. "}
            Настоящая станция работает автономно и раздаёт свою сеть{" "}
            <b style={{ color: TEXT }}>WindStation</b>; дашборд с реальными показаниями открывается
            по <b style={{ color: TEXT }}>http://MyWindProbeBETA.org</b> с устройства,
            подключённого к ней. Все настройки ниже — рабочие, их можно потрогать.
          </div>
        )}

        {/* ---------------- ВЕТЕР ---------------- */}
        {tab === "wind" && (
          <div key="wind" className="wind-grid tabfade" style={{
            display: "grid",
            gridTemplateColumns: (hasDir && settings.showCompass) || demoMode || source === "district" ? "1fr 1fr" : "1fr",
            gap: 18, alignItems: "start",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Предел шкалы пересчитывается тем же путём, что и само значение:
                  умножать на factor вручную нельзя — у Бофорта его нет. */}
              <Panel g={g} delay={0} title="Скорость ветра"
                     meta={`ПРЕДЕЛ ${convertSpeed(data.speedMax ?? 30, settings.unit, 0)} ${unit.short}`}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <SpeedGauge
                    speedMs={data.speed} gustMs={data.gust} maxSpeed={data.speedMax ?? 30}
                    unit={settings.unit} digits={settings.digits} accent={accent} g={g} smooth={smooth}
                    alarm={alarmLevel} motion={motion}
                  />
                </div>
                <div style={{
                  textAlign: "center", marginTop: 4, fontSize: 11, letterSpacing: 2.5,
                  fontWeight: 600, color: TEXT, textShadow: glow(g, 0.6),
                }}>
                  {bf.desc.toUpperCase()} · {bf.scale} БАЛЛОВ
                </div>
              </Panel>

              <div style={{ display: "flex", gap: 10 }}>
                <Stat
                  label={gustAt ? `Порыв · ${gustAt.toLocaleTimeString("uk-UA")}` : "Порыв"}
                  value={gustText} unit={unit.short} g={g}
                  action={
                    <button onClick={resetGust} title="Сбросить порыв" style={{
                      position: "absolute", top: 7, right: 7, background: "transparent",
                      border: `1px solid ${LINE}`, color: DIM, padding: "1px 6px",
                      fontSize: 10, cursor: "pointer", fontFamily: MONO,
                    }}>↺</button>
                  }
                />
                <Stat label={`Средняя · ${settings.histMinutes} мин`} value={meanText} unit={unit.short} g={g} />
                <Stat label="Аптайм" value={uptimeH > 0 ? `${uptimeH}ч${uptimeMin % 60}м` : `${uptimeMin}м`} g={g} />
              </div>

              {/* Атмосфера. Панели нет вовсе, пока станция не прислала ни одного
                  такого датчика: пустая рамка с прочерками выглядит поломкой. */}
              {(sensors.length > 0 || dew != null || chill != null) && (
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
                  </div>
                  <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 10 }}>
                    {demoMode
                      ? "Это демо-режим: атмосферных датчиков на станции нет, и все значения здесь смоделированы. Связаны они не случайно — влажность выведена из температуры при почти постоянной точке росы, а давление проседает на усилении ветра, как оно и бывает."
                      : source === "district"
                      ? "Это режим «район»: значения не с мачты, а из модели Open-Meteo для точки, которую ты указал. Давления, осадков и освещённости на плате нет вовсе — здесь они настоящие и потому появились."
                      : "Показания приходят с датчиков станции; карточка появляется только для тех, чьё присутствие подтвердила прошивка."}
                    {" "}
                    Точка росы и «ощущается как» не измеряются — они считаются: первая по формуле
                    Магнуса из температуры и влажности, вторая по формуле службы погоды США и только
                    в холод при ощутимом ветре. Вне этих условий величина не определена, и её тут нет.
                  </div>
                </Panel>
              )}

              <Panel title={`Скорость · ${settings.histMinutes} мин`} g={g} delay={80}
                     meta={`МИН ${lullText} · МАКС ${peakText} ${unit.short}`}>
                <Sparkline data={speedSeries} g={g} accent={accent} />
              </Panel>

              {settings.showCamera && (
                <Panel title="Камера" g={g} delay={95}
                       meta={data.cameraPresent && data.cameraUrl ? "ПОТОК" : "НЕ ПОДКЛЮЧЕНА"}>
                  <CameraWindow url={data.cameraPresent ? data.cameraUrl : null}
                                accent={accent} g={g} motion={motion} speedMs={data.speed}
                                site={site} now={time} />
                  <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 8 }}>
                    {data.cameraPresent && data.cameraUrl
                      ? "Поток с камеры станции."
                      : "Камеры на станции нет — здесь рисунок, а не съёмка. Подойдёт ESP32-CAM: она отдаёт MJPEG по HTTP, и браузер играет его сам. Экшн-камеры так не подключить: они отдают RTSP или RTMP, чего не умеет ни один браузер, а перепаковывать поток ESP32 нечем."}
                  </div>
                </Panel>
              )}

              {/* Свои виджеты — последними в колонке: они дополняют показания
                  станции, а не соперничают с ними за первый экран. */}
              <CustomWidgets widgets={settings.widgets} g={g} accent={accent} Panel={Panel} />

            </div>

            {(hasDir && settings.showCompass) || demoMode || source === "district" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {hasDir && settings.showCompass && (
                  <Panel title="Направление" meta={degToDir(data.direction).full.toUpperCase()} g={g} delay={40}>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <Compass direction={data.direction} angle={dirAngle} accent={accent} g={g} />
                    </div>
                  </Panel>
                )}

                {hasDir && settings.showCompass && (
                  <Panel title={`Направление · ${settings.histMinutes} мин`} g={g} delay={120}
                         meta={analysis ? `РАЗБРОС ${Math.round(analysis.spread)}°` : undefined}>
                    <Sparkline data={dirSeries} g={g} accent={accent} />
                  </Panel>
                )}

                {/* Только в демо: на живой станции ползунок «скорость ветра» — это
                    не отладка, а подделка показаний. */}
                {demoMode && (
                  <Panel title="Ручное управление" g={g} delay={140} meta="ТОЛЬКО ДЕМО">
                    <DemoControls demo={demo} setDemo={setDemo} g={g} accent={accent} alarmLevel={alarmLevel} />
                  </Panel>
                )}

                {/* Район: то, чего мачта не меряет — давление, осадки, воздух.
                    Ветер и температура уже ушли в общий дашборд выше, здесь
                    остаётся остальное и происхождение каждой цифры. */}
                {source === "district" && (
                  <Panel title="Район" g={g} delay={140} meta="ИЗ ИНТЕРНЕТА">
                    <District g={g} accent={accent} {...district} />
                  </Panel>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ---------------- МЕТЕОРОЛОГИЯ ---------------- */}
        {tab === "meteo" && (
          <div key="meteo" className="tabfade">
            <Meteorology g={g} accent={accent} motion={motion} />
          </div>
        )}

        {/* ---------------- РАДАР ---------------- */}
        {tab === "radar" && (
          <div key="radar" className="tabfade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Приборов стало шесть, и показывать их одной простынёй нельзя:
                приборная панель превращается в свалку. Каждый прибор — свой экран. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, borderBottom: `1px solid ${LINE}` }}>
              {RADAR_VIEWS.map((v) => (
                <SubTab key={v.id} id={v.id} active={radarView} onClick={setRadarView} g={g}>
                  {v.label}
                </SubTab>
              ))}
            </div>

            {radarView === "ppi" && (
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
              <Panel title="Конвективный профиль" g={g} delay={0}
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
                <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 10 }}>
                  Всё считается по показаниям анемометра. Шквал определяется по критерию ВМО
                  (рост ≥ 8 м/с, пик ≥ 11 м/с). Вращение — это признак завихрения в точке
                  измерения, а не обнаружение смерча: смерч видит доплеровский локатор, одна
                  мачта на такое неспособна. Гроза, град и осадки станции недоступны — датчиков нет.
                </div>
              </Panel>
            )}

            {radarView === "rose" && (
              <Panel title="Роза ветров" g={g} delay={0}
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

            {radarView === "bft" && (
              <Panel title="Состояние по шкале Бофорта" g={g} delay={0} meta="ПРИЗНАКИ ВМО">
                <BeaufortStrip speed={data.speed} g={g} accent={accent} motion={motion} />
                <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.6, marginTop: 12 }}>
                  Единственный прибор здесь, который проверяется глазами: если вокруг ломает ветки,
                  а шкала показывает «лёгкий», врёт анемометр, а не погода.
                </div>
              </Panel>
            )}

            {radarView === "map" && (
              <Panel title="Карта мира" g={g} delay={0}
                     meta={ONLINE ? "ЖИВЫЕ СЛОИ · NWS / NOAA" : "БЕЗ СЕТИ · ТОЛЬКО АРХИВ"}>
                <WorldMap g={g} motion={motion} online={ONLINE} site={site}
                          showGrid={settings.showGrid} quality={settings.mapQuality} />
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
        {tab === "system" && (
          <div key="system" className="tabfade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="stat-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <Stat
                label={hasBattery ? `Батарея${data.powerSource ? " · " + POWER_VIEW[data.powerSource] : ""}` : "Батарея · нет"}
                value={hasBattery ? data.battery.toFixed(2) : "—"} unit={hasBattery ? "V" : ""} g={g}
              />
              <Stat
                label={hasBattery && CHARGE_VIEW[data.chargeState] ? `Заряд · ${CHARGE_VIEW[data.chargeState]}` : "Заряд"}
                value={hasBattery ? data.batteryPercent : "—"} unit={hasBattery ? "%" : ""} g={g}
              />
              <Stat label={`Сигнал · ${rssi.label}`} value={data.wifiRssi || "—"} unit={data.wifiRssi ? "dBm" : ""} g={g} />
              <Stat
                label={data.adcError ? "ADC · ОШИБКА" : "Обновлено"}
                value={data.adcError ? "ERR" : lastUpdateStr} g={g}
              />
            </div>

            <LEDPanel
              leds={{ green: data.ledGreen, yellow: data.ledYellow, red: data.ledRed, wifi: data.ledWifi }}
              autoMode={data.ledAuto} onToggle={toggleLed} onAutoToggle={toggleAuto} g={g} delay={60}
            />

            <Panel title="Точка доступа" g={g} delay={120}
                   meta={source !== "station" ? "НЕДОСТУПНО" : ap ? "ОТВЕТ ПОЛУЧЕН" : "НЕТ ОТВЕТА"}>
              {source !== "station" ? (
                <div style={{ color: DIM, fontSize: 11 }}>
                  {demoMode ? "Недоступно в демо-режиме." : "Недоступно в режиме «район»: сеть есть у платы, а плата сейчас не опрашивается."}
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
                      <div style={{ marginTop: 7 }}>
                        <Row k="Подключена" v={ap.uplinkConnected ? "да" : "нет"} g={g} mono={false} />
                        <Row k="Сеть" v={ap.uplinkSsid || "—"} g={g} />
                        <Row k="IP в ней" v={ap.uplinkIp || "—"} g={g} />
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
              <div style={{ color: FAINT, fontSize: 10, marginTop: 12, lineHeight: 1.6 }}>
                Своя точка поднята всегда — по ней плату видно, даже когда домашней сети нет
                и заливать больше некуда. Подключение к домашней сети идёт фоном и на раздачу
                своей не влияет: обе работают одновременно.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- НАСТРОЙКИ ---------------- */}
        {tab === "settings" && (
          <div key="settings" className="tabfade" style={{ maxWidth: 620 }}>
            {/* Настроек стало столько, что одной простынёй они не читаются.
                Деление не по алфавиту, а по вопросу «это про то, как выглядит,
                или про то, как работает». */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, borderBottom: `1px solid ${LINE}`, marginBottom: 20 }}>
              {SETTINGS_VIEWS.map((v) => (
                <SubTab key={v.id} id={v.id} active={setView} onClick={setSetView} g={g}>
                  {v.label}
                </SubTab>
              ))}
            </div>

            {setView === "main" && (
              <div key="s-main" className="tabfade">
                <div style={{ marginBottom: 22 }}>
                  <Label g={g}>Станции</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
                    {stations.length === 0 && (
                      <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.6 }}>
                        Пока ни одной. Список хранится только в этом браузере и никуда не отправляется —
                        общего каталога станций не существует.
                      </div>
                    )}
                    {stations.map((st) => {
                      const active = st.host === esp32Host;
                      return (
                        <div key={st.id} className="rowin" style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                          border: `1px solid ${active ? LINE_HI : LINE}`,
                          borderLeft: active ? `2px solid ${accent}` : `1px solid ${LINE}`,
                          padding: "8px 10px",
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, textShadow: active ? glow(g, 0.6) : "none" }}>{st.name}</div>
                            <div style={{ ...NUM, color: DIM, fontSize: 10, wordBreak: "break-all" }}>
                              {st.host} · {st.lat != null ? "с координатами" : "без координат"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {!active && <Btn g={g} onClick={() => selectStation(st)} style={{ padding: "4px 9px" }}>выбрать</Btn>}
                            <Btn g={g} onClick={() => removeStation(st.id)} style={{ padding: "4px 9px" }}>✕</Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Btn g={g} onClick={() => { setTestResult(""); setNewCoords(null); setShowAdd(true); }}>
                      + ПОДКЛЮЧИТЬ СТАНЦИЮ
                    </Btn>
                    <Btn g={g} disabled={!GEO_AVAILABLE} onClick={() => { setWelcomeMsg(null); setShowWelcome(true); }}>
                      НАЙТИ БЛИЖАЙШУЮ
                    </Btn>
                  </div>
                  {!GEO_AVAILABLE && (
                    <div style={{ color: DIM, fontSize: 10.5, marginTop: 8, lineHeight: 1.6 }}>
                      Поиск ближайшей недоступен: координаты браузер отдаёт только защищённым страницам,
                      а эта копия открыта по HTTP. Своё место при этом можно поставить вручную —
                      на карте мира есть кнопка.
                    </div>
                  )}
                </div>

                <Choice
                  label="Единицы скорости" g={g} value={settings.unit}
                  options={UNIT_KEYS.map((k) => ({ value: k, label: UNITS[k].label }))}
                  onChange={(v) => setS({ unit: v, digits: null })}
                  hint="Прошивка всегда меряет в м/с — пересчёт делает дашборд, плату перезаливать не нужно."
                />
                <Choice
                  label="Знаков после запятой" g={g} value={settings.digits}
                  options={[
                    { value: null, label: "авто" }, { value: 0, label: "0" },
                    { value: 1, label: "1" }, { value: 2, label: "2" },
                  ]}
                  onChange={(v) => setS({ digits: v })}
                  hint="«Авто» — сколько принято для выбранной единицы. У Бофорта всегда целое."
                />
                <Choice
                  label="Гарнитура" g={g} value={settings.font}
                  options={Object.keys(FONT_SETS).map((k) => ({ value: k, label: FONT_SETS[k].label }))}
                  onChange={(v) => setS({ font: v })}
                  hint="Числа остаются моноширинными в любом наборе: на приборной панели разряды обязаны стоять в колонку. Ничего не скачивается — только то, что уже есть в системе, иначе на станции без интернета шрифт бы просто не появился."
                />
                <Choice
                  label="Акцент" g={g} value={settings.accent}
                  options={Object.keys(ACCENTS).map((k) => ({ value: k, label: ACCENTS[k].label }))}
                  onChange={(v) => setS({ accent: v })}
                  hint="Единственный цветной элемент интерфейса. «По Бофорту» меняет цвет вместе с силой ветра, остальные постоянные и делают дашборд одноцветным — включая розу ветров. «Янтарь» и «фосфор» — цвета люминофора старых монохромных мониторов."
                />
                <Choice
                  label="Подложка" g={g} value={settings.ground}
                  options={Object.keys(GROUNDS).map((k) => ({ value: k, label: GROUNDS[k].label }))}
                  onChange={(v) => setS({ ground: v })}
                  hint="Светлого варианта нет намеренно: светящийся текст по белому фону не работает, а свечение здесь несущая часть оформления."
                />
                <Choice
                  label="Плотность" g={g} value={settings.density}
                  options={[{ value: "normal", label: "обычная" }, { value: "compact", label: "плотная" }]}
                  onChange={(v) => setS({ density: v })}
                  hint="Плотная убирает воздух внутри панелей — на телефоне влезает заметно больше."
                />
                <Choice
                  label="Рамки панелей" g={g} value={settings.borders}
                  options={[{ value: true, label: "есть" }, { value: false, label: "нет" }]}
                  onChange={(v) => setS({ borders: v })}
                  hint="Без рамок блоки разделяются только воздухом. Чище, но на широком экране труднее понять, где кончается один прибор и начинается другой."
                />
                <Choice
                  label="Окно камеры" g={g} value={settings.showCamera}
                  options={[{ value: true, label: "показывать" }, { value: false, label: "скрыть" }]}
                  onChange={(v) => setS({ showCamera: v })}
                />
                <Choice
                  label="Свечение" g={g} value={settings.glow}
                  options={[
                    { value: "off", label: "выкл" }, { value: "normal", label: "обычное" },
                    { value: "strong", label: "сильное" },
                  ]}
                  onChange={(v) => setS({ glow: v })}
                />
                <Choice
                  label="Анимация" g={g} value={settings.motion}
                  options={[
                    { value: "full", label: "полная" }, { value: "calm", label: "сдержанная" },
                    { value: "off", label: "выкл" },
                  ]}
                  onChange={(v) => setS({ motion: v })}
                  hint="Плавность стрелки и цифр, вращение развёртки, переходы между вкладками. Системная настройка «уменьшить движение» перекрывает этот выбор и всё отключает."
                />
                <Choice
                  label="Компас" g={g} value={settings.showCompass}
                  options={[{ value: true, label: "показывать" }, { value: false, label: "скрыть" }]}
                  onChange={(v) => setS({ showCompass: v })}
                  hint={hasDir ? "Датчик направления подключён." : "Датчик направления не подключён — компас скрыт в любом случае."}
                />
                <Choice
                  label="Источник данных" g={g} value={source}
                  options={[
                    { value: "station", label: "станция" },
                    { value: "district", label: "район" },
                    { value: "demo", label: "демо" },
                  ]}
                  onChange={(v) => setSource(v)}
                  hint={PUBLIC_COPY
                    ? "На публичной копии «станция» всегда даст OFFLINE: с HTTPS-страницы браузер не пустит запрос на http:// к плате, и снаружи она всё равно не адресуема. «Район» работает везде, где есть интернет."
                    : "«Район» — погода вокруг дома из интернета: она знает давление, осадки и воздух, которых на плате нет. «Демо» рисует правдоподобный ветер без железа."}
                />
              </div>
            )}

            {setView === "custom" && (
              <div key="s-custom" className="tabfade">
                <Customize settings={settings} setS={setS} g={g} accent={accent} />
              </div>
            )}

            {setView === "extra" && (
              <div key="s-extra" className="tabfade">
                <Permissions g={g} />

                <Choice
                  label="Окно графика и анализа" g={g} value={settings.histMinutes}
                  options={[
                    { value: 1, label: "1 мин" }, { value: 2, label: "2 мин" },
                    { value: 5, label: "5 мин" }, { value: 10, label: "10 мин" },
                  ]}
                  onChange={(v) => setS({ histMinutes: v })}
                  hint="Задаёт и графики, и окно конвективного анализа. Буфер истории всегда держит 10 минут независимо от этого выбора — иначе шквал было бы не на чем считать."
                />
                <Choice
                  label="Сетка на карте" g={g} value={settings.showGrid}
                  options={[{ value: true, label: "показывать" }, { value: false, label: "скрыть" }]}
                  onChange={(v) => setS({ showGrid: v })}
                  hint="Меридианы и параллели через 30°. Без них карта чище, с ними видно, где широта."
                />
                <Choice
                  label="Поток данных" g={g} value={settings.useSse}
                  options={[{ value: true, label: "SSE" }, { value: false, label: "только опрос" }]}
                  onChange={(v) => setS({ useSse: v })}
                  hint="Поток /api/stream даёт 20 кадров в секунду одним соединением. «Только опрос» полезен, если сеть рвёт длинные соединения: данные идут реже, но надёжнее."
                />
                <Choice
                  label="Период опроса" g={g} value={settings.pollMs}
                  options={[
                    { value: 1000, label: "1 с" }, { value: 2000, label: "2 с" }, { value: 5000, label: "5 с" },
                  ]}
                  onChange={(v) => setS({ pollMs: v })}
                  hint="Как часто дашборд спрашивает /api/data, когда потока нет. Чаще раза в секунду нельзя: сервер на плате закрывает соединение после каждого ответа, а lwIP держит его в TIME_WAIT ещё минуту, и свободные слоты кончаются."
                />
                <Choice
                  label="Детализация растра" g={g} value={settings.mapQuality}
                  options={[
                    { value: "eco", label: "эконом" }, { value: "normal", label: "обычная" },
                    { value: "max", label: "максимум" },
                  ]}
                  onChange={(v) => setS({ mapQuality: v })}
                  hint="Размер картинки отражаемости, которую отдаёт NOAA. «Эконом» заметно быстрее на мобильной сети, «максимум» имеет смысл только при сильном приближении."
                />
                <Choice
                  label="Оповещать о шквале" g={g} value={settings.notifySquall}
                  options={[{ value: false, label: "нет" }, { value: true, label: "да" }]}
                  onChange={(v) => setS({ notifySquall: v })}
                  hint="Уведомление, когда рост скорости отвечает критерию ВМО — 8 м/с при пике от 11 м/с. Нужно разрешение выше; по обычному HTTP браузер уведомления не даёт."
                />
                <Choice
                  label="Порог тревоги по ветру" g={g} value={settings.alarmMs}
                  options={[
                    { value: 13.9, label: "13.9 · 7 баллов" },
                    { value: 17.2, label: "17.2 · 8 баллов" },
                    { value: 20.8, label: "20.8 · 9 баллов" },
                    { value: 24.5, label: "24.5 · 10 баллов" },
                  ]}
                  onChange={(v) => setS({ alarmMs: v })}
                  hint="При каком ветре под часами загорается «ОПАСНО». По умолчанию 17.2 м/с — начало 8 баллов по Бофорту, международная граница штормового предупреждения; примерно там же лежит High Wind Warning службы погоды США. Уровень «внимание» всегда на 13.9 м/с. Считается по большему из скорости и порыва: ломает вещи порыв, а не среднее."
                />
                <Choice
                  label="Не гасить экран" g={g} value={settings.keepAwake}
                  options={[{ value: false, label: "нет" }, { value: true, label: "да" }]}
                  onChange={(v) => setS({ keepAwake: v })}
                  hint="Держит экран включённым, пока дашборд открыт — для планшета на стене. Тоже требует защищённого соединения, и на самой станции работать не будет."
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <Btn g={g} onClick={() => {
                    setSettings({ ...DEFAULT_SETTINGS });
                    try { localStorage.removeItem("wind_ui_settings"); } catch { /* приватный режим */ }
                  }}>
                    Сбросить настройки
                  </Btn>
                  <Btn g={g} onClick={() => {
                    setHistory([]);
                    setRose({ sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]), calm: 0, total: 0 });
                  }}>
                    Очистить историю и розу
                  </Btn>
                  <Btn g={g} onClick={() => {
                    try { localStorage.removeItem("wind_ui_tutor_done"); } catch { /* приватный режим */ }
                    setTab("wind");
                  }}>
                    Показать обучение снова
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Перегрузка: ветер вышел за предел датчика. Слой поверх всего,
          но кликов не ловит. */}
      {overloaded && <StormParticles intensity={overFrac} motion={motion} />}

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
          onLocate={locateForNew} onTest={testStation} onSave={saveStation}
          onClose={() => { setShowAdd(false); setNewCoords(null); setTestResult(""); }}
        />
      )}

      <style>{`
        /* Гарнитура — через переменные: оформление здесь инлайновое, и таскать
           выбранный шрифт пропсами через полсотни компонентов было бы адом. */
        :root { --ui-sans: ${FONT_SETS[settings.font]?.sans || FONT_SETS.grotesk.sans};
                --ui-mono: ${FONT_SETS[settings.font]?.mono || FONT_SETS.grotesk.mono};
                --ui-bg: ${(GROUNDS[settings.ground] || GROUNDS.black).bg};
                --ui-corner: ${CORNERS[settings.corners] ?? 0}px;
                --ui-fill: ${(settings.panelFill || 0) / 100}; }
        * { -webkit-tap-highlight-color: transparent; }
        /* Подложка задаётся переменной во всех трёх местах сразу: инлайновый
           фон корневого div перекрыл бы выбор, а прозрачный body показал бы
           фон хоста. */
        body, html { background: var(--ui-bg, #04070a); margin: 0 }
        /* Подложка кастомизации ложится слоями на body. Когда она есть,
           корневые обёртки обязаны стать прозрачными — иначе своя заливка
           перекрыла бы её целиком и выбор не дал бы никакого эффекта. */
        body { ${backdrop} }
        #root, .app { background: ${backdrop ? "transparent" : "var(--ui-bg, #04070a)"} }
        button:focus-visible, input:focus-visible { outline: 1px solid rgba(231,238,246,0.6); outline-offset: 1px; }

        @keyframes pulse   { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes ledBlink{ 0%, 49% { filter: none } 50%, 100% { filter: brightness(0.3) } }
        /* Развёртка кругового обзора. transform-origin задан инлайном в SVG:
           у вложенных <g> проценты считаются от bbox, а не от вьюбокса. */
        @keyframes ppiSweep{ to { transform: rotate(360deg) } }
        @keyframes echoPing{ 0% { r: 3; opacity: .75 } 100% { r: 15; opacity: 0 } }
        @keyframes vortex  { to { transform: rotate(-360deg) } }
        @keyframes rise    { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
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
        .over-pulse { animation: overPulse .9s ease-in-out infinite }
        .orbit-cw   { animation: orbitCW 1.4s linear infinite }
        .orbit-ccw  { animation: orbitCCW 1.4s linear infinite }

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
          animation: stormFly 2s linear infinite;
        }

        /* Тревога добралась до самой шкалы: пульсирует число и кольцо.
           Не мигание в ноль, а именно пульс — резкое исчезновение цифры
           мешало бы её прочитать, а прочитать её в этот момент важнее всего. */
        @keyframes speedAlarm { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
        .speed-alarm { animation: speedAlarm 1.1s ease-in-out infinite }

        /* Винт Young 05103. Вращение задаётся длительностью из JS —
           она обратно пропорциональна скорости ветра. */
        @keyframes youngSpin { to { transform: rotate(360deg) } }
        .young-spin { animation: youngSpin 1s linear infinite; transform-box: view-box }

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
        @keyframes funnelBand { to { stroke-dashoffset: -40 } }
        /* Молния редкая и короткая, как в жизни: две вспышки за двенадцать
           секунд. Постоянно сверкающая гроза выглядит гирляндой. */
        @keyframes lightning {
          0%, 5.6%, 100% { opacity: 0 }
          5.8% { opacity: 1 } 6.4% { opacity: .15 } 6.9% { opacity: .9 } 7.6% { opacity: 0 }
        }
        .funnel-band { animation: funnelBand 3s linear infinite }
        .lightning { animation: lightning 12s linear infinite; opacity: 0 }
        /* Ночью воронку выхватывает только вспышка. Кадры те же, что у молнии,
           поэтому подсветка синхронна с ней сама собой — без единой строки JS. */
        @keyframes flashLit {
          0%, 5.6%, 100% { opacity: .06 }
          5.8% { opacity: .95 } 6.4% { opacity: .3 } 6.9% { opacity: .85 } 7.6% { opacity: .06 }
        }
        .flash-lit { animation: flashLit 12s linear infinite }
        .tornado-sway { animation: tornadoSway 7s ease-in-out infinite; transform-box: view-box }
        .tornado-debris { animation: debrisOrbit 2s linear infinite; transform-box: view-box }
        .rec-blink { animation: recBlink 1.6s steps(1) infinite }

        /* Плотность, рамки и контраст — классами на корне, чтобы не тащить
           их пропсами в каждый компонент. */
        .dens-compact .pnl > div { padding: 8px 9px }
        .dens-compact .pnl > header { padding: 6px 9px 5px }
        .noborders .pnl { border-color: transparent; background: none }
        .noborders .pnl > header { border-bottom-color: rgba(160,180,200,0.12) }

        /* Ползунки демо-режима. Родной вид input[type=range] выбивается из
           приборной панели сильнее всего остального, поэтому он собран заново:
           тонкая линейка и квадратная ручка, без скруглений и объёма. */
        .rng { -webkit-appearance: none; appearance: none; width: 100%; height: 16px;
               background: transparent; cursor: pointer; display: block }
        .rng::-webkit-slider-runnable-track { height: 2px; background: rgba(160,180,200,0.28) }
        .rng::-moz-range-track { height: 2px; background: rgba(160,180,200,0.28) }
        .rng::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
               width: 10px; height: 14px; margin-top: -6px; border: none;
               background: var(--rng-accent, #e7eef6); transition: transform .12s ease }
        .rng::-moz-range-thumb { width: 10px; height: 14px; border: none; border-radius: 0;
               background: var(--rng-accent, #e7eef6) }
        .rng:active::-webkit-slider-thumb { transform: scaleY(1.25) }
        .rng:focus-visible { outline: 1px solid rgba(231,238,246,0.6); outline-offset: 3px }

        /* Тревога дышит рамкой, а не мигает целиком: мигающий блок в углу
           экрана раздражает и его начинают игнорировать. */
        @keyframes alarmPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(239,68,68,0) }
          50%      { box-shadow: 0 0 16px rgba(239,68,68,0.35) }
        }
        .alarm-hot { animation: alarmPulse 1.8s ease-in-out infinite }

        /* Переходы. Раньше двигались только панели при появлении, и от этого
           смена вкладки выглядела как подмена картинки. Теперь у содержимого
           есть вход, у подвкладок — своя, более короткая версия, а у строк
           списка — собственная: список станций иначе прыгает при удалении. */
        @keyframes tabfade { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes rowin   { from { opacity: 0; transform: translateX(-6px) } to { opacity: 1; transform: none } }
        .tabfade { animation: tabfade .3s cubic-bezier(.22,.8,.3,1) both }
        .rowin   { animation: rowin .26s cubic-bezier(.22,.8,.3,1) both }
        /* Растр отражаемости проявляется, а не выскакивает: подмена готового
           кадра иначе читается как мигание. */
        @keyframes radarFade { from { opacity: 0 } to { opacity: .78 } }
        .radar-fade { animation: radarFade .45s ease-out both }

        /* Кнопки и тумблеры: нажатие должно чувствоваться, иначе на телефоне
           непонятно, сработало ли касание. */
        button { transition: background-color .18s ease, border-color .18s ease,
                             color .18s ease, transform .09s ease, box-shadow .18s ease }
        button:not(:disabled):active { transform: scale(.96) }
        @media (hover: hover) {
          button:not(:disabled):hover { border-color: rgba(160,180,200,0.42) }
          a:hover { border-color: rgba(160,180,200,0.42) }
        }
        @keyframes grow    { from { opacity: 0; transform: scale(.92) } to { opacity: 1; transform: none } }

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

        .map-ping { animation: mapPing 2.6s ease-out infinite }
        .map-ping.slow { animation-duration: 4.2s }
        .warn-blink { animation: warnBlink 1.5s steps(1) infinite }
        .detail-extreme { animation: alarmEdge 2.2s ease-in-out infinite }

        .ppi-sweep { animation: ppiSweep 4s linear infinite }
        .ppi-sweep.slow { animation-duration: 9s }
        .ping { animation: echoPing 2.4s ease-out infinite }
        .vortex { animation: vortex 3.2s linear infinite }
        .grow { animation: grow .5s cubic-bezier(.22,.8,.3,1) both; transform-origin: 50% 50% }
        /* Панели въезжают снизу при смене вкладки — движение подсказывает, что
           содержимое сменилось целиком, а не обновилось одно число. */
        .pnl { animation: rise .38s cubic-bezier(.22,.8,.3,1) both }
        .modal-card { animation: rise .22s ease-out both }

        .mo-off .pnl, .mo-off .modal-card, .mo-off .grow { animation: none }
        .mo-off .ppi-sweep, .mo-off .ping, .mo-off .vortex { animation: none }
        .mo-off .map-ping, .mo-off .warn-blink, .mo-off .detail-extreme { animation: none }
        .mo-off .tutor-caret { animation: none }
        .mo-off .tabfade, .mo-off .rowin, .mo-off .radar-fade { animation: none }
        .mo-off .alarm-hot, .mo-off .speed-alarm { animation: none }
        .mo-off .over-pulse, .mo-off .orbit-cw, .mo-off .orbit-ccw,
        .mo-off .storm-bit { animation: none }
        .mo-off .young-spin, .mo-off .tornado-sway, .mo-off .tornado-debris,
        .mo-off .rec-blink, .mo-off .funnel-band, .mo-off .lightning,
        .mo-off .flash-lit { animation: none }
        .mo-off button:not(:disabled):active { transform: none }
        .mo-calm .tabfade { animation-duration: .2s }
        .mo-calm .pnl { animation-duration: .25s }
        .mo-calm .warn-blink { animation-duration: 2.4s }

        /* Системная просьба убрать движение сильнее любой настройки дашборда. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition-duration: .01ms !important }
        }

        /* Телефон портретом: обе колонки в столбик, нижние карточки 2x2.
           Инлайн-стили перекрываются только с !important. */
        @media (max-width: 820px) {
          .wind-grid { grid-template-columns: 1fr !important }
          .stat-row  { grid-template-columns: 1fr 1fr !important }
          .live-grid { grid-template-columns: 1fr !important }
          .demo-grid { grid-template-columns: 1fr !important }
        }
      `}</style>
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
          background: b.hue === 0 ? OVER_A : b.hue === 1 ? OVER_B : "rgba(231,238,246,0.85)",
          animationDuration: `${b.dur}s`,
          animationDelay: `${b.delay}s`,
          "--drift": `${b.drift}vh`,
        }} />
      ))}
    </div>
  );
}

// Ячейка строки состояния: разделитель рисуется границей, а не отдельным
// элементом, — иначе при переносе на узком экране остаются висячие палочки.
function StatusCell({ children, g, first, color }) {
  return (
    <span style={{
      padding: "7px 14px", color: color || DIM,
      borderLeft: first ? "none" : `1px solid ${LINE}`,
      fontFamily: SANS, fontWeight: 500, whiteSpace: "nowrap",
      textShadow: color ? glowColor(color, g, 0.4) : "none",
    }}>
      {children}
    </span>
  );
}
