# -*- coding: utf-8 -*-
"""СХЕМА v3 — МОДУЛИ СТОЯТ НА МАКЕТКЕ.

Отличие от v2: TP4056 и оба Mini Boost MT3608 больше НЕ отдельные карточки
с проводами «куда-то вбок». Они впаяны в гребёнку 2.54 мм (та, что в наборе)
и вставлены В МАКЕТКУ поперёк траншеи — как микросхема в DIP-панельку.

Почему это вообще возможно:
  колонка = 5 отверстий = ОДИН узел, но верхний банк (a–e) и нижний (f–j)
  разделены траншеей. Модуль стоит поперёк: верхний ряд площадок попадает
  в верхний банк, нижний — в нижний. Две площадки в ОДНОЙ колонке —
  это РАЗНЫЕ узлы, короткого замыкания нет.

Правило «через одну» ОТМЕНЕНО для пинов модулей (шаг площадок задаёт сам
модуль — 2.54 мм, соседние колонки это норма). Для рассыпухи и посадок
на рельсы правило сохранено.

Резисторы 220 Ω переехали на крышку (в разрыв анода каждого светодиода,
под термоусадку) — это освободило 15 колонок под модули.
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

# ─────────────────────────────────────── провод от внешнего модуля (паяный/пигтейл)
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

# ═══════════════════════════════════════ 1. МОСТЫ + ВЕРТИКАЛЬНЫЕ СВЯЗКИ
def bridge(y_rail, c1, c2, y_arch, color, name, note=""):
    x1, x2 = X(c1), X(c2)
    return jmp([(x1, y_rail), (x1, y_arch), (x2, y_arch), (x2, y_rail)],
               color, name, f"кол. {c1} (лево)", f"кол. {c2} (право)", "МОСТЫ",
               w=3.0, note=note)

def link(col, name, note=""):
    x = X(col)
    return jmp([(x, RAIL_TM), (x+9, RAIL_TM+18), (x+9, RAIL_BM-18), (x, RAIL_BM)],
               GND, name, "«−» верх", "«−» низ", "МОСТЫ", w=3.2, note=note)

bridges = (
    # три вложенные дуги: широкая выше, узкая ниже — не пересекаются
    bridge(RAIL_TM, 28, 41, 218, GND, "мост «−» верх #1 (28↔41)",
           note="здесь идёт ВЕСЬ обратный ток левой половины — потому и два") +
    bridge(RAIL_TP, 29, 37, 228, PLUS, "мост «+» LOAD — единственный (29↔37)",
           note="~75 мА: только Boost#1 (датчик)") +
    bridge(RAIL_TM, 31, 35, 238, GND, "мост «−» верх #2 (31↔35)",
           note="дублёр моста #1") +
    link(21, "связка земли #1 (кол. 21)",
         note="«−» верх ↔ «−» низ на левой половине") +
    link(52, "связка земли #2 (кол. 52)",
         note="«−» верх ↔ «−» низ на правой, между двумя бустами"))

split_marks = f'''<line x1="{CUT}" y1="238" x2="{CUT}" y2="276" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <line x1="{CUT}" y1="494" x2="{CUT}" y2="536" stroke="#c0392b" stroke-width="1.6" stroke-dasharray="3 3"/>
  <text x="598" y="546" font-size="9.5" font-weight="700" fill="#c0392b" text-anchor="end">разрез рельсов →</text>'''

# ═══════════════════════════════════════ 2. ПОЛОСЫ РАЗВОДКИ НАД ПЛАТОЙ
LEDLANE   = [154, 161, 168, 175, 182]   # аноды светодиодов → крышка
CATH_LANE = 189                          # общий катод с крышки → «−» верх
SENSOR_LANE = 196                        # жёлтый датчика → 27a
SENSE_LANE  = 203                        # «+» холдера (сенсорный) → 21a
CHRG_LANE   = 210                        # CHRG TP4056 → GPIO13
LANE = {"g32": 272, "g34": 282}
TRENCH_LANE = 397                        # проводка по дну траншеи (между банками)
LOW_A, LOW_B = 488, 500                  # две полосы под нижним банком

# ═══════════════════════════════════════ 3. ВЕРХНИЙ БАНК — СИГНАЛЫ (нечёт.)
B100K = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#e8873a", "#7a4a12"]
B10K  = ["#7a4a12", "#1a1a1a", "#1a1a1a", "#c00",     "#7a4a12"]
B5K   = ["#2e8b3d", "#1a1a1a", "#1a1a1a", "#7a4a12", "#7a4a12"]

comps_top = (
    bb.cap_ceramic(17, 19, "c", label="C2 100нФ") +
    # делитель батареи 100k/100k → GPIO32   (21 — вход, 23 — узел, 25 — земля)
    bb.resistor(21, 23, "c", B100K, label="") +
    bb.resistor(23, 25, "c", B100K, label="") +
    bb.cap_ceramic(23, 25, "e", label="") +
    # делитель датчика (10k+5k)/10k → GPIO34 (27 — вход, 31 — узел, 33 — земля)
    bb.resistor(27, 29, "c", B10K, label="") +
    bb.resistor(29, 31, "c", B5K,  label="") +
    bb.resistor(31, 33, "c", B10K, label="") +
    bb.cap_ceramic(31, 33, "e", label=""))

def lbl(x, y, text, w, fill=bb.COPPER, size=10, weight="700", anchor="middle"):
    x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
    return (f'<rect x="{x0:.0f}" y="{y-10}" width="{w}" height="13" fill="#fff" opacity="0.92"/>'
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}">{text}</text>')

comps_lbl = (
    lbl(445, 352, "100k", 34, size=9.5) + lbl(479, 352, "100k", 34, size=9.5) +
    lbl(547, 352, "10k", 30, size=9.5) + lbl(581, 352, "5k", 26, size=9.5) +
    lbl(615, 352, "10k", 30, size=9.5) +
    lbl(X(25) + 14, 374, "C5", 22, size=9, anchor="start") +
    lbl(X(33) + 14, 374, "C3", 22, size=9, anchor="start") +
    lbl(455, 322, "делитель ×2.0 → GPIO32", 128, fill="#c47015", size=9) +
    lbl(601, 322, "делитель ×2.5 → GPIO34", 128, fill="#c47015", size=9))

# ═══════════════════════════════════════ 4. НИЖНИЙ БАНК — ПИТАНИЕ (чёт.)
comps_bot = (
    bb.diode_schottky(18, 22, "h", "D1 · 1N5819", cathode="right") +
    bb.cap_electrolytic(24, 26, "j", "1000µF") +
    bb.diode_schottky(28, 32, "h", "D2 · 1N5819", cathode="left") +
    bb.ptc(34, 36, "j", "") +
    f'<text x="{(X(34)+X(36))/2:.0f}" y="418" font-size="9" font-weight="700" '
    f'fill="{bb.COPPER}" text-anchor="middle">F1 · PTC ≥2A</text>')

# ═══════════════════════════════════════ 5. МОДУЛИ, СТОЯЩИЕ НА ПЛАТЕ
# TP4056: корпус 26 × 17 мм, площадки двумя рядами 12.7 мм, ряды 15.24 мм (b↔f).
# Развёрнут «ногами вниз»: четвёрка OUT−/B−/OUT+/B+ смотрит в нижний банк,
# где свободны ряды i и j. Пара IN−/IN+ — в верхнем банке (под корпусом).
tp4056 = bb.mod_inline(
    39, 44, "b", "f",
    [(39, "b", "IN−", GND,   -10), (44, "b", "IN+", PLUS, -10),
     (39, "f", "OUT−", GND,   14), (40, "f", "B−",  PURPLE, 26),
     (43, "f", "OUT+", PLUS,  14), (44, "f", "B+",  PLUS,   26)],
    "TP4056 · Type-C", "заряд + защита DW01",
    over_x=14, over_y=38, title_y=384, sub_y=395)

boost2 = bb.mod_inline(
    47, 51, "c", "h",
    [(47, "c", "IN+", PLUS, -11), (50, "c", "IN−", GND, -11),
     (49, "h", "OUT−", GND, -11), (51, "h", "OUT+", PLUS, -23)],
    "Boost#2", "5.14 В от батареи",
    over_x=4, over_y=17, title_y=384, sub_y=395)

boost1 = bb.mod_inline(
    54, 58, "c", "h",
    [(54, "c", "IN+", PLUS, -11), (57, "c", "IN−", GND, -11),
     (56, "h", "OUT−", GND, -11), (58, "h", "OUT+", PLUS, -23)],
    "Boost#1", "12 В для датчика",
    over_x=4, over_y=17, title_y=384, sub_y=395)

mods_inline = tp4056 + boost2 + boost1

# ═══════════════════════════════════════ 6. ПЕРЕМЫЧКИ НА РЕЛЬСЫ
RAIL_NAME = {RAIL_BP: "«+» ШИНА", RAIL_BM: "«−» низ",
             RAIL_TP: "«+» LOAD", RAIL_TM: "«−» верх"}

def to_rail(col, row, rail_y, color, name, group, note=""):
    x, y = H(col, row)
    return jmp([(x, y), (x, rail_y)], color, name, f"{col}{row}",
               RAIL_NAME[rail_y], group, note=note)

UNDER = "заводится ДО посадки модуля — отверстие под корпусом"

rail_jmp = (
    to_rail(1,  "a", RAIL_TP, PLUS, "ESP32 VIN → «+» LOAD",     "ПИТАНИЕ") +
    to_rail(2,  "a", RAIL_TM, GND,  "ESP32 GND → «−» верх",     "ПИТАНИЕ") +
    to_rail(17, "a", RAIL_TP, PLUS, "C2 → «+» LOAD",            "ПИТАНИЕ") +
    to_rail(19, "a", RAIL_TM, GND,  "C2 → «−» верх",            "ПИТАНИЕ") +
    to_rail(25, "a", RAIL_TM, GND,  "низ делителя батареи",     "АЦП") +
    to_rail(33, "a", RAIL_TM, GND,  "низ делителя датчика",     "АЦП") +
    to_rail(22, "j", RAIL_BP, PLUS, "D1 катод → «+» ШИНА",      "ПИТАНИЕ") +
    to_rail(24, "j", RAIL_BP, PLUS, "C1 «+» → «+» ШИНА",        "ПИТАНИЕ") +
    to_rail(26, "j", RAIL_BM, GND,  "C1 «−» → «−» низ",         "ПИТАНИЕ") +
    to_rail(28, "j", RAIL_BP, PLUS, "D2 катод → «+» ШИНА",      "ПИТАНИЕ") +
    # ── модули на плате ──────────────────────────────────────────
    to_rail(39, "a", RAIL_TM, GND,  "TP4056 IN− → «−» верх",    "МОДУЛИ НА ПЛАТЕ",
            note=UNDER) +
    to_rail(39, "j", RAIL_BM, GND,  "TP4056 OUT− → «−» низ",    "МОДУЛИ НА ПЛАТЕ") +
    to_rail(50, "a", RAIL_TM, GND,  "Boost#2 IN− → «−» верх",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(49, "j", RAIL_BM, GND,  "Boost#2 OUT− → «−» низ",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(54, "a", RAIL_TP, PLUS, "Boost#1 IN+ → «+» LOAD",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(57, "a", RAIL_TM, GND,  "Boost#1 IN− → «−» верх",   "МОДУЛИ НА ПЛАТЕ") +
    to_rail(56, "j", RAIL_BM, GND,  "Boost#1 OUT− → «−» низ",   "МОДУЛИ НА ПЛАТЕ"))

# ═══════════════════════════════════════ 7. ПЕРЕМЫЧКИ МЕЖДУ УЗЛАМИ
GAP = (X(45) + X(46)) / 2.0   # свободный «коридор» между колонками 45 и 46

board_jmp = (
    # по дну траншеи и дальше под корпусом TP4056 — оттого и «вслепую»
    jmp([H(18, "f"), (X(18), TRENCH_LANE), (X(44), TRENCH_LANE), H(44, "c")], PLUS,
        "+5 В адаптера → TP4056 IN+", "18f", "44c", "МОДУЛИ НА ПЛАТЕ",
        note=UNDER) +
    # в обход обоих корпусов: коридор между колонками 45 и 46
    jmp([H(43, "i"), (X(43), 470), (GAP, 470), (GAP, 290), (X(47), 290), H(47, "a")],
        PLUS, "TP4056 OUT+ → Boost#2 IN+", "43i", "47a", "МОДУЛИ НА ПЛАТЕ",
        note="один узел: выход зарядника = вход буста") +
    jmp([H(36, "j"), (X(36), LOW_A), (X(44), LOW_A), H(44, "j")], PLUS,
        "F1 (после PTC) → TP4056 B+", "36j", "44j", "МОДУЛИ НА ПЛАТЕ",
        note="защищённый «+» батареи") +
    jmp([H(51, "j"), (X(51), LOW_B), (X(32), LOW_B), H(32, "j")], PLUS,
        "Boost#2 OUT+ → анод D2", "51j", "32j", "МОДУЛИ НА ПЛАТЕ"))

# ═══════════════════════════════════════ 8. GPIO → АЦП, GPIO → КРЫШКА
def lane_wire(gpio_col, col, lane, color, name, group):
    x1, x2 = X(gpio_col), X(col)
    return jmp([(x1, 298), (x1, lane), (x2, lane), (x2, 298)], color, name,
               f"{gpio_col}a", f"{col}a", group, w=2.4)

adc_wires = (
    lane_wire(10, 23, LANE["g32"], SIG,
              "узел делителя батареи (23) → GPIO32", "АЦП") +
    lane_wire(12, 31, LANE["g34"], SIG,
              "узел делителя датчика (31) → GPIO34", "АЦП"))

#        GPIO кол.  цвет         обводка    имя цвета  смысл
LEDS = [("14", 5, "#c62828",  "#7d1a1a", "красный", "ветер &gt;15 м/с"),
        ("27", 6, "#f2c21a",  "#a6821a", "жёлтый",  "ветер &gt;5 м/с"),
        ("26", 7, bb.LED_G,   "#1c7a2e", "зелёный", "станция ОК"),
        ("25", 8, bb.LED_WIFI,"#16407a", "синий",   "WiFi есть"),
        ("33", 9, "#e23b2e",  "#8f1f16", "красный", "ошибка АЦП")]

PANEL_X, PANEL_Y, PW, PH = 1250, 148, 480, 260

led_out = "".join(
    jmp([(X(c), 298), (X(c), LEDLANE[i]), (PANEL_X, LEDLANE[i])], col,
        f"GPIO{g} → крышка (резистор 220 Ω там же)", f"{c}a", "крышка",
        "СВЕТОДИОДЫ", w=2.4, dots="start", cut="по месту")
    for i, (g, c, col, _, cn, _) in enumerate(LEDS))

led_cath = jmp([(PANEL_X, 292), (1232, 292), (1232, CATH_LANE),
                (X(43), CATH_LANE), (X(43), RAIL_TM)], GND,
               "общий катод 5 светодиодов → «−» верх", "крышка", "«−» верх",
               "СВЕТОДИОДЫ", w=2.8, dots="end", cut="по месту")

# ═══════════════════════════════════════ 9. ВНЕШНИЕ МОДУЛИ (под платой)
mods_ext = (
    bb.mod_usb_c(120, 600, 180, 152,
                 [(175, "+5В", PLUS), (245, "GND", GND)],
                 subtitle="панельный разъём · пигтейл") +
    bb.switch_rocker(760, 620, 220, 100,
                     [(772, 652, "ШИНА"), (772, 688, "LOAD")],
                     title="SW1", subtitle="общий выключатель") +
    bb.battery_pack(120, 790))

leads = (
    # ── адаптер 5 В ─────────────────────────────────────────────
    mlead([(175, 600), (175, 560), (X(18), 560), H(18, "j")], PLUS,
          "адаптер «+5В» → 18j (анод D1)", "адаптер +5В", "18j", "МОДУЛИ") +
    mlead([(245, 600), (245, 580), (X(46), 580), (X(46), RAIL_BM)], GND,
          "адаптер GND → «−» низ, кол. 46", "адаптер GND", "«−» низ", "МОДУЛИ",
          note="специально в ПРАВУЮ половину: ток заряда 1 А не идёт через мосты") +
    # ── TP4056 «−» батареи — отдельная сеть ─────────────────────
    mlead([H(40, "i"), (X(40), 556), (96, 556), (96, 948), (187, 948)], PURPLE,
          "TP4056 B− → «−» пакета (отдельная сеть!)",
          "40i", "«−» пакета", "МОДУЛИ", both_sq=True,
          note="НЕ на общий «−» рельс — иначе отключится защита DW01") +
    # ── батарейный пакет ────────────────────────────────────────
    mlead([(573, 878), (1000, 878), (1000, 548), (X(34), 548), H(34, "j")], PLUS,
          "«+» пакета → F1 (34j)", "«+» пакета", "34j", "МОДУЛИ") +
    mlead([(573, 948), (573, 1012), (16, 1012), (16, SENSE_LANE),
           (X(21), SENSE_LANE), (X(21), 298)], PLUS,
          "«+» холдера → верх делителя (21a) — ОТДЕЛЬНЫЙ сенсорный провод",
          "«+» холдера", "21a", "МОДУЛИ",
          note="не с кол. 34! иначе TP4056 подделывает напряжение батареи") +
    # ── выключатель ─────────────────────────────────────────────
    mlead([(772, 652), (740, 652), (740, 566), (X(12), 566), (X(12), RAIL_BP)], PLUS,
          "SW1 ← «+» ШИНА", "SW1 (вход)", "«+» ШИНА", "МОДУЛИ") +
    mlead([(772, 688), (725, 688), (725, 576), (30, 576), (30, 224),
           (X(4), 224), (X(4), RAIL_TP)], PLUS,
          "SW1 → «+» LOAD", "SW1 (выход)", "«+» LOAD", "МОДУЛИ",
          note="садится на ЛЕВУЮ половину — весь ток ESP32 минуя разрез"))

# ═══════════════════════════════════════ 10. ДАТЧИК
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
           (X(27), SENSOR_LANE), (X(27), 298)], TEAL,
          "датчик жёлтый → 27a (верх делителя)",
          "датчик жёлтый", "27a", "МОДУЛИ") +
    mlead([(1370, 525), (1120, 525), (1120, 596), (X(42), 596), (X(42), RAIL_BM)],
          GND, "датчик чёрный → «−» низ, кол. 42",
          "датчик чёрный", "«−» низ", "МОДУЛИ",
          note="общая точка отсчёта для АЦП") +
    mlead([(1370, 550), (1150, 550), (1150, 564), (X(58), 564), H(58, "j")], PLUS,
          "датчик красный (+12 В) → 58j (выход Boost#1)",
          "датчик красный", "58j", "МОДУЛИ"))

# ═══════════════════════════════════════ 11. КРЫШКА КОРПУСА
panel = ['<text x="%d" y="126" font-size="15" font-weight="700" fill="#1a1a1a">'
         'Крышка корпуса · 5 светодиодов + их резисторы</text>' % PANEL_X,
         '<text x="%d" y="143" font-size="10.5" fill="#777">'
         '220 Ω теперь ЗДЕСЬ — в разрыв анода, под термоусадку. На плате их нет.</text>' % PANEL_X,
         f'<rect x="{PANEL_X}" y="{PANEL_Y}" width="{PW}" height="{PH}" rx="12" '
         f'fill="#2b2b30" stroke="#15161a" stroke-width="2"/>']
LX = [PANEL_X + 66 + i * 86 for i in range(5)]
for i, (g, c, col, stroke, cn, meaning) in enumerate(LEDS):
    lx = LX[i]
    panel.append(f'<path d="M{PANEL_X} {LEDLANE[i]} L{lx} {LEDLANE[i]} L{lx} 213" '
                 f'fill="none" stroke="{col}" stroke-width="2.4" stroke-linejoin="round"/>')
    # резистор 220 Ω в разрыве анода
    panel.append(f'<rect x="{lx-7}" y="{213}" width="14" height="22" rx="3" '
                 f'fill="{bb.RES_BODY}" stroke="{bb.RES_LEG}"/>')
    panel.append(f'<rect x="{lx-7}" y="{218}" width="14" height="2.4" fill="#c00"/>'
                 f'<rect x="{lx-7}" y="{223}" width="14" height="2.4" fill="#c00"/>'
                 f'<rect x="{lx-7}" y="{228}" width="14" height="2.4" fill="#1a1a1a"/>')
    panel.append(f'<line x1="{lx}" y1="235" x2="{lx}" y2="243" stroke="{col}" stroke-width="2.4"/>')
    panel.append(f'<circle cx="{lx}" cy="254" r="11" fill="{col}" stroke="{stroke}" stroke-width="2"/>')
    panel.append(f'<line x1="{lx}" y1="265" x2="{lx}" y2="292" stroke="{GND}" stroke-width="2.4"/>')
    panel.append(f'<text x="{lx}" y="316" font-size="10" font-weight="700" fill="#f2f2f2" text-anchor="middle">GPIO{g}</text>')
    panel.append(f'<text x="{lx}" y="330" font-size="8.5" fill="#9aa" text-anchor="middle">{cn}</text>')
    panel.append(f'<text x="{lx}" y="342" font-size="8.5" fill="#9aa" text-anchor="middle">{meaning}</text>')
panel.append(f'<path d="M{LX[4]} 292 L{PANEL_X} 292" stroke="{GND}" stroke-width="3.4" fill="none"/>')
panel.append(f'<text x="{PANEL_X+20}" y="376" font-size="10.5" fill="#cfd2d8">'
             f'6 проводов до платы: 5 анодов + <tspan font-weight="700">один общий катод</tspan>. '
             f'Резисторы — на крышке.</text>')
panel.append(f'<text x="{PANEL_X+20}" y="394" font-size="10" fill="#8c9099">'
             f'Так с платы ушли 15 колонок — ровно те, куда встали модули.</text>')
panel = "".join(panel)

# ═══════════════════════════════════════ 12. ВРЕЗКА STDBY
NX, NYb = 1250, 620
note_stdby = f'''<rect x="{NX}" y="{NYb}" width="480" height="172" rx="10" fill="#fff6f4" stroke="#e0a79c" stroke-width="2"/>
  <text x="{NX+16}" y="{NYb+24}" font-size="13" font-weight="700" fill="#c0392b">⚠ STDBY: GPIO19 может быть недоступен</text>
  <text x="{NX+16}" y="{NYb+45}" font-size="10.5" fill="#5a4340">Плата DevKit V1 шириной 25.4 мм закрывает свои колонки — свободен</text>
  <text x="{NX+16}" y="{NYb+59}" font-size="10.5" fill="#5a4340">только один ряд. Если это ряд <tspan font-weight="700">a</tspan>, нижние пины (3V3, 19, 21…)</text>
  <text x="{NX+16}" y="{NYb+73}" font-size="10.5" fill="#5a4340">в отверстие не выведены. <tspan font-weight="700">Проверь на живой плате.</tspan></text>
  <text x="{NX+16}" y="{NYb+97}" font-size="11" font-weight="700" fill="#1a1a1a">Запасной вариант — GPIO35:</text>
  <text x="{NX+16}" y="{NYb+113}" font-size="10.5" fill="#333">канала направления у нового датчика нет, 35 свободен. Но он</text>
  <text x="{NX+16}" y="{NYb+127}" font-size="10.5" fill="#333">input-only без подтяжки → делитель 10k (LOAD) / 20k (GND):</text>
  <text x="{NX+16}" y="{NYb+143}" font-size="10.5" fill="#2e7d32">покой 4.7×20/30 = <tspan font-weight="700">3.13 В</tspan> при Vih 2.48 В, ток стока 0.47 мА.</text>
  <text x="{NX+16}" y="{NYb+161}" font-size="10.5" fill="#c0392b">Прошивка: PIN_STDBY 19→35, режим INPUT (не INPUT_PULLUP).</text>'''

chrg = (mlead([(X(42), 300), (X(42), CHRG_LANE), (X(3), CHRG_LANE), (X(3), 298)],
              "#2a7de1", "TP4056 CHRG (катод красного LED) → GPIO13",
              "пайка на TP4056", "3a", "ПАЙКА", w=2.4) +
        f'<text x="{X(42)+8}" y="{CHRG_LANE-6}" font-size="9.5" font-weight="700" fill="#2a7de1">'
        f'CHRG → GPIO13 · пайка к катоду красного светодиода на самом TP4056</text>')

# ═══════════════════════════════════════ 13. ВРЕЗКА «КАК СТАВИТСЯ МОДУЛЬ»
JX, JY = 1250, 812
jig = f'''<rect x="{JX}" y="{JY}" width="480" height="248" rx="10" fill="#f2f8f3" stroke="#a8ccae" stroke-width="2"/>
  <text x="{JX+16}" y="{JY+24}" font-size="13" font-weight="700" fill="#1f6b2c">Как впаять гребёнку: макетка = кондуктор</text>
  <text x="{JX+16}" y="{JY+46}" font-size="10.5" fill="#2f4a33">1. Отломи от линейки нужные штырьки и <tspan font-weight="700">вставь их в макетку</tspan></text>
  <text x="{JX+16}" y="{JY+60}" font-size="10.5" fill="#2f4a33">   в те самые колонки, что указаны на схеме — длинным концом вниз,</text>
  <text x="{JX+16}" y="{JY+74}" font-size="10.5" fill="#2f4a33">   пластиковой юбкой вверх (юбка станет опорой модуля).</text>
  <text x="{JX+16}" y="{JY+94}" font-size="10.5" fill="#2f4a33">2. Положи модуль сверху так, чтобы штырьки вошли в его отверстия.</text>
  <text x="{JX+16}" y="{JY+108}" font-size="10.5" fill="#2f4a33">   Макетка держит шаг 2.54 мм за тебя — перекоса не будет.</text>
  <text x="{JX+16}" y="{JY+128}" font-size="10.5" fill="#2f4a33">3. Паяй сверху, по одной площадке. У буста площадки НЕ на сетке —</text>
  <text x="{JX+16}" y="{JY+142}" font-size="10.5" fill="#2f4a33">   штырёк подгибается на ~1 мм, это норма (отверстие 1 мм даёт люфт).</text>
  <text x="{JX+16}" y="{JY+162}" font-size="10.5" fill="#c0392b">4. <tspan font-weight="700">Прозвони</tspan> каждый штырёк на «свою» площадку и на соседнюю:</text>
  <text x="{JX+16}" y="{JY+176}" font-size="10.5" fill="#c0392b">   на свою — 0 Ω, на соседнюю — обрыв. Только потом ставь в плату.</text>
  <text x="{JX+16}" y="{JY+198}" font-size="10.5" fill="#1f6b2c">Модуль встаёт на 4–5 мм над платой: провода в его колонках лежат</text>
  <text x="{JX+16}" y="{JY+212}" font-size="10.5" fill="#1f6b2c">плашмя под корпусом и выходят вбок. Их вставляют ДО посадки модуля.</text>
  <text x="{JX+16}" y="{JY+234}" font-size="10.5" fill="#7a4a12">«Слепых» отверстий всего два — <tspan font-weight="700">39a</tspan> и <tspan font-weight="700">44c</tspan> (оба у TP4056). Остальные концы —</text>
  <text x="{JX+16}" y="{JY+246}" font-size="10.5" fill="#7a4a12">в открытых рядах a / i / j: доступны и после посадки модулей.</text>'''

# ═══════════════════════════════════════ 14. ESP32 + ЛИНЕЙКА КОЛОНОК
esp = bb.esp32(subtitle="v3 · модули стоят на плате",
               highlight=["VIN", "32", "34"], usb_label="")

mask = "".join(f'<rect x="{x-11}" y="276" width="22" height="14" fill="{bb.BOARD_FILL}"/>'
               for x in (411, 496, 581, 666, 751, 836, 921, 1006))
TOPC = [17, 19, 21, 23, 25, 27, 29, 31, 33]
BOTC = [18, 22, 24, 26, 28, 32, 34, 36]
FREEC = [45, 52]
ruler = ('<g font-size="9" font-weight="700" text-anchor="middle">'
         + "".join(f'<text x="{X(c)}" y="389" fill="#2a6fd1">{c}</text>' for c in TOPC)
         + "".join(f'<text x="{X(c)}" y="389" fill="#b4552a">{c}</text>' for c in BOTC)
         + "".join(f'<text x="{X(c)}" y="389" fill="#9b9382">{c}</text>' for c in FREEC)
         + '</g>'
         + '<text x="82" y="384" font-size="8" fill="#2a6fd1">верх — нечётные</text>'
         + '<text x="82" y="394" font-size="8" fill="#b4552a">низ — чётные</text>')

# ═══════════════════════════════════════ 15. ЗАГОЛОВОК / ПРАВИЛА
title = '''<text x="30" y="38" font-size="25" font-weight="700" fill="#1a1a1a">Схема v3 — TP4056 и оба буста стоят НА макетке</text>
  <text x="30" y="62" font-size="14" fill="#666">Модули впаяны в гребёнку 2.54 мм из набора и вставлены в плату поперёк траншеи. Сбоку остались только разъём, батарея, выключатель, датчик и крышка.</text>'''

rules = '''<rect x="30" y="70" width="1190" height="78" rx="8" fill="#f6f8fb" stroke="#ccd6e4"/>
  <text x="46" y="91" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Почему модуль можно воткнуть в плату:</tspan> он стоит <tspan font-weight="700">поперёк траншеи</tspan> — верхний ряд площадок в банке a–e, нижний в банке f–j. Две площадки в одной колонке — <tspan font-weight="700">разные узлы</tspan>, замыкания нет.</text>
  <text x="46" y="109" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Правило «через одну» отменено для пинов модулей</tspan> — шаг задаёт сам модуль (2.54 мм), соседние колонки это норма. Для рассыпухи и для посадок на рельсы правило сохранено: шаг ≥ 2.</text>
  <text x="46" y="127" font-size="12.5" fill="#1a1a1a"><tspan font-weight="700">Верхний банк — нечётные колонки, нижний — чётные</tspan> (кроме зоны модулей 39–58, где номер колонки диктует модуль). Резисторы 220 Ω уехали на крышку — это и освободило место.</text>
  <text x="46" y="144" font-size="12" fill="#555">Толстая линия с точками = жёсткая перемычка 22 AWG. Тонкая с квадратом = внешний провод. Пересечение без точки = провод лежит поверх. Тёмный прямоугольник = корпус модуля.</text>'''

# ═══════════════════════════════════════ 16. ТАБЛИЦА
def build_table(y0):
    order = ["МОСТЫ", "ПИТАНИЕ", "АЦП", "СВЕТОДИОДЫ", "МОДУЛИ НА ПЛАТЕ", "МОДУЛИ", "ПАЙКА"]
    heads = {"МОСТЫ": "Мосты через разрез и связки земли — всего 3 провода через разрез",
             "ПИТАНИЕ": "Питание и земля на макетке",
             "АЦП": "Сигналы в АЦП — траншею НЕ пересекают",
             "СВЕТОДИОДЫ": "Светодиоды: и LED, и резисторы 220 Ω — на крышке",
             "МОДУЛИ НА ПЛАТЕ": "TP4056 и бусты: перемычки к их колонкам",
             "МОДУЛИ": "Внешние: разъём, батарея, выключатель, датчик",
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

# ═══════════════════════════════════════ 17. СБОРКА
board, r3c, r4c = bb.breadboard(bottom="+-")

TABLE_Y = 1120
table_svg, table_end = build_table(TABLE_Y)
NY = int(table_end) + 16
notes = f'''<rect x="30" y="{NY}" width="1700" height="252" rx="8" fill="#fbf7ec" stroke="#e6d9b0"/>
  <text x="46" y="{NY+26}" font-size="13.5" font-weight="700" fill="#1a1a1a">Что изменилось против v2 и почему это держится</text>
  <text x="46" y="{NY+48}" font-size="12.5" fill="#333">Три модуля заняли колонки <tspan font-weight="700">39–44</tspan> (TP4056), <tspan font-weight="700">47–51</tspan> (Boost#2) и <tspan font-weight="700">54–58</tspan> (Boost#1). Место под них освободили резисторы 220 Ω: они переехали на крышку, в разрыв анода каждого светодиода под термоусадку — электрически это тот же самый резистор в той же цепи.</text>
  <text x="46" y="{NY+68}" font-size="12.5" fill="#2e7d32">Модуль сидит на гребёнке в <tspan font-weight="700">обоих банках сразу</tspan>: TP4056 — ряды b и f, бусты — ряды c и h. Никакой пайки «провод к площадке» больше нет — есть штырёк в отверстии, который можно вынуть и переставить.</text>
  <text x="46" y="{NY+88}" font-size="12.5" fill="#333">Через разрез идут <tspan font-weight="700">3 провода</tspan> (в v1 — 9, в v2 — 4): два моста «−» верх 28↔41 и 31↔35 (весь обратный ток левой половины) и один мост «+» LOAD 29↔37 (только Boost#1, ~75 мА). У нижних рельсов мостов нет — их половины связаны вертикалями кол. 21 и 52.</text>
  <text x="46" y="{NY+108}" font-size="12.5" fill="#2e7d32">GND адаптера намеренно посажен в <tspan font-weight="700">правую</tspan> половину «−» низ (кол. 46): ток заряда до 1 А замыкается через связку кол. 52, а не через мосты.</text>
  <text x="46" y="{NY+134}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Ориентацию площадок сверь с шелкографией на своих модулях до пайки.</tspan> Схема нарисована по фото: у TP4056 пара IN−/IN+ смотрит вверх, четвёрка OUT−/B−/OUT+/B+ — вниз; у MT3608 сторона с перемычками A/B — это ВЫХОД. Перепутаешь вход и выход буста — модуль сгорит.</text>
  <text x="46" y="{NY+154}" font-size="12.5" fill="#8e44ad">⚠  <tspan font-weight="700">«−» пакета — только на площадку B− (кол. 40, ряд f), мимо общего рельса.</tspan> На «−» рельс нельзя: отключится защита DW01.</text>
  <text x="46" y="{NY+174}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">Верх делителя батареи (21a) — свой провод с холдера, НЕ с колонки 34.</tspan> Иначе TP4056 держит 4.2–4.5 В без банки и подделывает напряжение батареи.</text>
  <text x="46" y="{NY+194}" font-size="12.5" fill="#c0392b">⚠  <tspan font-weight="700">PPTC на место F1 (34j–36j) — первым делом.</tspan> Сейчас там перемычка: цепь батареи без защиты. Закрывать корпус с перемычкой нельзя.</text>
  <text x="46" y="{NY+216}" font-size="12.5" fill="#1a1a1a">Делители не менялись: <tspan font-weight="700">батарея кол. 21–23–25</tspan> = 100k / 100k → ×2.0 (BATTERY_DIVIDER_RATIO); <tspan font-weight="700">датчик кол. 27–29–31–33</tspan> = (10k + 5k = 15k) верхнее плечо / 10k нижнее → ×2.5 (SIGNAL_DIVIDER_RATIO). Прошивку править не нужно.</text>
  <text x="46" y="{NY+238}" font-size="12.5" fill="#2e7d32">✓  Порядок: 1) PPTC · 2) гребёнки на трёх модулях + прозвонка · 3) рассыпуха верх/низ · 4) 3 моста + 2 связки · 5) «слепые» провода в 39a и 44c · 6) посадка модулей · 7) внешние провода · 8) ШИНА 4.6–4.8 В · 9) wiggle-тест.</text>'''

VH = NY + 272
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
  {adc_wires}
  {rail_jmp}
  {board_jmp}
  {mods_inline}
  {led_out}
  {panel}
  {led_cath}
  {mods_ext}
  {leads}
  {sensor}
  {sensor_leads}
  {note_stdby}
  {jig}
  {chrg}
  {table_svg}
  {notes}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "wiring_v3.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes;", len(WIRES), "wires; viewBox", W_CANVAS, "x", VH)
