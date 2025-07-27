$content = Get-Content index.js -Raw -Encoding UTF8
$content = $content -replace "return \{ isValid: false, error: '正则表达式不能为.*?' \};", "return { isValid: false, error: '正则表达式不能为空' };"
Set-Content -Path index.js -Value $content -NoNewline -Encoding UTF8
Write-Host "UTF8 encoding syntax error fixed!"
