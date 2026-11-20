# Сборка Android-приложения (APK) без Gradle:  .\desktop\build-apk.ps1
# Нужны JDK 17, build-tools и android.jar в ~\wk-android-tools (скачиваются один раз).
# Результат: desktop\android\out\Weathered_Kiwi.apk — тот же интерфейс, что в программе
# (desktop\app\index.html), в оболочке WebView. Подпись — ключ desktop\android\wk.keystore:
# сохраните его, иначе новая сборка не встанет поверх установленной (придётся удалять).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$T = Join-Path $HOME 'wk-android-tools'
$jdk = (Get-ChildItem $T -Directory -Filter 'jdk-*' | Select-Object -First 1).FullName
$bt = Join-Path $T 'android-16'
$jar = Join-Path $T 'android-35\android.jar'
$av = Join-Path $PSScriptRoot 'android'
$b = Join-Path $av 'build'
$outDir = Join-Path $av 'out'
if (-not ($jdk -and (Test-Path $bt) -and (Test-Path $jar))) { throw "нет инструментов в $T" }
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

$m = Select-String -Path "$root\wind-version.js" -Pattern 'APP_VERSION\s*=\s*"[^"]*?(\d+)\.(\d+)\.(\d+)"'
$maj, $min, $pat = $m.Matches[0].Groups[1].Value, $m.Matches[0].Groups[2].Value, $m.Matches[0].Groups[3].Value
$ver = "$maj.$min.$pat"; $code = [int]$maj * 1000000 + [int]$min * 1000 + [int]$pat

Remove-Item $b -Recurse -Force -ErrorAction SilentlyContinue
New-Item "$b\cls", "$b\gen", "$b\assets", "$b\res\mipmap-xxxhdpi", "$b\res\drawable-nodpi", $outDir -ItemType Directory -Force | Out-Null
Copy-Item "$PSScriptRoot\app\index.html" "$b\assets\index.html"
# Ресурсы: разметка виджетов, адаптивный значок, строки — из android\res; картинки
# (значок, слои, превью виджетов) рисует make-icon.js в build\android.
Copy-Item "$av\res\*" "$b\res" -Recurse -Force
$ic = "$PSScriptRoot\build\android"
if (-not (Test-Path "$ic\ic_fg.png")) { throw "нет $ic — запустите: npx electron make-icon.js" }
Copy-Item "$ic\ic_launcher.png" "$b\res\mipmap-xxxhdpi\ic_launcher.png"
Copy-Item "$ic\ic_fg.png" "$b\res\mipmap-xxxhdpi\ic_launcher_fg.png"
Copy-Item "$ic\ic_bg.png" "$b\res\mipmap-xxxhdpi\ic_launcher_bg.png"
Copy-Item "$ic\ic_mono.png" "$b\res\mipmap-xxxhdpi\ic_launcher_mono.png"
# Тональный значок (тумблер «Liquid Glass иконка», ярлык .TonalLauncher).
if (-not (Test-Path "$ic\ic_tonal_fg.png")) { throw "нет тонального значка — запустите: npx electron make-icon.js" }
Copy-Item "$ic\ic_tonal.png" "$b\res\mipmap-xxxhdpi\ic_tonal.png"
Copy-Item "$ic\ic_tonal_fg.png" "$b\res\mipmap-xxxhdpi\ic_tonal_fg.png"
Copy-Item "$ic\ic_tonal_bg.png" "$b\res\mipmap-xxxhdpi\ic_tonal_bg.png"
Copy-Item "$ic\widget_preview.png", "$ic\widget_preview_wide.png" "$b\res\drawable-nodpi\"
Copy-Item "$av\bridge.js" "$b\assets\bridge.js"
# Лента на Google Диске (вне дома): те же id, что у программы для Windows.
Copy-Item "$PSScriptRoot\drive-feed.json" "$b\assets\drive-feed.json"
# Адрес ленты обновлений, вшитый при сборке: компьютер в этой сети. Если он сменится,
# приложение само найдёт раздачу перебором соседей и запомнит новый адрес.
$ip = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
  ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1
[IO.File]::WriteAllText("$b\assets\feed.txt", $(if ($ip) { "http://${ip}:8765/feed/" } else { '' }))

& "$bt\aapt2.exe" compile --dir "$b\res" -o "$b\res.zip"; if ($LASTEXITCODE) { throw 'aapt2 compile' }
& "$bt\aapt2.exe" link -o "$b\u.apk" -I $jar --manifest "$av\AndroidManifest.xml" "$b\res.zip" -A "$b\assets" `
  --java "$b\gen" --min-sdk-version 24 --target-sdk-version 34 --version-code $code --version-name $ver; if ($LASTEXITCODE) { throw 'aapt2 link' }

# R.java (id разметки виджета) генерирует aapt2 — компилируется вместе с исходниками.
$src = @(Get-ChildItem "$av\src", "$b\gen" -Recurse -Filter *.java | ForEach-Object FullName)
& javac -encoding UTF-8 --release 8 -nowarn -cp $jar -d "$b\cls" $src 2>&1 | Where-Object { $_ -notmatch 'warning|^Note' }
if ($LASTEXITCODE) { throw 'javac' }
$classes = Get-ChildItem "$b\cls" -Recurse -Filter *.class | ForEach-Object FullName
& "$bt\d8.bat" --lib $jar --min-api 24 --output $b @classes; if ($LASTEXITCODE) { throw 'd8' }
Push-Location $b; & jar uf u.apk classes.dex; Pop-Location; if ($LASTEXITCODE) { throw 'jar' }

& "$bt\zipalign.exe" -f -p 4 "$b\u.apk" "$b\a.apk"; if ($LASTEXITCODE) { throw 'zipalign' }
$ks = "$av\wk.keystore"
# Пароль ключа подписи — вне репозитория (он публичный): переменная WK_KS_PASS или файл
# %USERPROFILE%\.weathered_kiwi\ks-pass.txt рядом с ключами ленты. Нет ни того ни другого, а ключа
# тоже нет — создаётся новый со случайным паролем, и пароль кладётся в этот файл.
$ksPassFile = Join-Path $env:USERPROFILE '.weathered_kiwi\ks-pass.txt'
$ksPass = $env:WK_KS_PASS
if (-not $ksPass -and (Test-Path $ksPassFile)) { $ksPass = (Get-Content $ksPassFile -Raw).Trim() }
if (-not (Test-Path $ks)) {
  if (-not $ksPass) {
    $ksPass = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    New-Item (Split-Path $ksPassFile) -ItemType Directory -Force | Out-Null
    [System.IO.File]::WriteAllText($ksPassFile, $ksPass)
  }
  & keytool -genkeypair -keystore $ks -storepass $ksPass -keypass $ksPass -alias wk -keyalg RSA -keysize 2048 `
    -validity 10000 -dname 'CN=Weathered_Kiwi' 2>&1 | Out-Null
  if ($LASTEXITCODE) { throw 'keytool' }
}
if (-not $ksPass) { throw "нет пароля ключа подписи: задайте WK_KS_PASS или положите его в $ksPassFile" }
& "$bt\apksigner.bat" sign --ks $ks --ks-pass "pass:$ksPass" --key-pass "pass:$ksPass" --out "$outDir\Weathered_Kiwi.apk" "$b\a.apk"
if ($LASTEXITCODE) { throw 'apksigner' }
Remove-Item $b -Recurse -Force
# Версия именно этой сборки — для shell.json (самообновление, build-setup.ps1).
[IO.File]::WriteAllText("$outDir\version.txt", $ver)
# Раздача: страница в домашней сети и Kiwi_Drop на Google Диске (доступ там
# «Ограниченный», как у установщика для Windows).
Copy-Item "$outDir\Weathered_Kiwi.apk" "$PSScriptRoot\site\Weathered_Kiwi.apk" -Force -ErrorAction SilentlyContinue
$driveRoot = $null
foreach ($r in @(Get-PSDrive -PSProvider FileSystem | ForEach-Object { $_.Root }) + $env:USERPROFILE) {
  foreach ($n in 'My Drive', 'Мой диск') {
    $d = Join-Path $r $n
    if (-not $driveRoot -and (Test-Path -LiteralPath $d)) { $driveRoot = $d }
  }
}
if ($driveRoot) {
  New-Item (Join-Path $driveRoot 'Kiwi_Drop') -ItemType Directory -Force | Out-Null
  Copy-Item "$outDir\Weathered_Kiwi.apk" (Join-Path $driveRoot 'Kiwi_Drop\Kiwi_Drop.apk') -Force
}
Write-Host "Готово: $outDir\Weathered_Kiwi.apk ($ver, код $code)" -ForegroundColor Green
