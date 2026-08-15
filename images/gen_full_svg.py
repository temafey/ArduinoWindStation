# -*- coding: utf-8 -*-
"""ПОЛНАЯ сборка задачи 01–07 на одной макетке — итоговая проверка.
Силовая шина (04) + делитель батареи (05) переиспользуются из gen_step04/combined-логики;
добавлены сигнальные делители (06, с фильтрами C6/C7) и Boost#1 12В + датчик (07).
Boost#1 и датчик — правым кластером у SW1 (короткий отвод LOAD), над батареей."""
import os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

# ─────────────────────────────────────────────────────────────────────────────
# ⚠ УСТАРЕЛ (2026-07-17). Верхнее плечо делителя переведено на 10k+5k послед.
# (=15 кОм, ratio 2.5 сохранён). Канон — committed images/*.svg (правлены ВРУЧНУЮ).
# bb.resistor() рисует тело фикс. ширины 20px и не даёт корректный однколоночный
# резистор в серии, поэтому генератор НЕ воспроизводит committed-геометрию побайтно.
# Не регенерировать вслепую; полосы: 10k=кор-чёрн-чёрн-красн-кор, 5k=зел-чёрн-чёрн-кор-кор.
# ─────────────────────────────────────────────────────────────────────────────
import gen_step04_svg as s4   # блоки силовой шины (04)

# ---- ESP32: подсвечены ВСЕ активные пины ----
esp = bb.esp32(
    subtitle="VIN(04) · 32 батарея(05) · 34/35 датчик(06/07)",
    highlight=["VIN", "32", "34", "35"])

# ================= Задача 05: делитель батареи (кол.46–50) =================
c46, c48, c50 = bb.colx(46), bb.colx(48), bb.colx(50)
gpio32_x, gpio34_x, gpio35_x = bb.PIN_TOP["32"], bb.PIN_TOP["34"], bb.PIN_TOP["35"]
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
R5 = bb.resistor(46, 48, "f", B100K, label="R5", label_dy=-9)
R6 = bb.resistor(48, 50, "h", B100K, label="R6", label_dy=-9)
C5 = bb.cap_ceramic(48, 50, "i", label="C5")
sig32 = f'''<path d="M{c48} 478 C 980 445, 995 300, 905 210 C 640 40, 300 70, {gpio32_x} 305"
    fill="none" stroke="{bb.SIG}" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="{c48}" cy="478" r="4" fill="{bb.SIG}"/>
  <text x="915" y="204" font-size="10" font-weight="700" fill="#c47015">узел X (кол.48) → GPIO32</text>'''

# ================= Задача 06: сигнальные делители =================
SIN,SMID,SND,SGN = 52,53,54,56          # скорость → GPIO34
DIN,DMID,DND,DGN = 16,17,18,20          # направление → GPIO35
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

def gnd_jmp(col):
    x = bb.colx(col)
    return (f'<line x1="{x}" y1="478" x2="{x}" y2="514" stroke="{bb.GNDc}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<circle cx="{x}" cy="478" r="3.5" fill="{bb.GNDc}"/><circle cx="{x}" cy="514" r="4" fill="{bb.GNDc}"/>')
gnds = gnd_jmp(50) + gnd_jmp(SGN) + gnd_jmp(DGN)

# капсулы + номера всех узлов делителей (05 + 06)
def cap_rect(x, fill="rgba(42,111,209,.10)", stroke="#2a6fd1"):
    return f'<rect x="{x-7}" y="399" width="14" height="86" rx="7" fill="{fill}" stroke="{stroke}" stroke-opacity=".5" stroke-dasharray="4 3"/>'
node_caps = (cap_rect(c48) + cap_rect(bb.colx(SND)) + cap_rect(bb.colx(DND))
    + cap_rect(c50,"rgba(31,33,38,.06)","#777") + cap_rect(bb.colx(SGN),"rgba(31,33,38,.06)","#777") + cap_rect(bb.colx(DGN),"rgba(31,33,38,.06)","#777")
    + '<g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">'
    + f'<text x="{bb.colx(DIN)}" y="396">16</text><text x="{bb.colx(DND)}" y="396">18</text><text x="{bb.colx(DGN)}" y="396">20</text>'
    + f'<text x="{c48}" y="396">48</text><text x="{c50}" y="396">50</text>'
    + f'<text x="{bb.colx(SIN)}" y="396">52</text><text x="{bb.colx(SND)}" y="396">54</text><text x="{bb.colx(SGN)}" y="396">56</text>'
    + f'<text x="{c48}" y="497">узел X</text><text x="{bb.colx(SND)}" y="497">узел·54</text><text x="{bb.colx(DND)}" y="497">узел·18</text></g>')

# сигнальные провода узлов делителей 06 → GPIO34/35
sig34 = (f'<path d="M{bb.colx(SND)} 478 C 1075 430, 1085 120, 890 92 C 610 45, 330 78, {gpio34_x} 305" '
         f'fill="none" stroke="{bb.SIG}" stroke-width="3.2" stroke-linecap="round"/>'
         f'<circle cx="{bb.colx(SND)}" cy="478" r="4" fill="{bb.SIG}"/>'
         f'<text x="760" y="128" font-size="10" font-weight="700" fill="{bb.SIG}">узел·54 → GPIO34 (скорость)</text>')
sig35 = (f'<path d="M{bb.colx(DND)} 478 C 400 320, 315 250, {gpio35_x} 305" '
         f'fill="none" stroke="{bb.SIG}" stroke-width="3.2" stroke-linecap="round"/>'
         f'<circle cx="{bb.colx(DND)}" cy="478" r="4" fill="{bb.SIG}"/>'
         f'<text x="415" y="300" font-size="10" font-weight="700" fill="{bb.SIG}">узел·18 → GPIO35</text>')

# ========== Задача 07: Boost#1 12В (реалистичный) + датчик (правый столбец) ==========
b1x, b1y, b1w, b1h = 1120, 462, 190, 148
IN1p, IN1m, OUT1p, OUT1m = b1x+28, b1x+56, b1x+136, b1x+164
boost1 = bb.mod_boost(b1x, b1y, b1w, b1h,
    pins=[(IN1p,"IN+",bb.PLUS),(IN1m,"IN−",bb.PAD_GNDp),(OUT1p,"OUT+",bb.PLUS),(OUT1m,"OUT−",bb.PAD_GNDp)],
    subtitle="→ 12В · пресет 1 1 (задача 02 ✓)")
boost1_lbl = f'<text x="{b1x+b1w/2}" y="{b1y-9}" font-size="12" font-weight="700" fill="#1a1a1a" text-anchor="middle">Boost#1 · 12В (для датчика)</text>'

# датчик — «нормальный» блок с иконкой-анемометром
sxx, syy, sww, shh = 1100, 620, 252, 176
NAPp, SKOp, SGNDp, VCCp = sxx+32, sxx+96, sxx+158, sxx+220
def _anemo(cx, cy, r=17):
    o = [f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="#8a6d3b"/>']
    for ang in (90, 210, 330):
        a = math.radians(ang); ex = cx + r*math.cos(a); ey = cy - r*math.sin(a)
        o.append(f'<line x1="{cx}" y1="{cy}" x2="{ex:.0f}" y2="{ey:.0f}" stroke="#9a8f6a" stroke-width="2.2"/>')
        o.append(f'<circle cx="{ex:.0f}" cy="{ey:.0f}" r="5.5" fill="#f4f0e6" stroke="#6b5a2a" stroke-width="2"/>')
    return "".join(o)
sensor = f'''<rect x="{sxx}" y="{syy}" width="{sww}" height="{shh}" rx="14" fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2"/>
  <text x="{sxx+sww/2}" y="{syy+32}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">Датчик ветра</text>
  {_anemo(sxx+sww/2, syy+80)}
  <text x="{sxx+sww/2}" y="{syy+126}" font-size="10.5" fill="#666" text-anchor="middle">Polycarbonate 0–5В · на мачте</text>
  <text x="{sxx+sww/2}" y="{syy+143}" font-size="9.5" fill="#888" text-anchor="middle">0–60 м/с · 0–360° · 25 мА</text>
  <text x="{sxx+sww/2}" y="{syy+160}" font-size="9" fill="#999" text-anchor="middle">кабель через PG7 (задача 08)</text>
  {bb._pad(NAPp,syy,"НАПР","#0e9488","top","#555")}{bb._pad(SKOp,syy,"СКОР","#0e9488","top","#555")}
  {bb._pad(SGNDp,syy,"GND",bb.GNDc,"top","#555")}{bb._pad(VCCp,syy,"VCC",bb.PLUS,"top","#555")}'''

# ---- компактная батарея (в 2× уже прежней) ----
BX, BY, BWID = 772, 656, 300
bhc1, bhc2 = BY+70, BY+116
bat_midy = (bhc1 + bhc2)//2
def _cell(yc):
    return (f'<rect x="{BX+68}" y="{yc-17}" width="168" height="34" rx="17" fill="#eceadf" stroke="#c7c1ae"/>'
            f'<rect x="{BX+80}" y="{yc-11}" width="144" height="22" rx="11" fill="#333"/>'
            f'<text x="{BX+152}" y="{yc+4}" font-size="9" fill="#eee" text-anchor="middle">18650 · 3.96В</text>'
            f'<rect x="{BX+52}" y="{yc-10}" width="14" height="20" rx="2" fill="#555"/>'
            f'<rect x="{BX+236}" y="{yc-10}" width="14" height="20" rx="2" fill="{bb.PLUS}"/>')
battery = f'''<rect x="{BX}" y="{BY}" width="{BWID}" height="176" rx="12" fill="{bb.BOARD_FILL}" stroke="{bb.BOARD_STK}" stroke-width="2"/>
  <text x="{BX+BWID/2}" y="{BY+28}" font-size="12.5" font-weight="700" fill="#1a1a1a" text-anchor="middle">2×18650 LG HG2 · параллель (03 ✓)</text>
  <text x="{BX+BWID/2}" y="{BY+45}" font-size="10" fill="#666" text-anchor="middle">пакет ~3.95В · 6000 мАч</text>
  {_cell(bhc1)}{_cell(bhc2)}
  <path d="M{BX+52} {bhc1} L{BX+38} {bhc1} L{BX+38} {bhc2} L{BX+52} {bhc2}" fill="none" stroke="{bb.PURPLE}" stroke-width="3.5"/>
  <path d="M{BX+250} {bhc1} L{BX+266} {bhc1} L{BX+266} {bhc2} L{BX+250} {bhc2}" fill="none" stroke="{bb.PLUS}" stroke-width="3.5"/>
  <text x="{BX+22}" y="{bat_midy+4}" font-size="9.5" font-weight="700" fill="{bb.PURPLE}" text-anchor="middle">−→B−</text>
  <text x="{BX+284}" y="{bat_midy+4}" font-size="9.5" font-weight="700" fill="{bb.PLUS}" text-anchor="middle">«+»</text>'''
BATp_x, BATm_x = BX+266, BX+38
bat_wires = f'''<path d="M{BATp_x} {bat_midy} C {BATp_x-20} 600, 900 536, 819 482" fill="none" stroke="{bb.PLUS}" stroke-width="3.4"/>
  <circle cx="819" cy="478" r="4" fill="{bb.PLUS}"/>
  <text x="905" y="548" font-size="9.5" font-weight="700" fill="#a03d30">«+» пакета → кол.44</text>
  <path d="M{BATm_x} {bat_midy} C 640 810, 380 800, 252 654" fill="none" stroke="{bb.PURPLE}" stroke-width="3.4"/>
  <circle cx="252" cy="650" r="4" fill="{bb.PURPLE}"/>
  <text x="470" y="816" font-size="9.5" font-weight="700" fill="{bb.PURPLE}">«−» пакета → B− TP4056 (не на рельс!)</text>
  <circle cx="{BX+140}" cy="{BY+190}" r="4.5" fill="#d23b2e"/><circle cx="{BX+152}" cy="{BY+190}" r="4.5" fill="#111"/><text x="{BX+160}" y="{BY+193}" font-size="9" fill="#333">3.95В</text>'''

# провода 07
w07 = f'''<g fill="none" stroke-linecap="round">
  <path d="M{IN1p} {b1y} C {IN1p} 392, 1205 358, 1190 344" stroke="{bb.PLUS}" stroke-width="3.2"/>
  <path d="M{IN1m} {b1y} C {IN1m} 412, 1120 405, 1108 400" stroke="{bb.GNDc}" stroke-width="2.6"/>
  <path d="M{OUT1p} {b1y} C 1362 468, 1376 548, 1360 590 C 1350 608, 1338 615, {VCCp} {syy}" stroke="{bb.PLUS}" stroke-width="3.2"/>
  <path d="M{OUT1m} {b1y} C 1300 440, 1130 406, 1108 400" stroke="{bb.GNDc}" stroke-width="2.6"/>
  <path d="M{SGNDp} {syy} C 1170 624, 1090 612, 1075 600 L 1072 514" stroke="{bb.GNDc}" stroke-width="2.6"/>
  <path d="M{SKOp} {syy} C {SKOp-70} 574, {bb.colx(SIN)+30} 500, {bb.colx(SIN)} 478" stroke="#0e9488" stroke-width="3"/>
  <path d="M{NAPp} {syy} C 900 604, 470 588, {bb.colx(DIN)} 478" stroke="#0e9488" stroke-width="3"/>
  </g>
  <circle cx="1190" cy="344" r="4" fill="{bb.PLUS}"/><circle cx="1108" cy="400" r="4" fill="{bb.GNDc}"/>
  <circle cx="1072" cy="514" r="4" fill="{bb.GNDc}"/>
  <circle cx="{bb.colx(SIN)}" cy="478" r="4" fill="#0e9488"/><circle cx="{bb.colx(DIN)}" cy="478" r="4" fill="#0e9488"/>
  <text x="1214" y="378" font-size="9" font-weight="700" fill="#a03d30">IN+ ← LOAD</text>
  <text x="1358" y="502" font-size="9" font-weight="700" fill="#a03d30">12В</text>
  <text x="{bb.colx(SIN)+4}" y="466" font-size="8.5" fill="#0a7a70" text-anchor="middle">СКОР→52</text>
  <text x="600" y="600" font-size="9" font-weight="700" fill="#0a7a70">направление → кол.16</text>'''

# ================= Таблица + примечания =================
table = '''<text x="30" y="892" font-size="17" font-weight="700" fill="#1a1a1a">Полная цепь монтажа 01–07 (нижний банк = ряды f–j; синяя капсула = одна колонка = один узел):</text>
  <g font-size="13" fill="#333">
    <text x="30" y="914" fill="#c0392b">0.  <tspan font-weight="700">Прозвони рельсы и поставь 4 перемычки-моста через разрез</tspan> — иначе питание не пройдёт по длине.</text>
    <text x="30" y="934">1–3.  Адаптер «+5В» → кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan>; TP4056 <tspan font-weight="700">IN+</tspan> → кол.22; <tspan font-weight="700">D1</tspan> кол.22→кол.<tspan font-weight="700" fill="#2a6fd1">25</tspan>→«+» ШИНА. GND адаптера → «−» рельс.</text>
    <text x="30" y="954">4.  Батарея «+» → кол.<tspan font-weight="700" fill="#2a6fd1">44</tspan> → <tspan font-weight="700">F1</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">46</tspan> (<tspan font-weight="700" fill="#2e7d4f">TP_B+</tspan>) → <tspan font-weight="700">B+</tspan>. Батарея «−» → <tspan font-weight="700" fill="#8e44ad">B−</tspan> (своя перемычка!).</text>
    <text x="30" y="974">5–6.  TP4056 <tspan font-weight="700">OUT+</tspan> → Boost#2 <tspan font-weight="700">IN+</tspan>; OUT+ Boost#2 → кол.<tspan font-weight="700" fill="#2a6fd1">30</tspan> → <tspan font-weight="700">D2</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">33</tspan> → «+» ШИНА. B−/OUT−/IN− → «−» рельс.</text>
    <text x="30" y="994">7–9.  <tspan font-weight="700">C1 1000µF</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">38/40</tspan>; ШИНА → <tspan font-weight="700">SW1</tspan> → LOAD; ESP32 <tspan font-weight="700">VIN</tspan> → LOAD; <tspan font-weight="700">C2</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">17/19</tspan>; «−» верх ↔ «−» низ.</text>
    <text x="30" y="1016" fill="#c47015" font-weight="700">— Задача 05: делитель батареи —</text>
    <text x="30" y="1036">10–11. <tspan font-weight="700">R5/R6 100k</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">46→48→50</tspan>; <tspan font-weight="700">C5</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">48→50</tspan>; кол.50→GND. <tspan font-weight="700" fill="#c47015">Оранжевый</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X) → <tspan font-weight="700" fill="#c47015">GPIO32</tspan>.</text>
    <text x="30" y="1058" fill="#0e9488" font-weight="700">— Задача 06: сигнальные делители датчика —</text>
    <text x="30" y="1078">12. <tspan font-weight="700">Скорость:</tspan> 10k кол.<tspan font-weight="700" fill="#2a6fd1">52→53</tspan>, 5k кол.<tspan font-weight="700" fill="#2a6fd1">53→54</tspan>, 10k кол.<tspan font-weight="700" fill="#2a6fd1">54→56</tspan>, <tspan font-weight="700">C3</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">54→56</tspan>, кол.56→GND. Оранжевый кол.<tspan font-weight="700" fill="#2a6fd1">54</tspan> → <tspan font-weight="700" fill="#c47015">GPIO34</tspan>.</text>
    <text x="30" y="1098">13. <tspan font-weight="700">Направление:</tspan> 10k кол.<tspan font-weight="700" fill="#2a6fd1">16→17</tspan>, 5k кол.<tspan font-weight="700" fill="#2a6fd1">17→18</tspan>, 10k кол.<tspan font-weight="700" fill="#2a6fd1">18→20</tspan>, <tspan font-weight="700">C4</tspan> кол.<tspan font-weight="700" fill="#2a6fd1">18→20</tspan>, кол.20→GND. Оранжевый кол.<tspan font-weight="700" fill="#2a6fd1">18</tspan> → <tspan font-weight="700" fill="#c47015">GPIO35</tspan>.</text>
    <text x="30" y="1120" fill="#a03d30" font-weight="700">— Задача 07: датчик + питание 12В —</text>
    <text x="30" y="1140">14. <tspan font-weight="700">Boost#1</tspan> (пресет 12В): <tspan font-weight="700">IN+</tspan> → LOAD (после SW1, тот же, что VIN), <tspan font-weight="700">IN−</tspan> → «−» рельс. Проверь <tspan font-weight="700">OUT+ = 12В</tspan> ДО датчика.</text>
    <text x="30" y="1160">15. <tspan font-weight="700">Датчик:</tspan> <tspan font-weight="700" fill="#a03d30">VCC</tspan> → OUT+ Boost#1 (12В); <tspan font-weight="700">GND</tspan> → «−» рельс; сигнал скорости → кол.<tspan font-weight="700" fill="#2a6fd1">52</tspan>; сигнал направления → кол.<tspan font-weight="700" fill="#2a6fd1">16</tspan>.</text>
  </g>'''

notes = '''<rect x="30" y="1184" width="1340" height="200" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1210" font-size="13" fill="#8e44ad">⚠  <tspan font-weight="700">Минус батареи → пад B− TP4056 своей перемычкой (фиолетовый), НЕ на «−» рельс</tspan> — иначе защита DW01 отключается.</text>
  <text x="46" y="1233" font-size="13" fill="#c0392b">⚠  <tspan font-weight="700">Рельсы разрезаны — 4 перемычки-моста. Полоска (катод) обоих диодов ВПРАВО, к шине. C1 полярный.</tspan></text>
  <text x="46" y="1256" font-size="13" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя батареи (R5) — на TP_B+ (кол.46), НЕ на «+» рельс.</tspan> Делители сигнала: <tspan font-weight="700">верх 10k+5k (=15k), низ 10k</tspan> + 100нФ на узле.</text>
  <text x="46" y="1279" font-size="13" fill="#c0392b">⚠  <tspan font-weight="700">Boost#1 = 12В: НЕ подавать 12В на его вход</tspan> (вход = LOAD 4.7В). <tspan font-weight="700">VCC/GND датчика сверь с инструкцией</tspan> — перепутаешь, спалишь датчик.</text>
  <text x="46" y="1302" font-size="13" fill="#2e7d32">✓  Питание: адаптер → ШИНА 4.6–4.8В; батарея → Boost#2 OUT+ 5.14В; SW1 → LOAD/VIN 4.6–4.8В; Boost#1 OUT+ 12В.</text>
  <text x="46" y="1325" font-size="13" fill="#2e7d32">✓  АЦП: GPIO32 ≈ V_bat/2; GPIO34/35 ≈ V_датч×0.4. Все три — ADC1 (WiFi активен). Общая земля у всего.</text>
  <text x="46" y="1348" font-size="13" fill="#2a6fd1">→  <tspan font-family="ui-monospace, Consolas, monospace">http://192.168.1.223/api/data</tspan>: battery≈3.95, speed/direction — реальные. Дальше — задача 08: монтаж в корпус.</text>
  <text x="46" y="1371" font-size="11.5" fill="#999">Правый столбец: SW1 → Boost#1 (12В) → датчик (короткий отвод LOAD). Датчик — внешний, на мачте, кабель через PG7.</text>'''

title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Полная сборка (задачи 01–07) — итоговая проверка всей станции</text>
  <text x="30" y="63" font-size="14.5" fill="#666">Питание diode-OR (04) + делитель батареи→GPIO32 (05) + сигнальные делители→GPIO34/35 (06) + датчик на 12В от Boost#1 (07). Всё на одной макетке, общая земля.</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1470" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(s4.r3c, s4.r4c)}
  <rect x="0" y="0" width="1400" height="1470" fill="#ffffff"/>
  {title}
  {s4.legend}
  {s4.board}
  {s4.split}
  {node_caps}
  {s4.leds_muted}
  {esp}
  {s4.esp_wires}
  {s4.C2}{s4.C2_wires}{s4.D1}{s4.D1n}{s4.D2}{s4.C1}{s4.C1n}{s4.F1}
  {R5}{R6}{C5}
  {Rs_top1}{Rs_top2}{Rs_bot}{Rd_top1}{Rd_top2}{Rd_bot}{C3}{C4}
  {gnds}
  {s4.jumpers}{s4.SW1}{s4.SW1_wires}{s4.mm}{s4.mod_wires}
  {s4.tp4056}{s4.boost2}{s4.usbc}{s4.boost_mm}{battery}{bat_wires}
  {boost1}{boost1_lbl}{sensor}{w07}
  {sig32}{sig34}{sig35}
  {table}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "full_station.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
