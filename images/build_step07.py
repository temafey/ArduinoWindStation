# -*- coding: utf-8 -*-
import base64, os, json, mimetypes

# ─────────────────────────────────────────────────────────────────────────────
# ⚠ УСТАРЕЛ (2026-07-17). Делитель сигнала: верх 10k+5k послед. (=15 кОм, ratio 2.5).
# Канон — committed ../step07-sensor.html (правлен ВРУЧНУЮ). Скрипт требует фото-ассеты (PHOTO)
# и НЕ запускается как есть; committed HTML — источник истины. Не регенерировать вслепую.
# ─────────────────────────────────────────────────────────────────────────────

ROOT = r"C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation"
IMG  = os.path.join(ROOT, "images")

def datauri(fn):
    p = os.path.join(IMG, fn)
    mt = mimetypes.guess_type(p)[0] or "image/jpeg"
    with open(p, "rb") as f:
        return "data:%s;base64,%s" % (mt, base64.b64encode(f.read()).decode())

PHOTO = {
    "boost1":     ["boost-модуль-MT3608.jpg"],
    "esp32":      ["esp32-devkit-v1-30pin.jpg"],
    "provoda":    ["dupont-провода-MM.jpg"],
    "multimeter": ["мультиметр-UNI-T-UT33A+.jpg"],
}

PARTS = {
    "boost1": {
        "name": "Mini Boost #1 · 12 В (для датчика)",
        "sub": "пресет 12 В — пады A и B замкнуты (1 1)",
        "note": "Тот же модуль HW-085/MT3608, что Boost#2, но на пресете 12 В (оба пада A/B замкнуты припоем — с завода так и есть). Вход IN+/IN− — от рельса LOAD ~4.7 В (тот же, что VIN ESP32). Выход OUT+/OUT− = 12 В для датчика. Ток датчика 25 мА, модуль тянет ~0.5 А — запас огромный. ВАЖНО: вход должен быть МЕНЬШЕ выхода (4.7 < 12) — нельзя подавать 12 В на вход.",
        "kind": "info",
    },
    "esp32": {
        "name": "ESP32 DevKit V1 — GPIO34 / GPIO35",
        "sub": "входы делителей скорости и направления",
        "note": "GPIO34 = скорость, GPIO35 = направление (оба ADC1, только вход). Сигнал датчика 0–5 В приходит на делители 10k+5k/10k (задача 06) и уже как 0–2 В попадает на эти пины. В прошивке скорость = V_датч/5 × 60 м/с, направление = /5 × 360°.",
        "kind": "info",
    },
    "provoda": {
        "name": "Провода датчика · 4 шт",
        "sub": "VCC / GND / скорость / направление",
        "note": "У датчика 4 провода. ЦВЕТА СВЕРЬ С ИНСТРУКЦИЕЙ ЕГО датчика: VCC обычно красный, GND обычно чёрный, но не гарантия. VCC → OUT+ Boost#1 (12 В), GND → «−» рельс (общая земля), сигнал скорости → кол. 52, сигнал направления → кол. 16. Перепутаешь VCC/GND — спалишь датчик.",
        "kind": "info",
    },
    "multimeter": {
        "name": "Мультиметр UNI-T UT33A+",
        "sub": "проверка 12 В ДО подключения датчика",
        "note": "Позиция V⎓. Красный щуп на OUT+ Boost#1, чёрный на OUT− (GND). Должно быть 11.5–12.5 В — проверь ОБЯЗАТЕЛЬНО до того, как подключишь датчик. Нет 12 В → проверь пады A/B на Boost#1 (задача 02).",
        "kind": "ok",
    },
}

for k, v in PARTS.items():
    v["photos"] = [datauri(fn) for fn in PHOTO[k]]

with open(os.path.join(IMG, "step07_sensor.svg"), encoding="utf-8") as f:
    svg = f.read()

# полная сборка 01–07 (итоговая проверка внизу страницы)
with open(os.path.join(IMG, "full_station.svg"), encoding="utf-8") as f:
    full_svg = f.read()

HOTS = [
    ("boost1",    110, 632, 190, 150),   # Boost#1 module
    ("esp32",      80, 316, 262, 160),   # ESP32 body
    ("esp32",     250, 306,  36,  20),   # GPIO34/35 pads
    ("multimeter",343, 596, 190,  20),   # OUT+ 12V probe
    ("provoda",   430, 620, 380,  30),   # sensor pads / wires
]
hot_svg = '<g class="hots">\n' + "\n".join(
    '<rect class="hot" data-part="%s" x="%d" y="%d" width="%d" height="%d" rx="6"><title>Нажми — фото детали</title></rect>' % h
    for h in HOTS
) + "\n</g>\n"

svg_with_hots = svg.rstrip()
assert svg_with_hots.endswith("</svg>")
svg_inline = svg_with_hots[:-len("</svg>")] + hot_svg + "</svg>"

CHIP_ORDER = ["boost1", "esp32", "multimeter", "provoda"]
CHIP_LABEL = {
    "boost1": "Boost#1 · 12 В",
    "esp32": "ESP32 · GPIO34/35",
    "multimeter": "Мультиметр",
    "provoda": "Провода датчика",
}
chips = "".join(
    '<button class="chip" data-part="%s"><img src="%s" alt="%s"><span>%s</span></button>'
    % (k, PARTS[k]["photos"][0], CHIP_LABEL[k], CHIP_LABEL[k])
    for k in CHIP_ORDER
)

CSS = open(os.path.join(os.path.dirname(__file__),"_std_css.txt"),encoding="utf-8").read()

STEPS = """
      <li><span><b class="ref">Boost#1</b> (пады A и B замкнуты припоем = 12 В, проверено в задаче 02): <b>IN+</b> → «+» ВЕРХНИЙ рельс (LOAD, тот же, что VIN ESP32), <b>IN−</b> → «−» рельс.</span></li>
      <li><span><b>До подключения датчика</b> проверь мультиметром: <b>OUT+ Boost#1 = 11.5–12.5 В</b>. Нет 12 В → проверь пады A/B (задача 02).</span></li>
      <li><span><b>Выключи питание.</b> Подключи 4 провода датчика (цвета сверь с инструкцией ЕГО датчика):<br>
        • <b class="ref">VCC</b> (обычно красный) → <b>OUT+ Boost#1 (+12 В)</b><br>
        • <b>GND</b> (обычно чёрный) → «−» рельс (та же земля, что ESP32)<br>
        • <b>сигнал скорости</b> → кол. <b class="col">52</b> (вход делителя скорости)<br>
        • <b>сигнал направления</b> → кол. <b class="col">16</b> (вход делителя направления)</span></li>
      <li><span>Подай питание. Подуй на чашки / поверни флюгер — датчик должен свободно вращаться.</span></li>
      <li><span>Открой <b class="mono">http://192.168.1.223/api/data</b> — поля <b class="mono">"speed"</b> и <b class="mono">"direction"</b> показывают реальные значения.</span></li>
"""

NOTES = """
      <div class="note warn"><i>⚠</i><span><b>Boost#1 = 12 В: НИКОГДА не подавай 12 В на его вход.</b> Вход должен быть меньше выхода — это LOAD 4.7 В, всё правильно. Перепутаешь вход/выход модуля — сгорит.</span></div>
      <div class="note warn"><i>⚠</i><span><b>Цвета проводов датчика сверь с ЕГО инструкцией.</b> Красный = VCC, чёрный = GND — обычно, но не гарантия. Перепутаешь VCC / GND — спалишь датчик.</span></div>
      <div class="note warn"><i>⚠</i><span><b>GND датчика — на общий «−» рельс</b> (та же земля, что ESP32 и делители). Без общей земли АЦП намеряет мусор.</span></div>
      <div class="note ok"><i>✓</i><span>Без датчика: оба ADC ≈ 0 → LED <b>ОШИБКА</b> (GPIO33) горит, <span class="mono">adcError:true</span> — это норма. С подключённым датчиком LED гаснет, <span class="mono">"speed"</span>/<span class="mono">"direction"</span> оживают.</span></div>
      <div class="note info"><i>→</i><span>Датчик показывает 0 при поданном питании → нет 12 В (проверь пады Boost#1) или перепутан сигнал/GND. Дальше — задача 08: монтаж в корпус (гермовводы PG7, термоклей).</span></div>
"""

SCRIPT = open(os.path.join(os.path.dirname(__file__),"_std_script.txt"),encoding="utf-8").read()

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Задача 07 — датчик ветра + 12 В · метеостанция</title>
<style>%s</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · задача 07</div>
    <h1>Датчик ветра + питание 12 В (Boost#1)</h1>
    <p class="lede">Датчику нужно 12 В — их даёт <b>Boost#1</b> из рельса LOAD (4.7 В). Датчик выдаёт 0–5 В (скорость и направление) → делители из задачи 06 → GPIO34 / GPIO35. Общая земля — обязательна. <b>Нажми на любую деталь на схеме</b>, чтобы увидеть её фото.</p>
  </header>

  <section>
    <div class="board">%s</div>
    <p class="hint">Детали кликабельны. Датчик — внешний (на мачте), заходит кабелем через гермоввод PG7 (задача 08). На узком экране схему можно прокрутить вбок.</p>
  </section>

  <section>
    <h2>Детали для этого шага</h2>
    <p class="sub">Нажми на карточку — откроется фото и что важно не перепутать.</p>
    <div class="strip">%s</div>
  </section>

  <section>
    <h2>Порядок монтажа</h2>
    <p class="sub">Сначала подай и проверь 12 В от Boost#1 — только потом подключай датчик.</p>
    <ol class="steps">%s</ol>
  </section>

  <section>
    <h2>Проверка и что не перепутать</h2>
    <div class="notes">%s</div>
  </section>

  <section>
    <h2>Полная сборка (задачи 01–07) — проверь всё вместе</h2>
    <p class="sub">Вся станция на одной макетке: питание diode-OR (04) + делитель батареи → GPIO32 (05) + сигнальные делители → GPIO34/35 (06) + датчик на 12&nbsp;В от Boost#1 (07). Boost#1 и датчик — правым кластером у SW1. Полная таблица монтажа 0–15 и предупреждения — прямо на схеме.</p>
    <div class="board">%s</div>
    <p class="hint">Итоговая проверочная схема всей собранной части. На узком экране прокрути вбок.</p>
  </section>
</div>

<div class="veil" id="veil" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="pics" id="mpics"></div>
    <div class="body">
      <h3 id="mname"></h3>
      <p class="msub" id="msub"></p>
      <p class="mnote" id="mnote"></p>
      <button class="x" id="mx">Закрыть</button>
    </div>
  </div>
</div>

<script>%s</script>
</body>
</html>
""" % (CSS, svg_inline, chips, STEPS, NOTES, full_svg,
       SCRIPT.replace("__PARTS__", json.dumps(PARTS, ensure_ascii=False)))

out = os.path.join(ROOT, "step07-sensor.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8"))/1024))
