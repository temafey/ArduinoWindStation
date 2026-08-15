# -*- coding: utf-8 -*-
"""КРУПНЫЙ ПЛАН: тест F1 — куда воткнуть временную перемычку.

Увеличенный фрагмент макетки (колонки 42–50, ряды f–j) с реальным шагом ×3.5,
чтобы новичку было видно каждую дырку. Показывает:
  • где именно колонки 44 / 45 / 46 (ориентир — печатная цифра 45)
  • F1 между кол.44 и кол.46
  • ЗЕЛЁНУЮ временную перемычку кол.44 ↔ кол.46 (ряд h) — то, что надо воткнуть
  • куда ставить щупы для замера падения на F1

Генерация:  python images/gen_f1_test_svg.py  →  images/f1_test.svg
"""
import os

W, H = 1240, 700
FONT = "Segoe UI, Arial, sans-serif"
RED, GRN, ORA, INK = "#c0392b", "#1e9e4a", "#c47015", "#1a1a1a"
BOARD, BSTK, HOLE = "#f4f0e6", "#d8d2c0", "#b9b09a"

COL0, PITCH = 150, 60          # кол.42 в x=150, шаг 60
ROWS = {"f": 200, "g": 260, "h": 320, "i": 380, "j": 440}


def cx(n):
    return COL0 + (n - 42) * PITCH


def build():
    o = [f'<rect width="{W}" height="{H}" fill="#fff"/>']

    # ── заголовок ──────────────────────────────────────────────────────────
    o.append(f'<text x="30" y="44" font-size="24" font-weight="700" fill="{INK}">'
             f'Тест F1 — куда воткнуть временную перемычку</text>')
    o.append(f'<text x="30" y="70" font-size="14" fill="#666">'
             f'Крупный план твоей макетки, нижний банк (ряды f–j). Дырки показаны в реальном порядке.</text>')

    # ── плата ──────────────────────────────────────────────────────────────
    o.append(f'<rect x="100" y="170" width="600" height="300" rx="10" '
             f'fill="{BOARD}" stroke="{BSTK}" stroke-width="2"/>')

    # подсветка колонок 44 и 46 (один узел = вся колонка)
    for n, col in ((44, "#2a6fd1"), (46, "#2a6fd1")):
        o.append(f'<rect x="{cx(n)-22}" y="185" width="44" height="270" rx="22" '
                 f'fill="rgba(42,111,209,.10)" stroke="{col}" stroke-opacity=".55" '
                 f'stroke-dasharray="6 4" stroke-width="2"/>')

    # номера колонок; 45 — печатный ориентир
    for n in range(42, 51):
        big = (n == 45)
        o.append(f'<text x="{cx(n)}" y="158" font-size="{17 if big else 13}" '
                 f'font-weight="{700 if big else 400}" fill="{INK if big else "#999"}" '
                 f'text-anchor="middle">{n}</text>')
    o.append(f'<text x="{cx(45)}" y="132" font-size="12" font-weight="700" fill="{RED}" '
             f'text-anchor="middle">эта цифра напечатана</text>')
    o.append(f'<text x="{cx(45)}" y="118" font-size="12" font-weight="700" fill="{RED}" '
             f'text-anchor="middle">на макетке ↓</text>')

    # буквы рядов
    for r, y in ROWS.items():
        o.append(f'<text x="122" y="{y+5}" font-size="14" fill="#999" text-anchor="middle">{r}</text>')

    # дырки
    for n in range(42, 51):
        for r, y in ROWS.items():
            o.append(f'<rect x="{cx(n)-8}" y="{y-8}" width="16" height="16" rx="3" '
                     f'fill="#fff" stroke="{HOLE}" stroke-width="2"/>')

    # ── F1 между кол.44 и кол.46 (ряд g) ───────────────────────────────────
    y = ROWS["g"]
    o.append(f'<line x1="{cx(44)}" y1="{y}" x2="{cx(45)-24}" y2="{y}" stroke="#9a8f6a" stroke-width="4"/>')
    o.append(f'<line x1="{cx(45)+24}" y1="{y}" x2="{cx(46)}" y2="{y}" stroke="#9a8f6a" stroke-width="4"/>')
    o.append(f'<circle cx="{cx(45)}" cy="{y}" r="26" fill="#e3c74a" stroke="#a8862c" stroke-width="2.5"/>')
    o.append(f'<text x="{cx(45)}" y="{y+5}" font-size="14" font-weight="700" fill="#4a3a10" '
             f'text-anchor="middle">F1</text>')
    o.append(f'<text x="{cx(45)}" y="{y-38}" font-size="14" font-weight="700" fill="{ORA}" '
             f'text-anchor="middle">F1 — предохранитель</text>')
    for n in (44, 46):
        o.append(f'<circle cx="{cx(n)}" cy="{y}" r="6" fill="#5a4a20"/>')

    # ── R5 (контекст, делитель) ────────────────────────────────────────────
    y = ROWS["f"]
    o.append(f'<g opacity="0.45"><line x1="{cx(46)}" y1="{y}" x2="{cx(48)}" y2="{y}" '
             f'stroke="#9a8f6a" stroke-width="3"/>'
             f'<rect x="{cx(47)-26}" y="{y-9}" width="52" height="18" rx="3" '
             f'fill="#d9c79c" stroke="#9a8f6a"/>'
             f'<text x="{cx(47)}" y="{y-18}" font-size="12" fill="#8a6d3b" '
             f'text-anchor="middle">R5 (делитель)</text></g>')

    # ── ЗЕЛЁНАЯ ВРЕМЕННАЯ ПЕРЕМЫЧКА: кол.44 ↔ кол.46, ряд h ────────────────
    y = ROWS["h"]
    o.append(f'<path d="M{cx(44)} {y} C {cx(44)} {y+30}, {cx(46)} {y+30}, {cx(46)} {y}" '
             f'fill="none" stroke="{GRN}" stroke-width="9" stroke-linecap="round"/>')
    for n in (44, 46):
        o.append(f'<rect x="{cx(n)-7}" y="{y-7}" width="14" height="14" rx="2" fill="{GRN}"/>')
        o.append(f'<circle cx="{cx(n)}" cy="{y}" r="15" fill="none" stroke="{GRN}" '
                 f'stroke-width="3" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{cx(45)}" y="602" font-size="17" font-weight="700" fill="{GRN}" '
             f'text-anchor="middle">ВОТ ЭТА ПЕРЕМЫЧКА — воткни сюда</text>')
    o.append(f'<text x="{cx(45)}" y="624" font-size="13" fill="#1a6b36" '
             f'text-anchor="middle">кол.44 (ряд h) → кол.46 (ряд h) · любой dupont «папа-папа»</text>')
    o.append(f'<text x="{cx(45)}" y="644" font-size="12" fill="#777" '
             f'text-anchor="middle">провод просто лежит поверх кол.45 — с ней он не соединён</text>')

    # ── существующие провода (контекст) ────────────────────────────────────
    y = ROWS["j"]
    o.append(f'<path d="M{cx(44)} {y} C {cx(44)} {y+70}, 150 {y+90}, 100 {y+96}" '
             f'fill="none" stroke="{RED}" stroke-width="5" stroke-linecap="round"/>')
    o.append(f'<circle cx="{cx(44)}" cy="{y}" r="6" fill="{RED}"/>')
    o.append(f'<text x="104" y="{y+114}" font-size="12.5" font-weight="700" fill="{RED}">'
             f'уже стоит: «+» батареи</text>')
    o.append(f'<path d="M{cx(46)} {y} C {cx(46)} {y+70}, 640 {y+90}, 700 {y+96}" '
             f'fill="none" stroke="{RED}" stroke-width="5" stroke-linecap="round"/>')
    o.append(f'<circle cx="{cx(46)}" cy="{y}" r="6" fill="{RED}"/>')
    o.append(f'<text x="580" y="{y+114}" font-size="12.5" font-weight="700" fill="{RED}">'
             f'уже стоит: → B+ TP4056</text>')

    # ── щупы для замера (ряд i) ────────────────────────────────────────────
    y = ROWS["i"]
    o.append(f'<circle cx="{cx(46)}" cy="{y}" r="11" fill="{RED}" stroke="#fff" stroke-width="2"/>')
    o.append(f'<circle cx="{cx(44)}" cy="{y}" r="11" fill="#111" stroke="#fff" stroke-width="2"/>')
    o.append(f'<text x="{cx(42)-40}" y="{y+5}" font-size="12.5" font-weight="700" fill="{INK}">'
             f'щупы →</text>')

    # ── правая панель: что делать ──────────────────────────────────────────
    PX = 760
    o.append(f'<rect x="{PX}" y="100" width="450" height="250" rx="12" fill="#eefaf1" '
             f'stroke="{GRN}" stroke-width="2.4"/>')
    o.append(f'<text x="{PX+22}" y="132" font-size="17" font-weight="700" fill="{GRN}">'
             f'Тест 1 — перемычка (без цифр)</text>')
    steps = [
        "1.  Возьми любой dupont-провод «папа-папа»",
        "     (с двух сторон торчат штырьки).",
        "2.  Один конец — в дырку кол.44, ряд h.",
        "3.  Второй конец — в дырку кол.46, ряд h.",
        "4.  Батареи вставлены, адаптер выдернут,",
        "     SW1 включён.",
        "5.  Смотри: станция запустилась или нет.",
    ]
    for i, t in enumerate(steps):
        o.append(f'<text x="{PX+22}" y="{160+i*24}" font-size="13.5" fill="#14532d">{t}</text>')
    o.append(f'<text x="{PX+22}" y="336" font-size="13.5" font-weight="700" fill="{GRN}">'
             f'Запустилась → виноват F1.  Нет → тест 2.</text>')

    o.append(f'<rect x="{PX}" y="368" width="450" height="150" rx="12" fill="#fdf3f2" '
             f'stroke="{RED}" stroke-width="2.4"/>')
    o.append(f'<text x="{PX+22}" y="400" font-size="17" font-weight="700" fill="{RED}">'
             f'Тест 2 — замер на F1</text>')
    steps2 = [
        "Перемычку УБЕРИ. Красный щуп — кол.46,",
        "чёрный — кол.44 (кружки на картинке).",
        "Станция под нагрузкой, от батареи.",
    ]
    for i, t in enumerate(steps2):
        o.append(f'<text x="{PX+22}" y="{428+i*23}" font-size="13.5" fill="#7a2820">{t}</text>')
    o.append(f'<text x="{PX+22}" y="504" font-size="13.5" font-weight="700" fill="{RED}">'
             f'Больше 0.5 В → F1 виноват.</text>')

    o.append(f'<rect x="{PX}" y="536" width="450" height="120" rx="12" fill="#fff8e6" '
             f'stroke="{ORA}" stroke-width="2.4"/>')
    o.append(f'<text x="{PX+22}" y="566" font-size="15" font-weight="700" fill="{ORA}">'
             f'⚠  Перемычку потом обязательно убрать</text>')
    o.append(f'<text x="{PX+22}" y="592" font-size="13" fill="#7a4a12">'
             f'С ней предохранителя в цепи нет —</text>')
    o.append(f'<text x="{PX+22}" y="613" font-size="13" fill="#7a4a12">'
             f'это только на время теста, у стола.</text>')
    o.append(f'<text x="{PX+22}" y="640" font-size="13" fill="#7a4a12">'
             f'Колонка = 5 дырок в ряд, все соединены.</text>')

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="{FONT}">' \
           + "".join(o) + '</svg>'


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "f1_test.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build())
    print("wrote", out, os.path.getsize(out), "bytes")
