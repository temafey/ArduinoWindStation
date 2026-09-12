# -*- coding: utf-8 -*-
"""КАК ПИТАЕТСЯ «+» ШИНА · схема v8 (плата 38-pin, ESP32 DevKitC на модуле ESP-32U).

Картинка для wiring-v8-2.html. Заменила собой прежнюю «куда тыкать щупом»: точки замера
перечислены в таблицах страницы, а вот путь питания словами не передаётся — его надо
видеть целиком, от розетки до пина «5V».

Что здесь нарисовано и, главное, чего нет:

  * НЕТ БАНОК. Ни батарейного холдера, ни электролитов C1/C4. Они не участвуют в переносе
    питания (C1 висит на узле ШИНА параллельно, холдер — это просто источник), а места
    занимают половину картинки и сбивают счёт стадий. Батарея и адаптер обозначены
    бирками со стрелками — этого достаточно, чтобы понять, откуда приходит.
  * НЕТ ЗЕМЛИ. Ни одного «−» провода: земля разобрана отдельно, на той же странице,
    и её линии здесь только мешали бы читать красную цепь.
  * НЕТ ВСЕГО ОСТАЛЬНОГО. Ни светодиодов, ни делителей, ни модема — только шесть стадий
    переноса «+» и те детали, через которые он идёт.

Шесть стадий пронумерованы и на картинке, и в панели справа — номера совпадают
с разделом «Как питается «+» шина» в wiring-v8-2.html.

Ключевая мысль, ради которой всё и рисовалось: стадия 4 — ОДИН провод. Всё питание платы
входит в рельс единственной перемычкой 39g → «+» верх кол.16. Она выделена толщиной
и подписью, потому что её выпадение даёт ровно ту картину, с которой начинался поиск:
напряжение есть на всех модулях, а ESP32 мертва.

Вход:  bb_lib
Выход: images/power_v8.svg
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

NCOLS = 63
RAIL_INSET = 2
RAIL_TP, RAIL_TM = 250, 262           # верх: «+» LOAD / «−» GND (ряды отверстий)
RAIL_BP, RAIL_BM = 506, 518           # низ:  «+» LOAD / «−» GND
CUT = 606.5                           # разрез рельсов, между кол. 31 и 32
LOW_A, LOW_B = 490, 498               # те же коридоры, что в gen_wiring_v8_svg.py
SWX, SWY = 790, 610
W_CANVAS, VH = 1560, 800

RED = bb.PLUS
DIM = "#9a948a"                       # то, что не несёт «+»
INK = "#1a1a1a"

X = bb.colx
Y = bb.ROWY

# ═══════════════════════════════════════ 1. МАКЕТКА И ОРИЕНТИРЫ
board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS, rail_inset=RAIL_INSET)

# Штатные подписи колонок идут с 20-й: слева их не было, там всегда стояла плата.
# Здесь по колонкам считают путь, значит нужны и левые.
extra_cols = "".join(f'<text x="{X(c)}" y="286">{c}</text>' for c in (1, 3, 5, 10, 15, 16))

esp = bb.esp32_38(subtitle="38-pin · ESP-32U", antenna=False, highlight=["5V"])
flash = bb.flash_warn(label="")

tp4056 = bb.mod_inline(
    45, 50, "b", "f",
    [(45, "b", "IN−", bb.GNDc, -10), (50, "b", "IN+", RED, -10),
     (45, "f", "OUT−", bb.GNDc, 14), (46, "f", "B−", bb.PURPLE, 26),
     (49, "f", "OUT+", RED, 14), (50, "f", "B+", RED, 26)],
    "TP4056 · Type-C", "заряд + защита DW01",
    over_x=14, over_y=38, title_y=384, sub_y=395)

boost2 = bb.mod_inline(
    53, 57, "c", "h",
    [(55, "c", "IN+", RED, 11), (56, "c", "IN−", bb.GNDc, 24),
     (53, "h", "OUT−", bb.GNDc, -11), (57, "h", "OUT+", RED, -11)],
    "Boost#2", "5.2 В от батареи",
    over_x=4, over_y=17, title_y=384, sub_y=395)

boost1 = bb.mod_inline(
    59, 63, "c", "h",
    [(61, "c", "IN+", RED, 11), (62, "c", "IN−", bb.GNDc, 24),
     (59, "h", "OUT−", bb.GNDc, -11), (63, "h", "OUT+", RED, -11)],
    "Boost#1", "12 В для датчика",
    over_x=4, over_y=17, title_y=384, sub_y=395)

sw1 = bb.switch_rocker(SWX, SWY, 210, 96,
                       [(860, SWY + 7, "вход · 49j"), (960, SWY + 7, "выход · 51j")],
                       title="SW1 · в разрыве OUT+",
                       subtitle="за ним оба буста")

parts = (bb.diode_schottky(37, 39, "h", "D1", cathode="right") +
         bb.diode_schottky(39, 41, "h", "D2", cathode="left") +
         bb.ptc(42, 44, "j", ""))

# ═══════════════════════════════════════ 2. «+» РЕЛЬС — ОДНА ЦЕПЬ
# Верхний «+» через разрез ЗАМОСТОВАН (в отличие от «−»), поэтому все четыре
# полурельса — один узел. Подкрашены все четыре, чтобы это было видно, а не выведено.
def band(y, x0, x1, op=0.16):
    return (f'<rect x="{x0:.0f}" y="{y-7}" width="{x1-x0:.0f}" height="14" rx="4" '
            f'fill="{RED}" fill-opacity="{op}"/>')

L0, R1 = X(3) - 9, X(61) + 9
rail_tint = (band(RAIL_TP, L0, R1) + band(RAIL_BP, L0, R1, 0.10) +
             # Подпись стоит СЛЕВА, а не по центру: центр занят аркой моста и её биркой.
             f'<text x="{R1:.0f}" y="222" font-size="10.5" font-weight="700" '
             f'fill="{RED}" text-anchor="end">'
             f'«+» LOAD — все четыре полурельса ОДНА цепь</text>')

cut_marks = (f'<line x1="{CUT}" y1="238" x2="{CUT}" y2="276" stroke="#c0392b" '
             f'stroke-width="1.6" stroke-dasharray="3 3"/>'
             f'<line x1="{CUT}" y1="494" x2="{CUT}" y2="530" stroke="#c0392b" '
             f'stroke-width="1.6" stroke-dasharray="3 3"/>'
             f'<text x="{CUT-6:.0f}" y="546" font-size="9" font-weight="700" '
             f'fill="#c0392b" text-anchor="end">разрез рельсов</text>')

# ═══════════════════════════════════════ 3. ПУТЬ ПИТАНИЯ
def path(pts, w=4.2, color=RED, dots="none", op=1.0):
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    s = (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
         f'stroke-linejoin="round" stroke-linecap="round" stroke-opacity="{op}"/>')
    r = max(3.2, w * 1.15)
    if dots in ("both", "start"):
        s += f'<circle cx="{pts[0][0]:.1f}" cy="{pts[0][1]:.1f}" r="{r:.1f}" fill="{color}"/>'
    if dots in ("both", "end"):
        s += f'<circle cx="{pts[-1][0]:.1f}" cy="{pts[-1][1]:.1f}" r="{r:.1f}" fill="{color}"/>'
    return s

def tag(x0, y0, w, h, title, sub):
    return (f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="8" fill="#fff5f3" '
            f'stroke="{RED}" stroke-width="2"/>'
            f'<text x="{x0+w/2:.0f}" y="{y0+17}" font-size="11.5" font-weight="700" '
            f'fill="{RED}" text-anchor="middle">{title}</text>'
            f'<text x="{x0+w/2:.0f}" y="{y0+31}" font-size="9" fill="#7a6f62" '
            f'text-anchor="middle">{sub}</text>')

GAP = (X(51) + X(52)) / 2.0

# ─ стадия 1: адаптер → анод D1 (кол.37) → [D1] → кол.39
s1 = (tag(20, 540, 118, 38, "АДАПТЕР 5 В", "панельный, 2 А") +
      path([(138, 556), (X(37), 556), (X(37), Y["h"])], dots="end"))

# ─ стадия 2: банка → F1 → B+ → TP4056 → OUT+ → SW1 → вход Boost#2
s2 = (tag(20, 574, 118, 38, "«+» БАНКИ", "18650, через F1") +
      path([(138, 590), (X(42), 590), (X(42), Y["j"])], dots="end") +
      path([(X(44), Y["j"]), (X(44), LOW_A), (X(50), LOW_A), (X(50), Y["j"])], dots="both") +
      path([(X(49), Y["j"]), (X(49), 560), (860, 560), (860, SWY + 7)], dots="start") +
      path([(960, SWY + 7), (960, 570), (X(51), 570), (X(51), Y["j"])], dots="end") +
      path([(X(51), Y["i"]), (X(51), 470), (GAP, 470), (GAP, 290), (X(55), 290),
            (X(55), Y["c"])], dots="both"))

# ─ стадия 3: выход Boost#2 → анод D2 (кол.41) → [D2] → кол.39
s3 = path([(X(57), Y["h"]), (X(57), LOW_B), (X(41), LOW_B), (X(41), Y["h"])], dots="both")

# ─ стадия 4: узел ШИНА → «+» верх, кол.16. ЕДИНСТВЕННЫЙ ПРОВОД.
# Рисуется вдвое толще остальных и с гало: это единственная точка отказа всего питания.
BUS = [(X(39), Y["g"]), (X(39), 552), (660, 552), (660, 178), (X(16), 178),
       (X(16), RAIL_TP)]
s4 = (path([(X(39), Y["h"]), (X(39), Y["g"])], w=5.4) +
      path(BUS, w=11, color="#ffd2cb", op=0.9) + path(BUS, w=5.4, dots="both"))

# ─ стадия 5: рельс → кол.3 → диагональ → 1a → пин «5V»
s5 = path([(X(3), RAIL_TP), (X(1), Y["a"])], dots="both")

# ─ стадия 6: мост «+» 31↔32 → правая половина → кол.61 → Boost#1
s6 = (path([(X(31), RAIL_TP), (X(31), 228), (X(32), 228), (X(32), RAIL_TP)]) +
      path([(X(61), RAIL_TP), (X(61), Y["a"])], dots="end"))

# ─ связка кол.20: «+» вниз. Тонкая и бледная — потребителей на нижних «+» нет.
link20 = (path([(X(20), RAIL_TP), (X(20) + 9, RAIL_TP + 18), (X(20) + 9, RAIL_BP - 18),
                (X(20), RAIL_BP)], w=2.4, op=0.45) +
          f'<text x="{X(20)+16}" y="{(RAIL_TP+RAIL_BP)/2:.0f}" font-size="8.5" '
          f'fill="#9a8f80">связка кол.20 — вниз, потребителей там нет</text>')

# ═══════════════════════════════════════ 4. НОМЕРА СТАДИЙ
# (номер, x, y, подпись, куда подпись)
STAGES = [
    # (номер, x, y, подпись, dx, dy, выравнивание)
    ("1", 300, 556, "адаптер → D1", 0, -18, "middle"),
    ("2", 660, 590, "банка → F1 → TP4056 → SW1 → Boost#2", 0, 26, "middle"),
    ("3", 853, LOW_B, "5.2 В → D2", 0, 48, "middle"),
    ("4", 660, 330, "ОДИН провод: 39g → «+» верх, кол.16", 20, 4.5, "start"),
    ("5", 100, 276, "→ «5V» платы", 22, -34, "start"),
    ("6", CUT, 228, "мост → правая половина", -20, -14, "end"),
]

def stage(num, x, y, cap, dx, dy, anchor):
    big = ' font-size="12"' if num == "4" else ' font-size="10"'
    return (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="11.5" fill="{RED}" stroke="#fff" '
            f'stroke-width="2.2"/>'
            f'<text x="{x:.0f}" y="{y+4.2:.0f}" font-size="12.5" font-weight="700" '
            f'fill="#fff" text-anchor="middle">{num}</text>'
            f'<text x="{x+dx:.0f}" y="{y+dy:.0f}"{big} font-weight="700" fill="{RED}" '
            f'text-anchor="{anchor}">{cap}</text>')

stages = "".join(stage(*t) for t in STAGES)

busy = (f'<text x="{X(39):.0f}" y="{Y["f"]-14:.0f}" font-size="10" font-weight="700" '
        f'fill="{RED}" text-anchor="middle">УЗЕЛ ШИНА</text>')

# ═══════════════════════════════════════ 5. ПАНЕЛЬ СПРАВА
PX, PY, PW, PH = 1182, 236, 360, 372
# Строки разбиты руками, а не переносчиком: внутри есть разметка, и автоперенос
# по пробелам рвал бы теги пополам. Флаг = выделить строку жирным.
PANEL = [
    ("1", [("Адаптер 5 В &#8594; кол.37 &#8594; D1 &#8594;", 0),
           ("кол.39", 0)]),
    ("2", [("Банка &#8594; F1 &#8594; B+ &#183; TP4056 &#183;", 0),
           ("OUT+ &#8594; SW1 &#8594; вход Boost#2", 0)]),
    ("3", [("Boost#2 5.2 В &#8594; кол.41 &#8594; D2 &#8594;", 0),
           ("кол.39", 0)]),
    ("4", [("УЗЕЛ ШИНА (кол.39) &#8594;", 1),
           ("&#171;+&#187; верх, кол.16", 1),
           ("&#8212; единственный провод", 0)]),
    ("5", [("Рельс &#8594; кол.3 &#8594; диагональ в 1a", 0),
           ("&#8594; пин &#171;5V&#187; ESP32", 0)]),
    ("6", [("Мост &#171;+&#187; 31&#8596;32 &#8594; кол.61 &#8594;", 0),
           ("Boost#1 &#8594; 12 В датчику", 0)]),
]

def panel():
    s = (f'<rect x="{PX}" y="{PY}" width="{PW}" height="{PH}" rx="10" fill="#fbf7ec" '
         f'stroke="#e6d9b0"/>'
         f'<text x="{PX+14}" y="{PY+26}" font-size="13.5" font-weight="700" fill="{INK}">'
         f'Шесть стадий переноса «+»</text>')
    y = PY + 52
    for num, lines in PANEL:
        s += (f'<circle cx="{PX+26}" cy="{y-4}" r="10" fill="{RED}"/>'
              f'<text x="{PX+26}" y="{y}" font-size="11.5" font-weight="700" fill="#fff" '
              f'text-anchor="middle">{num}</text>')
        for i, (ln, bold) in enumerate(lines):
            fw = ' font-weight="700"' if bold else ""
            col = RED if bold else "#4a453c"
            s += (f'<text x="{PX+46}" y="{y+16*i}" font-size="11"{fw} fill="{col}">'
                  f'{ln}</text>')
        y += 16 * len(lines) + 14
    s += (f'<text x="{PX+14}" y="{PY+PH-46}" font-size="10.5" fill="#7a6f62">'
          f'Земля на картинке не показана — она</text>'
          f'<text x="{PX+14}" y="{PY+PH-32}" font-size="10.5" fill="#7a6f62">'
          f'разобрана отдельно: верхний «−» разрезан</text>'
          f'<text x="{PX+14}" y="{PY+PH-18}" font-size="10.5" fill="#7a6f62">'
          f'и мостом НЕ закрыт, это две разные цепи.</text>')
    return s

# ═══════════════════════════════════════ 6. СБОРКА
title = (f'<text x="30" y="40" font-size="20" font-weight="700" fill="{INK}">'
         f'Как питается «+» шина · схема v8</text>'
         f'<text x="30" y="62" font-size="12.5" fill="#4a453c">'
         f'Только путь питания: шесть стадий от розетки и от банки до пина «5V». '
         f'Земли, светодиодов, делителей и электролитов здесь нет намеренно.</text>'
         f'<text x="30" y="84" font-size="12.5" font-weight="700" fill="{RED}">'
         f'Стадия 4 — ОДИН провод. Выпал он: на модулях напряжение есть везде, '
         f'а ESP32 мертва. Ровно та картина, с которой начинался поиск.</text>'
         f'<text x="30" y="104" font-size="12.5" font-weight="700" fill="#c0392b">'
         f'&#9940; Колонки 1–4 обведены пунктиром — контакты SPI-флеша. В них не должно '
         f'стоять ничего, иначе плата не грузится, молча.</text>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W_CANVAS} {VH}" font-family="Segoe UI, Arial, sans-serif">
  {bb.defs(r3c, r4c)}
  <rect x="0" y="0" width="{W_CANVAS}" height="{VH}" fill="#ffffff"/>
  {title}
  {board}
  <g font-size="10" fill="#aaa" text-anchor="middle">{extra_cols}</g>
  {rail_tint}
  {cut_marks}
  {esp}
  {flash}
  {tp4056}
  {boost2}
  {boost1}
  {sw1}
  {parts}
  {link20}
  {s1}{s2}{s3}{s5}{s6}
  {s4}
  {busy}
  {stages}
  {panel()}
</svg>
'''

out = os.path.join(os.path.dirname(__file__), "power_v8.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote power_v8.svg", len(svg), "bytes; stages:", len(STAGES),
      "viewBox", W_CANVAS, "x", VH)
