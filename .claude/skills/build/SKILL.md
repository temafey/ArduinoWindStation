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
& "C:\Program Files\Arduino CLI\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 `
  --output-dir C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station
```

FQBN не менять. `PartitionScheme=min_spiffs` — только по явной просьбе, и тогда предупреди,
что OTA после этого не сработает и заливать придётся по USB.

Сборка занимает заметное время — ставь таймаут не меньше 300000 мс.

## 3. Отчёт

Из вывода вытащи строку вида «Скетч использует N байт (P%)» и сообщи:

- процент занятого `app0` (потолок 1310720 байт, сейчас ~85%);
- сколько байт осталось;
- если больше 97% — предупреди явно, запас почти исчерпан;
- если появилось «text section exceeds available space» — сборка не влезла, нужен
  `min_spiffs` и USB-прошивка.

Готовый бинарник: `C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build\esp32_wind_station.ino.bin`.
Дальше заливка — `/flash`.
