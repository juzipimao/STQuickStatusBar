$content = Get-Content index.js -Raw
$content = $content -replace "return \{ isValid: false, error: '正则表达式不能为 \};", "return { isValid: false, error: '正则表达式不能为空' };"
Set-Content -Path index.js -Value $content -NoNewline
Write-Host "String syntax error fixed!"
