$lines = Get-Content index.js -Encoding UTF8
$lines[481] = "                return { isValid: false, error: '正则表达式不能为空' };"
$lines | Set-Content index.js -Encoding UTF8
Write-Host "Line 482 fixed directly!"
