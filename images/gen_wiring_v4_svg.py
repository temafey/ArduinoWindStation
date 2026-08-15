# -*- coding: utf-8 -*-
"""СХЕМА v4 — единая шина «+», SW1 на входе, LED-резисторы НА ПЛАТЕ.

Отличия от v3 (по 4 пунктам пользователя):
  1. Единая шина «+». Оба «+»-рельса (верх и низ) — ОДНА цепь LOAD, связаны
     вертикалью на кол.16. Обе земли связаны на кол.17. Диодная развязка
     D1/D2 + C1 больше НЕ рельс, а локальный узел ШИНА (кол.39, нижний банк).
     SW1 врезан между узлом ШИНА и рельсом LOAD.
  2. Резисторы 220 Ω светодиодов ПЕРЕЕХАЛИ НА ПЛАТУ (нижний банк, кол.18–36,
     ряд i, через одну колонку — не задевают друг друга корпусами).
     На крышке остались только сами LED (корпус непрозрачный). 6 проводов
     к крышке: 5 анодов + общий катод.
  3. LED-контакты переехали на НИЖНИЙ ряд GPIO: 4,16,17,5,18 (кол.5–9),
     с обновлением прошивки. Было 26,27,14,25,33 (верхний ряд).
  4. Номера колонок соблюдены строго.

Плата расширена до 63 колонок (реальная ширина MB-102) — иначе 5 резисторов
+ силовая секция + 3 модуля в нижний банк не помещаются.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

MM = 2.54 / 17.0
NCOLS = 63
RAIL_TP, RAIL_TM = 250, 262           # верх: «+» LOAD / «−» GND
RAIL_BP, RAIL_BM = 506, 518           # низ:  «+» LOAD / «−» GND (обе + = LOAD!)
CUT = 606.5                           # разрез рельсов (между кол. 31 и 32)
TEAL = "#0e9488"
STDBY_C = "#a68bff"
SIG, GND, PLUS, PURPLE = bb.SIG, bb.GNDc, bb.PLUS, bb.PURPLE
W_CANVAS = 1820

def X(c):   return bb.colx(c)
def Y(r):   return bb.ROWY[r]
def H(c, r): return (X(c), Y(r))

WIRES = []

def plen(pts):
    return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
               for i in range(len(pts)-1))

def dpath(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)

def jmp(pts, color, name, frm, to, group, w=2.8, dots="both",
        tally=True, note="", cut=None):
    s = (f'<path d="{dpath(pts)}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>')
    r = max(2.9, w * 1.25)
    if dots in ("both", "start"):
        s += f'<circle cx="{pts[0][0]:.1f}" cy="{pts[0][1]:.1f}" r="{r:.1f}" fill="{color}"/>'
    if dots in ("both", "end"):
        s += f'<circle cx="{pts[-1][0]:.1f}" cy="{pts[-1][1]:.1f}" r="{r:.1f}" fill="{color}"/>'
    if tally:
        if cut is None:
            cut = f"{int(math.ceil((plen(pts) * MM + 14) / 5.0) * 5)} мм"
        WIRES.append(dict(group=group, name=name, frm=frm, to=to,
                          color=color, mm=cut, note=note))
    return s

def mlead(pts, color, name, frm, to, group, w=2.2, note="", both_sq=False):
    x0, y0 = pts[0]; xe, ye = pts[-1]
    s = (f'<path d="{dpath(pts)}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>'
         f'<rect x="{x0-4:.1f}" y="{y0-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>')
    s += (f'<rect x="{xe-4:.1f}" y="{ye-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>'
          if both_sq else f'<circle cx="{xe:.1f}" cy="{ye:.1f}" r="3.4" fill="{color}"/>')
    WIRES.append(dict(group=group, name=name, frm=frm, to=to,
                      color=color, mm="по месту", note=note))
    return s

# ═══════════════════════════════════════ 1. СВЯЗКИ РЕЛЬСОВ + МОСТЫ ЧЕРЕЗ РАЗРЕЗ
RAIL_NAME = {RAIL_TP: "«+» LOAD верх", RAIL_TM: "«−» GND верх",
             RAIL_BP: "«+» LOAD низ", RAIL_BM: "«−» GND низ"}

def vlink(col, color, y_top, y_bot, name, note=""):
    """Вертикальная связка верхнего и нижнего рельса на колонке col."""
    x = X(col)
    dx = 9 if color == GND else -9
    return jmp([(x, y_top), (x+dx, y_top+18), (x+dx, y_bot-18), (x, y_bot)],
               color, name, RAIL_NAME[y_top], RAIL_NAME[y_bot], "РЕЛЬСЫ", w=3.2, note=note)

def cut_bridge(y_rail, color, y_arch, name, note=""):
    """Мост через разрез рельса: кол.31 (лево) ↔ кол.32 (право) одного рельса."""
    x1, x2 = X(31), X(32)
    return jmp([(x1, y_rail), (x1, y_arch), (x2, y_arch), (x2, y_rail)],
               color, name, "кол.31 (лево)", "кол.32 (право)", "РЕЛЬСЫ", w=3.0, note=note)

rails = (
    vlink(16, PLUS, RAIL_TP, RAIL_BP, "связка «+» (кол.16) — верх↔низ",
          note="ЕДИНАЯ шина LOAD: все четыре «+»-полурельса — одна цепь") +
    vlink(17, GND,  RAIL_TM, RAIL_BM, "связка «−» (кол.17) — верх↔низ",
          note="общая земля: связывает верхнюю и нижнюю «−»") +
    cut_bridge(RAIL_TP, PLUS, 228, "мост «+» LOAD через разрез (31↔32)",
               note="несёт LOAD в правую половину — только Boost#1, ~75 мА") +
    cut_bridge(RAIL_BM, GND, 542, "мост «−» GND через разрез (31↔32)",
               note="земля в правую нижнюю половину — выходы модулей") +
    vlink(58, GND, RAIL_TM, RAIL_BM, "связка «−» правая (кол.58)",
          note="между Boost#2 и Boost#1: земля к входам модулей (TR−)"))

split_marks = f'''<line x1="{CUT}" y1="238" x2="{CUT}" y2="276" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <line x1="{CUT}" y1="494" x2="{CUT}" y2="536" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <text x="598" y="546" font-size="9.5" font-weight="700" fill="#c0392b" text-anchor="end">разрез рельсов →</text>'''

# ═══════════════════════════════════════ 2. ПОЛОСЫ РАЗВОДКИ
ADC = {"g32": 224, "g34": 214}           # сигналы АЦП над платой
GPIO_LANE = [483, 486, 489, 492, 495]    # 5 узких полос впритык к ряду j — провода идут под ESP32/платой, скрыты сверху
TRENCH_LANE = 391                        # проводка по дну траншеи
LOW_A, LOW_B, LOW_C = 490, 498, 550      # полосы под нижним банком

# ═══════════════════════════════════════ 3. ВЕРХНИЙ БАНК — СИГНАЛЫ
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
B10K  = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#c00",     "#7a4a12"]
B5K   = ["#2e8b3d", "#1a1a1a", "#1a1a1a", "#7a4a12", "#7a4a12"]

comps_top = (
    bb.cap_ceramic(19, 21, "c", label="C2 100нФ") +
    # делитель батареи 100k/100k → GPIO32   (23 — вход, 25 — узел, 27 — земля)
    bb.resistor(23, 25, "c", B100K, label="") +
    bb.resistor(25, 27, "c", B100K, label="") +
    bb.cap_ceramic(25, 27, "e", label="") +
    # делитель датчика (10k+5k)/10k → GPIO34 (29 — вход, 33 — узел, 35 — земля)
    bb.resistor(29, 31, "c", B10K, label="") +
    bb.resistor(31, 33, "c", B5K,  label="") +
    bb.resistor(33, 35, "c", B10K, label="") +
    bb.cap_ceramic(33, 35, "e", label="") +
    # C1 1000µF — bulk на узле ШИНА, стоит в ВЕРХНЕМ банке (в нижнем нет места)
    bb.cap_electrolytic(39, 41, "d", "C1 1000µF"))

def lbl(x, y, text, w, fill=bb.COPPER, size=10, weight="700", anchor="middle"):
    x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
    return (f'<rect x="{x0:.0f}" y="{y-10}" width="{w}" height="13" fill="#fff" opacity="0.92"/>'
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}">{text}</text>')

comps_lbl = (
    lbl((X(23)+X(25))/2, 352, "100k", 34, size=9.5) +
    lbl((X(25)+X(27))/2, 352, "100k", 34, size=9.5) +
    lbl((X(29)+X(31))/2, 352, "10k", 30, size=9.5) +
    lbl((X(31)+X(33))/2, 352, "5k", 26, size=9.5) +
    lbl((X(33)+X(35))/2, 352, "10k", 30, size=9.5) +
    lbl(X(27) + 14, 374, "C5", 22, size=9, anchor="start") +
    lbl(X(35) + 14, 374, "C3", 22, size=9, anchor="start") +
    lbl((X(23)+X(27))/2, 322, "делитель ×2.0 → GPIO32", 128, fill="#c47015", size=9) +
    lbl((X(29)+X(35))/2, 322, "делитель ×2.5 → GPIO34", 128, fill="#c47015", size=9))

# ═══════════════════════════════════════ 4. НИЖНИЙ БАНК — РЕЗИСТОРЫ LED + ПИТАНИЕ
B220 = ["#c00", "#c00", "#1a1a1a", "#1a1a1a", "#7a4a12"]   # 220 Ω, 5 полос

#         gpio  esp_col res_l res_r  цвет         обводка    имя цвета  смысл
# ряд i (не h) + по 1 пустой колонке между резисторами — физически не задевают друг друга
LEDS = [("4",  5,  18, 20, "#c62828",  "#7d1a1a", "красный", "ветер &gt;15 м/с"),
        ("16", 6,  22, 24, "#f2c21a",  "#a6821a", "жёлтый",  "ветер &gt;5 м/с"),
        ("17", 7,  26, 28, "#34c24a",  "#1c7a2e", "зелёный", "станция ОК"),
        ("5",  8,  30, 32, "#1f9d3a",  "#146127", "зелёный", "WiFi есть"),
        ("18", 9,  34, 36, "#e23b2e",  "#8f1f16", "красный", "ошибка АЦП")]

led_res = "".join(bb.resistor(rl, rr, "i", B220, label="220") for g, ec, rl, rr, *_ in LEDS)

# D1/D2/PTC/TP4056/Boost#2 сдвинуты правее и сжаты плотнее друг к другу —
# место под зазоры между резисторами (18-36); Boost#1 упирается в правый край
# платы (кол.63 = физический предел MB-102) и остаётся на месте.
comps_bot = (
    led_res +
    # диодная развязка (узел ШИНА = кол.39) + PTC
    bb.diode_schottky(37, 39, "h", "D1", cathode="right") +
    bb.diode_schottky(39, 41, "h", "D2", cathode="left") +
    f'<text x="{X(39):.0f}" y="468" font-size="8.5" font-weight="700" '
    f'fill="{bb.COPPER}" text-anchor="middle">2×1N5819</text>' +
    bb.ptc(42, 44, "j", "") +
    f'<text x="{(X(42)+X(44))/2:.0f}" y="418" font-size="9" font-weight="700" '
    f'fill="{bb.COPPER}" text-anchor="middle">F1 · PTC ≥2A</text>' +
    # маркер узла ШИНА
    f'<text x="{X(39):.0f}" y="500" font-size="9.5" font-weight="700" '
    f'fill="{PLUS}" text-anchor="middle">ШИНА</text>')

# ═══════════════════════════════════════ 5. МОДУЛИ НА ПЛАТЕ
tp4056 = bb.mod_inline(
    45, 50, "b", "f",
    [(45, "b", "IN−", GND,   -10), (50, "b", "IN+", PLUS, -10),
     (45, "f", "OUT−", GND,   14), (46, "f", "B−",  PURPLE, 26),
     (49, "f", "OUT+", PLUS,  14), (50, "f", "B+",  PLUS,   26)],
    "TP4056 · Type-C", "заряд + защита DW01",
    over_x=14, over_y=38, title_y=384, sub_y=395)

boost2 = bb.mod_inline(
    53, 57, "c", "h",
    [(55, "c", "IN+", PLUS, 11), (56, "c", "IN−", GND, 24),
     (53, "h", "OUT−", GND, -11), (57, "h", "OUT+", PLUS, -11)],
    "Boost#2", "5.14 В от батареи",
    over_x=4, over_y=17, title_y=384, sub_y=395)

boost1 = bb.mod_inline(
    59, 63, "c", "h",
    [(61, "c", "IN+", PLUS, 11), (62, "c", "IN−", GND, 24),
     (59, "h", "OUT−", GND, -11), (63, "h", "OUT+", PLUS, -11)],
    "Boost#1", "12 В для датчика",
    over_x=4, over_y=17, title_y=384, sub_y=395)

mods_inline = tp4056 + boost2 + boost1

# ═══════════════════════════════════════ 6. ПЕРЕМЫЧКИ НА РЕЛЬСЫ
def to_rail(col, row, rail_y, color, name, group, note=""):
    x, y = H(col, row)
    return jmp([(x, y), (x, rail_y)], color, name, f"{col}{row}",
               RAIL_NAME[rail_y], group, note=note)

UNDER = "заводится ДО посадки модуля — отверстие под корпусом"

rail_jmp = (
    to_rail(1,  "a", RAIL_TP, PLUS, "ESP32 VIN → «+» LOAD",     "ПИТАНИЕ") +
    to_rail(2,  "a", RAIL_TM, GND,  "ESP32 GND → «−» GND",      "ПИТАНИЕ") +
    to_rail(19, "a", RAIL_TP, PLUS, "C2 → «+» LOAD",            "ПИТАНИЕ") +
    to_rail(21, "a", RAIL_TM, GND,  "C2 → «−» GND",             "ПИТАНИЕ") +
    to_rail(27, "a", RAIL_TM, GND,  "низ делителя батареи",     "АЦП") +
    to_rail(35, "a", RAIL_TM, GND,  "низ делителя датчика",     "АЦП") +
    to_rail(41, "a", RAIL_TM, GND,  "C1 «−» → «−» GND",         "ПИТАНИЕ") +
    # модули
    to_rail(45, "a", RAIL_TM, GND,  "TP4056 IN− → «−» GND",     "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    to_rail(45, "j", RAIL_BM, GND,  "TP4056 OUT− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(56, "a", RAIL_TM, GND,  "Boost#2 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(53, "j", RAIL_BM, GND,  "Boost#2 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(61, "a", RAIL_TP, PLUS, "Boost#1 IN+ → «+» LOAD",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(62, "a", RAIL_TM, GND,  "Boost#1 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(59, "j", RAIL_BM, GND,  "Boost#1 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ"))

# ═══════════════════════════════════════ 7. ПЕРЕМЫЧКИ МЕЖДУ УЗЛАМИ
GAP = (X(51) + X(52)) / 2.0   # коридор между TP4056 и Boost#2

board_jmp = (
    # C1 «+» (верх, кол.39) → узел ШИНА (низ, кол.39): через траншею
    jmp([H(39, "d"), (X(39), TRENCH_LANE), H(39, "f")], PLUS,
        "C1 «+» → узел ШИНА", "39d", "39f", "ПИТАНИЕ",
        note="bulk-конденсатор на диодной развязке") +
    # +5 В адаптера (анод D1, кол.37) → TP4056 IN+ (кол.50): через траншею
    jmp([H(37, "f"), (X(37), TRENCH_LANE-8), (X(50), TRENCH_LANE-8), H(50, "b")], PLUS,
        "+5 В адаптера → TP4056 IN+", "37f", "50b", "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    # TP4056 OUT+ (49i) → Boost#2 IN+ (55c): в обход корпусов через коридор 51–52
    jmp([H(49, "i"), (X(49), 470), (GAP, 470), (GAP, 290), (X(55), 290), H(55, "c")],
        PLUS, "TP4056 OUT+ → Boost#2 IN+", "49i", "55c", "МОДУЛИ НА ПЛАТЕ",
        note="один узел: выход зарядника = вход буста") +
    # F1 (кол.44) → TP4056 B+ (кол.50): под платой
    jmp([H(44, "j"), (X(44), LOW_A), (X(50), LOW_A), H(50, "j")], PLUS,
        "F1 (после PTC) → TP4056 B+", "44j", "50j", "МОДУЛИ НА ПЛАТЕ",
        note="защищённый «+» батареи") +
    # Boost#2 OUT+ (57h) → анод D2 (кол.41): под платой
    jmp([H(57, "h"), (X(57), LOW_B), (X(41), LOW_B), H(41, "h")], PLUS,
        "Boost#2 OUT+ → анод D2", "57h", "41h", "МОДУЛИ НА ПЛАТЕ"))

# ═══════════════════════════════════════ 8. АЦП + GPIO→РЕЗИСТОРЫ
def lane_wire(gpio_col, col, lane, color, name, group):
    x1, x2 = X(gpio_col), X(col)
    return jmp([(x1, 298), (x1, lane), (x2, lane), (x2, 298)], color, name,
               f"{gpio_col}a", f"{col}a", group, w=2.4)

adc_wires = (
    lane_wire(10, 25, ADC["g32"], SIG, "узел делителя батареи (25) → GPIO32", "АЦП") +
    lane_wire(12, 33, ADC["g34"], SIG, "узел делителя датчика (33) → GPIO34", "АЦП"))

# GPIO (нижний ряд ESP32, кол.5–9) → левый вывод резистора: провод идёт впритык
# к ряду j, физически под корпусом ESP32/платой — не свисает и не виден снизу схемы
gpio_res = "".join(
    jmp([(X(ec), 481), (X(ec), GPIO_LANE[i]), (X(rl), GPIO_LANE[i]), (X(rl), 478)],
        col, f"GPIO{g} → резистор 220 Ω (кол.{rl}, под платой)", f"{ec}·низ", f"{rl}j",
        "СВЕТОДИОДЫ", w=2.4, dots="both",
        note="идёт под ESP32/платой, не свисает снизу схемы")
    for i, (g, ec, rl, rr, col, *_ ) in enumerate(LEDS))

# ═══════════════════════════════════════ 9. КРЫШКА КОРПУСА (снизу схемы)
LIDX, LIDY, LIDW, LIDH = 372, 596, 300, 214
LED_CY = LIDY + 96
CATH_Y = LIDY + 150
led_anode = "".join(
    jmp([(X(rr), 460), (X(rr), LED_CY-12)], col,
        f"резистор {rr} → анод LED {cn} на крышке", f"{rr}i", "крышка",
        "СВЕТОДИОДЫ", w=2.4, dots="start", cut="по месту")
    for (g, ec, rl, rr, col, stroke, cn, mean) in LEDS)

# общий катод крышки → «−» GND низ (стояк справа от последнего LED, мимо надписей)
RISER_X = X(36) + 28
led_cath = jmp([(X(36), CATH_Y), (RISER_X, CATH_Y), (RISER_X, 540), (X(46), 540), (X(46), RAIL_BM)],
               GND, "общий катод 5 LED → «−» GND", "крышка", "«−» GND низ",
               "СВЕТОДИОДЫ", w=2.8, dots="none", cut="по месту")

lid_panel = [f'<rect x="{LIDX}" y="{LIDY}" width="{LIDW}" height="{LIDH}" rx="12" '
             f'fill="#2b2b30" stroke="#15161a" stroke-width="2"/>',
             f'<text x="{LIDX+14}" y="{LIDY+22}" font-size="13" font-weight="700" fill="#f2f2f2">'
             f'Крышка · 5 светодиодов</text>',
             f'<text x="{LIDX+14}" y="{LIDY+38}" font-size="9.5" fill="#9aa">'
             f'резисторы 220 Ω теперь на плате, здесь только LED</text>']
for (g, ec, rl, rr, col, stroke, cn, mean) in LEDS:
    lx = X(rr)
    lid_panel.append(f'<circle cx="{lx}" cy="{LED_CY}" r="11" fill="{col}" stroke="{stroke}" stroke-width="2"/>')
    lid_panel.append(f'<text x="{lx-15}" y="{LED_CY+4}" font-size="11" fill="#c00">+</text>')
    lid_panel.append(f'<line x1="{lx}" y1="{LED_CY+11}" x2="{lx}" y2="{CATH_Y}" stroke="{GND}" stroke-width="2.4"/>')
    lid_panel.append(f'<text x="{lx}" y="{LED_CY+34}" font-size="9.5" font-weight="700" fill="#f2f2f2" text-anchor="middle">GPIO{g}</text>')
    lid_panel.append(f'<text x="{lx}" y="{LED_CY+46}" font-size="8" fill="#9aa" text-anchor="middle">{cn}</text>')
lid_panel.append(f'<line x1="{X(20)}" y1="{CATH_Y}" x2="{X(36)}" y2="{CATH_Y}" stroke="{GND}" stroke-width="3.2"/>')
lid_panel.append(f'<text x="{LIDX+14}" y="{LIDY+LIDH-10}" font-size="9" fill="#8c9099">'
                 f'6 проводов к плате: 5 анодов + общий катод</text>')
lid_panel = "".join(lid_panel)

# ═══════════════════════════════════════ 10. ВНЕШНИЕ МОДУЛИ (снизу)
def battery_split(x, y):
    """Две банки 18650, РАЗНЕСЁННЫЕ по корпусу (одна сверху, другая снизу),
    но электрически в ПАРАЛЛЕЛЬ. Показаны с большим зазором + подписи мест."""
    w = 600
    h1y, h2y = y+42, y+150     # большой зазор = «разные концы корпуса»
    def holder(hy, where):
        return (f'<rect x="{x+115}" y="{hy}" width="300" height="40" rx="20" fill="#eceadf" stroke="#c7c1ae"/>'
                f'<rect x="{x+129}" y="{hy+7}" width="272" height="26" rx="13" fill="#333"/>'
                f'<text x="{x+141}" y="{hy+25}" font-size="10" fill="#eee">18650 · 3.96 В  ({where})</text>'
                f'<rect x="{x+97}" y="{hy+10}" width="16" height="20" rx="2" fill="#555"/>'
                f'<rect x="{x+417}" y="{hy+10}" width="16" height="20" rx="2" fill="{PLUS}"/>'
                f'<text x="{x+105}" y="{hy-2}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">−</text>'
                f'<text x="{x+425}" y="{hy-2}" font-size="14" font-weight="700" fill="{PLUS}" text-anchor="middle">+</text>')
    midY = (h1y + h2y) / 2 + 20   # точка пайки — между двумя холдерами
    def splice(term_x, trunk_x, color, label, lx, anchor):
        # свой провод от КАЖДОГО холдера → место пайки → ОДИН провод дальше
        return (f'<path d="M{term_x} {h1y+20} Q{(term_x+trunk_x)/2:.0f} {h1y+20} {trunk_x} {midY-3:.0f}" '
                f'fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
                f'<path d="M{term_x} {h2y+20} Q{(term_x+trunk_x)/2:.0f} {h2y+20} {trunk_x} {midY+3:.0f}" '
                f'fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
                f'<circle cx="{term_x}" cy="{h1y+20}" r="4" fill="{color}"/>'
                f'<circle cx="{term_x}" cy="{h2y+20}" r="4" fill="{color}"/>'
                # само место пайки — общий узел, дальше идёт ОДИН провод
                f'<circle cx="{trunk_x}" cy="{midY:.0f}" r="6" fill="#ddd6c0" stroke="#7a6a3a" stroke-width="1.6"/>'
                f'<line x1="{trunk_x}" y1="{midY:.0f}" x2="{trunk_x}" y2="{h1y+20}" fill="none" stroke="{color}" stroke-width="4"/>'
                f'<line x1="{trunk_x}" y1="{midY:.0f}" x2="{trunk_x}" y2="{h2y+20}" fill="none" stroke="{color}" stroke-width="4"/>'
                f'<text x="{lx}" y="{midY-11:.0f}" font-size="8.5" font-weight="700" fill="#7a6a3a" text-anchor="{anchor}">пайка</text>'
                f'<text x="{lx}" y="{midY+22:.0f}" font-size="10.5" font-weight="700" fill="{color}" text-anchor="{anchor}">{label}</text>')
    return (f'<rect x="{x}" y="{y}" width="{w}" height="210" rx="12" fill="{bb.BOARD_FILL}" stroke="{bb.BOARD_STK}" stroke-width="2"/>'
            f'<text x="{x+16}" y="{y+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">'
            f'2×18650 · ПАРАЛЛЕЛЬ · банки РАЗНЕСЕНЫ по корпусу</text>'
            + holder(h1y, "ВЕРХ корпуса") + holder(h2y, "НИЗ корпуса") +
            # свой провод от каждого холдера → пайка → далее ОДИН общий провод (не жёсткая перемычка)
            splice(x+97, x+67, GND, "«−» пакета", x+40, "middle") +
            splice(x+417+16, x+463, PLUS, "«+» пакета", x+500, "middle") +
            f'<text x="{x+16}" y="{y+204}" font-size="9.5" fill="#c0392b">'
            f'⚠ ПАРАЛЛЕЛЬ (не последовательно!). Последовательно = 8.4 В — сожжёт всё.</text>')

USBX, USBY = 82, 596
SWX, SWY = 704, 600
BATX, BATY = 82, 830

mods_ext = (
    bb.mod_usb_c(USBX, USBY, 170, 150,
                 [(USBX+63, "+5В", PLUS), (USBX+120, "GND", GND)],
                 subtitle="панельный · пигтейл") +
    bb.switch_rocker(SWX, SWY, 210, 96,
                     [(SWX+12, SWY+30, "ШИНА"), (SWX+12, SWY+64, "LOAD")],
                     title="SW1", subtitle="общий выключатель · на входе LOAD") +
    battery_split(BATX, BATY))

leads = (
    # адаптер 5 В: +5В → анод D1 (37h); GND → «−» низ (правая половина, кол.48)
    mlead([(USBX+63, USBY), (USBX+63, 556), (X(37), 556), H(37, "h")], PLUS,
          "адаптер +5В → 37h (анод D1)", "адаптер +5В", "37h", "МОДУЛИ") +
    mlead([(USBX+120, USBY), (USBX+120, 544), (X(48), 544), (X(48), RAIL_BM)], GND,
          "адаптер GND → «−» низ, кол.48", "адаптер GND", "«−» GND низ", "МОДУЛИ",
          note="правая половина: ток заряда 1 А не идёт через связку кол.16/17") +
    # TP4056 B− — отдельная сеть! на «−» пакета, мимо рельса
    mlead([H(46, "i"), (X(46), 548), (70, 548), (70, BATY+112), (BATX+67, BATY+112)], PURPLE,
          "TP4056 B− → «−» пакета (отдельная сеть!)", "46i", "«−» пакета", "МОДУЛИ",
          both_sq=True, note="НЕ на общий «−» рельс — иначе отключится защита DW01") +
    # батарея «+» → F1; «+» холдера (сенсорный) → верх делителя (23a)
    mlead([(BATX+463, BATY+92), (1050, BATY+92), (1050, 540), (X(42), 540), H(42, "j")], PLUS,
          "«+» пакета → F1 (42j)", "«+» пакета", "42j", "МОДУЛИ") +
    mlead([(BATX+463, BATY+128), (BATX+463, BATY-10), (60, BATY-10), (60, 208),
           (X(23), 208), (X(23), 298)], PLUS,
          "«+» холдера → верх делителя (23a) — ОТДЕЛЬНЫЙ сенсорный провод",
          "«+» холдера", "23a", "МОДУЛИ",
          note="выходит НАД корпусом батарей, чтобы не резать нижний холдер") +
    # SW1: вход ← узел ШИНА (39), выход → «+» LOAD (левая половина, кол.4)
    mlead([(SWX+12, SWY+30), (676, SWY+30), (676, 552), (X(39), 552), H(39, "g")], PLUS,
          "SW1 ← узел ШИНА (39g)", "SW1 (вход)", "39g", "МОДУЛИ") +
    mlead([(SWX+12, SWY+64), (660, SWY+64), (660, 200), (X(4), 200), (X(4), RAIL_TP)], PLUS,
          "SW1 → «+» LOAD (4a)", "SW1 (выход)", "«+» LOAD верх", "МОДУЛИ",
          note="весь ток ESP32 садится на ЛЕВУЮ половину минуя разрез"))

# ═══════════════════════════════════════ 11. ДАТЧИК (правая колонка)
SX, SY, SW_, SH = 1240, 430, 500, 160
sensor = f'''<rect x="{SX}" y="{SY}" width="{SW_}" height="{SH}" rx="12"
    fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2"/>
  <text x="{SX+20}" y="{SY+26}" font-size="14" font-weight="700" fill="#1a1a1a">Датчик ветра · на мачте</text>
  <text x="{SX+20}" y="{SY+44}" font-size="10.5" fill="#666">0–30 м/с · питание 12 В · выход 0–5 В · кабель до 4 м</text>
  <g stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M{SX+350} {SY+70} L{SX+120} {SY+70}" stroke="{TEAL}"/>
    <path d="M{SX+350} {SY+95} L{SX+120} {SY+95}" stroke="{GND}"/>
    <path d="M{SX+350} {SY+120} L{SX+120} {SY+120}" stroke="{PLUS}"/>
  </g>
  <circle cx="{SX+394}" cy="{SY+95}" r="30" fill="#eceadf" stroke="#c7c1ae" stroke-width="2"/>
  <circle cx="{SX+394}" cy="{SY+95}" r="10" fill="#8d8d8d"/>
  <text x="{SX+126}" y="{SY+64}" font-size="9.5" fill="{TEAL}" font-weight="700">жёлтый · сигнал 0–5 В</text>
  <text x="{SX+126}" y="{SY+89}" font-size="9.5" fill="#333" font-weight="700">чёрный · GND</text>
  <text x="{SX+126}" y="{SY+114}" font-size="9.5" fill="{PLUS}" font-weight="700">красный · +12 В</text>'''

sensor_leads = (
    mlead([(SX+120, SY+70), (1150, SY+70), (1150, 190), (X(29), 190), (X(29), 298)], TEAL,
          "датчик жёлтый → 29a (верх делителя датчика)",
          "датчик жёлтый", "29a", "МОДУЛИ") +
    mlead([(SX+120, SY+95), (1120, SY+95), (1120, 560), (X(52), 560), (X(52), RAIL_BM)],
          GND, "датчик чёрный → «−» низ, кол.52",
          "датчик чёрный", "«−» GND низ", "МОДУЛИ",
          note="общая точка отсчёта для АЦП") +
    mlead([(SX+120, SY+120), (1180, SY+120), (1180, 560), (X(63), 560), H(63, "j")], PLUS,
          "датчик красный (+12 В) → 63j (выход Boost#1)",
          "датчик красный", "63j", "МОДУЛИ"))

# ═══════════════════════════════════════ 12. CHRG / STDBY (пайка на TP4056)
CHRG_LANE = 470
chrg = (mlead([(X(48), 300), (X(48), 206), (X(3), 206), (X(3), 298)],
              "#2a7de1", "TP4056 CHRG (катод красного LED) → GPIO13",
              "пайка на TP4056", "3a", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="202" font-size="9.5" font-weight="700" fill="#2a7de1">'
        f'CHRG → GPIO13 · пайка к катоду красного светодиода на самом TP4056</text>' +
        # STDBY (катод синего LED на TP4056) → GPIO19: снизу платы, под нижним банком
        mlead([(X(47), 470), (X(47), LOW_C), (X(10), LOW_C), (X(10), 481)],
              STDBY_C, "TP4056 STDBY (катод синего LED) → GPIO19",
              "пайка на TP4056", "10j", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="{LOW_C+16}" font-size="9.5" font-weight="700" fill="{STDBY_C}">'
        f'STDBY → GPIO19 · пайка к катоду синего светодиода на самом TP4056</text>')

# ═══════════════════════════════════════ 13. ESP32 + КОЛЬЦА + ЛИНЕЙКА
esp = bb.esp32(subtitle="v4 · модули + LED-резисторы на плате",
               highlight=["VIN", "13", "32", "34"], usb_label="")

# v4: старые LED-пины верхнего ряда (14/27/26/25/33) теперь СВОБОДНЫ — гасим их цвет,
# а новые LED-пины нижнего ряда красим и обводим кольцом.
esp_fix = "".join(
    f'<rect x="{bb.PIN_TOP[n]-6}" y="311" width="12" height="10" rx="2" fill="{bb.PAD_UNUSED}"/>'
    for n in ("14", "27", "26", "25", "33"))
esp_fix += "".join(
    f'<rect x="{bb.PIN_BOT[g]-6}" y="471" width="12" height="10" rx="2" fill="{col}"/>'
    for (g, ec, rl, rr, col, *_ ) in LEDS)
bot_ring = esp_fix + "".join(
    f'<rect x="{bb.PIN_BOT[n]-8}" y="469" width="16" height="14" rx="3" fill="none" '
    f'stroke="{SIG}" stroke-width="2.4"/>' for n in ("4", "16", "17", "5", "18", "19"))

mask = "".join(f'<rect x="{X(c)-11}" y="276" width="22" height="14" fill="{bb.BOARD_FILL}"/>'
               for c in range(20, NCOLS+1, 5))
TOPC = [19, 21, 23, 25, 27, 29, 31, 33, 35]
BOTC = [18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 37, 40, 42]
ruler = ('<g font-size="9" font-weight="700" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="389" fill="#2a6fd1">{c}</text>' for c in TOPC)
         + "".join(f'<text x="{X(c)}" y="389" fill="#b4552a">{c}</text>' for c in BOTC)
         + '</g>'
         + '<text x="82" y="384" font-size="8" fill="#2a6fd1">верх</text>'
         + '<text x="82" y="394" font-size="8" fill="#b4552a">низ</text>')

# ═══════════════════════════════════════ 14. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v4 — единая шина «+», SW1 на входе, резисторы LED на плате</text>
  <text x="30" y="62" font-size="14" fill="#666">Оба «+»-рельса связаны в одну цепь LOAD (кол.16), обе земли — на кол.17. LED переехали на нижний ряд GPIO (4·16·17·5·18), их резисторы 220 Ω — на плату.</text>'''

rules = '''<rect x="30" y="70" width="1180" height="78" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="91" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Единая шина «+»:</tspan> верхний и нижний «+»-рельсы связаны вертикалью на <tspan font-weight="700">кол.16</tspan>, обе «−» — на <tspan font-weight="700">кол.17</tspan>. Диодная развязка D1/D2 — локальный узел <tspan font-weight="700">ШИНА (кол.39)</tspan>, а не рельс.</text>
  <text x="46" y="109" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">SW1 на входе:</tspan> выключатель врезан между узлом ШИНА и рельсом LOAD — рвёт питание всей станции до рельса. Через разрез рельсов идут 2 моста (LOAD и GND) + связка «−» кол.58.</text>
  <text x="46" y="127" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">LED на крышке, резисторы на плате:</tspan> GPIO нижнего ряда (кол.5–9) → резистор 220 Ω (нижний банк, кол.18–36, ряд i) → провод к аноду LED на крышке → общий катод назад на «−».</text>
  <text x="46" y="144" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG. Тонкая с квадратом = внешний провод. Пересечение без точки = провод лежит поверх. Тёмный прямоугольник = корпус модуля.</text>'''

# ═══════════════════════════════════════ 15. ТАБЛИЦА
def build_table(y0):
    order = ["РЕЛЬСЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ", "МОДУЛИ НА ПЛАТЕ", "МОДУЛИ", "ПАЙКА"]
    heads = {"РЕЛЬСЫ": "Рельсы: связки кол.16/17 + мосты через разрез",
             "ПИТАНИЕ": "Питание и земля на макетке",
             "АЦП": "Сигналы в АЦП — траншею НЕ пересекают",
             "СВЕТОДИОДЫ": "Светодиоды: резисторы на плате, LED на крышке",
             "МОДУЛИ НА ПЛАТЕ": "TP4056 и бусты: перемычки к их колонкам",
             "МОДУЛИ": "Внешние: разъём, батарея, выключатель, датчик",
             "ПАЙКА": "Паяные линии TP4056"}
    left, right = [], []
    for g in order:
        rows = [w for w in WIRES if w["group"] == g]
        if rows:
            (left if g in ("РЕЛЬСЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ")
             else right).append((heads[g], rows))

    def render(blocks, x0, y):
        out = []
        for head, rows in blocks:
            out.append(f'<text x="{x0}" y="{y}" font-size="12.5" font-weight="700" fill="#2a6fd1">{head}</text>')
            y += 18
            for r in rows:
                out.append(f'<rect x="{x0}" y="{y-8}" width="9" height="9" rx="2" fill="{r["color"]}"/>')
                out.append(f'<text x="{x0+16}" y="{y}" font-size="11.5" fill="#333">{r["name"]}</text>')
                out.append(f'<text x="{x0+610}" y="{y}" font-size="11.5" font-weight="700" fill="#555" text-anchor="end">{r["frm"]} → {r["to"]}</text>')
                out.append(f'<text x="{x0+710}" y="{y}" font-size="11.5" fill="#8a4b3f" text-anchor="end">{r["mm"]}</text>')
                y += 16
            y += 12
        return "".join(out), y

    a, ya = render(left, 40, y0 + 28)
    b, yb = render(right, 940, y0 + 28)
    hdr = (f'<text x="30" y="{y0}" font-size="17" font-weight="700" fill="#1a1a1a">'
           f'Список соединений — длина перемычек уже с запасом 14 мм на два загиба</text>')
    return hdr + a + b, max(ya, yb)

# ═══════════════════════════════════════ 16. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS)

TABLE_Y = 1120
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
notes = f'''<rect x="30" y="{NY}" width="1760" height="254" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">Что изменилось против v3 и почему это держится</text>
  <text x="46" y="{NY+48}" font-size="12.5" fill="#333"><tspan font-weight="700">Единая шина «+».</tspan> Раньше нижний «+»-рельс был отдельной цепью ШИНА (до выключателя), верхний — LOAD (после). Теперь оба «+» = одна цепь LOAD, связаны на <tspan font-weight="700">кол.16</tspan>; обе «−» — на <tspan font-weight="700">кол.17</tspan>. Диодная развязка D1/D2 стала локальным узлом ШИНА на <tspan font-weight="700">кол.39</tspan> нижнего банка.</text>
  <text x="46" y="{NY+68}" font-size="12.5" fill="#2e7d32"><tspan font-weight="700">SW1 на входе.</tspan> Выключатель врезан между узлом ШИНА (кол.39) и рельсом LOAD (садится на левую половину, кол.4). Рвёт питание всей станции разом, до рельса — как и просили.</text>
  <text x="46" y="{NY+88}" font-size="12.5" fill="#333"><tspan font-weight="700">Резисторы 220 Ω — на плате.</tspan> 5 штук в нижнем банке, ряд i, через одну колонку (кол.18–36). GPIO нижнего ряда (<tspan font-weight="700">4·16·17·5·18</tspan>, кол.5–9) → резистор, проводом под ESP32/платой → провод к аноду LED на крышке → общий катод назад. На крышке теперь ТОЛЬКО светодиоды. Прошивка обновлена (PIN_LED_* → 4/16/17/5/18).</text>
  <text x="46" y="{NY+108}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">GPIO5 (зелёный, WiFi) — strapping-пин.</tspan> При загрузке кратко мигнёт — это норма (резистор 220 Ω к «−» не удерживает пин в 0). Остальные (4/16/17/18) — обычные GPIO.</text>
  <text x="46" y="{NY+128}" font-size="12.5" fill="#8e44ad">⚠  <tspan font-weight="700">«−» пакета — только на площадку B− (кол.46, ряд f), мимо общего рельса.</tspan> На «−» рельс нельзя: отключится защита DW01.</text>
  <text x="46" y="{NY+148}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя батареи (23a) — свой провод с холдера, НЕ с F1.</tspan> Иначе TP4056 держит 4.2–4.5 В без банки и подделывает напряжение батареи.</text>
  <text x="46" y="{NY+168}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">PPTC на место F1 (42j–44j) — первым делом.</tspan> Сейчас там перемычка: цепь батареи без защиты. Закрывать корпус с перемычкой нельзя.</text>
  <text x="46" y="{NY+188}" font-size="12.5" fill="#1a1a1a">Делители не менялись: <tspan font-weight="700">батарея кол.23–25–27</tspan> = 100k/100k → ×2.0; <tspan font-weight="700">датчик кол.29–31–33–35</tspan> = (10k+5k=15k)/10k → ×2.5. C1 1000µF (bulk на узле ШИНА) вынесен в верхний банк (кол.39–41) — в нижнем не осталось места.</text>
  <text x="46" y="{NY+210}" font-size="12.5" fill="#2e7d32">✓  Две банки 18650 разнесены по корпусу (одна сверху, другая снизу) — но в ПАРАЛЛЕЛЬ (оба «+» вместе, оба «−» вместе). Последовательно = 8.4 В, сожжёт станцию.</text>
  <text x="46" y="{NY+230}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Boost#1/#2 (HW-085/TMF002) — не перепутай IN и OUT при монтаже.</tspan> Признак не «верх/низ», а расстояние между контактами: два контакта РЯДОМ (близко друг к другу) = IN, два контакта, разнесённые К КРАЯМ платы, = OUT. Оба модуля были перевёрнуты — датчик ветра не давал показаний, пока не развернули.</text>'''

VH = NY + 274
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W_CANVAS} {VH}" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c, r4c)}
  <rect x="0" y="0" width="{W_CANVAS}" height="{VH}" fill="#ffffff"/>
  {title}
  {rules}
  {board}
  {mask}
  {ruler}
  {split_marks}
  {rails}
  {comps_top}
  {comps_bot}
  {comps_lbl}
  {esp}
  {bot_ring}
  {adc_wires}
  {rail_jmp}
  {board_jmp}
  {mods_inline}
  {gpio_res}
  {led_anode}
  {lid_panel}
  {led_cath}
  {mods_ext}
  {leads}
  {sensor}
  {sensor_leads}
  {chrg}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_v4.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
