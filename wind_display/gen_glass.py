"""Стеклянные фоны дисплея CYD (320×240, RGB565) → glass_bg.h, плюс превью.

Считает на компьютере то, что плата посчитать не может: размытие обоев под
панелью, линзу у скруглённого края, блик по кромке, тёмную кайму (iOS 27),
тонировку и тень. Фон квантуется в RGB565 с дизерингом Флойда–Стейнберга —
без него тёмные градиенты на 16-битной панели ложатся ступенями.

Плата только копирует готовый кусок фона в спрайт области и рисует поверх
цифры, поэтому всё неподвижное (панели, дорожка шкалы) живёт здесь, а
раскладка текста в wind_display.ino обязана совпадать с PANELS_* ниже.

Запуск:  python gen_glass.py                 — пишет glass_bg.h рядом со скриптом
         python gen_glass.py --preview DIR   — ещё и PNG: glass-compare.png
                                               (плоский / Clear / Tinted, ×2),
                                               glass-<вариант>.png (×3), banding.png
Прошивка берёт вариант GLASS_VARIANT; сменили — перегенерировать и пересобрать.
"""
import math
import os
import sys

import matplotlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 320, 240
FONT_DIR = os.path.join(matplotlib.get_data_path(), 'fonts', 'ttf')


def font(bold, px):
    return ImageFont.truetype(os.path.join(FONT_DIR, 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'), px)


F_TEXT, F_TEXT_B, F_MID, F_BIG = font(False, 16), font(True, 16), font(True, 30), font(True, 84)


def hexrgb(v):
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


C = {k: hexrgb(v) for k, v in dict(
    BG=0x0B1220, PANEL=0x131C2E, GRID=0x22304A, TEXT=0xE8EEF6, DIM=0x8394AB, FAINT=0x4A5A73,
    ACCENT=0x38BDF8, GREEN=0x4ADE80, YELLOW=0xFACC15, RED=0xF87171, ORANGE=0xFB923C).items()}

# Показания для превью — умеренный ветер, всё на связи.
SPEED, GUST, VMAX = 7.4, 11.2, 30.0


def wind_color(v):
    return C['RED'] if v > 15 else C['YELLOW'] if v > 5 else C['TEXT']


def history():
    """10 минут порывистого ветра, 300 точек, с дырой — как histAvg/histMax."""
    rng = np.random.default_rng(7)
    t = np.arange(300)
    avg = 5.5 + 1.8 * np.sin(t / 37) + 1.2 * np.sin(t / 11 + 1) + rng.normal(0, 0.35, 300)
    mx = avg + 1.5 + np.abs(rng.normal(0, 1.4, 300))
    avg[118:131] = np.nan
    mx[118:131] = np.nan
    return avg, mx


# ===== обои =====

def wallpaper():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    top, bot = np.array([11, 18, 42], np.float32), np.array([5, 30, 40], np.float32)
    img = top + (bot - top) * (y / (H - 1))[..., None]

    def blob(cx, cy, r, col, a):
        d = np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r)))[..., None] * a
        return img * (1 - d) + np.array(col, np.float32) * d

    img = blob(40, 200, 90, (34, 211, 238), 0.55)
    img = blob(285, 45, 95, (139, 92, 246), 0.60)
    img = blob(215, 235, 55, (245, 158, 11), 0.35)
    img = blob(150, 120, 70, (14, 116, 144), 0.35)

    # Линии ветра: тонкие светлые кривые — чтобы стеклу было что преломлять.
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    lines = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(lines)
    for i, (y0, amp, ph) in enumerate([(40, 9, 0), (78, 12, 1.3), (132, 8, 2.1), (176, 14, 0.4), (214, 10, 2.8)]):
        pts = [(xx, y0 + amp * math.sin(xx / 38 + ph) + 3 * math.sin(xx / 11 + i)) for xx in range(-5, W + 6, 3)]
        d.line(pts, fill=150 if i % 2 else 110, width=2)
    lines = lines.filter(ImageFilter.GaussianBlur(0.8))
    white = Image.new('RGB', (W, H), (200, 235, 255))
    return Image.composite(white, pil, lines)


# ===== стекло =====

def rrect_sdf(x0, y0, x1, y1, r):
    """Знаковое расстояние до скруглённого прямоугольника: <0 внутри."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    qx, qy = np.abs(x - cx) - (hx - r), np.abs(y - cy) - (hy - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def sample(img, sx, sy):
    """Билинейная выборка img (H×W×3) в дробных координатах."""
    sx, sy = np.clip(sx, 0, W - 1.001), np.clip(sy, 0, H - 1.001)
    x0, y0 = sx.astype(int), sy.astype(int)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def glass(base, panels, v):
    """Кладёт стеклянные панели на base (float H×W×3). v — параметры варианта."""
    out = base.copy()
    blurred = np.asarray(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
                         .filter(ImageFilter.GaussianBlur(v['blur'])), np.float32)
    L = np.array([-0.55, -0.83], np.float32)   # свет сверху слева
    y, x = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5

    for (x0, y0, x1, y1, r) in panels:
        sdf = rrect_sdf(x0, y0, x1, y1, r)

        # Тень под панелью: маска, сдвинутая вниз и размытая.
        m = Image.fromarray((np.clip(0.5 - sdf, 0, 1) * 255).astype(np.uint8))
        sh = np.asarray(m.transform((W, H), Image.AFFINE, (1, 0, 0, 0, 1, -4)).filter(ImageFilter.GaussianBlur(7)),
                        np.float32)[..., None] / 255 * v['shadow']
        out = out * (1 - sh)

        gy, gx = np.gradient(sdf)
        n = np.hypot(gx, gy) + 1e-6
        nx, ny = gx / n, gy / n
        cover = np.clip(0.5 - sdf, 0, 1)[..., None]

        # Линза: у края выборка уходит наружу — фон из-за кромки заезжает под стекло.
        t = np.clip(1 + sdf / v['band'], 0, 1) ** 2
        disp = v['lens'] * t
        g = sample(blurred, x - 0.5 + nx * disp, y - 0.5 + ny * disp)

        # Тонировка: к тёмному тону (Tinted) и немного к белому (молочность стекла).
        g = g * (1 - v['tint_a']) + np.array(v['tint'], np.float32) * v['tint_a']
        g = g * (1 - v['milk']) + 255 * v['milk']

        # Верхний отлив — стекло светлее у верхней кромки.
        top = np.clip(1 - (y - y0) / ((y1 - y0) * 0.45), 0, 1)[..., None] ** 2 * v['sheen']
        g = g * (1 - top) + 255 * top

        # Блик по кромке: яркий со стороны света, слабее с противоположной.
        dotl = nx * L[0] + ny * L[1]
        spec = np.maximum(dotl, 0) ** 1.5 + 0.45 * np.maximum(-dotl, 0) ** 2
        ring = np.clip(1 - np.abs(sdf + 1.2) / 1.2, 0, 1)
        s = (spec * ring * v['spec'])[..., None]
        g = g * (1 - s) + 255 * s

        out = out * (1 - cover) + g * cover

        # Тёмная кайма снаружи кромки — нововведение iOS 27, отделяет стекло от фона.
        edge = (np.clip(1 - np.abs(sdf - 0.6) / 1.1, 0, 1) * v['dark_edge'])[..., None]
        out = out * (1 - edge)
    return out


# ===== RGB565 =====

def to565_dither(img):
    """Флойд–Стейнберг до 5/6/5 бит. Возвращает float-картинку уже квантованных цветов."""
    a = img.astype(np.float32).copy()
    levels = np.array([31, 63, 31], np.float32)
    for yy in range(H):
        row = a[yy]
        for xx in range(W):
            old = row[xx]
            new = np.round(np.clip(old, 0, 255) / 255 * levels) / levels * 255
            err = old - new
            row[xx] = new
            if xx + 1 < W:
                row[xx + 1] += err * 7 / 16
            if yy + 1 < H:
                if xx > 0:
                    a[yy + 1, xx - 1] += err * 3 / 16
                a[yy + 1, xx] += err * 5 / 16
                if xx + 1 < W:
                    a[yy + 1, xx + 1] += err * 1 / 16
    return a


def to565_trunc(img):
    a = np.clip(img, 0, 255).astype(np.uint8)
    r, g, b = a[..., 0] & 0xF8, a[..., 1] & 0xFC, a[..., 2] & 0xF8
    return np.stack([r | r >> 5, g | g >> 6, b | b >> 5], -1)


# ===== содержимое (то же, что рисует прошивка) =====

def draw_content(img, style):
    """style: 'flat' — как сейчас, 'glass' — раскладка под стеклянные панели."""
    im = img.convert('RGBA')
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d, o = ImageDraw.Draw(im), ImageDraw.Draw(ov)
    glass_ = style == 'glass'

    def text(xy, s, f, col, anchor, shadow=glass_):
        if shadow:
            d.text((xy[0], xy[1] + 1), s, font=f, fill=(0, 8, 20), anchor=anchor)
        d.text(xy, s, font=f, fill=col, anchor=anchor)

    # --- верхняя строка ---
    ty = 13 if glass_ else 12
    text((12 if glass_ else 6, ty), '14:32', F_TEXT_B, C['TEXT'], 'lm')
    x = 66 if glass_ else 64
    for label, col in (('Wi-Fi', C['GREEN']), ('4G', C['GREEN']), ('Облако', C['GREEN'])):
        w = int(d.textlength(label, font=F_TEXT if glass_ else F_TEXT_B)) + (10 if glass_ else 10)
        if glass_:
            d.ellipse((x, ty - 3, x + 6, ty + 3), fill=col)
            text((x + 9, ty), label, F_TEXT, C['TEXT'], 'lm')
        else:
            d.rounded_rectangle((x, 3, x + w - 1, 20), 4, outline=col)
            d.text((x + w / 2, 12), label, font=F_TEXT_B, fill=col, anchor='mm')
        x += w + (6 if glass_ else 5)
    bx, by = W - (40 if glass_ else 34), ty - 6
    d.rounded_rectangle((bx, by, bx + 25, by + 11), 3 if glass_ else 0, outline=C['DIM'])
    d.rectangle((bx + 26, by + 3, bx + 28, by + 8), fill=C['DIM'])
    d.rectangle((bx + 2, by + 2, bx + 2 + int(21 * 0.78), by + 9), fill=C['GREEN'])
    text((bx - 5, ty), '78%', F_TEXT_B, C['GREEN'], 'rm')

    # --- герой ---
    hy = 24
    col = wind_color(SPEED)
    text((224 if glass_ else 206, hy + 92), '7.4', F_BIG, col, 'rs')
    text((228 if glass_ else 210, hy + 92), 'м/с', F_MID, C['DIM'], 'ls')
    gx_ = W - (18 if glass_ else 8)
    text((gx_, hy + (12 if glass_ else 6)), 'порыв', F_TEXT, C['DIM'], 'rt')
    text((gx_, hy + (30 if glass_ else 24)), '11.2', F_MID, wind_color(GUST), 'rt')
    text((18 if glass_ else 8, hy + 110 if glass_ else hy + 114), '4 балла · умеренный', F_TEXT_B, C['TEXT'], 'ls')

    sx, sw = (TRACK[0], TRACK[2] - TRACK[0]) if glass_ else (8, W - 16)
    sy, sh = (TRACK[1], TRACK[3] - TRACK[1]) if glass_ else (hy + 120, 6)
    fill = int(sw * SPEED / VMAX)
    if glass_:   # дорожка запечена в фон, здесь только заливка
        o.rounded_rectangle((sx, sy, sx + fill, sy + sh), 3, fill=col + (255,))
    else:
        d.rectangle((sx, sy, sx + sw - 1, sy + sh - 1), fill=C['GRID'])
        d.rectangle((sx, sy, sx + fill - 1, sy + sh - 1), fill=col)
    for mark in (5, 15):
        mx = sx + int(sw * mark / VMAX)
        (o if glass_ else d).line((mx, sy - 2, mx, sy + sh + 1),
                                  fill=(255, 255, 255, 90) if glass_ else C['BG'])
    gpx = sx + int(sw * GUST / VMAX)
    (o if glass_ else d).rounded_rectangle((gpx - 1, sy - 3, gpx + 1, sy + sh + 2), 1 if glass_ else 0,
                                           fill=C['TEXT'] + (255,) if glass_ else C['TEXT'])

    # --- график ---
    avg, mx_ = history()
    if glass_:
        x0, y0, w, h = 16, 160, W - 32, 56
    else:
        x0, y0, w, h = 8, 156, W - 16, 64
    vmax = math.ceil(np.nanmax(mx_) / 5) * 5
    if glass_:
        for v in range(5, vmax, 5):
            yy = y0 + h - 1 - int((h - 2) * v / vmax)
            o.line((x0, yy, x0 + w - 1, yy), fill=(255, 255, 255, 30))
    else:
        d.rectangle((x0, y0, x0 + w - 1, y0 + h - 1), outline=C['GRID'])
        for v in range(5, vmax, 5):
            yy = y0 + h - 1 - int((h - 2) * v / vmax)
            d.line((x0 + 1, yy, x0 + w - 2, yy), fill=C['GRID'])
    prev = None
    n = min(300, w - 2)
    step = 300 / n
    for i in range(n):
        k = int(i * step)
        xx = x0 + 1 + i
        if np.isnan(avg[k]):
            prev = None
            continue
        ym = y0 + h - 1 - int((h - 2) * min(mx_[k] / vmax, 1))
        ya = y0 + h - 1 - int((h - 2) * min(avg[k] / vmax, 1))
        if glass_:
            o.line((xx, ym, xx, ya), fill=(255, 255, 255, 45))
        else:
            d.line((xx, ym, xx, ya), fill=C['FAINT'])
        c2 = wind_color(avg[k])
        c2 = C['ACCENT'] if c2 == C['TEXT'] else c2
        if prev is not None:
            d.line((xx - 1, prev, xx, ya), fill=c2, width=2 if glass_ else 1)
        prev = ya
    text((x0 + 4, y0 + 2), '10 мин', F_TEXT, C['DIM'], 'lt')
    text((x0 + w - 4, y0 + 2), str(vmax), F_TEXT, C['DIM'], 'rt')

    # --- статус ---
    text((8, 232), 'Питание: батарея · 3.98 В · разряд', F_TEXT, C['DIM'], 'lm')
    if not glass_:
        d.text((W - 6, 232), 'тап → подробно', font=F_TEXT, fill=C['FAINT'], anchor='rm')

    im = Image.alpha_composite(im, ov)
    return im.convert('RGB')


# ===== сборка =====

# (x0, y0, x1, y1, радиус). Главная: верхняя капсула, герой, график; статус — на обоях.
PANELS_MAIN = [(4, 3, 316, 24, 10.5), (6, 28, 314, 150, 18), (6, 155, 314, 222, 14)]
# «Подробно»: та же капсула и одна большая панель под список.
PANELS_DETAILS = [(4, 3, 316, 24, 10.5), (6, 28, 314, 236, 18)]
# Дорожка шкалы скорости на главной — утопленный жёлоб, запекается в фон.
# В прошивке это GLASS_TRACK_*.
TRACK = (18, 139, 302, 145)
TRACK_TONE, TRACK_ALPHA = (0, 10, 25), 110 / 255

VARIANTS = {
    'clear': dict(blur=3, lens=9, band=14, tint=(10, 18, 34), tint_a=0.12, milk=0.07, sheen=0.10,
                  spec=0.85, dark_edge=0.35, shadow=0.45),
    'tinted': dict(blur=9, lens=6, band=12, tint=(8, 14, 28), tint_a=0.62, milk=0.05, sheen=0.07,
                   spec=0.75, dark_edge=0.45, shadow=0.55),
}
# Выбран 2026-09-26: плотное стекло читается издалека, а экран ветра смотрят именно так.
GLASS_VARIANT = 'tinted'


def inset(img, box, r, tone, a):
    """Утопленный жёлоб (дорожка шкалы) поверх уже готового стекла."""
    sdf = rrect_sdf(*box, r)
    m = (np.clip(0.5 - sdf, 0, 1) * a)[..., None]
    return img * (1 - m) + np.array(tone, np.float32) * m


def background(panels, v, track=False, dither=True):
    """Готовый фон страницы: float H×W×3 уже квантованных в RGB565 цветов."""
    bg = glass(np.asarray(wallpaper(), np.float32), panels, v)
    if track:
        bg = inset(bg, TRACK, 3, TRACK_TONE, TRACK_ALPHA)
    return to565_dither(bg) if dither else to565_trunc(bg).astype(np.float32)


def flat_screen():
    img = Image.new('RGB', (W, H), C['BG'])
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W - 1, 23), fill=C['PANEL'])
    return draw_content(img, 'flat')


def glass_screen(v, dither=True):
    bg = background(PANELS_MAIN, v, track=True, dither=dither)
    img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    return Image.fromarray(to565_trunc(np.asarray(draw_content(img, 'glass'), np.float32)))


# ===== заголовок для прошивки =====

def raw565(img):
    """Слова RGB565 с переставленными байтами — формат swap565_t у LovyanGFX: в памяти
    сначала старший байт, ровно так, как пиксель уходит в панель по SPI. Тогда
    pushImage() копирует фон в спрайт без единого преобразования."""
    a = np.clip(np.round(img), 0, 255).astype(np.uint16)
    v = ((a[..., 0] >> 3) << 11) | ((a[..., 1] >> 2) << 5) | (a[..., 2] >> 3)
    return ((v & 0xFF) << 8 | (v >> 8)).astype(np.uint16).ravel()


def c_array(name, words):
    lines = [f'static const uint16_t {name}[{len(words)}] PROGMEM = {{']
    for i in range(0, len(words), 16):
        lines.append('  ' + ','.join(f'0x{w:04x}' for w in words[i:i + 16]) + ',')
    lines.append('};')
    return '\n'.join(lines)


def write_header(path, v):
    main_bg = background(PANELS_MAIN, v, track=True)
    det_bg = background(PANELS_DETAILS, v)
    x0, y0, x1, y1 = TRACK
    out = [
        '// АВТОГЕНЕРИРУЕМЫЙ файл — gen_glass.py. Руками не править.',
        f'// Стеклянные фоны 320x240, вариант «{GLASS_VARIANT}», RGB565 в порядке swap565_t.',
        '#pragma once',
        '#include <stdint.h>',
        '#include <pgmspace.h>',
        '',
        f'#define GLASS_W {W}',
        f'#define GLASS_H {H}',
        f'#define GLASS_TRACK_X {x0}',
        f'#define GLASS_TRACK_Y {y0}',
        f'#define GLASS_TRACK_W {x1 - x0}',
        f'#define GLASS_TRACK_H {y1 - y0}',
        '',
        c_array('GLASS_BG_MAIN', raw565(main_bg)),
        '',
        c_array('GLASS_BG_DETAILS', raw565(det_bg)),
        '',
    ]
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out))
    print(f'{os.path.basename(path)}: 2 фона × {W * H * 2} Б')


# ===== превью =====

def label(img, s, scale):
    big = img.resize((W * scale, H * scale), Image.NEAREST)
    out = Image.new('RGB', (big.width, big.height + 40), (24, 24, 28))
    out.paste(big, (0, 40))
    ImageDraw.Draw(out).text((8, 20), s, font=font(True, 22), fill=(230, 230, 235), anchor='lm')
    return out


def write_previews(dst):
    os.makedirs(dst, exist_ok=True)
    shots = [('Сейчас (плоский)', 'flat', Image.fromarray(to565_trunc(np.asarray(flat_screen(), np.float32))))]
    for name in VARIANTS:
        shots.append((f'Стекло · {name.capitalize()}', name, glass_screen(VARIANTS[name])))
    for _, key, im in shots:
        label(im, key, 3).save(os.path.join(dst, f'glass-{key}.png'))
    tiles = [label(im, title, 2) for title, _, im in shots]
    gap = 16
    comp = Image.new('RGB', (sum(t.width for t in tiles) + gap * (len(tiles) + 1), tiles[0].height + 2 * gap),
                     (24, 24, 28))
    x = gap
    for t in tiles:
        comp.paste(t, (x, gap))
        x += t.width + gap
    comp.save(os.path.join(dst, 'glass-compare.png'))

    # Полосы RGB565: тот же фон без дизеринга и с ним, фрагмент ×4.
    box = (150, 150, 320, 240)
    nod = glass_screen(VARIANTS[GLASS_VARIANT], dither=False).crop(box)
    dit = glass_screen(VARIANTS[GLASS_VARIANT]).crop(box)
    s = 4
    band = Image.new('RGB', ((box[2] - box[0]) * s * 2 + 3 * gap, (box[3] - box[1]) * s + 40 + 2 * gap), (24, 24, 28))
    for i, (im, t) in enumerate(((nod, 'без дизеринга'), (dit, 'с дизерингом'))):
        band.paste(im.resize((im.width * s, im.height * s), Image.NEAREST), (gap + i * (im.width * s + gap), gap + 40))
        ImageDraw.Draw(band).text((gap + i * (im.width * s + gap), gap + 20), t, font=font(True, 22),
                                  fill=(230, 230, 235), anchor='lm')
    band.save(os.path.join(dst, 'banding.png'))
    print('превью ->', os.path.abspath(dst))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    write_header(os.path.join(here, 'glass_bg.h'), VARIANTS[GLASS_VARIANT])
    if '--preview' in sys.argv:
        i = sys.argv.index('--preview')
        write_previews(sys.argv[i + 1] if i + 1 < len(sys.argv) else os.path.join(here, 'preview'))


if __name__ == '__main__':
    main()
