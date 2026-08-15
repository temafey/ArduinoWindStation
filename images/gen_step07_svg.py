# -*- coding: utf-8 -*-
# Задача 07 — датчик ветра + питание 12В от Boost#1. Сигналы → делители (06) → GPIO34/35.
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
SENS = "#0e9488"

# делители (готовы в 06): СКОРОСТЬ 52-54-56 → GPIO34; НАПРАВЛЕНИЕ 16-18-20 → GPIO35
SIN,SMID,SND,SGN = 52,53,54,56
DIN,DMID,DND,DGN = 16,17,18,20
g34 = bb.PIN_TOP["34"]; g35 = bb.PIN_TOP["35"]

legend = bb.legend([
    ("line", bb.PLUS, "12В (Boost#1 → датчик)"),
    ("line", SENS,    "сигнал датчика 0–5В"),
    ("line", bb.SIG,  "делённый → GPIO"),
    ("line", bb.GNDc, "GND (общая земля)"),
    ("sw",   "#ddd",  "готово (01–06)"),
    ("dot2", None,    "мультиметр"),
])

esp = bb.esp32(subtitle="GPIO34/35 ← делители ← датчик (эта задача)", highlight=["34","35"])

# --- делители 06 (контекст), с фильтрами C6/C7 ---
B10K = ["#7a4a12","#1a1a1a","#1a1a1a","#c00","#7a4a12"]  # 10k
B5K  = ["#2e8b3d","#1a1a1a","#1a1a1a","#7a4a12","#7a4a12"]  # 5k (верх = 10k+5k послед.)
Rs_top1 = bb.resistor(SIN,SMID,"f", B10K, label="10k", label_dy=-9)
Rs_top2 = bb.resistor(SMID,SND,"f", B5K, label="5k", label_dy=-9)
Rs_bot = bb.resistor(SND,SGN,"h", B10K, label="10k", label_dy=-9)
Rd_top1 = bb.resistor(DIN,DMID,"f", B10K, label="10k", label_dy=-9)
Rd_top2 = bb.resistor(DMID,DND,"f", B5K, label="5k", label_dy=-9)
Rd_bot = bb.resistor(DND,DGN,"h", B10K, label="10k", label_dy=-9)
C3 = bb.cap_ceramic(SND,SGN,"i", label="C3")
C4 = bb.cap_ceramic(DND,DGN,"i", label="C4")

def node_cap(col, name):
    x = bb.colx(col)
    return (f'<rect x="{x-7}" y="399" width="14" height="86" rx="7" fill="rgba(42,111,209,.10)" '
            f'stroke="#2a6fd1" stroke-opacity=".5" stroke-dasharray="4 3"/>'
            f'<text x="{x}" y="497" font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">{name}</text>')
caps = node_cap(SND,"узел·54") + node_cap(DND,"узел·18")
colnums = ('<g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">'
           + "".join(f'<text x="{bb.colx(c)}" y="396">{c}</text>' for c in (DIN,DND,DGN,SIN,SND,SGN))
           + '</g>')

def gnd_jmp(col):
    x = bb.colx(col)
    return (f'<line x1="{x}" y1="478" x2="{x}" y2="514" stroke="{bb.GNDc}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<circle cx="{x}" cy="478" r="3.5" fill="{bb.GNDc}"/><circle cx="{x}" cy="514" r="4" fill="{bb.GNDc}"/>')
gnds = gnd_jmp(SGN) + gnd_jmp(DGN)

sig_speed = (f'<path d="M{bb.colx(SND)} 478 C 1050 440, 1050 236, 820 205 C 560 150, 360 250, {g34} 305" '
             f'fill="none" stroke="{bb.SIG}" stroke-width="3.4" stroke-linecap="round"/>'
             f'<circle cx="{bb.colx(SND)}" cy="478" r="4" fill="{bb.SIG}"/>'
             f'<text x="360" y="196" font-size="10.5" font-weight="700" fill="{bb.SIG}">узел скорости → GPIO34</text>')
sig_dir = (f'<path d="M{bb.colx(DND)} 478 C 400 320, 320 250, {g35} 305" '
           f'fill="none" stroke="{bb.SIG}" stroke-width="3.4" stroke-linecap="round"/>'
           f'<circle cx="{bb.colx(DND)}" cy="478" r="4" fill="{bb.SIG}"/>'
           f'<text x="415" y="300" font-size="10.5" font-weight="700" fill="{bb.SIG}">узел напр. → GPIO35</text>')

# ---------- Boost#1 (12В) ----------
bx1, by1 = 110, 632
boost1 = bb.mod_boost(bx1, by1, 190, 150,
    pins=[(bx1+28,"IN+",bb.PLUS),(bx1+56,"IN−",bb.PAD_GNDp),
          (bx1+136,"OUT+",bb.PLUS),(bx1+164,"OUT−",bb.PAD_GNDp)],
    subtitle="→ 12В · пресет 1 1 (задача 02 ✓)")
IN1p, IN1m, OUT1p, OUT1m = bx1+28, bx1+56, bx1+136, bx1+164
boost1_lbl = f'<text x="{bx1+95}" y="{by1-16}" font-size="12" font-weight="700" fill="#1a1a1a" text-anchor="middle">Boost#1 · 12В (для датчика)</text>'
# IN+ ← LOAD рельс (тот же, что VIN ESP32); IN− → GND; OUT− → GND
boost1_wires = f'''<path d="M{IN1p} {by1} C 78 560, 45 470, 45 380 C 45 300, 56 260, 76 250" fill="none" stroke="{bb.PLUS}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="76" cy="250" r="4" fill="{bb.PLUS}"/>
  <text x="30" y="452" font-size="9.5" font-weight="700" fill="#a03d30" transform="rotate(-90 30 452)">IN+ ← LOAD (рельс VIN)</text>
  <path d="M{IN1m} {by1} C {IN1m} 590, {IN1m-6} 560, {IN1m} 528" fill="none" stroke="{bb.GNDc}" stroke-width="3"/>
  <circle cx="{IN1m}" cy="527" r="3.6" fill="{bb.GNDc}"/>
  <path d="M{OUT1m} {by1} C {OUT1m} 590, {OUT1m-6} 560, {OUT1m} 528" fill="none" stroke="{bb.GNDc}" stroke-width="3"/>
  <circle cx="{OUT1m}" cy="527" r="3.6" fill="{bb.GNDc}"/>'''
mm_12v = f'<circle cx="348" cy="606" r="4.5" fill="#d23b2e"/><circle cx="359" cy="606" r="4.5" fill="#111"/><text x="367" y="603" font-size="9.5" font-weight="700" fill="#333">OUT+ = 12В (11.5–12.5)</text>'

# ---------- Датчик (внешний, на мачте) ----------
sx, sw_, sy, sh = 430, 380, 632, 162
sens = f'''<rect x="{sx}" y="{sy}" width="{sw_}" height="{sh}" rx="12" fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2"/>
  <text x="{sx+sw_/2}" y="{sy+72}" font-size="15" font-weight="700" fill="#1a1a1a" text-anchor="middle">Датчик ветра</text>
  <text x="{sx+sw_/2}" y="{sy+92}" font-size="11" fill="#666" text-anchor="middle">Polycarbonate 0–5В · на мачте</text>
  <text x="{sx+sw_/2}" y="{sy+108}" font-size="10.5" fill="#888" text-anchor="middle">скорость 0–60 м/с · направление 0–360° · 25 мА</text>
  <text x="{sx+sw_/2}" y="{sy+128}" font-size="9.5" fill="#999" text-anchor="middle">кабель заходит через гермоввод PG7 (задача 08)</text>'''
# пады датчика: VCC (слева, к Boost#1), НАПР, GND, СКОР
VCC, NAP, SGND, SKO = sx+40, sx+150, sx+235, sx+340
sens_pads = (bb._pad(VCC, sy, "VCC 12В", bb.PLUS, "top", "#555")
             + bb._pad(NAP, sy, "НАПР", SENS, "top", "#555")
             + bb._pad(SGND, sy, "GND", bb.GNDc, "top", "#555")
             + bb._pad(SKO, sy, "СКОР", SENS, "top", "#555"))
# VCC ← Boost#1 OUT+ (12В, красный); GND → рельс; НАПР → кол.16; СКОР → кол.52
sens_wires = f'''<path d="M{OUT1p} {by1} C {OUT1p+20} 600, {VCC-20} 600, {VCC} {sy}" fill="none" stroke="{bb.PLUS}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M{SGND} {sy} C {SGND} 600, {SGND-10} 566, {SGND} 528" fill="none" stroke="{bb.GNDc}" stroke-width="3.2"/>
  <circle cx="{SGND}" cy="527" r="3.6" fill="{bb.GNDc}"/>
  <path d="M{NAP} {sy} C {NAP-40} 566, 360 540, {bb.colx(DIN)} 478" fill="none" stroke="{SENS}" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="{bb.colx(DIN)}" cy="478" r="4" fill="{SENS}"/>
  <path d="M{SKO} {sy} C {SKO+120} 566, 930 540, {bb.colx(SIN)} 478" fill="none" stroke="{SENS}" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="{bb.colx(SIN)}" cy="478" r="4" fill="{SENS}"/>
  <text x="{bb.colx(DIN)}" y="470" font-size="9" fill="#0a7a70" text-anchor="middle">→ кол.16</text>
  <text x="{bb.colx(SIN)}" y="470" font-size="9" fill="#0a7a70" text-anchor="middle">→ кол.52</text>'''

fw = f'''<g font-size="12" fill="#333">
  <rect x="850" y="600" width="335" height="200" rx="10" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="868" y="628" font-size="13.5" font-weight="700" fill="#8a6d3b">Питание датчика и чтение</text>
  <text x="868" y="652" font-size="11.5" fill="#444"><tspan font-weight="700">Boost#1:</tspan> LOAD 4.7В → <tspan font-weight="700">12В</tspan> (пресет A,B замкнуты)</text>
  <text x="868" y="672" font-size="11" fill="#c0392b">Vвх ДОЛЖНО быть &lt; Vвых: 4.7 &lt; 12 ✓ — НЕ подавать 12В на вход!</text>
  <text x="868" y="694" font-size="11" fill="#2e7d4f">датчик 25 мА, буст тянет ~0.5А — запас огромный</text>
  <text x="868" y="718" font-family="ui-monospace, Consolas, monospace" font-size="11" fill="#444">V_датч = V_adc × 2.5 (обратный к делителю ×0.4)</text>
  <text x="868" y="738" font-size="11" fill="#444">скорость = V_датч/5 × 60 м/с · напр = /5 × 360°</text>
  <text x="868" y="760" font-size="11" fill="#777">без датчика оба ADC≈0 → adcError, LED GPIO33 горит — норма</text>
  <text x="868" y="782" font-size="11" fill="#2a6fd1">с датчиком "speed"/"direction" в API оживают</text>
</g>'''

steps = '''<text x="30" y="852" font-size="17" font-weight="700" fill="#1a1a1a">Порядок (сначала 12В от Boost#1, потом провода датчика):</text>
  <g font-size="13.5" fill="#333">
    <text x="30" y="876">1.  <tspan font-weight="700">Boost#1</tspan> (пады A и B замкнуты припоем = 12В, проверено в задаче 02): <tspan font-weight="700">IN+</tspan> → «+» ВЕРХНИЙ рельс (LOAD, тот же, что VIN), <tspan font-weight="700">IN−</tspan> → «−» рельс.</text>
    <text x="30" y="898">2.  <tspan font-weight="700" fill="#c0392b">До датчика</tspan> проверь мультиметром: <tspan font-weight="700">OUT+ Boost#1 = 11.5–12.5В</tspan>. Нет 12В → проверь пады A/B (см. задачу 02).</text>
    <text x="30" y="920">3.  <tspan font-weight="700">Выключи питание.</tspan> Подключи 4 провода датчика (цвета сверь с инструкцией ЕГО датчика):</text>
    <text x="52" y="942">•  <tspan font-weight="700" fill="#a03d30">VCC</tspan> (обычно красный) → <tspan font-weight="700">OUT+ Boost#1 (+12В)</tspan>.</text>
    <text x="52" y="964">•  <tspan font-weight="700">GND</tspan> (обычно чёрный) → «−» рельс (та же земля, что ESP32).</text>
    <text x="52" y="986">•  <tspan font-weight="700" fill="#0e9488">сигнал скорости</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">52</tspan> (вход делителя скорости).</text>
    <text x="52" y="1008">•  <tspan font-weight="700" fill="#0e9488">сигнал направления</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">16</tspan> (вход делителя направления).</text>
    <text x="30" y="1030">4.  Подай питание. Подуй на чашки/поверни флюгер — датчик должен свободно вращаться.</text>
    <text x="30" y="1052">5.  <tspan font-family="ui-monospace, Consolas, monospace" fill="#2a6fd1">http://192.168.1.223/api/data</tspan> → поля <tspan font-family="ui-monospace, Consolas, monospace">"speed"</tspan> и <tspan font-family="ui-monospace, Consolas, monospace">"direction"</tspan> показывают реальные значения.</text>
  </g>'''

notes = '''<rect x="30" y="1076" width="1340" height="150" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1102" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Boost#1 = 12В: НИКОГДА не подавай 12В на его вход</tspan> (Vвх должно быть меньше Vвых). Вход — это LOAD 4.7В, всё правильно.</text>
  <text x="46" y="1126" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Цвета проводов датчика сверь с ЕГО инструкцией.</tspan> Красный=VCC / чёрный=GND — обычно, но не гарантия. Перепутаешь VCC/GND — спалишь датчик.</text>
  <text x="46" y="1150" font-size="13.5" fill="#8e44ad">⚠  <tspan font-weight="700">GND датчика — на общий «−» рельс</tspan> (та же земля, что ESP32 и делители). Без общей земли АЦП намеряет мусор.</text>
  <text x="46" y="1174" font-size="13.5" fill="#2e7d32">✓  Без датчика: оба ADC≈0 → LED ОШИБКА (GPIO33) горит, adcError:true — это норма. С датчиком гаснет, speed/direction оживают.</text>
  <text x="46" y="1198" font-size="13.5" fill="#2a6fd1">→  Датчик 0 при поданном питании → нет 12В (пады Boost#1) или перепутан сигнал/GND. Дальше — задача 08: монтаж в корпус (PG7, термоклей).</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1250" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c,r4c)}
  <rect x="0" y="0" width="1400" height="1250" fill="#ffffff"/>
  <text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Задача 07 — Датчик ветра + питание 12В (Boost#1): вид макетки</text>
  <text x="30" y="63" font-size="14.5" fill="#666">Boost#1 поднимает LOAD 4.7В → 12В для датчика. Датчик выдаёт 0–5В → делители (06) → GPIO34 (скорость) / GPIO35 (направление). GND — общий.</text>
  {legend}
  {board}
  {colnums}
  {caps}
  {esp}
  {Rs_top1}{Rs_top2}{Rs_bot}{Rd_top1}{Rd_top2}{Rd_bot}{C3}{C4}
  {gnds}
  {sig_speed}{sig_dir}
  {boost1}{boost1_lbl}{boost1_wires}{mm_12v}
  {sens}{sens_pads}{sens_wires}
  {fw}
  {steps}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "step07_sensor.svg")
with open(out,"w",encoding="utf-8") as f: f.write(svg)
print("wrote", out, len(svg), "bytes")
