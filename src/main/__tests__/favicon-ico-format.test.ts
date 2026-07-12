import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 验证 favicon.ico 文件格式符合 rcedit 和 Windows 资源管理器要求
 *
 * 根本原因回顾：
 * 1. 原始 favicon.ico 是单帧 PNG 格式 ICO
 * 2. electron-builder 的 rcedit 要求多尺寸 BMP 格式 ICO
 * 3. PNG 格式 ICO 会导致 rcedit 失败或 SHGetFileInfo 读取异常
 * 4. 必须包含 16/32/48/256 等标准尺寸以确保所有显示场景正确
 */
describe('favicon.ico 文件格式', () => {
  const icoPath = 'd:\\ZX-CODE-FREE-PLUS\\resources\\icons\\favicon.ico'
  const bytes = readFileSync(icoPath)

  it('ICO 头部 reserved 字段为 0', () => {
    expect(bytes[0]).toBe(0)
    expect(bytes[1]).toBe(0)
  })

  it('ICO type 为 1（icon）', () => {
    expect(bytes[2]).toBe(1)
    expect(bytes[3]).toBe(0)
  })

  it('包含多个尺寸的图标帧（至少 4 个）', () => {
    const count = bytes.readUInt16LE(4)
    expect(count).toBeGreaterThanOrEqual(4)
  })

  it('所有图标帧使用 BMP 格式（非 PNG），rcedit 兼容', () => {
    const count = bytes.readUInt16LE(4)
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16
      const dataOffset = bytes.readUInt32LE(entryOffset + 12)
      // PNG 数据以 0x89 0x50 (‰PNG) 开头
      // BMP 数据以 BITMAPINFOHEADER (40 bytes) 开头，第一字节是 0x28 (40)
      const isPng = bytes[dataOffset] === 0x89 && bytes[dataOffset + 1] === 0x50
      expect(isPng).toBe(false)
    }
  })

  it('包含 256x256 尺寸（大图标显示必需）', () => {
    const count = bytes.readUInt16LE(4)
    let has256 = false
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16
      const w = bytes[entryOffset]
      const h = bytes[entryOffset + 1]
      // 256 在 ICO 中存储为 0
      if (w === 0 && h === 0) has256 = true
    }
    expect(has256).toBe(true)
  })

  it('包含 32x32 尺寸（资源管理器默认显示必需）', () => {
    const count = bytes.readUInt16LE(4)
    let has32 = false
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16
      const w = bytes[entryOffset]
      const h = bytes[entryOffset + 1]
      if (w === 32 && h === 32) has32 = true
    }
    expect(has32).toBe(true)
  })

  it('包含 16x16 尺寸（任务栏小图标显示必需）', () => {
    const count = bytes.readUInt16LE(4)
    let has16 = false
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16
      const w = bytes[entryOffset]
      const h = bytes[entryOffset + 1]
      if (w === 16 && h === 16) has16 = true
    }
    expect(has16).toBe(true)
  })
})
