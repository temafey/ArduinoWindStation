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
    arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=min_spiffs --export-binaries esp32_wind_station
    python <espota.py> -i 192.168.1.223 -p 3232 -P 45678 -a <SECRET_OTA_PASSWORD> -f <bin>

---- Почему здесь появился фильтр ----

Этот скрипт берёт dist РЕКУРСИВНО ЦЕЛИКОМ и отбирает файлы только по
расширению. Значит код-сплит сам по себе от встраивания во флеш НЕ СПАСАЕТ:
любой новый чанк молча уедет в web_content.h, который коммитится в ПУБЛИЧНЫЙ
репозиторий и зашивается во флеш платы.

Облачный чанк (wind-cloud-*.js) несёт учётку ЗРИТЕЛЯ брокера — она нужна
только публичной копии дашборда на хостинге, и на плате ей делать нечего.
Отсюда SKIP_PREFIXES и три проверки ниже. Проверки сделаны на РЕЗУЛЬТАТЕ, а
не на входе, и все три — зеркальные: они ловят не только «секрет попал», но и
«фильтр промахнулся мимо всего», потому что молча промахнувшийся фильтр и
есть тот регресс, ради которого всё это написано.
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
ENV = ROOT / "wind-ui" / ".env"
OUT = pathlib.Path(__file__).resolve().parent / "web_content.h"

# Что не встраивается во флеш. Префикс сравнивается с путём внутри dist.
SKIP_PREFIXES = ("assets/wind-cloud",)

# Маска облачного чанка внутри dist/assets. Имя фиксирует vite.config.js
# (группа codeSplitting), поэтому проверять его здесь — законно.
CLOUD_GLOB = "wind-cloud-*.js"

# Короткие значения из .env иголками не считаем: идентификатор станции вида
# "mast" встретился бы в чужом слове и завалил бы сборку ложной тревогой.
MIN_NEEDLE = 8

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


def read_needles() -> list:
    """Что искать в байтах, которые вот-вот уедут во флеш.

    Иголки читаются из wind-ui/.env при каждом запуске, а не лежат в исходнике
    этой проверки: иначе сам сторож стал бы местом, где секрет записан открытым
    текстом и уехал бы в git вместе с ним.
    """
    if not ENV.is_file():
        print("  ⚠ нет wind-ui/.env — проверка на утечку учётки зрителя ПРОПУЩЕНА")
        return []
    out = []
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key.startswith("VITE_") or not value or "FILL_ME" in value:
            continue
        if len(value) < MIN_NEEDLE:
            print(f"  (значение {key} короче {MIN_NEEDLE} символов — на утечку не проверяется)")
            continue
        out.append((key, value.encode("utf-8")))
    return out


def check_cloud_chunk() -> pathlib.Path:
    """Зеркальная проверка: облачный чанк обязан существовать, и ровно один.

    Его отсутствие означает одно из двух, и оба одинаково плохи: либо код-сплит
    схлопнулся и облако вместе с паролем зрителя уехало в entry, либо дашборд
    перестал импортировать ./wind-cloud.jsx и облака в сборке нет вовсе.
    Разбираться с этим нужно до того, как заголовок будет перезаписан.
    """
    assets = DIST / "assets"
    found = sorted(assets.glob(CLOUD_GLOB)) if assets.is_dir() else []
    if len(found) == 1:
        return found[0]
    if not found:
        sys.exit(
            f"в {assets} нет ни одного {CLOUD_GLOB}.\n"
            "  Либо код-сплит схлопнулся и облачный модуль уехал в entry-чанк "
            "(вместе с учёткой зрителя!), либо дашборд больше не импортирует "
            "./wind-cloud.jsx. Проверьте группу codeSplitting в wind-ui/vite.config.js "
            "и динамический import() в wind-dashboard.jsx."
        )
    names = ", ".join(p.name for p in found)
    sys.exit(
        f"в {assets} найдено несколько {CLOUD_GLOB}: {names}.\n"
        "  Фильтр рассчитан на один чанк; разберитесь, почему облако разъехалось."
    )


def main() -> None:
    if not DIST.is_dir():
        sys.exit(f"нет {DIST} — сначала `npm run build` в wind-ui/")

    chunk = check_cloud_chunk()
    print(f"облачный чанк: assets/{chunk.name} ({chunk.stat().st_size} байт) — во флеш НЕ идёт")
    needles = read_needles()

    files = sorted(p for p in DIST.rglob("*") if p.is_file())
    assets = []
    skipped = []
    total_raw = total_gz = 0
    for p in files:
        rel = p.relative_to(DIST).as_posix()
        ext = p.suffix.lower()
        if ext not in MIME:
            print(f"  пропущен (неизвестный тип): {rel}")
            continue
        if any(rel.startswith(pref) for pref in SKIP_PREFIXES):
            skipped.append(rel)
            print(f"  ★ ПРОПУЩЕН {rel} — только для публичной копии на хостинге, "
                  "во флеш платы не встраивается")
            continue
        raw = p.read_bytes()
        # Иголки ищутся в СЫРЫХ байтах, до gzip: внутри заголовка они станут
        # десятичными числами, и там их уже не найти никаким grep'ом. Здесь это
        # бесплатно — байты всё равно в руках.
        for key, needle in needles:
            if needle in raw:
                sys.exit(
                    f"СЕКРЕТ ВО ФЛЕШЕ: значение {key} из wind-ui/.env найдено в {rel}.\n"
                    "  Этот файл был бы вшит в прошивку и закоммичен в ПУБЛИЧНЫЙ "
                    "репозиторий. Учётку зрителя читает только код wind-cloud*, "
                    "и он обязан оставаться в отдельном чанке — проверьте, не "
                    "просочился ли import.meta.env.VITE_* в другой модуль."
                )
        gz = gzip.compress(raw, 9)
        total_raw += len(raw)
        total_gz += len(gz)
        url = "/" if rel == "index.html" else "/" + rel
        assets.append((url, MIME[ext], cache_header(rel), gz))
        print(f"  {url}: {len(raw)} -> {len(gz)} gzip")

    if not skipped:
        sys.exit(
            "фильтр SKIP_PREFIXES не отсеял НИ ОДНОГО файла.\n"
            f"  Ожидались пути с префиксом {SKIP_PREFIXES}, а в dist их нет. "
            "Скорее всего имя облачного чанка изменилось — тогда фильтр молча "
            "пропустит учётку зрителя во флеш. Сверьте имя группы в "
            "wind-ui/vite.config.js со списком выше."
        )

    # Проверка на самом результате, а не на входе: маршруты лежат в заголовке
    # текстом, и именно они решают, что прошивка будет раздавать.
    leaked = [u for (u, _m, _c, _g) in assets if u.startswith("/assets/wind-cloud")]
    if leaked:
        sys.exit(f"в таблицу маршрутов попал облачный чанк: {leaked}")

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
    was = OUT.stat().st_size if OUT.is_file() else 0
    OUT.write_text("\n".join(lines), encoding="utf-8")
    now = OUT.stat().st_size
    print(f"{OUT.name}: {len(assets)} ресурсов, {total_raw} -> {total_gz} байт gzip")
    print(f"{OUT.name}: размер файла {was} -> {now} ({now - was:+d} байт), "
          f"пропущено мимо флеша: {len(skipped)}")


if __name__ == "__main__":
    main()
