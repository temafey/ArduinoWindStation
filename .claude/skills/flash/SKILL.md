---
name: flash
description: Залить прошивку Wind Station на плату по OTA (или по USB, если плата офлайн) и проверить, что она поднялась.
disable-model-invocation: true
---

Заливка прошивки на ESP32 Wind Station. Аргумент: `$ARGUMENTS` — `usb` для принудительной
заливки по проводу, пусто для OTA.

Подробный разбор ошибок — в `FLASHING.md`. Здесь только рабочая последовательность.

## Предусловие

Бинарник должен существовать:

```powershell
Get-Item C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build\esp32_wind_station.ino.bin |
  Select-Object Length, LastWriteTime
```

Если файла нет или он старше исходников — сначала `/build`.

## OTA (основной путь, ~20 секунд)

Проверь, что плата в сети:

```powershell
Test-Connection -ComputerName "windstation.local" -Count 2
```

Ожидаемый адрес — `192.168.31.235`. Если DHCP выдал другой, возьми адрес из ответа
`Test-Connection` и подставь в `-i`.

```powershell
# пароль OTA читаем из secrets.h — он не должен попадать ни в документ, ни в историю консоли
$otapw = (Select-String -Path C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station\secrets.h `
  -Pattern 'SECRET_OTA_PASSWORD\s+"(.+)"').Matches.Groups[1].Value

python "$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware\esp32\3.3.10\tools\espota.py" `
  -i 192.168.31.235 -I 192.168.31.150 -p 3232 -P 45678 -a $otapw `
  -f C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build\esp32_wind_station.ino.bin -r -d
```

`-I` — IP этого компьютера, обязателен при нескольких интерфейсах. Проверить:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.31.*" } |
  Select-Object IPAddress, InterfaceAlias
```

Успех — строки `Authenticating (PBKDF2-HMAC-SHA256)... OK`, `Result attempt 1: 'OK'`, `Success`.
Пишется только раздел приложения, `nvs` не трогается — WiFi-пароли переживают заливку,
плата перезагружается сама.

Частые причины неудачи: `Waiting for device...` с таймаутом — брандмауэр Windows режет входящий
TCP к `python.exe`; `Authentication Failed` — пароль не совпадает с прошивкой, которая сейчас
на плате. `Test-NetConnection -Port 3232` возвращает False всегда — это нормально, порт UDP.

## USB (если плата офлайн или менялась схема разделов)

Автосброс на этой плате не работает. Попроси пользователя ввести плату в download mode вручную:
зажать **BOOT**, не отпуская нажать и отпустить **EN**, держать BOOT до появления `Writing at 0x...`.
Дождись подтверждения, что он это сделал, и только потом запускай команду.

```powershell
$core = "$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware\esp32\3.3.10"
$b    = "C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build"

python -m esptool --chip esp32 --port COM15 --baud 460800 `
  --before no-reset --after no-reset `
  write-flash --flash-mode dio --flash-freq 80m --flash-size 4MB `
  0x1000  "$b\esp32_wind_station.ino.bootloader.bin" `
  0x8000  "$b\esp32_wind_station.ino.partitions.bin" `
  0xe000  "$core\tools\partitions\boot_app0.bin" `
  0x10000 "$b\esp32_wind_station.ino.bin"
```

После записи попроси нажать **EN** — `--after no-reset` намеренно не перезагружает плату.

Жёсткие правила:

- Никогда не `arduino-cli upload`.
- Никогда не `merged.bin` по адресу 0x0 — он затирает `nvs`, плата поднимется точкой доступа
  `WindStation-Setup` и сеть придётся настраивать заново. Только по-адресно, как выше.
- Если запись обрывается на середине — повтори с `--baud 115200`, CH340 нестабилен на 460800.

## Проверка (обязательно после любой заливки)

```powershell
Test-Connection -ComputerName "windstation.local" -Count 2

$r = Invoke-WebRequest -Uri "http://192.168.31.235/" -TimeoutSec 15 -UseBasicParsing
"$($r.StatusCode)"
if ($r.Content -match '<title>(.*?)</title>') { $matches[1] }
```

Ожидается `200` и `Wind Station`. Дополнительно можно посмотреть живые данные:

```powershell
Invoke-RestMethod "http://192.168.31.235/api/data" | ConvertTo-Json
```

Нули в `speed`/`gust` и `battery: null` — не признак неудачной заливки: датчик может быть
не подключён, а батарея не читается первые 30 секунд после старта. Живой `wifiRssi` доказывает,
что прошивка работает.

Сообщи пользователю: способ заливки, результат проверки (код ответа и заголовок), и что
показал `/api/data`.
