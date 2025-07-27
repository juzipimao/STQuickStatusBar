$lines = Get-Content index.js -Encoding UTF8
$lines[578] = "                throw new Error('No character selected or character invalid');"
$lines | Set-Content index.js -Encoding UTF8
Write-Host "Line 579 fixed!"
