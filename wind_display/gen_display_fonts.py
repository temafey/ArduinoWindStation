"""Генератор шрифтов для дисплея: DejaVu Sans → VLW-массивы в display_fonts.h.

Зачем. Встроенные шрифты LovyanGFX — латиница; с кириллицей там только японские наборы,
и в них нет украинских букв. VLW — формат сглаженных шрифтов Processing, его LovyanGFX
читает прямо из флеша (`VLWfont::loadFont`), поэтому шрифт можно сгенерировать самому
из любого TTF и не таскать на плату файловую систему.

Источник — DejaVu Sans из matplotlib: свободная лицензия (Bitstream Vera + public domain
дополнения), полная кириллица, цифры одинаковой ширины (число не «пляшет» при смене
значения). Путь ищется через сам matplotlib, а не зашит.

Формат VLW, сверенный с lgfx_fonts.cpp (LovyanGFX 1.2.25), всё big-endian:
  заголовок 6 × uint32: [число глифов, версия (11, игнорируется), размер, 0, ascent, descent]
  на каждый глиф 7 × uint32: [код, высота, ширина, xAdvance, dY, dX, 0]
      dY — верх битмапа над базовой линией, dX — сдвиг левого края от курсора
  затем битмапы в том же порядке, по байту альфы на пиксель, построчно
Глифы обязаны идти ПО ВОЗРАСТАНИЮ КОДА: поиск там бинарный, неотсортированная таблица
молча теряет буквы. Пробел загрузчик рисует сам шириной «размер·2/7», поэтому поле
«размер» подбирается так, чтобы эта ширина совпала с настоящим пробелом DejaVu.

Запуск (из корня репозитория):  python wind_display/gen_display_fonts.py
Результат — wind_display/display_fonts.h, руками не править.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

try:
    import matplotlib
except ImportError:
    sys.exit('Нужен matplotlib — в нём лежит DejaVu Sans: pip install matplotlib')

TTF_DIR = os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'display_fonts.h')

ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
# Русский + украинский алфавит. Ё/ё и ЇІЄҐ стоят вне основного блока А..я
CYR = ''.join(chr(c) for c in range(0x410, 0x450)) + 'ЁёІіЇїЄєҐґ'
SYMBOLS = '°±·—–…№→←↑↓×'
FULL = ASCII + CYR + SYMBOLS
# Крупные цифры: ровно то, что бывает в показании скорости. Каждый лишний глиф на 84 px
# это килобайты флеша
DIGITS = '0123456789.,-—: %'

# (имя массива, файл TTF, размер в px, набор символов)
FONTS = [
    ('FONT_TEXT', 'DejaVuSans.ttf', 16, FULL),
    ('FONT_TEXT_B', 'DejaVuSans-Bold.ttf', 16, FULL),
    ('FONT_MID', 'DejaVuSans-Bold.ttf', 30, FULL),
    # 84 px — самый крупный размер, при котором «28.8» (цифры DejaVu моноширинные, так что
    # это и есть худший случай) влезает слева от «м/с». На 96 px двузначная скорость
    # уезжала за край, а смена размера на лету прыгает в глаза — размер один на всё.
    ('FONT_BIG', 'DejaVuSans-Bold.ttf', 84, DIGITS),
]


def be32(v):
    return (v & 0xFFFFFFFF).to_bytes(4, 'big')


def build_vlw(ttf, px, chars):
    font = ImageFont.truetype(os.path.join(TTF_DIR, ttf), px)
    ascent, descent = font.getmetrics()
    glyphs = []
    for ch in sorted(set(chars), key=ord):
        adv = int(round(font.getlength(ch)))
        x0, y0, x1, y1 = font.getbbox(ch, anchor='ls')
        w, h = max(0, x1 - x0), max(0, y1 - y0)
        if w > 255 or adv > 255:
            sys.exit(f'{ttf} {px}px: глиф {ch!r} шире 255 px — в VLW ширина это uint8')
        bmp = b''
        if w and h:
            img = Image.new('L', (w, h), 0)
            ImageDraw.Draw(img).text((-x0, -y0), ch, font=font, fill=255, anchor='ls')
            bmp = img.tobytes()
        # dY — сколько битмапа над базовой линией (вверх положительно), в PIL y0 < 0
        glyphs.append((ord(ch), h, w, adv, -y0, x0, bmp))

    space = int(round(font.getlength(' ')))
    size = max(ascent + descent, (space * 7 + 1) // 2)
    out = bytearray()
    out += be32(len(glyphs)) + be32(11) + be32(size) + be32(0) + be32(ascent) + be32(descent)
    for code, h, w, adv, dy, dx, _ in glyphs:
        out += be32(code) + be32(h) + be32(w) + be32(adv) + be32(dy) + be32(dx) + be32(0)
    for g in glyphs:
        out += g[6]
    return bytes(out), len(glyphs)


def c_array(name, data):
    lines = []
    for i in range(0, len(data), 24):
        lines.append('  ' + ','.join(f'0x{b:02x}' for b in data[i:i + 24]) + ',')
    return f'const uint8_t {name}[] PROGMEM = {{\n' + '\n'.join(lines) + '\n};\n'


def main():
    parts = [
        '// АВТОГЕНЕРИРОВАНО wind_display/gen_display_fonts.py — руками не править.\n'
        '// Шрифты: DejaVu Sans (Bitstream Vera License + public domain), формат VLW.\n'
        '#pragma once\n#include <Arduino.h>\n\n'
    ]
    total = 0
    for name, ttf, px, chars in FONTS:
        data, n = build_vlw(ttf, px, chars)
        total += len(data)
        parts.append(f'// {ttf}, {px} px, {n} глифов, {len(data)} байт\n')
        parts.append(c_array(name, data) + '\n')
        print(f'{name:12} {ttf:22} {px:3} px  {n:4} глифов  {len(data):7} байт')
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(parts))
    print(f'итого {total} байт -> {OUT}')


if __name__ == '__main__':
    main()
