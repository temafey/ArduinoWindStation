# -*- coding: utf-8 -*-
"""СХЕМА v6 · «Компакт-1» — 4G/GPS-модуль BK-A7670 садится ПРЯМО НА МАКЕТКУ.

v5 держала модем на весу: пять проводов к плате, своё диодное ИЛИ на двух Шоттки 3 А,
отдельная карточка питания. v6 убирает всё висящее, что можно убрать:

  1. Модуль втыкается штырями CN101 ПРЯМО в ряд a, колонки 36–42 — переходной планки
     нет, докупать нечего. Гребёнка на плате распаяна с завода, но штыри торчат
     СО СТОРОНЫ НАКЛЕЙКИ (на обороте пайка срезана заподлицо — проверено по снимкам
     `images/skins/photo_2026-08-15_20-44-*.jpg`), поэтому модуль садится НАКЛЕЙКОЙ ВНИЗ.
     Следствие, из-за которого переделан весь этот файл: **порядок контактов зеркальный**
     мануалу — в колонке 36 оказывается контакт 1 (SLEEP), в колонке 42 — контакт 7 (GND).
     Свес уходит ВВЕРХ, за верхние рельсы и за край макетки; ряды b–e свободны.
     Наверх смотрят SIM, micro-USB и обе косички u.FL — AT-консоль доступна не снимая модуль.
  2. Диодного ИЛИ у модема больше нет. Буст №3 кормится с одного источника — `OUT+`
     TP4056. Из BOM выпадают два Шоттки 3 А и адаптер на 3 А (хватает штатного 2 А).
     Цена честная: без установленной банки модем не заведётся (см. заметки).
  3. C4 1000 мкФ переехал на макетку, в колонки 37/38 — это буквально два ряда
     от контакта VCC, ближе к модему электролит уже не поставить.
  4. C1 1000 мкФ уехал с 39/41 на 43/44: колонки 36–42 забрал модуль.
  5. С платы уходят ВСЕГО ЧЕТЫРЕ провода: 49j → ключ → B3 IN+, 45i → земля блока,
     B3 OUT+ → кол.38, B3 OUT− → кол.37. Всё остальное — перемычки на макетке.

Ключ питания модема (P-MOSFET, затвор ← GPIO25) по-прежнему ПУНКТИРОМ: детали нет,
но без него нельзя уезжать на мачту — R104 держит PWRKEY на земле, выход из CMUX
у A7670 сломан, повисший модем перезагружается только снятием VCC.
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
SIGGND = "#6b6f78"                    # сигнальная земля UART
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
ADC = {"g32": 224, "g34": 214}                   # сигналы АЦП над платой
UART_LANE = {"tx": 170, "rx": 161}               # UART модема — над платой, выше АЦП
GPIO_LANE = [483, 486, 489, 492, 495]
TRENCH_LANE = 397                                # ниже линейки колонок (389), выше ряда f
LOW_A, LOW_B, LOW_C = 490, 498, 550

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
    bb.cap_ceramic(33, 35, "e", label=""))

# Электролиты рисуются ПОСЛЕ модулей: банка C1 на 43/44 реально задевает край корпуса
# TP4056, и на схеме это должно быть видно, а не спрятано под ним.
caps_elec = (bb.cap_electrolytic(38, 37, "e", "C4", pol_dx=11) +
             bb.cap_electrolytic(43, 44, "e", "C1"))

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
BLIND = "СЛЕПАЯ: ставится ДО посадки модема, потом рельс закрыт свесом"

rail_jmp = (
    to_rail(1,  "a", RAIL_TP, PLUS, "ESP32 VIN → «+» LOAD",     "ПИТАНИЕ") +
    to_rail(2,  "a", RAIL_TM, GND,  "ESP32 GND → «−» GND",      "ПИТАНИЕ") +
    to_rail(19, "a", RAIL_TP, PLUS, "C2 → «+» LOAD",            "ПИТАНИЕ") +
    to_rail(21, "a", RAIL_TM, GND,  "C2 → «−» GND",             "ПИТАНИЕ") +
    to_rail(27, "a", RAIL_TM, GND,  "низ делителя батареи",     "АЦП") +
    to_rail(35, "a", RAIL_TM, GND,  "низ делителя датчика",     "АЦП", note=BLIND) +
    to_rail(44, "a", RAIL_TM, GND,  "C1 «−» → «−» GND",         "ПИТАНИЕ", note=BLIND) +
    to_rail(45, "a", RAIL_TM, GND,  "TP4056 IN− → «−» GND",     "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    to_rail(45, "j", RAIL_BM, GND,  "TP4056 OUT− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(56, "a", RAIL_TM, GND,  "Boost#2 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(53, "j", RAIL_BM, GND,  "Boost#2 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(61, "a", RAIL_TP, PLUS, "Boost#1 IN+ → «+» LOAD",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(62, "a", RAIL_TM, GND,  "Boost#1 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(59, "j", RAIL_BM, GND,  "Boost#1 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ"))

# сигнальная земля модема: CN101-7 (кол.42) → «−» рельс
sig_gnd = to_rail(42, "b", RAIL_TM, SIGGND,
                  "CN101-7 (кол.42) → «−» GND — сигнальная земля UART",
                  "4G · МОДЕМ",
                  note="параллелит силовой обратный ток: ~20–30% пика уходит по рельсу")

# ═══════════════════════════════════════ 7. ПЕРЕМЫЧКИ МЕЖДУ УЗЛАМИ
GAP = (X(51) + X(52)) / 2.0

board_jmp = (
    jmp([H(43, "e"), (X(43), TRENCH_LANE), (X(39), TRENCH_LANE), H(39, "f")], PLUS,
        "C1 «+» → узел ШИНА", "43e", "39f", "ПИТАНИЕ",
        note="bulk-конденсатор на диодной развязке · переехал с 39d") +
    jmp([H(37, "f"), (X(37), 383), (X(50), 383), H(50, "b")], PLUS,
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

# UART: с верхних пинов ESP32 прямо в колонки модуля, ряд c
uart_wires = (
    jmp([(bb.PIN_TOP["27"], 311), (bb.PIN_TOP["27"], UART_LANE["tx"]),
         (X(41), UART_LANE["tx"]), H(41, "c")], TX_C,
        "GPIO27 (TX) → кол.41 = CN101-6 RXD", "GPIO27", "41c", "4G · МОДЕМ", w=2.4,
        note="буквы НЕ совпадают: TX платы идёт в RXD модема") +
    jmp([(bb.PIN_TOP["26"], 311), (bb.PIN_TOP["26"], UART_LANE["rx"]),
         (X(40), UART_LANE["rx"]), H(40, "c")], RX_C,
        "GPIO26 (RX) ← кол.40 = CN101-5 TXD", "GPIO26", "40c", "4G · МОДЕМ", w=2.4,
        note="провод идёт под свесом платы модема на участке кол. 33–41"))

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
            f'⚠ ПАРАЛЛЕЛЬ (не последовательно!). Последовательно = 8.4 В — сожжёт всё.</text>'
            f'<text x="{x+16}" y="{y+190}" font-size="9.5" font-weight="700" fill="#c0392b">'
            f'⚠ v6: без установленной банки МОДЕМ НЕ РАБОТАЕТ — пик 1.5 А берётся отсюда</text>')

USBX, USBY = 82, 596
SWX, SWY = 704, 600
BATX, BATY = 82, 830

mods_ext = (
    bb.mod_usb_c(USBX, USBY, 170, 150,
                 [(USBX+63, "+5В", PLUS), (USBX+120, "GND", GND)],
                 subtitle="панельный · адаптер 2 А") +
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

# ═══════════════════════════════════════ 13. КОНТАКТЫ CN101 + СВЕС МОДЕМА НА МАКЕТКЕ
HDR_L, HDR_R = 36, 42
# Штыри торчат со стороны наклейки → модуль ложится НАКЛЕЙКОЙ ВНИЗ, и нумерация CN101
# на макетке идёт ЗЕРКАЛЬНО шелкографии: 1 SLEEP в кол.36 … 7 GND в кол.42.
HDR_PINS = [(1, "SLP", None), (2, "GND", GND), (3, "VCC", PLUS), (4, "PWR", None),
            (5, "TXD", RX_C), (6, "RXD", TX_C), (7, "GND", SIGGND)]
header = bb.module_pin_row(HDR_L, HDR_R, "a", HDR_PINS)

OVW = 248                                        # 37 мм в масштабе макетки
OVX = (X(HDR_L) + X(HDR_R)) / 2 - OVW / 2
overlay = bb.overlay_outline(
    OVX, 218, OVW, 46,
    "BK-A7670 · НАКЛЕЙКОЙ ВНИЗ")

# ═══════════════════════════════════════ 14. БЛОК ПИТАНИЯ МОДЕМА (одна карточка)
PAX, PAY, PAW, PAH = 1240, 176, 640, 214         # 176…390
VCC_RET, GND_RET, FET_LANE, GNDBUS = 224, 234, 244, 252
FETX, FETY, FETW, FETH = 1266, 262, 116, 76
B3X, B3Y, B3W, B3H = 1436, 262, 176, 112
B3_IN_P, B3_IN_M, B3_OUT_P, B3_OUT_M = 1462, 1488, 1560, 1586
FEED_P, FEED_G = 1210, 1198                      # стояки подводок с макетки
GATE_X = 1226

boost3 = bb.mod_boost(B3X, B3Y, B3W, B3H,
                      [(B3_IN_P, "IN+", PLUS), (B3_IN_M, "IN−", bb.PAD_GNDp),
                       (B3_OUT_P, "OUT+", PLUS), (B3_OUT_M, "OUT−", bb.PAD_GNDp)],
                      subtitle="Boost#3 → 5.2 В для модема")

power_panel = (
    f'<rect x="{PAX}" y="{PAY}" width="{PAW}" height="{PAH}" rx="12" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{PAX+18}" y="{PAY+22}" font-size="14" font-weight="700" fill="#1a1a1a">'
    f'Питание модема — единственный внешний узел v6</text>'
    f'<text x="{PAX+18}" y="{PAY+38}" font-size="10" fill="#8a6a1a">'
    f'один источник: OUT+ TP4056. Диодного ИЛИ нет — минус два Шоттки 3 А и адаптер на 3 А</text>' +
    bb.mod_pmos_switch(FETX, FETY, FETW, FETH, title="Ключ питания",
                       subtitle="high-side · затвор GPIO25") +
    boost3 +
    bb.mm_point(1626, 300, "5.2 В на выходе (проверять по TP1 модема)", dy=-8) +
    f'<text x="{PAX+18}" y="{PAY+PAH-42}" font-size="9" fill="#8a6a1a">'
    f'сейчас вместо ключа — перемычка</text>'
    f'<text x="{PAX+18}" y="{PAY+PAH-10}" font-size="9" fill="#c0392b">'
    f'⚠ 1.5 А через защиту DW01 — проходит</text>')

power_wires = (
    # подводки с макетки
    mlead([H(49, "j"), (X(49), 574), (FEED_P, 574), (FEED_P, FETY+FETH/2), (FETX, FETY+FETH/2)],
          PLUS, "TP4056 OUT+ (49j) → ключ → Boost#3", "49j", "ключ питания", "4G · ПИТАНИЕ",
          w=2.8, note="единственный источник модема: OUT+, а не банка и не шина") +
    mlead([H(45, "i"), (X(45), 586), (FEED_G, 586), (FEED_G, GNDBUS)], GND,
          "TP4056 OUT− (45i) → земля блока", "45i", "земля блока", "4G · ПИТАНИЕ",
          w=2.8, note="обратный ток модема идёт своим проводом, а не через рельс макетки") +
    # внутри карточки
    mlead([(FETX+FETW, FETY+FETH/2), (1410, FETY+FETH/2), (1410, FET_LANE),
           (B3_IN_P, FET_LANE), (B3_IN_P, B3Y)], PLUS,
          "ключ → Boost#3 IN+", "ключ питания", "B3 IN+", "4G · ПИТАНИЕ") +
    f'<line x1="{FEED_G}" y1="{GNDBUS}" x2="{B3_OUT_M}" y2="{GNDBUS}" stroke="{GND}" stroke-width="2.8"/>'
    f'<circle cx="{1350}" cy="{GNDBUS}" r="3.6" fill="{GND}"/>' +
    mlead([(B3_IN_M, B3Y), (B3_IN_M, GNDBUS)], GND,
          "Boost#3 IN− → земля блока", "B3 IN−", "земля блока", "4G · ПИТАНИЕ") +
    mlead([(B3_OUT_M, B3Y), (B3_OUT_M, GNDBUS)], GND,
          "Boost#3 OUT− → земля блока", "B3 OUT−", "земля блока", "4G · ПИТАНИЕ") +
    # возврат на макетку — два провода в колонки модуля
    mlead([(B3_OUT_P, B3Y), (B3_OUT_P, VCC_RET), (X(38), VCC_RET), H(38, "c")], PLUS,
          "Boost#3 OUT+ (5.2 В) → кол.38 = CN101-3 VCC", "B3 OUT+", "38c", "4G · ПИТАНИЕ",
          w=2.8, note="в этой же колонке сидит C4 — электролит стоит у самого модема") +
    mlead([(1350, GNDBUS), (1350, GND_RET), (X(37), GND_RET), H(37, "c")], GND,
          "земля блока → кол.37 = CN101-2 GND (силовая)", "земля блока", "37c",
          "4G · ПИТАНИЕ", w=2.8))

# план: затвор ключа ← GPIO25
gate_wire = (
    f'<path d="M{FETX+FETW/2:.0f} {FETY+FETH} L{FETX+FETW/2:.0f} 398 L{GATE_X} 398 '
    f'L{GATE_X} 152 L{bb.PIN_TOP["25"]} 152 L{bb.PIN_TOP["25"]} 311" fill="none" '
    f'stroke="#b08a2a" stroke-width="2.2" stroke-dasharray="6 4" opacity="0.7"/>'
    f'<text x="{GATE_X+8}" y="146" font-size="9" font-weight="700" fill="#8a6a1a">'
    f'затвор ключа ← GPIO25 · ПЛАН</text>')

# ═══════════════════════════════════════ 15. КАРТОЧКА МОДЕМА (справочная)
PBX, PBY, PBW, PBH = 1090, 620, 640, 372
MODX, MODY, MODW, MODH = 1150, 662, 330, 216

CN_USED = {2: GND, 3: PLUS, 5: RX_C, 6: TX_C, 7: SIGGND}
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
    f'<text x="{AX}" y="{MODY+202}" font-size="9" fill="#2e7d32">✓ GNSS есть (A7670E-MASA), фикс получен</text>'
    f'<text x="{AX}" y="{MODY+216}" font-size="9" fill="#c0392b">⚠ но только с антенной НА УЛИЦЕ</text>')

MAPTXT = ("контакт → колонка:   1 SLEEP → 36 (н/п) · 2 GND → 37 · 3 VCC → 38 · "
          "4 PWRKEY → 39 (н/п) · 5 TXD → 40 · 6 RXD → 41 · 7 GND → 42")

modem_panel = (
    f'<rect x="{PBX}" y="{PBY}" width="{PBW}" height="{PBH}" rx="12" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{PBX+18}" y="{PBY+24}" font-size="14" font-weight="700" fill="#1a1a1a">'
    f'4G/GPS-модуль — штырями в ряд a, кол. 36–42; проводов к нему НЕТ</text>' +
    bb.mod_a7670(MODX, MODY, MODW, MODH, used=CN_USED,
                 hdr_note="CN101 · штыри СО СТОРОНЫ НАКЛЕЙКИ") + antennas +
    f'<text x="{PBX+18}" y="{PBY+PBH-58}" font-size="9.5" font-weight="700" fill="#2a6fd1">{MAPTXT}</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-42}" font-size="9.5" fill="#c0392b">'
    f'⚠ модуль лежит НАКЛЕЙКОЙ ВНИЗ — нумерация выше уже зеркальная</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-26}" font-size="9.5" fill="#c0392b">'
    f'⚠ буквы тоже не совпадают: TXD платы идёт в RX-пин ESP32</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-10}" font-size="9.5" fill="#c0392b">'
    f'⚠ 27 мм висят за краем без опоры: снимать строго ВВЕРХ, за гребёнку</text>')

# ═══════════════════════════════════════ 16. ESP32 + КОЛЬЦА + ЛИНЕЙКА
esp = bb.esp32(subtitle="v6 · 4G/GPS на UART2 (27/26)",
               highlight=["VIN", "13", "32", "34", "27", "26"], usb_label="")

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
TOPC = [19, 23, 25, 27, 29, 31, 33, 35, 38, 41, 43]
BOTC = [18, 22, 26, 30, 34, 37, 39, 42]
ruler = ('<g font-size="9" font-weight="700" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="389" fill="#2a6fd1">{c}</text>' for c in TOPC)
         + "".join(f'<text x="{X(c)}" y="389" fill="#b4552a">{c}</text>' for c in BOTC)
         + '</g>'
         + '<text x="82" y="384" font-size="8" fill="#2a6fd1">верх</text>'
         + '<text x="82" y="394" font-size="8" fill="#b4552a">низ</text>')

# ═══════════════════════════════════════ 17. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v6 · «Компакт-1» — 4G/GPS-модуль стоит прямо на макетке</text>
  <text x="30" y="62" font-size="14" fill="#666">Модем втыкается штырями CN101 в ряд a, кол. 36–42, наклейкой ВНИЗ. Докупать нечего. С платы уходят четыре провода — два в буст №3 и два обратно. Диодное ИЛИ модема снято, C1 переехал на 43/44.</text>'''

rules = '''<rect x="30" y="70" width="1180" height="78" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="91" font-size="12.5" fill="#c0392b"><tspan font-weight="700">Модуль ложится НАКЛЕЙКОЙ ВНИЗ — штыри CN101 торчат со стороны наклейки.</tspan> Поэтому нумерация на макетке ЗЕРКАЛЬНА мануалу: кол.36 = контакт 1 (SLEEP), кол.42 = контакт 7 (GND). Считать по этой схеме, а не по шелкографии.</text>
  <text x="46" y="109" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Только 36–42.</tspan> Левее нельзя: <tspan font-weight="700">35a — низ делителя датчика</tspan>, то есть земля. Свес уходит вверх и накрывает рельсы — ряды b–e остаются рабочими; SIM, micro-USB и обе косички u.FL смотрят ВВЕРХ.</text>
  <text x="46" y="127" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Один источник вместо диодного ИЛИ:</tspan> буст №3 с <tspan font-weight="700">OUT+ TP4056</tspan>; без банки модем не заведётся. <tspan font-weight="700">UART:</tspan> GPIO27 (TX) → кол.41 = RXD, GPIO26 (RX) ← кол.40 = TXD. <tspan font-weight="700">Serial2 по умолчанию на GPIO16/17 — это светодиоды</tspan>, пины задавать явно.</text>
  <text x="46" y="144" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG. Тонкая с квадратом = внешний провод. Пунктир = ещё не куплено. Пересечение без точки = провод лежит поверх.</text>'''

# ═══════════════════════════════════════ 18. ТАБЛИЦА
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
             "4G · ПИТАНИЕ": "НОВОЕ · питание модема: 4 провода к макетке + обвязка буста №3",
             "4G · МОДЕМ": "НОВОЕ · сигналы модема — целиком на макетке"}
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

# ═══════════════════════════════════════ 19. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS)

TABLE_Y = 1090
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
NOTE_LINES = [
    ("#c0392b", '⚠  <tspan font-weight="700">ГЛАВНОЕ ОТЛИЧИЕ ОТ ПЕРВОЙ РЕДАКЦИИ v6: модуль лежит НАКЛЕЙКОЙ ВНИЗ, нумерация CN101 на макетке зеркальна.</tspan> Штыри распаяны со стороны наклейки (на обороте пайка срезана заподлицо) — иначе модуль в макетку просто не воткнуть.'),
    ("#333",    'Отсюда вся привязка: кол.36 = 1 SLEEP (н/п), 37 = 2 GND, 38 = 3 VCC, 39 = 4 PWRKEY (н/п), 40 = 5 TXD, 41 = 6 RXD, 42 = 7 GND. Кто соберёт по мануалу, а не по этой схеме, подаст 5.2 В на TXD.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Покупать не нужно ничего.</tspan> Переходная планка не нужна (штыри идут прямо в макетку), MT3608 №3, электролит 1000 мкФ и PPTC 3 А уже есть. Из v5 ушли два Шоттки 3 А и адаптер на 3 А.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Наверх смотрят SIM, micro-USB и обе косички u.FL.</tspan> AT-консоль остаётся доступной, не снимая модуль с макетки; горячий линейный U2 отдаёт тепло в воздух, а не в макетку.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Цена №1: без банки модем не работает.</tspan> Пик 1.5 А берётся с OUT+ TP4056, то есть фактически с элементов. Сам TP4056 столько не отдаст — на столе, по одному USB, модем не поднять.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Цена №2: нагрузка модема видна зарядному.</tspan> Ток сеанса течёт через тот же узел, по которому TP4056 ловит окончание заряда (порог ~1/10 Iprog).'),
    ("#333",    'Постоянная нагрузка убила бы терминацию совсем, но сеанс длится ~10 с и между сеансами нагрузки нет — окончание заряда просто сдвигается, chargeState может дёрнуться обратно в charging. Ключ питания снимает и это.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Защита DW01/FS8205 выдерживает.</tspan> Два ключа по ~25 мОм: при 1.5 А это 75 мВ падения и 0.11 Вт. Порог токовой отсечки — около 3 А, вдвое выше пика. Через OUT+ (а не через банку) идти ОБЯЗАТЕЛЬНО.'),
    ("#c0392b", '⚠  <tspan font-weight="700">F1 всё равно на 3 А.</tspan> Худшая точка не изменилась: разряженная банка 3.0 В, модем 1.50 А + станция 0.33 А = ~1.83 А через PTC. А вот адаптеру теперь хватает штатных 2 А — заряд идёт своим током.'),
    ("#1a1a1a", '<tspan font-weight="700">Почему модуль именно на 36–42.</tspan> Колонка 35 — низ делителя датчика (сидит на «−» рельсе): контакт SLEEP ушёл бы в землю, а сдвиг вправо утыкается в C1 (43–44) и в корпус TP4056 (45 и правее).'),
    ("#c0392b", '⚠  <tspan font-weight="700">Механика: 27 мм консоли на семи штырях, стойку решили не ставить.</tspan> От ряда a до края макетки ~10 мм; на этом участке пластик гребёнки (2.5 мм) и экран модуля (~2.3 мм) почти касаются макетки — часть веса ложится на неё.'),
    ("#333",    'Правило снятия: тянуть строго ВВЕРХ, держа за гребёнку, и не поддевать за дальнюю кромку — иначе рычаг 27 мм разбивает пружины ряда a. Если пружины поплывут, любой кусок пластика или плотного поролона под свес снимает момент.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Экран модуля смотрит ВНИЗ, на верхние рельсы.</tspan> В зоне свеса (кол. 32–46) на «+» рельсе не должно быть ни одной перемычки — там только «−» (35a, 42b, 44a, 45a), а земля с экраном и так одна цепь.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Четыре «слепых» провода ставятся ДО посадки модема:</tspan> 35a, 42b, 44a и 45a — все идут на верхний «−» рельс, который потом закрыт свесом платы. Забыл — снимать модуль.'),
    ("#333",    '<tspan font-weight="700">Два электролита ⌀10 мм стоят в 8 мм друг от друга</tspan> (C4 на 37/38, C1 на 43/44 — между ними колонки 39–42 под модулем) — банки наклонить в стороны, C1 дополнительно отклонить ВЛЕВО от корпуса TP4056.'),
    ("#333",    '<tspan font-weight="700">C4 — ровно там, где нужен.</tspan> Два ряда от контакта VCC: бросок тока на старте передачи гасится в той самой точке, где возникает. Полярность — «+» в колонку 38, «−» в 37. Номинал 1000 мкФ, напряжение ≥10 В.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Сигнальная земля (42b → рельс) — по желанию.</tspan> Она даёт UART короткий обратный путь, но параллелит силовой: по рельсу пойдёт ~20–30% пика, то есть 0.3–0.45 А — в пределах клипсы MB-102, но не ноль.'),
    ("#8a6a1a", 'Не хочется делить ток — перемычку можно просто не ставить: опору модем всё равно получит через силовую землю на кол.37. Обратного эффекта нет, UART станет чуть менее устойчив к наводке.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Ключ питания (пунктир) сейчас заменяется перемычкой 49j → B3 IN+.</tspan> Пока плата на столе, повисший модем перезагружается рукой. Ключ становится обязательным при переезде на мачту: R104 держит PWRKEY на земле, выход из CMUX у A7670 сломан — снять VCC больше нечем.'),
    ("#333",    'На терминацию заряда простой провод не влияет: модем в простое тянет 20–30 мА, а порог окончания заряда у TP4056 — около 100 мА при Iprog 1 А. Мешает только сеанс передачи, и то на свои ~10 с.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Пресет буста проверяется по TP1 на плате модема, а не по его входу.</tspan> U2 там — линейный 1084 в DPAK, дросселя нет: разница (VCC − 4.0) × I горит в тепле. TP1 под передачей ниже 3.9 В → поднять пресет до 5.4 В.'),
    ("#c0392b", '⚠  <tspan font-weight="700">AT+CNMP=38 (LTE only) фиксируется с USB, до сборки.</tspan> В 2G импульсы 2 А, которых этот тракт не тянет, а модуль стартует сам и регистрируется раньше, чем ESP32 скажет слово.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Boost#3 (HW-085/TMF002) — не перепутай IN и OUT.</tspan> Признак не «верх/низ», а расстояние между контактами: два РЯДОМ = IN, два разнесённые К КРАЯМ = OUT.'),
]
NOTE_H = 44 + 20 * len(NOTE_LINES)
notes = (f'<rect x="30" y="{NY}" width="1840" height="{NOTE_H}" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>'
         f'<text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">'
         f'Чем «Компакт-1» отличается от v5 и чем за это плачено</text>'
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
  {sig_gnd}
  {board_jmp}
  {mods_inline}
  {caps_elec}
  {gpio_res}
  {uart_wires}
  {led_anode}
  {lid_panel}
  {led_cath}
  {mods_ext}
  {leads}
  {sensor}
  {sensor_leads}
  {chrg}
  {power_panel}
  {power_wires}
  {gate_wire}
  {overlay}
  {header}
  {modem_panel}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_v6.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
