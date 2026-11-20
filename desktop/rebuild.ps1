# Пересборка программы одной командой:  .\desktop\rebuild.ps1
#   -NoInstaller   только папка с .exe (быстрее), без установщика
#   -DashboardOnly только интерфейс и лента обновлений, без упаковки .exe —
#                  так обновляется программа, которая сейчас запущена
param([switch]$NoInstaller, [switch]$DashboardOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$npm = 'C:\Program Files\nodejs\npm.cmd'
$utf8 = [System.Text.UTF8Encoding]::new($false)

# Версия программы = версия дашборда (wind-version.js). От неё программа узнаёт,
# какой интерфейс в ней вшит, и сравнивает с версией в ленте обновлений.
$ver = Select-String -Path "$root\wind-version.js" -Pattern 'APP_VERSION\s*=\s*"[^"]*?(\d+\.\d+\.\d+)"' |
  ForEach-Object { $_.Matches[0].Groups[1].Value }
if (-not $ver) { throw 'не нашёл APP_VERSION в wind-version.js' }
$pkg = "$PSScriptRoot\package.json"
$txt = [System.IO.File]::ReadAllText($pkg)
$new = [regex]::Replace($txt, '("version"\s*:\s*")[^"]*(")', "`${1}$ver`${2}", 1)
if ($new -ne $txt) { [System.IO.File]::WriteAllText($pkg, $new, $utf8) }

Write-Host '1/5 дашборд...' -ForegroundColor Cyan
Push-Location "$root\wind-ui"
$env:WIND_SINGLE = '1'
& $npm run build | Out-Null
Remove-Item Env:WIND_SINGLE
if ($LASTEXITCODE -ne 0) { throw 'сборка дашборда не удалась' }
Pop-Location

Write-Host '2/5 один файл...' -ForegroundColor Cyan
python -I "$PSScriptRoot\inline-single.py" "$root\wind-ui\dist-single" "$PSScriptRoot\app\index.html"
if ($LASTEXITCODE -ne 0) { throw 'склейка не удалась' }

# Лента обновлений: сначала файл, потом latest.json — чтобы программа никогда не
# увидела описание раньше, чем файл, на который оно ссылается.
Write-Host '3/5 лента обновлений...' -ForegroundColor Cyan
$feed = "$PSScriptRoot\feed"
New-Item $feed -ItemType Directory -Force | Out-Null
Copy-Item "$PSScriptRoot\app\index.html" "$feed\index.html" -Force
# Заметки — только этой версии. Файл release-notes.txt копится годами, одна строка =
# «версия | текст»; в окно «Что нового» идут строки текущей версии, а не весь файл:
# раньше уходил весь список, и в каждом обновлении сверху стояло одно и то же.
$notes = @()
if (Test-Path "$PSScriptRoot\release-notes.txt") {
  $notes = @(Get-Content "$PSScriptRoot\release-notes.txt" -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*(\d+\.\d+\.\d+)\s*\|\s*(.+?)\s*$' -and $Matches[1] -eq $ver) { $Matches[2] }
  })
  if (-not $notes.Count) { Write-Host "  в release-notes.txt нет строк для версии $ver (формат: '$ver | текст')" -ForegroundColor Yellow }
}
$meta = [ordered]@{
  version = $ver
  file    = 'index.html'
  sha256  = (Get-FileHash "$feed\index.html" -Algorithm SHA256).Hash.ToLower()
  size    = (Get-Item "$feed\index.html").Length
  date    = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  notes   = $notes
}
[System.IO.File]::WriteAllText("$feed\latest.json", ($meta | ConvertTo-Json -Depth 3), $utf8)
# Подпись: по сети программа ставит только подписанное (см. feed-sign.js).
& 'C:\Program Files\nodejs\node.exe' "$PSScriptRoot\feed-sign.js" "$feed\latest.json"
if ($LASTEXITCODE -ne 0) { throw 'лента не подписана' }

# Та же лента — на Google Диск, в Kiwi_Drop\updates: оттуда обновления получают все
# установленные копии, где бы они ни были. У папки updates доступ «все, у кого есть
# ссылка» (в ней только интерфейс и описание, установщика там нет), а адреса файлов
# вшиты в программу (drive-feed.json) — поэтому файлы перезаписываются на месте,
# под теми же именами: новый файл получил бы новый адрес. Порядок тот же: сначала
# index.html, потом latest.json.
$driveRoot = $null
foreach ($r in @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }) + $env:USERPROFILE) {
  foreach ($n in 'My Drive', 'Мой диск') {
    $d = Join-Path $r $n
    if (-not $driveRoot -and (Test-Path -LiteralPath $d)) { $driveRoot = $d }
  }
}
if ($driveRoot) {
  $up = Join-Path $driveRoot 'Kiwi_Drop\updates'
  New-Item $up -ItemType Directory -Force | Out-Null
  Copy-Item "$feed\index.html" "$up\index.html" -Force
  Copy-Item "$feed\latest.json" "$up\latest.json" -Force
} else {
  Write-Host '  Google Диска на компьютере нет: обновление ушло только в домашнюю сеть' -ForegroundColor Yellow
  # Хук сборки работает скрыто, и предупреждение на экране никто не видит: так
  # 0.3.009 ушла только в домашнюю ленту, а копии вне дома молча остались на 0.3.008.
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  ⚠ Google Диск не подключён (запустите Google Drive) — лента на Диске НЕ обновлена" |
    Add-Content -Path "$PSScriptRoot\auto-rebuild.log" -Encoding UTF8
}

# Адрес ленты по сети вшивается в программу (lan-feed.txt): установленная из
# установщика копия лежит не рядом с исходниками и без него не нашла бы обновлений.
# Если адрес компьютера потом сменится, программа найдёт раздачу перебором соседей.
$lanIp = Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
if ($lanIp) { [System.IO.File]::WriteAllText("$PSScriptRoot\lan-feed.txt", "http://${lanIp}:8765/feed/", $utf8) }

if ($DashboardOnly) {
  Write-Host "Готово: лента обновлений $ver (программа не пересобиралась)" -ForegroundColor Green
  return
}

Push-Location $PSScriptRoot
Write-Host '4/5 программа (.exe)...' -ForegroundColor Cyan
& $npm run pack | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'упаковка не удалась' }

if (-not $NoInstaller) {
  Write-Host '5/5 установщик...' -ForegroundColor Cyan
  & $npm run installer | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'установщик не собрался' }
}
Pop-Location
Write-Host 'Готово:' -ForegroundColor Green
Get-ChildItem "$PSScriptRoot\dist\*.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
Write-Host "$PSScriptRoot\out\Weathered_Kiwi-win32-x64\Weathered_Kiwi.exe"
