$lines = Get-Content index.js -Encoding UTF8
$lines[585] = "            console.log('[' + EXTENSION_NAME + '] Character object:', character ? 'exists' : 'not exists');"
$lines | Set-Content index.js -Encoding UTF8
Write-Host "Line 586 string concatenation fixed!"
