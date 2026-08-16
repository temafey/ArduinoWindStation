# -*- coding: utf-8 -*-
"""
СТАНДАРТ блоков «вид макетки» для гайдов метеостанции.
Единственный источник истины по внешнему виду блоков.
Эталон, из которого выведен стандарт: images/breadboard_sample_current.svg (ESP32 DOIT V1 30-pin).

Все генераторы возвращают строку SVG. Геометрия макетки общая:
    колонка N  →  x = 88 + (N-1)*17         (шаг 17)
    верхний банк (ряды a–e):  y отверстий 298,316,334,352,370
    нижний банк (ряды f–j):   y отверстий 406,424,442,460,478
    рельсы: верх +@242/−@270, низ (параметр) ; полосы отверстий r1..r4
"""

# ---- палитра стандарта ----
PLUS       = "#d23b2e"   # питание «+»
GNDc       = "#1a1a1a"   # земля «−»
RAIL_BLUE  = "#2a5bd7"
WARM       = "#c9a9a0"   # полоса отверстий «+» рельса
COOL       = "#a0aac9"   # полоса отверстий «−» рельса
HOLE       = "#b9b09a"
BOARD_FILL = "#f4f0e6"; BOARD_STK = "#d8d2c0"; TRENCH = "#e9e3d3"
ESP_BODY   = "#1f1f22"
PAD_ADC    = "#6aa9e0"   # АЦП-пины 32/35/34
PAD_UNUSED = "#e8c14a"   # незадействованный пин
PAD_GND    = "#999"
LED_G      = "#34c24a"; LED_Y = "#e0a81a"; LED_R = "#e8873a"; LED_WIFI = "#2a7de1"; LED_ERR = "#cfcfcf"
RES_BODY   = "#d9c79c"; RES_LEG = "#9a8f6a"
CONT_FILL  = "#f4f0e6"; CONT_STK = "#d8d2c0"   # контейнер модуля/пакета (как батарейный блок эталона)
COPPER     = "#8a6d3b"
SIG        = "#e58f2a"   # сигнальный (ADC) провод
PURPLE     = "#8e44ad"   # BATT− отдельная сеть
# --- реалистичные модули (PCB как ESP32) ---
PCB_DARK   = "#17181c"   # чёрный текстолит (TP4056/boost)
PCB_EDGE   = "#33343b"
SILK       = "#d9dbe0"   # шелкография (светлый текст на плате)
SILK_DIM   = "#9aa0a8"
GOLD       = "#c9a63a"   # металлизация отверстий
SILVER     = "#c2c7cf"   # металл разъёма
PAD_GNDp   = "#a7abb3"   # GND-пад на тёмной плате (чтобы был виден)

# band-цвета резисторов (5-полосных): цифры/множители
BAND = {"0":"#1a1a1a","1":"#7a4a12","2":"#c00","3":"#e8873a","4":"#e0c020",
        "5":"#2e8b3d","6":"#2a6fd1","7":"#7a3fb0","8":"#888","9":"#eee",
        "gold":"#c9a227","orange":"#e8873a","brown":"#7a4a12","black":"#1a1a1a"}

def colx(n):  return 88 + (n-1)*17
ROWY = {"a":298,"b":316,"c":334,"d":352,"e":370,"f":406,"g":424,"h":442,"i":460,"j":478}

# ============================================================= BREADBOARD
def breadboard(bottom="+-", ncols=58):
    """bottom='+-' → нижняя пара +@498/−@526 (step04/05); '-+' → −@490/+@524 (эталон).
    ncols — число колонок платы. default 58 = байт-в-байт как раньше (right=1078).
    Реальная MB-102 = 63 колонки; v4 передаёт ncols=63."""
    right = colx(ncols) + 21              # правый край платы (58 → 1078, как было)
    bw = right - 74                        # ширина корпуса платы
    rw = right - 86                        # ширина цветных полос рельсов (x78 → right-8)
    hw = right - 92                        # ширина зон отверстий (x80 → right-12)
    if bottom == "+-":
        b_top_y, b_top_c, b_bot_y, b_bot_c = 498, PLUS, 526, RAIL_BLUE
        r3c, r4c = WARM, COOL
        lbl_top, lbl_bot = ("+", PLUS), ("−", RAIL_BLUE)
    else:
        b_top_y, b_top_c, b_bot_y, b_bot_c = 490, RAIL_BLUE, 524, PLUS
        r3c, r4c = COOL, WARM
        lbl_top, lbl_bot = ("−", RAIL_BLUE), ("+", PLUS)
    col_lbls = "".join(f'<text x="{colx(c)}" y="286">{c}</text>'
                       for c in range(20, ncols + 1, 5))
    s = f'''<!-- BREADBOARD (стандарт) -->
  <rect x="74" y="232" width="{bw}" height="298" rx="12" fill="{BOARD_FILL}" stroke="{BOARD_STK}" stroke-width="2"/>
  <rect x="78" y="242" width="{rw}" height="2" fill="{PLUS}"/>
  <rect x="78" y="270" width="{rw}" height="2" fill="{RAIL_BLUE}"/>
  <rect x="78" y="{b_top_y}" width="{rw}" height="2" fill="{b_top_c}"/>
  <rect x="78" y="{b_bot_y}" width="{rw}" height="2" fill="{b_bot_c}"/>
  <text x="60" y="254" font-size="13" fill="{PLUS}" font-weight="700">+</text>
  <text x="60" y="266" font-size="13" fill="{RAIL_BLUE}" font-weight="700">−</text>
  <text x="60" y="{b_top_y+12}" font-size="13" fill="{lbl_top[1]}" font-weight="700">{lbl_top[0]}</text>
  <text x="60" y="{b_bot_y-2}" font-size="13" fill="{lbl_bot[1]}" font-weight="700">{lbl_bot[0]}</text>
  <rect x="80" y="246" width="{hw}" height="8" fill="url(#r1)"/>
  <rect x="80" y="258" width="{hw}" height="8" fill="url(#r2)"/>
  <rect x="80" y="290" width="{hw}" height="88" fill="url(#hA)"/>
  <rect x="80" y="398" width="{hw}" height="88" fill="url(#hB)"/>
  <rect x="80" y="502" width="{hw}" height="8" fill="url(#r3)"/>
  <rect x="80" y="514" width="{hw}" height="8" fill="url(#r4)"/>
  <rect x="74" y="380" width="{bw}" height="16" fill="{TRENCH}"/>
  <g font-size="11" fill="#999">
    <text x="66" y="302">a</text><text x="66" y="320">b</text><text x="66" y="338">c</text><text x="66" y="356">d</text><text x="66" y="374">e</text>
    <text x="66" y="410">f</text><text x="66" y="428">g</text><text x="66" y="446">h</text><text x="66" y="464">i</text><text x="66" y="482">j</text>
  </g>
  <g font-size="10" fill="#aaa" text-anchor="middle">
    {col_lbls}
  </g>'''
    return s, r3c, r4c

def defs(r3c, r4c):
    return f'''<defs>
    <pattern id="hA" patternUnits="userSpaceOnUse" width="17" height="18" x="88" y="298"><circle cx="0" cy="0" r="2.1" fill="{HOLE}"/></pattern>
    <pattern id="hB" patternUnits="userSpaceOnUse" width="17" height="18" x="88" y="406"><circle cx="0" cy="0" r="2.1" fill="{HOLE}"/></pattern>
    <pattern id="r1" patternUnits="userSpaceOnUse" width="17" height="8" x="88" y="246"><circle cx="0" cy="4" r="2.1" fill="{WARM}"/></pattern>
    <pattern id="r2" patternUnits="userSpaceOnUse" width="17" height="8" x="88" y="258"><circle cx="0" cy="4" r="2.1" fill="{COOL}"/></pattern>
    <pattern id="r3" patternUnits="userSpaceOnUse" width="17" height="8" x="88" y="502"><circle cx="0" cy="4" r="2.1" fill="{r3c}"/></pattern>
    <pattern id="r4" patternUnits="userSpaceOnUse" width="17" height="8" x="88" y="514"><circle cx="0" cy="4" r="2.1" fill="{r4c}"/></pattern>
  </defs>'''

# ============================================================= ESP32 (стандарт, 30-pin)
# порядок пинов эталона
ESP_TOP = [("VIN",PLUS),("GND",PAD_GND),("13",PAD_UNUSED),("12",PAD_UNUSED),("14",LED_R),
           ("27",LED_Y),("26",LED_G),("25",LED_WIFI),("33",LED_ERR),("32",PAD_ADC),
           ("35",PAD_ADC),("34",PAD_ADC),("VN",PAD_UNUSED),("VP",PAD_UNUSED),("EN",PAD_UNUSED)]
ESP_BOT = ["3V3","15","2","0","4","16","17","5","18","19","21","RX","TX","22","23"]

# точки подключения проводов (центр пина). верх: y=311 (провод вверх). низ: y=481 (провод вниз)
PIN_TOP = {name: 88+17*k for k,(name,_) in enumerate(ESP_TOP)}
PIN_BOT = {name: 88+17*k for k,name in enumerate(ESP_BOT)}

def esp32(subtitle="задачи 01–03 ✓ · питание по USB", highlight=None, adc_callout=None, usb_label="USB-C"):
    """highlight: список имён верхних пинов (обвести кольцом активные).
       adc_callout: текст выноски АЦП или None."""
    highlight = highlight or []
    top_pads, top_lbls = [], []
    for k,(name,col) in enumerate(ESP_TOP):
        x = 82+17*k
        top_pads.append(f'<rect x="{x}" y="311" width="12" height="10" rx="2" fill="{col}"/>')
        top_lbls.append(f'<text x="{x+6}" y="308">{name}</text>')
    bot_pads, bot_lbls = [], []
    for k,name in enumerate(ESP_BOT):
        x = 82+17*k
        bot_pads.append(f'<rect x="{x}" y="471" width="12" height="10" rx="2" fill="{PAD_UNUSED}"/>')
        bot_lbls.append(f'<text x="{x+6}" y="493">{name}</text>')
    rings = ""
    for name in highlight:
        cx = PIN_TOP[name]
        rings += (f'<rect x="{cx-8}" y="309" width="16" height="14" rx="3" fill="none" '
                  f'stroke="{SIG}" stroke-width="2.4"/>')
    callout = ""
    if adc_callout:
        callout = (f'<rect x="234" y="323" width="47" height="1.6" fill="{PAD_ADC}"/>'
                   f'<text x="257" y="510" font-size="9.5" fill="#3a7bbf" text-anchor="middle">{adc_callout}</text>')
    return f'''<!-- ESP32 DevKit V1 (стандарт, DOIT 30-pin) -->
  <rect x="54" y="388" width="26" height="18" rx="3" fill="#b8b8b8" stroke="#888"/>
  <text x="34" y="382" font-size="10" fill="#666">{usb_label}</text>
  <rect x="80" y="316" width="262" height="160" rx="8" fill="{ESP_BODY}" stroke="#000"/>
  <text x="150" y="360" font-size="15" fill="#f2f2f2" font-weight="700">ESP32 DevKit V1</text>
  <text x="150" y="378" font-size="11" fill="#9fd">{subtitle}</text>
  <text x="150" y="452" font-size="10" fill="#9aa">распиновка: DOIT DevKit V1 · 30 pin</text>
  <g stroke="#444">{''.join(top_pads)}</g>
  <g font-size="7.5" fill="#333" text-anchor="middle">{''.join(top_lbls)}</g>
  <g stroke="#444">{''.join(bot_pads)}</g>
  <g font-size="7.5" fill="#555" text-anchor="middle">{''.join(bot_lbls)}</g>
  {rings}{callout}'''

# ============================================================= РЕЗИСТОР (эталонный формат)
def resistor(col_l, col_r, row, bands, label="", label_dy=-8, label_fill=COPPER):
    """Горизонтальный резистор между колонками col_l..col_r в ряду row (обычно 2 шага).
       bands: список цветов полос (2–5)."""
    x1, x2, y = colx(col_l), colx(col_r), ROWY[row]
    bx, bw = x1+7, 20
    bands_svg = ""
    n = len(bands); step = bw/(n+1)
    for i,c in enumerate(bands):
        bands_svg += f'<rect x="{bx+3+i*step:.1f}" y="{y-6}" width="2.5" height="12" fill="{c}"/>'
    lbl = f'<text x="{(x1+x2)/2:.0f}" y="{y+label_dy}" font-size="10.5" font-weight="700" fill="{label_fill}" text-anchor="middle">{label}</text>' if label else ""
    return (f'<line x1="{x1}" y1="{y}" x2="{bx}" y2="{y}" stroke="{RES_LEG}" stroke-width="2"/>'
            f'<line x1="{bx+bw}" y1="{y}" x2="{x2}" y2="{y}" stroke="{RES_LEG}" stroke-width="2"/>'
            f'<rect x="{bx}" y="{y-6}" width="{bw}" height="12" rx="2" fill="{RES_BODY}" stroke="{RES_LEG}"/>'
            f'{bands_svg}'
            f'<circle cx="{x1}" cy="{y}" r="3.4" fill="#333"/><circle cx="{x2}" cy="{y}" r="3.4" fill="#333"/>{lbl}')

# ============================================================= LED (эталонный формат)
def led(cx, color, stroke, gpio, sub, muted=False):
    op = ' opacity="0.32"' if muted else ""
    return (f'<g{op}>'
            f'<line x1="{cx-17}" y1="316" x2="{cx-4}" y2="313" stroke="#888" stroke-width="2"/>'
            f'<line x1="{cx+17}" y1="316" x2="{cx+4}" y2="313" stroke="#888" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="306" r="9" fill="{color}" stroke="{stroke}"/>'
            f'<text x="{cx-22}" y="320" font-size="10" fill="#c00">+</text>'
            f'<text x="{cx}" y="346" font-size="11" fill="#444" text-anchor="middle">{gpio}</text>'
            f'<text x="{cx}" y="359" font-size="11" fill="{stroke}" text-anchor="middle">{sub}</text></g>')

# ============================================================= КЕРАМ. КОНДЕНСАТОР 104
def cap_ceramic(col_l, col_r, row, label="C 100нФ"):
    x1, x2, y = colx(col_l), colx(col_r), ROWY[row]
    cx = (x1+x2)/2
    return (f'<line x1="{x1}" y1="{y}" x2="{x1+12:.0f}" y2="{y}" stroke="{RES_LEG}" stroke-width="2.2"/>'
            f'<line x1="{x2-12:.0f}" y1="{y}" x2="{x2}" y2="{y}" stroke="{RES_LEG}" stroke-width="2.2"/>'
            f'<path d="M{x1+12:.0f} {y-4} Q {cx:.0f} {y-12} {x2-12:.0f} {y-4} L{x2-12:.0f} {y+4} Q {cx:.0f} {y+12} {x1+12:.0f} {y+4} Z" fill="#e8b84b" stroke="#a8862c"/>'
            f'<text x="{cx:.0f}" y="{y+3}" font-size="8" fill="#4a3a10" text-anchor="middle">104</text>'
            f'<circle cx="{x1}" cy="{y}" r="3.2" fill="#333"/><circle cx="{x2}" cy="{y}" r="3.2" fill="#333"/>'
            f'<text x="{cx:.0f}" y="{y+19}" font-size="10" fill="{COPPER}" text-anchor="middle">{label}</text>')

# ============================================================= ДИОД ШОТТКИ (полоска-катод)
def diode_schottky(col_l, col_r, row, label="D · 1N5819", cathode="right", label_dy=-14):
    return diode_xy(colx(col_l), colx(col_r), ROWY[row], label, cathode, label_dy)

def diode_xy(x1, x2, y, label="D · 1N5819", cathode="right", label_dy=-14):
    """Тот же диод, но по координатам — для деталей ВНЕ макетки (монтаж точка-в-точку)."""
    bx, bw = x1+16, 22
    stripe_x = bx+bw-5 if cathode == "right" else bx
    return (f'<line x1="{x1}" y1="{y}" x2="{bx}" y2="{y}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<line x1="{bx+bw}" y1="{y}" x2="{x2}" y2="{y}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<rect x="{bx}" y="{y-10}" width="{bw}" height="20" rx="3" fill="#2b2b2b" stroke="#111"/>'
            f'<rect x="{stripe_x}" y="{y-10}" width="5" height="20" fill="#eaeaea"/>'
            f'<circle cx="{x1}" cy="{y}" r="3.4" fill="#333"/><circle cx="{x2}" cy="{y}" r="3.4" fill="#333"/>'
            f'<text x="{bx+bw/2:.0f}" y="{y+label_dy}" font-size="10.5" font-weight="700" fill="{COPPER}" text-anchor="middle">{label}</text>')

# ============================================================= ЭЛЕКТРОЛИТ (полярный)
def cap_electrolytic(col_p, col_m, row, label="1000µF"):
    """col_p — «+» (длинная ножка), col_m — «−» (полоса)."""
    return cap_electrolytic_xy(colx(col_p), colx(col_m), ROWY[row], label)

def cap_electrolytic_xy(xp, xm, y, label="1000µF"):
    """Тот же электролит по координатам — для монтажа вне макетки."""
    x0 = min(xp, xm)
    return (f'<line x1="{xp}" y1="{y}" x2="{xp}" y2="{y-10}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<line x1="{xm}" y1="{y}" x2="{xm}" y2="{y-10}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<rect x="{x0-4}" y="{y-48}" width="42" height="38" rx="7" fill="#2b3a55" stroke="#16233a"/>'
            f'<rect x="{x0+23}" y="{y-48}" width="15" height="38" fill="#9aa9c2" opacity="0.6"/>'
            f'<text x="{x0+15}" y="{y-24}" font-size="8.5" fill="#fff" text-anchor="middle">{label}</text>'
            f'<circle cx="{xp}" cy="{y}" r="3.4" fill="#333"/><circle cx="{xm}" cy="{y}" r="3.4" fill="#333"/>'
            f'<text x="{xp}" y="{y-54}" font-size="13" font-weight="700" fill="{PLUS}" text-anchor="middle">+</text>'
            f'<text x="{xm}" y="{y-54}" font-size="13" font-weight="700" fill="{GNDc}" text-anchor="middle">−</text>')

# ============================================================= PTC
def ptc(col_l, col_r, row, label="F1 · PTC 2A", muted=False):
    x1, x2, y = colx(col_l), colx(col_r), ROWY[row]
    op = ' opacity="0.4"' if muted else ""
    return (f'<g{op}><line x1="{x1}" y1="{y}" x2="{x1+5}" y2="{y-10}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<line x1="{x2}" y1="{y}" x2="{x2-5}" y2="{y-10}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<rect x="{x1+1}" y="{y-38}" width="{x2-x1}" height="28" rx="12" fill="#e3c74a" stroke="#a8862c"/>'
            f'<text x="{(x1+x2)/2:.0f}" y="{y-20}" font-size="8" fill="#4a3a10" text-anchor="middle">PTC</text>'
            f'<circle cx="{x1}" cy="{y}" r="3.4" fill="#333"/><circle cx="{x2}" cy="{y}" r="3.4" fill="#333"/>'
            f'<text x="{(x1+x2)/2:.0f}" y="{y-46}" font-size="10" font-weight="700" fill="{COPPER}" text-anchor="middle">{label}</text></g>')

# ============================================================= МУЛЬТИМЕТР-ТОЧКА
def mm_point(x, y, label, dy=-9, anchor="start"):
    return (f'<circle cx="{x}" cy="{y}" r="5" fill="{PLUS}"/><circle cx="{x+12}" cy="{y}" r="5" fill="#111"/>'
            f'<text x="{x+22 if anchor=="start" else x-14}" y="{y+dy}" font-size="10.5" fill="#333" text-anchor="{anchor}">{label}</text>')

# ============================================================= МОДУЛЬ (контейнер + пины)
def module_box(x, y, w, h, title, subtitle, pins=None, title_fill="#1a1a1a"):
    """pins: список (px, label, color) — контактные пады сверху контейнера (y-6)."""
    pins = pins or []
    ps = ""
    for px,label,color in pins:
        ps += (f'<circle cx="{px}" cy="{y}" r="6" fill="{color}" stroke="#7a5a1a"/>'
               f'<text x="{px}" y="{y-10}" font-size="8.5" fill="{COPPER}" text-anchor="middle">{label}</text>')
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{CONT_FILL}" stroke="{CONT_STK}" stroke-width="2"/>'
            f'<text x="{x+w/2:.0f}" y="{y+30}" font-size="14" font-weight="700" fill="{title_fill}" text-anchor="middle">{title}</text>'
            f'<text x="{x+w/2:.0f}" y="{y+49}" font-size="11" fill="#666" text-anchor="middle">{subtitle}</text>'
            f'{ps}')

# ============================================================= РЕАЛИСТИЧНЫЕ МОДУЛИ (PCB как ESP32)
def _pad(px, py, label, color, side="top", fill=SILK):
    """Один контактный пад. side: top|left|right. Точка соединения провода — (px, py)."""
    if side == "left":
        lx, ly, anchor = px+11, py+3, "start"
    elif side == "right":
        lx, ly, anchor = px-11, py+3, "end"
    else:  # top
        lx, ly, anchor = px, py+15, "middle"
    return (f'<circle cx="{px}" cy="{py}" r="6" fill="{color}" stroke="#efefef" stroke-width="1.3"/>'
            f'<circle cx="{px}" cy="{py}" r="2.3" fill="#0b0b0d"/>'
            f'<text x="{lx}" y="{ly}" font-size="8" font-weight="700" fill="{fill}" text-anchor="{anchor}">{label}</text>')

def _pads_top(pins, y, dy=15, fill=SILK):
    """Пады на верхней кромке: список (px, label, color). Соединение — (px, y)."""
    return "".join(_pad(px, y, label, color, "top", fill) for px, label, color in pins)

def mod_tp4056(x, y, w, h, pins, usb_cx, subtitle="Type-C · заряд + защита"):
    """Чёрный TP4056. Пады на ВЕРХНЕЙ кромке (провода подходят сверху — не прячутся).
       Разъём Type-C — ПО ЦЕНТРУ (снизу, у перегородки) между группой входа (IN±, слева)
       и группой батарея/выход (OUT−,B−,B+,OUT+, справа). usb_cx = центр разъёма/перегородки."""
    cx = x + w/2
    body = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PCB_DARK}" stroke="{PCB_EDGE}" stroke-width="1.6"/>'
            f'<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="8" fill="none" stroke="#000" stroke-opacity="0.45"/>')
    # перегородка ВХОД|ВЫХОД + Type-C по центру снизу
    div = f'<line x1="{usb_cx}" y1="{y+26}" x2="{usb_cx}" y2="{y+h-26}" stroke="#33343b" stroke-width="1" stroke-dasharray="3 3"/>'
    uw, uh = 32, 20; ux = usb_cx-uw/2; uy = y+h-uh+5
    usb = (f'<rect x="{ux:.0f}" y="{uy}" width="{uw}" height="{uh}" rx="8" fill="{SILVER}" stroke="#7d828a"/>'
           f'<rect x="{ux+7:.0f}" y="{uy+5}" width="{uw-14}" height="{uh-10}" rx="4" fill="#3a3d43"/>'
           f'<text x="{usb_cx}" y="{uy-3}" font-size="7" fill="{SILK_DIM}" text-anchor="middle">USB-C</text>')
    caps = (f'<text x="{(x+usb_cx)/2:.0f}" y="{y+32}" font-size="7.5" fill="{SILK_DIM}" text-anchor="middle">вход · заряд</text>'
            f'<text x="{(usb_cx+x+w)/2:.0f}" y="{y+32}" font-size="7.5" fill="{SILK_DIM}" text-anchor="middle">батарея · выход</text>')
    # LEDs (левая, входная группа)
    lcx = (x+usb_cx)/2
    leds = (f'<rect x="{lcx-13:.0f}" y="{y+48}" width="10" height="7" rx="1.4" fill="#e23b2e" stroke="#7a1a12"/>'
            f'<rect x="{lcx+3:.0f}" y="{y+48}" width="10" height="7" rx="1.4" fill="#2a7de1" stroke="#16407a"/>'
            f'<text x="{lcx:.0f}" y="{y+68}" font-size="6.5" fill="{SILK_DIM}" text-anchor="middle">CHG·STBY</text>')
    # IC 4056 (правая группа)
    icx, icy = usb_cx+16, y+64
    pins_ic = "".join(f'<rect x="{icx+3+i*10:.0f}" y="{icy-3}" width="4" height="3" fill="#b8b8b8"/>'
                      f'<rect x="{icx+3+i*10:.0f}" y="{icy+16}" width="4" height="3" fill="#b8b8b8"/>' for i in range(3))
    ic = (f'<rect x="{icx:.0f}" y="{icy}" width="33" height="16" rx="2" fill="#0e0e11" stroke="#000"/>{pins_ic}'
          f'<text x="{icx+16:.0f}" y="{icy+11}" font-size="6.5" fill="#cfd2d8" text-anchor="middle">4056</text>'
          f'<rect x="{icx+40:.0f}" y="{icy}" width="14" height="11" rx="1.5" fill="#0e0e11" stroke="#000"/>'
          f'<text x="{icx+47:.0f}" y="{icy+22}" font-size="6" fill="{SILK_DIM}" text-anchor="middle">DW01</text>')
    title = (f'<text x="{lcx:.0f}" y="{y+h-30}" font-size="13" font-weight="700" fill="{SILK}" text-anchor="middle">TP4056</text>'
             f'<text x="{lcx:.0f}" y="{y+h-18}" font-size="7" fill="{SILK_DIM}" text-anchor="middle">{subtitle}</text>')
    return body+div+caps+leds+ic+usb+title+_pads_top(pins, y)

def mod_boost(x, y, w, h, pins, subtitle="→ 5.14 В · настроен (задача 02 ✓)"):
    """Чёрный mini-boost MT3608. Пады на ВЕРХНЕЙ кромке: ВХОД (IN±) слева, ВЫХОД (OUT±)
       справа; экранированный дроссель «3R3» по центру как разделитель, перемычки A/B у выхода.
       pins: первые 2 = вход, последние 2 = выход."""
    cx = x + w/2
    body = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PCB_DARK}" stroke="{PCB_EDGE}" stroke-width="1.6"/>'
            f'<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="8" fill="none" stroke="#000" stroke-opacity="0.45"/>')
    holes = "".join(f'<circle cx="{hx}" cy="{hy}" r="4" fill="#0b0b0d" stroke="{GOLD}" stroke-width="1.4"/>'
                    for hx, hy in [(x+14, y+h-14), (x+w-14, y+h-14)])
    xs = [p[0] for p in pins]
    in_cx = (xs[0]+xs[1])/2; out_cx = (xs[2]+xs[-1])/2
    caps = (f'<text x="{in_cx:.0f}" y="{y+34}" font-size="7.5" fill="{SILK_DIM}" text-anchor="middle">ВХОД</text>'
            f'<text x="{out_cx:.0f}" y="{y+34}" font-size="7.5" fill="{SILK_DIM}" text-anchor="middle">ВЫХОД</text>'
            f'<line x1="{cx}" y1="{y+26}" x2="{cx}" y2="{y+44}" stroke="#33343b" stroke-width="1" stroke-dasharray="3 3"/>')
    iw = 46; ix = cx-iw/2; iy = y+52
    ind = (f'<rect x="{ix:.0f}" y="{iy}" width="{iw}" height="44" rx="8" fill="#1c1d21" stroke="#000"/>'
           f'<rect x="{ix+5:.0f}" y="{iy+5}" width="{iw-10}" height="34" rx="6" fill="#26272c"/>'
           f'<circle cx="{cx}" cy="{iy+22}" r="11" fill="none" stroke="#3a3b40" stroke-width="5"/>'
           f'<text x="{cx}" y="{iy+26}" font-size="8" fill="{SILK_DIM}" text-anchor="middle">3R3</text>')
    icx, icy = in_cx-14, y+52
    pins_ic = "".join(f'<rect x="{icx+3+i*8:.0f}" y="{icy-3}" width="3.5" height="3" fill="#b8b8b8"/>'
                      f'<rect x="{icx+3+i*8:.0f}" y="{icy+13}" width="3.5" height="3" fill="#b8b8b8"/>' for i in range(3))
    ic = (f'<rect x="{icx:.0f}" y="{icy}" width="27" height="13" rx="2" fill="#0e0e11" stroke="#000"/>{pins_ic}'
          f'<text x="{icx+13:.0f}" y="{icy+10}" font-size="6" fill="#cfd2d8" text-anchor="middle">MT3608</text>')
    jbx = out_cx-13
    jumpers = (f'<rect x="{jbx:.0f}" y="{y+54}" width="9" height="8" rx="1.5" fill="#0e0e11" stroke="#7d828a"/>'
               f'<rect x="{jbx+15:.0f}" y="{y+54}" width="9" height="8" rx="1.5" fill="#0e0e11" stroke="#7d828a"/>'
               f'<text x="{jbx+4:.0f}" y="{y+72}" font-size="6.5" fill="{SILK_DIM}" text-anchor="middle">A</text>'
               f'<text x="{jbx+19:.0f}" y="{y+72}" font-size="6.5" fill="{SILK_DIM}" text-anchor="middle">B</text>')
    title = (f'<text x="{cx}" y="{y+h-16}" font-size="13" font-weight="700" fill="{SILK}" text-anchor="middle">Mini Boost · MT3608</text>'
             f'<text x="{cx}" y="{y+h-4}" font-size="8" fill="{SILK_DIM}" text-anchor="middle">{subtitle}</text>')
    return body+holes+caps+ind+ic+jumpers+title+_pads_top(pins, y)

# ============================================================= МОДУЛЬ, СТОЯЩИЙ НА МАКЕТКЕ
def mod_inline(col_l, col_r, row_t, row_b, pins, title, subtitle,
               over_x=14, over_y=38, title_y=388, sub_y=399, op=0.93,
               accent=GOLD):
    """Модуль, впаянный в гребёнку 2.54 и вставленный В МАКЕТКУ (не отдельная карточка).

    Корпус стоит ПОПЕРЁК траншеи: верхний ряд площадок — в верхнем банке (row_t),
    нижний — в нижнем (row_b). Поэтому две площадки в одной колонке — РАЗНЫЕ узлы.

    col_l/col_r — крайние колонки ПЛОЩАДОК; over_x/over_y — свес корпуса за площадки
    (в px, из реальных мм модуля). pins: (col, row, label, color, dy) —
    dy = сдвиг подписи от центра пина по вертикали.
    """
    x0, x1 = colx(col_l) - over_x, colx(col_r) + over_x
    y0, y1 = ROWY[row_t] - over_y, ROWY[row_b] + over_y
    cx = (x0 + x1) / 2
    body = (f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{x1-x0:.0f}" height="{y1-y0:.0f}" rx="7" '
            f'fill="{PCB_DARK}" fill-opacity="{op}" stroke="{PCB_EDGE}" stroke-width="1.6"/>'
            f'<rect x="{x0+3.5:.0f}" y="{y0+3.5:.0f}" width="{x1-x0-7:.0f}" height="{y1-y0-7:.0f}" rx="5" '
            f'fill="none" stroke="#000" stroke-opacity="0.45"/>')
    # подписи часто шире корпуса — под каждой своя тёмная «плашка»,
    # иначе светлый текст пропадает на светлой макетке
    tw = max(6.4 * len(title), 4.3 * len(subtitle)) + 14
    txt = (f'<rect x="{cx-tw/2:.0f}" y="{title_y-11}" width="{tw:.0f}" '
           f'height="{sub_y-title_y+15}" rx="4" fill="{PCB_DARK}" fill-opacity="0.95"/>'
           f'<text x="{cx:.0f}" y="{title_y}" font-size="11" font-weight="700" fill="{SILK}" '
           f'text-anchor="middle">{title}</text>'
           f'<text x="{cx:.0f}" y="{sub_y}" font-size="7.5" fill="{SILK_DIM}" '
           f'text-anchor="middle">{subtitle}</text>')
    ps = ""
    for col, row, label, color, dy in pins:
        px, py = colx(col), ROWY[row]
        lw = 4.6 * (len(label) + len(str(col)) + 1) + 8
        ps += (f'<circle cx="{px}" cy="{py}" r="6.6" fill="{color}" stroke="{accent}" stroke-width="1.6"/>'
               f'<circle cx="{px}" cy="{py}" r="2.4" fill="#0b0b0d"/>'
               f'<rect x="{px-lw/2:.1f}" y="{py+dy-8}" width="{lw:.0f}" height="11" rx="3" '
               f'fill="{PCB_DARK}" fill-opacity="0.95"/>'
               f'<text x="{px}" y="{py+dy}" font-size="7.5" font-weight="700" fill="{SILK}" '
               f'text-anchor="middle">{label}&#160;<tspan fill="{PAD_UNUSED}">{col}</tspan></text>')
    return body + txt + ps

def mod_usb_c(x, y, w, h, pins, subtitle="панельный разъём · пигтейл"):
    """USB-C 5В: панельный круглый разъём на пигтейле (красный/чёрный). Светлая карточка."""
    cx = x + w/2
    body = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{CONT_FILL}" stroke="{CONT_STK}" stroke-width="2"/>')
    ccy, r = y+78, 30
    conn = (f'<circle cx="{cx}" cy="{ccy}" r="{r+3}" fill="#3a3d43"/>'
            f'<circle cx="{cx}" cy="{ccy}" r="{r}" fill="#101114" stroke="#000"/>'
            f'<circle cx="{cx}" cy="{ccy}" r="{r-7}" fill="#1a1b1f" stroke="#2c2d33"/>'
            f'<rect x="{cx-16}" y="{ccy-5}" width="32" height="10" rx="5" fill="{SILVER}" stroke="#7d828a"/>'
            f'<rect x="{cx-11}" y="{ccy-2.4:.0f}" width="22" height="5" rx="2.5" fill="#3a3d43"/>')
    pig = ""
    for px, label, color in pins:
        tox = cx-18 if px < cx else cx+18
        pig += (f'<path d="M{px} {y+9} C {px} {y+40}, {tox} {ccy-36}, {tox} {ccy-6}" '
                f'fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>')
    title = (f'<text x="{cx}" y="{y+h-24}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">USB-C 5 В</text>'
             f'<text x="{cx}" y="{y+h-10}" font-size="8.5" fill="#666" text-anchor="middle">{subtitle}</text>')
    return body+pig+conn+title+_pads_top(pins, y, fill="#333")

def switch_rocker(x, y, w, h, terminals, title="SW1", subtitle="клавишный выключатель"):
    """Красный клавишный выключатель (O/I) в чёрной рамке. terminals: (tx, ty, label) на левой кромке."""
    cx, cy = x+w/2, y+h/2
    frame = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="#17181c" stroke="#3a3d43" stroke-width="1.6"/>'
             f'<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="7" fill="none" stroke="#000" stroke-opacity="0.4"/>')
    rx, ry = x+42, y+14; rw, rh = w-58, h-28
    rocker = (f'<rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" rx="6" fill="#c62f24" stroke="#7a1a12"/>'
              f'<rect x="{rx}" y="{ry}" width="{rw}" height="{rh/2:.0f}" rx="6" fill="#e0443a"/>'
              f'<circle cx="{rx+rw*0.30:.0f}" cy="{cy}" r="5.5" fill="none" stroke="#fff" stroke-width="1.8"/>'
              f'<rect x="{rx+rw*0.64:.0f}" y="{cy-6:.0f}" width="2.6" height="12" fill="#fff"/>')
    term = ""
    for tx, ty, label in terminals:
        term += (f'<rect x="{tx-8}" y="{ty-5}" width="12" height="10" rx="2" fill="{SILVER}" stroke="#7d828a"/>'
                 f'<circle cx="{tx}" cy="{ty}" r="2.4" fill="#0b0b0d"/>'
                 f'<text x="{tx+9}" y="{ty+3}" font-size="8" fill="{SILK_DIM}">{label}</text>')
    txt = (f'<text x="{cx}" y="{y-8}" font-size="13" font-weight="700" fill="#1a1a1a" text-anchor="middle">{title}</text>'
           f'<text x="{cx}" y="{y+h+16}" font-size="10" fill="#666" text-anchor="middle">{subtitle}</text>')
    return frame+rocker+term+txt

# ============================================================= 4G/GPS-плата BK-A7670 (задача 10)
# Контакты CN101 идут по ЛЕВОЙ кромке платы: провода подходят слева и не прячутся
# под корпусом. Шаг гребёнки 2.54 мм = 17 px, как у макетки.
A7670_CN_DX, A7670_CN_DY, A7670_CN_PITCH = 17, 64, 17

# CN101, 7 контактов сверху вниз (мануал BK-A7670 V1)
CN101 = ["SLEEP", "GND", "VCC", "PWRKEY", "TXD", "RXD", "GND"]

def a7670_cn(x, y, i):
    """Точка подключения к контакту CN101 №i (1..7) для платы, посаженной в (x, y)."""
    return (x + A7670_CN_DX, y + A7670_CN_DY + (i - 1) * A7670_CN_PITCH)

def mod_a7670(x, y, w, h, used=None, subtitle="SIMCom A7670E · 37×37 мм"):
    """Плата BK-A7670 V1. Задействованные контакты CN101 красятся цветом своего провода,
       незадействованные остаются тусклыми. used: {номер контакта: цвет}."""
    used = used or {}
    body = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{PCB_DARK}" '
            f'stroke="{PCB_EDGE}" stroke-width="1.6"/>'
            f'<rect x="{x+4}" y="{y+4}" width="{w-8}" height="{h-8}" rx="7" fill="none" '
            f'stroke="#000" stroke-opacity="0.45"/>')
    holes = "".join(f'<circle cx="{hx}" cy="{hy}" r="4" fill="#0b0b0d" stroke="{GOLD}" stroke-width="1.4"/>'
                    for hx, hy in [(x+w-13, y+13), (x+w-13, y+h-13)])
    # гребёнка CN101 — уже распаяна с завода, паять нечего
    hy0 = y + A7670_CN_DY - 11
    hh  = 6 * A7670_CN_PITCH + 22
    hdr = (f'<rect x="{x+9}" y="{hy0}" width="16" height="{hh}" rx="3" fill="#1c1d21" stroke="#000"/>'
           f'<text x="{x+8}" y="{hy0-6}" font-size="7.5" font-weight="700" fill="{SILK_DIM}">CN101 · гребёнка распаяна</text>')
    pads = ""
    for i, name in enumerate(CN101, 1):
        px, py = a7670_cn(x, y, i)
        col = used.get(i)
        pads += (f'<circle cx="{px}" cy="{py}" r="6" fill="{col or "#4a4d55"}" '
                 f'stroke="{GOLD if col else "#6a6d75"}" stroke-width="1.5"/>'
                 f'<circle cx="{px}" cy="{py}" r="2.3" fill="#0b0b0d"/>'
                 f'<text x="{px+11}" y="{py+3}" font-size="8" font-weight="700" '
                 f'fill="{SILK if col else SILK_DIM}">{i} · {name}</text>')
    # экран модуля SIMCom
    sx, sy, sw, sh = x + 120, y + 50, 130, 86
    shield = (f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="4" fill="#26272c" stroke="#3f4149"/>'
              f'<rect x="{sx+5}" y="{sy+5}" width="{sw-10}" height="{sh-10}" rx="3" fill="none" stroke="#3f4149"/>'
              f'<text x="{sx+sw/2:.0f}" y="{sy+38}" font-size="12" font-weight="700" fill="{SILK}" text-anchor="middle">A7670E</text>'
              f'<text x="{sx+sw/2:.0f}" y="{sy+54}" font-size="7.5" fill="{SILK_DIM}" text-anchor="middle">SIMCom · LTE Cat-1</text>')
    # антенные разъёмы: J1 (LTE) и J2 (GPS) распаяны, J3 (BT) — голые пятаки
    ants = ""
    for k, (nm, sub, live) in enumerate([("J1", "LTE", True), ("J2", "GPS", True), ("J3", "BT", False)]):
        ax, ay = x + w - 40, y + 52 + k * 40
        if live:
            ants += (f'<circle cx="{ax}" cy="{ay}" r="10" fill="{SILVER}" stroke="#7d828a" stroke-width="1.4"/>'
                     f'<circle cx="{ax}" cy="{ay}" r="4" fill="#2a2b30"/>')
        else:
            ants += (f'<rect x="{ax-9}" y="{ay-7}" width="18" height="14" rx="2" fill="#3a3d43" '
                     f'stroke="#5a5d65" stroke-dasharray="2 2"/>')
        ants += (f'<text x="{ax}" y="{ay+23}" font-size="7.5" font-weight="700" '
                 f'fill="{SILK if live else SILK_DIM}" text-anchor="middle">{nm} · {sub}</text>')
    # нижний ряд: держатель SIM · линейный U2 (1084, DPAK) · тестовая точка TP1.
    # Дросселя на плате нет ни одного — это и есть доказательство, что U2 линейный.
    ux, uy = x + 205, y + 152
    u2 = (f'<rect x="{ux}" y="{uy}" width="38" height="26" rx="2.5" fill="#0e0e11" stroke="#000"/>'
          f'<rect x="{ux+4}" y="{uy-5}" width="30" height="6" rx="1.5" fill="#b8b8b8"/>'
          f'<text x="{ux+19}" y="{uy+17}" font-size="8" font-weight="700" fill="#cfd2d8" text-anchor="middle">1084</text>'
          f'<circle cx="{x+252}" cy="{y+165}" r="5.5" fill="{GOLD}" stroke="#8a6d1a"/>'
          f'<text x="{x+186}" y="{y+196}" font-size="7.5" font-weight="700" fill="#e8a33a" '
          f'text-anchor="middle">U2 · линейный 1084 (~0.8 Вт) → TP1 = 4.0 В</text>')
    simx, simy = x + 120, y + 148
    sim = (f'<rect x="{simx}" y="{simy}" width="70" height="30" rx="3" fill="#2a2b30" stroke="#4a4d55"/>'
           f'<text x="{simx+35}" y="{simy+19}" font-size="8" fill="{SILK_DIM}" text-anchor="middle">SIM · nano</text>')
    ub = (f'<rect x="{x+w/2-17:.0f}" y="{y+h-11}" width="34" height="16" rx="4" fill="{SILVER}" stroke="#7d828a"/>'
          f'<text x="{x+w/2:.0f}" y="{y+h+18}" font-size="7.5" fill="#666" text-anchor="middle">micro-USB · AT-консоль</text>')
    txt = (f'<text x="{x+12}" y="{y+24}" font-size="13" font-weight="700" fill="{SILK}">BK-A7670 V1</text>'
           f'<text x="{x+12}" y="{y+38}" font-size="8" fill="{SILK_DIM}">{subtitle}</text>'
           f'<text x="{x+w-12}" y="{y+24}" font-size="7.5" font-weight="700" fill="#e8a33a" '
           f'text-anchor="end">R104: PWRKEY на GND — стартует сам</text>')
    return body + holes + hdr + shield + ants + u2 + sim + ub + txt + pads

# ============================================================= ГНЕЗДОВАЯ ПЛАНКА (PLS «мама»)
def header_socket(col_l, col_r, row, pins, title="", title_dx=-14):
    """Планка гнёзд, воткнутая в ОДИН ряд макетки: в неё сверху садится модуль штырями.
       На колонку приходится 17 px, поэтому назначение контакта пишется коротко (VCC, RXD),
       а номер — прямо в гнезде. pins слева направо: (номер, короткая метка, цвет или None);
       None = контакт никуда не разведён и красится тускло."""
    y = ROWY[row]
    x0, x1 = colx(col_l) - 8, colx(col_r) + 8
    g = (f'<rect x="{x0}" y="{y-11}" width="{x1-x0}" height="22" rx="3" '
         f'fill="#1c1d21" stroke="#000" stroke-width="1.2"/>')
    for k, (num, lab, col) in enumerate(pins):
        cx = colx(col_l + k)
        g += (f'<rect x="{cx-6.5}" y="{y-7.5}" width="13" height="15" rx="1.5" '
              f'fill="{col or "#3a3d43"}" stroke="{GOLD if col else "#5a5d65"}" stroke-width="1.2"/>'
              f'<text x="{cx}" y="{y+3.5}" font-size="8.5" font-weight="700" '
              f'fill="{"#fff" if col else "#8a8a8a"}" text-anchor="middle">{num}</text>'
              f'<text x="{cx}" y="{y-15}" font-size="7.5" font-weight="700" '
              f'fill="{col or "#8a8a8a"}" text-anchor="middle">{lab}</text>')
    if title:
        g += (f'<text x="{x0+title_dx}" y="{y+5}" font-size="9" font-weight="700" '
              f'fill="#1a1a1a" text-anchor="end">{title}</text>')
    return g

# ============================================================= ПРОЕКЦИЯ НАВИСАЮЩЕЙ ПЛАТЫ
def overlay_outline(x, y, w, h, title, sub="", cut_top=True):
    """Пунктирный контур платы, которая лежит ПОВЕРХ макетки: видно, какие отверстия
       она закрывает и куда свисает. cut_top=True рисует верхнюю кромку рваной —
       в масштабе плата сюда не влезает и продолжается за пределы рисунка."""
    if cut_top:
        step = w / 12.0
        zz = "".join(f'L{x + k*step:.0f} {y + (0 if k % 2 else 9)} ' for k in range(1, 13))
        d = f'M{x} {y+h} L{x} {y} {zz}L{x+w} {y+h} Z'
    else:
        d = f'M{x} {y} L{x+w} {y} L{x+w} {y+h} L{x} {y+h} Z'
    g = (f'<path d="{d}" fill="#3a3d43" fill-opacity="0.12" stroke="#3a3d43" '
         f'stroke-width="1.8" stroke-dasharray="7 5" stroke-linejoin="round"/>')
    g += (f'<text x="{x+w/2:.0f}" y="{y+h/2+2:.0f}" font-size="9.5" font-weight="700" '
          f'fill="#3a3d43" text-anchor="middle">{title}</text>')
    if sub:
        g += (f'<text x="{x+w/2:.0f}" y="{y+h/2+15:.0f}" font-size="8" fill="#5a5d65" '
              f'text-anchor="middle">{sub}</text>')
    return g

# ============================================================= КЛЮЧ ПИТАНИЯ (P-MOSFET)
def mod_pmos_switch(x, y, w, h, title="Ключ питания модема", planned=True,
                    subtitle="P-MOSFET high-side · затвор ← GPIO25"):
    """Верхний ключ на входе буста. planned=True рисует пунктиром — деталь ещё не куплена.
       Клеммы: вход (x, y+h/2), выход (x+w, y+h/2), затвор (x+w/2, y+h)."""
    dash = ' stroke-dasharray="6 4"' if planned else ""
    op = ' opacity="0.62"' if planned else ""
    cy = y + h / 2
    return (f'<g{op}><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="#fdfaf2" '
            f'stroke="#b08a2a" stroke-width="2"{dash}/>'
            f'<rect x="{x+w/2-16:.0f}" y="{cy-15:.0f}" width="32" height="30" rx="3" fill="#2b2b2b" stroke="#111"/>'
            f'<text x="{x+w/2:.0f}" y="{cy+4:.0f}" font-size="8" fill="#e8e8e8" text-anchor="middle">P-FET</text>'
            f'<line x1="{x}" y1="{cy:.0f}" x2="{x+w/2-16:.0f}" y2="{cy:.0f}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<line x1="{x+w/2+16:.0f}" y1="{cy:.0f}" x2="{x+w}" y2="{cy:.0f}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<line x1="{x+w/2:.0f}" y1="{cy+15:.0f}" x2="{x+w/2:.0f}" y2="{y+h}" stroke="#8d8d8d" stroke-width="2.4"/>'
            f'<text x="{x+w/2:.0f}" y="{y+16}" font-size="10" font-weight="700" fill="#8a6a1a" text-anchor="middle">{title}</text>'
            f'<text x="{x+w/2:.0f}" y="{y+h-8}" font-size="7.5" fill="#8a6a1a" text-anchor="middle">{subtitle}</text></g>')

# ============================================================= БАТАРЕЙНЫЙ ПАКЕТ (эталон)
def battery_pack(x, y, title="2×18650 LG HG2 · ПАРАЛЛЕЛЬ (задача 03 ✓)",
                 sub="оба «+» вместе, оба «−» вместе · пакет ~3.95В, 6000 мАч",
                 minus_net_color=GNDc, minus_label="«−» пакета"):
    w = 595
    h1y, h2y = y+68, y+138
    return f'''<!-- BATTERY PACK (стандарт) -->
  <rect x="{x}" y="{y}" width="{w}" height="205" rx="12" fill="{BOARD_FILL}" stroke="{BOARD_STK}" stroke-width="2"/>
  <text x="{x+16}" y="{y+26}" font-size="14" font-weight="700" fill="#1a1a1a">{title}</text>
  <text x="{x+16}" y="{y+44}" font-size="11.5" fill="#666">{sub}</text>
  <rect x="{x+115}" y="{h1y}" width="290" height="40" rx="20" fill="#eceadf" stroke="#c7c1ae"/>
  <rect x="{x+129}" y="{h1y+7}" width="262" height="26" rx="13" fill="#333"/>
  <text x="{x+141}" y="{h1y+25}" font-size="10" fill="#eee">18650 · 3.96В  (холдер 1)</text>
  <rect x="{x+97}" y="{h1y+10}" width="16" height="20" rx="2" fill="#555"/>
  <rect x="{x+407}" y="{h1y+10}" width="16" height="20" rx="2" fill="{PLUS}"/>
  <text x="{x+105}" y="{h1y-2}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">−</text>
  <text x="{x+415}" y="{h1y-2}" font-size="14" font-weight="700" fill="{PLUS}" text-anchor="middle">+</text>
  <rect x="{x+115}" y="{h2y}" width="290" height="40" rx="20" fill="#eceadf" stroke="#c7c1ae"/>
  <rect x="{x+129}" y="{h2y+7}" width="262" height="26" rx="13" fill="#333"/>
  <text x="{x+141}" y="{h2y+25}" font-size="10" fill="#eee">18650 · 3.96В  (холдер 2)</text>
  <rect x="{x+97}" y="{h2y+10}" width="16" height="20" rx="2" fill="#555"/>
  <rect x="{x+407}" y="{h2y+10}" width="16" height="20" rx="2" fill="{PLUS}"/>
  <text x="{x+105}" y="{h2y-2}" font-size="14" font-weight="700" fill="#1a1a1a" text-anchor="middle">−</text>
  <text x="{x+415}" y="{h2y-2}" font-size="14" font-weight="700" fill="{PLUS}" text-anchor="middle">+</text>
  <path d="M{x+97} {h1y+20} L{x+67} {h1y+20} L{x+67} {h2y+20} L{x+97} {h2y+20}" fill="none" stroke="{minus_net_color}" stroke-width="4"/>
  <circle cx="{x+67}" cy="{h1y+20}" r="4" fill="{minus_net_color}"/><circle cx="{x+67}" cy="{h2y+20}" r="4" fill="{minus_net_color}"/>
  <text x="{x+45}" y="{(h1y+h2y)/2+24:.0f}" font-size="11.5" font-weight="700" fill="{minus_net_color}" text-anchor="middle">{minus_label}</text>
  <path d="M{x+423} {h1y+20} L{x+453} {h1y+20} L{x+453} {h2y+20} L{x+423} {h2y+20}" fill="none" stroke="{PLUS}" stroke-width="4"/>
  <circle cx="{x+453}" cy="{h1y+20}" r="4" fill="{PLUS}"/><circle cx="{x+453}" cy="{h2y+20}" r="4" fill="{PLUS}"/>
  <text x="{x+487}" y="{(h1y+h2y)/2+24:.0f}" font-size="11.5" font-weight="700" fill="{PLUS}" text-anchor="middle">«+» пакета</text>'''

# ============================================================= ЛЕГЕНДА
def legend(items, y=88):
    """items: список (kind, color, text). kind: 'sw'(квадрат)|'line'|'dot2'(мультиметр)."""
    out, x = [], 30
    for kind,color,text in items:
        if kind == "sw":
            out.append(f'<rect x="{x}" y="{y-9}" width="18" height="14" fill="{color}"/>')
            tx = x+24
        elif kind == "line":
            out.append(f'<line x1="{x}" y1="{y-1}" x2="{x+32}" y2="{y-1}" stroke="{color}" stroke-width="4"/>')
            tx = x+40
        elif kind == "dot2":
            out.append(f'<circle cx="{x+5}" cy="{y-1}" r="5" fill="{PLUS}"/><circle cx="{x+17}" cy="{y-1}" r="5" fill="#111"/>')
            tx = x+27
        out.append(f'<text x="{tx}" y="{y+4}">{text}</text>')
        x = tx + len(text)*7.2 + 26
    return f'<g font-size="13.5" fill="#333">{"".join(out)}</g>'
