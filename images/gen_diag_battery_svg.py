# -*- coding: utf-8 -*-
"""ОТЛАДКА «станция не стартует от батареи» — вид макетки (2026-07-18).

Берёт закоммиченный combined_full.svg (реальная сборка 04+05, как у пользователя
на столе) и наносит поверх:
  • подсветку пути разрядного тока батарея → F1 → TP4056 → Boost#2 → D2 → шина
  • 4 точки замера с ожидаемыми значениями
  • два подозреваемых узла: F1 (номинал не проверен) и защита FS8205A (OCP)

Контекст: замена TP4056 не помогла (2 платы ведут себя одинаково) → брак модуля
исключён, причина системная. Ищем, где просаживается разрядный ток.

Генерация:  python images/gen_diag_battery_svg.py  →  images/diag_battery.svg
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

src = os.path.join(os.path.dirname(__file__), "combined_full.svg")
with open(src, encoding="utf-8") as f:
    combined = f.read()
inner = combined[combined.index(">") + 1: combined.rindex("</svg>")]

RED, BLU, GRN, ORA = "#c0392b", "#2a6fd1", "#2e7d32", "#c47015"
PUR = bb.PURPLE

# ── реальные координаты из combined_full.svg ────────────────────────────────
C44, C46, C48, C50 = bb.colx(44), bb.colx(46), bb.colx(48), bb.colx(50)   # 819 853 887 921
TP_INp, TP_INm, TP_OUTm, TP_Bm, TP_Bp, TP_OUTp = 120, 148, 228, 252, 276, 300
BO_INp, BO_OUTp = 378, 486
MODY = 650


def badge(px, py, color, num, r=15):
    return (f'<circle cx="{px}" cy="{py}" r="{r}" fill="{color}" opacity="0.15"/>'
            f'<circle cx="{px}" cy="{py}" r="{r-1}" fill="none" stroke="{color}" stroke-width="2"/>'
            f'<circle cx="{px}" cy="{py}" r="{r-5}" fill="#fff" stroke="{color}" stroke-width="3"/>'
            f'<text x="{px}" y="{py+4}" font-size="12" font-weight="700" fill="{color}" '
            f'text-anchor="middle">{num}</text>')


def probes(xr, yr, xb, yb, color=RED):
    """Красный щуп в (xr,yr), чёрный в (xb,yb) + пунктир между ними."""
    return (f'<line x1="{xr}" y1="{yr}" x2="{xb}" y2="{yb}" stroke="{color}" '
            f'stroke-width="2" stroke-dasharray="4 3" opacity="0.75"/>'
            f'<circle cx="{xr}" cy="{yr}" r="6.5" fill="{RED}" stroke="#fff" stroke-width="1.6"/>'
            f'<circle cx="{xb}" cy="{yb}" r="6.5" fill="#111" stroke="#fff" stroke-width="1.6"/>')


def note(x, y, text, color=RED, size=11, bold=True, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" '
            f'{"font-weight=\"700\"" if bold else ""} fill="{color}">{text}</text>')


# ── 1. ПУТЬ РАЗРЯДНОГО ТОКА (подсветка поверх реальных проводов) ────────────
current_path = f'''<g fill="none" stroke="{RED}" stroke-width="11" stroke-linecap="round" opacity="0.17">
    <path d="M1213 753 C 1213 560, 900 536, 819 482"/>
    <path d="M{C44} 478 L {C44} 424"/>
    <path d="M{C44} 424 L {C46} 424"/>
    <path d="M276 650 C 276 582, 838 592, 853 478"/>
    <path d="M{C46} 478 L {C46} 424"/>
    <path d="M300 650 C 322 616, 356 616, 378 650"/>
    <path d="M486 650 C 486 574, 575 560, 581 478"/>
    <path d="M581 424 L 632 424"/>
    <path d="M632 478 L 632 506"/>
  </g>
  <g fill="none" stroke="{PUR}" stroke-width="11" stroke-linecap="round" opacity="0.15">
    <path d="M827 753 C 660 812, 380 812, 252 650"/>
  </g>'''

# ── 2. ТОЧКИ ЗАМЕРА ─────────────────────────────────────────────────────────
# ⑤ падение на F1 (кол.44 ↔ кол.46, ряд i)
m5 = (probes(C46, 460, C44, 460)
      + f'<path d="M{C44+17} 470 L {C44+17} 548" stroke="{RED}" stroke-width="2" stroke-dasharray="4 3"/>'
      + badge(C44 + 17, 562, RED, "5")
      + note(C44 + 38, 558, "падение на F1", RED, 11)
      + note(C44 + 38, 573, "норма &lt; 0.1 В", "#8a3b30", 10, False))

# ④ падение на защите TP4056 (B− ↔ OUT−)
m4 = (probes(TP_Bm, MODY, TP_OUTm, MODY)
      + badge(TP_Bm + 46, MODY - 22, RED, "4")
      + note(TP_OUTm - 34, MODY - 44, "падение на защите B−↔OUT−", RED, 11)
      + note(TP_OUTm - 34, MODY - 58, "норма &lt; 0.05 В · у тебя было 0.3 В", "#8a3b30", 10, False))

# ② TP_B+ (кол.46, ряд h)
m2 = (badge(C46, 442, ORA, "2")
      + note(C46 + 22, 436, "TP_B+ · ждём 3.98 В", ORA, 11))

# ③ TP4056 OUT+  (подпись влево, на тёмное поле модуля — светлым)
m3 = (badge(TP_OUTp, MODY + 46, ORA, "3")
      + note(TP_OUTp - 18, MODY + 42, "OUT+", "#f0b96a", 11, True, "end")
      + note(TP_OUTp - 18, MODY + 58, "ждём 3.9 В", "#f0b96a", 10, False, "end"))

# ① узел X (кол.48, ряд g) — проверка делителя
m1 = (badge(C48, 424, GRN, "1")
      + note(C48 + 20, 400, "узел X · 1.99 В", GRN, 11))

# ── 3. ВЫНОСКИ-ПОДОЗРЕВАЕМЫЕ ────────────────────────────────────────────────
susp_f1 = f'''<g>
  <rect x="{C44-104}" y="300" width="250" height="74" rx="9" fill="#fdf6ec" stroke="{ORA}" stroke-width="2.4"/>
  <path d="M{C44+20} 374 L {C44+20} 400" stroke="{ORA}" stroke-width="2" stroke-dasharray="4 3"/>
  <text x="{C44-90}" y="322" font-size="12.5" font-weight="700" fill="{ORA}">ПОДОЗРЕВАЕМЫЙ №2 — F1</text>
  <text x="{C44-90}" y="340" font-size="11" fill="#7a4a12">Номинал НИКОГДА не проверялся.</text>
  <text x="{C44-90}" y="356" font-size="11" fill="#7a4a12">Жёлтые диски 0.1–3 A одинаковы</text>
  <text x="{C44-90}" y="368" font-size="10.5" fill="#7a4a12">на вид. Малый = тепловой разгон.</text>
</g>'''

susp_prot = f'''<g>
  <rect x="30" y="796" width="330" height="74" rx="9" fill="#fff5f4" stroke="{RED}" stroke-width="2.4"/>
  <path d="M195 796 L 240 668" stroke="{RED}" stroke-width="2" stroke-dasharray="4 3"/>
  <text x="46" y="816" font-size="12.5" font-weight="700" fill="{RED}">ПОДОЗРЕВАЕМЫЙ №1 — защита FS8205A</text>
  <text x="46" y="833" font-size="11" fill="#8a3b30">0.3 В на B−↔OUT− при 0.8 A → Rds ≈ 375 мΩ</text>
  <text x="46" y="848" font-size="11" fill="#8a3b30">(клон; норма 50 мΩ). Порог OCP DW01A 150 мВ</text>
  <text x="46" y="863" font-size="11" font-weight="700" fill="{RED}">→ защита уходит в отсечку. Обе платы такие.</text>
</g>'''

# ── 4. ПРАВАЯ ПАНЕЛЬ ────────────────────────────────────────────────────────
def card(x, y, w, h, accent, fill):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" '
            f'stroke="{accent}" stroke-width="2"/>'
            f'<rect x="{x}" y="{y}" width="6" height="{h}" rx="3" fill="{accent}"/>')


PX, PW = 1400, 400
T = PX + 20
panel = f'''<g font-family="Segoe UI, Arial, sans-serif">
  <text x="{PX}" y="212" font-size="19" font-weight="700" fill="#1a1a1a">Четыре замера — найти, где падает</text>
  <text x="{PX}" y="234" font-size="12.5" fill="#666">Батарея вставлена, SW1 включён, станция ПОД НАГРУЗКОЙ.</text>
  <text x="{PX}" y="250" font-size="12.5" fill="#666">Замена TP4056 не помогла → ищем не модуль, а узел.</text>

  {card(PX, 266, PW, 116, RED, "#fdf3f2")}
  <text x="{T}" y="292" font-size="14.5" font-weight="700" fill="{RED}">⑤ НАЧНИ ОТСЮДА — падение на F1</text>
  <text x="{T}" y="313" font-size="12.5" fill="#333">Щупы прямо на две ноги <tspan font-weight="700">F1</tspan> (кол.44 и кол.46).</text>
  <text x="{T}" y="331" font-size="12.5" fill="#333">Исправный 2 A PPTC при 0.4 A даёт <tspan font-weight="700">&lt; 0.1 В</tspan>.</text>
  <text x="{T}" y="352" font-size="12.5" fill="{RED}" font-weight="700">Увидел 0.5–1.5 В → F1 виноват, вопрос закрыт.</text>
  <text x="{T}" y="371" font-size="11.5" fill="#666">Проверка: закоротить F1 перемычкой → заработало?</text>

  {card(PX, 396, PW, 116, RED, "#fdf3f2")}
  <text x="{T}" y="422" font-size="14.5" font-weight="700" fill="{RED}">④ Падение на защите TP4056</text>
  <text x="{T}" y="443" font-size="12.5" fill="#333">Щупы на пады <tspan font-weight="700">B−</tspan> и <tspan font-weight="700">OUT−</tspan> самого модуля.</text>
  <text x="{T}" y="461" font-size="12.5" fill="#333">Норма <tspan font-weight="700">&lt; 0.05 В</tspan>. У тебя раньше было <tspan font-weight="700">0.3 В</tspan>.</text>
  <text x="{T}" y="482" font-size="12.5" fill="{RED}" font-weight="700">0.3 В → защита душит ток (клон FS8205A).</text>
  <text x="{T}" y="501" font-size="11.5" fill="#666">Фикс: разряд мимо TP4056 через BMS 1S (есть 2 шт).</text>

  {card(PX, 526, PW, 100, ORA, "#fdf6ec")}
  <text x="{T}" y="552" font-size="14.5" font-weight="700" fill="{ORA}">② и ③ — где именно просело</text>
  <text x="{T}" y="573" font-size="12.5" fill="#333">Мерь оба под нагрузкой, чёрный щуп на «−» рельс:</text>
  <text x="{T}" y="592" font-size="12.5" fill="#333">② <tspan font-weight="700">кол.46</tspan> просел → проблема ДО модуля (F1).</text>
  <text x="{T}" y="611" font-size="12.5" fill="#333">③ ② держит, а <tspan font-weight="700">OUT+</tspan> просел → внутри (защита).</text>

  {card(PX, 640, PW, 82, GRN, "#eef7ee")}
  <text x="{T}" y="666" font-size="14.5" font-weight="700" fill="{GRN}">① узел X — делитель (задача 05)</text>
  <text x="{T}" y="687" font-size="12.5" fill="#333">Кол.48. Ждём <tspan font-weight="700">1.99 В и РОВНО</tspan>.</text>
  <text x="{T}" y="706" font-size="12.5" fill="#333">Это отдельная проверка, к brownout не относится.</text>

  {card(PX, 736, PW, 92, BLU, "#eef4fd")}
  <text x="{T}" y="762" font-size="14.5" font-weight="700" fill="{BLU}">Бесплатный тест — без паяльника</text>
  <text x="{T}" y="783" font-size="12.5" fill="#333">В прошивку: <tspan font-weight="700">WiFi.setTxPower(WIFI_POWER_8_5dBm)</tspan></text>
  <text x="{T}" y="801" font-size="12.5" fill="#333">Пик тока падает. Стартовала от батареи →</text>
  <text x="{T}" y="819" font-size="12.5" font-weight="700" fill="{BLU}">подтверждена токовая отсечка (версия №1).</text>
</g>'''

# ── 5. ЗАГОЛОВОК + подпись пути ─────────────────────────────────────────────
head = f'''<g font-family="Segoe UI, Arial, sans-serif">
  <text x="30" y="196" font-size="22" font-weight="700" fill="#1a1a1a">Отладка: не стартует от батареи — куда ставить щупы</text>
  <text x="30" y="218" font-size="12.5" fill="#666">Твоя текущая сборка. Розовым подсвечен путь разрядного тока: ~0.35 A средний, ~0.8 A пик на WiFi-передаче.</text>
  <text x="700" y="770" font-size="12" font-weight="700" fill="{PUR}">фиолетовый: «−» пакета → B− (мимо GND) — так и должно быть</text>
</g>'''

X0, Y0, W, H = 0, 170, 1830, 716
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0} {Y0} {W} {H}" '
       f'font-family="Segoe UI, Arial, sans-serif">'
       f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" fill="#ffffff"/>'
       # маска: гасим начало «Полной цепи монтажа» из исходника, попадающее в кроп
       f'{inner}<rect x="{X0}" y="874" width="{W}" height="50" fill="#ffffff"/>'
       f'{current_path}{susp_f1}{susp_prot}'
       f'{m5}{m4}{m2}{m3}{m1}{head}{panel}</svg>')

out = os.path.join(os.path.dirname(__file__), "diag_battery.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
