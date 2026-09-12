---
name: build
description: Собрать прошивку Wind Station через arduino-cli с правильным FQBN и проверить запас по флешу. Использовать при просьбе собрать, скомпилировать или проверить, что прошивка компилируется.
---

Сборка прошивки ESP32 Wind Station.

## 1. Нужно ли перегенерировать web_content.h

Только если менялся дашборд. Сравни время изменения:

```powershell
$dist = Get-ChildItem C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\wind-ui\dist -Recurse -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$hdr  = Get-Item C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station\web_content.h
"dist: $($dist.LastWriteTime)"
"web_content.h: $($hdr.LastWriteTime)"
```

Если `dist` новее — перегенерируй:

```powershell
python C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station\gen_web_header.py
```

Скрипт запускается из корня проекта и сам находит `wind-ui/dist`.

Если правился React-код (а не только `dist`), сначала нужен `npm run build` в `wind-ui/`.
На этой машине `npm` не установлен, а `wind-ui/src/App.jsx` импортирует отсутствующий
`../../wind-dashboard.jsx` — в этом случае останови сборку и скажи об этом, не пытайся
чинить импорт самостоятельно.

## 2. Компиляция

```powershell
& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile --fqbn esp32:esp32:esp32:PartitionScheme=min_spiffs `
  --output-dir C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station
```

**Суффикс `:PartitionScheme=min_spiffs` обязателен и его нельзя убирать.** Схема разделов
сменена 2026-09-11 (задача 10): `app0` вырос с 1 310 720 до 1 966 080 байт. Без суффикса
компилятор сверяется со старым лимитом и врёт про переполнение, а собранный образ окажется
под другой таблицей разделов. FQBN в остальном не менять.

Сборка занимает заметное время — ставь таймаут не меньше 300000 мс.

## 3. Отчёт

Из вывода вытащи строку вида «Скетч использует N байт (P%)» и сообщи:

- процент занятого `app0` (потолок **1966080** байт, на 2026-09-12 — **76%**, свободно ~454 КБ);
- сколько байт осталось;
- если стало больше 85% — предупреди явно: запас тает, и резать надо дашборд
  (`web_content.h` — 13 ресурсов, 656 КБ исходно и 227 КБ в сжатом виде; во флеше лежит
  сжатый), а не код прошивки. Расти дальше уже некуда: `min_spiffs` и был запасным ходом,
  он израсходован;
- если процент считается от **1310720** — суффикс `PartitionScheme=min_spiffs` потерялся
  из команды, пересобрать с ним.

Готовый бинарник: `C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build\esp32_wind_station.ino.bin`.
Дальше заливка — `/flash`.
