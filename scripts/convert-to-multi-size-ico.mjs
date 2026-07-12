// 将单帧 PNG-ICO 转换为多尺寸 BMP-ICO（electron-builder/rcedit 要求的格式）
// 使用 Node.js 手动构建 ICO 二进制格式
import { readFileSync, writeFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const sourcePath = 'd:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico'
const outputPath = 'd:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico'

// 读取原始 ICO 文件
const icoBuffer = readFileSync(sourcePath)

// 解析 ICO 头
const reserved = icoBuffer.readUInt16LE(0)
const type = icoBuffer.readUInt16LE(2) // 1 = icon
const count = icoBuffer.readUInt16LE(4)
console.log(`Original ICO: type=${type}, count=${count} images`)

// 提取第一个（也是唯一一个）图像数据
const entryOffset = 6
const imgWidth = icoBuffer.readUInt8(entryOffset) || 256
const imgHeight = icoBuffer.readUInt8(entryOffset + 1) || 256
const imgSize = icoBuffer.readUInt32LE(entryOffset + 8)
const imgDataOffset = icoBuffer.readUInt32LE(entryOffset + 12)
console.log(`  Image 1: ${imgWidth}x${imgHeight}, ${imgSize} bytes, offset=${imgDataOffset}`)

// 检查是否是 PNG 格式
const isPng = icoBuffer[imgDataOffset] === 0x89 && icoBuffer[imgDataOffset + 1] === 0x50
console.log(`  Format: ${isPng ? 'PNG' : 'BMP'}`)

if (isPng) {
  // 提取 PNG 数据用于后续解码
  const pngData = icoBuffer.subarray(imgDataOffset, imgDataOffset + imgSize)
  writeFileSync('d:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon_source.png', pngData)
  console.log(`  Extracted PNG to favicon_source.png (${pngData.length} bytes)`)
}

// 使用 PowerShell 解码 PNG 并生成多尺寸 BMP-ICO
// 这里我们通过 child_process 调用 PowerShell + System.Drawing
import { execSync } from 'node:child_process'

const psScript = `
Add-Type -AssemblyName System.Drawing

$png = [System.Drawing.Image]::FromFile("d:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon_source.png")
Write-Host "Source: $($png.Width)x$($png.Height)"

$sizes = @(256, 128, 64, 48, 32, 16)
$results = @()

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
    $pixelBytes = New-Object byte[] ($size * $size * 4)
    [System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $pixelBytes, 0, $pixelBytes.Length)
    $bmp.UnlockBits($bmpData)
    $bmp.Dispose()

    # BGRA -> 预乘 alpha
    for ($i = 0; $i -lt $pixelBytes.Length; $i += 4) {
        $a = $pixelBytes[$i + 3]
        if ($a -lt 255) {
            $factor = $a / 255.0
            $pixelBytes[$i] = [byte]([Math]::Round($pixelBytes[$i] * $factor))
            $pixelBytes[$i + 1] = [byte]([Math]::Round($pixelBytes[$i + 1] * $factor))
            $pixelBytes[$i + 2] = [byte]([Math]::Round($pixelBytes[$i + 2] * $factor))
        }
    }

    # AND mask (每行 4 字节对齐)
    $andRowBytes = [Math]::Ceiling($size / 8)
    $andRowBytes = [Math]::Ceiling($andRowBytes / 4) * 4
    $andTotalBytes = $andRowBytes * $size

    # BITMAPINFOHEADER (40 bytes)
    $header = New-Object byte[] 40
    [BitConverter]::GetBytes([uint32]40).CopyTo($header, 0)
    [BitConverter]::GetBytes([uint32]$size).CopyTo($header, 4)
    [BitConverter]::GetBytes([uint32]($size * 2)).CopyTo($header, 8)
    [BitConverter]::GetBytes([uint16]1).CopyTo($header, 12)
    [BitConverter]::GetBytes([uint16]32).CopyTo($header, 14)

    $andMask = New-Object byte[] $andTotalBytes
    $imgData = New-Object byte[] (40 + $pixelBytes.Length + $andTotalBytes)
    [Array]::Copy($header, 0, $imgData, 0, 40)
    [Array]::Copy($pixelBytes, 0, $imgData, 40, $pixelBytes.Length)
    [Array]::Copy($andMask, 0, $imgData, 40 + $pixelBytes.Length, $andTotalBytes)

    $results += , $imgData
    Write-Host "Size $size : $($imgData.Length) bytes"
}

$png.Dispose()

# 构建 ICO 文件
$imgCount = $results.Count
$dataStart = 6 + $imgCount * 16

$totalLen = $dataStart
foreach ($d in $results) { $totalLen += $d.Length }

$ms = New-Object System.IO.MemoryStream($totalLen)
$w = New-Object System.IO.BinaryWriter($ms)

$w.Write([uint16]0)
$w.Write([uint16]1)
$w.Write([uint16]$imgCount)

$curOff = $dataStart
for ($i = 0; $i -lt $imgCount; $i++) {
    $sz = $sizes[$i]
    $szByte = if ($sz -eq 256) { [byte]0 } else { [byte]$sz }
    $w.Write($szByte)
    $w.Write($szByte)
    $w.Write([byte]0)
    $w.Write([byte]0)
    $w.Write([uint16]1)
    $w.Write([uint16]32)
    $w.Write([uint32]$results[$i].Length)
    $w.Write([uint32]$curOff)
    $curOff += $results[$i].Length
}

for ($i = 0; $i -lt $imgCount; $i++) {
    $w.Write($results[$i])
}

$w.Flush()
[System.IO.File]::WriteAllBytes("d:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico", $ms.ToArray())
$w.Close()
$ms.Close()

# 验证
$vb = [System.IO.File]::ReadAllBytes("d:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico")
$vc = [BitConverter]::ToUInt16($vb, 4)
Write-Host "Verification: $vc images"
for ($i = 0; $i -lt $vc; $i++) {
    $o = 6 + $i * 16
    $w2 = if ($vb[$o] -eq 0) {256} else {$vb[$o]}
    $h2 = if ($vb[$o+1] -eq 0) {256} else {$vb[$o+1]}
    $do = [BitConverter]::ToInt32($vb, $o + 12)
    $isP = ($vb[$do] -eq 0x89 -and $vb[$do+1] -eq 0x50)
    Write-Host "  Image $($i+1): ${w2}x${h2} format=$(if($isP){"PNG"}else{"BMP"})"
}
`

execSync(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, {
  stdio: 'inherit',
  cwd: 'd:\\ZX-CODE-FREE-PLUS',
})
