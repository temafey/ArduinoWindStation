# -*- coding: utf-8 -*-
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

board, r3c, r4c = bb.breadboard(bottom="+-")   # верх+=LOAD, низ+=ШИНА

legend = bb.legend([
    ("line", bb.PLUS, "«+» / шина"),
    ("line", bb.GNDc, "GND «−»"),
    ("sw",   "#ddd",  "уже собрано (01–03)"),
    ("dot2", None,    "мультиметр"),
])

esp = bb.esp32(subtitle="питание с VIN (эта задача)", highlight=["VIN"])
# VIN/GND -> верхние рельсы (дословно из оригинала)
esp_wires = '''<line x1="105" y1="311" x2="105" y2="262" stroke="#1a1a1a" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="105" cy="262" r="4" fill="#1a1a1a"/>
  <line x1="88" y1="311" x2="88" y2="250" stroke="#d23b2e" stroke-width="4" stroke-linecap="round"/>
  <circle cx="88" cy="250" r="4.5" fill="#d23b2e"/>'''

# ---- Rail split + bridges (дословно) ----
split = '''<rect x="602" y="244" width="16" height="26" fill="#f4f0e6"/>
  <rect x="602" y="500" width="16" height="26" fill="#f4f0e6"/>
  <line x1="610" y1="240" x2="610" y2="274" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <line x1="610" y1="496" x2="610" y2="530" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <text x="610" y="236" font-size="9.5" fill="#c0392b" text-anchor="middle" font-weight="700">разрез ↕</text>
  <text x="610" y="540" font-size="9.5" fill="#c0392b" text-anchor="middle" font-weight="700">разрез ↕</text>
  <path d="M581 250 C 581 224, 649 224, 649 250" fill="none" stroke="#d23b2e" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M564 262 C 564 210, 666 210, 666 262" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>
  <path d="M581 502 C 581 548, 649 548, 649 502" fill="none" stroke="#d23b2e" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M564 514 C 564 566, 666 566, 666 514" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>
  <g fill="#d23b2e"><circle cx="581" cy="250" r="3.5"/><circle cx="649" cy="250" r="3.5"/><circle cx="581" cy="502" r="3.5"/><circle cx="649" cy="502" r="3.5"/></g>
  <g fill="#1a1a1a"><circle cx="564" cy="262" r="3.5"/><circle cx="666" cy="262" r="3.5"/><circle cx="564" cy="514" r="3.5"/><circle cx="666" cy="514" r="3.5"/></g>
  <text x="700" y="205" font-size="10.5" fill="#c0392b" font-weight="700">4 перемычки-моста через разрез</text>
  <text x="700" y="219" font-size="9.5" fill="#8a4b3f">(по одной на каждый рельс: «+»/«−», верх/низ)</text>
  <text x="1086" y="254" font-size="12" font-weight="700" fill="#d23b2e">«+» LOAD</text>
  <text x="1086" y="267" font-size="11" fill="#2a5bd7">«−» GND</text>
  <text x="1086" y="510" font-size="12" font-weight="700" fill="#d23b2e">«+» ШИНА</text>
  <text x="1086" y="523" font-size="11" fill="#2a5bd7">«−» GND</text>'''

# локальные номера колонок компонентов (дословно)
colnums = '''<g fill="rgba(42,111,209,.09)" stroke="#2a6fd1" stroke-opacity=".38" stroke-dasharray="4 3">
    <rect x="353" y="291" width="14" height="86" rx="7"/><rect x="387" y="291" width="14" height="86" rx="7"/>
    <rect x="438" y="399" width="14" height="86" rx="7"/><rect x="489" y="399" width="14" height="86" rx="7"/>
    <rect x="574" y="399" width="14" height="86" rx="7"/><rect x="625" y="399" width="14" height="86" rx="7"/>
    <rect x="710" y="399" width="14" height="86" rx="7"/><rect x="744" y="399" width="14" height="86" rx="7"/>
    <rect x="812" y="399" width="14" height="86" rx="7"/><rect x="846" y="399" width="14" height="86" rx="7"/>
  </g>
  <g font-size="10" font-weight="700" fill="#2a6fd1" text-anchor="middle">
    <text x="360" y="288">17</text><text x="394" y="288">19</text>
    <text x="445" y="396">22</text><text x="496" y="396">25</text><text x="581" y="396">30</text><text x="632" y="396">33</text>
    <text x="717" y="396">38</text><text x="751" y="396">40</text><text x="819" y="396">44</text><text x="853" y="396">46</text>
  </g>'''

# муты LED (задача 01, контекст) — стандартные формы, дословно из оригинала
leds_muted = '''<g opacity="0.32">
    <g fill="none" stroke-width="3.4" stroke-linecap="round">
      <path d="M190 311 C 190 240, 411 240, 411 298" stroke="#34c24a"/>
      <path d="M173 311 C 173 238, 547 238, 547 298" stroke="#e0a81a"/>
      <path d="M156 311 C 156 234, 683 234, 683 298" stroke="#e8873a"/>
      <path d="M207 311 C 207 246, 819 246, 819 298" stroke="#2a7de1"/>
      <path d="M224 311 C 224 250, 955 250, 955 298" stroke="#cfcfcf"/>
    </g>
    <g stroke="#1a1a1a" stroke-width="3">
      <line x1="479" y1="298" x2="479" y2="262"/><line x1="615" y1="298" x2="615" y2="262"/>
      <line x1="751" y1="298" x2="751" y2="262"/><line x1="887" y1="298" x2="887" y2="262"/><line x1="1023" y1="298" x2="1023" y2="262"/>
    </g>
    <g>
      <line x1="411" y1="298" x2="445" y2="298" stroke="#9a8f6a" stroke-width="2"/><rect x="418" y="292" width="20" height="12" rx="2" fill="#d9c79c" stroke="#9a8f6a"/>
      <line x1="547" y1="298" x2="581" y2="298" stroke="#9a8f6a" stroke-width="2"/><rect x="554" y="292" width="20" height="12" rx="2" fill="#d9c79c" stroke="#9a8f6a"/>
      <line x1="683" y1="298" x2="717" y2="298" stroke="#9a8f6a" stroke-width="2"/><rect x="690" y="292" width="20" height="12" rx="2" fill="#d9c79c" stroke="#9a8f6a"/>
      <line x1="819" y1="298" x2="853" y2="298" stroke="#9a8f6a" stroke-width="2"/><rect x="826" y="292" width="20" height="12" rx="2" fill="#d9c79c" stroke="#9a8f6a"/>
      <line x1="955" y1="298" x2="989" y2="298" stroke="#9a8f6a" stroke-width="2"/><rect x="962" y="292" width="20" height="12" rx="2" fill="#d9c79c" stroke="#9a8f6a"/>
    </g>
    <circle cx="462" cy="306" r="9" fill="#34c24a" stroke="#1c7a2e"/><circle cx="598" cy="306" r="9" fill="#f2c21a" stroke="#a6821a"/>
    <circle cx="734" cy="306" r="9" fill="#e23b2e" stroke="#8f1f16"/><circle cx="870" cy="306" r="9" fill="#34c24a" stroke="#1c7a2e"/>
    <circle cx="1006" cy="306" r="9" fill="#e23b2e" stroke="#8f1f16"/>
    <text x="700" y="250" font-size="11" fill="#666">LEDs (задача 01) — контекст</text>
  </g>'''

# --- компоненты через стандарт ---
C2  = bb.cap_ceramic(17,19,"d", label="C2 100нФ")
C2_wires = '''<line x1="360" y1="298" x2="360" y2="250" stroke="#d23b2e" stroke-width="3.4" stroke-linecap="round"/><circle cx="360" cy="250" r="4" fill="#d23b2e"/><circle cx="360" cy="298" r="3.5" fill="#d23b2e"/>
  <line x1="394" y1="298" x2="394" y2="262" stroke="#1a1a1a" stroke-width="3.4" stroke-linecap="round"/><circle cx="394" cy="262" r="4" fill="#1a1a1a"/><circle cx="394" cy="298" r="3.5" fill="#1a1a1a"/>'''
D1  = bb.diode_schottky(22,25,"g","D1 · 1N5819", cathode="right")
D1n = '<text x="440" y="450" font-size="9" fill="#c0392b">полоска (катод) ▶ к шине</text>'
D2  = bb.diode_schottky(30,33,"g","D2 · 1N5819", cathode="right")
C1  = bb.cap_electrolytic(38,40,"g","1000µF")
C1n = '<text x="734" y="452" font-size="9" fill="#c0392b" text-anchor="middle">длинная ножка = «+»</text>'
F1  = bb.ptc(44,46,"g","F1 · PTC 2A")
F1n = '<text x="880" y="450" font-size="9" fill="#2a6fd1">TP_B+ → делитель (задача 05)</text>'

# jumpers bank->bottom rails (дословно)
jumpers = '''<g stroke-linecap="round">
    <line x1="496" y1="478" x2="496" y2="506" stroke="#d23b2e" stroke-width="3.8"/><circle cx="496" cy="478" r="3.5" fill="#d23b2e"/><circle cx="496" cy="506" r="4" fill="#d23b2e"/>
    <line x1="632" y1="478" x2="632" y2="506" stroke="#d23b2e" stroke-width="3.8"/><circle cx="632" cy="478" r="3.5" fill="#d23b2e"/><circle cx="632" cy="506" r="4" fill="#d23b2e"/>
    <line x1="717" y1="478" x2="717" y2="506" stroke="#d23b2e" stroke-width="3.8"/><circle cx="717" cy="478" r="3.5" fill="#d23b2e"/><circle cx="717" cy="506" r="4" fill="#d23b2e"/>
    <line x1="751" y1="478" x2="751" y2="518" stroke="#1a1a1a" stroke-width="3.6"/><circle cx="751" cy="478" r="3.5" fill="#1a1a1a"/><circle cx="751" cy="518" r="4" fill="#1a1a1a"/>
  </g>
  <path d="M1040 262 C 1108 262, 1108 518, 1040 518" fill="none" stroke="#1a1a1a" stroke-width="3.6"/>
  <circle cx="1040" cy="262" r="4" fill="#1a1a1a"/><circle cx="1040" cy="518" r="4" fill="#1a1a1a"/>
  <text x="1118" y="394" font-size="10.5" fill="#555">общий GND</text>'''

# SW1 + провода (дословно провода)
SW1 = bb.switch_rocker(1190,326,150,80,
    terminals=[(1190,344,"LOAD"),(1190,390,"ШИНА")],
    title="SW1", subtitle="клавишный выключатель · на проводах")
SW1_wires = '''<path d="M1006 506 C 1130 506, 1150 400, 1190 390" fill="none" stroke="#d23b2e" stroke-width="3.8"/>
  <circle cx="1006" cy="506" r="4" fill="#d23b2e"/>
  <text x="1044" y="480" font-size="9.5" fill="#c0392b">от ШИНЫ</text>
  <path d="M1006 250 C 1130 250, 1150 335, 1190 344" fill="none" stroke="#d23b2e" stroke-width="3.8"/>
  <circle cx="1006" cy="250" r="4" fill="#d23b2e"/>
  <text x="1040" y="240" font-size="9.5" fill="#c0392b">на LOAD</text>'''

mm = '''<circle cx="930" cy="506" r="5" fill="#d23b2e"/><circle cx="942" cy="506" r="5" fill="#111"/>
  <text x="952" y="497" font-size="10" fill="#333">ШИНА: 4.6–4.8В</text>
  <circle cx="660" cy="250" r="5" fill="#d23b2e"/><circle cx="672" cy="250" r="5" fill="#111"/>
  <text x="682" y="244" font-size="10" fill="#333">LOAD: 4.6–4.8В (SW1 вкл)</text>'''

# module->board wires (дословно)
# провода: все пады на верхней кромке — соединяются сверху (не прячутся под модулем)
mod_wires = '''<g fill="none" stroke-linecap="round">
    <path d="M605 650 C 605 572, 468 560, 445 478" stroke="#d23b2e" stroke-width="3.6"/>
    <path d="M120 650 C 120 556, 388 546, 445 460" stroke="#d23b2e" stroke-width="3.4"/>
    <path d="M276 650 C 276 582, 838 592, 853 478" stroke="#d23b2e" stroke-width="3.2"/>
    <path d="M300 650 C 322 616, 356 616, 378 650" stroke="#d23b2e" stroke-width="3.6"/>
    <path d="M486 650 C 486 574, 575 560, 581 478" stroke="#d23b2e" stroke-width="3.4"/>
    <path d="M148 650 C 141 596, 155 566, 148 526" stroke="#1a1a1a" stroke-width="3"/>
    <path d="M228 650 C 221 596, 235 566, 228 526" stroke="#1a1a1a" stroke-width="3"/>
    <path d="M406 650 C 399 596, 413 566, 406 526" stroke="#1a1a1a" stroke-width="3"/>
    <path d="M514 650 C 507 596, 521 566, 514 526" stroke="#1a1a1a" stroke-width="3"/>
    <path d="M675 650 C 668 600, 682 560, 675 526" stroke="#1a1a1a" stroke-width="3"/>
  </g>
  <g fill="#d23b2e"><circle cx="445" cy="478" r="4"/><circle cx="445" cy="460" r="4"/><circle cx="581" cy="478" r="4"/><circle cx="819" cy="478" r="4"/><circle cx="853" cy="478" r="4"/></g>
  <g fill="#1a1a1a"><circle cx="148" cy="526" r="4"/><circle cx="228" cy="526" r="4"/><circle cx="406" cy="526" r="4"/><circle cx="514" cy="526" r="4"/><circle cx="675" cy="526" r="4"/></g>'''

# модули (стандарт — реалистичные PCB, как ESP32)
# TP4056: пады сверху; USB-C ПО ЦЕНТРУ (кол.200) между входом (IN±, слева) и батарея/выход (справа)
tp4056 = bb.mod_tp4056(90,650,220,150, usb_cx=200,
    pins=[(120,"IN+",bb.PLUS),(148,"IN−",bb.PAD_GNDp),
          (228,"OUT−",bb.PAD_GNDp),(252,"B−",bb.PURPLE),(276,"B+",bb.PLUS),(300,"OUT+",bb.PLUS)])
# MT3608: пады сверху; ВХОД (IN±) слева, ВЫХОД (OUT±) справа, дроссель по центру
boost2 = bb.mod_boost(350,650,190,150,
    pins=[(378,"IN+",bb.PLUS),(406,"IN−",bb.PAD_GNDp),(486,"OUT+",bb.PLUS),(514,"OUT−",bb.PAD_GNDp)])
usbc = bb.mod_usb_c(580,650,150,150,
    pins=[(605,"+5В",bb.PLUS),(675,"GND",bb.GNDc)])
boost_mm = '<circle cx="492" cy="610" r="4.5" fill="#d23b2e"/><circle cx="503" cy="610" r="4.5" fill="#111"/><text x="511" y="607" font-size="8.5" fill="#333">5.14В</text>'

# батарея (стандарт) + связи (batt+ -> кол.44, batt- -> B-)
BAT_X, BAT_Y = 760, 650
battery = bb.battery_pack(BAT_X, BAT_Y,
    minus_net_color=bb.PURPLE, minus_label="«−» → B− (не на рельс!)")
bat_plus_x = BAT_X+453; bat_minus_x = BAT_X+67; bat_mid = BAT_Y+68+35
bat_wires = f'''<path d="M{bat_plus_x} {bat_mid} C {bat_plus_x} 560, 900 536, 819 482" fill="none" stroke="#d23b2e" stroke-width="3.6"/>
  <circle cx="819" cy="478" r="4" fill="#d23b2e"/>
  <text x="1010" y="600" font-size="10.5" font-weight="700" fill="#d23b2e">«+» пакета → кол.44</text>
  <path d="M{bat_minus_x} {bat_mid} C 660 812, 380 812, 252 650" fill="none" stroke="{bb.PURPLE}" stroke-width="3.6"/>
  <circle cx="252" cy="650" r="4" fill="{bb.PURPLE}"/>
  <circle cx="1300" cy="835" r="5" fill="#d23b2e"/><circle cx="1312" cy="835" r="5" fill="#111"/>
  <text x="1322" y="831" font-size="10" fill="#333">3.95В</text>'''

hint = '<text x="200" y="828" font-size="9.5" fill="#999" text-anchor="middle">как выглядит реальный модуль — нажми на него (фото)</text>'

# ---- Wiring table + notes (дословно) ----
table = '''<text x="30" y="892" font-size="17" font-weight="700" fill="#1a1a1a">Порядок монтажа (нижний банк = ряды f–j; синие капсулы = одна колонка = один узел):</text>
  <g font-size="13.5" fill="#333">
    <text x="30" y="915" fill="#c0392b">0.  <tspan font-weight="700">Прозвони рельсы и поставь 4 перемычки-моста через середину</tspan> (показаны дугами) — иначе питание не пройдёт по длине.</text>
    <text x="30" y="937">1.  Адаптер «+5В» → кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan> (ряд j).   Адаптер «GND» → «−» нижний рельс.</text>
    <text x="30" y="959">2.  TP4056 <tspan font-weight="700">IN+</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan> (ряд i).   <tspan font-weight="700">IN−</tspan> → «−» рельс.</text>
    <text x="30" y="981">3.  <tspan font-weight="700">D1</tspan>: анод кол.<tspan font-weight="700" fill="#2a6fd1">22</tspan>, катод (полоска) кол.<tspan font-weight="700" fill="#2a6fd1">25</tspan> → перемычка на «+» НИЖНИЙ рельс.</text>
    <text x="30" y="1003">4.  Батарея «+» → кол.<tspan font-weight="700" fill="#2a6fd1">44</tspan> → <tspan font-weight="700">F1 PTC</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">46</tspan> → TP4056 <tspan font-weight="700">B+</tspan>.   Батарея «−» → TP4056 <tspan font-weight="700" fill="#8e44ad">B−</tspan> (своя перемычка!).</text>
    <text x="30" y="1025">5.  TP4056 <tspan font-weight="700">OUT+</tspan> → Boost#2 <tspan font-weight="700">IN+</tspan>.   B−, OUT−, IN−/OUT− Boost → «−» рельс.</text>
    <text x="30" y="1047">6.  Boost#2 <tspan font-weight="700">OUT+</tspan> → кол.<tspan font-weight="700" fill="#2a6fd1">30</tspan>.   <tspan font-weight="700">D2</tspan>: анод кол.30, катод кол.<tspan font-weight="700" fill="#2a6fd1">33</tspan> → «+» НИЖНИЙ рельс.</text>
    <text x="30" y="1069">7.  <tspan font-weight="700">C1 1000µF</tspan>: «+» кол.<tspan font-weight="700" fill="#2a6fd1">38</tspan> → «+» рельс;  «−» кол.<tspan font-weight="700" fill="#2a6fd1">40</tspan> → «−» рельс.</text>
    <text x="30" y="1091">8.  «+» НИЖНИЙ рельс → <tspan font-weight="700">SW1</tspan> → «+» ВЕРХНИЙ рельс (LOAD).</text>
    <text x="30" y="1113">9.  ESP32 <tspan font-weight="700">VIN</tspan> → «+» ВЕРХНИЙ рельс.   <tspan font-weight="700">C2 100нФ</tspan>: кол.<tspan font-weight="700" fill="#2a6fd1">17</tspan> → «+» верх, кол.<tspan font-weight="700" fill="#2a6fd1">19</tspan> → «−» верх.</text>
    <text x="30" y="1135">10. Перемычка «−» верхний рельс ↔ «−» нижний рельс (общий GND).</text>
  </g>'''

notes = '''<rect x="30" y="1158" width="1340" height="206" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="1184" font-size="13.5" fill="#8e44ad">⚠  <tspan font-weight="700">Минус батареи → на пад B− TP4056, СВОЕЙ перемычкой (фиолетовый).</tspan> НЕ на общий «−» рельс — иначе защита DW01 отключается. IN−/OUT− TP4056 — да, на «−» рельс.</text>
  <text x="46" y="1208" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">РЕЛЬСЫ 830-макетки разрезаны посередине!</tspan> Прозвони каждый и поставь <tspan font-weight="700">по перемычке-мосту на все 4 рельса</tspan>.</text>
  <text x="46" y="1232" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Полоска (катод) обоих диодов — ВПРАВО, к шине.</tspan> Перепутаешь — питания на шине не будет.</text>
  <text x="46" y="1256" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">C1 полярный</tspan>: длинная ножка «+» → «+» рельс; светлая полоса «−» → GND. Наоборот — вздуется.</text>
  <text x="46" y="1280" font-size="13.5" fill="#c0392b">⚠  <tspan font-weight="700">Батарею НЕЛЬЗЯ вести напрямую на шину</tspan> — только через TP4056 → Boost#2. 3.95В на VIN уронят ESP32 в brownout.</text>
  <text x="46" y="1304" font-size="13.5" fill="#2e7d32">✓  Проверка: 1) только адаптер → ШИНА 4.6–4.8В.  2) вставь батарею → Boost#2 OUT+ = 5.14В.  3) выдерни адаптер → ШИНА держится.</text>
  <text x="46" y="1328" font-size="13.5" fill="#2a6fd1">→  4) включи SW1 → верхний рельс и VIN = 4.6–4.8В, ESP32 стартует без USB.  Кол.46 (TP_B+) — точка делителя батареи (задача 05).</text>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1400" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c,r4c)}
  <rect x="0" y="0" width="1400" height="1400" fill="#ffffff"/>
  <text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Задача 04 — Силовая шина (diode-OR): вид макетки</text>
  <text x="30" y="63" font-size="14.5" fill="#666">НИЖНИЙ «+» рельс = ШИНА 4.7В (до тумблера).  ВЕРХНИЙ «+» рельс = LOAD (после тумблера) → VIN ESP32.  Оба «−» рельса = общий GND.</text>
  {legend}
  {board}
  {split}
  {colnums}
  {leds_muted}
  {esp}
  {esp_wires}
  {C2}
  {C2_wires}
  {D1}
  {D1n}
  {D2}
  {C1}
  {C1n}
  {F1}
  {F1n}
  {jumpers}
  {SW1}
  {SW1_wires}
  {mm}
  {mod_wires}
  {tp4056}
  {boost2}
  {usbc}
  {boost_mm}
  {battery}
  {bat_wires}
  {hint}
  {table}
  {notes}
</svg>
'''
out = os.path.join(os.path.dirname(__file__), "step04_power_rail.svg")
with open(out,"w",encoding="utf-8") as f: f.write(svg)
print("wrote", out, len(svg), "bytes")
