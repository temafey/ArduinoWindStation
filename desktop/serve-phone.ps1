# Дашборд для телефона и планшета по домашнему Wi-Fi:  .\desktop\serve-phone.ps1
#   -Port 8765   другой порт, если этот занят
#   -ShortPort 80  второй порт для короткого адреса http://kiwi-drop.local (0 — не нужен)
# Раздаёт страницу-установщик desktop\site (кнопки Windows и Android) и интерфейс
# по адресу http://<IP компьютера>:<порт>/ (интерфейс обновляет rebuild.ps1). Наружу в интернет
# ничего не уходит: сервер слушает только свою сеть. Остановка — Ctrl+C или закрыть окно.
#   -Autostart   запускать сервер самому при каждом входе в Windows (скрыто, без окна;
#                упал — задача поднимет его снова через минуту). -NoAutostart — снять.
param([int]$Port = 8765, [int]$ShortPort = 80, [switch]$Autostart, [switch]$NoAutostart)
$ErrorActionPreference = 'Stop'
$task = 'Weathered_Kiwi serve-phone'
if ($NoAutostart) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "  автозапуск снят"; return
}
if ($Autostart) {
  $act = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $PSScriptRoot `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
  # Два триггера: вход в Windows и «сторож» раз в 5 минут. Если сервер умер, сторож
  # поднимает его снова; пока он жив, повторный запуск игнорируется (IgnoreNew).
  $trgLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $trgWatch = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
  $trg = @($trgLogon, $trgWatch)
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $task -Action $act -Trigger $trg -Settings $set -Force | Out-Null
  Start-ScheduledTask -TaskName $task
  Write-Host "  автозапуск включён: сервер стартует при входе в Windows (задача «$task»)" -ForegroundColor Green
  return
}
$site = Join-Path $PSScriptRoot 'site'
$appSrc = Join-Path $PSScriptRoot 'app\index.html'
if (-not (Test-Path $appSrc)) {
  throw "нет $appSrc — сначала соберите интерфейс: .\desktop\rebuild.ps1 -DashboardOnly"
}
# Интерфейс (/app/) и лента обновлений (/feed/) — ссылки на папки, а не копии: хук
# после каждого ответа обновляет desktop\app и desktop\feed, перезапуск не нужен.
foreach ($pair in @(@('app', "$PSScriptRoot\app"), @('feed', "$PSScriptRoot\feed"))) {
  $link = Join-Path $site $pair[0]
  if (Test-Path $link) { cmd /c rmdir /s /q "$link" }
  New-Item -ItemType Junction -Path $link -Target $pair[1] | Out-Null
}
# APK сервер отдаёт прямо из android\out (serve-phone.py), старая копия в site\ не нужна.
Remove-Item "$site\Weathered_Kiwi.apk" -Force -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $PSScriptRoot 'android\out\Weathered_Kiwi.apk'))) { Write-Host '  APK для Android нет: соберите его командой .\desktop\build-apk.ps1' -ForegroundColor Yellow }

# Адрес в локальной сети: первый обычный IPv4 с маршрутом наружу (не виртуальные
# адаптеры и не 169.254.*).
$ip = Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
if (-not $ip) { throw 'не нашёл адрес в локальной сети: компьютер не подключён к Wi-Fi или Ethernet' }

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 }) {
  throw "порт $Port уже занят (возможно, сервер уже запущен). Другой порт: .\desktop\serve-phone.ps1 -Port 8766"
}

$ports = if ($ShortPort -gt 0 -and $ShortPort -ne $Port) { "$ShortPort,$Port" } else { "$Port" }
$url = "http://${ip}:$Port/"
try { Set-Clipboard $url } catch { }
Write-Host ''
Write-Host "  Установщик Weathered_Kiwi:  $url" -ForegroundColor Green
if ($ShortPort -gt 0) { Write-Host "  Короткий адрес:            http://kiwi-drop.local$(if ($ShortPort -ne 80) { ":$ShortPort" })/" -ForegroundColor Green }
Write-Host '  (адрес скопирован в буфер обмена; телефон должен быть в той же сети)'
Write-Host '  Android/Chrome: меню ⋮ → «Добавить на главный экран»'
Write-Host '  iPhone/Safari:  «Поделиться» → «На экран “Домой”»'
Write-Host "  Не открывается — разрешите Python в брандмауэре Windows (сеть «публичная» блокирует вход)."
Write-Host '  Остановить: Ctrl+C' -ForegroundColor DarkGray
Write-Host ''
# Сервер не должен молча пропадать: упал — запишем причину в serve-phone.log и поднимем снова.
$log = Join-Path $PSScriptRoot 'serve-phone.log'
# Вывод перенаправляет cmd, а не PowerShell: в Windows PowerShell каждая строка
# stderr от программы (трассировка оборванного соединения, «порт 80 не открылся»)
# становится ошибкой, и при $ErrorActionPreference = 'Stop' она обрывала весь
# скрипт — сервер умирал на первом же таком сообщении, и цикл не перезапускал его.
$env:PYTHONIOENCODING = 'utf-8'
while ($true) {
  cmd /c "python -I `"$PSScriptRoot\serve-phone.py`" $ports `"$site`" >> `"$log`" 2>&1"
  "$(Get-Date -Format s) сервер остановился (код $LASTEXITCODE), перезапуск через 5 с" | Out-File -FilePath $log -Append -Encoding utf8
  Start-Sleep 5
}
