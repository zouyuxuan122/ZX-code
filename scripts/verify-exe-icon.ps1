# 验证 exe 嵌入的图标资源
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class IconExtractor {
    [DllImport("user32.dll")]
    public static extern IntPtr PrivateExtractIcons(string lpszFile, int nIconIndex, int cxIcon, int cyIcon, IntPtr[] phicon, uint[] piconid, uint nIcons, uint flags);
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

function Get-IconHash {
    param([string]$Path, [int]$Size = 256)
    $icons = New-Object IntPtr[] 1
    $ids = New-Object uint32[] 1
    $ret = [IconExtractor]::PrivateExtractIcons($Path, 0, $Size, $Size, $icons, $ids, 1, 0)
    if ($ret -eq 0 -or $icons[0] -eq [IntPtr]::Zero) {
        Write-Host "  [FAIL] No icon extracted from $Path"
        return $null
    }
    try {
        $icon = [System.Drawing.Icon]::FromHandle($icons[0])
        $bmp = $icon.ToBitmap()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $ms.ToArray()
        $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
        $hash = ([System.BitConverter]::ToString($sha) -replace '-','')
        Write-Host ("  {0} ({1}x{2}): {3}" -f $Path, $bmp.Width, $bmp.Height, $hash)
        return $hash
    } finally {
        [IconExtractor]::DestroyIcon($icons[0]) | Out-Null
    }
}

Write-Host "=== Icon Hash Comparison ==="
$h1 = Get-IconHash 'D:\ZX-CODE-FREE-PLUS\release\win-unpacked\ZX-Code.exe'
$h2 = Get-IconHash 'D:\ZX-CODE-FREE-PLUS\release\ZX-Code-0.2.0-x64.exe'
$h3 = Get-IconHash 'D:\ZX-CODE-FREE-PLUS\resources\icons\favicon.ico'

# Electron default icon - check from node_modules
$electronExe = 'D:\ZX-CODE-FREE-PLUS\node_modules\electron\dist\electron.exe'
if (Test-Path $electronExe) {
    $h4 = Get-IconHash $electronExe
    Write-Host ""
    Write-Host "=== Comparison with Electron default ==="
    if ($h1 -eq $h4) {
        Write-Host "  win-unpacked\ZX-Code.exe == Electron default (BAD: still default)"
    } else {
        Write-Host "  win-unpacked\ZX-Code.exe != Electron default (GOOD: custom icon embedded)"
    }
    if ($h1 -eq $h3) {
        Write-Host "  win-unpacked\ZX-Code.exe == favicon.ico (PERFECT: matches source)"
    } else {
        Write-Host "  win-unpacked\ZX-Code.exe != favicon.ico (MISMATCH: embedded icon differs from source)"
    }
} else {
    Write-Host "  electron.exe not found at $electronExe"
}

# Also check all sizes
Write-Host ""
Write-Host "=== All icon sizes in win-unpacked\ZX-Code.exe ==="
foreach ($sz in @(16, 32, 48, 64, 128, 256)) {
    Get-IconHash 'D:\ZX-CODE-FREE-PLUS\release\win-unpacked\ZX-Code.exe' -Size $sz
}
