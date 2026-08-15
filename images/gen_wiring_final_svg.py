# -*- coding: utf-8 -*-
"""КАРТА ОТВЕРСТИЙ И ПЕРЕМЫЧЕК — финальный монтаж на жёстком проводе 22 AWG.

Отличие от step04/full_station: там провода нарисованы плавными дугами (нагляднее
электрически). Здесь — так, как провод ляжет ФИЗИЧЕСКИ: жёсткий 22 AWG, прижатый
к плате, гнётся только под 90°. У каждого конца указан точный адрес «колонка+ряд».
Цель — перетыкание всей сборки в свежие отверстия и таблица длин для нарезки.

Сознательное отступление от images/BREADBOARD-STANDARD.md §4.2 («дуги плавные»):
в этом документе прямые углы — это и есть предмет документа.

Топология НЕ меняется: колонки и номиналы те же, что в full-sensor-2.html.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

MM = 2.54 / 17.0                      # 1 px = 0.1494 мм (шаг макетки 17 px = 2.54 мм)
RAIL_TP, RAIL_TM = 250, 262           # верхние рельсы: «+» LOAD / «−» GND
RAIL_BP, RAIL_BM = 506, 518           # нижние рельсы:  «+» ШИНА / «−» GND
TEAL = "#0e9488"                      # провода датчика
SIG  = bb.SIG                         # сигнал в АЦП
GND  = bb.GNDc
PLUS = bb.PLUS

def X(c):   return bb.colx(c)
def Y(r):   return bb.ROWY[r]
def H(c,r): return (X(c), Y(r))

# ─────────────────────────────────────────────────────────── реестр проводов
WIRES = []   # для таблицы нарезки

def plen(pts):
    return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
               for i in range(len(pts)-1))

def dpath(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)

def wire(pts, color, name, frm, to, group, w=2.8, dots="both",
         opacity=1.0, dash=None, tally=True, note="", cut=None):
    """Жёсткая перемычка: ломаная только под 90°. dots: both|start|end|none."""
    da = f' stroke-dasharray="{dash}"' if dash else ""
    op = f' opacity="{opacity}"' if opacity != 1.0 else ""
    s = (f'<path d="{dpath(pts)}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round"{da}{op}/>')
    r = max(2.9, w * 1.25)
    if dots in ("both", "start"):
        s += f'<circle cx="{pts[0][0]:.1f}" cy="{pts[0][1]:.1f}" r="{r:.1f}" fill="{color}"{op}/>'
    if dots in ("both", "end"):
        s += f'<circle cx="{pts[-1][0]:.1f}" cy="{pts[-1][1]:.1f}" r="{r:.1f}" fill="{color}"{op}/>'
    if tally:
        if cut is None:
            L = plen(pts) * MM
            cut = f"{int(math.ceil((L + 14) / 5.0) * 5)} мм"   # +14 мм на два загиба
        WIRES.append(dict(group=group, name=name, frm=frm, to=to,
                          color=color, mm=cut, note=note))
    return s

def ext(pts, color, name, frm, to, group, w=2.8, note=""):
    """Внешний вывод (к модулю/датчику/пайке) — пунктир, не перемычка макетки.
       Длина считается по месту: зависит от того, где на дне корпуса лежит модуль."""
    return wire(pts, color, name, frm, to, group, w=w, dots="start",
                dash="7 4", note=note, cut="по месту")

# ═══════════════════════════════════════════════════ 1. МОСТЫ ЧЕРЕЗ РАЗРЕЗ
# Рельсы MB-102 разрезаны посередине. По ДВА моста на каждый рельс —
# через них идёт весь ток станции (пики WiFi ~500 мА) через пружинные контакты.
def bridge(y_rail, x1, x2, y_arch, color, name, group):
    return wire([(x1, y_rail), (x1, y_arch), (x2, y_arch), (x2, y_rail)],
                color, name, "через разрез", f"перекрытие {(x2-x1)//17} отв.",
                group, w=3.0)

bridges = (
    bridge(RAIL_TP, 598, 615, 228, PLUS, "мост «+» LOAD · внутренний", "МОСТЫ") +
    bridge(RAIL_TP, 564, 632, 216, PLUS, "мост «+» LOAD · дублёр",     "МОСТЫ") +
    bridge(RAIL_TM, 547, 649, 204, GND,  "мост «−» верх · внутренний", "МОСТЫ") +
    bridge(RAIL_TM, 530, 666, 192, GND,  "мост «−» верх · дублёр",     "МОСТЫ") +
    bridge(RAIL_BM, 598, 615, 548, GND,  "мост «−» низ · внутренний",  "МОСТЫ") +
    bridge(RAIL_BM, 564, 632, 560, GND,  "мост «−» низ · дублёр",      "МОСТЫ") +
    bridge(RAIL_BP, 547, 649, 572, PLUS, "мост «+» ШИНА · внутренний", "МОСТЫ") +
    bridge(RAIL_BP, 530, 666, 584, PLUS, "мост «+» ШИНА · дублёр",     "МОСТЫ"))

split_marks = f'''<line x1="606.5" y1="240" x2="606.5" y2="274" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <line x1="606.5" y1="496" x2="606.5" y2="530" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <text x="713" y="178" font-size="12" font-weight="700" fill="#c0392b">8 мостов: по ДВА на каждый рельс</text>
  <text x="713" y="192" font-size="10" fill="#8a4b3f">весь ток станции идёт через них — одиночный мост греется и разбалтывается</text>'''

# ═══════════════════════════════════════════════════ 2. ПОЛОСЫ РАЗВОДКИ (lanes)
# Свободная полоса между «−» рельсом (низ 266) и рядом a (298).
LANE = {"g32": 268.5, "g34": 272.5,
        "led14": 277, "led27": 281, "led26": 285, "led25": 289, "led33": 293}

# ═══════════════════════════════════════════════════ 3. КОМПОНЕНТЫ (адреса не меняются)
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
B10K  = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#c00",     "#7a4a12"]
B5K   = ["#2e8b3d", "#1a1a1a", "#1a1a1a", "#7a4a12", "#7a4a12"]

# Ряды подобраны так, чтобы тела деталей не залезали в траншею — там линейка колонок.
comps = (
    bb.cap_ceramic(17, 19, "d", label="C2 100нФ") +
    bb.diode_schottky(22, 25, "g", "D1 · 1N5819", cathode="right") +
    bb.diode_schottky(30, 33, "g", "D2 · 1N5819", cathode="right") +
    bb.cap_electrolytic(38, 40, "i", "1000µF") +
    bb.ptc(44, 46, "j", "") +
    f'<text x="836" y="418" font-size="9" font-weight="700" fill="{bb.COPPER}" text-anchor="middle">F1 · PTC ≥2A</text>' +
    bb.resistor(42, 48, "f", B100K, label="") +
    bb.resistor(48, 50, "h", B100K, label="R6 100k", label_dy=-9) +
    bb.cap_ceramic(48, 50, "i", label="C5") +
    bb.resistor(52, 53, "f", B10K, label="") +
    bb.resistor(53, 54, "f", B5K,  label="") +
    bb.resistor(54, 56, "h", B10K, label="10k", label_dy=-9) +
    bb.cap_ceramic(54, 56, "i", label="C3") +
    # подписи верхних плеч вынесены в свободный ряд e — над траншеей
    f'<rect x="770" y="362" width="132" height="13" fill="#ffffff" opacity="0.88"/>'
    f'<rect x="915" y="362" width="114" height="13" fill="#ffffff" opacity="0.88"/>'
    f'<text x="836" y="372" font-size="10.5" font-weight="700" fill="{bb.COPPER}" text-anchor="middle">R5 100k · 42f → 48f</text>'
    f'<text x="972" y="372" font-size="10.5" font-weight="700" fill="{bb.COPPER}" text-anchor="middle">10k + 5k = 15k</text>')

# LED-цепочки (задача 01) — тела и резисторы, провода перерисованы полосами
def led_chain(c_anode, color, stroke):
    xa, xr, xl, xg = X(c_anode), X(c_anode+2), X(c_anode+2), X(c_anode+4)
    cx = (xr + xg) / 2
    return (f'<g opacity="0.55">'
            f'<line x1="{xa}" y1="298" x2="{xr}" y2="298" stroke="{bb.RES_LEG}" stroke-width="2"/>'
            f'<rect x="{xa+7}" y="292" width="20" height="12" rx="2" fill="{bb.RES_BODY}" stroke="{bb.RES_LEG}"/>'
            f'<line x1="{xl}" y1="298" x2="{xg}" y2="298" stroke="#9a8f6a" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="306" r="9" fill="{color}" stroke="{stroke}"/></g>')

leds = (led_chain(20, bb.LED_R, "#8f1f16") + led_chain(28, "#f2c21a", "#a6821a") +
        led_chain(36, bb.LED_G, "#1c7a2e") + led_chain(44, "#34c24a", "#1c7a2e") +
        led_chain(52, "#e23b2e", "#8f1f16"))

# ═══════════════════════════════════════════════════ 4. ПЕРЕМЫЧКИ НА РЕЛЬСЫ
def to_rail(col, row, rail_y, color, name, group, note=""):
    x, y = H(col, row)
    return wire([(x, y), (x, rail_y)], color, name,
                f"{col}{row}", "«+» ШИНА" if rail_y == RAIL_BP else
                ("«−» низ" if rail_y == RAIL_BM else
                 ("«+» LOAD" if rail_y == RAIL_TP else "«−» верх")),
                group, note=note)

rail_jmp = (
    # нижний банк → нижние рельсы (всегда из ряда j — самый короткий путь)
    to_rail(25, "j", RAIL_BP, PLUS, "D1 катод → ШИНА",        "ПИТАНИЕ") +
    to_rail(33, "j", RAIL_BP, PLUS, "D2 катод → ШИНА",        "ПИТАНИЕ") +
    to_rail(38, "j", RAIL_BP, PLUS, "C1 «+» → ШИНА",          "ПИТАНИЕ") +
    to_rail(40, "j", RAIL_BM, GND,  "C1 «−» → GND",           "ПИТАНИЕ") +
    to_rail(50, "j", RAIL_BM, GND,  "низ делителя батареи",   "АЦП") +
    to_rail(56, "j", RAIL_BM, GND,  "низ делителя скорости",  "АЦП") +
    # верхний банк → верхние рельсы
    to_rail(1,  "a", RAIL_TP, PLUS, "ESP32 VIN → LOAD",       "ПИТАНИЕ") +
    to_rail(2,  "a", RAIL_TM, GND,  "ESP32 GND → «−» верх",   "ПИТАНИЕ") +
    to_rail(17, "a", RAIL_TP, PLUS, "C2 «+» → LOAD",          "ПИТАНИЕ") +
    to_rail(19, "a", RAIL_TM, GND,  "C2 «−» → «−» верх",      "ПИТАНИЕ") +
    to_rail(24, "a", RAIL_TM, GND,  "катод LED красн. → GND", "СВЕТОДИОДЫ") +
    to_rail(32, "a", RAIL_TM, GND,  "катод LED жёлт. → GND",  "СВЕТОДИОДЫ") +
    to_rail(40, "a", RAIL_TM, GND,  "катод LED зел. → GND",   "СВЕТОДИОДЫ") +
    to_rail(48, "a", RAIL_TM, GND,  "катод LED WiFi → GND",   "СВЕТОДИОДЫ") +
    to_rail(56, "a", RAIL_TM, GND,  "катод LED ошибки → GND", "СВЕТОДИОДЫ") +
    # общая земля верх ↔ низ
    wire([(1057, RAIL_TM), (1057, RAIL_BM)], GND, "общая земля верх ↔ низ",
         "«−» верх", "«−» низ", "ПИТАНИЕ", w=3.0) +
    '<text x="1051" y="548" font-size="9.5" fill="#555" text-anchor="end">общий GND: «−» верх ↔ «−» низ</text>')

# ═══════════════════════════════════════════════════ 5. СВЕТОДИОДНЫЕ ПРОВОДА (ряд a → ряд a)
def led_wire(gpio_col, anode_col, lane, color, name):
    x1, x2 = X(gpio_col), X(anode_col)
    return wire([(x1, 298), (x1, lane), (x2, lane), (x2, 298)], color, name,
                f"{gpio_col}a", f"{anode_col}a", "СВЕТОДИОДЫ", w=2.4, opacity=0.75)

led_wires = (
    led_wire(5, 20, LANE["led14"], bb.LED_R,   "GPIO14 → анод красного") +
    led_wire(6, 28, LANE["led27"], "#d8a017",  "GPIO27 → анод жёлтого") +
    led_wire(7, 36, LANE["led26"], bb.LED_G,   "GPIO26 → анод зелёного") +
    led_wire(8, 44, LANE["led25"], bb.LED_WIFI,"GPIO25 → анод WiFi") +
    led_wire(9, 52, LANE["led33"], "#8d8d8d",  "GPIO33 → анод ошибки"))

# ═══════════════════════════════════════════════════ 6. СИГНАЛЬНЫЕ ПРОВОДА В АЦП
# Подъём через траншею — в промежутке МЕЖДУ колонками, чтобы не путать с узлом.
sig32 = wire([H(48, "g"), (X(48)+8.5, Y("g")), (X(48)+8.5, LANE["g32"]),
              (X(10), LANE["g32"]), H(10, "a")],
             SIG, "узел X (делитель батареи) → GPIO32", "48g", "10a", "АЦП", w=3.0)
sig34 = wire([H(54, "g"), (X(54)+8.5, Y("g")), (X(54)+8.5, LANE["g34"]),
              (X(12), LANE["g34"]), H(12, "a")],
             SIG, "узел 54 (делитель скорости) → GPIO34", "54g", "12a", "АЦП", w=3.0)
sig_lbl = (f'<text x="895" y="418" font-size="9.5" font-weight="700" fill="#c47015">узел X (48g) → 32</text>'
           f'<text x="1074" y="418" font-size="9.5" font-weight="700" fill="#c47015" text-anchor="end">узел 54 (54g) → 34</text>')

# ═══════════════════════════════════════════════════ 7. ВНЕШНИЕ ВЫВОДЫ
def stub_down(col, row, y_end, label, color, name, frm_ext, group, note="", x_route=None,
              y_jog=14):
    """Отвод вниз с площадки макетки. x_route — обход препятствия (зона мостов / корпус F1)."""
    x, y = H(col, row)
    pts = [(x, y), (x, y_end)] if x_route is None else \
          [(x, y), (x, y + y_jog), (x_route, y + y_jog), (x_route, y_end)]
    s = ext(pts, color, name, f"{col}{row}", frm_ext, group, note=note)
    lx = x if x_route is None else x_route
    s += (f'<text x="{lx+7}" y="{y_end+4}" font-size="10.5" fill="#333">{label}</text>')
    return s

# Уровни подписей ниже зоны мостов (мосты занимают y 530…590, x 530…666)
stubs = (
    stub_down(22, "j", 606, "адаптер «+5В» (22j)  ·  TP4056 <tspan font-weight=\"700\">IN+</tspan> (22i)",
              PLUS, "адаптер +5В → 22j; TP4056 IN+ → 22i", "внешние", "ВНЕШНИЕ",
              note="два отдельных провода в одну колонку") +
    stub_down(46, "g", 606, "TP4056 <tspan font-weight=\"700\">B+</tspan>  (после F1)",
              PLUS, "TP4056 B+ → 46g", "TP4056 B+", "ВНЕШНИЕ",
              x_route=X(46) + 8.5, y_jog=8) +
    stub_down(30, "j", 628, "Boost#2 <tspan font-weight=\"700\">OUT+</tspan> (5.14 В)",
              PLUS, "Boost#2 OUT+ → 30j", "Boost#2 OUT+", "ВНЕШНИЕ", x_route=487) +
    stub_down(52, "j", 628, "жёлтый — сигнал датчика (0–5 В)",
              TEAL, "датчик · жёлтый (сигнал) → 52j", "датчик", "ВНЕШНИЕ") +
    stub_down(42, "j", 650, "«+» холдера — <tspan font-weight=\"700\">отдельный сенсорный провод</tspan> (не с 46!)",
              PLUS, "«+» холдера → 42j (сенсорный)", "холдер «+»", "ВНЕШНИЕ",
              note="верх R5; НЕ перемычка с 46") +
    stub_down(44, "g", 672, "«+» пакета батареи → F1",
              PLUS, "«+» пакета → 44g", "батарея «+»", "ВНЕШНИЕ",
              x_route=X(44) - 8.5, y_jog=8))

gnd_bus = (ext([(700, RAIL_BM), (700, 694)], GND, "6 проводов на «−» рельс", "«−» низ",
               "модули", "ВНЕШНИЕ", note="адаптер, TP4056 IN−/OUT−, Boost#2 IN−/OUT−, Boost#1 IN−, датчик чёрный+синий") +
           '<text x="707" y="698" font-size="10.5" fill="#333">общий «−»: адаптер GND · TP4056 IN−/OUT− · Boost#2 IN−/OUT− · Boost#1 IN− · датчик чёрный+синий</text>')

load_stub = (ext([(1040, RAIL_TP), (1040, 214)], PLUS, "ШИНА → SW1 → LOAD; LOAD → Boost#1 IN+",
                 "«+» LOAD", "SW1 / Boost#1", "ВНЕШНИЕ") +
             '<text x="1048" y="218" font-size="10.5" fill="#333">← от SW1 (LOAD)  ·  → Boost#1 IN+</text>' +
             ext([(120, RAIL_BP), (120, 606)], PLUS, "«+» ШИНА → SW1",
                 "«+» ШИНА", "SW1", "ВНЕШНИЕ") +
             '<text x="127" y="610" font-size="10.5" fill="#333">→ на SW1 (ШИНА)</text>')

# батарейный «−» — отдельной сетью на B− (НЕ на рельс)
batm = (f'<text x="75" y="720" font-size="11" font-weight="700" fill="{bb.PURPLE}">'
        f'«−» пакета → пад B− TP4056 напрямую, мимо макетки (своя сеть!)</text>'
        f'<line x1="40" y1="716" x2="67" y2="716" stroke="{bb.PURPLE}" stroke-width="3" stroke-dasharray="7 4"/>')

# CHRG — паяный провод с катода красного LED TP4056 → GPIO13 (13a)
chrg = (wire([H(3, "a"), (X(3), 288), (50, 288), (50, 206)], "#2a7de1",
             "TP4056 CHRG (катод красного LED) → GPIO13", "пайка", "3a", "ПАЙКА",
             w=2.6, dots="start", dash="7 4") +
        '<text x="56" y="202" font-size="10" font-weight="700" fill="#2a7de1">CHRG → GPIO13 (пайка)</text>')

# ═══════════════════════════════════════════════════ 8. ESP32 + линейка колонок
esp = bb.esp32(subtitle="перетыкание в свежие отверстия · ряд a",
               highlight=["VIN", "32", "34"])

# гасим штатные номера колонок bb (они попадают в полосу разводки) и рисуем свои в траншее
mask = "".join(f'<rect x="{x-11}" y="{276}" width="22" height="14" fill="#ffffff"/>'
               for x in (411, 496, 581, 666, 751, 836, 921, 1006))
USED_COLS = [17, 19, 20, 22, 24, 25, 28, 30, 32, 33, 36, 38, 40, 42, 44, 46, 48,
             50, 52, 53, 54, 56]
ruler = ('<g font-size="8.5" font-weight="700" fill="#2a6fd1" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="{392}">{c}</text>' for c in USED_COLS)
         + '</g>')

# ═══════════════════════════════════════════════════ 9. ВРЕЗКА: STDBY / GPIO19
IX, IY, IW, IH = 1092, 236, 296, 362
inset = f'''<rect x="{IX}" y="{IY}" width="{IW}" height="{IH}" rx="10" fill="#fff6f4" stroke="#e0a79c" stroke-width="2"/>
  <text x="{IX+14}" y="{IY+24}" font-size="13" font-weight="700" fill="#c0392b">⚠ STDBY: GPIO19 может быть недоступен</text>
  <text x="{IX+14}" y="{IY+43}" font-size="10.5" fill="#5a4340">Плата DevKit V1 шириной 25.4 мм закрывает</text>
  <text x="{IX+14}" y="{IY+57}" font-size="10.5" fill="#5a4340">свои колонки: свободен только <tspan font-weight="700">ряд a</tspan>.</text>
  <text x="{IX+14}" y="{IY+71}" font-size="10.5" fill="#5a4340">Нижние пины (3V3, 19, 21 …) в отверстие</text>
  <text x="{IX+14}" y="{IY+85}" font-size="10.5" fill="#5a4340">не выведены. <tspan font-weight="700">Проверь на плате.</tspan></text>
  <text x="{IX+14}" y="{IY+108}" font-size="11" font-weight="700" fill="#1a1a1a">Если ряд j свободен:</text>
  <text x="{IX+14}" y="{IY+124}" font-size="10.5" fill="#333">STDBY → 19j напрямую. Прошивка без правок.</text>
  <text x="{IX+14}" y="{IY+147}" font-size="11" font-weight="700" fill="#1a1a1a">Если свободен только ряд a → GPIO35:</text>
  <text x="{IX+14}" y="{IY+163}" font-size="10" fill="#666">35 свободен (направления у нового датчика нет),</text>
  <text x="{IX+14}" y="{IY+176}" font-size="10" fill="#666">но он input-only — внутренней подтяжки НЕТ.</text>
  <g stroke-linecap="round" stroke-linejoin="round" fill="none">
    <line x1="{IX+30}" y1="{IY+200}" x2="{IX+250}" y2="{IY+200}" stroke="{PLUS}" stroke-width="2.6"/>
    <line x1="{IX+80}" y1="{IY+200}" x2="{IX+80}" y2="{IY+224}" stroke="#333" stroke-width="2.2"/>
    <line x1="{IX+80}" y1="{IY+252}" x2="{IX+80}" y2="{IY+276}" stroke="#333" stroke-width="2.2"/>
    <line x1="{IX+80}" y1="{IY+304}" x2="{IX+80}" y2="{IY+322}" stroke="{GND}" stroke-width="2.2"/>
    <line x1="{IX+30}" y1="{IY+322}" x2="{IX+130}" y2="{IY+322}" stroke="{GND}" stroke-width="2.6"/>
    <line x1="{IX+80}" y1="{IY+264}" x2="{IX+200}" y2="{IY+264}" stroke="{SIG}" stroke-width="2.6"/>
    <line x1="{IX+80}" y1="{IY+288}" x2="{IX+248}" y2="{IY+288}" stroke="#2a7de1" stroke-width="2.4" stroke-dasharray="6 4"/>
  </g>
  <rect x="{IX+68}" y="{IY+224}" width="24" height="28" rx="3" fill="{bb.RES_BODY}" stroke="{bb.RES_LEG}"/>
  <rect x="{IX+68}" y="{IY+276}" width="24" height="28" rx="3" fill="{bb.RES_BODY}" stroke="{bb.RES_LEG}"/>
  <circle cx="{IX+80}" cy="{IY+264}" r="3.4" fill="{SIG}"/>
  <text x="{IX+100}" y="{IY+243}" font-size="10.5" font-weight="700" fill="{bb.COPPER}">R7 10k</text>
  <text x="{IX+100}" y="{IY+295}" font-size="10.5" font-weight="700" fill="{bb.COPPER}">R8 20k</text>
  <text x="{IX+256}" y="{IY+204}" font-size="10" font-weight="700" fill="{PLUS}">LOAD</text>
  <text x="{IX+206}" y="{IY+261}" font-size="10" font-weight="700" fill="#c47015">→ GPIO35</text>
  <text x="{IX+206}" y="{IY+284}" font-size="9.5" font-weight="700" fill="#2a7de1">STDBY</text>
  <text x="{IX+136}" y="{IY+326}" font-size="10" fill="#555">«−» рельс</text>
  <text x="{IX+14}" y="{IY+345}" font-size="10" fill="#2e7d32">Покой 4.7×20/30 = <tspan font-weight="700">3.13 В</tspan> (Vih 2.48 В) · ток стока 0.47 мА.</text>
  <text x="{IX+14}" y="{IY+357}" font-size="10" fill="#c0392b">Прошивка: PIN_STDBY 19→35, режим INPUT (не INPUT_PULLUP).</text>'''

# ═══════════════════════════════════════════════════ 10. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Карта отверстий и перемычек — финальный монтаж на жёстком проводе</text>
  <text x="30" y="62" font-size="14" fill="#666">Та же схема, что в full-sensor-2.html, но провода нарисованы так, как лягут физически: 22 AWG, прижат к плате, гнётся под 90°. Топология и номиналы НЕ менялись.</text>'''

rules = f'''<rect x="30" y="78" width="1040" height="82" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="99" font-size="13" font-weight="700" fill="#1a1a1a">Правило перетыкания: <tspan fill="#2a6fd1">та же колонка — свежий ряд.</tspan></text>
  <text x="46" y="117" font-size="12" fill="#333">Колонка из 5 отверстий = один узел, поэтому перенос из <tspan font-weight="700">j</tspan> в <tspan font-weight="700">i</tspan> ничего не меняет электрически, но даёт нетронутую пружину. Верхний банк колонок 17–56 (ряды b–e) почти весь девственный — это запас.</text>
  <text x="46" y="135" font-size="12" fill="#c0392b">Провод: <tspan font-weight="700">22 AWG / 0.64 мм круглый</tspan> (готовый набор перемычек). НЕ 0.5 мм от Cat5e: dupont-штырёк квадратный 0.64 (диагональ 0.9) уже раздвинул пружину — тонкий провод в разношенном гнезде держит хуже прежнего.</text>
  <text x="46" y="153" font-size="12" fill="#555">Точка = контакт в отверстии. Пересечение без точки = провод просто лежит поверх. Пунктир = внешний вывод (к модулю, датчику или пайке), не перемычка макетки.</text>'''

# ═══════════════════════════════════════════════════ 11. ТАБЛИЦА НАРЕЗКИ
def build_table():
    order = ["МОСТЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ", "ВНЕШНИЕ", "ПАЙКА"]
    heads = {"МОСТЫ": "Мосты через разрез (жёсткий провод, дугой над платой)",
             "ПИТАНИЕ": "Питание и земля",
             "АЦП": "Сигналы в АЦП",
             "СВЕТОДИОДЫ": "Светодиоды (задача 01)",
             "ВНЕШНИЕ": "Внешние выводы — многожильный ПВС/МГТФ, НЕ жёсткий",
             "ПАЙКА": "Паяные линии TP4056"}
    left, right = [], []
    for g in order:
        rows = [w for w in WIRES if w["group"] == g]
        if not rows:
            continue
        (left if g in ("МОСТЫ", "ПИТАНИЕ", "АЦП") else right).append((heads[g], rows))
    def render(blocks, x0, y0):
        out, y = [], y0
        for head, rows in blocks:
            out.append(f'<text x="{x0}" y="{y}" font-size="12.5" font-weight="700" fill="#2a6fd1">{head}</text>')
            y += 17
            for r in rows:
                out.append(f'<rect x="{x0}" y="{y-8}" width="9" height="9" rx="2" fill="{r["color"]}"/>')
                out.append(f'<text x="{x0+16}" y="{y}" font-size="11.5" fill="#333">{r["name"]}</text>')
                out.append(f'<text x="{x0+430}" y="{y}" font-size="11.5" font-weight="700" fill="#555" text-anchor="end">{r["frm"]} → {r["to"]}</text>')
                out.append(f'<text x="{x0+512}" y="{y}" font-size="11.5" fill="#8a4b3f" text-anchor="end">{r["mm"]}</text>')
                y += 16
            y += 10
        return "".join(out), y
    a, ya = render(left, 40, 796)
    b, yb = render(right, 750, 796)
    hdr = ('<text x="30" y="770" font-size="17" font-weight="700" fill="#1a1a1a">'
           'Список нарезки — длина уже с запасом 14 мм на два загиба в отверстия</text>')
    return hdr + a + b, max(ya, yb)

# ═══════════════════════════════════════════════════ 12. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-")

table_svg, table_end = build_table()
NY = int(max(table_end, 1180)) + 8
notes = f'''<rect x="30" y="{NY}" width="1340" height="176" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="{NY+24}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Сначала PPTC на место F1 (44j–46j), потом фиксация.</tspan> Сейчас там перемычка — цепь батареи без защиты. Закрыть корпус с перемычкой нельзя.</text>
  <text x="46" y="{NY+45}" font-size="12.5" fill="#8e44ad">⚠  <tspan font-weight="700">«−» пакета — только на пад B− TP4056, мимо макетки.</tspan> На общий «−» рельс нельзя: отключится защита DW01.</text>
  <text x="46" y="{NY+66}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх R5 — на 42j, НЕ на 46.</tspan> В колонку 42 идёт отдельный провод с «+» холдера: иначе TP4056 держит 4.2–4.5 В и подделывает напряжение батареи.</text>
  <text x="46" y="{NY+87}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Колонки 44, 48, 52, 56 живут дважды:</tspan> верхний банк (ряд a) — светодиоды, нижний (f–j) — питание и делители. Это РАЗНЫЕ узлы, траншея их разделяет.</text>
  <text x="46" y="{NY+108}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Термоклей поверх поля проводов — нельзя</tspan> (затекает в отверстия по капилляру, гнездо мертво). Модули — на дно, прижимной поролон — в крышку. Силикон только нейтральный.</text>
  <text x="46" y="{NY+129}" font-size="12.5" fill="#2e7d32">✓  Порядок: 1) PPTC · 2) перетыкание по колонкам, по одному проводу · 3) прозвонка 8 мостов · 4) ШИНА 4.6–4.8 В · 5) wiggle-тест каждого провода · 6) закрытие.</text>
  <text x="46" y="{NY+150}" font-size="12.5" fill="#2a6fd1">→  Направление (кол. 16–20) НЕ монтируется: у нового датчика 0–30 м/с этого канала нет. GPIO35 свободен — см. врезку про STDBY.</text>
  <text x="46" y="{NY+168}" font-size="11" fill="#999">Отступление от images/BREADBOARD-STANDARD.md §4.2 (плавные дуги) сделано сознательно: прямые углы здесь — предмет документа.</text>'''

VH = NY + 200
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 {VH}" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c, r4c)}
  <rect x="0" y="0" width="1400" height="{VH}" fill="#ffffff"/>
  {title}
  {rules}
  {board}
  {mask}
  {ruler}
  {split_marks}
  {bridges}
  {comps}
  {leds}
  {esp}
  {led_wires}
  {rail_jmp}
  {sig32}{sig34}{sig_lbl}
  {chrg}
  {stubs}
  {gnd_bus}
  {load_stub}
  {batm}
  {inset}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_final.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox height", VH)
