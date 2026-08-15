# -*- coding: utf-8 -*-
"""СХЕМА v5 — v4 плюс 4G/GPS-модуль BK-A7670 (задача 10, шаги 1–2).

Отличия от v4 ровно в том, что добавляет задача 10, и ни в чём больше:

  1. Своё диодное ИЛИ для буста №3: D3 от узла USB-5 В, D4 — с `OUT+` TP4056
     (НЕ с сырой банки: 1.2–1.5 А в обход OUT+ минуют защиту от глубокого разряда).
     Оба — Шоттки на 3 А (SS34 / 1N5822 / SR340). Штатные 1N5819 шины остаются.
  2. Буст №3 (MT3608) на 5.2 В + электролит 1000 мкФ 16 В у самой платы модема.
  3. Модем на UART2: GPIO27 → RXD (CN101-6), GPIO26 ← TXD (CN101-5), общая земля.
     Оба пина не strapping и в v4 освободились — LED уехали в нижний ряд.
  4. F1 переезжает на PPTC 3 А, адаптер — на 3 А (либо Rprog 2.4 кΩ): пик на
     разряженной банке ~1.83 А, а «модем передаёт при заряде» = 2.01 А на адаптере.
  5. Ключ питания модема (P-MOSFET, затвор ← GPIO25) нарисован ПУНКТИРОМ: детали нет,
     но без него нельзя уезжать на мачту — R104 держит PWRKEY на земле, выход из CMUX
     у A7670 сломан, повисший модем перезагружается только снятием VCC.

Силовой тракт модема — 22AWG точка-в-точку, НЕ по рельсам макетки: 1.5 А через
пружинный контакт выше комфортного тока MB-102. Поэтому весь блок питания модема
нарисован отдельными карточками, а на плату садятся только два сигнальных провода.
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
TX_C = "#e0218a"                      # GPIO27 → RXD модема
RX_C = "#3949ab"                      # GPIO26 ← TXD модема
SIG, GND, PLUS, PURPLE = bb.SIG, bb.GNDc, bb.PLUS, bb.PURPLE
W_CANVAS = 1900

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

def mlead(pts, color, name, frm, to, group, w=2.2, note="", both_sq=False, cut="по месту"):
    x0, y0 = pts[0]; xe, ye = pts[-1]
    s = (f'<path d="{dpath(pts)}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>'
         f'<rect x="{x0-4:.1f}" y="{y0-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>')
    s += (f'<rect x="{xe-4:.1f}" y="{ye-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>'
          if both_sq else f'<circle cx="{xe:.1f}" cy="{ye:.1f}" r="3.4" fill="{color}"/>')
    WIRES.append(dict(group=group, name=name, frm=frm, to=to,
                      color=color, mm=cut, note=note))
    return s

# ═══════════════════════════════════════ 1. СВЯЗКИ РЕЛЬСОВ + МОСТЫ ЧЕРЕЗ РАЗРЕЗ
RAIL_NAME = {RAIL_TP: "«+» LOAD верх", RAIL_TM: "«−» GND верх",
             RAIL_BP: "«+» LOAD низ", RAIL_BM: "«−» GND низ"}

def vlink(col, color, y_top, y_bot, name, note=""):
    x = X(col)
    dx = 9 if color == GND else -9
    return jmp([(x, y_top), (x+dx, y_top+18), (x+dx, y_bot-18), (x, y_bot)],
               color, name, RAIL_NAME[y_top], RAIL_NAME[y_bot], "РЕЛЬСЫ", w=3.2, note=note)

def cut_bridge(y_rail, color, y_arch, name, note=""):
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
UART_LANE = {"tx": 170, "rx": 161, "gnd": 179}   # UART модема — над платой, выше АЦП
GPIO_LANE = [483, 486, 489, 492, 495]
TRENCH_LANE = 391
LOW_A, LOW_B, LOW_C = 490, 498, 550
# три подводки к блоку питания модема — ниже датчика, выше карточки B3
FEED = {"d3": 570, "d4": 580, "gnd": 590}   # между низом датчика (560) и верхом SW1 (600)

# ═══════════════════════════════════════ 3. ВЕРХНИЙ БАНК — СИГНАЛЫ
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
B10K  = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#c00",     "#7a4a12"]
B5K   = ["#2e8b3d", "#1a1a1a", "#1a1a1a", "#7a4a12", "#7a4a12"]

comps_top = (
    bb.cap_ceramic(19, 21, "c", label="C2 100нФ") +
    bb.resistor(23, 25, "c", B100K, label="") +
    bb.resistor(25, 27, "c", B100K, label="") +
    bb.cap_ceramic(25, 27, "e", label="") +
    bb.resistor(29, 31, "c", B10K, label="") +
    bb.resistor(31, 33, "c", B5K,  label="") +
    bb.resistor(33, 35, "c", B10K, label="") +
    bb.cap_ceramic(33, 35, "e", label="") +
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
B220 = ["#c00", "#c00", "#1a1a1a", "#1a1a1a", "#7a4a12"]

LEDS = [("4",  5,  18, 20, "#c62828",  "#7d1a1a", "красный", "ветер &gt;15 м/с"),
        ("16", 6,  22, 24, "#f2c21a",  "#a6821a", "жёлтый",  "ветер &gt;5 м/с"),
        ("17", 7,  26, 28, "#34c24a",  "#1c7a2e", "зелёный", "станция ОК"),
        ("5",  8,  30, 32, "#1f9d3a",  "#146127", "зелёный", "WiFi есть"),
        ("18", 9,  34, 36, "#e23b2e",  "#8f1f16", "красный", "ошибка АЦП")]

led_res = "".join(bb.resistor(rl, rr, "i", B220, label="220") for g, ec, rl, rr, *_ in LEDS)

comps_bot = (
    led_res +
    bb.diode_schottky(37, 39, "h", "D1", cathode="right") +
    bb.diode_schottky(39, 41, "h", "D2", cathode="left") +
    f'<text x="{X(39):.0f}" y="468" font-size="8.5" font-weight="700" '
    f'fill="{bb.COPPER}" text-anchor="middle">2×1N5819</text>' +
    bb.ptc(42, 44, "j", "") +
    f'<text x="{(X(42)+X(44))/2:.0f}" y="418" font-size="9" font-weight="700" '
    f'fill="#c0392b" text-anchor="middle">F1 · PTC 3A</text>' +
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
    to_rail(45, "a", RAIL_TM, GND,  "TP4056 IN− → «−» GND",     "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    to_rail(45, "j", RAIL_BM, GND,  "TP4056 OUT− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(56, "a", RAIL_TM, GND,  "Boost#2 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(53, "j", RAIL_BM, GND,  "Boost#2 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(61, "a", RAIL_TP, PLUS, "Boost#1 IN+ → «+» LOAD",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(62, "a", RAIL_TM, GND,  "Boost#1 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(59, "j", RAIL_BM, GND,  "Boost#1 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ"))

# ═══════════════════════════════════════ 7. ПЕРЕМЫЧКИ МЕЖДУ УЗЛАМИ
GAP = (X(51) + X(52)) / 2.0

board_jmp = (
    jmp([H(39, "d"), (X(39), TRENCH_LANE), H(39, "f")], PLUS,
        "C1 «+» → узел ШИНА", "39d", "39f", "ПИТАНИЕ",
        note="bulk-конденсатор на диодной развязке") +
    jmp([H(37, "f"), (X(37), TRENCH_LANE-8), (X(50), TRENCH_LANE-8), H(50, "b")], PLUS,
        "+5 В адаптера → TP4056 IN+", "37f", "50b", "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    jmp([H(49, "i"), (X(49), 470), (GAP, 470), (GAP, 290), (X(55), 290), H(55, "c")],
        PLUS, "TP4056 OUT+ → Boost#2 IN+", "49i", "55c", "МОДУЛИ НА ПЛАТЕ",
        note="один узел: выход зарядника = вход буста") +
    jmp([H(44, "j"), (X(44), LOW_A), (X(50), LOW_A), H(50, "j")], PLUS,
        "F1 (после PTC) → TP4056 B+", "44j", "50j", "МОДУЛИ НА ПЛАТЕ",
        note="защищённый «+» батареи") +
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

RISER_X = X(36) + 28
led_cath = jmp([(X(36), CATH_Y), (RISER_X, CATH_Y), (RISER_X, 540), (X(46), 540), (X(46), RAIL_BM)],
               GND, "общий катод 5 LED → «−» GND", "крышка", "«−» GND низ",
               "СВЕТОДИОДЫ", w=2.8, dots="none", cut="по месту")

lid_panel = [f'<rect x="{LIDX}" y="{LIDY}" width="{LIDW}" height="{LIDH}" rx="12" '
             f'fill="#2b2b30" stroke="#15161a" stroke-width="2"/>',
             f'<text x="{LIDX+14}" y="{LIDY+22}" font-size="13" font-weight="700" fill="#f2f2f2">'
             f'Крышка · 5 светодиодов</text>',
             f'<text x="{LIDX+14}" y="{LIDY+38}" font-size="9.5" fill="#9aa">'
             f'крышка глухая — под каждый LED сверлится отверстие и герметизируется</text>']
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
    w = 600
    h1y, h2y = y+42, y+150
    def holder(hy, where):
        return (f'<rect x="{x+115}" y="{hy}" width="300" height="40" rx="20" fill="#eceadf" stroke="#c7c1ae"/>'
                f'<rect x="{x+129}" y="{hy+7}" width="272" height="26" rx="13" fill="#333"/>'
                f'<text x="{x+141}" y="{hy+25}" font-size="10" fill="#eee">18650 · 3.96 В  ({where})</text>'
                f'<rect x="{x+97}" y="{hy+10}" width="16" height="20" rx="2" fill="#555"/>'
                f'<rect x="{x+417}" y="{hy+10}" width="16" height="20" rx="2" fill="{PLUS}"/>'
                f'<text x="{x+105}" y="{hy-2}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">−</text>'
                f'<text x="{x+425}" y="{hy-2}" font-size="14" font-weight="700" fill="{PLUS}" text-anchor="middle">+</text>')
    midY = (h1y + h2y) / 2 + 20
    def splice(term_x, trunk_x, color, label, lx, anchor):
        return (f'<path d="M{term_x} {h1y+20} Q{(term_x+trunk_x)/2:.0f} {h1y+20} {trunk_x} {midY-3:.0f}" '
                f'fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
                f'<path d="M{term_x} {h2y+20} Q{(term_x+trunk_x)/2:.0f} {h2y+20} {trunk_x} {midY+3:.0f}" '
                f'fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
                f'<circle cx="{term_x}" cy="{h1y+20}" r="4" fill="{color}"/>'
                f'<circle cx="{term_x}" cy="{h2y+20}" r="4" fill="{color}"/>'
                f'<circle cx="{trunk_x}" cy="{midY:.0f}" r="6" fill="#ddd6c0" stroke="#7a6a3a" stroke-width="1.6"/>'
                f'<line x1="{trunk_x}" y1="{midY:.0f}" x2="{trunk_x}" y2="{h1y+20}" fill="none" stroke="{color}" stroke-width="4"/>'
                f'<line x1="{trunk_x}" y1="{midY:.0f}" x2="{trunk_x}" y2="{h2y+20}" fill="none" stroke="{color}" stroke-width="4"/>'
                f'<text x="{lx}" y="{midY-11:.0f}" font-size="8.5" font-weight="700" fill="#7a6a3a" text-anchor="{anchor}">пайка</text>'
                f'<text x="{lx}" y="{midY+22:.0f}" font-size="10.5" font-weight="700" fill="{color}" text-anchor="{anchor}">{label}</text>')
    return (f'<rect x="{x}" y="{y}" width="{w}" height="210" rx="12" fill="{bb.BOARD_FILL}" stroke="{bb.BOARD_STK}" stroke-width="2"/>'
            f'<text x="{x+16}" y="{y+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">'
            f'2×18650 · ПАРАЛЛЕЛЬ · банки РАЗНЕСЕНЫ по корпусу</text>'
            + holder(h1y, "ВЕРХ корпуса") + holder(h2y, "НИЗ корпуса") +
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
                 subtitle="панельный · адаптер 3 А") +
    bb.switch_rocker(SWX, SWY, 210, 96,
                     [(SWX+12, SWY+30, "ШИНА"), (SWX+12, SWY+64, "LOAD")],
                     title="SW1", subtitle="общий выключатель · на входе LOAD") +
    battery_split(BATX, BATY))

leads = (
    mlead([(USBX+63, USBY), (USBX+63, 556), (X(37), 556), H(37, "h")], PLUS,
          "адаптер +5В → 37h (анод D1)", "адаптер +5В", "37h", "МОДУЛИ") +
    mlead([(USBX+120, USBY), (USBX+120, 544), (X(48), 544), (X(48), RAIL_BM)], GND,
          "адаптер GND → «−» низ, кол.48", "адаптер GND", "«−» GND низ", "МОДУЛИ",
          note="правая половина: ток заряда не идёт через связку кол.16/17") +
    mlead([H(46, "i"), (X(46), 548), (70, 548), (70, BATY+112), (BATX+67, BATY+112)], PURPLE,
          "TP4056 B− → «−» пакета (отдельная сеть!)", "46i", "«−» пакета", "МОДУЛИ",
          both_sq=True, note="НЕ на общий «−» рельс — иначе отключится защита DW01") +
    mlead([(BATX+463, BATY+92), (1050, BATY+92), (1050, 540), (X(42), 540), H(42, "j")], PLUS,
          "«+» пакета → F1 (42j)", "«+» пакета", "42j", "МОДУЛИ") +
    mlead([(BATX+463, BATY+128), (BATX+463, BATY-10), (60, BATY-10), (60, 208),
           (X(23), 208), (X(23), 298)], PLUS,
          "«+» холдера → верх делителя (23a) — ОТДЕЛЬНЫЙ сенсорный провод",
          "«+» холдера", "23a", "МОДУЛИ",
          note="выходит НАД корпусом батарей, чтобы не резать нижний холдер") +
    mlead([(SWX+12, SWY+30), (676, SWY+30), (676, 552), (X(39), 552), H(39, "g")], PLUS,
          "SW1 ← узел ШИНА (39g)", "SW1 (вход)", "39g", "МОДУЛИ") +
    mlead([(SWX+12, SWY+64), (660, SWY+64), (660, 200), (X(4), 200), (X(4), RAIL_TP)], PLUS,
          "SW1 → «+» LOAD (4a)", "SW1 (выход)", "«+» LOAD верх", "МОДУЛИ",
          note="весь ток ESP32 садится на ЛЕВУЮ половину минуя разрез"))

# ═══════════════════════════════════════ 11. ДАТЧИК (правая колонка)
SX, SY, SW_, SH = 1240, 400, 500, 160
sensor = f'''<rect x="{SX}" y="{SY}" width="{SW_}" height="{SH}" rx="12"
    fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2"/>
  <text x="{SX+20}" y="{SY+26}" font-size="14" font-weight="700" fill="#1a1a1a">Датчик ветра · на мачте</text>
  <text x="{SX+20}" y="{SY+44}" font-size="10.5" fill="#666">0–30 м/с, только скорость · питание 12 В · выход 0–5 В · кабель до 4 м</text>
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
chrg = (mlead([(X(48), 300), (X(48), 206), (X(3), 206), (X(3), 298)],
              "#2a7de1", "TP4056 CHRG (катод красного LED) → GPIO13",
              "пайка на TP4056", "3a", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="202" font-size="9.5" font-weight="700" fill="#2a7de1">'
        f'CHRG → GPIO13 · пайка к катоду красного светодиода на самом TP4056</text>' +
        mlead([(X(47), 470), (X(47), LOW_C), (X(10), LOW_C), (X(10), 481)],
              STDBY_C, "TP4056 STDBY (катод синего LED) → GPIO19",
              "пайка на TP4056", "10j", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="{LOW_C+16}" font-size="9.5" font-weight="700" fill="{STDBY_C}">'
        f'STDBY → GPIO19 · пайка к катоду синего светодиода на самом TP4056</text>')

# ═══════════════════════════════════════ 13. БЛОК ПИТАНИЯ МОДЕМА (задача 10)
PAX, PAY, PAW, PAH = 1250, 628, 630, 262        # карточка «питание модема»
P_LANE, G_TOP, G_BOT, VCC_LANE = 692, 704, 872, 864

D3_Y, D4_Y = 706, 766
D_L, D_R = 1300, 1384                            # анод → катод обоих новых диодов
FETX, FETY, FETW, FETH = 1406, 708, 116, 56
B3X, B3Y, B3W, B3H = 1560, 744, 176, 112
B3_IN_P, B3_IN_M, B3_OUT_P, B3_OUT_M = 1586, 1612, 1684, 1710
C4_P, C4_M, C4_Y = 1776, 1818, 824
VCC_RISER, GND_RISER, D4_RISER = 1262, 1274, 1288

boost3 = bb.mod_boost(B3X, B3Y, B3W, B3H,
                      [(B3_IN_P, "IN+", PLUS), (B3_IN_M, "IN−", bb.PAD_GNDp),
                       (B3_OUT_P, "OUT+", PLUS), (B3_OUT_M, "OUT−", bb.PAD_GNDp)],
                      subtitle="Boost#3 → 5.2 В для модема")

power_panel = (
    f'<rect x="{PAX}" y="{PAY}" width="{PAW}" height="{PAH}" rx="12" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{PAX+18}" y="{PAY+24}" font-size="14" font-weight="700" fill="#1a1a1a">'
    f'Питание модема — НОВОЕ, монтаж 22AWG точка-в-точку</text>'
    f'<text x="{PAX+18}" y="{PAY+41}" font-size="10" fill="#8a6a1a">'
    f'через пружины макетки 1.5 А не гонять: своё диодное ИЛИ, свой буст, свой электролит</text>' +
    bb.diode_xy(D_L, D_R, D3_Y, "D3 · SS34 3 А", cathode="right") +
    bb.diode_xy(D_L, D_R, D4_Y, "D4 · SS34 3 А", cathode="right") +
    f'<text x="{D_L+42}" y="{D3_Y+18}" font-size="8.5" font-weight="700" fill="{PLUS}" text-anchor="middle">от узла USB-5 В</text>'
    f'<text x="{D_L+42}" y="{D4_Y+18}" font-size="8.5" font-weight="700" fill="{PLUS}" text-anchor="middle">от OUT+ TP4056</text>'
    # узел «вход B3» — точка схождения катодов
    f'<line x1="{D_R}" y1="{D3_Y}" x2="{D_R}" y2="{D4_Y}" stroke="{PLUS}" stroke-width="3"/>'
    f'<circle cx="{D_R}" cy="{D3_Y}" r="3.6" fill="{PLUS}"/>'
    f'<circle cx="{D_R}" cy="{D4_Y}" r="3.6" fill="{PLUS}"/>'
    f'<text x="{D_R+4}" y="{D4_Y+18}" font-size="8.5" font-weight="700" fill="{PLUS}">вход B3</text>' +
    bb.mod_pmos_switch(FETX, FETY, FETW, FETH, title="Ключ питания",
                       subtitle="high-side · затвор GPIO25") +
    boost3 +
    bb.cap_electrolytic_xy(C4_P, C4_M, C4_Y, "C4") +
    bb.mm_point(1700, 720, "5.2 В под нагрузкой", dy=-8) +
    f'<text x="{(C4_P+C4_M)/2:.0f}" y="{C4_Y-70}" font-size="8.5" font-weight="700" '
    f'fill="{bb.COPPER}" text-anchor="middle">1000 мкФ 16 В</text>' +
    f'<text x="{PAX+18}" y="{PAY+PAH-10}" font-size="9.5" fill="#c0392b">'
    f'⚠ D4 берётся с OUT+ TP4056, НЕ с банки: иначе 1.5 А обходят защиту от глубокого разряда</text>')

power_wires = (
    # катодный узел → ключ → вход буста
    mlead([(D_R, (D3_Y+D4_Y)/2), (FETX, (D3_Y+D4_Y)/2)], PLUS,
          "узел диодного ИЛИ → ключ питания", "вход B3", "P-FET", "4G · ПИТАНИЕ") +
    mlead([(FETX+FETW, FETY+FETH/2), (1540, FETY+FETH/2), (1540, P_LANE),
           (B3_IN_P, P_LANE), (B3_IN_P, B3Y)], PLUS,
          "ключ → Boost#3 IN+", "P-FET", "B3 IN+", "4G · ПИТАНИЕ") +
    # земли блока
    mlead([(B3_IN_M, B3Y), (B3_IN_M, G_TOP), (GND_RISER, G_TOP), (GND_RISER, G_BOT),
           (C4_M, G_BOT), (C4_M, C4_Y)], GND,
          "земля блока: B3 IN− · C4 «−» · станция", "B3 IN−", "C4 «−»", "4G · ПИТАНИЕ",
          w=2.8, note="одна точка земли на весь блок питания модема") +
    mlead([(B3_OUT_M, B3Y), (B3_OUT_M, G_TOP)], GND,
           "Boost#3 OUT− → земля блока", "B3 OUT−", "земля блока", "4G · ПИТАНИЕ") +
    # выход буста → электролит
    mlead([(B3_OUT_P, B3Y), (B3_OUT_P, 720), (1862, 720), (1862, C4_Y), (C4_P, C4_Y)], PLUS,
          "Boost#3 OUT+ → C4 «+» (5.2 В)", "B3 OUT+", "C4 «+»", "4G · ПИТАНИЕ", w=2.8))

# подводки с макетки к блоку питания
power_feeds = (
    mlead([H(37, "j"), (X(37), FEED["d3"]), (D_L, FEED["d3"]), (D_L, D3_Y)], PLUS,
          "узел USB-5 В (37j) → анод D3", "37j", "анод D3", "4G · ПИТАНИЕ", w=2.8,
          note="тот же узел, что кормит TP4056 IN+ — модем разгружает банку при адаптере") +
    mlead([H(49, "j"), (X(49), FEED["d4"]), (D4_RISER, FEED["d4"]), (D4_RISER, D4_Y), (D_L, D4_Y)], PLUS,
          "TP4056 OUT+ (49j) → анод D4", "49j", "анод D4", "4G · ПИТАНИЕ", w=2.8,
          note="ОБЯЗАТЕЛЬНО с OUT+, а не с плюса банки") +
    mlead([H(45, "i"), (X(45), FEED["gnd"]), (GND_RISER, FEED["gnd"]), (GND_RISER, G_TOP)], GND,
          "TP4056 OUT− (45i) → земля блока модема", "45i", "земля блока", "4G · ПИТАНИЕ", w=2.8,
          note="обратный ток модема идёт своим проводом, не через рельс макетки"))

# ═══════════════════════════════════════ 14. ПЛАТА МОДЕМА + АНТЕННЫ
PBX, PBY, PBW, PBH = 1250, 906, 630, 306
MODX, MODY, MODW, MODH = 1310, 946, 330, 216

CN_USED = {2: GND, 3: PLUS, 5: RX_C, 6: TX_C, 7: "#6b6f78"}
def CN(i): return bb.a7670_cn(MODX, MODY, i)

AX, AW = MODX + 362, 180
antennas = (
    f'<rect x="{AX}" y="{MODY+8}" width="{AW}" height="70" rx="8" fill="#2b2b30" stroke="#15161a"/>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+34}" font-size="11" font-weight="700" fill="#f2f2f2" text-anchor="middle">LTE · плёночная</text>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+52}" font-size="8.5" fill="#9aa" text-anchor="middle">в J1 · уже воткнута</text>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+68}" font-size="8.5" fill="#9aa" text-anchor="middle">B7 = 2500–2570 МГц</text>'
    f'<rect x="{AX}" y="{MODY+94}" width="{AW}" height="70" rx="8" fill="#2b2b30" stroke="#15161a"/>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+120}" font-size="11" font-weight="700" fill="#f2f2f2" text-anchor="middle">GPS · патч 1575 МГц</text>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+138}" font-size="8.5" fill="#9aa" text-anchor="middle">в J2 · «1594P-C»</text>'
    f'<text x="{AX+AW/2:.0f}" y="{MODY+154}" font-size="8.5" fill="#9aa" text-anchor="middle">патчем ВВЕРХ, к небу</text>'
    f'<text x="{AX}" y="{MODY+186}" font-size="9" fill="#c0392b">⚠ развести с антенной ESP32 ≥10–15 см</text>'
    f'<text x="{AX}" y="{MODY+202}" font-size="9" fill="#c0392b">⚠ GNSS в этом SKU решает AT+CGNSSPWR=1</text>')

modem_panel = (
    f'<rect x="{PBX}" y="{PBY}" width="{PBW}" height="{PBH}" rx="12" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{PBX+18}" y="{PBY+24}" font-size="14" font-weight="700" fill="#1a1a1a">'
    f'4G/GPS-модуль — НОВОЕ (задача 10)</text>' +
    bb.mod_a7670(MODX, MODY, MODW, MODH, used=CN_USED) + antennas +
    f'<text x="{PBX+18}" y="{PBY+PBH-10}" font-size="9.5" fill="#c0392b">'
    f'⚠ буквы не совпадают: TXD платы → RX-пин ESP32. Контакты 1 SLEEP и 4 PWRKEY не подключаются</text>')

modem_wires = (
    mlead([(C4_P, C4_Y), (C4_P, VCC_LANE), (VCC_RISER, VCC_LANE),
           (VCC_RISER, CN(3)[1]), CN(3)], PLUS,
          "C4 «+» (5.2 В) → CN101-3 VCC", "C4 «+»", "CN101-3", "4G · МОДЕМ", w=2.8,
          note="электролит стоит У САМОЙ платы модема, не у выхода буста") +
    mlead([(GND_RISER, G_BOT), (GND_RISER, CN(2)[1]), CN(2)], GND,
          "земля блока → CN101-2 GND (силовая)", "земля блока", "CN101-2", "4G · МОДЕМ", w=2.8) +
    # UART: буквы не совпадают
    mlead([(bb.PIN_TOP["27"], 311), (bb.PIN_TOP["27"], UART_LANE["tx"]),
           (1196, UART_LANE["tx"]), (1196, CN(6)[1]), CN(6)], TX_C,
          "GPIO27 (TX) → CN101-6 RXD", "GPIO27", "CN101-6", "4G · МОДЕМ", w=2.4) +
    mlead([(bb.PIN_TOP["26"], 311), (bb.PIN_TOP["26"], UART_LANE["rx"]),
           (1208, UART_LANE["rx"]), (1208, CN(5)[1]), CN(5)], RX_C,
          "GPIO26 (RX) ← CN101-5 TXD", "GPIO26", "CN101-5", "4G · МОДЕМ", w=2.4) +
    mlead([(bb.PIN_TOP["GND"], 311), (bb.PIN_TOP["GND"], UART_LANE["gnd"]),
           (1220, UART_LANE["gnd"]), (1220, CN(7)[1]), CN(7)], "#6b6f78",
          "ESP32 GND → CN101-7 GND (сигнальная)", "ESP32 GND", "CN101-7", "4G · МОДЕМ", w=2.4,
          note="отдельно от силовой земли: у CN101 два контакта GND, это не дубль") +
    # план: затвор ключа
    f'<path d="M{FETX+FETW/2:.0f} {FETY+FETH} L{FETX+FETW/2:.0f} 804 L1234 804 L1234 152 '
    f'L{bb.PIN_TOP["25"]} 152 L{bb.PIN_TOP["25"]} 311" fill="none" stroke="#b08a2a" '
    f'stroke-width="2.2" stroke-dasharray="6 4" opacity="0.7"/>'
    f'<text x="1242" y="156" font-size="9" font-weight="700" fill="#8a6a1a">затвор ключа ← GPIO25 · ПЛАН</text>')

# ═══════════════════════════════════════ 15. ESP32 + КОЛЬЦА + ЛИНЕЙКА
esp = bb.esp32(subtitle="v5 · 4G/GPS на UART2 (27/26)",
               highlight=["VIN", "13", "32", "34", "27", "26"], usb_label="")

# v5: 27/26 ушли под UART модема, 25 зарезервирован под ключ питания, 14/33 свободны
esp_fix = "".join(
    f'<rect x="{bb.PIN_TOP[n]-6}" y="311" width="12" height="10" rx="2" fill="{bb.PAD_UNUSED}"/>'
    for n in ("14", "33"))
esp_fix += (f'<rect x="{bb.PIN_TOP["27"]-6}" y="311" width="12" height="10" rx="2" fill="{TX_C}"/>'
            f'<rect x="{bb.PIN_TOP["26"]-6}" y="311" width="12" height="10" rx="2" fill="{RX_C}"/>'
            f'<rect x="{bb.PIN_TOP["25"]-6}" y="311" width="12" height="10" rx="2" fill="#e0d2a8"/>'
            f'<rect x="{bb.PIN_TOP["25"]-8}" y="309" width="16" height="14" rx="3" fill="none" '
            f'stroke="#b08a2a" stroke-width="2" stroke-dasharray="3 2"/>')
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

# ═══════════════════════════════════════ 16. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v5 — v4 плюс 4G/GPS-модуль BK-A7670 (задача 10)</text>
  <text x="30" y="62" font-size="14" fill="#666">Макетка не меняется ни одной перемычкой. Добавляются: своё диодное ИЛИ на 3 А, третий буст 5.2 В, электролит у платы модема и два сигнальных провода на GPIO27/26.</text>'''

rules = '''<rect x="30" y="70" width="1180" height="78" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="91" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Питание модема — отдельный тракт:</tspan> 22AWG точка-в-точку, <tspan font-weight="700">не по рельсам</tspan>. На разряженной банке вход буста берёт до <tspan font-weight="700">1.5 А</tspan> — это выше комфортного тока пружинного контакта MB-102.</text>
  <text x="46" y="109" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Диодное ИЛИ у буста своё:</tspan> D3 от узла USB-5 В, D4 — <tspan font-weight="700">с OUT+ TP4056</tspan>. Вешать на банку нельзя (обход защиты), вешать на шину — двойное преобразование. Оба диода <tspan font-weight="700">3 А</tspan>: 1N5819 держит только 1 А.</text>
  <text x="46" y="127" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">UART без переворота:</tspan> GPIO27 (TX) → RXD, GPIO26 (RX) ← TXD. Буквы не совпадают. <tspan font-weight="700">Serial2 по умолчанию сидит на GPIO16/17 — это жёлтый и зелёный светодиоды</tspan>, пины задавать явно.</text>
  <text x="46" y="144" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG. Тонкая с квадратом = внешний провод. Пунктир = ещё не куплено. Пересечение без точки = провод лежит поверх.</text>'''

# ═══════════════════════════════════════ 17. ТАБЛИЦА
def build_table(y0):
    order = ["РЕЛЬСЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ",
             "МОДУЛИ НА ПЛАТЕ", "МОДУЛИ", "ПАЙКА", "4G · ПИТАНИЕ", "4G · МОДЕМ"]
    heads = {"РЕЛЬСЫ": "Рельсы: связки кол.16/17 + мосты через разрез",
             "ПИТАНИЕ": "Питание и земля на макетке",
             "АЦП": "Сигналы в АЦП — траншею НЕ пересекают",
             "СВЕТОДИОДЫ": "Светодиоды: резисторы на плате, LED на крышке",
             "МОДУЛИ НА ПЛАТЕ": "TP4056 и бусты: перемычки к их колонкам",
             "МОДУЛИ": "Внешние: разъём, батарея, выключатель, датчик",
             "ПАЙКА": "Паяные линии TP4056",
             "4G · ПИТАНИЕ": "НОВОЕ · тракт питания модема (22AWG точка-в-точку)",
             "4G · МОДЕМ": "НОВОЕ · провода на плату BK-A7670"}
    left, right = [], []
    for g in order:
        rows = [w for w in WIRES if w["group"] == g]
        if rows:
            (left if g in ("РЕЛЬСЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ")
             else right).append((heads[g], rows))

    def render(blocks, x0, y):
        out = []
        for head, rows in blocks:
            fill = "#c0392b" if head.startswith("НОВОЕ") else "#2a6fd1"
            out.append(f'<text x="{x0}" y="{y}" font-size="12.5" font-weight="700" fill="{fill}">{head}</text>')
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
    b, yb = render(right, 1000, y0 + 28)
    hdr = (f'<text x="30" y="{y0}" font-size="17" font-weight="700" fill="#1a1a1a">'
           f'Список соединений — длина перемычек уже с запасом 14 мм на два загиба</text>')
    return hdr + a + b, max(ya, yb)

# ═══════════════════════════════════════ 18. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS)

TABLE_Y = 1270
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
NOTE_LINES = [
    ("#1a1a1a", '<tspan font-weight="700">Своё диодное ИЛИ для буста №3.</tspan> Повесить B3 прямо на банку нельзя: модем ел бы из неё и во время заряда, ток разряда не дал бы зарядному упасть до порога окончания —'),
    ("#333",    'STDBY никогда бы не сработал, и chargeState завис бы на charging навсегда. Вариант «с шины» тоже отпал: на батарее это двойное преобразование, КПД ~81%.'),
    ("#c0392b", '⚠  <tspan font-weight="700">D4 — строго с OUT+ TP4056, а не с плюса банки.</tspan> 1.2–1.5 А в обход OUT+ минуют защиту DW01, и у элементов не остаётся никакой отсечки по глубокому разряду.'),
    ("#c0392b", '⚠  <tspan font-weight="700">1N5819 сюда не годится — нужны Шоттки на 3 А</tspan> (SS34 / 1N5822 / SR340). Предел 1N5819 — 1.0 А, а D4 несёт 1.2–1.5 А сеансами по 10 секунд: для DO-41 это тепловой стационар.'),
    ("#c0392b", '⚠  <tspan font-weight="700">F1 → PPTC 3 А, адаптер → 3 А (или Rprog 2.4 кΩ).</tspan> Худшая точка — разряженная банка 3.0 В: модем 1.50 А + станция 0.33 А = ~1.83 А через F1.'),
    ("#c0392b", 'Отдельно считается «модем передаёт, пока батарея заряжается»: 0.83 + 0.18 + 1.00 = <tspan font-weight="700">2.01 А</tspan> на адаптере 2 А из BOM. Штатные D1/D2 шины не трогаем — там 0.2 А.'),
    ("#333",    '<tspan font-weight="700">Пресет B3 — 5.2 В, но проверяется по TP1 на плате модема, а не по входу.</tspan> U2 на BK-A7670 — <tspan font-weight="700">линейный 1084 в DPAK, дросселя на плате нет</tspan>:'),
    ("#333",    'ток модуля приходит на VCC без деления, а разница (VCC − 4.0) × I горит в тепле — 0.78 Вт при 5.2 В. Ниже ~5.1 В LDO вываливается, выше — греется. TP1 под передачей ниже 3.9 В → пресет 5.4 В.'),
    ("#333",    '<tspan font-weight="700">Электролит 1000 мкФ 16 В ставится у САМОЙ платы модема</tspan>, а не у выхода буста: он гасит бросок на старте передачи там, где этот бросок возникает. Полярность — «+» к 5.2 В.'),
    ("#2e7d32", '✓  <tspan font-weight="700">GPIO27/26 освободила сама v4</tspan> — светодиоды уехали в нижний ряд (4·16·17·5·18). Оба пина не strapping; они из ADC2, но конфликт ADC2/WiFi касается только аналогового чтения.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Ключ питания (пунктир) — условие переезда на мачту, а не опция.</tspan> R104 держит PWRKEY на земле, выключить модуль программно нечем, выход из CMUX у A7670 сломан.'),
    ("#8a6a1a", 'Без ключа повисший модем лечится только поездкой к станции. Затвор — GPIO25 (свободен, не strapping); учесть бросок тока при заряде 1000 мкФ.'),
    ("#333",    '<tspan font-weight="700">Порядок включения.</tspan> Модуль поднимается 10–15 с после подачи VCC, ESP32 — за секунду. Достучаться до модема из setup() нельзя в принципе:'),
    ("#333",    'там остаются только setApn/setPins, а PPP.begin() живёт в loop() ретрай-машиной — как serviceUplink() для WiFi, а не блокирующий wifiMulti.run() из старой версии.'),
    ("#c0392b", '⚠  <tspan font-weight="700">AT+CNMP=38 (LTE only) фиксируется с USB, до сборки.</tspan> В 2G импульсы 2 А, которых этот тракт не тянет, а модуль стартует сам и регистрируется раньше, чем ESP32 скажет слово.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Boost#3 (HW-085/TMF002) — не перепутай IN и OUT.</tspan> Признак не «верх/низ», а расстояние между контактами: два РЯДОМ = IN, два разнесённые К КРАЯМ = OUT.'),
]
NOTE_H = 44 + 20 * len(NOTE_LINES)
notes = (f'<rect x="30" y="{NY}" width="1840" height="{NOTE_H}" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>'
         f'<text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">'
         f'Что добавилось против v4 и почему именно так</text>'
         + "".join(f'<text x="46" y="{NY+48+20*i}" font-size="12.5" fill="{c}">{t}</text>'
                   for i, (c, t) in enumerate(NOTE_LINES)))

VH = NY + NOTE_H + 20
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
  {power_panel}
  {power_feeds}
  {power_wires}
  {modem_panel}
  {modem_wires}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_v5.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
