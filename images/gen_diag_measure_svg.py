# -*- coding: utf-8 -*-
"""Схема ФИКСА «что и где поставить/укрепить» (батарейный brownout).
Берёт combined_full.svg, кропает на плату+модули и наносит:
  ① силовой путь батареи — пропаять (главное),
  ② C3 470–1000µF на +5В LOAD рельс — буфер VIN (нарисован),
  ③ Boost#2 ~5.1В — уже ок.
Справа — панель из трёх карточек с пояснениями."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

src = os.path.join(os.path.dirname(__file__), "combined_full.svg")
with open(src, encoding="utf-8") as f:
    combined = f.read()

# распотрошим внешний <svg>…</svg>, оставим внутренности (плата + модули)
inner = combined[combined.index(">") + 1 : combined.rindex("</svg>")]

RED, BLU, GRN = "#c0392b", "#2a6fd1", "#2e7d32"

def badge(px, py, color, num):
    return (f'<circle cx="{px}" cy="{py}" r="14" fill="{color}" opacity="0.14"/>'
            f'<circle cx="{px}" cy="{py}" r="13" fill="none" stroke="{color}" stroke-width="2"/>'
            f'<circle cx="{px}" cy="{py}" r="9.5" fill="#fff" stroke="{color}" stroke-width="3"/>'
            f'<text x="{px}" y="{py+4}" font-size="12" font-weight="700" fill="{color}" '
            f'text-anchor="middle">{num}</text>')

# ---- ② C3 470–1000µF: нарисованный электролит НАД верхними рельсами (+5В LOAD ↔ GND) ----
c3 = f'''<g font-family="Segoe UI, Arial, sans-serif">
  <text x="1010" y="190" font-size="11.5" font-weight="700" fill="{BLU}" text-anchor="middle">C3 · 470–1000 µF</text>
  <rect x="985" y="198" width="50" height="34" rx="6" fill="#eef4fd" stroke="{BLU}" stroke-width="2.2"/>
  <rect x="1027" y="198" width="8" height="34" rx="2" fill="#cfe0f7" stroke="{BLU}" stroke-width="1"/>
  <text x="1031" y="219" font-size="11" font-weight="700" fill="{BLU}" text-anchor="middle">−</text>
  <text x="1000" y="219" font-size="11" font-weight="700" fill="{RED}" text-anchor="middle">+</text>
  <line x1="997" y1="232" x2="997" y2="250" stroke="{RED}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="997" cy="250" r="4" fill="{RED}"/>
  <line x1="1023" y1="232" x2="1023" y2="262" stroke="#1a1a1a" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="1023" cy="262" r="4" fill="#1a1a1a"/>
  {badge(963, 209, BLU, "2")}</g>'''

# ---- ① силовой путь батареи (метки на ключевых точках пайки) ----
path_hl = f'''<g fill="none" stroke="{RED}" stroke-width="9" stroke-linecap="round" opacity="0.16">
    <path d="M1213 753 C 1213 560, 900 536, 819 478"/>
    <path d="M819 478 L 853 442"/>
    <path d="M300 650 C 322 616, 356 616, 378 650"/>
  </g>
  <g fill="none" stroke="{bb.PURPLE}" stroke-width="9" stroke-linecap="round" opacity="0.16">
    <path d="M827 753 C 660 812, 380 812, 252 650"/>
  </g>'''
p1 = badge(836, 442, RED, "1")      # F1 / кол.44–46 → B+
p2 = badge(252, 650, RED, "1")      # B− (минус батареи)
p3 = badge(339, 650, RED, "1")      # TP4056 OUT+ → Boost IN+ (толстый провод)

# ---- ③ Boost#2 ~5.1В — ок ----
b3 = badge(445, 650, GRN, "3")

# ---- правая панель: 3 карточки ----
def card(x, y, w, h, accent, fill):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" '
            f'stroke="{accent}" stroke-width="2"/>'
            f'<rect x="{x}" y="{y}" width="6" height="{h}" rx="3" fill="{accent}"/>')

PX, PW = 1440, 360
panel = f'''<g font-family="Segoe UI, Arial, sans-serif">
  <text x="{PX}" y="222" font-size="18" font-weight="700" fill="#1a1a1a">Фикс batter­y-brownout — что и где</text>

  {card(PX, 240, PW, 190, RED, "#fdf3f2")}
  <text x="{PX+20}" y="266" font-size="14.5" font-weight="700" fill="{RED}">① Силовой путь батареи — ПРОПАЯТЬ</text>
  <text x="{PX+20}" y="287" font-size="12.5" fill="#333">Корень brownout: рыхлые контакты дают</text>
  <text x="{PX+20}" y="305" font-size="12.5" fill="#333">просадку <tspan font-weight="700">3.9 → 2.84 В</tspan> под нагрузкой.</text>
  <text x="{PX+20}" y="327" font-size="12.5" fill="#333">Пропаяй, убери с пружин макетки:</text>
  <text x="{PX+20}" y="346" font-size="12.5" fill="#333">• +пакета → кол.44 → <tspan font-weight="700">F1</tspan> → кол.46 → <tspan font-weight="700">B+</tspan></text>
  <text x="{PX+20}" y="364" font-size="12.5" fill="#333">• −пакета → <tspan font-weight="700" fill="{bb.PURPLE}">B−</tspan>  (фиолетовый)</text>
  <text x="{PX+20}" y="382" font-size="12.5" fill="#333">• толстые: TP4056 <tspan font-weight="700">OUT+</tspan> → Boost <tspan font-weight="700">IN+</tspan>,</text>
  <text x="{PX+20}" y="400" font-size="12.5" fill="#333">  Boost <tspan font-weight="700">OUT+</tspan> → кол.30</text>
  <text x="{PX+20}" y="420" font-size="12.5" font-weight="700" fill="{RED}">Цель: под нагрузкой ≥ 3.7–3.8 В.</text>

  {card(PX, 448, PW, 150, BLU, "#eef4fd")}
  <text x="{PX+20}" y="474" font-size="14.5" font-weight="700" fill="{BLU}">② C3 470–1000 µF на +5 В (буфер VIN)</text>
  <text x="{PX+20}" y="496" font-size="12.5" fill="#333">Электролит между верхним <tspan font-weight="700" fill="{RED}">«+» LOAD</tspan></text>
  <text x="{PX+20}" y="514" font-size="12.5" fill="#333">рельсом и <tspan font-weight="700">«−» GND</tspan>, рядом с VIN ESP32.</text>
  <text x="{PX+20}" y="536" font-size="12.5" fill="#333"><tspan font-weight="700" fill="{RED}">«+»</tspan> (длинная ножка) → LOAD,</text>
  <text x="{PX+20}" y="554" font-size="12.5" fill="#333"><tspan font-weight="700">«−»</tspan> (полоса) → GND.  <tspan font-weight="700" fill="{RED}">Не перепутай!</tspan></text>
  <text x="{PX+20}" y="576" font-size="12.5" fill="#333">Гасит броски тока на WiFi-передаче →</text>
  <text x="{PX+20}" y="590" font-size="12.5" font-weight="700" fill="{BLU}">ESP32 не ребутится по brownout.</text>

  {card(PX, 616, PW, 92, GRN, "#eef7ee")}
  <text x="{PX+20}" y="642" font-size="14.5" font-weight="700" fill="{GRN}">③ Boost#2 ≈ 5.1 В — уже ок</text>
  <text x="{PX+20}" y="664" font-size="12.5" fill="#333">У тебя <tspan font-weight="700">5.14 В</tspan> — запас над dropout</text>
  <text x="{PX+20}" y="682" font-size="12.5" fill="#333">AMS1117 (нужно ≥4.3 В на входе) есть.</text>
  <text x="{PX+20}" y="700" font-size="12.5" font-weight="700" fill="{GRN}">Не трогай.</text>
</g>'''

X0, Y0, W, H = 0, 164, 1810, 656
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0} {Y0} {W} {H}" '
       f'font-family="Segoe UI, Arial, sans-serif">'
       f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" fill="#ffffff"/>'
       f'{inner}{path_hl}{c3}{p1}{p2}{p3}{b3}{panel}</svg>')

out = os.path.join(os.path.dirname(__file__), "diag_measure.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
