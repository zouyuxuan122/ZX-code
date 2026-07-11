// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 应用命令行配置测试
 *
 * 无声根因：Chromium 默认 autoplay 策略要求 media.play() 在用户手势的
 * 同步调用栈内执行。但 TTS speak() 先 await IPC 合成音频（数百毫秒），
 * 再调用 audio.play()，此时用户手势已失效，play() 被静默阻止。
 *
 * 修复：在 app.whenReady() 之前设置
 *   app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
 * 桌面应用（如 Spotify、Slack 通知）合法需要在非用户手势时播放音频。
 */
describe('configureCommandLine — 自动播放策略', () => {
  const mockAppendSwitch = vi.fn()

  beforeEach(() => {
    mockAppendSwitch.mockReset()
    // 清除模块缓存以便重新 import
    vi.resetModules()
  })

  it('应设置 autoplay-policy 为 no-user-gesture-required', async () => {
    // Mock electron app
    vi.doMock('electron', () => ({
      app: {
        commandLine: {
          appendSwitch: mockAppendSwitch,
        },
      },
    }))

    const { configureCommandLine } = await import('../../../../main/configureCommandLine')
    configureCommandLine()

    expect(mockAppendSwitch).toHaveBeenCalledWith('autoplay-policy', 'no-user-gesture-required')
  })

  it('应在 app.whenReady() 之前可安全调用（不依赖 app 就绪状态）', async () => {
    vi.doMock('electron', () => ({
      app: {
        commandLine: {
          appendSwitch: mockAppendSwitch,
        },
      },
    }))

    const { configureCommandLine } = await import('../../../../main/configureCommandLine')
    // 此函数应能在 app.whenReady() 之前调用，不抛异常
    expect(() => configureCommandLine()).not.toThrow()
  })
})
