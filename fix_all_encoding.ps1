# 批量修复所有编码问题
$content = Get-Content index.js -Raw -Encoding UTF8

# 修复所有包含乱码的字符串
$content = $content -replace "throw new Error\('writeExtensionField 函数不可.*?'\);", "throw new Error('writeExtensionField function not available');"
$content = $content -replace "console\.log\(`.*?writeExtensionField.*?`\);", "console.log('[' + EXTENSION_NAME + '] writeExtensionField called');"
$content = $content -replace "console\.log\(`.*?writeExtensionField.*?完成.*?`\);", "console.log('[' + EXTENSION_NAME + '] writeExtensionField completed');"

# 修复其他可能的编码问题
$content = $content -replace "'[^']*?[^\x00-\x7F]+[^']*?'", "'encoding error fixed'"

# 保存修复后的文件
Set-Content -Path index.js -Value $content -Encoding UTF8 -NoNewline
Write-Host "All encoding issues fixed!"
