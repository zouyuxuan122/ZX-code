Add-Type -AssemblyName System.Drawing

$sourcePath = "d:\ZX-CODE-FREE-PLUS\resources\icons\favicon.ico"
$pngPath = "d:\ZX-CODE-FREE-PLUS\resources\icons\favicon_source.png"

# Step 1: 从原始 ICO 提取 PNG 数据
$icoBytes = [System.IO.File]::ReadAllBytes($sourcePath)
$imgDataOff = [BitConverter]::ToInt32($icoBytes, 18)
$imgDataSize = [BitConverter]::ToInt32($icoBytes, 14)
$isPng = ($icoBytes[$imgDataOff] -eq 0x89 -and $icoBytes[$imgDataOff + 1] -eq 0x50)

if ($isPng) {
    $pngData = [byte[]]::new($imgDataSize)
    [Array]::Copy($icoBytes, $imgDataOff, $pngData, 0, $imgDataSize)
    [System.IO.File]::WriteAllBytes($pngPath, $pngData)
    Write-Host "Extracted PNG ($imgDataSize bytes)"
} else {
    $icon = New-Object System.Drawing.Icon($sourcePath, 256, 256)
    $srcBmp = $icon.ToBitmap()
    $srcBmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $srcBmp.Dispose()
    $icon.Dispose()
    Write-Host "Converted to PNG"
}

# Step 2: 生成多尺寸 BMP ICO
$png = [System.Drawing.Image]::FromFile($pngPath)
Write-Host "Source: $($png.Width)x$($png.Height)"

$sizes = @(256, 128, 64, 48, 32, 16)
$imageDataList = [System.Collections.ArrayList]::new()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($png, 0, 0, $size, $size)
    $g.Dispose()

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $pixelLen = $size * $size * 4
    $pixelBytes = [byte[]]::new($pixelLen)
    [System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $pixelBytes, 0, $pixelLen)
    $bmp.UnlockBits($bmpData)
    $bmp.Dispose()

    # 预乘 alpha
    for ($i = 0; $i -lt $pixelLen; $i += 4) {
        $a = $pixelBytes[$i + 3]
        if ($a -lt 255) {
            $factor = $a / 255.0
            $pixelBytes[$i] = [byte]([Math]::Round($pixelBytes[$i] * $factor))
            $pixelBytes[$i + 1] = [byte]([Math]::Round($pixelBytes[$i + 1] * $factor))
            $pixelBytes[$i + 2] = [byte]([Math]::Round($pixelBytes[$i + 2] * $factor))
        }
    }

    # AND mask
    $andRowBytes = [Math]::Ceiling([Math]::Ceiling($size / 8) / 4) * 4
    $andTotalBytes = $andRowBytes * $size

    # BITMAPINFOHEADER
    $header = [byte[]]::new(40)
    [BitConverter]::GetBytes([uint32]40).CopyTo($header, 0)
    [BitConverter]::GetBytes([uint32]$size).CopyTo($header, 4)
    [BitConverter]::GetBytes([uint32]($size * 2)).CopyTo($header, 8)
    [BitConverter]::GetBytes([uint16]1).CopyTo($header, 12)
    [BitConverter]::GetBytes([uint16]32).CopyTo($header, 14)

    $andMask = [byte[]]::new($andTotalBytes)
    $imgTotalLen = 40 + $pixelLen + $andTotalBytes
    $imgData = [byte[]]::new($imgTotalLen)
    [Array]::Copy($header, 0, $imgData, 0, 40)
    [Array]::Copy($pixelBytes, 0, $imgData, 40, $pixelLen)
    [Array]::Copy($andMask, 0, $imgData, 40 + $pixelLen, $andTotalBytes)

    $imageDataList.Add($imgData) | Out-Null
    Write-Host "  ${size}x${size}: $imgTotalLen bytes"
}

$png.Dispose()

# Step 3: 构建 ICO
$imgCount = $imageDataList.Count
$dataStart = 6 + $imgCount * 16
$totalLen = $dataStart
foreach ($d in $imageDataList) { $totalLen += $d.Length }

$ms = New-Object System.IO.MemoryStream($totalLen)
$bw = New-Object System.IO.BinaryWriter($ms)

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$imgCount)

$curOff = $dataStart
for ($i = 0; $i -lt $imgCount; $i++) {
    $sz = $sizes[$i]
    $data = $imageDataList[$i]
    $szByte = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }

    $bw.Write($szByte)
    $bw.Write($szByte)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$data.Length)
    $bw.Write([uint32]$curOff)
    $curOff += $data.Length
}

for ($i = 0; $i -lt $imgCount; $i++) {
    $bw.Write($imageDataList[$i])
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($sourcePath, $ms.ToArray())
$bw.Close()
$ms.Close()

# Step 4: 验证
$outFile = Get-Item $sourcePath
Write-Host "Done! $([math]::Round($outFile.Length/1024, 1)) KB"

$vb = [System.IO.File]::ReadAllBytes($sourcePath)
$vc = [BitConverter]::ToUInt16($vb, 4)
Write-Host "Verification: $vc images"
for ($i = 0; $i -lt $vc; $i++) {
    $o = 6 + $i * 16
    $w2 = if ($vb[$o] -eq 0) { 256 } else { $vb[$o] }
    $h2 = if ($vb[$o + 1] -eq 0) { 256 } else { $vb[$o + 1] }
    $do = [BitConverter]::ToInt32($vb, $o + 12)
    $isP = ($vb[$do] -eq 0x89 -and $vb[$do + 1] -eq 0x50)
    $fmt = if ($isP) { "PNG" } else { "BMP" }
    Write-Host "  Image $($i+1): ${w2}x${h2} $fmt"
}
