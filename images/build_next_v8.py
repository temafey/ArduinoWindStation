# -*- coding: utf-8 -*-
"""Собирает ../wiring-v8-3.html — «что делать дальше» после разбора 2026-09-10.

Третья страница семейства v8, и у неё свой момент в жизни сборки:

  * wiring-v8.html   — как собрать (57 проводов, каждый подписан);
  * wiring-v8-2.html — куда тыкать щупом, когда собрано и не работает;
  * wiring-v8-3.html — ЭТА. Неисправность найдена, плата лежит рядом с макеткой
    и работает от USB. Вопрос ровно один: как вернуть её в макетку так, чтобы
    она работала и там.

Почему отдельная страница, а не абзац в первых двух. Найденная причина переворачивает
раскладку левого края: «колонки 1–4 держать пустыми» — формулировка, которой нельзя
пользоваться буквально, потому что в 1a стоит «5V» самой платы. Запрещены РАЗНЫЕ
колонки в разных банках, и пока это не сказано поимённо, правило исполняется наугад.

Вход:  images/next_v8.svg (генерится gen_next_v8_svg.py)
Выход: wiring-v8-3.html в корне проекта (SVG инлайном, без внешних файлов)
"""
import os

ROOT = r"C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation"
IMG = os.path.join(ROOT, "images")

with open(os.path.join(IMG, "next_v8.svg"), encoding="utf-8") as f:
    svg = f.read()

CSS = open(os.path.join(IMG, "_std_css.txt"), encoding="utf-8").read()

EXTRA_CSS = """
.wrap{max-width:1560px}
table.m{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
table.m th,table.m td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
table.m th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3);font-weight:700}
table.m td.n{color:var(--ink-3);font-weight:700;white-space:nowrap}
table.m td.pt{font-family:ui-monospace,Consolas,monospace;font-weight:700;color:var(--copper);white-space:nowrap}
table.m td.no{font-weight:700;color:var(--plus);white-space:nowrap}
table.m td.ok{font-weight:700;color:var(--ok);white-space:nowrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
@media(max-width:980px){.two{grid-template-columns:1fr}}
pre.cmd{margin:0;padding:16px 18px;overflow-x:auto;font-family:ui-monospace,Consolas,monospace;
  font-size:12.5px;line-height:1.62;color:var(--ink-2);white-space:pre;
  background:var(--card);border:1px solid var(--line);border-radius:12px}
pre.cmd b{color:var(--plus)}
pre.cmd i{font-style:normal;color:var(--ink-3)}
pre.cmd u{text-decoration:none;color:var(--ok);font-weight:700}
.stage{display:flex;align-items:baseline;gap:12px;margin:0 0 4px}
.stage .num{font-family:ui-monospace,Consolas,monospace;font-weight:700;font-size:13px;
  color:#fff;background:var(--copper);border-radius:6px;padding:2px 9px}
.stage h2{margin:0}
.verdict{display:inline-block;font-weight:700;font-size:12px;border-radius:6px;padding:2px 9px;
  color:#fff;background:var(--ok);margin-left:8px}
.verdict.no{background:var(--plus)}
"""

# ─────────────────────────────────────────── что осмотреть в запретной зоне
HOLES = [
    ("верх", "2", "CMD", "нога кристалла SPI-флеша"),
    ("верх", "3", "D3", "нога кристалла SPI-флеша"),
    ("верх", "4", "D2", "нога кристалла SPI-флеша"),
    ("низ", "1", "CLK", "нога кристалла SPI-флеша — тактовая, самая чувствительная"),
    ("низ", "2", "D0", "нога кристалла SPI-флеша"),
    ("низ", "3", "D1", "нога кристалла SPI-флеша"),
]

# ─────────────────────────────────────────── что в этой зоне стоять ДОЛЖНО
KEEP = [
    ("верх", "1", "5V", "питание платы: перемычка на «+» верхний рельс, "
     "<b>по диагонали в кол.3</b> — рельс начинается только там"),
    ("верх", "5", "GPIO13", "CHRG TP4056 (открытый сток, INPUT_PULLUP)"),
    ("верх", "6", "GND", "земля платы: на «−» верхний рельс, ЛЕВАЯ половина"),
    ("низ", "4–6", "15 · 2 · 0", "свободны и разрешены — но занимать их сейчас нечем"),
]

# ─────────────────────────────────────────── признаки в Serial и в API
SIGNS = [
    ("ok", "load:0x40078000,len:16560", "второй загрузчик прочитан целиком",
     "дальше пойдёт load:0x40080400 и entry 0x400805b4"),
    ("no", "load:0xd0012000,len:4140", "с флеша читается мусор",
     "адрес не из карты памяти вообще; следом обычно len со значением "
     "в два миллиарда и rst:0x7 (TG0WDT_SYS_RESET)"),
    ("no", "flash_parts: partition 0 invalid magic number 0x0",
     "таблица разделов прочиталась нулями",
     "0x8000 при этом на флеше цел — проверяется чтением обратно"),
    ("no", "Failed to set QIE bit", "чип флеша не отвечает на команду статуса",
     "в паре с предыдущим — это уже не «прошивка кривая»"),
    ("no", "Guru Meditation в trc_set_per_pkt_rate / MDNS.addService",
     "паника в НЕсвязанных подсистемах",
     "с крошечным EXCVADDR (0x1, 0x3) — признак битых страниц кода, а не бага в коде"),
    ("ok", "resetReason: poweron, uptime растёт", "обычное включение",
     "плитка «Аптайм» в дашборде ничего не дописывает к заголовку"),
    ("no", "resetReason: brownout", "просадка питания",
     "это НЕ макетка: смотреть банку, буст и провод 37f → 50b"),
]

hole_rows = "".join(
    '<tr><td class="n">%s</td><td class="pt">кол.%s</td><td class="no">%s</td><td>%s</td></tr>'
    % h for h in HOLES)
keep_rows = "".join(
    '<tr><td class="n">%s</td><td class="pt">кол.%s</td><td class="ok">%s</td><td>%s</td></tr>'
    % k for k in KEEP)
sign_rows = "".join(
    '<tr><td class="%s">%s</td><td class="pt">%s</td><td>%s</td><td>%s</td></tr>'
    % (s[0], "✓" if s[0] == "ok" else "⚠", s[1], s[2], s[3]) for s in SIGNS)

CMD80 = """<i># одним вызовом: импульс EN, сразу за ним запись. BOOT держать ВСЁ время.</i>
$p = New-Object System.IO.Ports.SerialPort <b>COM12</b>,115200
$p.Open(); $p.DtrEnable = $false
$p.RtsEnable = $true; Start-Sleep -Milliseconds 120; $p.RtsEnable = $false
Start-Sleep -Milliseconds 150; $p.Close()

&amp; "$env:LOCALAPPDATA\\Arduino15\\packages\\esp32\\tools\\esptool_py\\5.3.0\\esptool.exe" `
  --chip esp32 --port <b>COM12</b> --baud 115200 --before no-reset --after hard-reset `
  write-flash --flash-mode dio <u>--flash-freq 40m</u> --flash-size 4MB `
  0x1000  build\\esp32_wind_station.ino.bootloader.bin `
  0x8000  build\\esp32_wind_station.ino.partitions.bin `
  0xe000  "$env:LOCALAPPDATA\\Arduino15\\packages\\esp32\\hardware\\esp32\\3.3.10\\tools\\partitions\\boot_app0.bin" `
  0x10000 build\\esp32_wind_station.ino.bin"""

CMDCHK = """<i># что РЕАЛЬНО лежит на чипе: байт 3 заголовка, младший полубайт</i>
<i># 0 = 40 МГц, f = 80 МГц. Порт открыт без сброса — плата остаётся как есть.</i>
python -m esptool --chip esp32 --port <b>COM12</b> `
  --before no-reset read-flash <b>0x1000 4</b> header.bin
Format-Hex header.bin"""

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>v8 · что делать дальше</title>
<style>%s%s</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · схема v8 · 10 сентября 2026</div>
    <h1>Что делать дальше</h1>
    <p class="lede">Поиск неисправности закончен, и закончен доказательством, а не догадкой:
      плата, вынутая из макетки и воткнутая в USB-C, работает без единой паники. Значит
      искать больше нечего — осталось вернуть её в макетку так, чтобы она работала и там.
      Пять шагов, по одному за раз.</p>
    <div class="note ok" style="margin-top:14px"><i>✓</i><span><b>Ни плата, ни модем
      не виноваты, и менять их не надо.</b> ESP32 вне макетки: ноль паник, аптайм растёт,
      mDNS и OTA поднялись, аплинк вошёл в домашнюю сеть. Модем проверен отдельно, через
      свой USB: <b class="mono">CPIN: READY</b>, <b class="mono">CSQ 26</b>, регистрация
      в LTE, оператор ответил, адрес выдан. Обе железки исправны.</span></div>
    <div class="note warn" style="margin-top:10px"><i>⚠</i><span><b>Виновата была медь
      на макетке.</b> У 38-pin платы шесть ног кристалла SPI-флеша выведены на пины —
      и попадают в первые четыре колонки. Достаточно чего-то лишнего в одном отверстии,
      чтобы ёмкость линии выросла и быстрое чтение на 80&nbsp;МГц перестало
      попадать в такт. Медленная проверка через esptool при этом проходит: она читает
      совсем на другой скорости.</span></div>
  </header>

  <section>
    <div class="board">%s</div>
    <p class="hint">На картинке только то, что нужно для возврата платы: запретная зона,
      два провода питания, которые в ней стоять ДОЛЖНЫ, и три провода к модему, ставшему
      внешним модулем. Остальные 50 с лишним проводов схемы — в
      <b class="mono">wiring-v8.html</b>, они не менялись.</p>
  </section>

  <section>
    <h2>Почему это была макетка, а не прошивка</h2>
    <p class="sub">Цепочка улик — чтобы, если симптом вернётся, не начинать с нуля.</p>
    <div class="card"><table class="m">
      <tr><th>Улика</th><th>Что она означает</th></tr>
      <tr><td class="pt">verify-flash проходит,<br>а прошивка читает нули</td>
          <td>Байты на флеше <b>целы</b>. esptool читает их на своей медленной скорости
              и получает совпадение; работающий чип читает те же адреса на 80&nbsp;МГц
              (<b class="mono">clock div:1</b>) и получает мусор. Это целостность сигнала,
              а не битый кристалл.</td></tr>
      <tr><td class="pt">на 40&nbsp;МГц грузится,<br>на 80&nbsp;МГц нет</td>
          <td>Ровно то же самое, сказанное вторым способом: вдвое медленнее — и такт
              снова попадает.</td></tr>
      <tr><td class="pt">паники в НЕсвязанных<br>подсистемах</td>
          <td><b class="mono">trc_set_per_pkt_rate</b> в драйвере WiFi,
              <b class="mono">MDNS.addService</b> в mDNS — и обе с крошечным
              <b class="mono">EXCVADDR</b> (0x1, 0x3). Так выглядит исполнение битой
              страницы кода, а не ошибка в коде.</td></tr>
      <tr><td class="pt">erase-flash «за 0.0 с»</td>
          <td>Стереть 4&nbsp;МБ за ноль секунд нельзя. Чип не выполнял команду.</td></tr>
      <tr><td class="pt">вынули из макетки —<br>всё прошло</td>
          <td>Единственное изменение — плата перестала касаться макетки.
              Это и есть доказательство.</td></tr>
    </table></div>
  </section>

  <section>
    <div class="stage"><span class="num">1</span><h2>Перезалить по USB — новая таблица
      разделов; <b class="mono">40m</b> остаётся</h2></div>
    <p class="sub">Флеш на <b class="mono">40m</b> — это <b>осознанный запас, а не откат
      и не диагностический режим</b>. Повод, по которому частоту снизили, оказался ложным:
      виноват был бракованный модуль, а не медь макетки (разбор — в блоке «что уже известно»).
      Но возвращать 80&nbsp;МГц всё равно незачем: асимметрия последствий. У «40 оказалось
      мало» симптомов не бывает вовсе, а у «80 оказалось мало» они выглядят как
      <b class="mono">partition invalid magic</b> и паники в случайных местах — сутки отладки
      на ровном месте. Полоса шины падает вдвое, и на этой станции это незаметно: вся нагрузка
      упирается в радио и lwIP, а не во флеш.</p>
    <div class="note warn"><i>⚠</i><span><b>Тогда зачем вообще USB.</b> 2026-09-11 схема
      разделов сменена с <b class="mono">default</b> на <b class="mono">min_spiffs</b>:
      <b class="mono">app0</b> вырос с 1&nbsp;310&nbsp;720 до 1&nbsp;966&nbsp;080 байт, потому
      что PPP&nbsp;+&nbsp;TLS&nbsp;+&nbsp;MQTT из задачи 10 в остаток от 96&nbsp;%% не влезали.
      Таблица разделов лежит по <b class="mono">0x8000</b>, и <b>OTA её не переписывает</b> —
      сменить можно только кабелем и ровно один раз.</span></div>
    <div class="note warn" style="margin-top:10px"><i>⚠</i><span><b>И ровно поэтому в команде
      обязан стоять <b class="mono">40m</b>.</b> Частота шины флеша лежит в заголовке образа
      загрузчика по адресу <b class="mono">0x1000</b> — в том самом блоке, который эта заливка
      пишет. OTA заголовок не трогает, так что настройка живёт вечно, но <b>любая запись
      0x1000 молча ставит то, что написано в этой строке</b>. До 2026-09-11 здесь стояло
      <b class="mono">80m</b>, и выполнение команды буквально откатывало плату назад.</span></div>
    <p class="sub" style="margin-top:14px">Автосброс на этой плате не работает — мешает
      электролит в цепи питания. Поэтому: <b>зажать BOOT и держать всё время</b>, EN даётся
      импульсом из скрипта, и импульс с записью идут <b>одним вызовом</b> — каждый отдельный
      запуск esptool закрывает порт, и плата выпадает из download mode.</p>
    <pre class="cmd">%s</pre>
    <div class="note info" style="margin-top:12px"><i>●</i><span>Порт <b class="mono">COM12</b>
      — тот, что был у CP2102 в прошлый раз; проверить актуальный:
      <b class="mono">Get-CimInstance Win32_PnPEntity | ? Name -match 'CP210'</b>.
      Большой образ (1.26&nbsp;МБ) пишется <b>только со стабом</b> —
      <b class="mono">--no-stub</b> на нём срывается. Успех выглядит как
      <b class="mono">Hash of data verified</b> на каждом из четырёх адресов.</span></div>
    <div class="note warn" style="margin-top:10px"><i>⚠</i><span>Записывать
      <b class="mono">merged.bin</b> по <b class="mono">0x0</b> нельзя — он затирает
      <b class="mono">nvs</b>. Только по-адресно, как в команде выше.</span></div>
    <div class="note ok" style="margin-top:10px"><i>✓</i><span>Если после этого плата
      <b>вне макетки</b> нормально грузится на 80&nbsp;МГц — модуль здоров на полной
      скорости, и последнее сомнение в самой плате снято.</span></div>
  </section>

  <section>
    <div class="stage"><span class="num">2</span><h2>Осмотреть шесть отверстий</h2></div>
    <p class="sub">Плата ещё вынута — другого такого удобного момента не будет.</p>
    <div class="note warn"><i>⛔</i><span><b>«Колонки 1–4 держать пустыми» — так говорить
      нельзя.</b> В <b class="col">1a</b> стоит «5V» самой платы, и опустошить эту колонку
      значит обесточить станцию. Запрещены <b>разные колонки в разных банках</b>, и вот
      они поимённо.</span></div>
    <div class="card" style="margin-top:14px"><table class="m">
      <tr><th>Банк</th><th>Колонка</th><th>Что там</th><th>Почему нельзя</th></tr>%s
    </table></div>
    <h3 style="margin:22px 0 0;font-size:15px">А это в той же зоне стоять ДОЛЖНО</h3>
    <div class="card" style="margin-top:8px"><table class="m">
      <tr><th>Банк</th><th>Колонка</th><th>Что там</th><th>Куда идёт</th></tr>%s
    </table></div>
    <h3 style="margin:22px 0 0;font-size:15px">Что искать</h3>
    <div class="two" style="margin-top:10px">
      <div class="card">
        <p style="margin:0;font-size:14px;line-height:1.55;color:var(--ink-2)">
          Обломок ножки резистора или диода. Хвост перемычки, ушедший в соседнюю дырку
          мимо своей. Капля припоя или волосок медной жилы поперёк колонок. Перемычка,
          оставшаяся от раскладки под старую 30-pin плату — на ней этих контактов
          не было вовсе, и место считалось свободным.</p>
      </div>
      <div class="card">
        <p style="margin:0;font-size:14px;line-height:1.55;color:var(--ink-2)">
          <b>Светить сбоку и вдоль платы</b>: сверху занятая дырка выглядит пустой.
          <b>Доставать пинцетом, не проводом</b> — провод протолкнёт мусор глубже.
          Разношенная пружина считается тоже: у этой макетки такое уже было причиной
          отказа (июль, F1 — деталь стояла, контакта не было).</p>
      </div>
    </div>
  </section>

  <section>
    <div class="stage"><span class="num">3</span><h2>Вставить плату</h2></div>
    <ol class="steps">
      <li><span><b>USB-разъёмом влево</b>, как на картинке. «5V» — первый контакт от
        разъёма, он идёт в <b class="col">кол.1, ряд a</b>.</span></li>
      <li><span>Давить <b>равномерно за оба края</b>, не за середину модуля: у ESP-32U
        сверху экран, а не текстолит.</span></li>
      <li><span>Проверить, что плата села <b>от самой первой колонки</b>, а не со сдвигом
        на одну. Сдвиг на колонку — это ровно тот случай, когда «5V» уезжает на CMD.</span></li>
      <li><span>Перемычка «5V» идёт <b>по диагонали</b> в <b class="col">кол.3</b> рельса
        «+»: рельсы этой макетки короче банка на две колонки с каждой стороны, и отверстия
        прямо над «5V» просто нет.</span></li>
      <li><span>Антенна на <b class="mono">u.FL</b> — на месте. У ESP-32U печатной антенны
        нет, без пигтейла плата почти не передаёт.</span></li>
    </ol>
  </section>

  <section>
    <div class="stage"><span class="num">4</span><h2>Включить БЕЗ модема и посмотреть
      пять минут</h2></div>
    <p class="sub">Модем на этом шаге не подключать вообще. Один шаг — одно изменение,
      иначе виноватого снова придётся искать вычитанием.</p>
    <div class="card"><table class="m">
      <tr><th></th><th>Строка</th><th>Что означает</th><th>Подробность</th></tr>%s
    </table></div>
    <div class="note info" style="margin-top:12px"><i>●</i><span>Serial на
      <b class="mono">115200</b>; в рабочей строке телеметрии смотреть
      <b class="mono">loopMax</b> (единицы мс — норма, десятки означают, что что-то блокирует)
      и <b class="mono">sseDrop</b>. По сети то же самое видно в
      <b class="mono">/api/data</b> без кабеля.</span></div>
    <div class="note ok" style="margin-top:10px"><i>✓</i><span><b>Пять минут без паник —
      шаг пройден.</b> Тогда причина действительно была в запретной зоне, и её больше
      нет.</span></div>
  </section>

  <section>
    <div class="stage"><span class="num">5</span><h2>Только теперь — модем</h2></div>
    <p class="sub">Он стал внешним модулем: питается от своего micro-USB и в макетку
      не садится. Это меняет две вещи, которых не было, пока он сидел штырями в ряду a.</p>
    <div class="note warn"><i>⛔</i><span><b>«Плюс» модема не брать с пина «5V» платы.</b>
      Там питание самой ESP32, а модем в передаче просит до 2&nbsp;А импульсом —
      плата уйдёт в brownout, и это будет выглядеть как «опять не грузится».</span></div>
    <div class="note warn" style="margin-top:10px"><i>⚠</i><span><b>Провод общей земли —
      обязательная деталь, а не «на всякий случай».</b> Два источника без общего минуса
      не имеют общего нуля, и UART молчит при совершенно живом модеме: в этой сессии
      <b class="mono">/api/at</b> честно показывал <b class="mono">total=0</b> на любой паре
      пинов, пока D5 модема весело мигал. <b>Ставить землю первой, снимать последней.</b></span></div>
    <div class="card" style="margin-top:14px"><table class="m">
      <tr><th>Провод</th><th>Со стороны модема</th><th>Со стороны макетки</th><th>Замечание</th></tr>
      <tr><td class="ok">земля</td><td class="pt">«2 · G» CN101</td>
          <td class="pt">«−» верхний рельс, ПРАВАЯ половина (кол.44)</td>
          <td>Правая — намеренно: левая половина (до разреза 31↔32) держит опору АЦП,
              и токи модема через неё гнать нельзя. Там же берёт землю
              <b class="mono">gnd_bond</b> в схеме v8.</td></tr>
      <tr><td class="ok">данные</td><td class="pt">«5 · T» (TXD модема)</td>
          <td class="pt">GPIO25</td>
          <td>Это <b>вход</b> платы. В прошивке — <b class="mono">Serial2.begin(115200,
              SERIAL_8N1, 25, 27)</b>, порядок аргументов <b class="mono">(rx, tx)</b>.</td></tr>
      <tr><td class="ok">данные</td><td class="pt">«6 · R» (RXD модема)</td>
          <td class="pt">GPIO27</td>
          <td>Буквы на плате и имена пинов намеренно НЕ совпадают: TX платы идёт
              в RXD модема.</td></tr>
    </table></div>
    <div class="note warn" style="margin-top:12px"><i>⚠</i><span><b>GPIO26 не занимать
      ничем.</b> Он лежит ровно между двумя проводами UART. Это уже третий расклад для
      одной и той же пары: v6 рисовалась под 27/26, на 30-pin косичка легла на 26/25,
      на 38-pin — на 27/25. Каждый раз выигрывала медь, а не рисунок; воткнутое в 26
      разведёт пару снова.</span></div>
    <div class="note info" style="margin-top:10px"><i>●</i><span>Проверка связи —
      <b class="mono">/api/at?cmd=AT%%2BCSQ</b> (<b class="mono">+</b> обязан быть
      <b class="mono">%%2B</b>). В трейлере смотреть <b class="mono">total</b>: ноль при
      живом модеме — это провода или скорость, а не прошивка. Прибавка ровно
      <b>+1</b> после <b class="mono">?pins=</b> не считается — это ложный фронт при
      переоткрытии UART, а не принятый байт.</span></div>
  </section>

  <section>
    <h2>Проверить, что на чипе действительно 40&nbsp;МГц</h2>
    <p class="sub">Единственный способ узнать это наверняка — прочитать заголовок с самого
      чипа. Догадаться по поведению нельзя: на 80&nbsp;МГц исправная плата тоже грузится.</p>
    <pre class="cmd">%s</pre>
    <div class="note info" style="margin-top:12px"><i>●</i><span>В выводе смотреть
      <b>четвёртый байт</b>. Младший полубайт <b class="mono">0</b> — 40&nbsp;МГц,
      <b class="mono">f</b> — 80&nbsp;МГц. Если там <b class="mono">f</b>, значит какая-то
      заливка прошла со старой строкой <b class="mono">80m</b> — перезалить командой
      из шага&nbsp;1.</span></div>
    <div class="note warn" style="margin-top:10px"><i>⚠</i><span><b>Если плата не грузится
      вовсе</b> — вопрос не в частоте. Сначала сравнить её с заведомо исправным модулем
      <b>в тех же отверстиях</b>: именно этот шаг 2026-09-10 закрыл версию «медь макетки»
      и указал на бракованный модуль. Дальше — питание
      (<b class="mono">resetReason: brownout</b>), вставка платы со сдвигом на колонку,
      контакт в кол.1.</span></div>
  </section>

  <section>
    <h2>Что осталось не сделанным</h2>
    <p class="sub">Честный список — чтобы не считать это законченным.</p>
    <div class="card"><table class="m">
      <tr><th>Что</th><th>Состояние</th></tr>
      <tr><td>Провод <b class="col">37f → 50b</b> (адаптер → IN+ TP4056)</td>
          <td>не припаян; поэтому <b class="mono">powerSource</b> показывает
              <b class="mono">battery</b> при живом адаптере, и банка не заряжается</td></tr>
      <tr><td>Банка 18650</td><td>высажена в ноль в августе; под нагрузкой такая читается
          как «напряжение есть», а плата всё равно падает</td></tr>
      <tr><td>F1 (PPTC)</td><td>вместо него с июля стоит перемычка — цепь сейчас
          <b>без защиты по току</b></td></tr>
      <tr><td>Питание модема</td><td>решено, что от своего micro-USB; постоянного
          источника для мачты пока нет — это задача
          <b class="mono">tasks/10</b> и <b class="mono">tasks/11</b></td></tr>
    </table></div>
  </section>
</div>
</body>
</html>
""" % (CSS, EXTRA_CSS, svg, CMD80, hole_rows, keep_rows, sign_rows, CMDCHK)

out = os.path.join(ROOT, "wiring-v8-3.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
