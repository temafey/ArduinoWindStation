# Промпт для Claude Code: настроить ПК для прошивки ESP32 по USB

Готовый промпт — скопировать целиком и вставить в новую сессию Claude Code
(например, на новом/чистом компьютере). Описывает ровно тот набор инструментов,
которым мы прошиваем станцию сейчас.

---

# Задача: настроить с нуля ПК для прошивки ESP32 Wind Station по USB

Ты работаешь на **Windows 11**, оболочка — PowerShell. Нужно установить и проверить всё,
что требуется, чтобы подключить плату **ESP32 DevKit V1 (30-pin, Type-C, модуль ESP32-WROOM-32)**
по USB и залить в неё прошивку. Действуй пошагово, после каждого шага показывай результат
проверки, а не просто «установлено».

## Что должно получиться в итоге

1. **USB-Serial драйвер** — плата видна в «Диспетчере устройств» в разделе
   «Порты (COM и LPT)» как COM-порт без жёлтого треугольника.
2. **arduino-cli** + ядро **esp32:esp32 версии 3.3.10** от Espressif.
3. **Python 3** (нужен для `espota.py` при последующих прошивках по WiFi) и **esptool**
   (нужен как USB-фолбэк, когда OTA недоступен).
4. Тестовая компиляция скетча проходит, порт определяется, прошивка заливается.

## Шаг 1. Определить USB-Serial мост на плате

Плата может нести один из трёх мостов — от этого зависит драйвер. Подключи плату (я подключу
физически, если попросишь) и определи VID/PID:

```powershell
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'USB\\VID' } |
  Select-Object Status, Class, FriendlyName, InstanceId | Format-List
```

| VID/PID | Чип | Драйвер |
|---|---|---|
| `VID_10C4 & PID_EA60` | CP2102 | Silicon Labs CP210x (Windows 11 обычно ставит сам) |
| `VID_1A86 & PID_55D4` | CH9102X | WCH CH343SER |
| `VID_1A86 & PID_7523` | CH340C | WCH CH341SER |

Если устройство висит в «Другие устройства» с ошибкой — ставим драйвер по таблице.
**Ссылку на установщик покажи мне и дождись подтверждения перед скачиванием и запуском .exe.**
Если драйвер уже стоит — ничего не переустанавливай, просто зафиксируй номер COM-порта.

Если плата вообще не появляется в списке устройств — первым делом подозревай кабель:
он должен быть **data-capable**, не только зарядный. Скажи мне об этом, не изобретай обходные пути.

## Шаг 2. arduino-cli

Проверь, установлен ли уже (у нас он лежал в `C:\Program Files\Arduino CLI\arduino-cli.exe`
и **в PATH его не было** — звали по полному пути):

```powershell
Get-Command arduino-cli -ErrorAction SilentlyContinue
Test-Path "C:\Program Files\Arduino CLI\arduino-cli.exe"
```

Если нет — поставь через `winget install ArduinoSA.CLI` (или скачай zip с arduino.github.io/arduino-cli).
Полная Arduino IDE **не нужна** — мы её не используем.

Затем:

```powershell
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32@3.3.10
```

Ядро весит ~200 МБ и ставится в `%LOCALAPPDATA%\Arduino15\packages\esp32\`, это долго — не считай
зависанием. Дополнительные библиотеки ставить НЕ нужно: WiFi, WiFiMulti, Preferences, WebServer,
ESPmDNS, ArduinoOTA, Ticker входят в ядро. WiFiManager нам не нужен — он удалён из прошивки.

Проверка: `arduino-cli core list` показывает `esp32:esp32 3.3.10`.

## Шаг 3. Python и esptool

`espota.py` (заливка по WiFi) лежит в
`%LOCALAPPDATA%\Arduino15\packages\esp32\hardware\esp32\3.3.10\tools\espota.py` и требует Python 3.
Проверь `python --version`; если нет — `winget install Python.Python.3.12`.

Дополнительно поставь esptool — он нужен как USB-фолбэк:
`pip install esptool` (проверка: `python -m esptool version`).

## Шаг 4. Проверка на живой плате

1. Найди порт: `arduino-cli board list`
2. Скомпилируй прошивку проекта:
   ```powershell
   arduino-cli compile --fqbn esp32:esp32:esp32 --output-dir <тмп> <папка скетча esp32_wind_station>
   ```
3. Залей по USB. **Важно: ESP32 DevKit V1 не входит в режим прошивки автоматически** —
   на нашей плате стоит электролит по питанию, который ломает автосброс, а esptool дёргает
   DTR/RTS и отменяет ручной вход в download mode. Поэтому:
   - я вручную делаю: зажать **BOOT** → нажать и отпустить **EN** → держать BOOT;
   - ты заливаешь **esptool напрямую с флагом `--before no_reset`**, а не через `arduino-cli upload`.
   Скажи мне, когда зажимать кнопки, и дай точную команду.
   Симптом неудачи: `Wrong boot mode detected (0x13)` — значит BOOT отпустили рано, повторяем.
4. Serial-монитор на **115200 baud** (`arduino-cli monitor -p COMx -c baudrate=115200`).
   Кракозябры в самом начале (`rst:0x1 ...`) — это ROM-загрузчик на 74880 baud, это норма.
   Дальше должен пойти читаемый вывод: `=== Wind Station ===`, `WiFi OK`, `IP: 192.168.1.xxx`.

## Ограничения

- Ничего не меняй в файлах проекта — задача чисто про окружение ПК.
- Перед каждой установкой .exe/.msi покажи, что именно ставишь и откуда, и дождись моего «ок».
- Не перезагружай ПК без моего разрешения.
- Если что-то не ставится или плата не определяется после 2–3 попыток — остановись,
  опиши что пробовал и что пошло не так, спроси меня. Не крути один и тот же провал по кругу.
- Всё общение и логи — по-русски.

---

## Связанные документы

- `esp32-flash-guide.md` — процедура первой прошивки, кнопки BOOT/EN, Serial Monitor, OTA
- `wind-station-assembly.md`, раздел «USB-Serial драйвер для Windows 11» — таблица VID/PID
