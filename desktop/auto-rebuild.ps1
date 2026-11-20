# Автопересборка Weathered_Kiwi. Зовётся хуком Stop из .claude/settings.json
# после каждого ответа Claude; быстрый выход, если ничего не менялось.
#
# Два рода изменений:
#  • интерфейс (дашборд) — собирается и кладётся в ленту обновлений
#    desktop\feed. Запущенная программа сама увидит вкладку «Обновление»;
#    её не закрывают и не перезапускают;
#  • оболочка (main.js, preload.js, updater.js) — по воздуху не ставится, нужна
#    пересборка .exe: программа закрывается, пересобирается и запускается снова.
# Если программа не запущена, .exe пересобирается всегда — чтобы вшитый в неё
# интерфейс не отставал от ленты.
# Журнал: desktop\auto-rebuild.log. Руками: .\desktop\auto-rebuild.ps1 [-Force]
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$log  = Join-Path $PSScriptRoot 'auto-rebuild.log'
$lock = Join-Path $PSScriptRoot '.rebuild.lock'
$stUi = Join-Path $PSScriptRoot '.last-ui-hash'
$stSh = Join-Path $PSScriptRoot '.last-shell-hash'
$stPk = Join-Path $PSScriptRoot '.last-pack-hash'
$exe  = Join-Path $PSScriptRoot 'out\Weathered_Kiwi-win32-x64\Weathered_Kiwi.exe'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $log -Encoding UTF8 }
function HashOf($files) {
  $sb = [System.Text.StringBuilder]::new()
  foreach ($f in ($files | Sort-Object FullName -Unique)) {
    [void]$sb.Append($f.FullName.Substring($root.Length)).Append(':').Append((Get-FileHash $f.FullName -Algorithm SHA256).Hash).Append("`n")
  }
  [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sb.ToString()))).Replace('-', '')
}
function Same($stamp, $h) { (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $h) }

# Одна пересборка за раз: два быстрых ответа подряд не должны драться за out\.
if (Test-Path $lock) {
  if (((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 10) { exit 0 }
  Remove-Item $lock -Force
}

# Интерфейс: всё, что попадает в app\index.html. Версию (wind-version.js) считаем
# тоже — она и есть признак «обновление».
$ui = @()
$ui += Get-ChildItem $root -File | Where-Object { $_.Extension -in '.jsx', '.js' }
$ui += Get-ChildItem (Join-Path $root 'wind-ui\src') -File -Recurse -ErrorAction SilentlyContinue
$ui += Get-ChildItem (Join-Path $root 'wind-ui\public') -File -Recurse -ErrorAction SilentlyContinue
foreach ($f in 'wind-ui\index.html', 'wind-ui\vite.config.js', 'desktop\inline-single.py', 'desktop\release-notes.txt') {
  $p = Join-Path $root $f; if (Test-Path $p) { $ui += Get-Item $p }
}
$shell = 'main.js', 'preload.js', 'updater.js', 'widgets.js', 'widget-preload.js', 'widget.html' | ForEach-Object { Join-Path $PSScriptRoot $_ } |
  Where-Object { Test-Path $_ } | ForEach-Object { Get-Item $_ }

$hUi = HashOf $ui
$hSh = HashOf $shell
$running = @(Get-Process Weathered_Kiwi -ErrorAction SilentlyContinue)

$uiChanged    = $Force -or -not (Same $stUi $hUi)
$shellChanged = $Force -or -not (Same $stSh $hSh)
$needPack     = $shellChanged -or (-not $running.Count -and -not (Same $stPk "$hUi$hSh"))
if (-not $uiChanged -and -not $shellChanged -and -not $needPack) { exit 0 }

New-Item $lock -ItemType File -Force | Out-Null
try {
  $rebuild = Join-Path $PSScriptRoot 'rebuild.ps1'
  if ($needPack) {
    Log "пересборка программы (интерфейс: $uiChanged, оболочка: $shellChanged)"
    # Запущенную программу надо закрыть: упаковщик не перезапишет занятый .exe.
    # Electron живёт несколькими процессами; закрываем, пока не останется ни одного.
    for ($i = 0; $i -lt 10 -and (Get-Process Weathered_Kiwi -ErrorAction SilentlyContinue); $i++) {
      Get-Process Weathered_Kiwi -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 700
    }
    $out = & pwsh -NoProfile -ExecutionPolicy Bypass -File $rebuild -NoInstaller 2>&1
    if ($LASTEXITCODE -ne 0) { throw "rebuild.ps1: код ${LASTEXITCODE}: $($out | Select-Object -Last 5 | Out-String)" }
    Set-Content $stPk "$hUi$hSh" -Encoding ASCII
    if ($running.Count) { Start-Process $exe; Log 'программа запущена заново' }
  } else {
    Log 'интерфейс изменился — публикую обновление в ленту'
    $out = & pwsh -NoProfile -ExecutionPolicy Bypass -File $rebuild -DashboardOnly 2>&1
    if ($LASTEXITCODE -ne 0) { throw "rebuild.ps1: код ${LASTEXITCODE}: $($out | Select-Object -Last 5 | Out-String)" }
  }
  Set-Content $stUi $hUi -Encoding ASCII
  Set-Content $stSh $hSh -Encoding ASCII
  Log 'готово'
  # Установщик Windows — всегда самый свежий: собирается в фоне, в отдельную папку,
  # запущенную программу не трогает; если он уже свежий, скрипт сразу выходит.
  Start-Process pwsh -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'build-setup.ps1') -WindowStyle Hidden
}
catch { Log "ОШИБКА: $_" }
finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
