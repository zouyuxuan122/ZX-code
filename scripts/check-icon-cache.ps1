# 检查 Windows 图标缓存状态
Write-Host "=== Windows Icon Cache Files ==="

$localAppData = $env:LOCALAPPDATA
$cacheFiles = @(
    "$localAppData\IconCache.db",
    "$localAppData\explorer\iconcache_16.db",
    "$localAppData\explorer\iconcache_32.db",
    "$localAppData\explorer\iconcache_48.db",
    "$localAppData\explorer\iconcache_96.db",
    "$localAppData\explorer\iconcache_256.db",
    "$localAppData\explorer\iconcache_exif.db",
    "$localAppData\explorer\iconcache_idx.db",
    "$localAppData\explorer\iconcache_sr.db",
    "$localAppData\explorer\iconcache_wide.db",
    "$localAppData\explorer\iconcache_wide_alternate.db"
)

foreach ($f in $cacheFiles) {
    if (Test-Path $f) {
        $info = Get-Item $f
        Write-Host ("  {0}  size={1}  modified={2}" -f $f, $info.Length, $info.LastWriteTime)
    } else {
        Write-Host ("  {0}  [not found]" -f $f)
    }
}

# 检查是否有正在运行的 ZX-Code 进程锁定 exe
Write-Host ""
Write-Host "=== Running ZX-Code processes ==="
$procs = Get-Process -Name "ZX-Code" -ErrorAction SilentlyContinue
if ($procs) {
    foreach ($p in $procs) {
        Write-Host ("  PID={0}  Path={1}" -f $p.Id, $p.Path)
    }
} else {
    Write-Host "  No ZX-Code processes running"
}

# 检查 explorer.exe 是否在运行
Write-Host ""
Write-Host "=== explorer.exe ==="
$exp = Get-Process -Name "explorer" -ErrorAction SilentlyContinue
if ($exp) {
    Write-Host ("  explorer.exe running, PID={0}" -f $exp.Id)
} else {
    Write-Host "  explorer.exe not running"
}

# 检查 exe 文件修改时间
Write-Host ""
Write-Host "=== Target exe file info ==="
$exePath = 'D:\ZX-CODE-FREE-PLUS\release\win-unpacked\ZX-Code.exe'
if (Test-Path $exePath) {
    $info = Get-Item $exePath
    Write-Host ("  Path: {0}" -f $exePath)
    Write-Host ("  Size: {0} bytes ({1:N2} MB)" -f $info.Length, ($info.Length/1MB))
    Write-Host ("  Modified: {0}" -f $info.LastWriteTime)
    Write-Host ("  Created: {0}" -f $info.CreationTime)
}
