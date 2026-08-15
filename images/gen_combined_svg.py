# -*- coding: utf-8 -*-
"""ПОЛНАЯ сборка 04+05 на одной макетке — для итоговой проверки.
Силовая шина (04) переиспользуется ИЗ gen_step04_svg (байт-в-байт),
поверх добавляется делитель батареи (05): R5/R6/C5 на кол.46–50 и сигнал → GPIO32.
Кол.46 = TP_B+ (после F1) — общий узел: B+ TP4056 + выход F1 + верх делителя R5."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb
import gen_step04_svg as s4   # переиспуем блоки силовой шины (импорт также регенерит step04 SVG)

# ---- ESP32: подсвечиваем ОБА активных пина — VIN (питание, 04) и GPIO32 (сигнал, 05) ----
esp = bb.esp32(
    subtitle="VIN ← LOAD (04)  ·  GPIO32 → делитель (05)",
    highlight=["VIN", "32"],
    adc_callout="↑ 32 — батарея (05) · 34/35 — скорость/направление (06)")

# ---- Делитель батареи (05) на свободных кол.46–50 ----
c46, c48, c50 = bb.colx(46), bb.colx(48), bb.colx(50)   # 853, 887, 921
gpio32_x = bb.PIN_TOP["32"]                              # 241
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]

R5 = bb.resistor(46, 48, "f", B100K, label="R5", label_dy=-9)   # верх делителя: TP_B+ → узел X
R6 = bb.resistor(48, 50, "h", B100K, label="R6", label_dy=-9)   # низ делителя:  узел X → кол.50
C5 = bb.cap_ceramic(48, 50, "i", label="C5")                    # фильтр на узле X

# капсулы узлов делителя + подпись «узел X»
div_caps = f'''<g fill="rgba(42,111,209,.10)" stroke="#2a6fd1" stroke-opacity=".5" stroke-dasharray="4 3">
    <rect x="{c48-7}" y="399" width="14" height="86" rx="7"/></g>
  <rect x="{c50-7}" y="399" width="14" height="86" rx="7" fill="rgba(31,33,38,.06)" stroke="#777" stroke-opacity=".5" stroke-dasharray="4 3"/>
  <g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">
    <text x="{c48}" y="396">48</text><text x="{c50}" y="396">50</text>
    <text x="{c48}" y="497">узел X</text></g>'''

# значения делителя (компактно, справа от него)
divlabel = f'''<text x="948" y="410" font-size="11" font-weight="700" fill="{bb.COPPER}">R5, R6 = 100k</text>
  <text x="948" y="426" font-size="11" fill="{bb.COPPER}">C5 = 100нФ («104»)</text>'''

# перемычка кол.50 → «−» нижний рельс (GND)
gnd_jmp = f'''<line x1="{c50}" y1="478" x2="{c50}" y2="514" stroke="{bb.GNDc}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="{c50}" cy="478" r="3.5" fill="{bb.GNDc}"/><circle cx="{c50}" cy="514" r="4" fill="{bb.GNDc}"/>'''

# сигнальный провод: узел X (кол.48, ряд j) → GPIO32. Высокая дуга над платой (выше подписей мостов).
sig = f'''<path d="M{c48} 478 C 990 440, 1000 175, 880 150 C 640 108, 360 120, {gpio32_x} 305"
    fill="none" stroke="{bb.SIG}" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="{c48}" cy="478" r="4" fill="{bb.SIG}"/>
  <text x="915" y="146" font-size="10.5" font-weight="700" fill="#c47015">оранжевый: узел X (кол.48) → GPIO32</text>'''

mm_gpio = bb.mm_point(958, 452, "GPIO32 ≈ V_bat/2 ≈ 1.98В")

# ---- Сводная таблица монтажа (вся цепь 04 → 05) ----
table = '''<text x="30" y="892" font-size="17" font-weight="700" fill="#1a1a1a">Полная цепь монтажа (нижний банк = ряды f–j; синяя капсула = одна колонка = один узел):</text>
  <g font-size="13.5" fill="#333">
    <text x="30" y="915" fill="#c0392b">0.  <tspan font-weight="700">Прозвони рельсы и поставь 4 перемычки-моста через разрез</tspan> (дуги) — иначе питание не пройдёт по длине.</text>
    <text x="30" y="937">1.  Адаптер «+5В» → кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan> (ряд j).  «GND» → «−» нижний рельс.</text>
    <text x="30" y="959">2.  TP4056 <tspan font-weight="700">IN+</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan> (ряд i).  <tspan font-weight="700">IN−</tspan> → «−» рельс.</text>
    <text x="30" y="981">3.  <tspan font-weight="700">D1</tspan>: анод кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan>, катод (полоска) кол.<tspan font-weight="700" fill="#2a6fd1">25</tspan> → перемычка на «+» НИЖНИЙ рельс (ШИНА).</text>
    <text x="30" y="1003">4.  Батарея «+» → кол.<tspan font-weight="700" fill="#2a6fd1">44</tspan> → <tspan font-weight="700">F1 PTC</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">46</tspan> (<tspan font-weight="700" fill="#2e7d4f">TP_B+</tspan>) → TP4056 <tspan font-weight="700">B+</tspan>.  Батарея «−» → <tspan font-weight="700" fill="#8e44ad">B−</tspan> (своя перемычка!).</text>
    <text x="30" y="1025">5.  TP4056 <tspan font-weight="700">OUT+</tspan> → Boost#2 <tspan font-weight="700">IN+</tspan>.  B−, OUT−, IN−/OUT− Boost → «−» рельс.</text>
    <text x="30" y="1047">6.  Boost#2 <tspan font-weight="700">OUT+</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">30</tspan>.  <tspan font-weight="700">D2</tspan>: анод кол.30, катод кол.<tspan font-weight="700" fill="#2a6fd1">33</tspan> → «+» НИЖНИЙ рельс.</text>
    <text x="30" y="1069">7.  <tspan font-weight="700">C1 1000µF</tspan>: «+» кол.<tspan font-weight="700" fill="#2a6fd1">38</tspan> → «+» рельс;  «−» кол.<tspan font-weight="700" fill="#2a6fd1">40</tspan> → «−» рельс.</text>
    <text x="30" y="1091">8.  «+» НИЖНИЙ рельс (ШИНА) → <tspan font-weight="700">SW1</tspan> → «+» ВЕРХНИЙ рельс (LOAD).</text>
    <text x="30" y="1113">9.  ESP32 <tspan font-weight="700">VIN</tspan> → «+» ВЕРХНИЙ рельс.  <tspan font-weight="700">C2 100нФ</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">17</tspan> → «+» верх, кол.<tspan font-weight="700" fill="#2a6fd1">19</tspan> → «−» верх.  Перемычка «−» верх ↔ «−» низ.</text>
    <text x="30" y="1141" fill="#c47015" font-weight="700">— Задача 05: делитель батареи —</text>
    <text x="30" y="1163">10. <tspan font-weight="700">R5 100k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">46</tspan> (<tspan font-weight="700" fill="#2e7d4f">TP_B+</tspan>) → кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X).  <tspan font-weight="700">R6 100k</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan>.</text>
    <text x="30" y="1185">11. <tspan font-weight="700">C5 100нФ</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan>.  Перемычка кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan> → «−» рельс.  <tspan font-weight="700" fill="#c47015">Оранжевый</tspan>: кол.48 (узел X) → <tspan font-weight="700" fill="#c47015">GPIO32</tspan>.</text>
  </g>'''

notes = '''<rect x="30" y="1208" width="1340" height="196" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1234" font-size="13.5" fill="#8e44ad">⚠  <tspan font-weight="700">Минус батареи → на пад B− TP4056 своей перемычкой (фиолетовый), НЕ на общий «−» рельс</tspan> — иначе защита DW01 отключается.</text>
  <text x="46" y="1258" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Рельсы 830-макетки разрезаны посередине</tspan> — 4 перемычки-моста. <tspan font-weight="700">Полоска (катод) обоих диодов — ВПРАВО, к шине.</tspan> <tspan font-weight="700">C1 полярный.</tspan></text>
  <text x="46" y="1282" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя (R5) — на TP_B+ (кол.46, ПОСЛЕ предохранителя), НЕ на «+» рельс.</tspan> Иначе API покажет 4.7В шины, а не батарею.</text>
  <text x="46" y="1306" font-size="13.5" fill="#2e7d32">✓  Питание: 1) только адаптер → ШИНА 4.6–4.8В.  2) вставь батарею → Boost#2 OUT+ = 5.14В.  3) выдерни адаптер → ШИНА держится.</text>
  <text x="46" y="1330" font-size="13.5" fill="#2e7d32">✓  Делитель: GPIO32 ≈ V_bat/2 (при 3.95В → ~1.98В).  <tspan fill="#2a6fd1">http://192.168.1.223/api/data</tspan> → "battery" ≈ 3.95, "batteryPercent" ≈ 64%.</text>
  <text x="46" y="1354" font-size="13.5" fill="#2a6fd1">→  battery = 0.00 → R5 не дошёл до кол.46.  battery ≈ 9.xx → R6 не на GND (кол.50).  Скачет → нет C5.  Дальше — задача 06 (GPIO34/35).</text>'''

title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Полная сборка (задачи 04 + 05) — проверь всё вместе</text>
  <text x="30" y="63" font-size="14.5" fill="#666">Силовая шина diode-OR (04) + делитель батареи 100k/100k → GPIO32 (05) на одной макетке. Кол.46 = TP_B+ — общий узел B+ TP4056, выхода F1 и верха делителя.</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1420" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(s4.r3c, s4.r4c)}
  <rect x="0" y="0" width="1400" height="1420" fill="#ffffff"/>
  {title}
  {s4.legend}
  {s4.board}
  {s4.split}
  {s4.colnums}
  {div_caps}
  {s4.leds_muted}
  {esp}
  {s4.esp_wires}
  {s4.C2}
  {s4.C2_wires}
  {s4.D1}
  {s4.D1n}
  {s4.D2}
  {s4.C1}
  {s4.C1n}
  {s4.F1}
  {R5}
  {R6}
  {C5}
  {gnd_jmp}
  {s4.jumpers}
  {s4.SW1}
  {s4.SW1_wires}
  {s4.mm}
  {s4.mod_wires}
  {s4.tp4056}
  {s4.boost2}
  {s4.usbc}
  {s4.boost_mm}
  {s4.battery}
  {s4.bat_wires}
  {sig}
  {table}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "combined_full.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
