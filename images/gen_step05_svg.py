# -*- coding: utf-8 -*-
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

board, r3c, r4c = bb.breadboard(bottom="+-")

# колонки делителя
c44,c46,c48,c50 = bb.colx(44),bb.colx(46),bb.colx(48),bb.colx(50)
NODE = c48   # узел X
gpio32_x = bb.PIN_TOP["32"]   # =241

legend = bb.legend([
    ("line", bb.PLUS,  "«+» / TP_B+"),
    ("line", bb.GNDc,  "GND «−»"),
    ("line", bb.SIG,   "сигнал → GPIO32"),
    ("sw",   bb.PAD_ADC,"АЦП-пины"),
    ("sw",   "#ddd",   "уже собрано (01–04)"),
    ("dot2", None,     "мультиметр"),
])

esp = bb.esp32(subtitle="GPIO32 → делитель батареи (эта задача)",
               highlight=["32"],
               adc_callout="↑ 32 — батарея (эта задача) · 34/35 — скорость/направление (шаг 06)")

# F1 PTC (контекст, приглушён) col44->col46, ряд g
f1 = f'''<g opacity="0.4">
  <line x1="{c44}" y1="424" x2="{c44+5}" y2="414" stroke="#8d8d8d" stroke-width="2.4"/>
  <line x1="{c46}" y1="424" x2="{c46-5}" y2="414" stroke="#8d8d8d" stroke-width="2.4"/>
  <rect x="{c44+1}" y="386" width="32" height="28" rx="12" fill="#e3c74a" stroke="#a8862c"/>
  <text x="{c44+17}" y="404" font-size="8" fill="#4a3a10" text-anchor="middle">PTC</text>
  <circle cx="{c44}" cy="424" r="3.4" fill="#333"/><circle cx="{c46}" cy="424" r="3.4" fill="#333"/>
  <text x="{c44+17}" y="378" font-size="10" font-weight="700" fill="#8a6d3b" text-anchor="middle">F1 · PTC 2A</text>
  <line x1="{c44}" y1="424" x2="{c44}" y2="498" stroke="#d23b2e" stroke-width="3"/>
  <circle cx="{c44}" cy="498" r="3.5" fill="#d23b2e"/>
</g>'''

# делитель (100k = 5 полос: коричневый-чёрный-чёрный-оранжевый-коричневый)
B100K = ["#7a4a12","#1a1a1a","#1a1a1a","#e8873a","#7a4a12"]
R5 = bb.resistor(46,48,"f", B100K, label="R5", label_dy=-9)
R6 = bb.resistor(48,50,"h", B100K, label="R6", label_dy=-9)
C5 = bb.cap_ceramic(48,50,"i", label="C5")
# значения — компактной подписью справа от делителя
divlabel = f'''<text x="945" y="428" font-size="11" font-weight="700" fill="{bb.COPPER}">R5, R6 = 100k</text>
  <text x="945" y="444" font-size="11" fill="{bb.COPPER}">C5 = 100нФ («104»)</text>'''

# капсулы колонок
caps = f'''<rect x="{NODE-7}" y="399" width="14" height="86" rx="7" fill="rgba(42,111,209,.10)" stroke="#2a6fd1" stroke-opacity=".5" stroke-dasharray="4 3"/>
  <text x="{NODE}" y="497" font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">узел X (кол.48)</text>
  <rect x="{c50-7}" y="399" width="14" height="86" rx="7" fill="rgba(31,33,38,.06)" stroke="#777" stroke-opacity=".5" stroke-dasharray="4 3"/>'''

# локальные номера колонок делителя
colnums = f'''<g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">
  <text x="{c44}" y="396">44</text><text x="{c46}" y="396">46</text><text x="{NODE}" y="396">48</text><text x="{c50}" y="396">50</text></g>'''

# перемычка узел GND-tie -> нижний − рельс
gnd_jmp = f'''<line x1="{c50}" y1="478" x2="{c50}" y2="514" stroke="{bb.GNDc}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="{c50}" cy="478" r="3.5" fill="{bb.GNDc}"/><circle cx="{c50}" cy="514" r="4" fill="{bb.GNDc}"/>'''

# сигнальный провод: узел X (низ, ряд j) -> GPIO32 pad. Обходим стек справа, затем дуга над платой к пину.
sig = f'''<path d="M{NODE} 478 C 980 450, 980 250, 820 200 C 640 140, 380 160, {gpio32_x} 305" fill="none" stroke="{bb.SIG}" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="{NODE}" cy="478" r="4" fill="{bb.SIG}"/>'''

# TP_B+ выноска
tpbplus = f'''<path d="M{c46} 414 C {c46} 356, 700 356, 660 372" fill="none" stroke="#2e7d4f" stroke-width="1.6" stroke-dasharray="4 3"/>
  <circle cx="{c46}" cy="414" r="3" fill="#2e7d4f"/>
  <text x="656" y="360" font-size="11" font-weight="700" fill="#2e7d4f" text-anchor="end">кол.46 = TP_B+ (после PTC) — сюда верх делителя</text>'''

mm_x = bb.mm_point(1000,470,"GPIO32 ≈ V_bat/2 ≈ 1.98В")
mm_bat = bb.mm_point(600,760,"V_bat ≈ 3.95В")

battery = bb.battery_pack(90,600,
    title="2×18650 LG HG2 · ПАРАЛЛЕЛЬ (задача 03 ✓)",
    sub="источник, чьё напряжение меряет делитель · пакет ~3.95В")
# batt+ -> F1/col44 (muted). Старт от плюсового вывода пакета (x+453).
batt_wire = f'''<path d="M{90+453} 703 C 720 660, 800 560, {c44} 508" fill="none" stroke="#d23b2e" stroke-width="3" opacity="0.5"/>
  <text x="600" y="600" font-size="10.5" fill="#a03d30">«+» пакета → F1 → кол.44/46 (TP_B+)</text>'''

fw = f'''<g font-size="12" fill="#333">
  <rect x="740" y="600" width="443" height="205" rx="10" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="760" y="628" font-size="13.5" font-weight="700" fill="#8a6d3b">Как это считает прошивка</text>
  <text x="760" y="654" font-family="ui-monospace, Consolas, monospace" font-size="11.5" fill="#444">V_GPIO32 = V_bat × 100k/(100k+100k) = V_bat × 0.5</text>
  <text x="760" y="678" font-family="ui-monospace, Consolas, monospace" font-size="11.5" fill="#444">V_bat = V_GPIO32 × BATTERY_DIVIDER_RATIO (=2.0)</text>
  <text x="760" y="706" font-size="11.5" fill="#2e7d4f">3.95В → GPIO32 1.98В → "battery":3.95, "batteryPercent":64%</text>
  <text x="760" y="728" font-size="11" fill="#777">0% = 3.5В, 100% = 4.2В (BATTERY_MIN/MAX в .ino)</text>
  <text x="760" y="748" font-size="11" fill="#777">readBattery() усредняет и обновляет раз в 30 сек</text>
</g>'''

steps = '''<text x="30" y="850" font-size="17" font-weight="700" fill="#1a1a1a">Порядок монтажа (нижний банк, ряды f–j; синяя капсула = одна колонка = один узел):</text>
  <g font-size="13.5" fill="#333">
    <text x="30" y="874">1.  <tspan font-weight="700">R5 (100k)</tspan>: одна ножка в кол.<tspan font-weight="700" fill="#2a6fd1">46</tspan> (= TP_B+, туда уже приходит F1), вторая — в кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X).</text>
    <text x="30" y="896">2.  <tspan font-weight="700">R6 (100k)</tspan>: одна ножка в кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X), вторая — в кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan>.</text>
    <text x="30" y="918">3.  <tspan font-weight="700">C5 (100нФ, «104»)</tspan>: одна ножка в кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X), вторая — в кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan>. Полярности нет.</text>
    <text x="30" y="940">4.  Перемычка кол.<tspan font-weight="700" fill="#2a6fd1">50</tspan> → «−» нижний рельс (GND).</text>
    <text x="30" y="962">5.  <tspan font-weight="700" fill="#c47015">Оранжевый провод</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">48</tspan> (узел X) → пин <tspan font-weight="700" fill="#c47015">GPIO32</tspan> на верхнем ряду ESP32 (10-й пин слева, голубой АЦП).</text>
    <text x="30" y="984">6.  Проверка мультиметром: на GPIO32 ≈ V_bat/2 (при 3.95В → ~1.98В).</text>
    <text x="30" y="1006">7.  Открой <tspan font-family="ui-monospace, Consolas, monospace" fill="#2a6fd1">http://192.168.1.223/api/data</tspan> — поле <tspan font-family="ui-monospace, Consolas, monospace">"battery"</tspan> ≈ реальному (±0.1В).</text>
  </g>'''

notes = '''<rect x="30" y="1030" width="1340" height="150" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1056" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя (R5) — на TP_B+ (кол.46, ПОСЛЕ предохранителя), НЕ на «+» рельс.</tspan> Иначе покажет напряжение шины 4.7В, а не батарею.</text>
  <text x="46" y="1080" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">GPIO32 — это ADC1, только вход</tspan> (голубой пин на верхнем ряду). В прошивке читается через analogReadMilliVolts(PIN_BATTERY).</text>
  <text x="46" y="1104" font-size="13.5" fill="#8a6d3b">•  <tspan font-weight="700">Оба резистора 100k одинаковые</tspan> (5 полос: коричневый-чёрный-чёрный-оранжевый-коричневый). Порядок R5/R6 неважен, но верх обязан идти к TP_B+.</text>
  <text x="46" y="1128" font-size="13.5" fill="#2e7d32">✓  <tspan font-weight="700">battery = 0.00</tspan> → R5 не дошёл до кол.46.  <tspan font-weight="700">battery ≈ 9.xx</tspan> → R6 не на GND (кол.50).  <tspan font-weight="700">Скачет</tspan> → нет C5.</text>
  <text x="46" y="1152" font-size="13.5" fill="#2a6fd1">→  После задачи 05 поля "battery"/"batteryPercent" в дашборде живые. Дальше — задача 06: делители 10k+5k/10k (GPIO34/35).</text>
  <text x="46" y="1173" font-size="11.5" fill="#999">Нажми на любую деталь на схеме — откроется её фото. ESP32 — точная распиновка DOIT DevKit V1 (30-pin), пины с двух сторон.</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1200" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c,r4c)}
  <rect x="0" y="0" width="1400" height="1200" fill="#ffffff"/>
  <text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Задача 05 — Делитель батареи (100k/100k → GPIO32): вид макетки</text>
  <text x="30" y="63" font-size="14.5" fill="#666">Берём напряжение с TP_B+ (кол.46, ПОСЛЕ предохранителя). Два 100k пополам, средняя точка → GPIO32. Конденсатор 100нФ гасит помехи.</text>
  {legend}
  {board}
  {colnums}
  {caps}
  {f1}
  {esp}
  {tpbplus}
  {R5}
  {R6}
  {C5}
  {divlabel}
  {gnd_jmp}
  {sig}
  {mm_x}
  {battery}
  {batt_wire}
  {mm_bat}
  {fw}
  {steps}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "step05_battery_divider.svg")
with open(out,"w",encoding="utf-8") as f: f.write(svg)
print("wrote", out, len(svg), "bytes")
