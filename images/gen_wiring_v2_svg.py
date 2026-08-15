# -*- coding: utf-8 -*-
"""СХЕМА v2 — ВСЁ НА ОДНОЙ ПЛАТЕ.

Отличия от wiring_final.svg (v1):
  1. Модули (адаптер, TP4056, Boost#1, Boost#2, датчик, SW1, батарея) НАРИСОВАНЫ.
     Ни одного «пунктира в никуда»: у каждого вывода модуля есть адрес отверстия.
  2. Светодиоды сняты с макетки — уходят проводами на крышку корпуса.
     На плате остались только их резисторы 220 Ω.
  3. Компоненты перенесены в ВЕРХНИЙ банк (ближе к верхним рельсам): резисторы
     светодиодов, делитель батареи и делитель датчика. Низ — только силовая часть.
     Оба провода в АЦП больше НЕ пересекают траншею.
  4. Правило шага: между выводами любых двух деталей минимум одно свободное
     отверстие (шаг колонок >= 2). То же и для посадок на рельсы.
  5. Верхний банк — только НЕЧЁТНЫЕ колонки, нижний — только ЧЁТНЫЕ.
     Один и тот же номер колонки больше не живёт дважды.
  6. Мостов через разрез рельса — 2 вместо 8 (плюс 2 вертикальные связки земли).
     Потребители расставлены так, что силовой ток через мосты не идёт вообще.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

MM = 2.54 / 17.0
RAIL_TP, RAIL_TM = 250, 262           # верх: «+» LOAD / «−» верх
RAIL_BP, RAIL_BM = 506, 518           # низ:  «+» ШИНА / «−» низ
CUT = 606.5                           # разрез рельсов (между кол. 31 и 32)
TEAL = "#0e9488"
SIG, GND, PLUS, PURPLE = bb.SIG, bb.GNDc, bb.PLUS, bb.PURPLE
W_CANVAS = 1760

def X(c):   return bb.colx(c)
def Y(r):   return bb.ROWY[r]
def H(c, r): return (X(c), Y(r))

WIRES = []

def plen(pts):
    return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
               for i in range(len(pts)-1))

def dpath(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)

# ─────────────────────────────────────── жёсткая перемычка макетки (22 AWG)
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

# ─────────────────────────────────────── провод от модуля (паяный к площадке)
def mlead(pts, color, name, frm, to, group, w=2.2, note="", both_sq=False):
    """Квадрат на площадке модуля, точка в отверстии макетки."""
    x0, y0 = pts[0]; xe, ye = pts[-1]
    s = (f'<path d="{dpath(pts)}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round"/>'
         f'<rect x="{x0-4:.1f}" y="{y0-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>')
    s += (f'<rect x="{xe-4:.1f}" y="{ye-4:.1f}" width="8" height="8" rx="1.5" fill="{color}"/>'
          if both_sq else f'<circle cx="{xe:.1f}" cy="{ye:.1f}" r="3.4" fill="{color}"/>')
    WIRES.append(dict(group=group, name=name, frm=frm, to=to,
                      color=color, mm="по месту", note=note))
    return s

# ═══════════════════════════════════════ 1. МОСТЫ + ВЕРТИКАЛЬНЫЕ СВЯЗКИ
def bridge(y_rail, x1, x2, y_arch, color, name, note=""):
    return jmp([(x1, y_rail), (x1, y_arch), (x2, y_arch), (x2, y_rail)],
               color, name, "левая половина", "правая половина", "МОСТЫ",
               w=3.0, note=note)

LINK1, LINK2 = 428, 479               # кол. 21 и 24 — свободны в ОБОИХ банках

bridges = (
    # дуги вложены одна в другую: широкая — выше, узкая — ниже, они не пересекаются.
    # Ноги обоих мостов стоят через свободное отверстие (кол. 29/34 и 30/33).
    bridge(RAIL_TP, 564, 649, 222, PLUS, "мост «+» LOAD — единственный",
           note="~75 мА: только Boost#1 (датчик)") +
    bridge(RAIL_TM, 581, 615, 234, GND, "мост «−» верх — единственный",
           note="~100 мА: возвраты Boost#1, светодиодов, делителей") +
    jmp([(LINK1, RAIL_TM), (LINK1, RAIL_BM)], GND,
        "связка земли #1 (кол. 21)", "«−» верх", "«−» низ", "МОСТЫ",
        w=3.2, note="здесь идёт ВЕСЬ обратный ток — потому и дублируется") +
    jmp([(LINK2, RAIL_TM), (LINK2, RAIL_BM)], GND,
        "связка земли #2 (кол. 24)", "«−» верх", "«−» низ", "МОСТЫ",
        w=3.2, note="дублёр связки #1"))

split_marks = f'''<line x1="{CUT}" y1="238" x2="{CUT}" y2="276" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <line x1="{CUT}" y1="494" x2="{CUT}" y2="536" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <text x="598" y="546" font-size="9.5" font-weight="700" fill="#c0392b" text-anchor="end">разрез рельсов →</text>'''

# ═══════════════════════════════════════ 2. ПОЛОСЫ РАЗВОДКИ НАД ПЛАТОЙ
LEDLANE   = [152, 160, 168, 176, 184]   # аноды светодиодов → крышка
CATH_LANE = 194                          # общий катод с крышки → «−» верх
SENSOR_LANE = 202                        # жёлтый датчика → 51a
SENSE_LANE  = 210                        # «+» холдера (сенсорный) → 23a
CHRG_LANE   = 224
LANE = {"g32": 268, "led33": 272, "g34": 276, "led14": 284,
        "led27": 288, "led26": 292, "led25": 296}

# ═══════════════════════════════════════ 3. ВЕРХНИЙ БАНК — СИГНАЛЫ (нечёт.)
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
B10K  = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#c00",     "#7a4a12"]
B5K   = ["#2e8b3d", "#1a1a1a", "#1a1a1a", "#7a4a12", "#7a4a12"]
B220  = ["#c00",    "#c00",    "#1a1a1a", "#7a4a12", "#7a4a12"]

#        GPIO кол.  цвет         обводка    имя цвета  смысл             полоса
LEDS = [("14", 31, "#c62828",   "#7d1a1a", "красный", "ветер &gt;15 м/с", "led14"),
        ("27", 35, "#f2c21a",   "#a6821a", "жёлтый",  "ветер &gt;5 м/с",  "led27"),
        ("26", 39, bb.LED_G,    "#1c7a2e", "зелёный", "станция ОК",       "led26"),
        ("25", 43, bb.LED_WIFI, "#16407a", "синий",   "WiFi есть",        "led25"),
        ("33", 47, "#e23b2e",   "#8f1f16", "красный", "ошибка АЦП",       "led33")]
GPIO_COL = {"14": 5, "27": 6, "26": 7, "25": 8, "33": 9}

comps_top = "".join(bb.resistor(c, c + 2, "c", B220, label="")
                    for _, c, _, _, _, _, _ in LEDS)
comps_top += (
    bb.cap_ceramic(17, 19, "c", label="C2 100нФ") +
    # делитель батареи 100k/100k → GPIO32
    bb.resistor(23, 25, "c", B100K, label="") +
    bb.resistor(25, 27, "c", B100K, label="") +
    bb.cap_ceramic(25, 27, "e", label="") +
    # делитель датчика (10k+5k) / 10k → GPIO34
    bb.resistor(51, 53, "c", B10K, label="") +
    bb.resistor(53, 55, "c", B5K,  label="") +
    bb.resistor(55, 57, "c", B10K, label="") +
    bb.cap_ceramic(55, 57, "e", label=""))

def lbl(x, y, text, w, fill=bb.COPPER, size=10, weight="700", anchor="middle"):
    x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
    return (f'<rect x="{x0:.0f}" y="{y-10}" width="{w}" height="13" fill="#fff" opacity="0.92"/>'
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}">{text}</text>')

comps_lbl = (
    "".join(lbl((X(c) + X(c + 2)) / 2, 352, "220 Ω", 44, size=9.5)
            for _, c, _, _, _, _, _ in LEDS) +
    lbl(479, 352, "100k", 34, size=9.5) + lbl(513, 352, "100k", 34, size=9.5) +
    lbl(955, 352, "10k", 30, size=9.5) + lbl(989, 352, "5k", 26, size=9.5) +
    lbl(1023, 352, "10k", 30, size=9.5) +
    lbl(X(25) - 14, 374, "C5", 22, size=9, anchor="end") +
    lbl(X(55) - 14, 374, "C3", 22, size=9, anchor="end") +
    lbl(X(25), 322, "делитель ×2.0 → GPIO32", 138, fill="#c47015", size=9) +
    lbl(X(55), 322, "делитель ×2.5 → GPIO34", 138, fill="#c47015", size=9))

# ═══════════════════════════════════════ 4. НИЖНИЙ БАНК — ПИТАНИЕ (чёт.)
comps_bot = (
    bb.diode_schottky(18, 22, "g", "D1 · 1N5819", cathode="right") +
    bb.cap_electrolytic(26, 28, "i", "1000µF") +
    bb.diode_schottky(30, 34, "g", "D2 · 1N5819", cathode="left") +
    bb.ptc(42, 44, "j", "") +
    f'<text x="802" y="414" font-size="9" font-weight="700" fill="{bb.COPPER}" '
    f'text-anchor="middle">F1 · PTC ≥2A</text>')

# ═══════════════════════════════════════ 5. ПЕРЕМЫЧКИ НА РЕЛЬСЫ
RAIL_NAME = {RAIL_BP: "«+» ШИНА", RAIL_BM: "«−» низ",
             RAIL_TP: "«+» LOAD", RAIL_TM: "«−» верх"}

def to_rail(col, row, rail_y, color, name, group, note=""):
    x, y = H(col, row)
    return jmp([(x, y), (x, rail_y)], color, name, f"{col}{row}",
               RAIL_NAME[rail_y], group, note=note)

rail_jmp = (
    to_rail(1,  "a", RAIL_TP, PLUS, "ESP32 VIN → LOAD",       "ПИТАНИЕ") +
    to_rail(2,  "a", RAIL_TM, GND,  "ESP32 GND → «−» верх",   "ПИТАНИЕ") +
    to_rail(17, "a", RAIL_TP, PLUS, "C2 → «+» LOAD",          "ПИТАНИЕ") +
    to_rail(19, "a", RAIL_TM, GND,  "C2 → «−» верх",          "ПИТАНИЕ") +
    to_rail(27, "a", RAIL_TM, GND,  "низ делителя батареи",   "АЦП") +
    to_rail(57, "a", RAIL_TM, GND,  "низ делителя датчика",   "АЦП") +
    to_rail(22, "j", RAIL_BP, PLUS, "D1 катод → ШИНА",        "ПИТАНИЕ") +
    to_rail(26, "j", RAIL_BP, PLUS, "C1 «+» → ШИНА",          "ПИТАНИЕ") +
    to_rail(28, "j", RAIL_BM, GND,  "C1 «−» → «−» низ",       "ПИТАНИЕ") +
    to_rail(30, "j", RAIL_BP, PLUS, "D2 катод → ШИНА",        "ПИТАНИЕ"))

# ═══════════════════════════════════════ 6. GPIO → РЕЗИСТОР, УЗЕЛ → АЦП
def lane_wire(gpio_col, col, lane, color, name, group):
    x1, x2 = X(gpio_col), X(col)
    return jmp([(x1, 298), (x1, lane), (x2, lane), (x2, 298)], color, name,
               f"{gpio_col}a", f"{col}a", group, w=2.4)

gpio_wires = "".join(
    lane_wire(GPIO_COL[g], c, LANE[k], col,
              f"GPIO{g} → резистор 220 Ω ({c}a)", "СВЕТОДИОДЫ")
    for g, c, col, _, _, _, k in LEDS)

adc_wires = (
    lane_wire(10, 25, LANE["g32"], SIG,
              "узел делителя батареи (25) → GPIO32", "АЦП") +
    lane_wire(12, 55, LANE["g34"], SIG,
              "узел делителя датчика (55) → GPIO34", "АЦП"))

# ═══════════════════════════════════════ 7. АНОДЫ СВЕТОДИОДОВ → КРЫШКА
PANEL_X, PANEL_Y, PW, PH = 1250, 158, 480, 250

led_out = "".join(
    jmp([(X(c + 2), 298), (X(c + 2), LEDLANE[i]), (PANEL_X, LEDLANE[i])], col,
        f"анод LED {g} ({cn}) → крышка", f"{c+2}a", "крышка", "СВЕТОДИОДЫ",
        w=2.4, dots="start", cut="по месту")
    for i, (g, c, col, _, cn, _, _) in enumerate(LEDS))

led_cath = jmp([(PANEL_X, 292), (1232, 292), (1232, CATH_LANE),
                (666, CATH_LANE), (666, RAIL_TM)], GND,
               "общий катод 5 светодиодов → «−» верх", "крышка", "«−» верх",
               "СВЕТОДИОДЫ", w=2.8, dots="end", cut="по месту")

# ═══════════════════════════════════════ 8. МОДУЛИ
mods = (
    bb.mod_usb_c(120, 620, 180, 150,
                 [(190, "+5В", PLUS), (250, "GND", GND)],
                 subtitle="панельный разъём · пигтейл") +
    bb.mod_tp4056(360, 620, 280, 150,
                  [(377, "IN+", PLUS), (412, "IN−", GND),
                   (505, "B−", PURPLE), (540, "B+", PLUS),
                   (578, "OUT−", GND), (612, "OUT+", PLUS)], usb_cx=462) +
    bb.mod_boost(680, 620, 240, 150,
                 [(717, "IN+", PLUS), (752, "IN−", GND),
                  (852, "OUT+", PLUS), (887, "OUT−", GND)],
                 subtitle="Boost#2 → 5.14 В (от батареи)") +
    bb.mod_boost(1020, 830, 230, 150,
                 [(1050, "IN+", PLUS), (1085, "IN−", GND),
                  (1180, "OUT+", PLUS), (1215, "OUT−", GND)],
                 subtitle="Boost#1 → 12 В (датчик)") +
    bb.battery_pack(120, 810) +
    bb.switch_rocker(760, 830, 220, 100,
                     [(772, 862, "ШИНА"), (772, 898, "LOAD")],
                     title="SW1", subtitle="общий выключатель") +
    '<text x="1135" y="1002" font-size="9.5" fill="#666" text-anchor="middle">'
    'IN− и OUT− у MT3608 — одна медь: на землю хватает одного провода</text>')

leads = (
    # ── адаптер 5 В ─────────────────────────────────────────────
    mlead([(190, 620), (190, 534), (377, 534), (377, 478)], PLUS,
          "адаптер «+5В» → 18j", "адаптер +5В", "18j", "МОДУЛИ") +
    mlead([(250, 620), (250, 588), (224, 588), (224, RAIL_BM)], GND,
          "адаптер GND → «−» низ", "адаптер GND", "«−» низ", "МОДУЛИ") +
    # ── TP4056 ──────────────────────────────────────────────────
    mlead([(377, 620), (377, 442)], PLUS,
          "TP4056 IN+ → 18h (тот же узел, что адаптер)",
          "TP4056 IN+", "18h", "МОДУЛИ") +
    mlead([(412, 620), (412, 576), (258, 576), (258, RAIL_BM)], GND,
          "TP4056 IN− → «−» низ", "TP4056 IN−", "«−» низ", "МОДУЛИ") +
    mlead([(578, 620), (578, 564), (292, 564), (292, RAIL_BM)], GND,
          "TP4056 OUT− → «−» низ", "TP4056 OUT−", "«−» низ", "МОДУЛИ") +
    mlead([(612, 620), (612, 546), (717, 546), (717, 460)], PLUS,
          "TP4056 OUT+ → 38i", "TP4056 OUT+", "38i", "МОДУЛИ",
          note="кол. 38 = OUT+ TP4056 = IN+ Boost#2, это один узел") +
    mlead([(540, 620), (540, 558), (785, 558), (785, 424)], PLUS,
          "TP4056 B+ → 42g", "TP4056 B+", "42g", "МОДУЛИ",
          note="защищённый «+» батареи, после F1") +
    mlead([(505, 620), (505, 600), (100, 600), (100, 950), (187, 950)], PURPLE,
          "TP4056 B− → «−» пакета (отдельная сеть!)",
          "TP4056 B−", "«−» пакета", "МОДУЛИ", both_sq=True,
          note="НЕ на общий «−» рельс — иначе отключится защита DW01") +
    # ── Boost#2 (5 В из батареи) ────────────────────────────────
    mlead([(717, 620), (717, 478)], PLUS,
          "Boost#2 IN+ → 38j", "Boost#2 IN+", "38j", "МОДУЛИ") +
    mlead([(752, 620), (752, 552), (326, 552), (326, RAIL_BM)], GND,
          "Boost#2 IN− → «−» низ", "Boost#2 IN−", "«−» низ", "МОДУЛИ") +
    mlead([(852, 620), (852, 570), (649, 570), (649, 478)], PLUS,
          "Boost#2 OUT+ → 34j (анод D2)", "Boost#2 OUT+", "34j", "МОДУЛИ") +
    mlead([(887, 620), (887, 540), (360, 540), (360, RAIL_BM)], GND,
          "Boost#2 OUT− → «−» низ", "Boost#2 OUT−", "«−» низ", "МОДУЛИ",
          note="главный обратный ток — на ЛЕВУЮ половину, мимо разреза") +
    # ── Boost#1 (12 В для датчика) ──────────────────────────────
    mlead([(1050, 830), (1050, 806), (1090, 806), (1090, 238), (1057, 238),
           (1057, RAIL_TP)], PLUS,
          "Boost#1 IN+ → «+» LOAD (в обход платы справа)",
          "Boost#1 IN+", "«+» LOAD", "МОДУЛИ",
          note="питание датчика выключается вместе с SW1") +
    mlead([(1085, 830), (1085, 798), (1105, 798), (1105, 246), (955, 246),
           (955, RAIL_TM)], GND,
          "Boost#1 IN− → «−» верх", "Boost#1 IN−", "«−» верх", "МОДУЛИ",
          note="OUT− отдельным проводом НЕ нужен — внутри модуля это одна медь") +
    mlead([(1180, 830), (1180, 790), (960, 790), (960, 570), (887, 570),
           (887, 478)], PLUS,
          "Boost#1 OUT+ (12 В) → 48j", "Boost#1 OUT+", "48j", "МОДУЛИ") +
    # ── батарейный пакет ────────────────────────────────────────
    mlead([(573, 968), (1000, 968), (1000, 538), (819, 538), (819, 478)], PLUS,
          "«+» пакета → F1 (44j)", "«+» пакета", "44j", "МОДУЛИ") +
    mlead([(573, 898), (573, 798), (16, 798), (16, SENSE_LANE),
           (X(23), SENSE_LANE), (X(23), 298)], PLUS,
          "«+» холдера → верх делителя (23a) — ОТДЕЛЬНЫЙ сенсорный провод",
          "«+» холдера", "23a", "МОДУЛИ",
          note="не с кол. 44! иначе TP4056 подделывает напряжение батареи") +
    # ── выключатель ─────────────────────────────────────────────
    mlead([(772, 862), (740, 862), (740, 784), (48, 784), (48, RAIL_BP),
           (156, RAIL_BP)], PLUS,
          "SW1 ← «+» ШИНА", "SW1 (вход)", "«+» ШИНА", "МОДУЛИ") +
    mlead([(772, 898), (725, 898), (725, 776), (32, 776), (32, RAIL_TP),
           (139, RAIL_TP)], PLUS,
          "SW1 → «+» LOAD", "SW1 (выход)", "«+» LOAD", "МОДУЛИ"))

# ═══════════════════════════════════════ 9. ДАТЧИК
SX, SY, SW_, SH = 1250, 430, 480, 160
sensor = f'''<rect x="{SX}" y="{SY}" width="{SW_}" height="{SH}" rx="12"
    fill="{bb.CONT_FILL}" stroke="{bb.CONT_STK}" stroke-width="2"/>
  <text x="{SX+20}" y="{SY+26}" font-size="14" font-weight="700" fill="#1a1a1a">Датчик ветра · на мачте</text>
  <text x="{SX+20}" y="{SY+44}" font-size="10.5" fill="#666">0–30 м/с · питание 12 В · выход 0–5 В · кабель до 4 м</text>
  <g stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M{SX+330} {SY+70} L{SX+120} {SY+70}" stroke="{TEAL}"/>
    <path d="M{SX+330} {SY+95} L{SX+120} {SY+95}" stroke="{GND}"/>
    <path d="M{SX+330} {SY+120} L{SX+120} {SY+120}" stroke="{PLUS}"/>
  </g>
  <circle cx="{SX+374}" cy="{SY+95}" r="30" fill="#eceadf" stroke="#c7c1ae" stroke-width="2"/>
  <circle cx="{SX+374}" cy="{SY+95}" r="10" fill="#8d8d8d"/>
  <text x="{SX+126}" y="{SY+64}" font-size="9.5" fill="{TEAL}" font-weight="700">жёлтый · сигнал 0–5 В</text>
  <text x="{SX+126}" y="{SY+89}" font-size="9.5" fill="#333" font-weight="700">чёрный · GND</text>
  <text x="{SX+126}" y="{SY+114}" font-size="9.5" fill="{PLUS}" font-weight="700">красный · +12 В</text>'''

sensor_leads = (
    mlead([(1370, 500), (1160, 500), (1160, SENSOR_LANE),
           (X(51), SENSOR_LANE), (X(51), 298)], TEAL,
          "датчик жёлтый → 51a (верх делителя)",
          "датчик жёлтый", "51a", "МОДУЛИ") +
    mlead([(1370, 525), (1120, 525), (1120, 254), (989, 254), (989, RAIL_TM)],
          GND, "датчик чёрный → «−» верх, рядом с низом делителя",
          "датчик чёрный", "«−» верх", "МОДУЛИ",
          note="общая точка отсчёта для АЦП") +
    mlead([(1370, 550), (1200, 550), (1200, 594), (887, 594), (887, 460)], PLUS,
          "датчик красный (+12 В) → 48i", "датчик красный", "48i", "МОДУЛИ"))

# ═══════════════════════════════════════ 10. КРЫШКА КОРПУСА
panel = ['<text x="%d" y="130" font-size="15" font-weight="700" fill="#1a1a1a">'
         'Крышка корпуса · 5 светодиодов</text>' % PANEL_X,
         '<text x="%d" y="147" font-size="10.5" fill="#777">'
         'на плате их больше нет — остались только резисторы 220 Ω</text>' % PANEL_X,
         f'<rect x="{PANEL_X}" y="{PANEL_Y}" width="{PW}" height="{PH}" rx="12" '
         f'fill="#2b2b30" stroke="#15161a" stroke-width="2"/>']
LX = [PANEL_X + 66 + i * 86 for i in range(5)]
for i, (g, c, col, stroke, cn, meaning, _) in enumerate(LEDS):
    lx = LX[i]
    panel.append(f'<path d="M{PANEL_X} {LEDLANE[i]} L{lx} {LEDLANE[i]} L{lx} 241" '
                 f'fill="none" stroke="{col}" stroke-width="2.4" stroke-linejoin="round"/>')
    panel.append(f'<circle cx="{lx}" cy="252" r="11" fill="{col}" stroke="{stroke}" stroke-width="2"/>')
    panel.append(f'<line x1="{lx}" y1="263" x2="{lx}" y2="292" stroke="{GND}" stroke-width="2.4"/>')
    panel.append(f'<text x="{lx}" y="316" font-size="10" font-weight="700" fill="#f2f2f2" text-anchor="middle">GPIO{g}</text>')
    panel.append(f'<text x="{lx}" y="330" font-size="8.5" fill="#9aa" text-anchor="middle">{cn}</text>')
    panel.append(f'<text x="{lx}" y="342" font-size="8.5" fill="#9aa" text-anchor="middle">{meaning}</text>')
panel.append(f'<path d="M{LX[4]} 292 L{PANEL_X} 292" stroke="{GND}" stroke-width="3.4" fill="none"/>')
panel.append(f'<text x="{PANEL_X+20}" y="376" font-size="10.5" fill="#cfd2d8">'
             f'6 проводов до платы: 5 анодов + <tspan font-weight="700">один общий катод</tspan> (а не 10)</text>')
panel = "".join(panel)

# ═══════════════════════════════════════ 11. ВРЕЗКА STDBY + CHRG
NX, NYb = 1250, 620
note_stdby = f'''<rect x="{NX}" y="{NYb}" width="480" height="172" rx="10" fill="#fff6f4" stroke="#e0a79c" stroke-width="2"/>
  <text x="{NX+16}" y="{NYb+24}" font-size="13" font-weight="700" fill="#c0392b">⚠ STDBY: GPIO19 может быть недоступен</text>
  <text x="{NX+16}" y="{NYb+45}" font-size="10.5" fill="#5a4340">Плата DevKit V1 шириной 25.4 мм закрывает свои колонки — свободен</text>
  <text x="{NX+16}" y="{NYb+59}" font-size="10.5" fill="#5a4340">только один ряд. Если это ряд <tspan font-weight="700">a</tspan>, нижние пины (3V3, 19, 21…)</text>
  <text x="{NX+16}" y="{NYb+73}" font-size="10.5" fill="#5a4340">в отверстие не выведены. <tspan font-weight="700">Проверь на живой плате.</tspan></text>
  <text x="{NX+16}" y="{NYb+97}" font-size="11" font-weight="700" fill="#1a1a1a">Запасной вариант — GPIO35:</text>
  <text x="{NX+16}" y="{NYb+113}" font-size="10.5" fill="#333">канала направления у нового датчика нет, 35 свободен. Но он</text>
  <text x="{NX+16}" y="{NYb+127}" font-size="10.5" fill="#333">input-only без подтяжки → делитель R7 10k (LOAD) / R8 20k (GND):</text>
  <text x="{NX+16}" y="{NYb+143}" font-size="10.5" fill="#2e7d32">покой 4.7×20/30 = <tspan font-weight="700">3.13 В</tspan> при Vih 2.48 В, ток стока 0.47 мА.</text>
  <text x="{NX+16}" y="{NYb+161}" font-size="10.5" fill="#c0392b">Прошивка: PIN_STDBY 19→35, режим INPUT (не INPUT_PULLUP).</text>'''

chrg = (jmp([(X(3), 298), (X(3), CHRG_LANE), (60, CHRG_LANE), (60, 152)], "#2a7de1",
            "TP4056 CHRG (катод красного LED) → GPIO13", "пайка на TP4056", "3a",
            "ПАЙКА", w=2.4, dots="end", cut="по месту") +
        '<text x="66" y="148" font-size="10" font-weight="700" fill="#2a7de1">'
        'CHRG → GPIO13 · пайка к катоду красного светодиода TP4056</text>')

# ═══════════════════════════════════════ 12. ESP32 + ЛИНЕЙКА КОЛОНОК
esp = bb.esp32(subtitle="v2 · сигналы сверху, питание снизу",
               highlight=["VIN", "32", "34"], usb_label="")

mask = "".join(f'<rect x="{x-11}" y="276" width="22" height="14" fill="{bb.BOARD_FILL}"/>'
               for x in (411, 496, 581, 666, 751, 836, 921, 1006))
TOPC = [17, 19, 23, 25, 27, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57]
BOTC = [18, 22, 26, 28, 30, 34, 38, 42, 44, 48]
ruler = ('<g font-size="9" font-weight="700" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="392" fill="#2a6fd1">{c}</text>' for c in TOPC)
         + "".join(f'<text x="{X(c)}" y="392" fill="#b4552a">{c}</text>' for c in BOTC)
         + '</g>'
         + '<text x="82" y="386" font-size="8" fill="#2a6fd1">верх — нечётные</text>'
         + '<text x="82" y="398" font-size="8" fill="#b4552a">низ — чётные</text>')

under = ""

# ═══════════════════════════════════════ 13. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v2 — всё на одной плате, светодиоды на крышке</text>
  <text x="30" y="62" font-size="14" fill="#666">Модули нарисованы и адресованы: ни одного «пунктира в никуда». Светодиоды сняты с макетки, компоненты подняты в верхний банк, мостов через разрез — 2 вместо 8.</text>'''

rules = '''<rect x="30" y="78" width="1190" height="66" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="99" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Правило шага:</tspan> между выводами любых двух деталей — минимум <tspan font-weight="700">одно свободное отверстие</tspan> (шаг колонок ≥ 2). Одна колонка = 5 отверстий = один узел.</text>
  <text x="46" y="117" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Верхний банк — только нечётные колонки, нижний — только чётные.</tspan> Номер колонки теперь однозначен: 25 бывает только сверху, 26 — только снизу.</text>
  <text x="46" y="135" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG в макетке. Тонкая линия с квадратом = провод, припаянный к площадке модуля. Пересечение без точки = провод лежит поверх.</text>'''

# ═══════════════════════════════════════ 14. ТАБЛИЦА
def build_table(y0):
    order = ["МОСТЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ", "МОДУЛИ", "ПАЙКА"]
    heads = {"МОСТЫ": "Мосты и связки земли",
             "ПИТАНИЕ": "Питание и земля на макетке",
             "АЦП": "Сигналы в АЦП — траншею НЕ пересекают",
             "СВЕТОДИОДЫ": "Светодиоды: резисторы на плате, сами LED — на крышке",
             "МОДУЛИ": "Выводы модулей — паяются к площадке, длина по месту",
             "ПАЙКА": "Паяные линии TP4056"}
    left, right = [], []
    for g in order:
        rows = [w for w in WIRES if w["group"] == g]
        if rows:
            (left if g in ("МОСТЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ")
             else right).append((heads[g], rows))

    def render(blocks, x0, y):
        out = []
        for head, rows in blocks:
            out.append(f'<text x="{x0}" y="{y}" font-size="12.5" font-weight="700" fill="#2a6fd1">{head}</text>')
            y += 18
            for r in rows:
                out.append(f'<rect x="{x0}" y="{y-8}" width="9" height="9" rx="2" fill="{r["color"]}"/>')
                out.append(f'<text x="{x0+16}" y="{y}" font-size="11.5" fill="#333">{r["name"]}</text>')
                out.append(f'<text x="{x0+640}" y="{y}" font-size="11.5" font-weight="700" fill="#555" text-anchor="end">{r["frm"]} → {r["to"]}</text>')
                out.append(f'<text x="{x0+740}" y="{y}" font-size="11.5" fill="#8a4b3f" text-anchor="end">{r["mm"]}</text>')
                y += 16
            y += 12
        return "".join(out), y

    a, ya = render(left, 40, y0 + 28)
    b, yb = render(right, 940, y0 + 28)
    hdr = (f'<text x="30" y="{y0}" font-size="17" font-weight="700" fill="#1a1a1a">'
           f'Список соединений — длина перемычек уже с запасом 14 мм на два загиба</text>')
    return hdr + a + b, max(ya, yb)

# ═══════════════════════════════════════ 15. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-")

TABLE_Y = 1090
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
notes = f'''<rect x="30" y="{NY}" width="1700" height="232" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">Почему мостов теперь два, а не восемь — ответ на вопрос «зачем по два плюса и минуса?»</text>
  <text x="46" y="{NY+48}" font-size="12.5" fill="#333">Рельсов четыре («+» LOAD, «−» верх, «+» ШИНА, «−» низ), и каждый разрезан посередине — отсюда и брались «по два плюса и минуса». Дублировал я их потому, что через 4 пружинных контакта одного моста шёл ВЕСЬ ток станции (пики WiFi ~0.5 А).</text>
  <text x="46" y="{NY+68}" font-size="12.5" fill="#2e7d32">В v2 потребители расставлены так, что силовой ток через разрез не идёт вообще: все выводы «+» ШИНА (кол. 22, 26, 30) и весь возврат модулей — на ЛЕВОЙ половине. Нижним рельсам мосты не нужны совсем.</text>
  <text x="46" y="{NY+88}" font-size="12.5" fill="#333">Остались: <tspan font-weight="700">1 мост «+» LOAD</tspan> (~75 мА — только Boost#1) и <tspan font-weight="700">1 мост «−» верх</tspan> (~100 мА — возвраты Boost#1, светодиодов и делителей). Для таких токов одиночного моста хватает с большим запасом.</text>
  <text x="46" y="{NY+108}" font-size="12.5" fill="#c0392b">Дублируется только то, где реально течёт весь ток: <tspan font-weight="700">две вертикальные связки «−» верх ↔ «−» низ</tspan> (колонки 21 и 24). Итого 4 провода через разрезы вместо девяти.</text>
  <text x="46" y="{NY+134}" font-size="12.5" fill="#8e44ad">⚠  <tspan font-weight="700">«−» пакета — только на пад B− TP4056, мимо макетки.</tspan> На общий «−» рельс нельзя: отключится защита DW01.</text>
  <text x="46" y="{NY+154}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя батареи (23a) — свой провод с холдера, НЕ с колонки 44.</tspan> Иначе TP4056 держит 4.2–4.5 В без банки и подделывает напряжение батареи.</text>
  <text x="46" y="{NY+174}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">PPTC на место F1 (42j–44j) — первым делом.</tspan> Сейчас там перемычка: цепь батареи без защиты. Закрывать корпус с перемычкой нельзя.</text>
  <text x="46" y="{NY+196}" font-size="12.5" fill="#1a1a1a">Делители не менялись: <tspan font-weight="700">батарея кол. 23–25–27</tspan> = 100k / 100k → ×2.0 (BATTERY_DIVIDER_RATIO); <tspan font-weight="700">датчик кол. 51–53–55–57</tspan> = (10k + 5k = 15k) верхнее плечо / 10k нижнее → ×2.5 (SIGNAL_DIVIDER_RATIO). Прошивку править не нужно.</text>
  <text x="46" y="{NY+218}" font-size="12.5" fill="#2e7d32">✓  Порядок: 1) PPTC · 2) верхний банк · 3) нижний банк · 4) 2 моста + 2 связки · 5) модули по одному с прозвонкой · 6) светодиоды на крышку · 7) ШИНА 4.6–4.8 В · 8) wiggle-тест.</text>'''

VH = NY + 252
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W_CANVAS} {VH}" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c, r4c)}
  <rect x="0" y="0" width="{W_CANVAS}" height="{VH}" fill="#ffffff"/>
  {title}
  {rules}
  {board}
  {mask}
  {ruler}
  {split_marks}
  {bridges}
  {comps_top}
  {comps_bot}
  {comps_lbl}
  {esp}
  {gpio_wires}
  {adc_wires}
  {rail_jmp}
  {led_out}
  {panel}
  {led_cath}
  {mods}
  {leads}
  {sensor}
  {sensor_leads}
  {note_stdby}
  {chrg}
  {under}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_v2.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
