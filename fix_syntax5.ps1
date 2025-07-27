$lines = Get-Content index.js -Encoding UTF8
$lines[481] = "                return { isValid: false, error: 'Regex pattern cannot be empty' };"
$lines | Set-Content index.js -Encoding UTF8
Write-Host "Line 482 fixed with English message!"
