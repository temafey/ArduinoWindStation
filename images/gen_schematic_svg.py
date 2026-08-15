# -*- coding: utf-8 -*-
"""
ПРИНЦИПИАЛЬНАЯ СХЕМА силового тракта метеостанции — текущая сборка + отладка.

Не «вид макетки», а электрическая схема: блоки модулей + линии связей + имена
узлов. Палитра и стиль падов/модулей взяты из СТАНДАРТА images/bb_lib.py
(тот же визуальный язык, что в full-sensor.html), но топология рисуется
схемно, слева направо по потоку мощности.

Назначение: отладка «станция не стартует от батареи» (2026-07-18).
На схеме отмечены:
  • точки замера ① узел X, ② TP_B+, ③ TP_OUT (mm_point из стандарта)
  • два подозреваемых узла: F1 (номинал не проверен) и защита FS8205A (OCP)
  • путь разрядного тока с величинами

Генерация:  python images/gen_schematic_svg.py  →  images/schematic_power.svg
Соглашение: пересечение линий БЕЗ точки = НЕ соединено (обычная схемная нотация).
"""
import os
from bb_lib import (PLUS, GNDc, SIG, PURPLE, COPPER, PCB_DARK, PCB_EDGE,
                    SILK, SILK_DIM, GOLD, SILVER, CONT_FILL, CONT_STK,
                    BOARD_FILL, BOARD_STK, PAD_GNDp, mm_point)

W, H = 1700, 1250
FONT = "Segoe UI, Arial, sans-serif"
WARN = "#c0392b"
OKC = "#2e7d4f"
INK = "#1a1a1a"
MUTE = "#8a8a8a"

# ============================================================ примитивы схемы
def wire(pts, color=PLUS, w=3.4, dash=None, arrow=False):
    d = " ".join(("M" if i == 0 else "L") + f"{x} {y}" for i, (x, y) in enumerate(pts))
    da = f' stroke-dasharray="{dash}"' if dash else ""
    mk = ' marker-end="url(#arrow)"' if arrow else ""
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
            f'stroke-linecap="round" stroke-linejoin="round"{da}{mk}/>')

def dot(x, y, color=PLUS, r=5):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'

def hop(x, y, color=PURPLE, w=3.4, r=9):
    """Мостик через пересекаемую линию (вертикальный провод перепрыгивает горизонтальный)."""
    return (f'<path d="M{x} {y+r} A {r} {r} 0 0 1 {x} {y-r}" fill="none" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')

def gnd(x, y, label=None):
    s = (f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y+9}" stroke="{GNDc}" stroke-width="3"/>'
         f'<line x1="{x-14}" y1="{y+9}" x2="{x+14}" y2="{y+9}" stroke="{GNDc}" stroke-width="3.6"/>'
         f'<line x1="{x-8.5}" y1="{y+15}" x2="{x+8.5}" y2="{y+15}" stroke="{GNDc}" stroke-width="3"/>'
         f'<line x1="{x-3.5}" y1="{y+21}" x2="{x+3.5}" y2="{y+21}" stroke="{GNDc}" stroke-width="3"/>')
    if label:
        s += f'<text x="{x}" y="{y+36}" font-size="9.5" fill="#777" text-anchor="middle">{label}</text>'
    return s

def netlabel(x, y, name, color=PLUS, anchor="middle", volts=None):
    txt = name if volts is None else f"{name}"
    w_ = len(txt) * 7.4 + 16
    x0 = {"middle": x - w_ / 2, "start": x, "end": x - w_}[anchor]
    s = (f'<rect x="{x0:.0f}" y="{y-13}" width="{w_:.0f}" height="19" rx="4" '
         f'fill="#fff" stroke="{color}" stroke-width="1.5"/>'
         f'<text x="{x0+w_/2:.0f}" y="{y+1}" font-size="11" font-weight="700" '
         f'fill="{color}" text-anchor="middle" font-family="ui-monospace,Consolas,monospace">{txt}</text>')
    if volts:
        s += (f'<text x="{x0+w_/2:.0f}" y="{y+20}" font-size="10.5" fill="#555" '
              f'text-anchor="middle">{volts}</text>')
    return s

def res_v(x, y0, y1, label, sub="", lab_side="right"):
    """Резистор вертикально, выводы y0..y1."""
    bh = 46; by = (y0 + y1) / 2 - bh / 2
    lx, anc = (x + 22, "start") if lab_side == "right" else (x - 22, "end")
    s = (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{by:.0f}" stroke="{GNDc}" stroke-width="2.4"/>'
         f'<line x1="{x}" y1="{by+bh:.0f}" x2="{x}" y2="{y1}" stroke="{GNDc}" stroke-width="2.4"/>'
         f'<rect x="{x-13}" y="{by:.0f}" width="26" height="{bh}" rx="3" fill="#fff" '
         f'stroke="{INK}" stroke-width="2.2"/>'
         f'<text x="{lx}" y="{by+20:.0f}" font-size="12" font-weight="700" fill="{INK}" '
         f'text-anchor="{anc}">{label}</text>')
    if sub:
        s += (f'<text x="{lx}" y="{by+36:.0f}" font-size="10" fill="#777" '
              f'text-anchor="{anc}">{sub}</text>')
    return s

def ptc_v(x, y0, y1, label, sub, warn=False):
    """PPTC вертикально — прямоугольник с диагональю и «t°»."""
    bh = 54; by = (y0 + y1) / 2 - bh / 2
    stk = WARN if warn else INK
    return (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{by:.0f}" stroke="{GNDc}" stroke-width="2.4"/>'
            f'<line x1="{x}" y1="{by+bh:.0f}" x2="{x}" y2="{y1}" stroke="{GNDc}" stroke-width="2.4"/>'
            f'<rect x="{x-16}" y="{by:.0f}" width="32" height="{bh}" rx="3" fill="#fff" '
            f'stroke="{stk}" stroke-width="{3 if warn else 2.2}"/>'
            f'<line x1="{x-11}" y1="{by+bh-9:.0f}" x2="{x+11}" y2="{by+9:.0f}" '
            f'stroke="{stk}" stroke-width="2.2"/>'
            f'<text x="{x+11}" y="{by+bh-13:.0f}" font-size="9" fill="{stk}">t°</text>'
            f'<text x="{x+26}" y="{by+20:.0f}" font-size="12" font-weight="700" fill="{stk}">{label}</text>'
            f'<text x="{x+26}" y="{by+36:.0f}" font-size="10" fill="#777">{sub}</text>')

def diode_h(x0, x1, y, label, sub=""):
    """Шоттки горизонтально, катод справа (полоска)."""
    cx = (x0 + x1) / 2
    return (f'<line x1="{x0}" y1="{y}" x2="{cx-13:.0f}" y2="{y}" stroke="{GNDc}" stroke-width="2.4"/>'
            f'<line x1="{cx+13:.0f}" y1="{y}" x2="{x1}" y2="{y}" stroke="{GNDc}" stroke-width="2.4"/>'
            f'<path d="M{cx-13:.0f} {y-14} L{cx+11:.0f} {y} L{cx-13:.0f} {y+14} Z" '
            f'fill="{INK}"/>'
            f'<path d="M{cx+11:.0f} {y-14} L{cx+11:.0f} {y+14} M{cx+11:.0f} {y-14} '
            f'L{cx+19:.0f} {y-14} M{cx+11:.0f} {y+14} L{cx+3:.0f} {y+14}" '
            f'stroke="{INK}" stroke-width="2.6" fill="none"/>'
            f'<text x="{cx}" y="{y-24}" font-size="12" font-weight="700" fill="{INK}" '
            f'text-anchor="middle">{label}</text>'
            f'<text x="{cx}" y="{y+34}" font-size="9.5" fill="#777" text-anchor="middle">{sub}</text>')

def cap_v(x, y0, y1, label, polar=False, lab_dx=24):
    """Конденсатор вертикально; polar=True → электролит (изогнутая нижняя обкладка)."""
    my = (y0 + y1) / 2
    s = (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{my-6:.0f}" stroke="{GNDc}" stroke-width="2.4"/>'
         f'<line x1="{x}" y1="{my+6:.0f}" x2="{x}" y2="{y1}" stroke="{GNDc}" stroke-width="2.4"/>'
         f'<line x1="{x-17}" y1="{my-6:.0f}" x2="{x+17}" y2="{my-6:.0f}" stroke="{INK}" stroke-width="3"/>')
    if polar:
        s += (f'<path d="M{x-17} {my+10:.0f} Q {x} {my+2:.0f} {x+17} {my+10:.0f}" '
              f'fill="none" stroke="{INK}" stroke-width="3"/>'
              f'<text x="{x-24}" y="{my-8:.0f}" font-size="13" font-weight="700" fill="{PLUS}">+</text>')
    else:
        s += f'<line x1="{x-17}" y1="{my+6:.0f}" x2="{x+17}" y2="{my+6:.0f}" stroke="{INK}" stroke-width="3"/>'
    anc = "start" if lab_dx >= 0 else "end"
    s += (f'<text x="{x+lab_dx}" y="{my+4:.0f}" font-size="12" font-weight="700" '
          f'fill="{INK}" text-anchor="{anc}">{label}</text>')
    return s

def switch_h(x0, x1, y, label, sub):
    """Схемный выключатель (разрыв + подвижный контакт)."""
    return (f'<line x1="{x0}" y1="{y}" x2="{x0+18}" y2="{y}" stroke="{PLUS}" stroke-width="3.4"/>'
            f'<line x1="{x1-18}" y1="{y}" x2="{x1}" y2="{y}" stroke="{PLUS}" stroke-width="3.4"/>'
            f'<circle cx="{x0+18}" cy="{y}" r="4.5" fill="{PLUS}"/>'
            f'<circle cx="{x1-18}" cy="{y}" r="4.5" fill="{PLUS}"/>'
            f'<line x1="{x0+18}" y1="{y}" x2="{x1-14}" y2="{y-19}" stroke="{PLUS}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<text x="{(x0+x1)/2:.0f}" y="{y-30}" font-size="12" font-weight="700" fill="{INK}" text-anchor="middle">{label}</text>'
            f'<text x="{(x0+x1)/2:.0f}" y="{y+26}" font-size="9.5" fill="#777" text-anchor="middle">{sub}</text>')

# ---- пады модулей (стиль стандарта: золочёная дырка + шелкография) ----
def pad(px, py, label, side, color=SILVER, fill=SILK):
    if side == "left":
        lx, ly, anc = px + 13, py + 3.5, "start"
    elif side == "right":
        lx, ly, anc = px - 13, py + 3.5, "end"
    elif side == "top":
        lx, ly, anc = px, py + 16, "middle"
    else:  # bottom — подпись справа-снизу от пада (не срезается кромкой платы)
        lx, ly, anc = px + 12, py + 17, "start"
    return (f'<circle cx="{px}" cy="{py}" r="6" fill="{color}" stroke="#efefef" stroke-width="1.3"/>'
            f'<circle cx="{px}" cy="{py}" r="2.3" fill="#0b0b0d"/>'
            f'<text x="{lx}" y="{ly}" font-size="8.5" font-weight="700" fill="{fill}" '
            f'text-anchor="{anc}">{label}</text>')

def sch_mod(x, y, w, h, title, sub, pads, ics=None, dark=True, tfill=None):
    """Блок модуля в стиле стандарта (тёмный текстолит) с падами по кромкам."""
    bg, edge = (PCB_DARK, PCB_EDGE) if dark else (CONT_FILL, CONT_STK)
    tf = tfill or (SILK if dark else INK)
    sf = SILK_DIM if dark else "#666"
    s = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{bg}" '
         f'stroke="{edge}" stroke-width="1.6"/>'
         f'<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="8" fill="none" '
         f'stroke="#000" stroke-opacity="0.4"/>')
    for icx, icy, icw, ict in (ics or []):
        s += (f'<rect x="{icx}" y="{icy}" width="{icw}" height="16" rx="2" fill="#0e0e11" stroke="#000"/>'
              f'<text x="{icx+icw/2:.0f}" y="{icy+11}" font-size="6.8" fill="#cfd2d8" '
              f'text-anchor="middle">{ict}</text>')
    s += (f'<text x="{x+w/2:.0f}" y="{y+h-46}" font-size="13" font-weight="700" fill="{tf}" '
          f'text-anchor="middle">{title}</text>'
          f'<text x="{x+w/2:.0f}" y="{y+h-31}" font-size="8" fill="{sf}" text-anchor="middle">{sub}</text>')
    for p in pads:
        s += pad(*p)
    return s

def callout(x, y, w, h, lines, color=WARN, bg="#fff5f4", anchor_pt=None):
    s = ""
    if anchor_pt:
        ax, ay = anchor_pt
        s += (f'<path d="M{ax} {ay} L{x if ax > x else x+w} {y+h/2:.0f}" fill="none" '
              f'stroke="{color}" stroke-width="2" stroke-dasharray="4 3"/>')
    s += (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{bg}" '
          f'stroke="{color}" stroke-width="2.2"/>')
    for i, (t, bold, sz) in enumerate(lines):
        s += (f'<text x="{x+13}" y="{y+23+i*18}" font-size="{sz}" '
              f'{"font-weight=\"700\"" if bold else ""} fill="{color if bold else "#6b3a33"}">{t}</text>')
    return s

# ============================================================ КОМПОЗИЦИЯ
def build():
    o = []
    o.append(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff"/>')

    # ---------- шапка ----------
    o.append(f'<text x="30" y="40" font-size="26" font-weight="700" fill="{INK}">'
             f'Принципиальная схема силового тракта — ТЕКУЩАЯ сборка (отладка)</text>')
    o.append(f'<text x="30" y="66" font-size="14" fill="#666">'
             f'Станция не стартует от батареи. Замена TP4056 не помогла (2 платы — одинаково) → причина системная. '
             f'Красным отмечены два подозреваемых узла.</text>')
    o.append(f'<text x="30" y="86" font-size="12" fill="#999">'
             f'Пересечение линий без точки = НЕ соединено. Блоки и палитра — по стандарту images/bb_lib.py.</text>')

    # легенда
    lg = [(PLUS, "«+» / силовая"), (GNDc, "GND «−»"), (PURPLE, "PACK_MINUS (до защиты)"),
          (SIG, "сигнал → ADC")]
    lx = 30
    for c, t in lg:
        o.append(f'<line x1="{lx}" y1="110" x2="{lx+30}" y2="110" stroke="{c}" stroke-width="4"/>')
        o.append(f'<text x="{lx+38}" y="114" font-size="12.5" fill="#333">{t}</text>')
        lx += 38 + len(t) * 7.1 + 26
    o.append(mm_point(lx + 6, 110, "точка замера мультиметром"))

    # ================= ВЕТКА АДАПТЕРА (верхняя полоса) =================
    o.append(sch_mod(70, 150, 170, 96, "USB-C 5 В", "панельный разъём", [
        (240, 182, "+5В", "right", PLUS, SILK),
        (240, 218, "GND", "right", PAD_GNDp, SILK),
    ], dark=False, tfill=INK))
    o.append(wire([(240, 182), (300, 182)], PLUS))
    o.append(dot(300, 182))
    o.append(netlabel(268, 160, "ADAPTER_5V", PLUS))
    o.append(diode_h(300, 430, 182, "D1 · 1N5819", "катод → шина"))
    o.append(wire([(430, 182), (1090, 182)], PLUS))
    # ответвление на заряд TP4056 IN+
    o.append(wire([(300, 182), (300, 300), (430, 300)], PLUS, 3.0))
    o.append(gnd(300, 232))
    o.append(wire([(240, 218), (300, 218)], GNDc, 3.0))

    # ================= TP4056 =================
    TPx, TPy, TPw, TPh = 430, 262, 220, 172
    o.append(sch_mod(TPx, TPy, TPw, TPh, "TP4056", "USB-C · заряд + защита DW01A", [
        (TPx, 300, "IN+", "left", PLUS, SILK),
        (TPx, 372, "B+", "left", PLUS, SILK),
        (TPx + TPw, 330, "OUT+", "right", PLUS, SILK),
        (490, TPy + TPh, "IN−", "bottom", PAD_GNDp, SILK),
        (575, TPy + TPh, "B−", "bottom", "#b07bd0", SILK),
        (630, TPy + TPh, "OUT−", "bottom", PAD_GNDp, SILK),
    ], ics=[(500, 292, 38, "TP4056"), (546, 292, 32, "DW01"), (500, 320, 44, "FS8205A")]))
    o.append(gnd(490, TPy + TPh + 24))
    o.append(wire([(490, TPy + TPh), (490, TPy + TPh + 24)], GNDc, 3.0))
    o.append(gnd(630, TPy + TPh + 24, "OUT− → общий GND"))
    o.append(wire([(630, TPy + TPh), (630, TPy + TPh + 24)], GNDc, 3.0))

    # ================= БАТАРЕЯ + F1 =================
    o.append(sch_mod(70, 900, 220, 116, "2×18650 LG HG2", "параллель · 3.95 В · 6000 мАч", [
        (290, 934, "+", "right", PLUS, SILK),
        (290, 984, "−", "right", "#b07bd0", SILK),
    ], dark=False, tfill=INK))
    # «+» пакета → F1 → TP_B+
    o.append(wire([(290, 934), (360, 934), (360, 700)], PLUS))
    o.append(netlabel(360, 880, "VBAT", PLUS, volts="3.95 В"))
    o.append(ptc_v(360, 700, 560, "F1 · PPTC", "заявлено 2 A", warn=True))
    o.append(wire([(360, 560), (360, 372), (430, 372)], PLUS))
    o.append(dot(360, 470))
    o.append(netlabel(285, 318, "TP_B+", PLUS, volts="ждём 3.98 В"))

    # PACK_MINUS: «−» пакета → B− (мимо GND!). Мостик через оранжевую линию.
    o.append(wire([(290, 984), (575, 984), (575, 639)], PURPLE, 3.8))
    o.append(hop(575, 630, PURPLE, 3.8))
    o.append(wire([(575, 621), (575, TPy + TPh)], PURPLE, 3.8))
    o.append(netlabel(700, 984, "PACK_MINUS", PURPLE, anchor="start"))
    o.append(f'<text x="700" y="1008" font-size="11.5" fill="{PURPLE}">'
             f'НЕ на общий GND — иначе DW01A обойдён</text>')

    # ================= ДЕЛИТЕЛЬ БАТАРЕИ =================
    o.append(wire([(360, 470), (470, 470)], PLUS, 3.0))
    o.append(res_v(470, 470, 600, "R5", "100k", lab_side="left"))
    o.append(wire([(470, 600), (470, 660)], GNDc, 2.4))
    o.append(res_v(470, 660, 790, "R6", "100k", lab_side="left"))
    o.append(dot(470, 630, SIG))
    o.append(gnd(470, 790))
    # C5 + оранжевый на GPIO32
    o.append(wire([(470, 630), (1270, 630)], SIG, 3.2))
    o.append(dot(680, 630, SIG))
    o.append(cap_v(680, 630, 700, "C5 100нФ"))
    o.append(gnd(680, 700))
    o.append(wire([(1270, 630), (1270, 400), (1360, 400)], SIG, 3.2))
    o.append(netlabel(950, 630, "BAT_ADC", SIG, volts="ждём 1.99 В и РОВНО"))
    o.append(f'<text x="790" y="612" font-size="11.5" font-weight="700" fill="#c47015">'
             f'узел X → GPIO32</text>')

    # ================= BOOST#2 =================
    o.append(wire([(650, 330), (700, 330)], PLUS))
    o.append(netlabel(675, 282, "TP_OUT", PLUS, volts="ждём 3.9 В"))
    Bx, By, Bw, Bh = 700, 262, 190, 172
    o.append(sch_mod(Bx, By, Bw, Bh, "Mini Boost · MT3608", "→ 5.14 В (задача 02 ✓)", [
        (Bx, 330, "IN+", "left", PLUS, SILK),
        (Bx + Bw, 330, "OUT+", "right", PLUS, SILK),
        (760, By + Bh, "IN−", "bottom", PAD_GNDp, SILK),
        (830, By + Bh, "OUT−", "bottom", PAD_GNDp, SILK),
    ], ics=[(748, 300, 40, "MT3608")]))
    o.append(gnd(760, By + Bh + 22))
    o.append(wire([(760, By + Bh), (760, By + Bh + 22)], GNDc, 3.0))
    o.append(gnd(830, By + Bh + 22))
    o.append(wire([(830, By + Bh), (830, By + Bh + 22)], GNDc, 3.0))

    # ================= D2 → ШИНА =================
    o.append(wire([(890, 330), (930, 330)], PLUS))
    o.append(netlabel(910, 296, "BOOST2_OUT", PLUS, volts="5.14 В"))
    o.append(diode_h(930, 1090, 330, "D2 · 1N5819", "катод → шина"))
    o.append(wire([(1090, 182), (1090, 330)], PLUS))
    o.append(dot(1090, 182)); o.append(dot(1090, 330))
    o.append(netlabel(1090, 262, "RAIL_4V7", PLUS, volts="4.6–4.8 В"))
    # C1 на шине
    o.append(wire([(1090, 330), (1090, 430)], PLUS))
    o.append(dot(1090, 400))
    o.append(cap_v(1090, 400, 480, "C1 1000µF", polar=True))
    o.append(gnd(1090, 480))

    # ================= SW1 → LOAD → ESP32 =================
    o.append(wire([(1090, 182), (1150, 182)], PLUS))
    o.append(switch_h(1150, 1270, 182, "SW1", "главный выключатель"))
    o.append(wire([(1270, 182), (1420, 182), (1420, 250)], PLUS))
    o.append(netlabel(1330, 160, "LOAD_RAIL", PLUS))
    o.append(dot(1310, 182))
    o.append(wire([(1310, 182), (1310, 250)], PLUS, 3.0))
    o.append(cap_v(1310, 250, 310, "C2 100нФ", polar=False, lab_dx=-24))
    o.append(gnd(1310, 310))

    Ex, Ey, Ew, Eh = 1360, 250, 280, 230
    o.append(sch_mod(Ex, Ey, Ew, Eh, "ESP32 DevKit V1", "DOIT 30-pin · питание по VIN", [
        (1420, Ey, "VIN", "top", PLUS, SILK),
        (Ex, 400, "GPIO32", "left", "#6aa9e0", SILK),
        (1520, Ey + Eh, "GND", "bottom", PAD_GNDp, SILK),
    ], ics=[(1440, 320, 60, "ESP32-WROOM")]))
    o.append(gnd(1520, Ey + Eh + 22))
    o.append(wire([(1520, Ey + Eh), (1520, Ey + Eh + 22)], GNDc, 3.0))

    # Boost#1 + датчик — контекст (приглушённо)
    o.append(f'<g opacity="0.42">')
    o.append(wire([(1420, 182), (1560, 182), (1560, 150)], PLUS, 2.6, dash="6 4"))
    o.append(sch_mod(1470, 100, 180, 50, "Boost#1 → 12 В", "датчик (задача 07)", [],
                     dark=False, tfill=INK))
    o.append(f'</g>')

    # ================= ТОЧКИ ЗАМЕРА =================
    o.append(f'<g font-family="{FONT}">')
    for (cx, cy, num) in [(470, 630, "1"), (360, 372, "2"), (675, 330, "3")]:
        o.append(f'<circle cx="{cx}" cy="{cy}" r="15" fill="{WARN}" opacity="0.14"/>'
                 f'<circle cx="{cx}" cy="{cy}" r="14" fill="none" stroke="{WARN}" stroke-width="2"/>'
                 f'<circle cx="{cx}" cy="{cy}" r="9.5" fill="#fff" stroke="{WARN}" stroke-width="3"/>'
                 f'<text x="{cx}" y="{cy+4}" font-size="11.5" font-weight="700" fill="{WARN}" '
                 f'text-anchor="middle">{num}</text>')
    o.append('</g>')

    # ================= ПУТЬ РАЗРЯДНОГО ТОКА =================
    o.append(f'<path d="M300 1044 L560 1044" stroke="{WARN}" stroke-width="7" opacity="0.20" '
             f'stroke-linecap="round" marker-end="url(#arrow)"/>')
    o.append(f'<text x="300" y="1034" font-size="11.5" font-weight="700" fill="{WARN}">'
             f'путь разрядного тока: ~0.35 A средний · ~0.8 A пик (WiFi TX)</text>')

    # ================= ВЫНОСКИ-ПОДОЗРЕВАЕМЫЕ =================
    o.append(callout(58, 700, 262, 114, [
        ("ПОДОЗРЕВАЕМЫЙ №2 — F1", True, 12.5),
        ("Номинал НИКОГДА не проверялся.", False, 11.5),
        ("Жёлтые диски 0.1–3 A выглядят", False, 11.5),
        ("одинаково. PPTC ниже номинала", False, 11.5),
        ("= тепловой разгон и просадка.", False, 11.5),
    ], color="#c47015", bg="#fdf6ec", anchor_pt=(344, 640)))

    o.append(callout(736, 452, 330, 132, [
        ("ПОДОЗРЕВАЕМЫЙ №1 — защита FS8205A", True, 12.5),
        ("Замер: 0.3 В на B−↔OUT− под нагрузкой.", False, 11.5),
        ("Порог OCP DW01A ≈ 150 мВ → отсечка.", False, 11.5),
        ("Исправный 8205A дал бы 0.3 В лишь при 6 A;", False, 11.5),
        ("при 0.8 A это Rds(on) ≈ 375 мΩ = клон.", False, 11.5),
        ("Обе платы — одинаковые клоны.", True, 11.5),
    ], color=WARN, bg="#fff5f4", anchor_pt=(648, 452)))

    # ================= НИЖНИЙ БЛОК: замеры и дерево =================
    o.append(f'<rect x="30" y="1066" width="1640" height="160" rx="10" fill="#fbf7ec" '
             f'stroke="#e6d9b0" stroke-width="1.6"/>')
    o.append(f'<text x="48" y="1092" font-size="14.5" font-weight="700" fill="{INK}">'
             f'Разделяющий замер (батарея вставлена, станция под нагрузкой, чёрный щуп на GND):</text>')
    rows = [
        ("2", "TP_B+", "просел с 3.98 → ~2.6 В", "проблема ДО модуля → F1 или контакты", "#c47015"),
        ("2+3", "TP_B+ держит, а TP_OUT просел", "≈ 2.5 В на OUT+", "проблема ВНУТРИ модуля → OCP защиты", WARN),
        ("1", "узел X", "≈ 1.99 В и ровно", "делитель исправен (задача 05)", OKC),
    ]
    for i, (n, pt, val, verdict, col) in enumerate(rows):
        yy = 1116 + i * 26
        o.append(f'<text x="48" y="{yy}" font-size="12.5" font-weight="700" fill="{col}">{n}</text>')
        o.append(f'<text x="90" y="{yy}" font-size="12.5" font-weight="700" fill="{INK}" '
                 f'font-family="ui-monospace,Consolas,monospace">{pt}</text>')
        o.append(f'<text x="430" y="{yy}" font-size="12.5" fill="#555">{val}</text>')
        o.append(f'<text x="700" y="{yy}" font-size="12.5" fill="{col}">→ {verdict}</text>')
    o.append(f'<text x="48" y="1200" font-size="12.5" fill="{OKC}">'
             f'✓  Быстрая проверка версии №1 без пайки: WiFi.setTxPower(WIFI_POWER_8_5dBm) — '
             f'падает пик тока. Стартовала от батареи → подтверждена токовая отсечка.</text>')
    o.append(f'<text x="48" y="1220" font-size="12.5" fill="{OKC}">'
             f'✓  Быстрая проверка версии №2: закоротить F1 перемычкой (только на столе, под присмотром) '
             f'— заработало → виноват PPTC.</text>')

    defs = (f'<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" '
            f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0 0 L10 5 L0 10 z" fill="{WARN}"/></marker></defs>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
            f'font-family="{FONT}">{defs}' + "".join(o) + '</svg>')


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schematic_power.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build())
    print(f"OK  {out}  ({os.path.getsize(out)} bytes)")
