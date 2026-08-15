# -*- coding: utf-8 -*-
import base64, os, json, mimetypes
ROOT = r"C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation"
IMG  = os.path.join(ROOT, "images")

def datauri(fn):
    p = os.path.join(IMG, fn)
    mt = mimetypes.guess_type(p)[0] or "image/jpeg"
    with open(p, "rb") as f:
        return "data:%s;base64,%s" % (mt, base64.b64encode(f.read()).decode())

PHOTO = {
    "esp32":   ["esp32-devkit-v1-30pin.jpg"],
    "c2":      ["конденсаторы-керамические-набор.jpg"],
    "leds":    ["led-5mm-три-цвета.jpg"],
    "diode":   ["диоды-набор-8-типов.jpg"],
    "c1":      ["конденсатор-электролит-JCCON-1000uF-16V.jpg"],
    "f1":      ["предохранитель-PPTC-radial.jpg"],
    "sw1":     ["тумблер-выключатель-IO.jpg"],
    "j1":      ["разъём-USB-C-панельный.jpg"],
    "tp4056":  ["TP4056-type-c-с-защитой.jpg"],
    "boost2":  ["boost-модуль-MT3608.jpg"],
    "battery": ["аккумулятор-18650-LG.jpg"],
}

PARTS = {
    "esp32": {"name":"ESP32 DevKit V1 (30-pin)","sub":"питается через VIN (~4.7 В), не по USB",
        "note":"На схеме — точная распиновка DOIT DevKit V1. VIN (1-й пин верхнего ряда) подсвечен оранжевым кольцом — сюда приходит «+» с верхнего рельса (LOAD). GND рядом — на «−» рельс. В рабочем режиме USB отключён.","kind":"info"},
    "c2": {"name":"Конденсатор 100 нФ (C2)","sub":"«104», керамика, у VIN","note":"Развязка по питанию у VIN: кол.17 → «+» верх, кол.19 → «−» верх. Полярности нет.","kind":"info"},
    "leds": {"name":"Светодиоды (задача 01)","sub":"уже собраны — контекст","note":"5 индикаторных LED с задачи 01 показаны приглушённо. В этой задаче их не трогаем.","kind":"info"},
    "diode": {"name":"Диод Шоттки 1N5819 · ×2","sub":"D1 и D2 — diode-OR","note":"Полоска (катод) ОБОИХ диодов — вправо, к «+» шине. D1 от адаптера, D2 от Boost#2 — их катоды сходятся на шину. Перепутаешь полоску — питания на шине не будет.","kind":"warn"},
    "c1": {"name":"Электролит 1000 мкФ / 16 В (C1)","sub":"полярный! сглаживает шину","note":"Длинная ножка «+» → кол.38 → «+» рельс; светлая полоса «−» → кол.40 → «−» рельс. Наоборот — вздуется/хлопнет.","kind":"warn"},
    "f1": {"name":"F1 · PPTC 2A","sub":"предохранитель батареи","note":"Между батареей «+» и TP4056 B+. Точка ПОСЛЕ него (кол.46) = TP_B+ — отсюда в задаче 05 пойдёт делитель батареи.","kind":"info"},
    "sw1": {"name":"Выключатель SW1","sub":"клавишный (O/I), на проводах","note":"Разрывает «+» между нижним рельсом (ШИНА) и верхним (LOAD → VIN). Вне платы, на проводах. Положение I — питание подано, O — выключено.","kind":"info"},
    "j1": {"name":"USB-C адаптер 5 В","sub":"панельный, от сети","note":"Основной источник при наличии сети: «+5В» → кол.22, «GND» → «−» рельс. Через D1 питает шину.","kind":"info"},
    "tp4056": {"name":"TP4056 Type-C (чёрный)","sub":"заряд + защита DW01A","note":"Заряжает батарею и отдаёт её на OUT+. B− — ОТДЕЛЬНОЙ перемычкой на минус батареи (не на общий рельс!). IN−/OUT− — на «−» рельс.","kind":"warn"},
    "boost2": {"name":"Mini Boost #2 → 5.14 В","sub":"поднимает батарею до 5 В","note":"TP4056 OUT+ → IN+; OUT+ (5.14 В) → D2 → шина. Нужен, потому что без него шина просела бы (dropout AMS1117) и ESP32 ушёл бы в brownout.","kind":"info"},
    "battery": {"name":"2×18650 LG HG2 · параллель","sub":"~3.95 В, 6000 мАч (задача 03 ✓)","note":"«+» пакета → кол.44 (через F1 → TP4056 B+). «−» пакета → TP4056 B− своей перемычкой. Напрямую на шину нельзя — 3.95 В на VIN уронят ESP32.","kind":"ok"},
}
for k,v in PARTS.items():
    v["photos"] = [datauri(fn) for fn in PHOTO[k]]

with open(os.path.join(IMG, "step04_power_rail.svg"), encoding="utf-8") as f:
    svg = f.read()

HOTS = [
    ("esp32",   80,316,262,160),
    ("esp32",   82,306, 22, 20),   # VIN pad (подсвечен)
    ("c2",     356,344, 44, 20),
    ("leds",   406,286,620, 42),
    ("diode",  455,412, 60, 26),   # D1
    ("diode",  591,412, 60, 26),   # D2
    ("c1",     709,374, 50, 54),
    ("f1",     814,382, 44, 36),
    ("sw1",   1190,326,150, 80),
    ("j1",     580,650,150,150),
    ("tp4056",  90,650,220,150),
    ("boost2", 350,650,190,150),
    ("battery",760,650,595,205),
]
hot_svg = '<g class="hots">\n' + "\n".join(
    '<rect class="hot" data-part="%s" x="%d" y="%d" width="%d" height="%d" rx="6"><title>Нажми — фото детали</title></rect>' % h
    for h in HOTS) + "\n</g>\n"
svg_wh = svg.rstrip()
assert svg_wh.endswith("</svg>")
svg_inline = svg_wh[:-len("</svg>")] + hot_svg + "</svg>"

CHIP_ORDER = ["esp32","tp4056","boost2","j1","diode","c1","c2","f1","sw1","battery","leds"]
CHIP_LABEL = {"esp32":"ESP32 · VIN","tp4056":"TP4056","boost2":"Boost #2 (5 В)","j1":"USB-C адаптер",
    "diode":"D1/D2 · 1N5819","c1":"C1 · 1000 мкФ","c2":"C2 · 100 нФ","f1":"F1 · PPTC",
    "sw1":"Тумблер SW1","battery":"2×18650","leds":"LED (01)"}
chips = "".join(
    '<button class="chip" data-part="%s"><img src="%s" alt="%s"><span>%s</span></button>'
    % (k, PARTS[k]["photos"][0], CHIP_LABEL[k], CHIP_LABEL[k]) for k in CHIP_ORDER)

CSS = open(os.path.join(os.path.dirname(__file__),"_std_css.txt"),encoding="utf-8").read()

STEPS = """
      <li><span>Адаптер <b class="ref">«+5В»</b> → колонка <b class="col">22</b>. Адаптер <b class="ref">«GND»</b> → «−» нижний рельс.</span></li>
      <li><span>TP4056 <b class="ref">IN+</b> → колонка <b class="col">22</b> (та же, что адаптер). <b class="ref">IN−</b> → «−» рельс.</span></li>
      <li><span><b class="ref">D1</b>: анод кол. <b class="col">22</b>, катод (полоска) кол. <b class="col">25</b> → перемычка кол. 25 на «+» нижний рельс.</span></li>
      <li><span>Батарея «+» → кол. <b class="col">44</b> → <b class="ref">F1 PTC</b> → кол. <b class="col">46</b> → TP4056 <b class="ref">B+</b>. Батарея «−» → TP4056 <b class="ref">B−</b> <b>своей перемычкой (НЕ на рельс!)</b>.</span></li>
      <li><span>TP4056 <b class="ref">OUT+</b> → Boost #2 <b class="ref">IN+</b>. B−, OUT−, IN−/OUT− Boost → «−» рельс.</span></li>
      <li><span>Boost #2 <b class="ref">OUT+</b> → кол. <b class="col">30</b>. <b class="ref">D2</b>: анод кол. 30, катод кол. <b class="col">33</b> → «+» нижний рельс.</span></li>
      <li><span><b class="ref">C1 1000 мкФ</b>: «+» кол. <b class="col">38</b> → «+» рельс; «−» кол. <b class="col">40</b> → «−» рельс.</span></li>
      <li><span>«+» нижний рельс → <b class="ref">SW1</b> → «+» верхний рельс (LOAD).</span></li>
      <li><span>ESP32 <b class="ref">VIN</b> → «+» верхний рельс. <b class="ref">C2 100 нФ</b>: кол. <b class="col">17</b> → «+» верх, кол. <b class="col">19</b> → «−» верх.</span></li>
      <li><span>Перемычка «−» верхний рельс ↔ «−» нижний рельс — общий GND.</span></li>
"""
NOTES = """
      <div class="note warn"><i>⚠</i><span><b>Минус батареи → на пад B− TP4056</b>, своей перемычкой (фиолетовый). НЕ на общий «−» рельс — иначе защита DW01 (переразряд/КЗ) отключается. IN−/OUT− TP4056 — да, на «−» рельс.</span></div>
      <div class="note warn"><i>⚠</i><span><b>Рельсы 830-макетки разрезаны посередине!</b> Прозвони каждый и поставь по перемычке-мосту на все 4 рельса.</span></div>
      <div class="note warn"><i>⚠</i><span><b>Полоска (катод) обоих диодов — вправо, к шине.</b> Перепутаешь — питания на шине не будет.</span></div>
      <div class="note warn"><i>⚠</i><span><b>C1 полярный.</b> Длинная ножка «+» → «+» рельс, светлая полоса «−» → GND. Наоборот — вздуется.</span></div>
      <div class="note ok"><i>1</i><span>Только адаптер: «+» нижний рельс = <b>4.6–4.8 В</b>.</span></div>
      <div class="note ok"><i>2</i><span>Вставь батарею: Boost #2 OUT+ = <b>5.14 В</b>. Выдерни адаптер — шина держится <b>4.6–4.8 В</b> (diode-OR работает).</span></div>
      <div class="note ok"><i>3</i><span>Включи SW1: верхний рельс и VIN = <b>4.6–4.8 В</b>, ESP32 стартует без USB.</span></div>
      <div class="note info"><i>→</i><span>Колонка <b class="col">46</b> (TP_B+) — точка для делителя батареи в задаче 05.</span></div>
"""
SCRIPT = open(os.path.join(os.path.dirname(__file__),"_std_script.txt"),encoding="utf-8").read()

html = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Задача 04 — силовая шина · метеостанция</title>
<style>%s</style></head><body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · задача 04</div>
    <h1>Силовая шина (diode-OR)</h1>
    <p class="lede">Нижний «+» рельс — ШИНА 4.7 В до тумблера. Верхний «+» рельс — LOAD после тумблера, идёт на VIN. Оба «−» рельса — общий GND. <b>Нажми на любую деталь на схеме</b>, чтобы увидеть её фото.</p>
  </header>
  <section>
    <div class="board">%s</div>
    <p class="hint">Детали на схеме кликабельны. На узком экране схему можно прокрутить вбок.</p>
  </section>
  <section>
    <h2>Детали для этого шага</h2>
    <p class="sub">Нажми на карточку — откроется фото и что важно не перепутать.</p>
    <div class="strip">%s</div>
  </section>
  <section>
    <h2>Порядок монтажа</h2>
    <p class="sub">Нижний банк макетки — ряды f–j. Синяя капсула = одна колонка = один узел.</p>
    <ol class="steps">%s</ol>
  </section>
  <section>
    <h2>Проверка и что не перепутать</h2>
    <div class="notes">%s</div>
  </section>
</div>
<div class="veil" id="veil" role="dialog" aria-modal="true">
  <div class="modal"><div class="pics" id="mpics"></div>
    <div class="body"><h3 id="mname"></h3><p class="msub" id="msub"></p>
      <p class="mnote" id="mnote"></p><button class="x" id="mx">Закрыть</button></div></div>
</div>
<script>%s</script></body></html>
""" % (CSS, svg_inline, chips, STEPS, NOTES, SCRIPT.replace("__PARTS__", json.dumps(PARTS, ensure_ascii=False)))

out = os.path.join(ROOT, "step04-power-rail.html")
with open(out,"w",encoding="utf-8") as f: f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8"))/1024))
