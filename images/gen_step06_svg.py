# -*- coding: utf-8 -*-
# Задача 06 — сигнальные делители датчика ветра (10k+5k / 10k → GPIO34 скорость, GPIO35 направление).
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

# ─────────────────────────────────────────────────────────────────────────────
# ⚠ УСТАРЕЛ (2026-07-17). Верхнее плечо делителя переведено на 10k+5k послед.
# (=15 кОм, ratio 2.5 сохранён). Канон — committed images/*.svg (правлены ВРУЧНУЮ).
# bb.resistor() рисует тело фикс. ширины 20px и не даёт корректный однколоночный
# резистор в серии, поэтому генератор НЕ воспроизводит committed-геометрию побайтно.
# Не регенерировать вслепую; полосы: 10k=кор-чёрн-чёрн-красн-кор, 5k=зел-чёрн-чёрн-кор-кор.
# ─────────────────────────────────────────────────────────────────────────────

board, r3c, r4c = bb.breadboard(bottom="+-")

SENS = "#0e9488"   # сырой сигнал датчика 0–5В (бирюзовый)

# ----- колонки двух делителей -----
# СКОРОСТЬ (справа): вход 52, узел 54, низ 56 → GPIO34
SIN,SMID,SND,SGN = 52,53,54,56
# НАПРАВЛЕНИЕ (слева): вход 16, узел 18, низ 20 → GPIO35
DIN,DMID,DND,DGN = 16,17,18,20
gpio34_x = bb.PIN_TOP["34"]   # 275
gpio35_x = bb.PIN_TOP["35"]   # 258

legend = bb.legend([
    ("line", SENS,     "сигнал датчика 0–5В"),
    ("line", bb.SIG,   "делённый → GPIO (0–2В)"),
    ("line", bb.GNDc,  "GND «−» (общая земля)"),
    ("sw",   bb.PAD_ADC,"АЦП 34/35"),
    ("sw",   "#ddd",   "уже собрано (01–05)"),
    ("dot2", None,     "мультиметр"),
])

esp = bb.esp32(subtitle="GPIO34 скорость · GPIO35 направление (эта задача)",
               highlight=["34","35"])

# 5-полосные резисторы: 10k = кор-чёрн-чёрн-красн-кор; 5k = зел-чёрн-чёрн-кор-кор
B10K = ["#7a4a12","#1a1a1a","#1a1a1a","#c00","#7a4a12"]  # 10k
B5K  = ["#2e8b3d","#1a1a1a","#1a1a1a","#7a4a12","#7a4a12"]  # 5k (верх = 10k+5k послед.)

# --- делитель СКОРОСТЬ (справа): верх 10k+5k послед., низ 10k ---
Rs_top1 = bb.resistor(SIN,SMID,"f", B10K, label="10k", label_dy=-9)
Rs_top2 = bb.resistor(SMID,SND,"f", B5K, label="5k", label_dy=-9)
Rs_bot = bb.resistor(SND,SGN,"h", B10K, label="10k", label_dy=-9)
# --- делитель НАПРАВЛЕНИЕ (слева) ---
Rd_top1 = bb.resistor(DIN,DMID,"f", B10K, label="10k", label_dy=-9)
Rd_top2 = bb.resistor(DMID,DND,"f", B5K, label="5k", label_dy=-9)
Rd_bot = bb.resistor(DND,DGN,"h", B10K, label="10k", label_dy=-9)
# --- фильтры 100нФ на узле каждого делителя (узел ↔ GND), гасят наводки с кабеля мачты ---
C3 = bb.cap_ceramic(SND,SGN,"i", label="C3")   # узел скорости → GND
C4 = bb.cap_ceramic(DND,DGN,"i", label="C4")   # узел направления → GND

def node_cap(col, name):
    x = bb.colx(col)
    return (f'<rect x="{x-7}" y="399" width="14" height="86" rx="7" fill="rgba(42,111,209,.10)" '
            f'stroke="#2a6fd1" stroke-opacity=".5" stroke-dasharray="4 3"/>'
            f'<text x="{x}" y="497" font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">{name}</text>')
caps = node_cap(SND,"узел·54") + node_cap(DND,"узел·18")

def colnum(col):
    return f'<text x="{bb.colx(col)}" y="396">{col}</text>'
colnums = ('<g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">'
           + "".join(colnum(c) for c in (DIN,DND,DGN,SIN,SND,SGN)) + '</g>')

# GND-перемычки: низ каждого делителя (кол.56 и кол.20) → «−» рельс (y514)
def gnd_jmp(col):
    x = bb.colx(col)
    return (f'<line x1="{x}" y1="478" x2="{x}" y2="514" stroke="{bb.GNDc}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<circle cx="{x}" cy="478" r="3.5" fill="{bb.GNDc}"/><circle cx="{x}" cy="514" r="4" fill="{bb.GNDc}"/>')
gnds = gnd_jmp(SGN) + gnd_jmp(DGN)

# сигнальные провода: узел → GPIO (оранжевые дуги над платой)
sig_speed = (f'<path d="M{bb.colx(SND)} 478 C 1050 440, 1050 236, 820 205 '
             f'C 560 150, 360 250, {gpio34_x} 305" fill="none" stroke="{bb.SIG}" '
             f'stroke-width="3.4" stroke-linecap="round"/>'
             f'<circle cx="{bb.colx(SND)}" cy="478" r="4" fill="{bb.SIG}"/>'
             f'<text x="360" y="196" font-size="10.5" font-weight="700" fill="{bb.SIG}">узел скорости → GPIO34</text>')
sig_dir = (f'<path d="M{bb.colx(DND)} 478 C 400 320, 320 250, {gpio35_x} 305" '
           f'fill="none" stroke="{bb.SIG}" stroke-width="3.4" stroke-linecap="round"/>'
           f'<circle cx="{bb.colx(DND)}" cy="478" r="4" fill="{bb.SIG}"/>'
           f'<text x="415" y="300" font-size="10.5" font-weight="700" fill="{bb.SIG}">узел напр. → GPIO35</text>')

# ----- датчик (задача 07, приглушён) + провода сигнала к верхам делителей -----
sx, sw = 440, 360
sy, sh = 620, 150
sens_box = f'''<g opacity="0.55">
  <rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="12" fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2" stroke-dasharray="7 5"/>
  <text x="{sx+sw/2}" y="{sy+30}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">Датчик ветра · Polycarbonate 0–5В</text>
  <text x="{sx+sw/2}" y="{sy+49}" font-size="11" fill="#666" text-anchor="middle">подключается в задаче 07 · питание 12В от Boost#1 (задача 02 ✓)</text>
</g>'''
# пады датчика (на верхней кромке): НАПР слева, V+ и GND в центре, СКОР справа
def spad(px, label, color):
    return (f'<circle cx="{px}" cy="{sy}" r="6" fill="{color}" stroke="#7a5a1a" opacity="0.9"/>'
            f'<text x="{px}" y="{sy-10}" font-size="8.5" font-weight="700" fill="#555" text-anchor="middle">{label}</text>')
sens_pads = (spad(sx+30,"НАПР", SENS) + spad(sx+150,"12В+","#d23b2e")
             + spad(sx+210,"GND", bb.GNDc) + spad(sx+330,"СКОР", SENS))
# провода сигнала (бирюза, пунктир — ставится в 07) к входам делителей
sens_wires = f'''<g stroke-dasharray="6 4" opacity="0.7">
  <path d="M{sx+30} {sy} C {sx-30} {sy-60}, 380 540, {bb.colx(DIN)} 478" fill="none" stroke="{SENS}" stroke-width="2.8"/>
  <path d="M{sx+330} {sy} C {sx+430} {sy-60}, 930 540, {bb.colx(SIN)} 478" fill="none" stroke="{SENS}" stroke-width="2.8"/>
  <path d="M{sx+210} {sy} C {sx+210} {sy+40}, 700 560, 700 528" fill="none" stroke="{bb.GNDc}" stroke-width="2.8"/>
</g>
  <circle cx="{bb.colx(DIN)}" cy="478" r="4" fill="{SENS}"/><circle cx="{bb.colx(SIN)}" cy="478" r="4" fill="{SENS}"/>
  <text x="{sx+270}" y="{sy-26}" font-size="10" fill="#0a7a70" text-anchor="middle">сигналы 0–5В → верх делителей (в задаче 07)</text>
  <text x="{sx+150}" y="{sy+70}" font-size="9.5" fill="#888">GND датчика → «−» рельс (общая земля!)</text>'''

mm_s = bb.mm_point(bb.colx(SND)+16, 470, "GPIO34 ≈ Vдатч×0.4 (оба узла так же)")

fw = f'''<g font-size="12" fill="#333">
  <rect x="840" y="600" width="345" height="200" rx="10" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="860" y="628" font-size="13.5" font-weight="700" fill="#8a6d3b">Как это считает прошивка</text>
  <text x="860" y="654" font-family="ui-monospace, Consolas, monospace" font-size="11" fill="#444">V_adc = V_датч × 10/(15+10) = V_датч × 0.4</text>
  <text x="860" y="678" font-family="ui-monospace, Consolas, monospace" font-size="11" fill="#444">V_датч = V_adc × SIGNAL_DIVIDER_RATIO (=2.5)</text>
  <text x="860" y="704" font-size="11" fill="#2e7d4f">5.0В датч → GPIO 2.0В → в линейной зоне АЦП</text>
  <text x="860" y="726" font-size="11" fill="#444">скорость = V_датч/5 × 60 м/с · напр = /5 × 360°</text>
  <text x="860" y="748" font-size="11" fill="#777">GPIO34=скорость, GPIO35=направление (ADC1, вход)</text>
  <text x="860" y="770" font-size="11" fill="#777">readSensors() усредняет 10 отсчётов, раз в 2 сек</text>
  <text x="860" y="790" font-size="10.5" fill="#c0392b">Верх 10k+5k (к датчику), низ 10k (к GND) — не менять!</text>
</g>'''

steps = '''<text x="30" y="850" font-size="17" font-weight="700" fill="#1a1a1a">Порядок монтажа (нижний банк, ряды f–j; два одинаковых делителя в свободных колонках):</text>
  <g font-size="13.5" fill="#333">
    <text x="30" y="874"><tspan font-weight="700" fill="#0e9488">Делитель СКОРОСТИ → GPIO34</tspan> (справа, свободные кол.52–56):</text>
    <text x="30" y="896">1.  <tspan font-weight="700">10k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">52</tspan> (вход от датчика) → кол.<tspan font-weight="700" fill="#2a6fd1">53</tspan>. <tspan font-weight="700">5k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">53</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">54</tspan> (узел). <tspan font-weight="700">10k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">54</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">56</tspan>. <tspan font-weight="700">C3 100нФ</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">54</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">56</tspan>.</text>
    <text x="30" y="918">2.  Перемычка кол.<tspan font-weight="700" fill="#2a6fd1">56</tspan> → «−» рельс (GND). Оранжевый провод: кол.<tspan font-weight="700" fill="#2a6fd1">54</tspan> (узел) → пин <tspan font-weight="700" fill="#c47015">GPIO34</tspan>.</text>
    <text x="30" y="944"><tspan font-weight="700" fill="#0e9488">Делитель НАПРАВЛЕНИЯ → GPIO35</tspan> (слева, свободные кол.16–20):</text>
    <text x="30" y="966">3.  <tspan font-weight="700">10k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">16</tspan> (вход) → кол.<tspan font-weight="700" fill="#2a6fd1">17</tspan>. <tspan font-weight="700">5k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">17</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">18</tspan> (узел). <tspan font-weight="700">10k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">18</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">20</tspan>. <tspan font-weight="700">C4 100нФ</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">18</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">20</tspan>.</text>
    <text x="30" y="988">4.  Перемычка кол.<tspan font-weight="700" fill="#2a6fd1">20</tspan> → «−» рельс (GND). Оранжевый провод: кол.<tspan font-weight="700" fill="#2a6fd1">18</tspan> (узел) → пин <tspan font-weight="700" fill="#c47015">GPIO35</tspan>.</text>
    <text x="30" y="1010">5.  Верхи делителей (кол.52 и кол.16) — <tspan font-weight="700" fill="#0e9488">сюда придут сигналы датчика</tspan> (0–5В) в задаче 07.</text>
    <text x="30" y="1032">6.  Проверка: подай на верх (кол.52/16) известное 5В → на узле мультиметр ≈ 2.0В (0.4×). Без датчика вход висит — норма.</text>
  </g>'''

notes = '''<rect x="30" y="1056" width="1340" height="128" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1082" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх 10k+5k (=15k) — к датчику, низ 10k — к GND.</tspan> Поменяешь местами — получишь ×1.67 вместо ×2.5, скорость/направление уедут.</text>
  <text x="46" y="1106" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">GND датчика обязан идти на общий «−» рельс.</tspan> Без общей земли АЦП намеряет мусор. GPIO34/35 — ADC1, только вход.</text>
  <text x="46" y="1130" font-size="13.5" fill="#8a6d3b">•  <tspan font-weight="700">Два делителя одинаковые</tspan> — по паре 10k+5k/10k + 100нФ (C3/C4, маркировка «104») на узле → GND: фильтр наводок с длинного кабеля мачты.</text>
  <text x="46" y="1154" font-size="13.5" fill="#2a6fd1">→  Полный тест — в задаче 07 (датчик + 12В). Тогда поля <tspan font-family="ui-monospace, Consolas, monospace">"speed"/"direction"</tspan> в API оживут. Дальше: 07 датчик → 08 корпус.</text>
  <text x="46" y="1175" font-size="11.5" fill="#999">Нажми на любую деталь на схеме — откроется её фото. ESP32 — точная распиновка DOIT DevKit V1 (30-pin).</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1200" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c,r4c)}
  <rect x="0" y="0" width="1400" height="1200" fill="#ffffff"/>
  <text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Задача 06 — Сигнальные делители датчика (10k+5k / 10k → GPIO34/35): вид макетки</text>
  <text x="30" y="63" font-size="14.5" fill="#666">Два одинаковых делителя гасят 0–5В датчика до 0–2В (линейная зона АЦП). Скорость → GPIO34, направление → GPIO35. верх 10k+5k (=15k), низ 10k, 100нФ на узле — фильтр.</text>
  {legend}
  {board}
  {colnums}
  {caps}
  {esp}
  {Rs_top1}{Rs_top2}{Rs_bot}{Rd_top1}{Rd_top2}{Rd_bot}
  {C3}{C4}
  {gnds}
  {sig_speed}{sig_dir}
  {sens_box}{sens_pads}{sens_wires}
  {mm_s}
  {fw}
  {steps}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "step06_signal_dividers.svg")
with open(out,"w",encoding="utf-8") as f: f.write(svg)
print("wrote", out, len(svg), "bytes")
