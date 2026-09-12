# -*- coding: utf-8 -*-
"""СХЕМА v8 · переезд на 38-pin плату (ESP32 DevKitC, модуль ESP-32U, мост CP2102).

Электрика v7 не изменилась ни в одной точке: SW1 по-прежнему в разрыве OUT+ TP4056
(49j -> SW1 -> 51j), оба потребителя берутся с колонки 51, модем сидит штырями CN101
в ряду a на колонках 36-42 наклейкой вниз. Изменилась ПЛАТА, и вместе с ней вся медь
левее колонки 20.

Что именно принесла новая плата:

  * 19 контактов в ряду вместо 15. Она занимает колонки 1-19 обоих банков, а не 1-15,
    и всё, что стояло правее, уехало вправо. Свободных колонок на макетке не было —
    отсюда три вынужденных решения ниже.
  * Выведены шесть контактов SPI-флеша: CLK/D0/D1 снизу (кол.1-3) и CMD/D3/D2 сверху
    (кол.2-4). Это ноги кристалла флеша, а не свободные GPIO: перемычка в любую из них,
    и плата не грузится. На схеме они красные и обведены пунктиром.
  * Модуль ESP-32U — БЕЗ печатной антенны, только u.FL. Пигтейл с антенной 2.4 ГГц
    становится обязательной деталью; зато антенна выносится за пределы глухого IP65-бокса
    и разносится с LTE-антенной модема, чего с печатной сделать было нечем.
  * Мост USB — CP2102 (10C4:EA60), а не CH340C. Другой драйвер, другой номер COM-порта.

Три вынужденных переезда на макетке:

  1. Связки рельсов 16/17 -> 20/21. Мёртвая зона левого «−», на которую опирается АЦП,
     сохранилась: ток ESP32 идёт от кол.6 до кол.21, а низ делителя батареи (27a) и стояк
     земли датчика (кол.31) остались правее связки.
  2. C2 больше не стоит в банке — он воткнут ПРЯМО В РЕЛЬСЫ (кол.18 «+» / кол.19 «−»).
     Тех двух колонок банка, где он был в v7 (19 и 21), больше нет.
  3. Светодиодные резисторы уплотнились с шага 4 колонки до шага 3 и встали в полосу
     22-36: (22,24)(25,27)(28,30)(31,33)(34,36). Влево нельзя - колонки 20 и 21 нижнего
     банка держатся пустыми под связки рельсов, обойти плату им негде. Вправо нельзя -
     за колонкой 36 стоит D1, а диод ряда h и резистор ряда i разошлись бы на 2.5 мм.

Прошивку это НЕ трогает: набор пинов 38-pin — надмножество 30-pin, все PIN_* на месте,
и FQBN смена платы тоже не трогала. Суффикс PartitionScheme=min_spiffs добавлен позже
и по другой причине — 2026-09-11, задача 10, app0 не хватало на PPP+TLS+MQTT.

Вход:  bb_lib.esp32_38 / flash_warn / cap_rail
Выход: images/wiring_v8.svg
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import re
import bb_lib as bb

MM = 2.54 / 17.0
NCOLS = 63
# Рельсы на этой макетке КОРОЧЕ банка на две колонки с каждой стороны: полосы «+»/«−»
# начинаются только над кол.3 и обрываются на кол.61. Плата 38-pin встала от самой первой
# колонки, поэтому её «5V» (кол.1) оказался за краем рельса — перемычка туда идёт
# по диагонали. То же на другом конце: Boost#1 IN− сидит в кол.62, рельса над ней нет.
RAIL_INSET = 2
RAIL_L = 1 + RAIL_INSET               # первая колонка, над которой есть отверстие рельса
RAIL_R = NCOLS - RAIL_INSET           # последняя такая колонка
RAIL_TP, RAIL_TM = 250, 262           # верх: «+» LOAD / «−» GND
RAIL_BP, RAIL_BM = 506, 518           # низ:  «+» LOAD / «−» GND (обе + = LOAD!)
CUT = 606.5                           # разрез рельсов (между кол. 31 и 32)
TEAL = "#0e9488"
STDBY_C = "#a68bff"
TX_C = "#e0218a"                      # GPIO27 → RXD модема
RX_C = "#3949ab"                      # GPIO25 ← TXD модема
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

def vlink(col, color, y_top, y_bot, name, note="", dx=None):
    x = X(col)
    # v8: связка «+» обходит плату СПРАВА (dx=+9). Плата теперь кончается на кол.19,
    # и штатный dx=-9 увёл бы перемычку прямо под её корпус.
    if dx is None:
        dx = 9 if color == GND else -9
    return jmp([(x, y_top), (x+dx, y_top+18), (x+dx, y_bot-18), (x, y_bot)],
               color, name, RAIL_NAME[y_top], RAIL_NAME[y_bot], "РЕЛЬСЫ", w=3.2, note=note)

def cut_bridge(y_rail, color, y_arch, name, note=""):
    x1, x2 = X(31), X(32)
    return jmp([(x1, y_rail), (x1, y_arch), (x2, y_arch), (x2, y_rail)],
               color, name, "кол.31 (лево)", "кол.32 (право)", "РЕЛЬСЫ", w=3.0, note=note)

rails = (
    vlink(20, PLUS, RAIL_TP, RAIL_BP, "связка «+» (кол.20) — верх↔низ", dx=9,
          note="v8: было кол.16 — там теперь плата. ЕДИНАЯ шина LOAD: все четыре "
               "«+»-полурельса — одна цепь") +
    vlink(21, GND,  RAIL_TM, RAIL_BM, "связка «−» (кол.21) — верх↔низ",
          note="v8: было кол.17. Мёртвая зона АЦП сохранена — участок 21…31 по-прежнему "
               "правее связки, и по нему не течёт ничего") +
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
    # v8: C2 воткнут ПРЯМО В РЕЛЬСЫ по диагонали — колонок банка под него больше нет,
    # их заняла плата. Керамике 100 нФ это безразлично: обе ноги на тех же двух цепях.
    bb.cap_rail(18, 19, RAIL_TP, RAIL_TM, label="C2 · 100нФ") +
    bb.resistor(23, 25, "c", B100K, label="") +
    bb.resistor(25, 27, "c", B100K, label="") +
    bb.cap_ceramic(25, 27, "e", label="") +
    bb.resistor(29, 31, "c", B10K, label="") +
    bb.resistor(31, 33, "c", B5K,  label="") +
    bb.resistor(33, 35, "c", B10K, label="") +
    bb.cap_ceramic(33, 35, "e", label=""))

# Электролиты рисуются ПОСЛЕ модулей: банка C1 на 43/44 реально задевает край корпуса
# TP4056, и на схеме это должно быть видно, а не спрятано под ним.
caps_elec = (bb.cap_electrolytic(40, 41, "e", "C4", pol_dx=11) +
             bb.cap_electrolytic(43, 44, "e", "C1"))

def lbl(x, y, text, w, fill=bb.COPPER, size=10, weight="700", anchor="middle"):
    x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
    return (f'<rect x="{x0:.0f}" y="{y-10}" width="{w}" height="13" fill="#fff" opacity="0.92"/>'
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}">{text}</text>')

comps_lbl = (
    lbl((X(23)+X(25))/2, 326, "100k", 34, size=9.5) +
    lbl((X(25)+X(27))/2, 326, "100k", 34, size=9.5) +
    lbl((X(29)+X(31))/2, 326, "10k", 30, size=9.5) +
    lbl((X(31)+X(33))/2, 326, "5k", 26, size=9.5) +
    lbl((X(33)+X(35))/2, 326, "10k", 30, size=9.5) +
    lbl(X(27) + 14, 374, "C5", 22, size=9, anchor="start") +
    lbl(X(35) + 14, 374, "C3", 22, size=9, anchor="start") +
    lbl((X(23)+X(27))/2, 286, "делитель ×2.0 → GPIO32", 128, fill="#c47015", size=9) +
    lbl((X(29)+X(35))/2, 286, "делитель ×2.5 → GPIO34", 128, fill="#c47015", size=9))

# ═══════════════════════════════════════ 4. НИЖНИЙ БАНК — РЕЗИСТОРЫ LED + ПИТАНИЕ
B220 = ["#c00", "#c00", "#1a1a1a", "#1a1a1a", "#7a4a12"]

# v8: пины LED уехали с колонок 5–9 на 7–11 (плата длиннее на четыре контакта),
# а сами резисторы — на шаг 3 колонки вместо 4, в полосу 22–36.
# Почему не с колонки 20, вплотную к плате: колонки 20 и 21 нижнего банка обязаны
# остаться ПУСТЫМИ — через них проходят связки рельсов, а обойти плату им негде,
# слева она занимает всё. Правее колонки 36 тоже нельзя: там D1, и диод ряда h
# с резистором ряда i разошлись бы на 2.5 мм, то есть корпусами касались бы.
LEDS = [("4",  7,  22, 24, "#c62828",  "#7d1a1a", "красный", "ветер &gt;15 м/с"),
        ("16", 8,  25, 27, "#f2c21a",  "#a6821a", "жёлтый",  "ветер &gt;5 м/с"),
        ("17", 9,  28, 30, "#34c24a",  "#1c7a2e", "зелёный", "станция ОК"),
        ("5",  10, 31, 33, "#1f9d3a",  "#146127", "зелёный", "WiFi есть"),
        ("18", 11, 34, 36, "#e23b2e",  "#8f1f16", "красный", "ошибка АЦП")]

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

def to_rail_diag(col, row, rail_col, rail_y, color, name, group, note=""):
    # Крайние колонки банка рельсом не накрыты (RAIL_INSET), поэтому перемычка идёт
    # наискосок в ближайшее отверстие. Электрически это ничего не меняет: полурельс —
    # одна цепь по всей длине, важно только попасть в неё.
    x, y = H(col, row)
    return jmp([(x, y), (X(rail_col), rail_y)], color, name, f"{col}{row}",
               f"{RAIL_NAME[rail_y]}, кол.{rail_col}", group, note=note)

UNDER = "заводится ДО посадки модуля — отверстие под корпусом"
BLIND = "СЛЕПАЯ: ставится ДО посадки модема, потом рельс закрыт свесом"

rail_jmp = (
    to_rail_diag(1, "a", RAIL_L, RAIL_TP, PLUS, "ESP32 «5V» → «+» LOAD (по диагонали)",
                 "ПИТАНИЕ",
                 note="ПО ДИАГОНАЛИ: рельс начинается только над кол.3, а плата встала "
                      "от кол.1 — отверстия «+» прямо над «5V» просто нет. На 38-pin пин "
                      "подписан 5V, а не VIN; колонка та же, первая от USB") +
    to_rail(6,  "a", RAIL_TM, GND,  "ESP32 GND → «−» GND",      "ПИТАНИЕ",
            note="было кол.2: на 38-pin между 5V и GND встали CMD·D3·D2 и GPIO13") +
    to_rail(27, "a", RAIL_TM, GND,  "низ делителя батареи",     "АЦП") +
    to_rail(44, "a", RAIL_TM, GND,  "C1 «−» → «−» GND",         "ПИТАНИЕ", note=BLIND) +
    to_rail(45, "a", RAIL_TM, GND,  "TP4056 IN− → «−» GND",     "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    to_rail(45, "j", RAIL_BM, GND,  "TP4056 OUT− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(56, "a", RAIL_TM, GND,  "Boost#2 IN− → «−» GND",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(53, "j", RAIL_BM, GND,  "Boost#2 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(61, "a", RAIL_TP, PLUS, "Boost#1 IN+ → «+» LOAD",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail_diag(62, "a", RAIL_R, RAIL_TM, GND, "Boost#1 IN− → «−» GND (по диагонали)",
                 "МОДУЛИ НА ПЛАТЕ",
                 note="ПО ДИАГОНАЛИ: рельс обрывается на кол.61, а IN− сидит в кол.62. "
                      "Тот же случай, что «5V» на другом конце платы") +
    to_rail(59, "j", RAIL_BM, GND,  "Boost#1 OUT− → «−» GND",   "МОДУЛИ НА ПЛАТЕ"))

# Низ делителя датчика уходит на ЛЕВЫЙ верхний «−», а не на правый (2026-08-30).
# АЦП меряет относительно вывода GND чипа, а не относительно рельса:
#   ADC = 0.4·Vдатчика + 0.4·(V(52) − V(6a)) + 0.6·(V(35) − V(6a))
# Пока низ делителя сидел на 35a, он висел на правом рельсе, а тот принимает потенциал
# колонки 44 — точки, куда впрыскивается 0.4–0.65 А возврата модема. «Тупик» верен для
# ТОКА и не спасает от ПОТЕНЦИАЛА: 0.65 А × 27–45 мОм (два параллельных пути до узла
# OUT−) = 18–29 мВ, из них 0.6 попадает в АЦП напрямую — это 0.15–0.25 м/с призрачного
# ветра, пока открыт канал. Слева картина другая: единственный сток левого «−» — связка
# кол.21, поэтому по участку 21…31 не течёт ничего, и делитель батареи (27a) стоит там
# же и по той же причине.
gnd_sense = jmp([H(35, "a"), (X(31), Y("a")), (X(31), RAIL_TM)], GND,
                "низ делителя датчика → «−» верх ЛЕВЫЙ (кол.31)", "35a", "«−» GND верх",
                "АЦП", w=2.4,
                note="по ряду a влево, подъём на кол.31 — до разреза рельсов")

# земля модема — ПЕРЕМЫЧКОЙ, а не проводом с блока питания.
# Обратный ток (0.4–0.65 А, LTE-only) уходит из кол.41 ВПРАВО: 44 → 44a → рельс →
# 45a → корпус TP4056 → нижний банк → провод 45i. Влево он не идёт вообще:
# верхний «−» рельс разрезан между кол.31 и 32, и мостом закрыт только НИЖНИЙ «−»
# (см. cut_bridge выше). Поэтому кусок рельса 32…41 — тупик, и низ делителя
# датчика (35a) стоит на копейке, по которой не течёт ни миллиампера модема.
gnd_bond = jmp([H(41, "b"), (X(41), 312), (X(44), 312), H(44, "b")], GND,
               "кол.41 «G» GND модема → кол.44 (минус C1, оттуда 44a на «−» рельс)",
               "41b", "44b", "4G · ПИТАНИЕ", w=2.8,
               note="силовой возврат модема: 3 колонки рельса ВПРАВО, мимо АЦП")

# ═══════════════════════════════════════ 7. ПЕРЕМЫЧКИ МЕЖДУ УЗЛАМИ
GAP = (X(51) + X(52)) / 2.0

board_jmp = (
    jmp([H(43, "e"), (X(43), TRENCH_LANE), (X(39), TRENCH_LANE), H(39, "f")], PLUS,
        "C1 «+» → узел ШИНА", "43e", "39f", "ПИТАНИЕ",
        note="bulk-конденсатор на диодной развязке · переехал с 39d") +
    jmp([H(37, "f"), (X(37), 383), (X(50), 383), H(50, "b")], PLUS,
        "+5 В адаптера → TP4056 IN+", "37f", "50b", "МОДУЛИ НА ПЛАТЕ", note=UNDER) +
    # v7: вход буста №2 берётся уже ПОСЛЕ тумблера — с колонки 51, а не с 49.
    jmp([H(51, "i"), (X(51), 470), (GAP, 470), (GAP, 290), (X(55), 290), H(55, "c")],
        PLUS, "узел за SW1 (51i) → Boost#2 IN+", "51i", "55c", "SW1",
        note="тот же коридор между кол.51 и 52, что и в v6 — только начало другое") +
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
    lane_wire(13, 25, ADC["g32"], SIG, "узел делителя батареи (25) → GPIO32", "АЦП") +
    # Сигнал датчика входит в 33b и поднимается на кол.30 — обе точки ЛЕВЕЕ свеса модема
    # (он накрывает 32–46). Стояк из 33a шёл ровно под корпусом micro-USB, а замыкание
    # этой цепи на экран не ломает ничего заметного — оно просто гасит ветер в ноль.
    jmp([(bb.PIN_TOP38["34"], 298), (bb.PIN_TOP38["34"], ADC["g34"]), (X(30), ADC["g34"]),
         (X(30), 306), (X(33), 306), H(33, "b")], SIG,
        "узел делителя датчика (33b) → GPIO34", "GPIO34", "33b", "АЦП", w=2.4,
        note="подъём на кол.30 — левее свеса модема"))

gpio_res = "".join(
    jmp([(X(ec), 481), (X(ec), GPIO_LANE[i]), (X(rl), GPIO_LANE[i]), (X(rl), 478)],
        col, f"GPIO{g} → резистор 220 Ω (кол.{rl}, под платой)", f"{ec}·низ", f"{rl}j",
        "СВЕТОДИОДЫ", w=2.4, dots="both",
        note="идёт под ESP32/платой, не свисает снизу схемы")
    for i, (g, ec, rl, rr, col, *_ ) in enumerate(LEDS))

# UART: с верхних пинов ESP32 через рельсы на кол.28 и дальше по ряду d в колонки модуля.
# Спуск именно на 28: свес накрывает 32–46, а кол.29–31 заняты снизу делителем датчика.
UART_DROP = X(28)
uart_wires = (
    jmp([(bb.PIN_TOP38["27"], 311), (bb.PIN_TOP38["27"], UART_LANE["tx"]),
         (UART_DROP - 5, UART_LANE["tx"]), (UART_DROP - 5, 344),
         (X(37), 344), H(37, "d")], TX_C,
        "GPIO27 (TX) → кол.37 = «R» RXD модема", "GPIO27", "37d", "4G · МОДЕМ", w=2.4,
        note="буквы НЕ совпадают: TX платы идёт в RXD модема. GPIO27, не 26: "
             "на 38-pin косичка легла именно так, прошивка пошла за медью") +
    jmp([(bb.PIN_TOP38["25"], 311), (bb.PIN_TOP38["25"], UART_LANE["rx"]),
         (UART_DROP + 5, UART_LANE["rx"]), (UART_DROP + 5, 356),
         (X(38), 356), H(38, "d")], RX_C,
        "GPIO25 (RX) ← кол.38 = «T» TXD модема", "GPIO25", "38d", "4G · МОДЕМ", w=2.4,
        note="рельсы пересекает на кол.28, дальше по ряду d — не под свесом. "
             "Между 27 и 25 остаётся GPIO26 — он свободен, в него ничего не втыкать"))

# ═══════════════════════════════════════ 9. КРЫШКА КОРПУСА (снизу схемы)
LIDX, LIDY, LIDW, LIDH = 400, 596, 314, 214
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
lid_panel.append(f'<line x1="{X(22)}" y1="{CATH_Y}" x2="{X(36)}" y2="{CATH_Y}" stroke="{GND}" stroke-width="3.2"/>')
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
SWX, SWY = 790, 610                  # v7: тумблер уехал под колонки 49…51
BATX, BATY = 82, 830

# ═══════════════════════════════════════ 10b. КАРТОЧКА «ЧТО ДАЁТ ПЕРЕНОС SW1»
SCX, SCY, SCW, SCH = 690, 762, 340, 152
SC_ROWS = [
    ("#1a1a1a", "ON  · адаптер есть",  "рабочий режим; терминации заряда нет"),
    ("#2e7d32", "OFF · адаптер есть",  "станция от адаптера; модем и бусты сняты"),
    ("#2e7d32", "",                    "→ заряд вчистую, доходит до STDBY / full"),
    ("#1a1a1a", "OFF · адаптера нет",  "всё мертво, разряда ноль"),
    ("#1a1a1a", "ON  · адаптера нет",  "автономка от банки — режим мачты"),
]
sw_states = (
    f'<rect x="{SCX}" y="{SCY}" width="{SCW}" height="{SCH}" rx="10" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{SCX+14}" y="{SCY+22}" font-size="12" font-weight="700" fill="#1a1a1a">'
    f'Что теперь делает тумблер</text>'
    + "".join(
        f'<text x="{SCX+14}" y="{SCY+42+16*i}" font-size="9" font-weight="700" fill="{c}">{st}</text>'
        f'<text x="{SCX+118}" y="{SCY+42+16*i}" font-size="9" fill="{c}">{what}</text>'
        for i, (c, st, what) in enumerate(SC_ROWS))
    + f'<text x="{SCX+14}" y="{SCY+SCH-20}" font-size="8.5" fill="#c0392b">'
      f'⚠ при воткнутом адаптере станцию одним щелчком не обесточить:</text>'
      f'<text x="{SCX+14}" y="{SCY+SCH-9}" font-size="8.5" fill="#c0392b">'
      f'D1 кормит шину напрямую. Полное снятие = вынуть адаптер; апгрейд — DPDT</text>')

mods_ext = (
    bb.mod_usb_c(USBX, USBY, 170, 150,
                 [(USBX+63, "+5В", PLUS), (USBX+120, "GND", GND)],
                 subtitle="панельный · адаптер 2 А") +
    bb.switch_rocker(SWX, SWY, 210, 96,
                     [(860, SWY+7, "вход · 49j"), (960, SWY+7, "выход · 51j")],
                     title="SW1 · в разрыве OUT+",
                     subtitle="за ним оба буста: и станция, и модем") +
    sw_states +
    battery_split(BATX, BATY))

leads = (
    mlead([(USBX+63, USBY), (USBX+63, 556), (X(37), 556), H(37, "h")], PLUS,
          "адаптер +5В → 37h (анод D1)", "адаптер +5В", "37h", "МОДУЛИ") +
    mlead([(USBX+120, USBY), (USBX+120, 544), (X(48), 544), (X(48), RAIL_BM)], GND,
          "адаптер GND → «−» низ, кол.48", "адаптер GND", "«−» GND низ", "МОДУЛИ",
          note="правая половина: ток заряда не идёт через связку кол.20/21") +
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
    # v7: тумблер вырезан из пути ШИНА→LOAD и вставлен в разрыв OUT+.
    mlead([H(49, "j"), (X(49), 560), (860, 560), (860, SWY+7)], PLUS,
          "TP4056 OUT+ (49j) → SW1 вход", "49j", "SW1 (вход)", "SW1",
          w=2.8, note="единственный отвод с колонки 49 — дальше всё идёт через тумблер") +
    mlead([(960, SWY+7), (960, 570), (X(51), 570), H(51, "j")], PLUS,
          "SW1 выход → 51j (узел OUT+ ПОСЛЕ тумблера)", "SW1 (выход)", "51j", "SW1",
          w=2.8, note="колонка 51 свободна: земля датчика садится на рельс у кол.52") +
    mlead([H(39, "g"), (X(39), 552), (660, 552), (660, 200), (X(16), 200), (X(16), RAIL_TP)],
          PLUS, "узел ШИНА (39g) → «+» LOAD верх (кол.16)", "39g", "«+» LOAD верх", "SW1",
          note="тумблера тут больше нет: весь ток ESP32 всё так же садится "
               "на ЛЕВУЮ половину, минуя разрез"))

# ═══════════════════════════════════════ 10c. АНТЕННА ESP32 (новое в v8)
ANX, ANY, ANW, ANH = 700, 930, 372, 152
ANT_ROWS = [
    ("#c0392b", "u.FL, не печатная", "у ESP-32U антенны на плате нет вовсе"),
    ("#c0392b", "не включать без неё", "разъём с нагрузкой вместо антенны = связь на метр"),
    ("#8a6a1a", "~30 сочленений", "u.FL рассчитан на разовую стыковку — воткнул и забыл"),
    ("#2e7d32", "выносится из бокса", "IP65 глухой; печатная антенна сидела бы внутри"),
    ("#2e7d32", "разнос с LTE ≥10–15 см", "B7 = 2500–2570 МГц вплотную к 2.4 ГГц"),
]
antenna_card = (
    f'<rect x="{ANX}" y="{ANY}" width="{ANW}" height="{ANH}" rx="10" fill="#f6f8fb" '
    f'stroke="#ccd6e4" stroke-width="2"/>'
    f'<text x="{ANX+14}" y="{ANY+22}" font-size="12" font-weight="700" fill="#1a1a1a">'
    f'Антенна ESP32 — в v8 это деталь, а не «встроено»</text>'
    + "".join(
        f'<text x="{ANX+14}" y="{ANY+42+16*i}" font-size="9" font-weight="700" fill="{c}">{a}</text>'
        f'<text x="{ANX+150}" y="{ANY+42+16*i}" font-size="9" fill="{c}">{b}</text>'
        for i, (c, a, b) in enumerate(ANT_ROWS))
    + f'<text x="{ANX+14}" y="{ANY+ANH-22}" font-size="8.5" fill="#333">'
      f'Пигтейл u.FL → SMA + штырь 2.4 ГГц. Гермоввод для него — тот же, что под кабель датчика.</text>'
      f'<text x="{ANX+14}" y="{ANY+ANH-9}" font-size="8.5" fill="#8a6a1a">'
      f'Дальность здесь ни при чём в истории «телефон не подключался» — то был WPA3/PMF, и он уже исправлен.</text>')

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
chrg = (mlead([(X(48), 300), (X(48), 206), (X(5), 206), (X(5), 298)],
              "#2a7de1", "TP4056 CHRG (катод красного LED) → GPIO13",
              "пайка на TP4056", "5a", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="202" font-size="9.5" font-weight="700" fill="#2a7de1">'
        f'CHRG → GPIO13 · пайка к катоду красного светодиода на самом TP4056</text>' +
        mlead([(X(47), 470), (X(47), LOW_C), (X(12), LOW_C), (X(12), 481)],
              STDBY_C, "TP4056 STDBY (катод синего LED) → GPIO19",
              "пайка на TP4056", "12j", "ПАЙКА", w=2.4) +
        f'<text x="{X(20)}" y="{LOW_C+16}" font-size="9.5" font-weight="700" fill="{STDBY_C}">'
        f'STDBY → GPIO19 · пайка к катоду синего светодиода на самом TP4056</text>')

# ═══════════════════════════════════════ 13. КОНТАКТЫ CN101 + СВЕС МОДЕМА НА МАКЕТКЕ
HDR_L, HDR_R = 36, 42
# Штыри торчат со стороны наклейки → модуль ложится НАКЛЕЙКОЙ ВНИЗ, сверху видна сторона
# с SIM и micro-USB. Ориентир на плате — не цифры, а БУКВЫ шелкографии рядом с пятаками:
# S·G·V·K·T·R·G, причём «G» контакта 7 стоит вплотную к micro-USB. Свес уходит вверх,
# поэтому вдоль колонок буквы читаются от USB: кол.36 = G (7), кол.42 = S (1).
HDR_PINS = [("G", "GND", None), ("R", "RXD", TX_C), ("T", "TXD", RX_C), ("K", "PWR", None),
            ("V", "VCC", PLUS), ("G", "GND", GND), ("S", "SLP", None)]
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
    f'один источник: OUT+ TP4056 через SW1 (кол.51). Диодного ИЛИ нет — минус два Шоттки 3 А</text>' +
    bb.mod_pmos_switch(FETX, FETY, FETW, FETH, title="Ключ питания",
                       subtitle="high-side · затвор GPIO33") +
    boost3 +
    bb.mm_point(1626, 300, "5.2 В на выходе (проверять по TP1 модема)", dy=-8) +
    f'<text x="{PAX+18}" y="{PAY+PAH-42}" font-size="9" fill="#8a6a1a">'
    f'сейчас вместо ключа — перемычка 51h → B3 IN+</text>'
    f'<text x="{PAX+18}" y="{PAY+PAH-10}" font-size="9" fill="#c0392b">'
    f'⚠ 1.5 А через защиту DW01 — проходит</text>')

power_wires = (
    # подводки с макетки
    mlead([H(51, "h"), (X(51), 455), (FEED_P, 455), (FEED_P, FETY+FETH/2), (FETX, FETY+FETH/2)],
          PLUS, "узел за SW1 (51h) → ключ → Boost#3", "51h", "ключ питания", "4G · ПИТАНИЕ",
          w=2.8, note="v7: питание модема снимается ПОСЛЕ тумблера, а не с OUT+ напрямую") +
    mlead([H(45, "i"), (X(45), 586), (FEED_G, 586), (FEED_G, GNDBUS)], GND,
          "TP4056 OUT− (45i) → земля блока", "45i", "земля блока", "4G · ПИТАНИЕ",
          w=2.8, note="единственная земля блока: вход буста и возврат модема "
                      "текут по ней навстречу, в проводе остаётся разница ~0.35 А") +
    # внутри карточки
    mlead([(FETX+FETW, FETY+FETH/2), (1410, FETY+FETH/2), (1410, FET_LANE),
           (B3_IN_P, FET_LANE), (B3_IN_P, B3Y)], PLUS,
          "ключ → Boost#3 IN+", "ключ питания", "B3 IN+", "4G · ПИТАНИЕ") +
    f'<line x1="{FEED_G}" y1="{GNDBUS}" x2="{B3_OUT_M}" y2="{GNDBUS}" stroke="{GND}" stroke-width="2.8"/>' +
    mlead([(B3_IN_M, B3Y), (B3_IN_M, GNDBUS)], GND,
          "Boost#3 IN− → земля блока", "B3 IN−", "земля блока", "4G · ПИТАНИЕ") +
    mlead([(B3_OUT_M, B3Y), (B3_OUT_M, GNDBUS)], GND,
          "Boost#3 OUT− → земля блока", "B3 OUT−", "земля блока", "4G · ПИТАНИЕ") +
    # возврат на макетку — ОДИН провод: 5.2 В. Земля модема остаётся перемычкой
    mlead([(B3_OUT_P, B3Y), (B3_OUT_P, VCC_RET), (X(40), VCC_RET), H(40, "c")], PLUS,
          "Boost#3 OUT+ (5.2 В) → кол.40 = «V» VCC модема", "B3 OUT+", "40c", "4G · ПИТАНИЕ",
          w=2.8, note="в этой же колонке сидит C4 — электролит стоит у самого модема"))

# план: затвор ключа ← GPIO33
gate_wire = (
    f'<path d="M{FETX+FETW/2:.0f} {FETY+FETH} L{FETX+FETW/2:.0f} 398 L{GATE_X} 398 '
    f'L{GATE_X} 152 L{bb.PIN_TOP38["33"]} 152 L{bb.PIN_TOP38["33"]} 311" fill="none" '
    f'stroke="#b08a2a" stroke-width="2.2" stroke-dasharray="6 4" opacity="0.7"/>'
    f'<text x="{GATE_X+8}" y="146" font-size="9" font-weight="700" fill="#8a6a1a">'
    f'затвор ключа ← GPIO33 · ПЛАН</text>')

# ═══════════════════════════════════════ 15. КАРТОЧКА МОДЕМА (справочная)
PBX, PBY, PBW, PBH = 1090, 620, 640, 372
MODX, MODY, MODW, MODH = 1150, 662, 330, 216

CN_USED = {2: GND, 3: PLUS, 5: RX_C, 6: TX_C}   # 7 «G» сидит в кол.36, но никуда не разведён
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

MAPTXT = ("буква на плате → колонка:   G (7, у micro-USB) → 36 · R (6) → 37 · T (5) → 38 · "
          "K (4) → 39 н/п · V (3) → 40 · G (2) → 41 · S (1) → 42 н/п")

modem_panel = (
    f'<rect x="{PBX}" y="{PBY}" width="{PBW}" height="{PBH}" rx="12" fill="#fbf7ec" '
    f'stroke="#e0c98a" stroke-width="2"/>'
    f'<text x="{PBX+18}" y="{PBY+24}" font-size="14" font-weight="700" fill="#1a1a1a">'
    f'4G/GPS-модуль — штырями в ряд a, кол. 36–42; проводов к нему НЕТ</text>' +
    bb.mod_a7670(MODX, MODY, MODW, MODH, used=CN_USED,
                 hdr_note="CN101 · штыри СО СТОРОНЫ НАКЛЕЙКИ") + antennas +
    f'<text x="{PBX+18}" y="{PBY+PBH-58}" font-size="9.5" font-weight="700" fill="#2a6fd1">{MAPTXT}</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-42}" font-size="9.5" fill="#c0392b">'
    f'⚠ считать по буквам у пятаков, цифр на плате нет; «G» у micro-USB = кол.36</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-26}" font-size="9.5" fill="#c0392b">'
    f'⚠ буквы тоже не совпадают: TXD платы идёт в RX-пин ESP32</text>'
    f'<text x="{PBX+18}" y="{PBY+PBH-10}" font-size="9.5" fill="#c0392b">'
    f'⚠ 27 мм висят за краем без опоры: снимать строго ВВЕРХ, за гребёнку</text>')

# ═══════════════════════════════════════ 16. ESP32 + КОЛЬЦА + ЛИНЕЙКА
esp = bb.esp32_38(subtitle="v8 · 4G/GPS на UART2 (27/25) · антенна на u.FL",
                  highlight=["5V", "13", "32", "34", "27", "25"], usb_label="")
# Шесть контактов SPI-флеша обводятся отдельно: это единственное на плате, куда
# перемычка означает «не грузится», а не «не работает».
flash = bb.flash_warn((2, 4), (1, 3))

# Пятаки идут ЗА медью: на плате 38-pin косичка легла на 27 и 25, между ними остался
# свободный GPIO26. Затвор ключа — 33. Это уже третий расклад: v6 рисовалась под 27/26,
# на 30-pin по факту вышло 26/25, а здесь снова 27, но в паре с 25. Каждый раз побеждала
# медь, а не рисунок, — поэтому пятаки красятся из тех же констант, что и провода.
esp_fix = "".join(
    f'<rect x="{bb.PIN_TOP38[n]-6}" y="311" width="12" height="10" rx="2" fill="{bb.PAD_UNUSED}"/>'
    for n in ("14", "26"))
esp_fix += (f'<rect x="{bb.PIN_TOP38["27"]-6}" y="311" width="12" height="10" rx="2" fill="{TX_C}"/>'
            f'<rect x="{bb.PIN_TOP38["25"]-6}" y="311" width="12" height="10" rx="2" fill="{RX_C}"/>'
            f'<rect x="{bb.PIN_TOP38["33"]-6}" y="311" width="12" height="10" rx="2" fill="#e0d2a8"/>'
            f'<rect x="{bb.PIN_TOP38["33"]-8}" y="309" width="16" height="14" rx="3" fill="none" '
            f'stroke="#b08a2a" stroke-width="2" stroke-dasharray="3 2"/>')
esp_fix += "".join(
    f'<rect x="{bb.PIN_BOT38[g]-6}" y="471" width="12" height="10" rx="2" fill="{col}"/>'
    for (g, ec, rl, rr, col, *_ ) in LEDS)
bot_ring = esp_fix + "".join(
    f'<rect x="{bb.PIN_BOT38[n]-8}" y="469" width="16" height="14" rx="3" fill="none" '
    f'stroke="{SIG}" stroke-width="2.4"/>' for n in ("4", "16", "17", "5", "18", "19"))

mask = "".join(f'<rect x="{X(c)-11}" y="276" width="22" height="14" fill="{bb.BOARD_FILL}"/>'
               for c in range(20, NCOLS+1, 5))
TOPC = [21, 23, 25, 27, 29, 31, 33, 35, 38, 41, 43]
BOTC = [20, 22, 28, 34, 37, 39, 42]
ruler = ('<g font-size="9" font-weight="700" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="389" fill="#2a6fd1">{c}</text>' for c in TOPC)
         + "".join(f'<text x="{X(c)}" y="389" fill="#b4552a">{c}</text>' for c in BOTC)
         + '</g>'
         + '<text x="82" y="384" font-size="8" fill="#2a6fd1">верх</text>'
         + '<text x="82" y="394" font-size="8" fill="#b4552a">низ</text>')

# ═══════════════════════════════════════ 17. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v8 · плата 38-pin (ESP-32U, CP2102) — та же электрика, другая медь</text>
  <text x="30" y="62" font-size="14" fill="#666">Электрика v7 не тронута: SW1 в разрыве OUT+ (49j → SW1 → 51j), оба потребителя с колонки 51, модем штырями в ряд a на кол. 36–42 наклейкой ВНИЗ. Плата стала на четыре колонки длиннее и занимает 1–19: связки рельсов уехали на 20/21, C2 воткнут прямо в рельсы, LED-резисторы уплотнились до шага 3. Прошивка не меняется.</text>'''

rules = '''<rect x="30" y="70" width="1180" height="78" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="91" font-size="12.5" fill="#c0392b"><tspan font-weight="700">Шесть контактов SPI-флеша выведены на гребёнку: CLK·D0·D1 снизу (кол.1–3), CMD·D3·D2 сверху (кол.2–4).</tspan> Это ноги кристалла флеша. Перемычка в любую из них — и плата не грузится вовсе. Держать колонки пустыми. <tspan font-weight="700">Антенна 2.4 ГГц на u.FL обязательна:</tspan> печатной у ESP-32U нет.</text>
  <text x="46" y="109" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Только 36–42.</tspan> Правее — корпус TP4056 и C1, левее — micro-USB, он и так нависает над кол. 33–35. Свес уходит вверх и накрывает рельсы (кол. 32–46) — ряды b–e остаются рабочими; SIM и обе косички u.FL смотрят ВВЕРХ, micro-USB — вниз, к макетке.</text>
  <text x="46" y="127" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Один источник вместо диодного ИЛИ:</tspan> буст №3 с <tspan font-weight="700">OUT+ TP4056 через SW1</tspan> (кол.51); без банки модем не заведётся. <tspan font-weight="700">UART:</tspan> GPIO27 (TX) → кол.37 = «R» RXD, GPIO25 (RX) ← кол.38 = «T» TXD; GPIO26 между ними СВОБОДЕН. <tspan font-weight="700">Serial2 по умолчанию на GPIO16/17 — это светодиоды</tspan>, пины задавать явно.</text>
  <text x="46" y="144" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG. Тонкая с квадратом = внешний провод. Пунктир = ещё не куплено. Пересечение без точки = провод лежит поверх.</text>'''

# ═══════════════════════════════════════ 18. ТАБЛИЦА
def build_table(y0):
    order = ["РЕЛЬСЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ",
             "SW1", "МОДУЛИ НА ПЛАТЕ", "МОДУЛИ", "ПАЙКА", "4G · ПИТАНИЕ", "4G · МОДЕМ"]
    heads = {"SW1": "НОВОЕ v7 · тумблер в разрыве OUT+ — за ним оба потребителя",
             "РЕЛЬСЫ": "Рельсы: связки кол.20/21 (было 16/17) + мосты через разрез",
             "ПИТАНИЕ": "Питание и земля на макетке",
             "АЦП": "Сигналы в АЦП — траншею НЕ пересекают",
             "СВЕТОДИОДЫ": "Светодиоды: резисторы на плате, LED на крышке",
             "МОДУЛИ НА ПЛАТЕ": "TP4056 и бусты: перемычки к их колонкам",
             "МОДУЛИ": "Внешние: разъём, батарея, выключатель, датчик",
             "ПАЙКА": "Паяные линии TP4056",
             "4G · ПИТАНИЕ": "НОВОЕ · питание модема: 3 провода к макетке, земля — перемычкой",
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
board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS, rail_inset=RAIL_INSET)

TABLE_Y = 1090
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
NOTE_LINES = [
    ("#c0392b", '&#9888;  <tspan font-weight="700">v8 меняет ПЛАТУ: 38-pin DevKitC на модуле ESP-32U вместо 30-pin DOIT.</tspan> Прошивку это не трогает вовсе — набор пинов 38-pin есть надмножество 30-pin, все PIN_* на месте, FQBN смена платы не трогала. Ломается только медь: плата занимает колонки 1–19 вместо 1–15, и всё, что стояло правее, уехало.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">Шесть контактов SPI-флеша выведены на гребёнку — главная новая ловушка.</tspan> Снизу CLK·D0·D1 (кол.1–3), сверху CMD·D3·D2 (кол.2–4). Это ноги кристалла флеша, а не свободные GPIO: одна перемычка в любую из них — и плата не грузится вообще, без всякого сообщения. На схеме они красные и обведены пунктиром; колонки держать пустыми.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">Рельсы на этой макетке короче банка на две колонки с каждой стороны.</tspan> Полосы «+»/«−» начинаются только над кол.3 и обрываются на кол.61, хотя ряды a…j идут от кол.1 до кол.63. Плата встала от самой первой колонки, поэтому над её «5V» отверстия «+» просто нет: перемычка идёт <tspan font-weight="700">по диагонали в ближайшее</tspan> — 1a &#8594; «+» верх, кол.3. Электрически это ничего не меняет, полурельс одна цепь. Тот же случай на другом конце платы: Boost#1 IN− сидит в кол.62, и его перемычка тоже наискосок, в кол.61.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">UART модема сменил пин: GPIO27 (TX) вместо GPIO26.</tspan> Приём остался на GPIO25. Между ними на гребёнке лежит <tspan font-weight="700">свободный GPIO26</tspan> — в него ничего не втыкать, иначе пара разъедется ещё раз. Это уже третий расклад: v6 рисовалась под 27/26, на 30-pin по факту вышло 26/25, здесь снова 27, но в паре с 25. Каждый раз выигрывала медь, поэтому прошивка идёт за ней: <tspan font-weight="700">Serial2.begin(115200, SERIAL_8N1, 25, 27)</tspan>, порядок аргументов (rx, tx).'),
    ("#2e7d32", '&#10003;  <tspan font-weight="700">Антенна стала внешней и обязательной.</tspan> У ESP-32U печатной антенны нет вовсе, только u.FL: без пигтейла плата почти не передаёт, а разъём с нагрузкой вместо антенны даёт связь на метр. Взамен антенна WiFi выносится ЗА пределы глухого IP65-бокса и разносится с LTE-антенной модема — B7 (2500–2570 МГц) стоит вплотную к 2.4 ГГц, а развести их раньше было нечем.'),
    ("#8a6a1a", '&#9675;  <tspan font-weight="700">Дальность тут ни при чём в истории «ноутбук заходит, телефон никогда».</tspan> Та история — про WPA3-SAE и пустой pmf_cfg, и она закрыта правкой прошивки 2026-08-23. Внешняя антенна решает другую задачу: связь с мачты через стенку бокса.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">Мост USB сменился: CP2102 вместо CH340C.</tspan> Другой VID/PID (<tspan font-weight="700">10C4:EA60</tspan> вместо 1A86:7523), драйвер Silabs CP210x (Windows 11 обычно ставит сам из Windows Update), другой номер COM-порта. Скрипты из WindStation-kit ставят драйвер по VID/PID — их надо дополнить. Оговорка «CH340 нестабилен на 460800» к CP2102 не относится.'),
    ("#333",    '<tspan font-weight="700">Что именно уехало по колонкам.</tspan> Верх: GND 2&#8594;6, GPIO13 3&#8594;5, UART 7/8&#8594;<tspan font-weight="700">9/11</tspan> и сменил пины на <tspan font-weight="700">GPIO27/25</tspan>, GPIO33 (затвор) 9&#8594;12, GPIO32 10&#8594;13, GPIO34 12&#8594;15. Низ: LED-пины 4·16·17·5·18 с кол.5–9 на 7–11, GPIO19 (STDBY) 10&#8594;12. Питание не уехало: «5V» — по-прежнему первый контакт от USB, колонка 1.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">3V3 сменил сторону платы:</tspan> был первым в НИЖНЕМ ряду, стал последним в ВЕРХНЕМ (кол.19). Сегодня он никуда не разведён и цена этому ноль, но резистор 47 к&#937; уровневого сдвига (<tspan font-weight="700">HAS_LEVEL_SHIFT</tspan>) придётся тянуть с противоположного края платы.'),
    ("#2e7d32", '&#10003;  <tspan font-weight="700">Связки рельсов переехали 16/17 &#8594; 20/21</tspan> — ровно туда, где кончилась плата. Мёртвая зона левого «−», на которую опирается АЦП, при этом сохранилась: ток ESP32 течёт от кол.6 до связки на кол.21, а низ делителя батареи (27a) и стояк земли датчика (кол.31) остались ПРАВЕЕ связки, то есть на участке, где не течёт ничего.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">C2 больше не занимает колонок банка — он воткнут ПРЯМО В РЕЛЬСЫ</tspan> (кол.18 «+» и кол.19 «−», по диагонали). Тех двух колонок, где он стоял в v7 (19 и 21), просто нет: их съела плата. Двух перемычек к нему в списке соединений тоже больше нет — керамике 100 нФ безразлично, обе ноги на тех же двух цепях.'),
    ("#c0392b", '&#9888;  <tspan font-weight="700">Светодиодные резисторы встали плотнее — шаг 3 колонки вместо 4:</tspan> (22,24) (25,27) (28,30) (31,33) (34,36). Между корпусами остаётся ~1.1 мм. Ставить ровно, в один ряд, не веером. Влево нельзя — колонки 20 и 21 нижнего банка держатся пустыми под связки рельсов, обойти плату им больше негде. Вправо нельзя — за колонкой 36 начинается D1, и диод ряда h с резистором ряда i разошлись бы на 2.5 мм, то есть касались бы корпусами.'),
    ("#8a6a1a", '&#9675;  <tspan font-weight="700">Посадка «+» LOAD уехала с кол.4 на кол.16.</tspan> Электрически это тот же рельс, но провод над колонками 2–4 читался бы как перемычка в контакты флеша — а ровно этого на новой плате делать нельзя.'),
    ("#8a6a1a", '&#9675;  <tspan font-weight="700">Проверить тестером ДО сборки: есть ли диод между VBUS разъёма USB-C и пином 5V.</tspan> У DOIT V1 он был. Если на этой плате его нет, воткнутый USB при живом адаптере погонит 5 В назад в шину 4.7 В и в выходы обоих MT3608 — у MT3608 есть прямой путь OUT&#8594;IN через дроссель и диод, и упрётся он в зарядный узел. Прозвонить в режиме диода в обе стороны.'),
    ("#8a6a1a", '&#9675;  <tspan font-weight="700">Механика: шаг между рядами штырей тот же 0.9&#8243;</tspan> — плата садится в те же ряды макетки и оставляет по одной свободной колонке с каждой стороны. Померить штангенциркулем до посадки: у части клонов 38-pin ряды разнесены на 1.1&#8243;, и тогда свободных отверстий не остаётся вовсе, а вся эта схема не соберётся.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Модуль лежит НАКЛЕЙКОЙ ВНИЗ, и опознавать контакты надо по БУКВАМ, а не по номерам.</tspan> Штыри распаяны со стороны наклейки (на обороте пайка срезана заподлицо) — иначе модуль в макетку просто не воткнуть. Цифр у пятаков нет вовсе.'),
    ("#333",    'Буквы шелкографии по порядку: S · G · V · K · T · R · G, и <tspan font-weight="700">последняя «G» стоит вплотную к micro-USB</tspan>. Именно она садится в кол.36, дальше R→37, T→38, K→39, V→40, G→41, S→42. Перепутать концы = подать 5.2 В на TXD.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Покупать не нужно ничего.</tspan> Переходная планка не нужна (штыри идут прямо в макетку), MT3608 №3, электролит 1000 мкФ и PPTC 3 А уже есть. Из v5 ушли два Шоттки 3 А и адаптер на 3 А.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Наверх смотрят SIM-держатель, обе косички u.FL и горячий линейный U2</tspan> — карта меняется не снимая модуль, тепло уходит в воздух, а не в макетку.'),
    ("#c0392b", '⚠  <tspan font-weight="700">А вот micro-USB смотрит ВНИЗ, к макетке.</tspan> Разъём стоит на том же ребре, что и гребёнка, в ~7 мм за контактом «G» — то есть повисает над кол. 33–35 на высоте ~4 мм. Воткнуть кабель, не сняв модуль, не выйдет: AT-сеансы только до посадки.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Цена №1: без банки модем не работает.</tspan> Пик 1.5 А берётся с OUT+ TP4056, то есть фактически с элементов. Сам TP4056 столько не отдаст — на столе, по одному USB, модем не поднять.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Цена №2: нагрузка модема видна зарядному.</tspan> Ток модема течёт через тот же узел, по которому TP4056 ловит окончание заряда (порог ~1/10 Iprog). В v7 это лечится штатно: SW1 в OFF снимает модем и оба буста с зарядного узла.'),
    ("#333",    'Ресерч v4 (17.08) сделал канал ПОСТОЯННЫМ — MQTT, 5 пакетов/с всё время работы. Значит терминация не «сдвигается на 10 с», а не срабатывает вовсе, пока станция в эфире. Лечится порядком: заряжать при SW1 = OFF — и в v7 тумблер наконец стоит там, где это правило работает. Ключ GPIO33 делает то же из прошивки, сам.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Защита DW01/FS8205 выдерживает.</tspan> Два ключа по ~25 мОм: при 1.5 А это 75 мВ падения и 0.11 Вт. Порог токовой отсечки — около 3 А, вдвое выше пика. Через OUT+ (а не через банку) идти ОБЯЗАТЕЛЬНО.'),
    ("#c0392b", '⚠  <tspan font-weight="700">F1 всё равно на 3 А.</tspan> Худшая точка не изменилась: разряженная банка 3.0 В, модем 1.50 А + станция 0.33 А = ~1.83 А через PTC. А вот адаптеру теперь хватает штатных 2 А — заряд идёт своим током.'),
    ("#1a1a1a", '<tspan font-weight="700">Почему модуль именно на 36–42.</tspan> Сдвиг вправо утыкается в C1 (43–44) и в корпус TP4056 (45 и правее), а влево мешает не электрика (в кол.36 и так земля модема), а micro-USB: он и без того нависает над кол. 33–35.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Механика: 27 мм консоли на семи штырях, стойку решили не ставить.</tspan> От ряда a до края макетки ~10 мм; на этом участке пластик гребёнки (2.5 мм) и экран модуля (~2.3 мм) почти касаются макетки — часть веса ложится на неё.'),
    ("#333",    'Правило снятия: тянуть строго ВВЕРХ, держа за гребёнку, и не поддевать за дальнюю кромку — иначе рычаг 27 мм разбивает пружины ряда a. Если пружины поплывут, любой кусок пластика или плотного поролона под свес снимает момент.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Экран модуля смотрит ВНИЗ, на верхние рельсы.</tspan> В зоне свеса (кол. 32–46) под ним не должно остаться ни одного СИГНАЛЬНОГО провода и ни одной перемычки на «+» — только «−» (44a и 45a), а земля с экраном и так одна цепь.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Сигнальные провода выведены из-под свеса (правка 2026-08-30).</tspan> Низ делителя датчика идёт из 35a по ряду a влево и поднимается на кол.31; стояк АЦП переехал с 33a на 33b с подъёмом на кол.30; пара UART входит в 37d/38d и пересекает рельсы на кол.28 (на 38-pin она выходит с GPIO27 и GPIO25, кол.9 и 11). Все переходы через рельсы — левее кол.32, то есть вне свеса.'),
    ("#c0392b", '⚠  <tspan font-weight="700">«Слепых» проводов осталось два — 44a и 45a,</tspan> оба на верхний «−» рельс, который потом закрыт свесом. Ставить ДО посадки модема; забыл — снимать модуль. У колонки 45 других отверстий сверху нет вовсе (b…f заняты корпусом TP4056). Перемычка земли модема 41b→44b идёт по ряду b, ничем не накрыта и снимается в любой момент.'),
    ("#333",    '<tspan font-weight="700">Два электролита ⌀10 мм стоят в 8 мм друг от друга</tspan> (C4 на 40/41, C1 на 43/44 — между ними колонка 42 под модулем) — банки наклонить в стороны, C1 дополнительно отклонить ВЛЕВО от корпуса TP4056.'),
    ("#333",    '<tspan font-weight="700">C4 — ровно там, где нужен.</tspan> Два ряда от контакта VCC: бросок тока на старте передачи гасится в той самой точке, где возникает. Полярность — «+» в колонку 40 (буква V), «−» в 41 (буква G). Номинал 1000 мкФ, напряжение ≥10 В.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Земля модема — ПЕРЕМЫЧКА 41b→44b, а не четвёртый провод.</tspan> Возврат 0.4–0.65 А идёт из кол.41 строго ВПРАВО (44 → рельс → 45a → медь TP4056 → нижний банк → провод 45i): верхний «−» разрезан между кол.31 и 32, а мостом закрыт только НИЖНИЙ «−», так что левее кол.44 тока нет.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Но «тупик» — это про ток, а не про потенциал.</tspan> Тупиковая ветка принимает потенциал того узла, на котором висит, а висит она на кол.44 — точке впрыска. АЦП же меряет не относительно рельса, а относительно вывода GND чипа: ADC = 0.4·Vдатчика + 0.4·(V(52)−V(6a)) + <tspan font-weight="700">0.6·(V(35)−V(6a))</tspan>. Пока низ делителя сидел на 35a, второй член давал 0.6 × 0.65 А × 27–45 мОм ≈ 11–17 мВ — это 0.15–0.25 м/с призрачного ветра, пока открыт канал.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Поэтому низ делителя датчика перецеплен на ЛЕВЫЙ «−» (кол.31).</tspan> Слева единственный сток — связка кол.21, по участку 21…31 не течёт ничего, и ток модема из опоры АЦП исчезает целиком. Остаётся 0.4·(V(52)−V(6a)) ≈ 1 мВ ≈ 0.02 м/с. Делитель батареи (27a) стоит в той же мёртвой зоне и по той же причине проблемы не имел.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Общий участок остался один</tspan> — нижний рельс между кол.45 и 52, где садится земля датчика: туда возвращается ~40% тока, обошедшего через бусты и связку кол.58. Это 1–9 мВ, и вот к ним ×1/2.5 применимо: 0.4–3.5 мВ на АЦП, 0.005–0.05 м/с. Тот же порядок ESP32 даёт сам, когда передаёт по WiFi.'),
    ("#333",    'Проверка на шаге 18 всё равно обязательна: снять speedMv/speedSpreadMv при неподвижных чашках ДО подъёма канала и через минуту ПОСЛЕ. Уедет — вернуть четвёртый провод (земля блока → 41c) и снять перемычку 41b→44b: возврат модема тогда вообще не заходит на макетку.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Побочный счёт того же возврата:</tspan> 0.65 А идут через ~6 пружинных контактов и медь TP4056, это 40–70 мОм последовательно с питанием модема — 30–45 мВ вычитаются из VCC прямо перед линейным U2, у которого запаса и так нет. Ещё один довод за четвёртый провод, если TP1 под передачей окажется на границе.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Заодно двумя бонусами:</tspan> отдельная перемычка сигнальной земли (36b) больше не нужна — GND модема и так привязан к земле платы в двух колонках от UART; а в проводе 45i встречные токи (вход буста и возврат модема) вычитаются, и вместо 1.0 А по нему идёт ~0.35 А.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Ключ питания (пунктир) сейчас заменяется перемычкой 51h → B3 IN+.</tspan> Пока плата на столе, повисший модем перезагружается рукой или тумблером. Ключ становится обязательным при переезде на мачту: SW1 там трогать некому, R104 держит PWRKEY на земле, выход из CMUX у A7670 сломан — снять VCC больше нечем.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Главное отличие v7: SW1 стоит в разрыве OUT+, и за ним ОБА потребителя.</tspan> В v6 тумблер сидел между узлом ШИНА и «+» LOAD, то есть ниже по течению, чем бусты, — выключенная станция продолжала кормить модем (20–30 мА покоя) и холостой ход обоих MT3608. Ровно этот разряд высадил банку в ноль 16.08.'),
    ("#2e7d32", '✓  <tspan font-weight="700">Оба отвода с колонки 49 переехали на колонку 51</tspan> — 51i→55c (буст №2, шина и ESP32) и 51h→ключ (буст №3, модем). На кол.49 остался один провод — к тумблеру. Перенести только один отвод = оставить под питанием половину того, ради чего всё затевалось; проверка после монтажа: при SW1 = OFF и вынутом адаптере на входах обоих MT3608 ноль вольт.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Чем за это заплачено: при воткнутом адаптере станцию одним щелчком не обесточить.</tspan> D1 кормит шину напрямую, и SW1 до него не достаёт — в положении OFF станция живёт от адаптера, а банка при этом заряжается вчистую (это и было целью). Полное снятие питания = вынуть адаптер. Апгрейд, если начнёт мешать, — DPDT: второй полюс рвёт шину тем же движением.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Ток через контакты тумблера — до 1.83 А</tspan> (модем 1.50 + станция 0.33 на разряженной банке 3.0 В). Мини-тумблер на 6 А это держит с запасом; постоянка при 4 В дугу не тянет, ограничение по нагреву контактов, а не по разрыву.'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Узел ШИНА идёт на «+» LOAD прямым проводом 39g → кол.4.</tspan> Раньше этот путь шёл через тумблер. Провод длинный, но точка посадки та же: ЛЕВАЯ половина верхнего «+», минуя разрез, — мост 31↔32 по-прежнему несёт только Boost#1 (~75 мА).'),
    ("#8a6a1a", '◌  <tspan font-weight="700">Цифры 1.5 А и 1.83 А унаследованы от v5</tspan>, где вход буста считался ПОСЛЕ Шоттки (3.0 − 0.5 = 2.5 В). В v6 диода нет: 0.65 × 5.2 / 3.0 / 0.9 ≈ 1.25 А на входе буста и ~1.58 А через F1. Числа оставлены как есть — запас в бóльшую сторону, и PPTC всё равно ставится на 3 А.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Ключ делает полное снятие питания штатным событием — проверить, переживает ли это CNMP=38.</tspan> Известно только, что режим пережил AT+CFUN=1,1. Если 38 не лежит в NVM, первая регистрация после каждого включения ключа может уйти в 2G с импульсами 2 А — ровно та нагрузка, под которую этот тракт не считался.'),
    ("#333",    'На терминацию заряда перемычка не влияет, пока модем молчит: в простое 20–30 мА против порога ~100 мА при Iprog 1 А. Мешает открытый канал — 100–200 мА непрерывно перекрывают порог с запасом. Отсюда правило «заряжать при SW1 = OFF».'),
    ("#c0392b", '⚠  <tspan font-weight="700">Пресет буста проверяется по TP1 на плате модема, а не по его входу.</tspan> U2 там — линейный 1084 в DPAK, дросселя нет: разница (VCC − 4.0) × I горит в тепле. TP1 под передачей ниже 3.9 В → поднять пресет до 5.4 В.'),
    ("#c0392b", '⚠  <tspan font-weight="700">AT+CNMP=38 (LTE only) фиксируется с USB, до сборки.</tspan> В 2G импульсы 2 А, которых этот тракт не тянет, а модуль стартует сам и регистрируется раньше, чем ESP32 скажет слово.'),
    ("#c0392b", '⚠  <tspan font-weight="700">Boost#3 (HW-085/TMF002) — не перепутай IN и OUT.</tspan> Признак не «верх/низ», а расстояние между контактами: два РЯДОМ = IN, два разнесённые К КРАЯМ = OUT.'),
]
# Перенос длинных сносок. Панель шириной 1840, шрифт 12.5 — в строку влезает около 265
# видимых знаков; всё, что длиннее, раньше уезжало за правый край панели и обрезалось.
# Метрик шрифта у генератора нет, поэтому считаем по символам, а жирным даём вес 1.08.
NOTE_BUDGET = 255
BOLD_OPEN = '<tspan font-weight="700">'


def _scan(chunk, bold=False):
    """Длина куска без разметки (жирные знаки шире) и состояние жирности на выходе."""
    total, i = 0.0, 0
    while i < len(chunk):
        if chunk[i] == "<":
            j = chunk.index(">", i)
            tag = chunk[i:j + 1]
            if "font-weight" in tag:
                bold = True
            elif tag == "</tspan>":
                bold = False
            i = j + 1
            continue
        total += 1.08 if bold else 1.0
        i += 1
    return total, bold


def _words(text):
    """Слова для переноса: тег — атом, внутри него пробелы не считаются разделителями."""
    out, cur = [], ""
    for tok in re.findall(r"<[^>]*>|[^<\s]+|\s+", text):
        if tok[0] != "<" and tok.isspace():
            if cur:
                out.append(cur)
                cur = ""
        else:
            cur += tok
    if cur:
        out.append(cur)
    return out


def wrap_note(text, budget=NOTE_BUDGET):
    """Режет сноску по пробелам. Жирный span, попавший на стык, закрывается и открывается
       заново — иначе кусок уезжает в отдельный <text> с незакрытым тегом."""
    parts, cur, cur_len = [], [], 0.0
    for word in _words(text):
        wl = _scan(word)[0]
        if cur and cur_len + 1 + wl > budget:
            parts.append(" ".join(cur))
            cur, cur_len = [word], wl
        else:
            cur.append(word)
            cur_len += (1 if cur[:-1] else 0) + wl
    parts.append(" ".join(cur))
    rows, bold = [], False
    for k, part in enumerate(parts):
        opened = bold
        _, bold = _scan(part, bold)
        rows.append(((BOLD_OPEN if opened else "") + part + ("</tspan>" if bold else ""), k > 0))
    return rows


NOTE_ROWS = [(c, txt, cont) for c, t in NOTE_LINES for txt, cont in wrap_note(t)]
NOTE_H = 44 + 20 * len(NOTE_ROWS)
notes = (f'<rect x="30" y="{NY}" width="1840" height="{NOTE_H}" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>'
         f'<text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">'
         f'Что изменилось в v8 (плата 38-pin) и что осталось от v7</text>'
         + "".join(f'<text x="{64 if cont else 46}" y="{NY+48+20*i}" font-size="12.5" fill="{c}">{t}</text>'
                   for i, (c, t, cont) in enumerate(NOTE_ROWS)))

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
  {flash}
  {bot_ring}
  {adc_wires}
  {rail_jmp}
  {gnd_sense}
  {board_jmp}
  {mods_inline}
  {caps_elec}
  {gnd_bond}
  {gpio_res}
  {uart_wires}
  {led_anode}
  {lid_panel}
  {led_cath}
  {mods_ext}
  {antenna_card}
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

out = os.path.join(os.path.dirname(__file__), "wiring_v8.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
