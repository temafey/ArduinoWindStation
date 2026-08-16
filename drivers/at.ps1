# Отправить пачку AT-команд модулю A7670E и показать ответы.
# Разбор и порядок работ — в A7670E-DRIVERS.md (в корне репозитория).
#
#   .\at.ps1 -PortName COM10 -Cmds "ATI","AT+CPIN?","AT+CSQ"
#   .\at.ps1 -Cmds "AT+CFUN=1,1" -Wait 8000      # долгим командам дать окно побольше
#
# Порт — тот, что в диспетчере устройств называется "SimTech HS-USB AT Port".
# Номер COM плавает от перетыкания, проверять перед сеансом:
#   Get-PnpDevice -Class Ports | Where-Object FriendlyName -like "*AT Port*"

param(
  [string]$PortName = "COM10",   # AT-порт модуля (MI_04), НЕ Diagnostics и НЕ NMEA
  [string[]]$Cmds,               # список команд без завершающего CR
  [int]$Wait = 800               # мс ожидания первого ответа; окно продлевается, пока идут данные
)

$p = New-Object System.IO.Ports.SerialPort $PortName, 115200, "None", 8, "One"
$p.ReadTimeout  = 300
$p.WriteTimeout = 1000
# DTR/RTS обязательны: без них модуль не считает порт открытым и молчит на всё
$p.DtrEnable    = $true
$p.RtsEnable    = $true
$p.NewLine      = "`r`n"

try {
  $p.Open()
  Start-Sleep -Milliseconds 200
  $p.DiscardInBuffer()

  foreach ($c in $Cmds) {
    Write-Output "---> $c"
    # модулю нужен именно CR, не CRLF
    $p.Write("$c`r")
    $sb = New-Object System.Text.StringBuilder
    $deadline = (Get-Date).AddMilliseconds($Wait)
    while ((Get-Date) -lt $deadline) {
      $chunk = $p.ReadExisting()
      if ($chunk) {
        [void]$sb.Append($chunk)
        # продлеваем окно, пока данные идут: длинные ответы приходят порциями
        $deadline = (Get-Date).AddMilliseconds(400)
      }
      Start-Sleep -Milliseconds 50
    }
    $out = $sb.ToString() -replace "`r`n", "`n"
    foreach ($line in ($out -split "`n")) {
      if ($line.Trim().Length -gt 0) { Write-Output "     $line" }
    }
    Write-Output ""
  }
}
finally {
  if ($p.IsOpen) { $p.Close() }
  $p.Dispose()
}
