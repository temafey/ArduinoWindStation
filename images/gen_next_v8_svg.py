# -*- coding: utf-8 -*-
"""ЧТО ДЕЛАТЬ ДАЛЬШЕ · после того как ESP32 вынули из макетки (2026-09-10).

Не схема сборки и не карта замеров, а одна страница на один вопрос: плата сейчас лежит
рядом с макеткой, воткнута в USB-C и прекрасно работает — что сделать, чтобы она так же
работала СТОЯ В МАКЕТКЕ.

Откуда взялась картинка. Поиск неисправности кончился доказательством: с платой,
вынутой из макетки, ноль паник и растущий аптайм; в макетке — загрузка с мусором,
паники в несвязанных подсистемах и «Failed to set QIE bit». Значит грузили не код,
а медь: что-то на макетке висело на линиях SPI-флеша, а они у 38-pin платы выведены
наружу — шесть контактов в первых четырёх колонках.

Три вещи, ради которых страница вообще нарисована:

  1. «Держать колонки 1–4 пустыми» — формулировка, которой нельзя пользоваться буквально:
     в 1a стоит «5V» самой платы. Запрещены РАЗНЫЕ колонки в разных банках: сверху 2·3·4,
     снизу 1·2·3. Отсюда крупный вид первых шести колонок (bb.flash_zoom).
  2. Флеш держим на 40 МГц — это осознанный запас, а не откат: повод оказался ложным
     (виноват был бракованный модуль), но у "40 мало" симптомов не бывает вовсе, а у
     "80 мало" они выглядят как partition invalid magic и паники в случайных местах.
     Частота лежит в заголовке загрузчика (0x1000) и переживает любую OTA, поэтому
     ЛЮБАЯ заливка по USB обязана нести --flash-freq 40m, иначе молча вернёт 80.
  3. Модем стал внешним модулем со своим питанием. У него теперь две ловушки, которых
     не было, пока он сидел в макетке: его «плюс» нельзя брать с пина «5V» платы,
     а общий провод земли стал обязательной деталью — без него UART молчит при
     совершенно живом модеме (проверено: total=0 на любой паре пинов).

Вход:  bb_lib.esp32_38 / flash_warn / flash_zoom / mod_a7670 / legend
Выход: images/next_v8.svg
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import bb_lib as bb

NCOLS = 63
RAIL_INSET = 2
RAIL_L = 1 + RAIL_INSET
RAIL_TP, RAIL_TM = 250, 262
PLUS, GND, SIG = bb.PLUS, bb.GNDc, bb.SIG
TX_C = "#e0218a"          # GPIO27 -> RXD модема
RX_C = "#3949ab"          # GPIO25 <- TXD модема
OK_C = "#2e7d4f"
NO_C = bb.PAD_FLASH
W = 1900
H = 1150


def X(c):
    return bb.colx(c)


def Y(r):
    return bb.ROWY[r]


board, r3c, r4c = bb.breadboard(bottom="+-", ncols=NCOLS, rail_inset=RAIL_INSET)

esp = bb.esp32_38(subtitle="сейчас ВНЕ макетки, на USB-C — и работает",
                  highlight=["5V", "GND", "27", "25"], usb_label="USB-C")
flash = bb.flash_warn((2, 4), (1, 3))

# ── два провода, которые в запретной зоне СТОЯТЬ ДОЛЖНЫ ────────────────────────
# «5V» платы (кол.1) уходит на «+» рельс по диагонали: рельс начинается только над кол.3.
legit = (
    '<path d="M%d %d L%d 286 L%d %d" fill="none" stroke="%s" stroke-width="3" '
    'stroke-linecap="round"/>' % (X(1), Y("a"), X(1), X(RAIL_L), RAIL_TP, PLUS)
    + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (X(1), Y("a"), PLUS)
    + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (X(RAIL_L), RAIL_TP, PLUS)
    + '<path d="M%d %d L%d %d" fill="none" stroke="%s" stroke-width="3" '
      'stroke-linecap="round"/>' % (X(6), Y("a"), X(6), RAIL_TM, GND)
    + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (X(6), Y("a"), GND)
    + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (X(6), RAIL_TM, GND))

# ── выноска над запретной зоной ────────────────────────────────────────────────
CX, CY, CW, CH = 78, 112, 486, 86
callout = (
    '<rect x="%d" y="%d" width="%d" height="%d" rx="10" fill="#fdeeec" stroke="%s" '
    'stroke-width="2"/>' % (CX, CY, CW, CH, NO_C)
    + '<text x="%d" y="%d" font-size="15" font-weight="700" fill="%s">'
      '⛔ Запретная зона — из-за неё плата и не грузилась</text>' % (CX + 16, CY + 26, NO_C)
    + '<text x="%d" y="%d" font-size="12" fill="#7a2a22">'
      'СВЕРХУ пусто в кол. 2 · 3 · 4 &#8212; это CMD · D3 · D2</text>' % (CX + 16, CY + 47)
    + '<text x="%d" y="%d" font-size="12" fill="#7a2a22">'
      'СНИЗУ пусто в кол. 1 · 2 · 3 &#8212; это CLK · D0 · D1</text>' % (CX + 16, CY + 64)
    + '<text x="%d" y="%d" font-size="10.5" fill="#8a6a20">'
      'а 1a («5V») и 6a («GND») занимать НАДО: это питание самой платы</text>'
      % (CX + 16, CY + 78)
    + '<path d="M%d %d L%d 276 L%d 276 L%d 292" fill="none" stroke="%s" stroke-width="2" '
      'stroke-dasharray="5 4"/>' % (CX + 60, CY + CH, CX + 60, X(3), X(3), NO_C)
    + '<path d="M%d 286 L%d 294 L%d 286 Z" fill="%s"/>' % (X(3) - 5, X(3), X(3) + 5, NO_C))

# ── три провода к модему: уходят с макетки вправо по канавке ───────────────────
EXIT_X = X(NCOLS) + 22
MOD_LANES = {"tx": 192, "rx": 208, "gnd": 224}
# Земля модема берётся с ПРАВОЙ половины верхнего «−» рельса — там же, где её
# берёт gnd_bond в схеме v8. Левая половина (до разреза 31↔32) — опора АЦП,
# и токи модема через неё гнать нельзя: весь смысл разреза в этом.
GND_COL = 44


def lead(pin, y_lane, color):
    """Провод УХОДИТ С МАКЕТКИ: начинается на самом паде платы (y=311, как в схеме v8),
    поднимается над платой и идёт вправо, за правый край. Дырку банка он не занимает —
    модем внешний, и втыкать этот конец больше некуда."""
    x0 = bb.PIN_TOP38[pin]
    return ('<path d="M%d 311 L%d %d L%d %d" fill="none" stroke="%s" stroke-width="3" '
            'stroke-linecap="round" stroke-linejoin="round"/>'
            % (x0, x0, y_lane, EXIT_X, y_lane, color)
            + '<circle cx="%d" cy="311" r="3.4" fill="%s"/>' % (x0, color)
            + '<text x="%d" y="%d" font-size="10.5" font-weight="700" fill="%s" '
              'text-anchor="end">GPIO%s →</text>' % (EXIT_X - 8, y_lane - 5, color, pin))


uart = (lead("27", MOD_LANES["tx"], TX_C)
        + lead("25", MOD_LANES["rx"], RX_C)
        + '<path d="M%d %d L%d %d L%d %d" fill="none" stroke="%s" stroke-width="3" '
          'stroke-linecap="round" stroke-linejoin="round"/>'
          % (X(GND_COL), RAIL_TM, X(GND_COL), MOD_LANES["gnd"], EXIT_X, MOD_LANES["gnd"], GND)
        + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (X(GND_COL), RAIL_TM, GND)
        + '<text x="%d" y="%d" font-size="10.5" font-weight="700" fill="%s" '
          'text-anchor="end">GND (кол.%d, ПРАВАЯ половина) →</text>'
          % (EXIT_X - 8, MOD_LANES["gnd"] - 5, GND, GND_COL)
        + '<path d="M%d 311 L%d 288 L%d 288" fill="none" stroke="%s" stroke-width="1.4" '
          'stroke-dasharray="4 3"/>' % (bb.PIN_TOP38["26"], bb.PIN_TOP38["26"], 470, SIG)
        + '<rect x="%d" y="%d" width="%d" height="20" rx="5" fill="#ffffff" '
          'fill-opacity="0.92" stroke="%s" stroke-width="1.4"/>' % (470, 278, 128, SIG)
        + '<text x="%d" y="%d" font-size="9.5" font-weight="700" fill="%s" '
          'text-anchor="middle">GPIO26 — НЕ занимать</text>'
          % (534, 292, SIG))


# ── карточки-списки ───────────────────────────────────────────────────────────
def card(x, y, w, h, title, lines, accent="#c9a63a", fill="#fbf7ec", sub=""):
    s = ('<rect x="%d" y="%d" width="%d" height="%d" rx="12" fill="%s" stroke="%s" '
         'stroke-width="2"/>' % (x, y, w, h, fill, accent)
         + '<text x="%d" y="%d" font-size="15" font-weight="700" fill="#1a1a1a">%s</text>'
           % (x + 18, y + 26, title))
    ly = y + 50
    if sub:
        s += ('<text x="%d" y="%d" font-size="10.5" fill="#8a6a20">%s</text>'
              % (x + 18, y + 44, sub))
        ly = y + 66
    for kind, txt in lines:
        col = {"ok": OK_C, "no": NO_C, "n": "#4d5158", "dim": "#8a8f97"}[kind]
        mark = {"ok": "✓", "no": "⚠", "n": "·", "dim": ""}[kind]
        s += ('<text x="%d" y="%d" font-size="11" font-weight="700" fill="%s">%s</text>'
              % (x + 18, ly, col, mark)
              + '<text x="%d" y="%d" font-size="11.5" fill="%s">%s</text>'
                % (x + 36, ly, col, txt))
        ly += 19
    return s


RX0 = 1200

now = card(RX0, 122, 660, 224, "Что уже известно точно — это не переделывать",
           [("ok", "Плата ЖИВА. Вне макетки, на USB-C: ноль паник, аптайм растёт,"),
            ("dim", "mDNS и OTA поднялись, аплинк вошёл в домашнюю сеть"),
            ("ok", "Модем ИСПРАВЕН. Проверен отдельно, через свой USB: сеть LTE,"),
            ("dim", "CPIN READY, CSQ 26, оператор ответил, адрес выдан"),
            ("ok", "Флеш на 40 МГц — это ОСОЗНАННЫЙ ЗАПАС, не откат и не диагностика."),
            ("dim", "Частота лежит в загрузчике (0x1000) и переживает любую OTA,"),
            ("dim", "но каждая заливка по USB обязана нести --flash-freq 40m.")],
           accent="#9fb8a4", fill="#f2f8f3")

plan = card(RX0, 366, 660, 228, "Порядок действий",
            [("n", "1 · Пока плата в руках — перезалить по USB на min_spiffs"),
             ("dim", "     app0 1310720 -> 1966080; таблица 0x8000, OTA её не трогает"),
             ("n", "2 · Осмотреть шесть запретных отверстий (крупно — слева внизу)"),
             ("n", "3 · Вставить плату: «5V» в кол.1 ряд a, USB-разъёмом ВЛЕВО"),
             ("n", "4 · Включить БЕЗ модема и дать поработать пять минут"),
             ("dim", "     смотреть uptime и resetReason в /api/data"),
             ("n", "5 · Только потом модем: СНАЧАЛА общая земля, потом UART"),
             ("no", "По одному шагу за раз — пачкой виноватого снова не найти")],
            accent="#c9a63a")

zoom = bb.flash_zoom(80, 620)

hunt = card(500, 620, 660, 214, "Что именно искать в этих шести отверстиях",
            [("no", "обломок ножки резистора или диода — самый частый гость"),
             ("no", "хвост перемычки, ушедший в соседнюю дырку мимо своей"),
             ("no", "капля припоя или волосок медной жилы поперёк колонок"),
             ("no", "перемычка, оставшаяся от раскладки под старую 30-pin плату"),
             ("n", "Светить сбоку, вдоль платы: сверху дырка выглядит пустой"),
             ("n", "Доставать пинцетом, не проводом — провод протолкнёт глубже"),
             ("no", "Разношенная пружина тоже считается: у этой макетки такое было"),
             ("dim", "     (июль, F1: деталь стояла, а контакта не было)")],
            accent="#e0a08a", fill="#fdf4f1")

check = card(500, 854, 660, 206, "Как понять, что получилось",
             [("ok", "Serial: load:0x40078000 → load:0x40080400 → entry 0x400805b4"),
              ("no", "мусор вида load:0xd0012000 или len:2113507310 = зона занята"),
              ("ok", "/api/data: uptime растёт, resetReason = poweron"),
              ("no", "resetReason = panic или watchdog = флеш читается с ошибками"),
              ("no", "resetReason = brownout = это питание, а не макетка"),
              ("ok", "Serial: loopMax единицы мс, sseDrop не растёт"),
              ("n", "Пять минут без паник — можно ставить модем")],
             accent="#9fb8a4", fill="#f2f8f3")

# ── модем как внешний модуль ──────────────────────────────────────────────────
MODX, MODY, MODW, MODH = 1300, 676, 330, 216
CN_USED = {2: GND, 5: RX_C, 6: TX_C}

modem = ('<rect x="%d" y="620" width="660" height="476" rx="12" fill="#fbf7ec" '
         'stroke="#e0c98a" stroke-width="2"/>' % RX0
         + '<text x="%d" y="646" font-size="15" font-weight="700" fill="#1a1a1a">'
           'Модем теперь ВНЕШНИЙ модуль — в макетку не садится</text>' % (RX0 + 18)
         + '<text x="%d" y="665" font-size="10.5" fill="#8a6a20">'
           'питается от своего micro-USB · к макетке идут ровно три провода</text>'
           % (RX0 + 18)
         + bb.mod_a7670(MODX, MODY, MODW, MODH, used=CN_USED,
                        subtitle="SIMCom A7670E-MASA · проверен 2026-09-10",
                        hdr_note="CN101 · штыри СО СТОРОНЫ НАКЛЕЙКИ"))


XM = {"gnd": 1170, "rx": 1177, "tx": 1184}


def mlead(key, cn_i, color):
    px, py = bb.a7670_cn(MODX, MODY, cn_i)
    xm, y_lane = XM[key], MOD_LANES[key]
    return ('<path d="M%d %d L%d %d L%d %d L%d %d" fill="none" stroke="%s" stroke-width="3" '
            'stroke-linecap="round" stroke-linejoin="round"/>'
            % (EXIT_X, y_lane, xm, y_lane, xm, py, px, py, color)
            + '<circle cx="%d" cy="%d" r="3.4" fill="%s"/>' % (px, py, color))


mwires = (mlead("gnd", 2, GND) + mlead("rx", 5, RX_C) + mlead("tx", 6, TX_C))

MAP = [(GND, "«2 · GND» модема  ↔  «−» рельс верх, ПРАВАЯ половина (кол.44)"),
       (RX_C, "«5 · T» (TXD модема)  →  GPIO25"),
       (TX_C, "«6 · R» (RXD модема)  ←  GPIO27")]
mmap = "".join(
    '<rect x="%d" y="%d" width="14" height="4" rx="2" fill="%s"/>'
    '<text x="%d" y="%d" font-size="11" font-weight="700" fill="%s">%s</text>'
    % (RX0 + 18, 936 + i * 20, c, RX0 + 38, 941 + i * 20, c, t)
    for i, (c, t) in enumerate(MAP))
mmap += ('<text x="%d" y="%d" font-size="9.5" fill="#8a8f97">'
         'буквы на плате и имена пинов намеренно НЕ совпадают: TX платы идёт в RXD модема</text>'
         % (RX0 + 18, 998))
mmap += ('<text x="%d" y="%d" font-size="9.5" fill="#8a8f97">'
         'левая половина верхнего «−» (до разреза 31↔32) — опора АЦП, токи модема через неё не гнать</text>'
         % (RX0 + 18, 1012))

mnotes = ('<text x="%d" y="1040" font-size="11" font-weight="700" fill="%s">'
          '⛔ «Плюс» модема НЕ брать с пина «5V» платы</text>' % (RX0 + 18, NO_C)
          + '<text x="%d" y="1057" font-size="10.5" fill="#7a2a22">'
            'в передаче он просит до 2 А импульсом — плата уйдёт в brownout</text>'
            % (RX0 + 18)
          + '<text x="%d" y="1080" font-size="11" font-weight="700" fill="%s">'
            '⚠ Без провода общей земли UART молчит при полностью живом модеме</text>'
            % (RX0 + 18, NO_C))

lgnd = bb.legend([("sw", NO_C, "нельзя ничего · нога SPI-флеша"),
                  ("sw", OK_C, "занято делом — так и надо"),
                  ("line", PLUS, "«5V» → «+» рельс"),
                  ("line", GND, "GND · общая земля"),
                  ("line", TX_C, "GPIO27 → «R» модема"),
                  ("line", RX_C, "GPIO25 ← «T» модема")], y=100)

BLOCKS = [lgnd, board, bb.defs(r3c, r4c), esp, flash, legit, uart, callout,
          now, plan, zoom, hunt, check, modem, mwires, mmap, mnotes]

HEAD = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
    'font-family="Segoe UI, Arial, sans-serif">' % (W, H),
    '  <rect x="0" y="0" width="%d" height="%d" fill="#ffffff"/>' % (W, H),
    '  <text x="30" y="40" font-size="13" font-weight="700" fill="#a35f33" '
    'letter-spacing="1.6">МЕТЕОСТАНЦИЯ ВЕТРА · СХЕМА v8 · 2026-09-10</text>',
    '  <text x="30" y="74" font-size="26" font-weight="700" fill="#1a1a1a">'
    'Что делать дальше: вернуть ESP32 в макетку — и не убить её снова</text>',
]

NL = chr(10)
svg = NL.join(HEAD + ["  " + b for b in BLOCKS] + ["</svg>", ""])

out = os.path.join(os.path.dirname(__file__), "next_v8.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes; viewBox", W, "x", H)
