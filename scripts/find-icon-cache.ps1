# 搜索所有可能的 Windows 图标缓存位置
Write-Host "=== Searching for icon cache files ==="

$searchPaths = @(
    "$env:LOCALAPPDATA",
    "$env:LOCALAPPDATA\explorer",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer",
    "$env:LOCALAPPDATA\Microsoft\Windows",
    "$env:APPDATA\Microsoft\Windows"
)

foreach ($p in $searchPaths) {
    if (Test-Path $p) {
        Write-Host ""
        Write-Host ("--- {0} ---" -f $p)
        Get-ChildItem -Path $p -Filter "*icon*" -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host ("  {0}  size={1}  modified={2}" -f $_.Name, $_.Length, $_.LastWriteTime)
        }
        Get-ChildItem -Path $p -Filter "*cache*" -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host ("  {0}  size={1}  modified={2}" -f $_.Name, $_.Length, $_.LastWriteTime)
        }
    }
}

# 列出 explorer 目录所有 .db 文件
Write-Host ""
Write-Host "=== All .db files in LOCALAPPDATA\explorer ==="
$explorerDir = "$env:LOCALAPPDATA\explorer"
if (Test-Path $explorerDir) {
    Get-ChildItem -Path $explorerDir -Filter "*.db" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("  {0}  size={1}  modified={2}" -f $_.Name, $_.Length, $_.LastWriteTime)
    }
} else {
    Write-Host "  Directory does not exist: $explorerDir"
}

# 列出 LOCALAPPDATA\Microsoft\Windows\Explorer 所有 .db 文件
Write-Host ""
Write-Host "=== All .db files in LOCALAPPDATA\Microsoft\Windows\Explorer ==="
$msExplorerDir = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
if (Test-Path $msExplorerDir) {
    Get-ChildItem -Path $msExplorerDir -Filter "*.db" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("  {0}  size={1}  modified={2}" -f $_.Name, $_.Length, $_.LastWriteTime)
    }
} else {
    Write-Host "  Directory does not exist: $msExplorerDir"
}

# 检查 thumbcache 文件
Write-Host ""
Write-Host "=== thumbcache files (may also cache icons) ==="
if (Test-Path $msExplorerDir) {
    Get-ChildItem -Path $msExplorerDir -Filter "thumbcache*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("  {0}  size={1}  modified={2}" -f $_.Name, $_.Length, $_.LastWriteTime)
    }
}
