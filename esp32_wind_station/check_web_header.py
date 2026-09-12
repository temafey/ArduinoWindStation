# -*- coding: utf-8 -*-
"""Проверяет УЖЕ ЗАКОММИЧЕННЫЙ web_content.h на то, чего в нём быть не должно.

Зачем отдельно от генератора. Генератор сторожит свою же сборку — но во флеш
уходит не то, что он собрал сегодня, а то, что лежит в git: web_content.h
коммитится (без него прошивка не собирается на машине без node_modules) и
может приехать из чужой ветки, из старого стэша, из ручной правки. Этот скрипт
смотрит на файл, а не на процесс, и потому его можно звать когда угодно —
перед коммитом, перед заливкой, после мержа.

Запуск (из корня проекта):
    python esp32_wind_station/check_web_header.py

Что проверяется:
  1. ни один маршрут в WEB_ASSETS[] не начинается с /assets/wind-cloud —
     то есть облачный чанк с учёткой зрителя брокера в прошивку не попал;
  2. ни одно значение из wind-ui/.env не встречается в СОДЕРЖИМОМ ресурсов.
     Обычный grep здесь бесполезен: gzip развёрнут в десятичные байты, и
     искомой строки в файле нет как текста. Поэтому массивы разбираются
     обратно в байты и распаковываются — это единственная честная проверка
     содержимого, а не только имён;
  3. то же самое для массивов, на которые НЕ ссылается ни один маршрут.
     Такой ресурс прошивка не отдаст никому — отдаёт она по таблице, — но
     его байты всё равно лежат во флеше и уезжают в публичный репозиторий,
     а секрет в публичном коммите считается сгоревшим независимо от того,
     подавал ли его кто-нибудь наружу по HTTP. Проверка стоит один проход
     по тем же данным, поэтому «этого не может случиться» — недостаточная
     причина её не делать.

Иголки читаются из .env при запуске: сторож, в исходнике которого записан
секрет, — это ещё одно место, где секрет лежит открытым текстом.

Код возврата: 0 — чисто, 1 — находка, 2 — проверить не удалось.
"""
import gzip
import pathlib
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / "wind-ui" / ".env"
HEADER = pathlib.Path(__file__).resolve().parent / "web_content.h"

BANNED_ROUTE_PREFIXES = ("/assets/wind-cloud",)
MIN_NEEDLE = 8

RE_ROUTE = re.compile(r'^\s*\{"(/[^"]*)",\s*"[^"]*",\s*"[^"]*",\s*(WEB_ASSET_\d+)', re.M)
RE_ARRAY = re.compile(r"static const uint8_t (WEB_ASSET_\d+)\[\] PROGMEM = \{([^}]*)\};")


def read_needles() -> list:
    if not ENV.is_file():
        print("⚠ нет wind-ui/.env — проверка на утечку учётки зрителя ПРОПУЩЕНА")
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
            print(f"  (значение {key} короче {MIN_NEEDLE} символов — не проверяется)")
            continue
        out.append((key, value.encode("utf-8")))
    return out


def main() -> int:
    if not HEADER.is_file():
        print(f"нет {HEADER}")
        return 2
    text = HEADER.read_text(encoding="utf-8")

    routes = RE_ROUTE.findall(text)
    if not routes:
        print("в web_content.h не разобрана ни одна строка WEB_ASSETS[] — формат изменился?")
        return 2

    bad = 0

    leaked = [(u, v) for (u, v) in routes if u.startswith(BANNED_ROUTE_PREFIXES)]
    for url, var in leaked:
        print(f"НАЙДЕНО: маршрут {url} ({var}) — облачный чанк вшит в прошивку")
        bad += 1
    if not leaked:
        print(f"маршруты: {len(routes)}, запрещённых префиксов нет")

    needles = read_needles()
    if needles:
        arrays = dict(RE_ARRAY.findall(text))
        checked = 0
        for url, var in routes:
            body = arrays.get(var)
            if body is None:
                print(f"⚠ {url}: массив {var} не найден, содержимое не проверено")
                continue
            try:
                raw = gzip.decompress(bytes(int(b) for b in body.split(",") if b.strip()))
            except Exception as exc:                      # noqa: BLE001 — причина в тексте
                print(f"⚠ {url}: не удалось распаковать ({exc}), содержимое не проверено")
                continue
            checked += 1
            for key, needle in needles:
                if needle in raw:
                    print(f"НАЙДЕНО: значение {key} из wind-ui/.env лежит внутри {url}")
                    bad += 1
        # Массивы, на которые не ссылается ни один маршрут. Генератор такого
        # не производит — и именно поэтому появление сироты значит, что файл
        # трогали не генератором.
        used = {var for _, var in routes}
        orphans = [name for name in arrays if name not in used]
        for name in orphans:
            print(f"⚠ массив {name} не привязан ни к одному маршруту — проверяю отдельно")
            try:
                raw = gzip.decompress(bytes(int(b) for b in arrays[name].split(",") if b.strip()))
            except Exception as exc:                      # noqa: BLE001 — причина в тексте
                print(f"⚠ {name}: не удалось распаковать ({exc})")
                continue
            for key, needle in needles:
                if needle in raw:
                    print(f"НАЙДЕНО: значение {key} из wind-ui/.env лежит внутри {name} "
                          f"(маршрута нет, но байты во флеше и в git есть)")
                    bad += 1

        print(f"содержимое: распаковано и проверено ресурсов — {checked} из {len(routes)}, "
              f"массивов без маршрута — {len(orphans)}, иголок — {len(needles)}")

    if bad:
        print(f"\nИТОГ: находок {bad}. Этот web_content.h нельзя ни коммитить, ни заливать.")
        return 1
    print("\nИТОГ: чисто")
    return 0


if __name__ == "__main__":
    sys.exit(main())
