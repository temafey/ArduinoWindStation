# -*- coding: utf-8 -*-
"""КАК ПОСТАВИТЬ SMD 1206 PolySwitch 2A НА МАКЕТКУ.

Деталь 3.2×1.6 мм в макетку не втыкается — надо припаять ножки (обрезки от
резисторов) и превратить в выводную. Три шага + предупреждение про нагрев.

Генерация:  python images/gen_f1_mount_svg.py  →  images/f1_mount.svg
"""
import os

W, H = 1300, 700
FONT = "Segoe UI, Arial, sans-serif"
RED, GRN, ORA, INK = "#c0392b", "#1e9e4a", "#c47015", "#1a1a1a"
BOARD, BSTK, HOLE = "#f4f0e6", "#d8d2c0", "#b9b09a"
BODY = "#e3c74a"          # корпус PPTC (жёлто-песочный)
CAP = "#b8bcc4"           # металлические торцы
LEG = "#9a8f6a"           # ножка-обрезок
SOLDER = "#c9ccd3"


def step_head(x, y, n, title):
    return (f'<circle cx="{x+16}" cy="{y-6}" r="16" fill="{GRN}"/>'
            f'<text x="{x+16}" y="{y}" font-size="16" font-weight="700" fill="#fff" '
            f'text-anchor="middle">{n}</text>'
            f'<text x="{x+44}" y="{y}" font-size="17" font-weight="700" fill="{INK}">{title}</text>')


def build():
    o = [f'<rect width="{W}" height="{H}" fill="#fff"/>']

    o.append(f'<text x="30" y="44" font-size="24" font-weight="700" fill="{INK}">'
             f'Как поставить SMD 1206 на макетку</text>')
    o.append(f'<text x="30" y="70" font-size="14" fill="#666">'
             f'Деталь 3.2 × 1.6 мм. Припаиваем к ней ножки — получается обычная выводная деталь.</text>')

    # ═══════════ ШАГ 1: что это за деталь, масштаб ═══════════
    o.append(step_head(30, 128, "1", "Вот она, в масштабе"))

    # увеличенный 1206 (×40)
    bx, by, bw, bh = 60, 168, 128, 64
    o.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="4" fill="{BODY}" stroke="#a8862c" stroke-width="2"/>')
    o.append(f'<rect x="{bx}" y="{by}" width="22" height="{bh}" rx="3" fill="{CAP}" stroke="#7d828a" stroke-width="1.6"/>')
    o.append(f'<rect x="{bx+bw-22}" y="{by}" width="22" height="{bh}" rx="3" fill="{CAP}" stroke="#7d828a" stroke-width="1.6"/>')
    o.append(f'<text x="{bx+bw/2:.0f}" y="{by+38}" font-size="13" font-weight="700" fill="#4a3a10" '
             f'text-anchor="middle">2A</text>')
    # размеры
    o.append(f'<text x="{bx+bw/2:.0f}" y="{by-12}" font-size="12.5" fill="#666" text-anchor="middle">3.2 мм</text>')
    o.append(f'<line x1="{bx}" y1="{by-6}" x2="{bx+bw}" y2="{by-6}" stroke="#999" stroke-width="1.4"/>')
    o.append(f'<text x="{bx+bw+16}" y="{by+38}" font-size="12.5" fill="#666">1.6 мм</text>')
    o.append(f'<text x="{bx}" y="{by+bh+26}" font-size="12" fill="{ORA}" font-weight="700">'
             f'серые торцы — сюда паять</text>')

    # реальный размер
    o.append(f'<text x="60" y="292" font-size="12.5" fill="#666">реальный размер:</text>')
    o.append(f'<rect x="176" y="280" width="12" height="6" rx="1" fill="{BODY}" stroke="#a8862c"/>')

    # ═══════════ ШАГ 2: припаять ножки ═══════════
    o.append(step_head(30, 350, "2", "Припаять ножки от резисторов"))

    lx, ly = 90, 400
    o.append(f'<line x1="{lx-60}" y1="{ly}" x2="{lx}" y2="{ly}" stroke="{LEG}" stroke-width="4" stroke-linecap="round"/>')
    o.append(f'<line x1="{lx+128}" y1="{ly}" x2="{lx+188}" y2="{ly}" stroke="{LEG}" stroke-width="4" stroke-linecap="round"/>')
    o.append(f'<rect x="{lx}" y="{ly-24}" width="128" height="48" rx="4" fill="{BODY}" stroke="#a8862c" stroke-width="2"/>')
    o.append(f'<rect x="{lx}" y="{ly-24}" width="22" height="48" rx="3" fill="{CAP}" stroke="#7d828a"/>')
    o.append(f'<rect x="{lx+106}" y="{ly-24}" width="22" height="48" rx="3" fill="{CAP}" stroke="#7d828a"/>')
    # капли припоя
    for px in (lx + 11, lx + 117):
        o.append(f'<ellipse cx="{px}" cy="{ly}" rx="16" ry="15" fill="{SOLDER}" stroke="#8d9199" stroke-width="1.6" opacity="0.92"/>')
    o.append(f'<text x="{lx+64}" y="{ly+6}" font-size="12" font-weight="700" fill="#4a3a10" text-anchor="middle">2A</text>')
    o.append(f'<text x="{lx+210}" y="{ly+5}" font-size="12.5" font-weight="700" fill="{ORA}">'
             f'← ножки: обрезки от резисторов</text>')

    steps2 = [
        "•  Положи деталь на малярный скотч липкой стороной вверх —",
        "    он удержит её, пока паяешь (третьей руки нет).",
        "•  Капни флюс-гель на оба торца.",
        "•  Залуди сначала торцы детали, потом кончики ножек.",
        "•  Приложи ножку к торцу и коснись жалом на 2 сек — схватится.",
        "•  Жало C245-KU, температура 300–320 °C (ПОС-63 плавится при 183).",
    ]
    for i, t in enumerate(steps2):
        o.append(f'<text x="60" y="{452+i*22}" font-size="13" fill="#333">{t}</text>')

    o.append(f'<text x="60" y="600" font-size="13" fill="#333">'
             f'•  Надень термоусадку на корпус — чтобы ножки не замкнулись.</text>')
    o.append(f'<text x="60" y="622" font-size="13" fill="#333">'
             f'•  Ножки загни так, чтобы расстояние между ними было <tspan font-weight="700">5 мм</tspan> (2 шага макетки).</text>')

    # ═══════════ ШАГ 3: воткнуть ═══════════
    o.append(step_head(700, 128, "3", "Воткнуть в кол.44 и кол.46"))

    # фрагмент макетки
    B0, PITCH = 760, 58
    ROWS = [200, 258, 316]
    o.append(f'<rect x="{B0-60}" y="170" width="400" height="190" rx="10" fill="{BOARD}" stroke="{BSTK}" stroke-width="2"/>')
    for i in range(5):
        for y in ROWS:
            o.append(f'<rect x="{B0+i*PITCH-8}" y="{y-8}" width="16" height="16" rx="3" '
                     f'fill="#fff" stroke="{HOLE}" stroke-width="2"/>')
    for i, n in enumerate((44, 45, 46, 47, 48)):
        o.append(f'<text x="{B0+i*PITCH}" y="{160}" font-size="13" '
                 f'font-weight="{700 if n in (44,46) else 400}" '
                 f'fill="{INK if n in (44,46) else "#999"}" text-anchor="middle">{n}</text>')

    # деталь на макетке (кол.44 ↔ кол.46, ряд g = ROWS[1])
    yg = ROWS[1]
    x44, x46 = B0, B0 + 2 * PITCH
    o.append(f'<line x1="{x44}" y1="{yg}" x2="{x44+18}" y2="{yg-30}" stroke="{LEG}" stroke-width="3.4" stroke-linecap="round"/>')
    o.append(f'<line x1="{x46}" y1="{yg}" x2="{x46-18}" y2="{yg-30}" stroke="{LEG}" stroke-width="3.4" stroke-linecap="round"/>')
    o.append(f'<rect x="{x44+18}" y="{yg-44}" width="{(x46-18)-(x44+18)}" height="28" rx="4" '
             f'fill="{BODY}" stroke="#a8862c" stroke-width="2"/>')
    o.append(f'<text x="{(x44+x46)/2:.0f}" y="{yg-25}" font-size="11" font-weight="700" '
             f'fill="#4a3a10" text-anchor="middle">F1 · 2A</text>')
    for px in (x44, x46):
        o.append(f'<circle cx="{px}" cy="{yg}" r="6" fill="#5a4a20"/>')

    o.append(f'<text x="{(x44+x46)/2:.0f}" y="392" font-size="13.5" font-weight="700" '
             f'fill="{GRN}" text-anchor="middle">на место жёлтого, который вынул</text>')
    o.append(f'<text x="{(x44+x46)/2:.0f}" y="414" font-size="12.5" fill="#555" '
             f'text-anchor="middle">и убери временную перемычку</text>')

    # ═══════════ ПРЕДУПРЕЖДЕНИЕ ═══════════
    o.append(f'<rect x="700" y="440" width="560" height="120" rx="12" fill="#fdf3f2" '
             f'stroke="{RED}" stroke-width="2.4"/>')
    o.append(f'<text x="724" y="472" font-size="16" font-weight="700" fill="{RED}">'
             f'⚠  PolySwitch боится долгого нагрева</text>')
    o.append(f'<text x="724" y="498" font-size="13" fill="#7a2820">'
             f'Это полимер, а не металл. Если греть дольше 3–4 секунд,</text>')
    o.append(f'<text x="724" y="518" font-size="13" fill="#7a2820">'
             f'номинал «уплывёт» и получится второй такой же сюрприз.</text>')
    o.append(f'<text x="724" y="544" font-size="13" font-weight="700" fill="{RED}">'
             f'Паяй быстро, дай остыть между двумя торцами.</text>')

    # ═══════════ КОНТРОЛЬ ═══════════
    o.append(f'<rect x="700" y="578" width="560" height="96" rx="12" fill="#eefaf1" '
             f'stroke="{GRN}" stroke-width="2.4"/>')
    o.append(f'<text x="724" y="608" font-size="16" font-weight="700" fill="{GRN}">'
             f'✓  После пайки — обязательно померь ещё раз</text>')
    o.append(f'<text x="724" y="634" font-size="13" fill="#14532d">'
             f'Сопротивление (минус щупы) должно остаться <tspan font-weight="700">0.05–0.15 Ω</tspan>.</text>')
    o.append(f'<text x="724" y="656" font-size="13" fill="#14532d">'
             f'Стало сильно больше — перегрел, бери следующий из десяти.</text>')

    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="{FONT}">' \
           + "".join(o) + '</svg>'


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "f1_mount.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build())
    print("wrote", out, os.path.getsize(out), "bytes")
