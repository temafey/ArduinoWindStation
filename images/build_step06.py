# -*- coding: utf-8 -*-
import base64, os, json, mimetypes

# ─────────────────────────────────────────────────────────────────────────────
# ⚠ УСТАРЕЛ (2026-07-17). Делитель сигнала: верх 10k+5k послед. (=15 кОм, ratio 2.5).
# Канон — committed ../step06-signal-dividers.html (правлен ВРУЧНУЮ). Скрипт требует фото-ассеты (PHOTO)
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
    "esp32":      ["esp32-devkit-v1-30pin.jpg"],
    "resistors":  ["резисторы-набор-1-4W.jpg"],
    "caps":       ["конденсаторы-керамические-набор.jpg"],
    "multimeter": ["мультиметр-UNI-T-UT33A+.jpg"],
    "provoda":    ["dupont-провода-MM.jpg"],
}

PARTS = {
    "esp32": {
        "name": "ESP32 DevKit V1 — GPIO34 / GPIO35",
        "sub": "11-й и 12-й пины верхнего ряда (голубые АЦП)",
        "note": "GPIO34 = скорость, GPIO35 = направление. Оба — ADC1, ТОЛЬКО ВХОД (нельзя как выход). В прошивке: PIN_WIND_SPEED=34, PIN_WIND_DIR=35, читаются через analogReadMilliVolts() с ADC_11db и разрешением 12 бит. Подсвечены оранжевым кольцом рядом с GPIO32 (батарея, задача 05).",
        "kind": "info",
    },
    "resistors": {
        "name": "Резисторы 10 кОм ×4 и 5 кОм ×2",
        "sub": "делитель на каждый канал",
        "note": "Верхнее плечо — 10 кОм + 5 кОм последовательно (=15 кОм): сначала 10 кОм (коричневый-чёрный-чёрный-красный-коричневый) от сигнала датчика, затем 5 кОм (зелёный-чёрный-чёрный-коричневый-коричневый) до узла. 10 кОм (коричневый-чёрный-чёрный-красный-коричневый) — СНИЗУ, к GND. Пара 10k+5k/10k делит 0–5 В датчика до 0–2 В (×0.4). Оба канала одинаковые. Из набора 600 шт.",
        "kind": "info",
    },
    "caps": {
        "name": "Конденсаторы 100 нФ · ×2 (C3, C4)",
        "sub": "фильтр на узле каждого делителя",
        "note": "Керамика, маркировка «104», без полярности. Ставится между узлом делителя (кол. 54 для скорости, кол. 18 для направления) и GND — параллельно нижнему 10 кОм. Гасит высокочастотные наводки с длинного кабеля от мачты. Без него показания speed/direction будут дёргаться. Тот же тип, что C5 (батарея) и C2 (питание).",
        "kind": "info",
    },
    "multimeter": {
        "name": "Мультиметр UNI-T UT33A+",
        "sub": "позиция V⎓ (автодиапазон)",
        "note": "Проверка узла: красный щуп на узел (кол. 54 для скорости или кол. 18 для направления), чёрный на GND. Должно быть ≈ 0.4 × напряжения датчика. Без датчика вход висит в воздухе — покажет шум, это норма до задачи 07. Подай на верх делителя известные 5 В → на узле ~2.0 В.",
        "kind": "ok",
    },
    "provoda": {
        "name": "Провода dupont M-M",
        "sub": "сигнал узел → GPIO и перемычки на GND",
        "note": "Оранжевым выделен сигнал узел → GPIO34/35 (уже делённый, 0–2 В). Чёрным — перемычки кол.56 и кол.20 на «−» рельс. Важно: GND датчика тоже придёт на этот «−» рельс — общая земля обязательна, иначе АЦП намеряет мусор.",
        "kind": "info",
    },
}

for k, v in PARTS.items():
    v["photos"] = [datauri(fn) for fn in PHOTO[k]]

with open(os.path.join(IMG, "step06_signal_dividers.svg"), encoding="utf-8") as f:
    svg = f.read()

# hotspots overlay (SVG coords)
HOTS = [
    ("esp32",      80, 316, 262, 160),   # ESP32 body
    ("esp32",     250, 306,  36,  20),   # GPIO34/35 pads
    ("resistors", 955, 398,  75,  38),   # speed divider R (кол.52-56, ряды f/h)
    ("resistors", 343, 398,  75,  38),   # dir divider R (кол.16-20)
    ("caps",      985, 452,  45,  22),   # C6 speed node (кол.54-56, ряд i)
    ("caps",      373, 452,  45,  22),   # C7 dir node (кол.18-20, ряд i)
    ("multimeter",1000,458, 185,  22),   # node probe label
    ("provoda",   560, 175, 220,  40),   # signal wire
]
hot_svg = '<g class="hots">\n' + "\n".join(
    '<rect class="hot" data-part="%s" x="%d" y="%d" width="%d" height="%d" rx="6"><title>Нажми — фото детали</title></rect>' % h
    for h in HOTS
) + "\n</g>\n"

svg_with_hots = svg.rstrip()
assert svg_with_hots.endswith("</svg>")
svg_inline = svg_with_hots[:-len("</svg>")] + hot_svg + "</svg>"

CHIP_ORDER = ["esp32", "resistors", "caps", "multimeter", "provoda"]
CHIP_LABEL = {
    "esp32": "ESP32 · GPIO34/35",
    "resistors": "10k+5k / 10k · ×2",
    "caps": "C3 / C4 · 100 нФ",
    "multimeter": "Мультиметр",
    "provoda": "Провода dupont",
}
chips = "".join(
    '<button class="chip" data-part="%s"><img src="%s" alt="%s"><span>%s</span></button>'
    % (k, PARTS[k]["photos"][0], CHIP_LABEL[k], CHIP_LABEL[k])
    for k in CHIP_ORDER
)

CSS = open(os.path.join(os.path.dirname(__file__),"_std_css.txt"),encoding="utf-8").read()

STEPS = """
      <li><span><b class="ref">Скорость → GPIO34</b> (справа, свободные кол. 52–56): <b>10 кОм</b> — кол. <b class="col">52</b> (вход датчика) → кол. <b class="col">53</b>. <b>5 кОм</b> — кол. <b class="col">53</b> → кол. <b class="col">54</b> (узел). <b>10 кОм</b> — кол. <b class="col">54</b> → кол. <b class="col">56</b>. <b class="ref">C3 100 нФ</b> — кол. <b class="col">54</b> → кол. <b class="col">56</b> (параллельно 10к).</span></li>
      <li><span>Перемычка кол. <b class="col">56</b> → «−» рельс (GND). <b class="ref">Оранжевый провод</b>: кол. <b class="col">54</b> (узел) → пин <b class="ref">GPIO34</b>.</span></li>
      <li><span><b class="ref">Направление → GPIO35</b> (слева, свободные кол. 16–20): <b>10 кОм</b> — кол. <b class="col">16</b> (вход) → кол. <b class="col">17</b>. <b>5 кОм</b> — кол. <b class="col">17</b> → кол. <b class="col">18</b> (узел). <b>10 кОм</b> — кол. <b class="col">18</b> → кол. <b class="col">20</b>. <b class="ref">C4 100 нФ</b> — кол. <b class="col">18</b> → кол. <b class="col">20</b>.</span></li>
      <li><span>Перемычка кол. <b class="col">20</b> → «−» рельс (GND). <b class="ref">Оранжевый провод</b>: кол. <b class="col">18</b> (узел) → пин <b class="ref">GPIO35</b>.</span></li>
      <li><span>Верхи делителей (кол. <b class="col">52</b> и кол. <b class="col">16</b>) — <b>сюда придут сигналы датчика</b> (0–5 В) в задаче 07. GND датчика — на тот же «−» рельс.</span></li>
      <li><span>Проверка без датчика: подай на верх (кол. 52 / 16) известные 5 В → на узле мультиметр ≈ <b>2.0 В</b> (0.4×). Без сигнала вход висит — шум в API это норма.</span></li>
      <li><span>С датчиком (задача 07) поля <b class="mono">"speed"</b> / <b class="mono">"direction"</b> в API оживут.</span></li>
"""

NOTES = """
      <div class="note warn"><i>⚠</i><span><b>Верх 10 кОм + 5 кОм (=15 кОм) — к датчику, низ 10 кОм — к GND.</b> Поменяешь местами — получишь ×1.67 вместо ×2.5, и скорость/направление уедут.</span></div>
      <div class="note warn"><i>⚠</i><span><b>GND датчика обязан идти на общий «−» рельс.</b> Без общей земли АЦП намеряет мусор.</span></div>
      <div class="note warn"><i>⚠</i><span><b>GPIO34 и GPIO35 — это ADC1, только вход.</b> В прошивке <span class="mono">analogReadMilliVolts(PIN_WIND_SPEED/PIN_WIND_DIR)</span>, аттенюация ADC_11db.</span></div>
      <div class="note ok"><i>✓</i><span>Два делителя <b>одинаковые</b> — по паре 10k+5k/10k + <b>100 нФ на узле</b> (C3/C4, «104»). верх 10k+5k, низ 10k, узел (средняя точка) → на свой GPIO. Конденсатор — параллельно нижнему 10к, гасит наводки с кабеля мачты (без него speed/direction дёргаются).</span></div>
      <div class="note info"><i>→</i><span>Полный тест — в задаче 07 (датчик + 12 В от Boost#1). Тогда <span class="mono">"speed"</span>/<span class="mono">"direction"</span> в дашборде станут живыми. Дальше: 07 датчик → 08 корпус.</span></div>
"""

SCRIPT = open(os.path.join(os.path.dirname(__file__),"_std_script.txt"),encoding="utf-8").read()

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Задача 06 — сигнальные делители датчика · метеостанция</title>
<style>%s</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · задача 06</div>
    <h1>Сигнальные делители датчика (10k+5k / 10k → GPIO34/35)</h1>
    <p class="lede">Датчик выдаёт 0–5 В, а АЦП ESP32 линеен только до ~2.45 В. Два одинаковых делителя (верх 10 кОм + 5 кОм = 15 кОм, низ 10 кОм) гасят сигнал до 0–2 В: скорость → GPIO34, направление → GPIO35. <b>Нажми на любую деталь на схеме</b>, чтобы увидеть её фото.</p>
  </header>

  <section>
    <div class="board">%s</div>
    <p class="hint">Детали на схеме кликабельны. Датчик показан приглушённо — он подключается в задаче 07. На узком экране схему можно прокрутить вбок.</p>
  </section>

  <section>
    <h2>Детали для этого шага</h2>
    <p class="sub">Нажми на карточку — откроется фото и что важно не перепутать.</p>
    <div class="strip">%s</div>
  </section>

  <section>
    <h2>Порядок монтажа</h2>
    <p class="sub">Нижний банк макетки — ряды f–j. Два делителя в свободных колонках (силовая часть и делитель батареи — в кол. 22–50, не мешают).</p>
    <ol class="steps">%s</ol>
  </section>

  <section>
    <h2>Проверка и что не перепутать</h2>
    <div class="notes">%s</div>
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
""" % (CSS, svg_inline, chips, STEPS, NOTES,
       SCRIPT.replace("__PARTS__", json.dumps(PARTS, ensure_ascii=False)))

out = os.path.join(ROOT, "step06-signal-dividers.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8"))/1024))
