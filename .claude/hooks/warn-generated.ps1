# PostToolUse/Write|Edit hook: предупреждает о ручной правке автогенерируемых файлов.
# web_content.h собирается gen_web_header.py из wind-ui/dist — любая ручная правка
# молча потеряется при следующей генерации.

$ErrorActionPreference = 'Stop'

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }

    $payload = $raw | ConvertFrom-Json
    $path = $payload.tool_input.file_path
    if (-not $path) { $path = $payload.tool_response.filePath }
    if (-not $path) { exit 0 }

    if ($path -notlike '*web_content.h') { exit 0 }

    $msg = 'web_content.h автогенерируется gen_web_header.py из wind-ui/dist — ручная правка потеряется при следующей генерации. Меняй исходники дашборда и перегенерируй заголовок.'

    $out = @{
        systemMessage      = $msg
        hookSpecificOutput = @{
            hookEventName     = 'PostToolUse'
            additionalContext = $msg
        }
    }
    $out | ConvertTo-Json -Compress -Depth 5
}
catch {
    exit 0
}
