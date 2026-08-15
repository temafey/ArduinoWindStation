# -*- coding: utf-8 -*-
import base64, os, json, mimetypes

ROOT = r"C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation"
IMG  = os.path.join(ROOT, "images")

def datauri(fn):
    p = os.path.join(IMG, fn)
    mt = mimetypes.guess_type(p)[0] or "image/jpeg"
    with open(p, "rb") as f:
        return "data:%s;base64,%s" % (mt, base64.b64encode(f.read()).decode())

# --- part -> photo file(s) ---
PHOTO = {
    "esp32":      ["esp32-devkit-v1-30pin.jpg"],
    "resistors":  ["резисторы-набор-1-4W.jpg"],
    "c5":         ["конденсаторы-керамические-набор.jpg"],
    "f1":         ["предохранитель-PPTC-radial.jpg"],
    "battery":    ["аккумулятор-18650-LG.jpg"],
    "multimeter": ["мультиметр-UNI-T-UT33A+.jpg"],
    "provoda":    ["dupont-провода-MM.jpg"],
}

PARTS = {
    "esp32": {
        "name": "ESP32 DevKit V1 (30-pin)",
        "sub": "GPIO32 — 10-й пин верхнего ряда (голубой АЦП)",
        "note": "На схеме — точная распиновка DOIT DevKit V1: верхний ряд VIN GND 13 12 14 27 26 25 33 32 35 34 VN VP EN. GPIO32 подсвечен оранжевым кольцом. Это ADC1 — только вход; в прошивке читается через analogReadMilliVolts(PIN_BATTERY), PIN_BATTERY = 32.",
        "kind": "info",
    },
    "resistors": {
        "name": "Резистор 100 кОм · ×2 (R5, R6)",
        "sub": "верхнее и нижнее плечо делителя",
        "note": "Оба резистора одинаковые — 100 кОм. 5 полос: коричневый-чёрный-чёрный-оранжевый-коричневый (металлоплёнка, голубые). Делят напряжение батареи ровно пополам.",
        "kind": "info",
    },
    "c5": {
        "name": "Конденсатор 100 нФ",
        "sub": "маркировка «104», керамика, без полярности",
        "note": "Фильтр помех на средней точке (узел X). Полярности нет — ставь любой стороной. Без него поле \"battery\" в API будет прыгать.",
        "kind": "info",
    },
    "f1": {
        "name": "F1 · PPTC 2A (уже стоит)",
        "sub": "предохранитель батареи, задача 04 ✓",
        "note": "Показан приглушённо — уже собран в задаче 04. Точка ПОСЛЕ него (кол.46) = TP_B+. Именно отсюда берём верх делителя (R5), а не с батареи напрямую и не с шины 4.7 В.",
        "kind": "info",
    },
    "battery": {
        "name": "2×18650 LG HG2 · параллель",
        "sub": "источник, ~3.95 В (задача 03 ✓)",
        "note": "Напряжение этого пакета (после предохранителя) и меряет делитель. Делитель показывает батарею, а НЕ 4.7 В шины — потому что верх R5 сидит на TP_B+, а не на «+» рельсе.",
        "kind": "ok",
    },
    "multimeter": {
        "name": "Мультиметр UNI-T UT33A+",
        "sub": "позиция V⎓ (автодиапазон)",
        "note": "Проверка: красный щуп на пин D32 (GPIO32), чёрный на GND. Должно быть ≈ V_bat/2 (при 3.95 В → ~1.98 В). Диапазон выбирать не нужно — просто позиция V⎓.",
        "kind": "ok",
    },
    "provoda": {
        "name": "Провода dupont M-M",
        "sub": "сигнал и перемычка на GND",
        "note": "Оранжевым удобно выделить сигнал узел X → GPIO32, чтобы не спутать с питанием. Чёрным — перемычка кол.52 → «−» рельс (GND).",
        "kind": "info",
    },
}

# attach photos as data URIs
for k, v in PARTS.items():
    v["photos"] = [datauri(fn) for fn in PHOTO[k]]

# --- read SVG (strip the outer <svg ...> to inline; keep inner) ---
with open(os.path.join(IMG, "step05_battery_divider.svg"), encoding="utf-8") as f:
    svg = f.read()

# --- сводная схема «полная сборка 04+05» (внизу страницы, для итоговой проверки) ---
with open(os.path.join(IMG, "combined_full.svg"), encoding="utf-8") as f:
    combined_svg = f.read()

# hotspots overlay (SVG coords) — стандартная раскладка (ESP32 30-pin, делитель кол.46/48/50)
HOTS = [
    ("esp32",      80, 316, 262, 160),   # ESP32 body
    ("esp32",     231, 306,  22,  20),   # GPIO32 pad (подсвечен)
    ("resistors", 850, 398,  46,  18),   # R5 (кол.46-48, ряд f)
    ("resistors", 888, 434,  46,  18),   # R6 (кол.48-50, ряд h)
    ("c5",        884, 450,  46,  20),   # C5 (кол.48-50, ряд i)
    ("f1",        814, 382,  44,  36),   # F1 PTC (muted)
    ("battery",    90, 600, 595, 205),   # battery pack (стандарт)
    ("multimeter",592, 752, 100,  22),   # V_bat probes
    ("multimeter",990, 460, 150,  22),   # GPIO32 probes
    ("provoda",   540, 165, 160,  45),   # orange signal wire (дуга)
]
hot_svg = '<g class="hots">\n' + "\n".join(
    '<rect class="hot" data-part="%s" x="%d" y="%d" width="%d" height="%d" rx="6"><title>Нажми — фото детали</title></rect>' % h
    for h in HOTS
) + "\n</g>\n"

# insert hotspots right before closing </svg>
svg_with_hots = svg.rstrip()
assert svg_with_hots.endswith("</svg>")
svg_inline = svg_with_hots[:-len("</svg>")] + hot_svg + "</svg>"

# chip strip
CHIP_ORDER = ["esp32", "resistors", "c5", "f1", "battery", "multimeter", "provoda"]
CHIP_LABEL = {
    "esp32": "ESP32 · GPIO32",
    "resistors": "R5 / R6 · 100 кОм",
    "c5": "C5 · 100 нФ (104)",
    "f1": "F1 · PPTC (стоит)",
    "battery": "2×18650 (источник)",
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
      <li><span><b class="ref">R5 (100 кОм)</b>: одна ножка в колонку <b class="col">46</b> (= TP_B+, туда уже приходит F1), вторая — в колонку <b class="col">48</b> (узел X).</span></li>
      <li><span><b class="ref">R6 (100 кОм)</b>: одна ножка в колонку <b class="col">48</b> (узел X), вторая — в колонку <b class="col">50</b>.</span></li>
      <li><span><b class="ref">C5 (100 нФ, «104»)</b>: одна ножка в колонку <b class="col">48</b> (узел X), вторая — в колонку <b class="col">50</b>. Полярности нет.</span></li>
      <li><span>Перемычка колонка <b class="col">50</b> → «−» нижний рельс (GND). Теперь низ R6 и C5 на земле.</span></li>
      <li><span><b class="ref">Оранжевый провод</b>: колонка <b class="col">48</b> (узел X) → пин <b class="ref">GPIO32</b> на верхнем ряду ESP32 (10-й слева, голубой АЦП-пин).</span></li>
      <li><span>Мультиметр: на GPIO32 должно быть ≈ V_bat / 2 (при 3.95 В → ~1.98 В).</span></li>
      <li><span>Открой <b class="mono">http://192.168.1.223/api/data</b> — поле <b class="mono">"battery"</b> ≈ реальному напряжению (±0.1 В).</span></li>
"""

NOTES = """
      <div class="note warn"><i>⚠</i><span><b>Верх делителя (R5) — на TP_B+</b> (кол. 46, после предохранителя), <b>не на «+» рельс</b>. Иначе API покажет 4.7 В шины, а не батарею.</span></div>
      <div class="note warn"><i>⚠</i><span><b>GPIO32 — это ADC1, только вход.</b> Не путать с цифровым выходом; в прошивке читается через <span class="mono">analogReadMilliVolts(PIN_BATTERY)</span>.</span></div>
      <div class="note ok"><i>1</i><span><b>battery = 0.00</b> в API → R5 не дошёл до TP_B+ (проверь кол. 46).</span></div>
      <div class="note ok"><i>2</i><span><b>battery ≈ 9.xx</b> (двойное) → R6 не на GND (проверь перемычку кол. 50).</span></div>
      <div class="note ok"><i>3</i><span><b>Значение скачет</b> → нет/плохо вставлен C5. Норма — стабильно ±0.05 В.</span></div>
      <div class="note info"><i>→</i><span>После задачи 05 поля <b class="mono">"battery"</b> / <b class="mono">"batteryPercent"</b> в дашборде становятся живыми. Дальше — задача 06: сигнальные делители 10k+5k/10k (скорость GPIO34, направление GPIO35).</span></div>
"""

SCRIPT = open(os.path.join(os.path.dirname(__file__),"_std_script.txt"),encoding="utf-8").read()

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Задача 05 — делитель батареи · метеостанция</title>
<style>%s</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · задача 05</div>
    <h1>Делитель батареи (100k/100k → GPIO32)</h1>
    <p class="lede">Два резистора 100 кОм делят напряжение батареи пополам, средняя точка идёт на GPIO32. Берём с TP_B+ (кол. 46, после предохранителя) — тогда API покажет именно батарею, а не 4.7 В шины. <b>Нажми на любую деталь на схеме</b>, чтобы увидеть её фото.</p>
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

  <section>
    <h2>Полная сборка (задачи 04 + 05) — проверь всё вместе</h2>
    <p class="sub">Силовая шина diode-OR (задача 04) и делитель батареи (задача 05) на одной макетке. Общий узел — колонка&nbsp;46 (TP_B+): туда сходятся B+ TP4056, выход предохранителя F1 и верх делителя R5. Полная таблица монтажа и предупреждения — прямо на схеме.</p>
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
""" % (CSS, svg_inline, chips, STEPS, NOTES, combined_svg,
       SCRIPT.replace("__PARTS__", json.dumps(PARTS, ensure_ascii=False)))

out = os.path.join(ROOT, "step05-battery-divider.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8"))/1024))
