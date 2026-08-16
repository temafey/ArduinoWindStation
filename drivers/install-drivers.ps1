# Установка драйверов SimCom для платы BK-A7670 V1 (модуль A7670E).
# Полное описание, разбор ошибок и что делать дальше — A7670E-DRIVERS.md в корне репозитория.
#
# ЗАПУСКАТЬ ОТ АДМИНИСТРАТОРА. Если запустить обычным пользователем, скрипт сам
# перезапустится с запросом UAC.
#
#   .\install-drivers.ps1
#   .\install-drivers.ps1 -DriverDir "D:\распакованный\Windows\Windows10"
#
# Скрипт ничего не скачивает: архив A7600X-Windows-Driver.7z лежит рядом, в этой же папке.
# Распаковать его нужно заранее (см. гайд) — 7-Zip тут не вызывается намеренно,
# чтобы скрипт не зависел от того, что и куда установлено на конкретной машине.

param(
  # Папка с распакованными драйверами. По умолчанию — Windows\Windows10 рядом со скриптом.
  [string]$DriverDir = (Join-Path $PSScriptRoot "a7600x\Windows\Windows10")
)

# --- самоповышение прав -------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Output "Нужны права администратора — перезапускаюсь через UAC..."
  $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"",
               "-DriverDir", "`"$DriverDir`"")
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
  return
}

if (-not (Test-Path $DriverDir)) {
  Write-Output "НЕ НАЙДЕНА папка с драйверами: $DriverDir"
  Write-Output "Распакуй A7600X-Windows-Driver.7z и укажи путь через -DriverDir."
  return
}

# --- установка ----------------------------------------------------------------
# Два .inf, и оба нужны: simser.inf поднимает три COM-порта (Diagnostics, NMEA, AT),
# simmdm.inf — модем. Остальные .inf из пакета (simwwan, simfilter, simgnssusb,
# android_winusb) нам не нужны: WWAN/RNDIS-канал не используется, работаем по AT-порту.
foreach ($inf in @("simser.inf", "simmdm.inf")) {
  $path = Join-Path $DriverDir $inf
  Write-Output "--- add-driver $inf ---"
  if (Test-Path $path) {
    & pnputil.exe /add-driver $path /install
  } else {
    Write-Output "пропущен: файла нет — $path"
  }
  Write-Output ""
}

Write-Output "--- пересканирование шины ---"
& pnputil.exe /scan-devices

# --- что получилось -----------------------------------------------------------
# Ожидаемый результат: три порта SimTech HS-USB (Diagnostics / NMEA / AT Port) и модем.
# Если вместо них "Unknown USB Device (Port Reset Failed)" — это НЕ драйвер,
# а USB-порт ноутбука, см. раздел «Разбор ошибок» в гайде.
Write-Output ""
Write-Output "--- устройства SimTech ---"
Get-PnpDevice | Where-Object { $_.FriendlyName -like "*SimTech*" } |
  Select-Object Status, Class, FriendlyName | Format-Table -AutoSize

Write-Output "AT-порт — строка 'SimTech HS-USB AT Port 9011 (COMxx)'. Его номер и передавать в at.ps1."
