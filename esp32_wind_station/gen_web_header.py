# -*- coding: utf-8 -*-
"""Встраивает собранный дашборд (wind-ui/dist) в прошивку.

Читает wind-ui/dist после `npm run build`, сжимает каждый файл gzip'ом и
генерирует web_content.h с массивами PROGMEM + таблицей маршрутов. Прошивка
раздаёт их с Content-Encoding: gzip — см. регистрацию WEB_ASSETS в .ino.

Запуск (из корня проекта):
    python esp32_wind_station/gen_web_header.py

Порядок обновления встроенного дашборда:
    cd wind-ui && npm run build && cd ..
    python esp32_wind_station/gen_web_header.py
    arduino-cli compile --fqbn esp32:esp32:esp32 --export-binaries esp32_wind_station
    python <espota.py> -i 192.168.1.223 -p 3232 -P 45678 -a <SECRET_OTA_PASSWORD> -f <bin>
"""
import gzip
import pathlib
import sys

# Консоль Windows по умолчанию в cp1252, и кириллица в print роняла скрипт уже
# после записи web_content.h — сборка выглядела провалившейся, хотя заголовок
# был на месте, и следующий шаг цепочки не запускался.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "wind-ui" / "dist"
OUT = pathlib.Path(__file__).resolve().parent / "web_content.h"

MIME = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
}

# Хэшированные имена (assets/index-XXXX.js) можно кэшировать навечно —
# новое содержимое всегда приходит под новым именем.
def cache_header(rel: str) -> str:
    return "public, max-age=31536000, immutable" if rel.startswith("assets/") else "no-cache"


def main() -> None:
    if not DIST.is_dir():
        sys.exit(f"нет {DIST} — сначала `npm run build` в wind-ui/")

    files = sorted(p for p in DIST.rglob("*") if p.is_file())
    assets = []
    total_raw = total_gz = 0
    for p in files:
        rel = p.relative_to(DIST).as_posix()
        ext = p.suffix.lower()
        if ext not in MIME:
            print(f"  пропущен (неизвестный тип): {rel}")
            continue
        raw = p.read_bytes()
        gz = gzip.compress(raw, 9)
        total_raw += len(raw)
        total_gz += len(gz)
        url = "/" if rel == "index.html" else "/" + rel
        assets.append((url, MIME[ext], cache_header(rel), gz))
        print(f"  {url}: {len(raw)} -> {len(gz)} gzip")

    lines = [
        "// АВТОГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать руками.",
        "// Источник: wind-ui/dist, генератор: gen_web_header.py (см. шапку скрипта).",
        "#pragma once",
        "#include <pgmspace.h>",
        "",
        "struct WebAsset {",
        "  const char* path;",
        "  const char* mime;",
        "  const char* cacheControl;",
        "  const uint8_t* data;  // gzip",
        "  size_t len;",
        "};",
        "",
    ]
    for i, (_, _, _, gz) in enumerate(assets):
        body = ",".join(str(b) for b in gz)
        lines.append(f"static const uint8_t WEB_ASSET_{i}[] PROGMEM = {{{body}}};")
    lines += ["", "static const WebAsset WEB_ASSETS[] = {"]
    for i, (url, mime, cache, gz) in enumerate(assets):
        lines.append(f'  {{"{url}", "{mime}", "{cache}", WEB_ASSET_{i}, {len(gz)}}},')
    lines += [
        "};",
        f"static const size_t WEB_ASSET_COUNT = {len(assets)};",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{OUT.name}: {len(assets)} файлов, {total_raw} -> {total_gz} байт gzip")


if __name__ == "__main__":
    main()
