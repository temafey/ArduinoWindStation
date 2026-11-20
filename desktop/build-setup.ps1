# Установщик Windows с самой свежей версией, не трогая запущенную программу:
#   .\desktop\build-setup.ps1
# Программа упаковывается в отдельную папку out-setup (а не в out, которую держит
# запущенный Weathered_Kiwi.exe), и из неё собирается dist\Kiwi_Drop-<версия>.exe.
# Страница-установщик (serve-phone.ps1) отдаёт самый новый такой файл. Зовётся
# хуком (auto-rebuild.ps1) в фоне, поэтому пишет в общий журнал и держит замок.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$npm = 'C:\Program Files\nodejs\npm.cmd'
$npx = 'C:\Program Files\nodejs\npx.cmd'
$log = Join-Path $PSScriptRoot 'auto-rebuild.log'
$lock = Join-Path $PSScriptRoot '.setup.lock'
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [установщик] $m" | Add-Content -Path $log -Encoding UTF8 }

# Kiwi_Drop на Google Диске: самый новый установщик кладётся в папку Kiwi_Drop под
# постоянным именем Kiwi_Drop.exe, а «Google Диск для компьютера» сам его выгружает.
# Делиться надо ПАПКОЙ, а не файлом: ссылка на папку не меняется, что бы внутри ни
# перезаписывалось. Доступ — «Ограниченный», по почте. Диска на машине нет — тихо мимо.
# APK для Android — следом за установщиком и по тому же правилу: старее интерфейса
# или своей оболочки — пересобрать. Раньше его собирали только руками, и на планшет
# уезжала неделю как устаревшая сборка. build-apk.ps1 сам кладёт APK на Диск.
function Build-ApkIfStale {
  $apk = Get-Item "$PSScriptRoot\android\out\Weathered_Kiwi.apk" -ErrorAction SilentlyContinue
  $deps = @(Get-Item "$PSScriptRoot\app\index.html", "$PSScriptRoot\drive-feed.json", "$PSScriptRoot\android\bridge.js",
    "$PSScriptRoot\android\AndroidManifest.xml" -ErrorAction SilentlyContinue) +
    @(Get-ChildItem "$PSScriptRoot\android\src" -Recurse -Filter *.java)
  $newest = ($deps | Measure-Object LastWriteTime -Maximum).Maximum
  if ($apk -and $apk.LastWriteTime -gt $newest) { return }
  try {
    & "$PSScriptRoot\build-apk.ps1" *>&1 | Out-Null
    Log "APK пересобран и положен на Google Диск (Kiwi_Drop.apk)"
  } catch { Log "APK не собрался: $_" }
}

# Самообновление оболочек: свежие .exe и APK — в открытую папку updates под
# постоянными именами (их id вшиты в drive-feed.json), и рядом подписанный
# shell.json с версиями и хешами. Сначала файлы, потом описание.
function Publish-Shell {
  $drive = $null
  foreach ($r in @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }) + $env:USERPROFILE) {
    foreach ($n in 'My Drive', 'Мой диск') {
      $d = Join-Path $r $n
      if (-not $drive -and (Test-Path -LiteralPath $d)) { $drive = $d }
    }
  }
  if (-not $drive) { return }
  $exe = Get-ChildItem "$PSScriptRoot\dist\Kiwi_Drop-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.BaseName -replace '^Kiwi_Drop-', '') } | Select-Object -Last 1
  $apk = Get-Item "$PSScriptRoot\android\out\Weathered_Kiwi.apk" -ErrorAction SilentlyContinue
  $apkVer = (Get-Content "$PSScriptRoot\android\out\version.txt" -Raw -ErrorAction SilentlyContinue)
  if (-not $exe -or -not $apk -or -not $apkVer) { return }
  $mark = "$($exe.Name) $($exe.LastWriteTimeUtc.Ticks) $($apk.LastWriteTimeUtc.Ticks)"
  $stampFile = "$PSScriptRoot\feed\.shell-published"   # в feed: маска ^/feed не пустит её в пакет
  if ((Test-Path $stampFile) -and (Get-Content $stampFile -Raw).Trim() -eq $mark) { return }
  $up = Join-Path $drive 'Kiwi_Drop\updates'
  $tmp = "$PSScriptRoot\feed\shell.json"
  New-Item $up -ItemType Directory -Force | Out-Null
  Copy-Item $exe.FullName "$up\Weathered_Kiwi-Setup.exe" -Force
  # APK в самообновление уходит, только когда изменилась сама оболочка Android.
  # Интерфейс вшит в APK, и раньше каждое обновление дашборда давало новый APK
  # с той же версией, что у ленты, — а оболочка не ниже ленты ставится целиком,
  # через системный установщик. Каждый раз это был новый, никем не виденный
  # файл, и Google Play Защита каждый раз предупреждала. Интерфейс доезжает
  # лентой без установки; сам APK (Kiwi_Drop.apk для новых установок) всё равно
  # собирается свежим — в отпечаток не входит только вшитый index.html.
  $fpFile = "$PSScriptRoot\feed\.apk-shell-fp"
  $fpSrc = @(Get-Item "$PSScriptRoot\android\AndroidManifest.xml", "$PSScriptRoot\android\bridge.js",
      "$PSScriptRoot\drive-feed.json" -ErrorAction SilentlyContinue) +
    @(Get-ChildItem "$PSScriptRoot\android\src", "$PSScriptRoot\android\res", "$PSScriptRoot\build\android" -Recurse -File -ErrorAction SilentlyContinue)
  $fp = ($fpSrc | Sort-Object FullName | ForEach-Object {
      $_.FullName.Substring($PSScriptRoot.Length) + ' ' + (Get-FileHash $_.FullName -Algorithm SHA256).Hash }) -join "`n"
  $fp = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($fp))) -replace '-', ''
  $prevApk = $null
  if ((Test-Path $tmp) -and (Test-Path $fpFile) -and (Get-Content $fpFile -Raw).Trim() -eq $fp) {
    try { $prevApk = (Get-Content $tmp -Raw | ConvertFrom-Json).apk } catch { $prevApk = $null }
  }
  if ($prevApk -and $prevApk.sha256) {
    $apkMeta = [ordered]@{ version = $prevApk.version; file = $prevApk.file; sha256 = $prevApk.sha256; size = $prevApk.size }
  } else {
    Copy-Item $apk.FullName "$up\Weathered_Kiwi.apk" -Force
    $apkMeta = [ordered]@{ version = $apkVer.Trim(); file = 'Weathered_Kiwi.apk'
                           sha256 = (Get-FileHash $apk.FullName -Algorithm SHA256).Hash.ToLower(); size = $apk.Length }
  }
  $meta = [ordered]@{
    exe = [ordered]@{ version = ($exe.BaseName -replace '^Kiwi_Drop-', ''); file = 'Weathered_Kiwi-Setup.exe'
                      sha256 = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLower(); size = $exe.Length }
    apk = $apkMeta
  }
  [IO.File]::WriteAllText($tmp, ($meta | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
  & 'C:\Program Files\nodejs\node.exe' "$PSScriptRoot\feed-sign.js" $tmp --shell
  if ($LASTEXITCODE -ne 0) { Log 'shell.json не подписан'; return }
  Copy-Item $tmp "$up\shell.json" -Force
  Set-Content $stampFile $mark -Encoding ASCII
  Set-Content $fpFile $fp -Encoding ASCII
  Log "самообновление: exe $($meta.exe.version), apk $($meta.apk.version) в Kiwi_Drop\updates"
}

# macOS и Linux — из официальных zip Electron (pack-unix.py), без Mac и без Linux.
# Пересобираются, когда установщик Windows новее их.
function Build-UnixIfStale {
  $exe = Get-ChildItem "$PSScriptRoot\dist\Kiwi_Drop-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime | Select-Object -Last 1
  $mac = Get-Item "$PSScriptRoot\dist\Weathered_Kiwi-mac-arm64.zip" -ErrorAction SilentlyContinue
  if (-not $exe -or ($mac -and $mac.LastWriteTime -gt $exe.LastWriteTime)) { return }
  $v = $exe.BaseName -replace '^Kiwi_Drop-', ''
  python -I "$PSScriptRoot\pack-unix.py" $v 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'macOS/Linux не собрались'; return }
  Log "macOS и Linux $v собраны (dist\Weathered_Kiwi-mac-*.zip, -linux-*.tar.gz)"
  # На Диск — поверх старых файлов: их id вшиты в страницу-установщик (docs/index.html).
  foreach ($r in @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }) + $env:USERPROFILE) {
    foreach ($n in 'My Drive', 'Мой диск') {
      $up = Join-Path $r "$n\Kiwi_Drop\updates"
      if (Test-Path -LiteralPath $up) {
        Copy-Item "$PSScriptRoot\dist\Weathered_Kiwi-mac-*.zip", "$PSScriptRoot\dist\Weathered_Kiwi-linux-*.tar.gz" $up -Force
        Log 'macOS и Linux положены на Google Диск (Kiwi_Drop\updates)'
        return
      }
    }
  }
}

function Drop-ToDrive {
  $roots = @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }) + $env:USERPROFILE
  $drive = $null
  foreach ($r in $roots) {
    foreach ($n in 'My Drive', 'Мой диск') {
      $d = Join-Path $r $n
      if (-not $drive -and (Test-Path -LiteralPath $d)) { $drive = $d }
    }
  }
  if (-not $drive) { return }
  $src = Get-ChildItem "$PSScriptRoot\dist\Kiwi_Drop-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.BaseName -replace '^Kiwi_Drop-', '') } | Select-Object -Last 1
  if (-not $src) { return }
  $ver = $src.BaseName -replace '^Kiwi_Drop-', ''
  $dir = Join-Path $drive 'Kiwi_Drop'
  $dst = Join-Path $dir 'Kiwi_Drop.exe'
  $stamp = Join-Path $dir 'version.txt'
  # Метка — версия плюс время сборки: установщик пересобирается и без смены версии
  # (правка оболочки), и такой тоже должен уехать на Диск.
  $mark = "$ver $($src.LastWriteTimeUtc.ToString('o'))"
  if ((Test-Path $dst) -and (Test-Path $stamp) -and (Get-Content $stamp -Raw).Trim() -eq $mark) { return }
  New-Item $dir -ItemType Directory -Force | Out-Null
  Copy-Item $src.FullName $dst -Force
  Set-Content $stamp $mark -Encoding ASCII
  Log "Kiwi_Drop $ver положен на Google Диск ($dir)"
}

if (Test-Path $lock) {
  if (((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 15) { exit 0 }
  Remove-Item $lock -Force
}
New-Item $lock -ItemType File -Force | Out-Null
try {
  $ver = Select-String -Path "$root\wind-version.js" -Pattern 'APP_VERSION\s*=\s*"[^"]*?(\d+\.\d+\.\d+)"' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }
  $have = Get-ChildItem "$PSScriptRoot\dist\Kiwi_Drop-$ver.exe" -ErrorAction SilentlyContinue
  # Свежий, если новее и интерфейса, и оболочки: правка updater.js по воздуху не
  # приходит, её доставляет только новый установщик.
  $src = 'app\index.html', 'main.js', 'preload.js', 'updater.js', 'widgets.js', 'widget-preload.js', 'widget.html', 'drive-feed.json', 'lan-feed.txt' |
    ForEach-Object { Get-Item (Join-Path $PSScriptRoot $_) -ErrorAction SilentlyContinue }
  $newest = ($src | Measure-Object LastWriteTime -Maximum).Maximum
  if ($have -and $have.LastWriteTime -gt $newest) { Drop-ToDrive; Build-ApkIfStale; Build-UnixIfStale; Publish-Shell; exit 0 }
  Log "собираю установщик $ver"
  Push-Location $PSScriptRoot
  # Версия в package.json — от неё зависит имя файла и версия установленной программы.
  $pkg = "$PSScriptRoot\package.json"
  $txt = [System.IO.File]::ReadAllText($pkg)
  $new = [regex]::Replace($txt, '("version"\s*:\s*")[^"]*(")', "`${1}$ver`${2}", 1)
  if ($new -ne $txt) { [System.IO.File]::WriteAllText($pkg, $new, [System.Text.UTF8Encoding]::new($false)) }
  & $npx electron-packager . Weathered_Kiwi --platform=win32 --arch=x64 --out=out-setup --overwrite --prune=true `
    --icon=build/icon.ico '--ignore=^/out' '--ignore=^/dist' '--ignore=^/make-icon.js' '--ignore=^/feed' `
    '--ignore=^/release-notes.txt' '--ignore=^/auto-rebuild' '--ignore=^/serve-phone' '--ignore=^/site' `
    '--ignore=^/android' '--ignore=^/build-apk' '--ignore=^/build-setup' 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'упаковка не удалась' }
  & $npx electron-builder --prepackaged out-setup/Weathered_Kiwi-win32-x64 --win nsis --x64 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'установщик не собрался' }
  Pop-Location
  Log "установщик $ver готов"
  Drop-ToDrive
  Build-ApkIfStale
  Build-UnixIfStale
  Publish-Shell
}
catch { Log "ОШИБКА: $_" }
finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
