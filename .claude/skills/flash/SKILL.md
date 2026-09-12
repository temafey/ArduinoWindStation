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
Test-Connection -ComputerName "mywindprobebeta.local" -Count 2
```

Ожидаемый адрес — **`192.168.1.80`** (домашняя сеть; сама плата — MAC `d4:e9:f4:02:c4:48`).
Если DHCP выдал другой, спроси его у платы: `staIp` в `/api/data`, либо
`arp -a | Select-String 'd4-e9-f4-02-c4-48'`. Без домашней сети остаётся путь через
точку платы: `-i 192.168.4.1 -I 192.168.4.2`.

```powershell
# пароль OTA читаем из secrets.h — он не должен попадать ни в документ, ни в историю консоли
$otapw = (Select-String -Path C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\esp32_wind_station\secrets.h `
  -Pattern 'SECRET_OTA_PASSWORD\s+"(.+)"').Matches.Groups[1].Value

& "$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware\esp32\3.3.10\tools\espota.exe" `
  -i 192.168.1.80 -I 192.168.1.107 -p 3232 -P 45678 -a $otapw `
  -f C:\Users\temaf\OneDrive\Documents\Projects\TymurWindStation\build\esp32_wind_station.ino.bin -r

# espota.EXE, не `python espota.py`: правило брандмауэра на этой машине заведено
#    на .exe, и через питон заливка виснет на «Waiting for device...» (2026-09-11).
# Флаг -d не добавлять: он печатает пароль OTA открытым текстом.
```

`-I` — IP этого компьютера, обязателен при нескольких интерфейсах. Проверить:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.1.*" } |
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

# COM-порт уточнить: COM15 остался от старой 30-пиновой платы.
# Комментарий обязан стоять ЗДЕСЬ, а не в конце строки: обратный апостроф переносит
# строку, только если он последний символ, иначе PowerShell читает команду до него
# и остаток адресов улетает в никуда.
python -m esptool --chip esp32 --port COM15 --baud 460800 `
  --before no-reset --after no-reset `
  write-flash --flash-mode dio --flash-freq 40m --flash-size 4MB `
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
- Если запись обрывается на середине — повтори с `--baud 115200`. Это была болячка CH340 на старой
  30-пиновой плате; с 2026-09-06 стоит 38-pin DevKitC с мостом **CP2102** (`VID_10C4&PID_EA60`),
  у которого 460800 штатная скорость — тогда причина скорее в кабеле. **Номер COM-порта после
  замены платы другой**, `COM15` в командах выше от старой; спросить у пользователя или найти:
  `Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'USB.VID_10C4' }`.

## Проверка (обязательно после любой заливки)

```powershell
Test-Connection -ComputerName "mywindprobebeta.local" -Count 2

$r = Invoke-WebRequest -Uri "http://192.168.1.80/" -TimeoutSec 15 -UseBasicParsing
"$($r.StatusCode)"
if ($r.Content -match '<title>(.*?)</title>') { $matches[1] }
```

Ожидается `200` и `Wind Station`. Дополнительно можно посмотреть живые данные:

```powershell
Invoke-RestMethod "http://192.168.1.80/api/data" | ConvertTo-Json

# модем пережил перезагрузку штатно? tries=1 — да; больше или state=error — застрял в CMUX
Invoke-RestMethod "http://192.168.1.80/api/modem" | ConvertTo-Json
# облачный канал вернулся? connected=true, errors=0
Invoke-RestMethod "http://192.168.1.80/api/cloud" | ConvertTo-Json
```

Нули в `speed`/`gust` и `battery: null` — не признак неудачной заливки: датчик может быть
не подключён, а батарея не читается первые 30 секунд после старта. Живой `wifiRssi` доказывает,
что прошивка работает.

Сообщи пользователю: способ заливки, результат проверки (код ответа и заголовок), и что
показал `/api/data`.
