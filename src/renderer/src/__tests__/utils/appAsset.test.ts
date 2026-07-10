import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toAppAssetUrl } from '@/utils/appAsset'

describe('toAppAssetUrl 路径转换', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // 默认模拟生产环境：file:// 加载
    Object.defineProperty(window, 'location', {
      value: { href: 'file:///C:/app/out/renderer/index.html' },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  it('http(s) URL 原样返回', () => {
    expect(toAppAssetUrl('https://example.com/model.json')).toBe(
      'https://example.com/model.json',
    )
    expect(toAppAssetUrl('http://localhost:5173/model.json')).toBe(
      'http://localhost:5173/model.json',
    )
  })

  it('app-asset URL 原样返回', () => {
    expect(toAppAssetUrl('app-asset:///C:/models/test.json')).toBe(
      'app-asset:///C:/models/test.json',
    )
  })

  it('data URL 原样返回', () => {
    expect(toAppAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })

  it('Windows 绝对路径转换为 app-asset URL', () => {
    expect(toAppAssetUrl('C:/Users/test/models/fense.model3.json')).toBe(
      'app-asset:///C:/Users/test/models/fense.model3.json',
    )
  })

  it('Windows 绝对路径（反斜杠）转换为 app-asset URL', () => {
    expect(toAppAssetUrl('C:\\Users\\test\\models\\fense.model3.json')).toBe(
      'app-asset:///C:/Users/test/models/fense.model3.json',
    )
  })

  it('相对路径在生产环境（file://）解析为 app-asset URL', () => {
    // 生产环境 window.location.href = file:///C:/app/out/renderer/index.html
    // 相对路径 models/live2d/fense/fense.model3.json 应解析为
    // file:///C:/app/out/renderer/models/live2d/fense/fense.model3.json
    // 再转换为 app-asset:///C:/app/out/renderer/models/live2d/fense/fense.model3.json
    const result = toAppAssetUrl('models/live2d/fense/fense.model3.json')
    expect(result).toBe(
      'app-asset:///C:/app/out/renderer/models/live2d/fense/fense.model3.json',
    )
  })

  it('相对路径在开发环境（http://）解析为 http URL', () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:5173/' },
      writable: true,
    })
    const result = toAppAssetUrl('models/live2d/fense/fense.model3.json')
    expect(result).toBe('http://localhost:5173/models/live2d/fense/fense.model3.json')
  })

  it('Unix 绝对路径转换为 app-asset URL', () => {
    expect(toAppAssetUrl('/home/user/models/fense.model3.json')).toBe(
      'app-asset:///home/user/models/fense.model3.json',
    )
  })
})
