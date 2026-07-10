// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron（logger.service 导入 electron.app）
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-logs'),
  },
}))

import { logger } from '../../../../main/services/logger.service'

describe('logger — 敏感信息脱敏', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleInfoSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  it('脱敏 Bearer token', () => {
    logger.info('Authorization: Bearer sk-123456789abcdef')
    expect(consoleInfoSpy).toHaveBeenCalled()
    const logged = consoleInfoSpy.mock.calls[0][0] as string
    expect(logged).not.toContain('sk-123456789abcdef')
    expect(logged).toContain('Bearer ***')
  })

  it('脱敏 URL 中的 key 查询参数（Gemini API key 泄露场景）', () => {
    logger.error(`HTTP 400 [https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyB123456789]: Invalid request`)
    expect(consoleErrorSpy).toHaveBeenCalled()
    const logged = consoleErrorSpy.mock.calls[0][0] as string
    expect(logged).not.toContain('AIzaSyB123456789')
    expect(logged).toContain('key=***')
  })

  it('脱敏 x-api-key 头', () => {
    logger.info('x-api-key: sk-ant-api03-123456789')
    expect(consoleInfoSpy).toHaveBeenCalled()
    const logged = consoleInfoSpy.mock.calls[0][0] as string
    expect(logged).not.toContain('sk-ant-api03-123456789')
  })

  it('正常日志不受影响', () => {
    logger.info('chat:send 异常 [conv=abc-123]: 网络请求失败')
    expect(consoleInfoSpy).toHaveBeenCalled()
    const logged = consoleInfoSpy.mock.calls[0][0] as string
    expect(logged).toContain('conv=abc-123')
    expect(logged).toContain('网络请求失败')
  })
})
