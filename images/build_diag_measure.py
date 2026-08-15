# -*- coding: utf-8 -*-
"""Standalone-страница «Фикс battery-brownout: что и где поставить».
Сводная схема (плата+модули) с метками ①②③ + чек-лист по фиксу."""
import os

ROOT = r"C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation"
IMG  = os.path.join(ROOT, "images")

with open(os.path.join(IMG, "diag_measure.svg"), encoding="utf-8") as f:
    svg = f.read()

CSS = open(os.path.join(IMG, "_std_css.txt"), encoding="utf-8").read()

NOTES = """
      <div class="note ok"><i>✓</i><span><b>Диагноз подтверждён замерами.</b> Батарея здорова (банки 3.98 В), TP4056 исправен (на голом модуле OUT+ = 3.9 В, ключ открыт). Провал <b>0.3 В внутри модуля был только под нагрузкой</b> — это не дохлая деталь, а <b>сумма рыхлых контактов</b>: под током буста рельс проседает 3.9 → 2.84 В, ESP32 уходит в brownout-цикл и не догружает <span class="mono">setup()</span> — горит только буст (синий) и красный power.</span></div>
      <div class="note warn"><i>①</i><span><b>Главное — силовой путь батареи, пропаять.</b> Убери с пружин макетки и пропаяй/укрепи: <b>+пакета → кол.44 → F1 → кол.46 → B+</b>, <b>−пакета → B−</b> (фиолетовый), и толстые провода <b>TP4056 OUT+ → Boost IN+</b>, <b>Boost OUT+ → кол.30</b>. Цель: под нагрузкой на рельсе <b>≥ 3.7–3.8 В</b>, а не 2.84.</span></div>
      <div class="note info"><i>②</i><span><b>C3 470–1000 µF на +5 В (буфер VIN).</b> Электролит между верхним <b>«+» LOAD</b> рельсом и <b>«−» GND</b>, рядом с VIN ESP32. <b>«+»</b> (длинная ножка) → LOAD, <b>«−»</b> (полоса) → GND — не перепутай, вздуется. Гасит броски тока на WiFi-передаче, чтобы ESP32 не ребутился.</span></div>
      <div class="note ok"><i>③</i><span><b>Boost#2 ≈ 5.1 В — уже ок.</b> У тебя 5.14 В, запас над dropout AMS1117 (нужно ≥ 4.3 В на входе) есть. Не трогай.</span></div>
      <div class="note warn"><i>→</i><span><b>Порядок:</b> начни с ① (пайка контактов) — скорее всего одного хватит. Собери, запусти <b>от батареи</b> и замерь под нагрузкой <b>OUT+↔OUT−</b>: должно держаться ≥ 3.7–3.8 В и не проваливаться на WiFi-пиках. Дальше <span class="mono">curl http://192.168.1.223/api/data</span> → <span class="mono">"battery"</span> ≈ 3.9 и стабильно.</span></div>
"""

html = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Фикс: не заводится от батареи — что и где поставить</title>
<style>%s</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Метеостанция ветра · фикс</div>
    <h1>Не заводится от батареи — что и где поставить</h1>
    <p class="lede">От адаптера работает, от батареи — только синий диод буста и красный power на ESP32. Замеры показали: батарея и TP4056 исправны, рельс проседает <b>3.9&nbsp;→&nbsp;2.84&nbsp;В</b> под нагрузкой из-за рыхлых контактов → brownout. Три метки на схеме: <b>①</b> пропаять силовой путь (главное), <b>②</b> C3&nbsp;470–1000&nbsp;µF на&nbsp;+5&nbsp;В, <b>③</b> Boost&nbsp;~5.1&nbsp;В (ок).</p>
  </header>

  <section>
    <div class="board">%s</div>
    <p class="hint">Метки ①②③ на схеме = карточки справа. На узком экране схему можно прокрутить вбок.</p>
  </section>

  <section>
    <h2>Что делать и в каком порядке</h2>
    <div class="notes">%s</div>
  </section>
</div>
</body>
</html>
""" % (CSS, svg, NOTES)

out = os.path.join(ROOT, "diag-measure.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out, "%.1f KB" % (len(html.encode("utf-8")) / 1024))
