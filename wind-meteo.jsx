import { useState, useMemo } from "react";
import { Segments } from "./wind-switch.jsx";
import {
  BG_VAR, LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM, glow,
} from "./ui-kit.js";
import { SensorArt } from "./wind-sensors-art.jsx";
import { VehicleArt, CHASERS, CHASER_CATS, CHASE_NOTES } from "./wind-chasers.jsx";

// ============================================================
// СПРАВОЧНИК
// ============================================================
// Три раздела: приборы к покупке, полевые зонды и учебник по смерчам.
//
// У каждой карточки два изображения, и это не дублирование. Фотография
// показывает, как прибор выглядит в жизни, — её видно там, где есть интернет.
// Чертёж показывает, как он устроен, весит десятки байт и работает всегда,
// в том числе на копии, отданной самой станцией в сети без выхода наружу.
// Поэтому рисунки никуда не делись: это не запасной вариант, а второй слой.
//
// Числа в карточках — из паспортов и каталогов производителей. Там, где
// характеристика зависит от исполнения или ревизии, стоит «около» — лучше
// признать разброс, чем выдать одно значение за общее правило.

const CATS = [
  { id: "wind",  label: "Ветер" },
  { id: "rain",  label: "Осадки" },
  { id: "air",   label: "Воздух" },
  { id: "sun",   label: "Излучение" },
  { id: "storm", label: "Гроза" },
];

const INSTRUMENTS = [
  {
    id: "young05103", photo: "young", cat: "wind", art: "propvane",
    name: "R.M. Young 05103", kind: "Пропеллерный с флюгером",
    tag: "эталон мачты",
    specs: [
      ["Диапазон", "0–100 м/с"],
      ["Порог", "1.0 м/с винт · 1.1 м/с флюгер"],
      ["Погрешность", "±0.3 м/с или 1% · ±3°"],
      ["Датчик", "винт-геликоид 18 см, 4 лопасти"],
      ["Габариты", "55 × 37 см, 1.0 кг"],
      ["Шаг винта", "29.4 см на оборот"],
    ],
    why: "Разработан для океанских буёв, поэтому переносит то, что убивает обычные приборы: солёный туман, обледенение, годы без обслуживания. Меряет скорость и направление одним корпусом — флюгер разворачивает винт строго навстречу потоку. Стоит на мачтах по всему миру и служит негласной точкой отсчёта, с которой сравнивают остальные.",
    caveat: "Порог 1 м/с высоковат: слабый ветер он просто не видит. Для климатологии штилей берут ультразвук.",
    url: "https://www.youngusa.com/product/wind-monitor/",
  },
  {
    id: "thiesfca", photo: "cups", cat: "wind", art: "cups",
    name: "Thies First Class Advanced", kind: "Чашечный",
    tag: "класс 0.9",
    specs: [
      ["Диапазон", "0.3–75 м/с"],
      ["Порог", "менее 0.3 м/с"],
      ["Погрешность", "1% или ±0.2 м/с (0.3–50 м/с)"],
      ["Класс", "0.9 по IEC 61400-12-1"],
    ],
    why: "Отраслевой эталон ветроэнергетики: по его показаниям считают, окупится ли ветропарк, поэтому к точности требования жёстче, чем в обычной метеорологии. Три чашки — древнейшая схема измерения ветра, дожившая до наших дней именно потому, что её невозможно сбить с толку.",
    caveat: "Чашки инерционны: при резких порывах они «переслеживают» — раскручиваются быстрее, чем тормозят, и слегка завышают среднее.",
    url: "https://www.thiesclima.com/",
  },
  {
    id: "windsonic", photo: "sonic2d", cat: "wind", art: "sonic2d",
    name: "Gill WindSonic", kind: "Ультразвуковой, две оси",
    tag: "без движущихся частей",
    specs: [
      ["Диапазон", "0–60 м/с"],
      ["Порог", "0.01 м/с"],
      ["Погрешность", "2% СКО при 12 м/с · ±3°"],
      ["Принцип", "время пролёта звука между парами преобразователей"],
    ],
    why: "Считает скорость по разнице времени, за которое ультразвук проходит между преобразователями по ветру и против. Двигаться нечему — нет подшипников, нечему изнашиваться и нечего смазывать. Порог 0.01 м/с: видит движение воздуха, которого человек не чувствует.",
    caveat: "Боится налипшего льда и сильного дождя: капля на преобразователе портит отсчёт. Обогрев есть не во всех исполнениях.",
    url: "https://gillinstruments.com/products/anemometer/windsonic.htm",
  },
  {
    id: "sonic3d", photo: "sonic3d", cat: "wind", art: "sonic3d",
    name: "Трёхосевой ультразвук", kind: "Campbell CSAT3B, Gill HS-50",
    tag: "турбулентность",
    specs: [
      ["Частота", "10–100 Гц"],
      ["Измеряет", "три компоненты скорости и акустическую температуру"],
      ["Применение", "метод вихревой ковариации"],
    ],
    why: "Меряет не средний ветер, а сам вихрь: сто отсчётов в секунду по трём осям позволяют посчитать, сколько тепла, влаги и углекислого газа поток уносит вверх. На этих приборах держится вся современная наука о приземном слое.",
    caveat: "Дорог, требует питания и хранения гигабайт сырых рядов. Для «просто посмотреть ветер» бессмыслен.",
    url: "https://www.campbellsci.com/csat3b",
  },
  {
    id: "young03002", cat: "wind", art: "cupvane",
    name: "R.M. Young 03002 Wind Sentry", kind: "Чашки плюс флюгер",
    tag: "рабочая лошадка",
    specs: [
      ["Диапазон", "0–50 м/с"],
      ["Порог", "около 0.5 м/с чашки · 0.8 м/с флюгер"],
      ["Устройство", "три чашки и отдельный флюгер на общей траверсе"],
    ],
    why: "Тот же производитель, но вчетверо дешевле 05103 и заметно чувствительнее на слабом ветре. Классическая схема с раздельными чашками и флюгером: если что-то сломается, менять придётся только половину.",
    caveat: "Две подвижные оси вместо одной — вдвое больше подшипников, которые надо переживать.",
    url: "https://www.youngusa.com/product/wind-sentry-set/",
  },
  {
    id: "davis6410", cat: "wind", art: "cupvane",
    name: "Davis 6410", kind: "Чашки плюс флюгер",
    tag: "для любителя",
    specs: [
      ["Диапазон", "около 1–90 м/с"],
      ["Погрешность", "порядка ±5%"],
      ["Интерфейс", "геркон на скорость, потенциометр на направление"],
    ],
    why: "Самый распространённый анемометр у любительских станций, и не зря: выход — обычные импульсы и напряжение, поэтому он подключается к любой плате буквально тремя проводами. Именно с него начинается большинство самодельных метеостанций.",
    caveat: "Точность любительская. Для наблюдений «какая сегодня погода» отличен, для отчётности — нет.",
    url: "https://www.davisinstruments.com/",
  },
  {
    id: "kestrel", cat: "wind", art: "handheld",
    name: "Kestrel 5500", kind: "Ручной крыльчатый",
    tag: "в кармане",
    specs: [
      ["Диапазон", "около 0.6–40 м/с"],
      ["Погрешность", "порядка ±3%"],
      ["Ещё меряет", "температуру, влажность, давление, точку росы"],
    ],
    why: "Карманная метеостанция: крыльчатка на 25 мм и набор датчиков в корпусе размером с рацию. Незаменима, когда надо померить ветер там, где мачты нет и не будет — на склоне, на палубе, на старте.",
    caveat: "Показания зависят от того, как держать: крыльчатку надо направлять точно в поток, иначе занижает.",
    url: "https://kestrelinstruments.com/",
  },
  {
    id: "hotwire", photo: "hotwire", cat: "wind", art: "hotwire",
    name: "Термоанемометр", kind: "Нагретая нить",
    tag: "слабые потоки",
    specs: [
      ["Диапазон", "обычно 0–30 м/с"],
      ["Разрешение", "до 0.01 м/с"],
      ["Принцип", "поток охлаждает нить, ток удержания температуры и есть сигнал"],
    ],
    why: "Единственный способ уверенно померить движение воздуха доли метра в секунду: механике на таких скоростях не хватает момента, чтобы стронуться. Основной инструмент вентиляционщиков и аэродинамиков.",
    caveat: "Не показывает направление и не любит улицу: пыль на нити меняет теплоотдачу и уводит калибровку.",
    url: "https://www.testo.com/",
  },
  {
    id: "pitot", photo: "pitot", cat: "wind", art: "pitot",
    name: "Трубка Пито", kind: "Динамическое давление",
    tag: "авиация",
    specs: [
      ["Принцип", "разность полного и статического давления"],
      ["Диапазон", "от нескольких м/с до сверхзвука"],
      ["Особенность", "скорость растёт как корень из перепада"],
    ],
    why: "Прибор, по которому летают самолёты. Никаких подвижных частей и почти неограниченный верхний предел — потому и стоит на каждом крыле и в каждой аэродинамической трубе.",
    caveat: "Внизу шкалы бесполезен: при 2 м/с перепад давления уже на уровне шума, а обледеневшая трубка врёт молча — отсюда несколько катастроф в истории авиации.",
    url: "https://www.grc.nasa.gov/www/k-12/airplane/pitot.html",
  },
  {
    id: "tipping", photo: "tipping", cat: "rain", art: "raingauge",
    name: "Опрокидывающийся дождемер", kind: "Young 52202, Davis AeroCone",
    tag: "стандарт осадков",
    specs: [
      ["Цена деления", "0.1 или 0.2 мм на опрокидывание"],
      ["Приёмник", "обычно 200 или 254 см²"],
      ["Выход", "импульс геркона на каждое опрокидывание"],
    ],
    why: "Воронка собирает дождь в качельку из двух ковшиков: наполнился один — перевесил, вылился, подставился второй, геркон дал импульс. Механика на два подвижных элемента, которая работает десятилетиями.",
    caveat: "Ветер сдувает часть капель мимо воронки — недобор при 10 м/с доходит до десятков процентов. Снег без обогрева не мерит вовсе, а при ливне занижает: часть воды проливается за время опрокидывания.",
    url: "https://www.youngusa.com/product/tipping-bucket-rain-gauge/",
  },
  {
    id: "disdro", photo: "disdro", cat: "rain", art: "disdrometer",
    name: "Дисдрометр", kind: "Thies LPM, OTT Parsivel",
    tag: "капля за каплей",
    specs: [
      ["Меряет", "размер и скорость каждой частицы"],
      ["Различает", "дождь, морось, снег, крупу, град"],
      ["Принцип", "лазерная пелена между двумя головками"],
    ],
    why: "Между головками натянута плоская лазерная пелена. Каждая капля, пересекая её, затеняет луч: по глубине провала считается размер, по длительности — скорость падения. Отсюда берут распределение капель по размерам, без которого нельзя пересчитать отражаемость радара в осадки.",
    caveat: "Дорог и требует чистых окошек. Сильный ветер сносит частицы под углом и путает оценку скорости.",
    url: "https://www.thiesclima.com/",
  },
  {
    id: "hmp155", photo: "aws", cat: "air", art: "probe",
    name: "Vaisala HMP155", kind: "Температура и влажность",
    tag: "эталон воздуха",
    specs: [
      ["Температура", "−80…+60 °C, погрешность порядка ±0.1 °C"],
      ["Влажность", "0–100%, около ±1% в основном диапазоне"],
      ["Обязательно", "радиационный экран"],
    ],
    why: "Референсный зонд, по которому поверяют остальные. Ёмкостный чувствительный элемент HUMICAP — изобретение Vaisala, ставшее отраслевым стандартом.",
    caveat: "Сам по себе бесполезен: без экрана он покажет температуру солнца на своём корпусе, а не воздуха. Экран здесь важнее датчика.",
    url: "https://www.vaisala.com/",
  },
  {
    id: "shield", photo: "shield", cat: "air", art: "shield",
    name: "Радиационный экран", kind: "Многопластинчатый или будка Стивенсона",
    tag: "важнее датчика",
    specs: [
      ["Задача", "закрыть датчик от солнца, оставив продув"],
      ["Исполнения", "пассивный, естественной или принудительной вентиляции"],
      ["Ошибка без него", "до нескольких градусов в солнечный штиль"],
    ],
    why: "Не датчик, а то, без чего датчик врёт. Белые тарелки перекрывают прямой и отражённый свет, но оставляют воздуху дорогу. Ошибка неэкранированного термометра днём при слабом ветре доходит до нескольких градусов — больше, чем разница между хорошим и плохим сенсором.",
    caveat: "Пассивный экран в штиль греется сам. Аспирированный точнее, но требует питания вентилятора круглосуточно.",
    url: "https://www.youngusa.com/product/compact-aspirated-radiation-shield/",
  },
  {
    id: "bme280", cat: "air", art: "chip",
    name: "Bosch BME280 / BME680", kind: "Температура, влажность, давление",
    tag: "для самодельной станции",
    specs: [
      ["Давление", "300–1100 гПа, около ±1 гПа"],
      ["Температура", "около ±0.5 °C"],
      ["Влажность", "около ±3%"],
      ["Интерфейс", "I²C или SPI, питание 3.3 В"],
    ],
    why: "Три величины в корпусе размером с рисовое зерно за копейки. Именно этот датчик стоит добавить к нашей станции: дашборд уже умеет показывать температуру, влажность и давление — карточки появятся сами, как только прошивка пришлёт флаги присутствия.",
    caveat: "Греется от собственной платы: если посадить его рядом с ESP32, температура завышается на градус-два. Выносить на проводах и обязательно в экран.",
    url: "https://www.bosch-sensortec.com/products/environmental-sensors/humidity-sensors-bme280/",
  },
  {
    id: "ptb110", photo: "baro", cat: "air", art: "baro",
    name: "Барометр Vaisala PTB110", kind: "Атмосферное давление",
    tag: "барическая тенденция",
    specs: [
      ["Диапазон", "500–1100 гПа"],
      ["Погрешность", "порядка ±0.3 гПа"],
      ["Важно", "приведение к уровню моря по высоте станции"],
    ],
    why: "Само значение давления говорит мало — важна тенденция. Падение на 3 гПа за три часа означает подход фронта надёжнее любого другого одиночного признака, и именно по нему предсказывали погоду за век до спутников.",
    caveat: "Требует знания высоты установки: без приведения к уровню моря показания несопоставимы даже с соседней станцией.",
    url: "https://www.vaisala.com/",
  },
  {
    id: "pyrano", photo: "pyrano", cat: "sun", art: "pyrano",
    name: "Пиранометр", kind: "Kipp & Zonen CMP, Apogee SP-110",
    tag: "солнечный поток",
    specs: [
      ["Меряет", "суммарную солнечную радиацию, Вт/м²"],
      ["Термоэлектрический", "класс A по ISO 9060, широкий спектр"],
      ["Кремниевый", "дешевле, но спектр уже и точность ниже"],
    ],
    why: "Под стеклянным куполом лежит термобатарея: чёрная поверхность греется от солнца, спай даёт напряжение. Купол пропускает нужный спектр и держит ветер снаружи, чтобы прибор мерил свет, а не обдув.",
    caveat: "Требует горизонтирования по пузырьковому уровню и чистого купола: пыль и роса занижают показания, а наклон в градус — заметная ошибка.",
    url: "https://www.kippzonen.com/",
  },
  {
    id: "as3935", cat: "storm", art: "lightning",
    name: "AS3935 Franklin", kind: "Детектор грозовых разрядов",
    tag: "гроза для самоделки",
    specs: [
      ["Дальность", "до 40 км"],
      ["Выдаёт", "оценку расстояния до фронта грозы и энергию разряда"],
      ["Принцип", "приём электромагнитного импульса на рамочную антенну"],
      ["Интерфейс", "I²C или SPI"],
    ],
    why: "Единственный доступный способ поставить на самодельную станцию настоящее обнаружение грозы. Ловит электромагнитный импульс разряда и по его форме оценивает, насколько далеко фронт. Дашборд считает признаки шквала по анемометру — этот датчик добавил бы к ним то, чего ветром не увидеть.",
    caveat: "Ложно срабатывает на импульсные блоки питания, люминесцентные лампы и щётки моторов. Требует настройки порога и разумного удаления от электроники.",
    url: "https://ams-osram.com/products/sensor-solutions/position-sensors/ams-as3935-franklin-lightning-sensor",
  },
];

// ============================================================
// ФОТОГРАФИИ
// ============================================================
// Снимки настоящие, но взяты не «из поиска». Это принципиально: картинки из
// выдачи принадлежат производителям и магазинам, а репозиторий публичный —
// перепубликовать их значило бы присвоить чужое. Здесь только два источника,
// которые разрешают показ:
//
//   * работы федеральных ведомств США (NOAA, NASA, NWS, ВВС) — общественное
//     достояние по закону, потому что оплачены налогоплательщиком;
//   * Викисклад под свободными лицензиями CC — их условие одно: назвать автора
//     и лицензию, что здесь и делается под каждым кадром.
//
// Файлы **не встроены**, а подгружаются по ссылке. Причина арифметическая:
// один снимок весит 30–80 КБ, а во флеше платы остаётся около сотни, и
// десяток фотографий туда не влезет физически. Отсюда следствие, которое
// честно показано в интерфейсе: на копии, отданной самой станцией, фотографий
// не будет — у неё нет выхода в интернет. Там останутся чертежи.
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb/";
const PAGE = "https://commons.wikimedia.org/wiki/File:";

const PHOTOS = {
  young:     { u: "7/71/Young_wind_monitor.jpg/500px-Young_wind_monitor.jpg", lic: "CC BY-SA 3.0", by: "CambridgeBayWeather", f: "Young wind monitor.jpg" },
  cups:      { u: "1/1b/Anemometer.jpg/500px-Anemometer.jpg", lic: "CC BY 3.0", by: "Stefan Kühn", f: "Anemometer.jpg" },
  sonic2d:   { u: "e/ed/Ultrasonic_anemometer_at_Whim_Moss_-_geograph.org.uk_-_3290227.jpg/500px-Ultrasonic_anemometer_at_Whim_Moss_-_geograph.org.uk_-_3290227.jpg", lic: "CC BY-SA 2.0", by: "M J Richardson", f: "Ultrasonic anemometer at Whim Moss - geograph.org.uk - 3290227.jpg" },
  sonic3d:   { u: "c/c6/Ultrasonic_3D_anemometer%2C_R._M._Young_Company%2C_2010_-_Museum_of_Science_and_Industry_%28Chicago%29_-_DSC06371.JPG/500px-Ultrasonic_3D_anemometer%2C_R._M._Young_Company%2C_2010_-_Museum_of_Science_and_Industry_%28Chicago%29_-_DSC06371.JPG", lic: "CC0", by: "Daderot", f: "Ultrasonic 3D anemometer, R. M. Young Company, 2010 - Museum of Science and Industry (Chicago) - DSC06371.JPG" },
  tipping:   { u: "9/90/Interior_tipping_bucket.JPG/500px-Interior_tipping_bucket.JPG", lic: "общественное достояние", by: "Cambridge Bay Weather", f: "Interior tipping bucket.JPG" },
  disdro:    { u: "6/69/Optical_disdrometers_of_NASA.jpg/500px-Optical_disdrometers_of_NASA.jpg", lic: "общественное достояние", by: "NASA", f: "Optical disdrometers of NASA.jpg" },
  shield:    { u: "f/fe/Stevenson_screen_exterior.JPG/500px-Stevenson_screen_exterior.JPG", lic: "общественное достояние", by: "Викисклад", f: "Stevenson screen exterior.JPG" },
  pyrano:    { u: "d/d8/Pyranometr_CMP22.jpg/500px-Pyranometr_CMP22.jpg", lic: "CC BY-SA 4.0", by: "A. Kardaś", f: "Pyranometr CMP22.jpg" },
  baro:      { u: "4/4b/Modern_Aneroid_Barometer.jpg/500px-Modern_Aneroid_Barometer.jpg", lic: "общественное достояние", by: "Викисклад", f: "Modern Aneroid Barometer.jpg" },
  hotwire:   { u: "7/75/HitzedrahtAnemometer.jpg/500px-HitzedrahtAnemometer.jpg", lic: "CC BY 4.0", by: "Ralf Pfeifer", f: "HitzedrahtAnemometer.jpg" },
  pitot:     { u: "a/a4/B777-381_JA8752_nose_Pitot_tube_ja.jpg/500px-B777-381_JA8752_nose_Pitot_tube_ja.jpg", lic: "общественное достояние", by: "Cassiopeia sweet", f: "B777-381 JA8752 nose Pitot tube ja.jpg" },
  aws:       { u: "9/92/Bird%27s_Hill_Climate_Station%2C_Colton_Cross_-_geograph.org.uk_-_686982.jpg/500px-Bird%27s_Hill_Climate_Station%2C_Colton_Cross_-_geograph.org.uk_-_686982.jpg", lic: "CC BY-SA 2.0", by: "Rabbi WP Thinrod", f: "Bird's Hill Climate Station, Colton Cross - geograph.org.uk - 686982.jpg" },

  tiv:       { u: "4/4f/Tornado_Intercept_Vehicle_2.jpg/500px-Tornado_Intercept_Vehicle_2.jpg", lic: "CC BY-SA 2.0", by: "James Bastow", f: "Tornado Intercept Vehicle 2.jpg" },
  dow:       { u: "b/be/Doppler_on_Wheels_6_%28DOW_6%29_2009_VORTEX_2.jpg/500px-Doppler_on_Wheels_6_%28DOW_6%29_2009_VORTEX_2.jpg", lic: "общественное достояние", by: "VORTEX2", f: "Doppler on Wheels 6 (DOW 6) 2009 VORTEX 2.jpg" },
  mesonet:   { u: "8/83/Mobile_mesonet_2017_TORUS_Project.jpg/500px-Mobile_mesonet_2017_TORUS_Project.jpg", lic: "общественное достояние", by: "проект TORUS", f: "Mobile mesonet 2017 TORUS Project.jpg" },
  nexrad:    { u: "9/9e/NEXRAD_tower_US_Naional_Weather_Service_Negaunee_Township_Michigan.jpg/500px-NEXRAD_tower_US_Naional_Weather_Service_Negaunee_Township_Michigan.jpg", lic: "CC BY 3.0", by: "Pierre cb", f: "NEXRAD tower US Naional Weather Service Negaunee Township Michigan.jpg" },
  hunters:   { u: "f/fe/Hurricane_Hunters_gather_forecast_data_on_record-breaking_blizzard_160123-F-UY948-002.jpg/500px-Hurricane_Hunters_gather_forecast_data_on_record-breaking_blizzard_160123-F-UY948-002.jpg", lic: "общественное достояние", by: "Ник Монтелеоне, ВВС США", f: "Hurricane Hunters gather forecast data on record-breaking blizzard 160123-F-UY948-002.jpg" },
  sonde:     { u: "7/7e/Launching_radiosonde_1943.jpg/500px-Launching_radiosonde_1943.jpg", lic: "общественное достояние", by: "архив, 1943", f: "Launching radiosonde 1943.jpg" },

  wedge:     { u: "4/4d/El_Reno_EF-5_Tornado_Wedge.jpg/500px-El_Reno_EF-5_Tornado_Wedge.jpg", lic: "CC BY 2.0", by: "Дэниел Родригес", f: "El Reno EF-5 Tornado Wedge.jpg" },
  wedge2:    { u: "7/77/1960_Newbury_Kansas_wedge.jpg/500px-1960_Newbury_Kansas_wedge.jpg", lic: "общественное достояние", by: "Дорожный патруль Канзаса", f: "1960 Newbury Kansas wedge.jpg" },
  wedge3:    { u: "6/68/2007_Greensburg%2C_KS_tornado_from_Highway_148.jpg/500px-2007_Greensburg%2C_KS_tornado_from_Highway_148.jpg", lic: "CC BY-SA 4.0", by: "Крейг Уэджес", f: "2007 Greensburg, KS tornado from Highway 148.jpg" },
  cone:      { u: "9/98/F5_tornado_Elie_Manitoba_2007.jpg/500px-F5_tornado_Elie_Manitoba_2007.jpg", lic: "CC BY-SA 3.0", by: "Джастин Хобсон", f: "F5 tornado Elie Manitoba 2007.jpg" },
  cone2:     { u: "c/cd/Ottawa%2C_KS_Tornado.jpg/500px-Ottawa%2C_KS_Tornado.jpg", lic: "CC BY 4.0", by: "Augustcm", f: "Ottawa, KS Tornado.jpg" },
  cone3:     { u: "8/86/Evolution_of_a_Tornado.jpg/500px-Evolution_of_a_Tornado.jpg", lic: "CC BY-SA 4.0", by: "Джейсон Уэйнгарт", f: "Evolution of a Tornado.jpg" },
  rope2:     { u: "5/55/Rope_Tornado_near_Yuma%2C_Colorado.jpg/500px-Rope_Tornado_near_Yuma%2C_Colorado.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Rope Tornado near Yuma, Colorado.jpg" },
  rope3:     { u: "d/dd/Tornado_roping_out_near_Otis%2C_CO.jpg/500px-Tornado_roping_out_near_Otis%2C_CO.jpg", lic: "CC0", by: "BusyWikipedian", f: "Tornado roping out near Otis, CO.jpg" },
  rope4:     { u: "c/c4/Tornado_Rope_Out.jpg/500px-Tornado_Rope_Out.jpg", lic: "CC BY 4.0", by: "BusyWikipedian", f: "Tornado Rope Out.jpg" },
  multi2:    { u: "e/ea/1957_Dallas_multi-vortex_1_edited.JPG/500px-1957_Dallas_multi-vortex_1_edited.JPG", lic: "общественное достояние", by: "Роберт Дэй, Бюро погоды США", f: "1957 Dallas multi-vortex 1 edited.JPG" },
  multi3:    { u: "0/06/Tornado_near_Punkin_Center%2C_CO.jpg/500px-Tornado_near_Punkin_Center%2C_CO.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Tornado near Punkin Center, CO.jpg" },
  water2:    { u: "8/80/Giant_water_spout_off_Florida_Keys_%28wea00341%29.jpg/500px-Giant_water_spout_off_Florida_Keys_%28wea00341%29.jpg", lic: "общественное достояние", by: "NOAA, Стив Никлас", f: "Giant water spout off Florida Keys (wea00341).jpg" },
  water3:    { u: "5/51/Waterspout_in_Key_West_Harbor_-_Key_West%2C_Florida_%283845000272%29.jpg/500px-Waterspout_in_Key_West_Harbor_-_Key_West%2C_Florida_%283845000272%29.jpg", lic: "CC BY-SA 2.0", by: "Cayobo", f: "Waterspout in Key West Harbor - Key West, Florida (3845000272).jpg" },
  water4:    { u: "f/fe/November_2000_Waterspout.jpg/500px-November_2000_Waterspout.jpg", lic: "общественное достояние", by: "NOAA", f: "November 2000 Waterspout.jpg" },
  land2:     { u: "2/24/Landspout_Tornado_near_Kirk%2C_CO.jpg/500px-Landspout_Tornado_near_Kirk%2C_CO.jpg", lic: "CC BY 4.0", by: "Штефан Кляйн", f: "Landspout Tornado near Kirk, CO.jpg" },
  land3:     { u: "b/b7/Landspout_Tornado_near_Lamar%2C_CO.jpg/500px-Landspout_Tornado_near_Lamar%2C_CO.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Landspout Tornado near Lamar, CO.jpg" },
  land4:     { u: "9/9d/Landspout_Tornado_in_Colorado.png/500px-Landspout_Tornado_in_Colorado.png", lic: "CC0", by: "Delias Weather", f: "Landspout Tornado in Colorado.png" },
  gust2:     { u: "6/63/Colorado_Gustnado.jpg/500px-Colorado_Gustnado.jpg", lic: "общественное достояние", by: "Джессика Кортекас", f: "Colorado Gustnado.jpg" },
  gust3:     { u: "3/39/Gustnado.jpg/500px-Gustnado.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Gustnado.jpg" },
  gust4:     { u: "e/e7/Tornadic_gustnado.jpg/500px-Tornadic_gustnado.jpg", lic: "общественное достояние", by: "Служба погоды США", f: "Tornadic gustnado.jpg" },
  dust2:     { u: "8/87/Iraqi_Dust_Devil.jpg/500px-Iraqi_Dust_Devil.jpg", lic: "общественное достояние", by: "Ultratone85", f: "Iraqi Dust Devil.jpg" },
  dust3:     { u: "8/88/Dust_devil_Thailand.jpg/500px-Dust_devil_Thailand.jpg", lic: "CC BY-SA 3.0", by: "Ahoerstemeier", f: "Dust devil Thailand.jpg" },
  dust4:     { u: "e/ec/Whirlwind_-Serengeti_plains%2C_Tanzania-20Jan2010.jpg/500px-Whirlwind_-Serengeti_plains%2C_Tanzania-20Jan2010.jpg", lic: "CC BY 2.0", by: "Ноэль Феанс", f: "Whirlwind -Serengeti plains, Tanzania-20Jan2010.jpg" },
  fire2:     { u: "1/1b/2021_Bootleg_Fire_tornado_1.jpg/500px-2021_Bootleg_Fire_tornado_1.jpg", lic: "общественное достояние", by: "Лесная служба США", f: "2021 Bootleg Fire tornado 1.jpg" },
  fire3:     { u: "5/5b/Carr_Fire_tornado_1.jpg/500px-Carr_Fire_tornado_1.jpg", lic: "общественное достояние", by: "Пожарная охрана Калифорнии", f: "Carr Fire tornado 1.jpg" },
  fire4:     { u: "3/3c/Fire_whirl_%28FWS%29.jpg/500px-Fire_whirl_%28FWS%29.jpg", lic: "общественное достояние", by: "Служба рыбных ресурсов США", f: "Fire whirl (FWS).jpg" },
  shelf2:    { u: "4/46/Riiulpilv_-_Shelf_cloud_%282%29_copy.jpg/500px-Riiulpilv_-_Shelf_cloud_%282%29_copy.jpg", lic: "CC BY-SA 4.0", by: "Кристиан Пикнер", f: "Riiulpilv - Shelf cloud (2) copy.jpg" },
  shelf3:    { u: "5/5c/Shelf_cloud_over_Asprovalta.jpg/500px-Shelf_cloud_over_Asprovalta.jpg", lic: "CC BY-SA 4.0", by: "Neptuul", f: "Shelf cloud over Asprovalta.jpg" },
  shelf4:    { u: "7/7b/Lightning_and_a_Shelf_Cloud.jpg/500px-Lightning_and_a_Shelf_Cloud.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Lightning and a Shelf Cloud.jpg" },
  mamm2:     { u: "3/39/Mammatus-clouds-Tulsa-1973.png/500px-Mammatus-clouds-Tulsa-1973.png", lic: "общественное достояние", by: "NOAA", f: "Mammatus-clouds-Tulsa-1973.png" },
  mamm3:     { u: "6/6a/Mammatus_clouds%2C_Pittsburgh%2C_2022-06-16%2C_01.jpg/500px-Mammatus_clouds%2C_Pittsburgh%2C_2022-06-16%2C_01.jpg", lic: "CC0", by: "Cbaile19", f: "Mammatus clouds, Pittsburgh, 2022-06-16, 01.jpg" },
  mamm4:     { u: "f/fe/Mammatus_wolken_boven_Houten.jpg/500px-Mammatus_wolken_boven_Houten.jpg", lic: "CC BY-SA 4.0", by: "Ronaldhuizer", f: "Mammatus wolken boven Houten.jpg" },
  eye2:      { u: "a/ac/Hurricane_Isabel_eye_from_ISS.jpg/500px-Hurricane_Isabel_eye_from_ISS.jpg", lic: "общественное достояние", by: "Эд Лу, НАСА", f: "Hurricane Isabel eye from ISS.jpg" },
  eye3:      { u: "b/b5/Staring_Down_Hurricane_Florence.jpg/500px-Staring_Down_Hurricane_Florence.jpg", lic: "общественное достояние", by: "Александр Герст, ЕКА", f: "Staring Down Hurricane Florence.jpg" },
  eye4:      { u: "2/28/Eye_of_Hurricane_Milton_from_the_ISS_2024-10-07.jpg/500px-Eye_of_Hurricane_Milton_from_the_ISS_2024-10-07.jpg", lic: "общественное достояние", by: "НАСА, МКС", f: "Eye of Hurricane Milton from the ISS 2024-10-07.jpg" },
  mars2:     { u: "8/81/Dust_devils_galore-_Mars_Express_visits_Mamers_Valles_on_Mars_ESA523013.jpg/500px-Dust_devils_galore-_Mars_Express_visits_Mamers_Valles_on_Mars_ESA523013.jpg", lic: "CC BY-SA 3.0 IGO", by: "Европейское космическое агентство", f: "Dust devils galore- Mars Express visits Mamers Valles on Mars ESA523013.jpg" },
  mars3:     { u: "1/18/Dust_Devil_Whirls_by_Perseverance_Coring_Operation_%28PIA26572%29.jpg/500px-Dust_Devil_Whirls_by_Perseverance_Coring_Operation_%28PIA26572%29.jpg", lic: "общественное достояние", by: "НАСА, Лаборатория реактивного движения", f: "Dust Devil Whirls by Perseverance Coring Operation (PIA26572).jpg" },
  super2:    { u: "2/20/Chaparral_Supercell_2.JPG/500px-Chaparral_Supercell_2.JPG", lic: "общественное достояние", by: "Грег Лундин, Служба погоды США", f: "Chaparral Supercell 2.JPG" },
  super3:    { u: "2/2a/Low_Precipitation_Supercell_Thunderstorm.jpg/500px-Low_Precipitation_Supercell_Thunderstorm.jpg", lic: "CC BY-SA 4.0", by: "Штефан Кляйн", f: "Low Precipitation Supercell Thunderstorm.jpg" },
  super4:    { u: "9/98/Supercell_with_bell-bottom_updraft.jpg/500px-Supercell_with_bell-bottom_updraft.jpg", lic: "CC BY 4.0", by: "Rollingskyphoto", f: "Supercell with bell-bottom updraft.jpg" },
  wall2:     { u: "b/b1/Circular_base_of_a_rotating_wall_cloud_-_NOAA.jpg/500px-Circular_base_of_a_rotating_wall_cloud_-_NOAA.jpg", lic: "общественное достояние", by: "Лаборатория сильных штормов, NOAA", f: "Circular base of a rotating wall cloud - NOAA.jpg" },
  wall3:     { u: "1/1b/1989_Huntsville_Wall_cloud_1.jpg/500px-1989_Huntsville_Wall_cloud_1.jpg", lic: "общественное достояние", by: "Служба погоды, Бирмингем", f: "1989 Huntsville Wall cloud 1.jpg" },
  funn2:     { u: "8/82/Backlit_funnel_cloud_and_tornado_-_NOAA.jpg/500px-Backlit_funnel_cloud_and_tornado_-_NOAA.jpg", lic: "общественное достояние", by: "NOAA", f: "Backlit funnel cloud and tornado - NOAA.jpg" },
  funn3:     { u: "3/35/Cumulonimbus_tuba_1.jpg/500px-Cumulonimbus_tuba_1.jpg", lic: "CC BY 3.0", by: "Couch-scratching-cats", f: "Cumulonimbus tuba 1.jpg" },
  funn4:     { u: "4/4f/Baker_Co_Funnel_01-22-17_1512.jpg/500px-Baker_Co_Funnel_01-22-17_1512.jpg", lic: "CC BY-SA 4.0", by: "Spotter31768", f: "Baker Co Funnel 01-22-17 1512.jpg" },
  rope:      { u: "0/0d/Tornado_Roping_Out_in_Eastern_Colorado.jpg/500px-Tornado_Roping_Out_in_Eastern_Colorado.jpg", lic: "CC BY-SA 4.0", by: "BusyWikipedian", f: "Tornado Roping Out in Eastern Colorado.jpg" },
  multi:     { u: "b/b6/Dimmit_Sequence.jpg/500px-Dimmit_Sequence.jpg", lic: "общественное достояние", by: "Харальд Рихтер, NOAA", f: "Dimmit Sequence.jpg" },
  waterspout:{ u: "5/5d/Waterspout_near_Cap_de_Formentor%2C_Mallorca_2006-09-25.jpg/500px-Waterspout_near_Cap_de_Formentor%2C_Mallorca_2006-09-25.jpg", lic: "CC BY 2.5", by: "Julian Kupfer", f: "Waterspout near Cap de Formentor, Mallorca 2006-09-25.jpg" },
  landspout: { u: "e/e0/Landspout_Tornado.jpg/500px-Landspout_Tornado.jpg", lic: "CC BY-SA 4.0", by: "Stefan Klein", f: "Landspout Tornado.jpg" },
  funnel:    { u: "9/92/Funnel_cloud_approaching_the_ground_-_NOAA.jpg/500px-Funnel_cloud_approaching_the_ground_-_NOAA.jpg", lic: "общественное достояние", by: "NOAA", f: "Funnel cloud approaching the ground - NOAA.jpg" },
  dustdevil: { u: "4/43/Dust_devil.jpg/500px-Dust_devil.jpg", lic: "общественное достояние", by: "NASA", f: "Dust devil.jpg" },
  firewhirl: { u: "2/29/Fire_whirl_%28FWS%29_crop.jpg/500px-Fire_whirl_%28FWS%29_crop.jpg", lic: "общественное достояние", by: "Служба рыбных ресурсов США", f: "Fire whirl (FWS) crop.jpg" },
  gustnado:  { u: "2/20/Gustnado_April26_2019.jpg/500px-Gustnado_April26_2019.jpg", lic: "общественное достояние", by: "NOAA", f: "Gustnado April26 2019.jpg" },
  evolution: { u: "8/86/Evolution_of_a_Tornado.jpg/500px-Evolution_of_a_Tornado.jpg", lic: "CC BY-SA 4.0", by: "Jason Weingart", f: "Evolution of a Tornado.jpg" },
  supercell: { u: "a/a5/Supercell_thunderstorm_over_Needmore%2C_Texas._May_4%2C_2019.jpg/500px-Supercell_thunderstorm_over_Needmore%2C_Texas._May_4%2C_2019.jpg", lic: "CC BY-SA 4.0", by: "Raychel Sanner", f: "Supercell thunderstorm over Needmore, Texas. May 4, 2019.jpg" },
  wallcloud: { u: "8/8d/Well_Defined_Wall_Cloud.jpg/500px-Well_Defined_Wall_Cloud.jpg", lic: "CC BY-SA 4.0", by: "Stefan Klein", f: "Well Defined Wall Cloud.jpg" },
  shelf:     { u: "4/46/Riiulpilv_-_Shelf_cloud_%282%29_copy.jpg/500px-Riiulpilv_-_Shelf_cloud_%282%29_copy.jpg", lic: "CC BY-SA 4.0", by: "Kristian Pikner", f: "Riiulpilv - Shelf cloud (2) copy.jpg" },
  mammatus:  { u: "6/67/Hazy_mammatus_behind_wire.jpg/500px-Hazy_mammatus_behind_wire.jpg", lic: "CC BY-SA 4.0", by: "Rubbish computer", f: "Hazy mammatus behind wire.jpg" },
  eye:       { u: "a/a0/Hurricane_Isabel_eye_from_ISS_%28edit_1%29.jpg/500px-Hurricane_Isabel_eye_from_ISS_%28edit_1%29.jpg", lic: "общественное достояние", by: "Эд Лу, NASA, с МКС", f: "Hurricane Isabel eye from ISS (edit 1).jpg" },
  mars:      { u: "e/ea/Martian_Dust_Devil_Trails.jpg/500px-Martian_Dust_Devil_Trails.jpg", lic: "общественное достояние", by: "NASA/JPL, университет Аризоны", f: "Martian Dust Devil Trails.jpg" },
};

// Снимок с подписью. Пока грузится — место занято рамкой, чтобы вёрстка
// не прыгала; если не загрузился (нет интернета или песочница режет чужие
// домены) — вместо него честная строка, а не пустой прямоугольник.
function Photo({ id, alt, ratio = "4 / 3", g, bare }) {
  const p = PHOTOS[id];
  const [state, setState] = useState("load");
  if (!p) return null;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{
        position: "relative", aspectRatio: ratio, background: "#020407",
        border: bare ? "none" : `1px solid ${LINE}`, overflow: "hidden",
        ...(bare ? { height: "100%", aspectRatio: "auto" } : null),
      }}>
        <img src={COMMONS + p.u} alt={alt} loading="lazy"
             onLoad={() => setState("ok")} onError={() => setState("fail")}
             style={{
               width: "100%", height: "100%", objectFit: "cover", display: "block",
               opacity: state === "ok" ? 1 : 0, transition: "opacity .47s ease",
             }} />
        {state !== "ok" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", padding: 14, textAlign: "center",
            color: FAINT, fontSize: 10, lineHeight: 1.55, fontFamily: SANS,
          }}>
            {state === "fail"
              ? "Нет снимка — нужен интернет."
              : "Загружаю снимок…"}
          </div>
        )}
      </div>
      {!bare && <figcaption style={{ color: FAINT, fontSize: 9, lineHeight: 1.5, marginTop: 4, fontFamily: SANS }}>
        {p.by} · {p.lic} ·{" "}
        <a href={PAGE + encodeURIComponent(p.f.replace(/ /g, "_"))} target="_blank" rel="noreferrer noopener"
           style={{ color: DIM }}>Викисклад ↗</a>
      </figcaption>}
    </figure>
  );
}


// ============================================================
// ПОЛЕВЫЕ ЗОНДЫ
// ============================================================
// То, чем меряют смерч изнутри и рядом. Общее у всех одно: прибор надо
// доставить туда, куда он сам не доедет, и снять данные раньше, чем его
// снесёт. Отсюда и облик — не мачта, а машина.
const PROBES = [
  {
    id: "sticknet", photo: "aws", cat: "field",
    name: "StickNet", kind: "Переносная мачта, Техасский технологический",
    tag: "48 штук за раз",
    specs: [
      ["Меряет", "скорость и направление ветра, давление, температуру, влажность"],
      ["Развёртывание", "одна мачта — считанные минуты, силами двух человек"],
      ["Питание", "автономное, на всё время шторма"],
      ["Разработчик", "Национальный институт ветра, Техас"],
    ],
    why: "Ровно то, что называется «свой зонд», только доведённое до серии. Мачту ставят на пути урагана и уезжают. В 2020 году в Лору выставили 48 штук, и 16 из них попали в стену глаза или сам глаз — благодаря этому Лора стала самым подробно задокументированным ураганом, вышедшим на побережье США.",
    caveat: "Ставится заранее и вслепую: прогноз траектории на несколько часов вперёд решает, попадёт прибор в шторм или простоит зря. Ближе к берегу точнее, но там его сносит штормовым нагоном.",
    url: "https://www.depts.ttu.edu/nwi/",
  },
  {
    id: "tiv", photo: "tiv", cat: "field",
    name: "Tornado Intercept Vehicle", kind: "Бронированная машина-перехватчик",
    tag: "внутрь смерча",
    specs: [
      ["Масса", "около 6.5 т в исполнении TIV 2"],
      ["Защита", "стальная броня, поликарбонатные стёкла"],
      ["Удержание", "гидравлические упоры в грунт и сброс клиренса"],
      ["Создатель", "Шон Кэйси"],
    ],
    why: "Построена ради одного кадра: снять смерч изнутри. Упоры вбиваются в землю, машина садится на грунт и превращается в якорь. В 2009 году TIV 2 действительно оказалась внутри воронки и вернулась.",
    caveat: "Это киносъёмочная и рекордная машина, а не научный прибор. Данных она даёт немного, риск огромен, и повторять такое без подготовки — верный способ погибнуть.",
    url: "https://en.wikipedia.org/wiki/Tornado_Intercept_Vehicle",
  },
  {
    id: "dow", photo: "dow", cat: "field",
    name: "Doppler on Wheels", kind: "Мобильный доплеровский радар",
    tag: "рекорд 484 км/ч",
    specs: [
      ["Разрешение", "десятки метров на дистанции в километры"],
      ["Развёртывание", "минуты, прямо с обочины"],
      ["Диапазоны", "X и Ka"],
      ["Проекты", "VORTEX2, TORUS, PECAN"],
    ],
    why: "Радар на грузовике, который подъезжает к смерчу на километры и просвечивает его насквозь. Именно DOW измерил 484 км/ч в Бридж-Крик — самую высокую скорость ветра у поверхности Земли за всю историю. Всё, что известно о внутренней структуре смерчей, добыто такими машинами.",
    caveat: "Радар меряет скорость не у земли, а на высоте луча — десятки метров и выше. Поэтому его рекорды не идут в рейтинг EF: категорию дают по разрушениям на грунте.",
    url: "https://www.flexibleobservingfacility.org/",
  },
  {
    id: "mesonet", photo: "mesonet", cat: "field",
    name: "Mobile Mesonet", kind: "Метеостанция на крыше автомобиля",
    tag: "сеть на колёсах",
    specs: [
      ["Меряет", "ветер, температуру, влажность, давление на ходу"],
      ["Высота мачты", "около 3.5 м над дорогой"],
      ["Особенность", "поправка на собственную скорость машины"],
    ],
    why: "Самый доступный способ собрать поле данных вокруг грозы: несколько машин расходятся веером и пишут разрез через фронт порывов. Из этих разрезов и выяснили, что нисходящий поток с тыла — ключ к рождению смерча.",
    caveat: "Ветер на крыше едущей машины искажён её собственным потоком; поправки обязательны, и без них данные хуже, чем никакие.",
    url: "https://www.nssl.noaa.gov/",
  },
  {
    id: "sonde", photo: "sonde", cat: "field",
    name: "Радиозонд", kind: "Шар-зонд с передатчиком",
    tag: "дважды в сутки, весь мир",
    specs: [
      ["Меряет", "давление, температуру, влажность, ветер по сносу"],
      ["Высота", "до 30–35 км, пока шар не лопнет"],
      ["Запуск", "00 и 12 UTC одновременно по всей планете"],
    ],
    why: "Единственный способ узнать, что происходит в атмосфере по высоте, а не у земли. Именно по радиозондам считают энергию неустойчивости, от которой зависит, будет ли смерч. Мировая сеть запускает их синхронно с 1930-х годов — это самая старая работающая система глобальных наблюдений.",
    caveat: "Одна точка дважды в сутки. Между запусками атмосфера успевает измениться полностью, и всё, что происходит в промежутке, остаётся за кадром.",
    url: "https://www.weather.gov/upperair/factsheet",
  },
  {
    id: "hunters", photo: "hunters", cat: "field",
    name: "Охотники за ураганами", kind: "Самолёт и сбрасываемые зонды",
    tag: "внутрь глаза",
    specs: [
      ["Самолёты", "WC-130J ВВС США, WP-3D и Gulfstream IV у NOAA"],
      ["Метод", "полёт сквозь стену глаза, сброс зондов вниз"],
      ["Дропсонд", "передаёт профиль всю дорогу до воды"],
    ],
    why: "Спутник видит ураган сверху и не знает давления в его центре, а прогноз силы зависит именно от него. Единственный способ узнать — влететь внутрь и сбросить зонд. Эти полёты заметно уточняют прогноз траектории, и потому их продолжают несмотря на риск.",
    caveat: "Дорого, опасно и только для тропических циклонов: внутрь смерча самолёт не влетит — он слишком мал и слишком быстр.",
    url: "https://www.aoml.noaa.gov/hurricane-research-division/",
  },
  {
    id: "nexrad", photo: "nexrad", cat: "field",
    name: "NEXRAD", kind: "Стационарный доплеровский радар",
    tag: "159 штук на США",
    specs: [
      ["Дальность", "до 230 км по осадкам"],
      ["Обновление", "полный объём за 4–6 минут"],
      ["Поляризация", "двойная — различает дождь, град и обломки"],
    ],
    why: "Сеть, на которой держится вся система предупреждений. Двойная поляризация умеет то, ради чего её и вводили: отличить обломки, поднятые смерчем, от осадков. Такая отметка означает, что смерч уже на земле и что-то ломает, — даже если никто его не видит.",
    caveat: "Луч уходит вверх с расстоянием: в 150 км от радара он идёт уже на трёх километрах и происходящего у земли не видит вовсе. Отсюда дыры в покрытии между станциями.",
    url: "https://www.roc.noaa.gov/",
  },
];

// ============================================================
// СМЕРЧИ, ЯЧЕЙКИ, УРАГАНЫ
// ============================================================
// Учебник в карточках. Порядок неслучаен: сначала то, из чего смерч рождается,
// потом сам смерч в его видах, потом то, что на него похоже, но им не является,
// и в конце — большие вихри планетарного масштаба.
//
// Различать похожее здесь важнее, чем перечислять: половина «смерчей» на
// видео в сети — это гастнадо и пыльные вихри, а половина тревог у неопытных
// наблюдателей вызвана шельфовым облаком, которое к смерчу отношения не имеет.
const STORMS = [
  {
    id: "supercell", photo: "supercell", cat: "birth",
    photos: ["supercell", "super2", "super3", "super4"],
    name: "Суперячейка", kind: "Гроза с вращающимся восходящим потоком",
    tag: "мать смерчей",
    specs: [
      ["Размер мезоциклона", "2–10 км в поперечнике"],
      ["Живёт", "часами, в отличие от обычной грозы"],
      ["Даёт смерч", "меньше чем в одном случае из пяти"],
    ],
    why: "Единственный тип грозы, живущий часами: её восходящий поток вращается, и потому осадки выпадают в стороне, а не гасят его. Почти все сильные смерчи рождаются именно здесь. Вращение приходит из сдвига ветра по высоте — ветер у земли и на трёх километрах дует по-разному, и этот перепад ставит воздух на бок, а восходящий поток поднимает ось вращения вертикально.",
    caveat: "Суперячейка не равна смерчу. Большинство их не даёт вовсе — что именно решает исход, до конца не выяснено до сих пор.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/thunderstorms/types/",
  },
  {
    id: "wallcloud", photo: "wallcloud", cat: "birth",
    photos: ["wallcloud", "wall2", "wall3"],
    name: "Стена облаков", kind: "Опущенное основание под восходящим потоком",
    tag: "смотреть сюда",
    specs: [
      ["Где", "под самым мощным восходящим потоком, у зоны осадков"],
      ["Признак опасности", "вращается и поднимается"],
      ["Что дальше", "из неё и опускается воронка"],
    ],
    why: "Кусок основания грозы, опущенный ниже остального: влажный воздух из зоны осадков втягивается в поток и конденсируется раньше. Если стена вращается на глазах и поднимается — это и есть предвестник смерча, самый надёжный из видимых.",
    caveat: "Не всякая опущенность — стена облаков, и не всякая стена вращается. Ключ именно во вращении и в подъёме, а не в том, что «что-то висит ниже».",
    url: "https://www.weather.gov/safety/tornado-during",
  },
  {
    id: "funnel", photo: "funnel", cat: "birth",
    photos: ["funnel", "funn2", "funn3", "funn4"],
    name: "Воронка без касания", kind: "Funnel cloud",
    tag: "ещё не смерч",
    specs: [
      ["Что видно", "конденсационный конус, не дошедший до земли"],
      ["Статус", "смерчем считается только при циркуляции у грунта"],
      ["Опасность", "может опуститься за секунды"],
    ],
    why: "Формально это ещё не смерч: категорию и само название даёт контакт с землёй, а точнее — вихрь у грунта, поднимающий пыль. Различие не бюрократическое: именно у земли ветер и ломает.",
    caveat: "Обратное тоже верно и опаснее: смерч может уже работать, а конденсационной воронки не быть — если воздух сухой, видно будет только пыльный вихрь внизу.",
    url: "https://www.weather.gov/safety/tornado",
  },
  {
    id: "wedge", photo: "wedge", cat: "kind",
    photos: ["wedge", "wedge2", "wedge3"],
    name: "Клиновидный", kind: "Wedge",
    tag: "шире, чем выше",
    specs: [
      ["Признак", "видимая ширина больше видимой высоты"],
      ["Обычно", "самые разрушительные, но не по определению"],
      ["Пример", "Эли, Манитоба, 2007 — единственный F5 в Канаде"],
    ],
    why: "Не отдельный вид, а описание облика: воронка выглядит шире, чем высота от земли до облака. Такие чаще оказываются сильными просто потому, что широкий смерч дольше держится и охватывает больше.",
    caveat: "Ширина не равна силе. Эль-Рино 2013 был шире всех в истории — 4.2 км — и получил всего EF3, потому что шёл по пустой местности, а категорию дают по разрушениям.",
    url: "https://www.spc.noaa.gov/faq/tornado/",
  },
  {
    id: "cone", photo: "cone", cat: "kind",
    photos: ["cone", "cone2", "cone3"],
    name: "Конусовидный", kind: "Cone",
    tag: "тот самый облик",
    specs: [
      ["Признак", "высота заметно больше ширины, книзу сужается"],
      ["Встречается", "чаще любого другого облика"],
      ["Пример", "Эли, Манитоба, 2007 — единственный F5 в Канаде"],
    ],
    why: "То, что рисуют, когда говорят «смерч»: воронка сужается от облака к земле и вытянута по высоте. Самый обычный облик и самый узнаваемый — именно из-за него клин так часто путают с конусом, хотя клин ровно наоборот шире, чем выше.",
    caveat: "Облик меняется по ходу жизни одного и того же смерча: конус может расшириться в клин, а к концу вытянуться в верёвку. Это не разные виды, а стадии.",
    url: "https://www.spc.noaa.gov/faq/tornado/",
  },
  {
    id: "rope", photo: "rope", cat: "kind",
    photos: ["rope", "rope2", "rope3", "rope4"],
    name: "Верёвочный", kind: "Rope",
    tag: "стадия, а не вид",
    specs: [
      ["Когда", "обычно последняя фаза жизни смерча"],
      ["Облик", "тонкий извивающийся жгут"],
      ["Опасность", "остаётся высокой до самого конца"],
    ],
    why: "Так смерч чаще всего умирает: воронка вытягивается, изгибается и рвётся. Красивая и обманчивая стадия.",
    caveat: "Тонкий — не значит слабый. На стадии верёвки вихрь сжимается, и по закону сохранения момента импульса скорость может даже вырасти. Смерчи убивали людей именно в этой фазе.",
    url: "https://www.spc.noaa.gov/faq/tornado/",
  },
  {
    id: "multi", photo: "multi", cat: "kind",
    photos: ["multi", "multi2", "multi3"],
    name: "Многовихревой", kind: "Multiple-vortex",
    tag: "вихри внутри вихря",
    specs: [
      ["Устройство", "2–6 малых вихрей вокруг общего центра"],
      ["Скорость", "в субвихре заметно выше, чем в основном"],
      ["След", "полосы разрушений внутри общей полосы"],
    ],
    why: "Объясняет старую загадку: почему один дом снесён до фундамента, а соседний цел. Внутри воронки бегают несколько маленьких вихрей, и скорость в них складывается со скоростью вращения всей системы. Через дом мог пройти субвихрь, а через соседний — нет.",
    caveat: "Разглядеть субвихри удаётся редко: их видно только когда воронка хорошо освещена и не залита дождём.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/tornadoes/",
  },
  {
    id: "waterspout", photo: "waterspout", cat: "kind",
    photos: ["waterspout", "water2", "water3", "water4"],
    name: "Водяной смерч", kind: "Waterspout",
    tag: "их два разных",
    specs: [
      ["Погожий тип", "растёт снизу вверх от развивающегося облака, обычно слабый"],
      ["Смерчевой тип", "обычный смерч, вышедший на воду, опасен так же"],
      ["Где часто", "Флорида-Кис, Адриатика, Великие озёра"],
    ],
    why: "Под одним названием прячутся два разных явления. Погожий развивается на границе воды и растёт вверх, живёт минуты и редко опасен. Смерчевой — это полноценный смерч суперячейки, которому просто случилось оказаться над водой.",
    caveat: "Издалека они неразличимы. Выходя на берег, погожий обычно распадается, а смерчевой не меняется вовсе.",
    url: "https://www.weather.gov/key/marine_waterspouts",
  },
  {
    id: "landspout", photo: "landspout", cat: "kind",
    photos: ["landspout", "land2", "land3", "land4"],
    name: "Ландспаут", kind: "Landspout",
    tag: "без мезоциклона",
    specs: [
      ["Рождается", "от приземной границы, а не от вращения в облаке"],
      ["Сила", "обычно EF0–EF1"],
      ["На радаре", "подписи почти нет"],
    ],
    why: "Сухопутный близнец погожего водяного смерча: вращение берётся у земли, на линии сходимости, а растущее облако его вытягивает вверх. Формально это настоящий смерч, и его считают в статистике.",
    caveat: "Опаснее, чем кажется, именно из-за радара: мезоциклона нет, крюка нет, предупреждение часто не выпускается — а вихрь есть.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/tornadoes/types/",
  },
  {
    id: "gustnado", photo: "gustnado", cat: "false",
    photos: ["gustnado", "gust2", "gust3", "gust4"],
    name: "Гастнадо", kind: "Вихрь на фронте порывов",
    tag: "не смерч",
    specs: [
      ["Где", "на переднем крае холодного выброса из грозы"],
      ["Связь с облаком", "отсутствует — и это решающий признак"],
      ["Живёт", "секунды, реже минуту"],
    ],
    why: "Пыльный вихрь, который крутится на линии шквала. Выглядит убедительно, попадает в новости как смерч, но смерчем не является: он не связан с основанием облака, а это в определении главное.",
    caveat: "Безобидным его тоже не назовёшь: скорости бывают как у слабого смерча, и лёгкие постройки он повреждает.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/tornadoes/types/",
  },
  {
    id: "dustdevil", photo: "dustdevil", cat: "false",
    photos: ["dustdevil", "dust2", "dust3", "dust4"],
    name: "Пыльный вихрь", kind: "Dust devil",
    tag: "ясное небо",
    specs: [
      ["Когда", "в жару и в ясную погоду"],
      ["Причина", "перегретая поверхность, а не гроза"],
      ["Высота", "обычно десятки метров"],
    ],
    why: "Возникает от нагрева земли: поднимающийся воздух закручивается и подхватывает пыль. Облака для этого не нужно вовсе — потому это и не смерч.",
    caveat: "На Марсе они достигают километров в высоту и оставляют тёмные следы, видимые с орбиты. Марсоходам они не раз чистили солнечные панели и продлевали работу на годы дольше расчётного срока.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/tornadoes/types/",
  },
  {
    id: "firewhirl", photo: "firewhirl", cat: "false",
    photos: ["firewhirl", "fire2", "fire3", "fire4"],
    name: "Огненный вихрь", kind: "Fire whirl",
    tag: "редкое исключение",
    specs: [
      ["Причина", "тепло пожара, а не грозовое облако"],
      ["Обычно", "десятки метров, минуты жизни"],
      ["Исключение", "Канберра, 2003 — оценён как F3"],
    ],
    why: "Пожар создаёт собственный восходящий поток такой силы, что тот закручивается. В большинстве случаев это явление масштаба пыльного вихря.",
    caveat: "Но не всегда: в Канберре в 2003 году огненный вихрь получил рейтинг F3, то есть был настоящим смерчем, порождённым пожаром. Такие случаи единичны.",
    url: "https://www.nssl.noaa.gov/education/svrwx101/tornadoes/types/",
  },
  {
    id: "shelf", photo: "shelf", cat: "false",
    photos: ["shelf", "shelf2", "shelf3", "shelf4"],
    name: "Шельфовое облако", kind: "Shelf cloud",
    tag: "путают чаще всего",
    specs: [
      ["Что это", "передний край холодного выброса грозы"],
      ["Движение", "не вращается, а надвигается стеной"],
      ["Что следом", "резкий порыв и ливень"],
    ],
    why: "Выглядит устрашающе и вызывает больше ложных тревог, чем всё остальное вместе. Но это противоположность стены облаков: там воздух втягивается внутрь грозы, здесь — выбрасывается наружу.",
    caveat: "Отличать просто: шельфовое надвигается ровной стеной и не вращается, стена облаков висит на месте и крутится. Первое означает шквал, второе — возможный смерч.",
    url: "https://www.weather.gov/mkx/taw-shelf_cloud",
  },
  {
    id: "mammatus", photo: "mammatus", cat: "false",
    photos: ["mammatus", "mamm2", "mamm3", "mamm4"],
    name: "Вымеобразные облака", kind: "Mammatus",
    tag: "красиво, но не про опасность",
    specs: [
      ["Где", "под наковальней мощной грозы"],
      ["Причина", "опускающийся холодный воздух с осадками"],
      ["Означает", "гроза сильная — но обычно уже уходит"],
    ],
    why: "Мешковидные наросты под наковальней. Признак того, что гроза мощная, и один из красивейших видов неба.",
    caveat: "Опасности под собой они не означают: чаще всего появляются с тыльной стороны уходящей грозы, а не там, где что-то произойдёт.",
    url: "https://www.weather.gov/",
  },
  {
    id: "eye", photo: "eye", cat: "big",
    photos: ["eye", "eye2", "eye3", "eye4"],
    name: "Глаз урагана", kind: "Тропический циклон",
    tag: "затишье в центре",
    specs: [
      ["Диаметр глаза", "обычно 30–60 км"],
      ["В глазу", "почти штиль и часто чистое небо"],
      ["Стена глаза", "самый сильный ветер всей системы"],
    ],
    why: "Воздух в центре опускается, поэтому облака там разрушаются и наступает затишье — иногда с солнцем над головой. Снимок сделан с МКС: сверху видно, что глаз это настоящий колодец в облачной стене.",
    caveat: "Затишье обманывает: после прохода глаза ветер возвращается с той же силой, но с противоположной стороны. Люди выходят наружу в затишье и попадают под вторую половину — это классическая причина гибели.",
    url: "https://www.nhc.noaa.gov/",
  },
  {
    id: "mars", photo: "mars", cat: "big",
    photos: ["mars", "mars2", "mars3"],
    name: "Вихри на Марсе", kind: "Пыльные вихри другой планеты",
    tag: "любопытное",
    specs: [
      ["Высота", "до 8 км — выше земных в сотни раз"],
      ["Видно", "тёмные следы на поверхности с орбиты"],
      ["Польза", "сдувают пыль с солнечных панелей марсоходов"],
    ],
    why: "Атмосфера Марса в сто раз разрежённее земной, но вихри там крупнее наших: слабое притяжение и сильный прогрев поверхности дают им расти километрами. Следы, которые они оставляют, различимы со спутника.",
    caveat: "Марсоходы Spirit и Opportunity были рассчитаны на 90 суток, а проработали годы — во многом потому, что вихри время от времени чистили им панели. Единственный известный случай, когда погода чужой планеты продлила жизнь технике.",
    url: "https://science.nasa.gov/mars/",
  },
];

// Старые карточки зондов получают категории, а TIV заменён двумя точными карточками
// (TIV 1 и TIV 2) — одна обобщённая рядом с ними только повторяла бы их.
const PROBE_CAT = { sticknet: "station", dow: "radar", mesonet: "station", sonde: "air", hunters: "air", nexrad: "radar" };
const PROBE_ART = { sticknet: "stick", dow: "dow", mesonet: "mesonet" };
const PROBES_ALL = [
  ...PROBES.filter((x) => x.id !== "tiv").map((x) => ({ ...x, cat: PROBE_CAT[x.id] || x.cat, vart: PROBE_ART[x.id] === "stick" ? undefined : PROBE_ART[x.id] })),
  ...CHASERS.map((x) => (x.id === "tiv2" ? { ...x, photo: "tiv" } : x.id === "dow67" ? { ...x, photo: "dow" } : x)),
];

const STORM_CATS = [
  { id: "birth", label: "Как рождается" },
  { id: "kind",  label: "Виды смерчей" },
  { id: "false", label: "Похожее, но не то" },
  { id: "big",   label: "Большие вихри" },
];

const VIEWS = [
  { id: "sensors", label: "Рекомендуемые датчики" },
  { id: "probe",   label: "Свой зонд" },
  { id: "storm",   label: "Смерчи и ураганы" },
];

// ============================================================
// СПРОСИТЬ CLAUDE
// ============================================================
// Встроенный чат сделать нельзя, и причина не техническая, а денежная:
// обращение к модели требует ключа, а страницу отдаёт плата **любому в своей
// сети**, и её исходники лежат в публичном репозитории. Ключ, положенный в
// такой дашборд, публичен с первой минуты, и платить по нему будет владелец
// станции. Прокси через ESP32 не спасает: ключ всё равно оказался бы в прошивке,
// которая выкладывается бинарником.
//
// Поэтому кнопка открывает claude.ai с уже написанным вопросом и коротким
// описанием станции — тот же разговор, но без ключа в чужих руках.
const ASK_CONTEXT =
  "Я пользуюсь самодельной метеостанцией MyWindProbe: ESP32 с анемометром, " +
  "дашборд на React вшит в прошивку и раздаётся самой платой. Вкладки: " +
  "Основное, Метеорология, Радар (круговой обзор, конвективный профиль, роза " +
  "ветров, шкала Бофорта, карта мира, эфир), Район, Анализ (занятия, статистика, прогноз), Станция, Настройки. Вопрос: ";

const ASK_PRESETS = [
  "Как подключить датчик BME280 к моей станции и что для этого поменять в прошивке?",
  "Где в дашборде посмотреть порывы и как сбросить накопленный максимум?",
  "Что означает конвективный профиль и как понять, что подходит шквал?",
  "Какой анемометр выбрать вместо нынешнего, чтобы видеть слабый ветер?",
  "Как подключиться к станции с телефона, если она раздаёт свою сеть?",
];

function AskClaude({ g, accent }) {
  const [text, setText] = useState("");
  const open = (q) => {
    const url = "https://claude.ai/new?q=" + encodeURIComponent(ASK_CONTEXT + q);
    window.open(url, "_blank", "noopener");
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderLeft: `2px solid ${accent}`, padding: "12px 13px" }}>
      <div style={{
        fontFamily: SANS, fontWeight: 600, fontSize: 10, letterSpacing: 2.2,
        color: DIM, textTransform: "uppercase", marginBottom: 9,
      }}>
        Спросить Claude
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
        {ASK_PRESETS.map((q) => (
          <button key={q} onClick={() => open(q)} style={{
            background: "transparent", border: `1px solid ${LINE}`, color: DIM,
            fontFamily: SANS, fontSize: 10, letterSpacing: 0.3, textAlign: "left",
            padding: "5px 9px", cursor: "pointer", maxWidth: "100%",
          }}>
            {q}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) open(text.trim()); }}
          placeholder="свой вопрос о станции или о метеорологии"
          style={{
            flex: "1 1 220px", minWidth: 0, background: BG_VAR,
            border: `1px solid ${LINE}`, padding: "8px 10px",
            color: TEXT, fontSize: 11.5, fontFamily: SANS, outline: "none",
          }}
        />
        <button
          onClick={() => text.trim() && open(text.trim())}
          disabled={!text.trim()}
          style={{
            background: text.trim() ? "rgba(var(--ink, 231,238,246),0.10)" : "transparent",
            border: `1px solid ${text.trim() ? LINE_HI : LINE}`,
            color: text.trim() ? TEXT : FAINT,
            fontFamily: SANS, fontSize: 10.5, letterSpacing: 1,
            padding: "8px 14px", cursor: text.trim() ? "pointer" : "default",
            textShadow: text.trim() ? glow(g, 0.5) : "none",
          }}
        >
          ОТКРЫТЬ ↗
        </button>
      </div>

    </div>
  );
}

// ============================================================
// ГАЛЕРЕЯ
// ============================================================
// Один кадр на тип вводит в заблуждение: смерч одного и того же облика
// выглядит по-разному в зависимости от света, стадии и того, откуда
// смотрели. Отсюда несколько снимков и переключение между ними.
// Показывается всегда один — миниатюрами пришлось бы тянуть все сразу,
// а это четыре запроса наружу на каждую раскрытую карточку.
function Gallery({ ids, alt, ratio, g, accent }) {
  const list = (ids || []).filter((id) => PHOTOS[id]);
  const [i, setI] = useState(0);
  if (!list.length) return null;

  const n = list.length;
  const cur = ((i % n) + n) % n;
  const step = (d) => setI(cur + d);

  const arrow = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 26, height: 40, display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer",
    background: "rgba(4,7,10,0.62)", border: `1px solid ${LINE}`,
    color: TEXT, fontFamily: MONO, fontSize: 13, lineHeight: 1, padding: 0,
  };

  return (
    <div>
      <div style={{ position: "relative" }}>
        <Photo id={list[cur]} alt={alt} ratio={ratio} g={g} />
        {n > 1 && (
          <>
            <button onClick={() => step(-1)} aria-label="Предыдущий снимок"
                    style={{ ...arrow, left: 0 }}>‹</button>
            <button onClick={() => step(1)} aria-label="Следующий снимок"
                    style={{ ...arrow, right: 0 }}>›</button>
          </>
        )}
      </div>

      {n > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {list.map((id, k) => (
              <button key={id} onClick={() => setI(k)} aria-label={`Снимок ${k + 1}`}
                      style={{
                        flex: 1, height: 2, padding: 0, border: "none", cursor: "pointer",
                        background: k === cur ? accent : LINE_HI,
                        boxShadow: k === cur ? glow(g, 0.5) : "none",
                        transition: "background .34s ease",
                      }} />
            ))}
          </div>
          <span style={{ ...NUM, fontSize: 9, color: FAINT, whiteSpace: "nowrap" }}>
            {cur + 1} / {n}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// СПИСОК КАРТОЧЕК
// ============================================================
// Сетка стеклянных карточек: сверху «витрина» с большой иллюстрацией прибора
// (или фотографией), снизу название, тип и две главные цифры. Карточка раскрывается
// на всю ширину и показывает всё остальное. Каждая — настоящая панель (.pnl) со
// своим стеклом, поэтому и в Liquid Glass, и в «Тональной», и на светлом фоне она
// такая же, как остальные панели страницы; тёмной остаётся только сама витрина:
// приборы стоят на ней как под стеклом музея, а не растворяются в белом листе.
//
// Один компонент на все три раздела: строение карточек одинаковое, меняются
// только данные и набор фильтров.
const CAT_COLOR = {
  wind: "#7dd3fc", rain: "#60a5fa", air: "#34d399", sun: "#fbbf24", storm: "#c084fc",
  armor: "#fb923c", radar: "#38bdf8", station: "#34d399",
  birth: "#7dd3fc", kind: "#fb923c", false: "#fbbf24", big: "#c084fc",
};

const METEO_CSS = `
  .mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 14px; align-items: stretch }
  .mcard { padding: 0; overflow: hidden }
  .mcard.open { grid-column: 1 / -1 }
  .mc-head { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; height: 100%; width: 100%; padding: 8px 8px 12px; background: transparent !important;
    border: none !important; box-shadow: none !important; cursor: pointer; text-align: left; color: inherit; border-radius: 0 !important }
  .mc-head:hover:not(:disabled) { transform: none !important; background-image: none !important }
  .mcard.open .mc-head { height: auto; padding-bottom: 4px }
  .mcard.open .mc-name { font-size: 16px }
  .mc-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: calc(var(--pnl-corner, 22px) - 8px);
    background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--mc) 30%, transparent), #0d1525 58%, #060a12);
    box-shadow: inset 0 1px 0.5px rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.06);
    display: flex; align-items: center; justify-content: center; isolation: isolate }
  .mc-stage::before { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: .5;
    background: linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px) 0 0 / 100% 22px,
                linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px) 0 0 / 22px 100%;
    -webkit-mask: radial-gradient(ellipse at 50% 55%, #000 25%, transparent 75%); mask: radial-gradient(ellipse at 50% 55%, #000 25%, transparent 75%) }
  .mc-stage::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: 7%; height: 1px; z-index: 0;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--mc) 70%, #fff), transparent); opacity: .55 }
  .mc-stage > svg, .mc-stage > figure { position: relative; z-index: 1; transition: transform .6s var(--ease-liq, cubic-bezier(.34,1.5,.5,1)) }
  .mcard:hover .mc-stage > svg { transform: translateY(-3px) scale(1.05) }
  .mc-stage > figure { width: 100%; height: 100% }
  .mc-tag { position: absolute; z-index: 2; top: 9px; left: 9px; max-width: calc(100% - 18px); overflow: hidden; text-overflow: ellipsis; padding: 2px 9px; border-radius: 999px;
    font-family: var(--ui-mono); font-size: 9px; letter-spacing: .4px; color: #e9f1fa; white-space: nowrap;
    background: rgba(8,12,20,0.55); border: 1px solid rgba(255,255,255,0.2); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px) }
  .mc-body { padding: 11px 6px 0 6px; min-width: 0 }
  .mc-name { font-family: var(--ui-sans); font-size: 13.5px; font-weight: 700; line-height: 1.25; color: ${TEXT} }
  .mc-kind { font-family: var(--ui-sans); font-size: 11px; color: ${DIM}; margin-top: 3px; line-height: 1.4 }
  .mc-key { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px }
  .mc-key span { font-family: var(--ui-mono); font-size: 9.5px; padding: 3px 8px; border-radius: 999px; color: ${DIM};
    border: 1px solid ${LINE}; max-width: 100%; line-height: 1.35; text-align: left }
  .pnl.mcard > div.mc-more.mc-more { padding: 4px 18px 20px; display: grid; grid-template-columns: minmax(260px, 480px) minmax(0, 1fr); gap: 24px; align-items: start }
  @media (max-width: 820px) { .pnl.mcard > div.mc-more.mc-more { grid-template-columns: minmax(0, 1fr) } }
  .mc-more .mc-stage { aspect-ratio: 4 / 3 }
  .mc-sub { font-family: var(--ui-sans); font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: ${FAINT}; margin: 0 0 8px }
  .mc-link { display: inline-block; margin-top: 12px; padding: 7px 14px; border-radius: 999px; text-decoration: none; color: ${TEXT};
    font-family: var(--ui-sans); font-size: 10.5px; letter-spacing: .6px; border: 1px solid ${LINE_HI} }
  .mc-link:hover { background: rgba(var(--ink, 231,238,246), 0.08) }
  .mc-intro { padding: 16px 18px; margin-bottom: 14px }
  .mc-intro h3 { margin: 0 0 6px; font: 700 12px var(--ui-sans); letter-spacing: 1.6px; text-transform: uppercase; color: ${TEXT} }
  .mc-intro p, .mc-intro li { font-family: var(--ui-sans); font-size: 11.5px; line-height: 1.7; color: ${DIM}; margin: 0 }
  .mc-intro ul { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px }
  .mc-intro a { color: ${TEXT} }
  @media (prefers-reduced-motion: reduce) { .mc-stage > svg { transition: none } .mcard:hover .mc-stage > svg { transform: none } }
`;

// «Витрина»: иллюстрация (прибор или машина) либо фотография вместо неё.
function Stage({ it, color, g, size }) {
  const art = it.vart
    ? <VehicleArt kind={it.vart} accent={color} size={size} title={it.name} />
    : it.art
      ? <SensorArt kind={it.art} accent={color} size={size} title={it.name} />
      : null;
  return (
    <div className="mc-stage ink-dark" style={{ "--mc": color }}>
      {art || <Photo id={it.photo} alt={it.name} bare g={g} />}
      {it.tag && <span className="mc-tag">{it.tag}</span>}
    </div>
  );
}

function Cards({ items, cats, g, accent, motion, ratio }) {
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState(null);

  const list = useMemo(
    () => (cat === "all" ? items : items.filter((i) => i.cat === cat)),
    [cat, items]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {cats.length > 1 && (
        <div className="chip-row" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Segments variant="chips" ariaLabel="Категория" value={cat}
                    onChange={(id) => { setCat(id); setOpen(null); }}
                    options={[{ id: "all", label: "Все" }, ...cats].map((c) => ({ value: c.id, label: c.label }))} />
          <span className="chip-count" style={{ ...NUM, fontSize: 9.5, color: FAINT, alignSelf: "center", marginLeft: "auto", flex: "none", paddingLeft: 6 }}>
            {list.length} из {items.length}
          </span>
        </div>
      )}

      <div className="mgrid">
        {list.map((it, idx) => {
          const isOpen = open === it.id;
          const color = CAT_COLOR[it.cat] || accent;
          return (
            <article key={it.id} className={`pnl mcard${isOpen ? " open" : ""}${motion === "off" ? "" : " rowin"}`}
                     style={{
                       border: "1px solid var(--pnl-line)", borderRadius: "var(--pnl-corner)",
                       background: "var(--pnl-bg)", boxShadow: "var(--pnl-shadow)",
                       backdropFilter: "var(--pnl-blur)", WebkitBackdropFilter: "var(--pnl-blur)",
                       animationDelay: `${Math.min(idx * 30, 360)}ms`,
                     }}>
              <button className="mc-head" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen}>
                {!isOpen && <Stage it={it} color={color} g={g} size="fill" />}
                <div className="mc-body">
                  <div className="mc-name">{it.name}</div>
                  <div className="mc-kind">{it.kind}</div>
                  {!isOpen && (
                    <div className="mc-key">
                      {it.specs.slice(0, 2).map(([k, v]) => <span key={k} title={`${k}: ${v}`}>{v}</span>)}
                    </div>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className={`mc-more${motion === "off" ? "" : " rowin"}`} style={{ "--mc": color }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {(it.art || it.vart) ? (
                      <>
                        <Stage it={it} color={color} g={g} size="fill" />
                        {(it.photos || it.photo) && <Gallery ids={it.photos || [it.photo]} alt={it.name} ratio={ratio} g={g} accent={color} />}
                      </>
                    ) : (
                      <Gallery ids={it.photos || [it.photo]} alt={it.name} ratio={ratio} g={g} accent={color} />
                    )}
                  </div>
                  <div>
                    <div className="mc-sub">Характеристики</div>
                    <div style={{ marginBottom: 14 }}>
                      {it.specs.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0" }}>
                          <span style={{ color: DIM, fontFamily: SANS, fontSize: 11, flexShrink: 0 }}>{k}</span>
                          <span style={{ flex: 1, minWidth: 10, borderBottom: `1px dotted ${FAINT}`, transform: "translateY(-3px)" }} />
                          <span style={{ ...NUM, fontSize: 11, color: TEXT, textAlign: "right", maxWidth: "68%" }}>{v}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mc-sub">Зачем это</div>
                    <div style={{ color: DIM, fontSize: 12, lineHeight: 1.7, fontFamily: SANS }}>{it.why}</div>

                    {/* Оговорка обязательна у каждой карточки: у любого прибора
                        и у любого явления есть то, чего о них обычно не говорят. */}
                    <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 14,
                                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                                  border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
                                  color: DIM, fontSize: 11.5, lineHeight: 1.65, fontFamily: SANS }}>
                      <b style={{ color: TEXT, fontWeight: 600 }}>С оговоркой: </b>{it.caveat}
                    </div>

                    <a className="mc-link" href={it.url} target="_blank" rel="noreferrer noopener">
                      Подробнее у источника ↗
                    </a>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

const Intro = ({ title, children }) => (
  <aside className="pnl mc-intro" style={{
    border: "1px solid var(--pnl-line)", borderRadius: "var(--pnl-corner)", background: "var(--pnl-bg)",
    boxShadow: "var(--pnl-shadow)", backdropFilter: "var(--pnl-blur)", WebkitBackdropFilter: "var(--pnl-blur)",
  }}>
    <h3>{title}</h3>
    {children}
  </aside>
);

// ============================================================
// ВКЛАДКА
// ============================================================
export default function Meteorology({ g, accent, motion }) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("wind_ui_meteo") || "sensors"; } catch { return "sensors"; }
  });
  const pick = (id) => {
    setView(id);
    try { localStorage.setItem("wind_ui_meteo", id); } catch { /* приватный режим */ }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{METEO_CSS}</style>
      <div className="sub-row" style={{ display: "flex" }}>
        <Segments variant="tabs" ariaLabel="Раздел" value={view} onChange={pick}
                  options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} />
      </div>

      <div key={view} className={motion === "off" ? undefined : "tabfade"}>
        {view === "sensors" && (
          <Cards items={INSTRUMENTS} cats={CATS} g={g} accent={accent} motion={motion} ratio="4 / 3" />
        )}
        {view === "probe" && (
          <>
            <Intro title="Свой зонд">
              <p>
                Приборы, которые везут к погоде, а не ждут её на мачте. От переносной стойки,
                которую ставят на пути урагана за пять минут, до бронированной машины, заезжающей
                внутрь воронки. Общее у всех одно: данные надо снять раньше, чем прибор снесёт.
              </p>
            </Intro>
            <Cards items={PROBES_ALL} cats={CHASER_CATS} g={g} accent={accent} motion={motion} ratio="3 / 2" />
            <div style={{ height: 14 }} />
            <Intro title="Охота за штормами: коротко">
              <p>
                Это справочник, а не призыв: охота за штормами опасна и для профессионалов.
                Что советуют Национальная служба погоды США и опытные охотники:
              </p>
              <ul>{CHASE_NOTES.map((t) => <li key={t}>{t}</li>)}</ul>
              <p style={{ marginTop: 10 }}>
                Источники:{" "}
                <a href="https://www.weather.gov/spotterguide/safetyfirst" target="_blank" rel="noreferrer noopener">NWS Spotter Guide ↗</a>
                {" · "}
                <a href="https://www.weather.gov/media/pah/Skywarn/SafetyForMobileSpotters.pdf" target="_blank" rel="noreferrer noopener">памятка для мобильных наблюдателей ↗</a>
                {" · "}
                <a href="https://stormtrack.org/threads/chase-safety-tips-guidelines-near-tornado-environments.27380" target="_blank" rel="noreferrer noopener">StormTrack ↗</a>
              </p>
            </Intro>
          </>
        )}
        {view === "storm" && (
          <>
            <Intro title="Смерчи и ураганы">
              <p>
                Как рождается смерч, какие они бывают и что на них похоже, но ими не является.
                Последнее важнее, чем кажется: половина «смерчей» в сети — это гастнадо и пыльные
                вихри, а большинство ложных тревог вызвано шельфовым облаком, которое означает
                шквал, а не воронку.
              </p>
            </Intro>
            <Cards items={STORMS} cats={STORM_CATS} g={g} accent={accent} motion={motion} ratio="3 / 2" />
          </>
        )}
      </div>

      <AskClaude g={g} accent={accent} />

    </div>
  );
}
