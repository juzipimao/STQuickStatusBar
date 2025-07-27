$content = Get-Content index.js -Raw
$content = $content -replace '<strong>🔧 ST快速状态栏 - 正则表达式工具/strong>', '<strong>🔧 ST快速状态栏 - 正则表达式工具</strong>'
Set-Content -Path index.js -Value $content -NoNewline
Write-Host "Syntax error fixed!"
