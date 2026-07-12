import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

/**
 * 验证 ICO 文件中 BMP 帧的像素数据行顺序是 bottom-up
 *
 * BMP/ICO 格式规范：
 * - BITMAPINFOHEADER.biHeight 为正数 = bottom-up（从下到上存储）
 * - 像素数据第一行 = 图像底部（y=height-1）
 * - 像素数据最后一行 = 图像顶部（y=0）
 *
 * 如果像素数据写成了 top-down（第一行=顶部），但 biHeight 是正数，
 * Windows 会按 bottom-up 解读，导致图标上下颠倒。
 *
 * 验证方法：
 * - 用 pngjs 解析原始 PNG，缩放采样到 256x256（最近邻）
 * - 读取 ICO 256x256 BMP 帧的像素数据
 * - 如果 ICO 是正确的 bottom-up：
 *   ICO 像素第一行 ≈ PNG 最后一行（图像底部）
 *   ICO 像素最后一行 ≈ PNG 第一行（图像顶部）
 */
describe('favicon.ico BMP 像素行顺序验证', () => {
  const icoPath = 'd:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico'
  const pngPath = 'd:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon_source.png'
  const icoBytes = readFileSync(icoPath)
  const size = 256
  const rowBytes = size * 4

  // 从 ICO 提取 256x256 BMP 帧的像素数据
  function extractIcoPixels(): Buffer {
    const count = icoBytes.readUInt16LE(4)
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16
      const w = icoBytes[entryOffset]
      const h = icoBytes[entryOffset + 1]
      if (w !== 0 || h !== 0) continue // 256 在 ICO 中存储为 0

      const dataOffset = icoBytes.readUInt32LE(entryOffset + 12)
      const pixelStart = dataOffset + 40 // 跳过 BITMAPINFOHEADER
      const pixelLen = size * size * 4
      return Buffer.from(icoBytes.subarray(pixelStart, pixelStart + pixelLen))
    }
    throw new Error('No 256x256 frame in ICO')
  }

  // 用 pngjs 解析 PNG 并采样到 256x256（BGRA, top-down）
  function getPngPixels256(): Buffer {
    const pngBuffer = readFileSync(pngPath)
    const png = PNG.sync.read(pngBuffer)
    // png.data 是 RGBA, top-down
    const srcW = png.width
    const srcH = png.height
    const bgra = Buffer.alloc(size * size * 4)

    for (let y = 0; y < size; y++) {
      // 最近邻采样
      const srcY = Math.floor((y / size) * srcH)
      for (let x = 0; x < size; x++) {
        const srcX = Math.floor((x / size) * srcW)
        const srcIdx = (srcY * srcW + srcX) * 4
        const dstIdx = (y * size + x) * 4
        // RGBA → BGRA
        bgra[dstIdx] = png.data[srcIdx + 2]     // B
        bgra[dstIdx + 1] = png.data[srcIdx + 1] // G
        bgra[dstIdx + 2] = png.data[srcIdx]     // R
        bgra[dstIdx + 3] = png.data[srcIdx + 3] // A
      }
    }
    return bgra
  }

  const icoPixels = extractIcoPixels()
  const pngPixels = getPngPixels256()

  function getPixel(buf: Buffer, x: number, y: number): [number, number, number, number] {
    const idx = (y * rowBytes + x * 4)
    return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]]
  }

  it('ICO 第一行像素 ≈ PNG 最后一行像素（bottom-up: ICO row 0 = image bottom）', () => {
    const icoFirstRow = getPixel(icoPixels, 128, 0)
    const pngLastRow = getPixel(pngPixels, 128, size - 1)

    // 容差 30：预乘 alpha + 最近邻缩放可能导致差异
    expect(Math.abs(icoFirstRow[0] - pngLastRow[0])).toBeLessThan(30)
    expect(Math.abs(icoFirstRow[1] - pngLastRow[1])).toBeLessThan(30)
    expect(Math.abs(icoFirstRow[2] - pngLastRow[2])).toBeLessThan(30)
  })

  it('ICO 最后一行像素 ≈ PNG 第一行像素（bottom-up: ICO last row = image top）', () => {
    const icoLastRow = getPixel(icoPixels, 128, size - 1)
    const pngFirstRow = getPixel(pngPixels, 128, 0)

    expect(Math.abs(icoLastRow[0] - pngFirstRow[0])).toBeLessThan(30)
    expect(Math.abs(icoLastRow[1] - pngFirstRow[1])).toBeLessThan(30)
    expect(Math.abs(icoLastRow[2] - pngFirstRow[2])).toBeLessThan(30)
  })

  it('ICO 中间行像素 ≈ PNG 中间行像素（中间行不受方向影响）', () => {
    const midY = Math.floor(size / 2)
    const icoMid = getPixel(icoPixels, 128, midY)
    const pngMid = getPixel(pngPixels, 128, midY)

    expect(Math.abs(icoMid[0] - pngMid[0])).toBeLessThan(30)
    expect(Math.abs(icoMid[1] - pngMid[1])).toBeLessThan(30)
    expect(Math.abs(icoMid[2] - pngMid[2])).toBeLessThan(30)
  })

  it('方向反转验证：ICO 第一行 != ICO 最后一行（图标非对称，方向可检测）', () => {
    const icoFirstRow = getPixel(icoPixels, 128, 0)
    const icoLastRow = getPixel(icoPixels, 128, size - 1)
    const diff = Math.abs(icoFirstRow[0] - icoLastRow[0])
    expect(diff).toBeGreaterThan(10)
  })
})
