# 清除 Windows 图标缓存并重启 explorer
# 这会修复资源管理器显示旧图标的问题

$ErrorActionPreference = "Stop"

Write-Host "=== Step 1: Kill explorer.exe ==="
$explorerProc = Get-Process -Name "explorer" -ErrorAction SilentlyContinue
if ($explorerProc) {
    Write-Host "  Stopping explorer.exe (PID=$($explorerProc.Id))..."
    Stop-Process -Name "explorer" -Force
    Start-Sleep -Seconds 2
    Write-Host "  explorer.exe stopped."
} else {
    Write-Host "  explorer.exe not running."
}

Write-Host ""
Write-Host "=== Step 2: Delete iconcache files ==="
$cacheDir = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
$iconCacheFiles = Get-ChildItem -Path $cacheDir -Filter "iconcache_*.db" -ErrorAction SilentlyContinue
$deletedCount = 0
foreach ($f in $iconCacheFiles) {
    try {
        Remove-Item -Path $f.FullName -Force -ErrorAction Stop
        Write-Host "  Deleted: $($f.Name)"
        $deletedCount++
    } catch {
        Write-Host "  FAILED to delete: $($f.Name) - $($_.Exception.Message)"
    }
}
Write-Host "  Total deleted: $deletedCount files"

# 也删除旧的 IconCache.db（如果存在）
$oldCache = "$env:LOCALAPPDATA\IconCache.db"
if (Test-Path $oldCache) {
    try {
        Remove-Item -Path $oldCache -Force -ErrorAction Stop
        Write-Host "  Deleted: IconCache.db"
    } catch {
        Write-Host "  FAILED to delete IconCache.db - $($_.Exception.Message)"
    }
} else {
    Write-Host "  IconCache.db not present (already absent)."
}

Write-Host ""
Write-Host "=== Step 3: Restart explorer.exe ==="
Start-Process explorer.exe
Start-Sleep -Seconds 2
$newExplorer = Get-Process -Name "explorer" -ErrorAction SilentlyContinue
if ($newExplorer) {
    Write-Host "  explorer.exe restarted (PID=$($newExplorer.Id))."
} else {
    Write-Host "  WARNING: explorer.exe did not restart automatically."
    Write-Host "  Please press Ctrl+Shift+Esc, then File > Run new task > 'explorer.exe'."
}

Write-Host ""
Write-Host "=== Step 4: Force icon refresh via SHChangeNotify ==="
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Shell32 {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
# SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
[Shell32]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host "  SHChangeNotify sent (SHCNE_ASSOCCHANGED)."

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Icon cache cleared. Explorer will re-read the exe icon."
Write-Host "If the icon still shows default, try:"
Write-Host "  1. Right-click the exe > Properties > OK (forces icon reload)"
Write-Host "  2. Or move the exe to a different path (bypasses cache)"
