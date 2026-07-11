import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TtsSynthesizeResponse } from '@shared/types/ipc'

// Mock IPC API
const mockSynthesize = vi.fn()
const mockListVoices = vi.fn()
const mockGetSettings = vi.fn()
const mockCleanupAudio = vi.fn().mockResolvedValue({ ok: true })

// Mock the window.api object
Object.defineProperty(window, 'api', {
  value: {
    tts: {
      synthesize: (...args: unknown[]) => mockSynthesize(...args),
      listVoices: (...args: unknown[]) => mockListVoices(...args),
      getSettings: (...args: unknown[]) => mockGetSettings(...args),
      cleanupAudio: (...args: unknown[]) => mockCleanupAudio(...args),
    },
  },
  writable: true,
  configurable: true,
})

// Mock Audio — 必须用普通 function（new 调用需要 constructor）
window.Audio = vi.fn().mockImplementation(function () {
  return {
    src: '',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    currentTime: 0,
    duration: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  }
}) as unknown as typeof Audio

import { useTtsStore } from '../../stores/ttsStore'

describe('TTS Store — 播放状态管理', () => {
  beforeEach(() => {
    mockSynthesize.mockReset()
    mockListVoices.mockReset()
    mockGetSettings.mockReset()
    mockCleanupAudio.mockReset()
    mockCleanupAudio.mockResolvedValue({ ok: true })
    vi.mocked(window.Audio).mockClear()
    useTtsStore.getState().reset()
  })

  it('初始状态应无正在播放的消息', () => {
    const state = useTtsStore.getState()
    expect(state.playingMessageId).toBeNull()
    expect(state.isPlaying).toBe(false)
  })

  it('speak 应调用 IPC synthesize 并设置播放状态', async () => {
    mockSynthesize.mockResolvedValueOnce({
      ok: true,
      filePath: 'C:\\tmp\\tts-test.mp3',
      format: 'mp3',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-1', '你好世界')

    expect(mockSynthesize).toHaveBeenCalledWith('你好世界', undefined)
    expect(useTtsStore.getState().playingMessageId).toBe('msg-1')
    expect(useTtsStore.getState().isPlaying).toBe(true)
  })

  it('speak 应使用 app-asset:// 协议播放临时文件', async () => {
    mockSynthesize.mockResolvedValueOnce({
      ok: true,
      filePath: 'C:\\tmp\\tts-test.mp3',
      format: 'mp3',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-1', '你好世界')

    // Audio 构造函数应被调用，且参数为 app-asset:// URL
    const audioCalls = (window.Audio as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(audioCalls.length).toBe(1)
    expect(audioCalls[0][0]).toBe('app-asset:///C:/tmp/tts-test.mp3')
    // audioFilePath 应为 IPC 返回的原始路径
    expect(useTtsStore.getState().audioFilePath).toBe('C:\\tmp\\tts-test.mp3')
  })

  it('speak 失败时应设置 error 状态且不播放', async () => {
    mockSynthesize.mockResolvedValueOnce({
      ok: false,
      error: 'TTS 功能未启用',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-2', '测试')

    expect(useTtsStore.getState().playingMessageId).toBeNull()
    expect(useTtsStore.getState().isPlaying).toBe(false)
    expect(useTtsStore.getState().error).toBe('TTS 功能未启用')
  })

  it('stop 应停止播放并清除状态', async () => {
    mockSynthesize.mockResolvedValueOnce({
      ok: true,
      filePath: 'C:\\tmp\\tts-test.mp3',
      format: 'mp3',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-3', '播放中')
    expect(useTtsStore.getState().isPlaying).toBe(true)

    useTtsStore.getState().stop()
    expect(useTtsStore.getState().playingMessageId).toBeNull()
    expect(useTtsStore.getState().isPlaying).toBe(false)
  })

  it('stop 应调用 cleanupAudio 清理临时文件', async () => {
    mockSynthesize.mockResolvedValueOnce({
      ok: true,
      filePath: 'C:\\tmp\\tts-stop-test.mp3',
      format: 'mp3',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-3', '播放中')
    useTtsStore.getState().stop()
    expect(mockCleanupAudio).toHaveBeenCalledWith('C:\\tmp\\tts-stop-test.mp3')
  })

  it('再次 speak 新消息时应停止旧播放', async () => {
    mockSynthesize.mockResolvedValue({
      ok: true,
      filePath: 'C:\\tmp\\tts-new.mp3',
      format: 'mp3',
    } as TtsSynthesizeResponse)

    await useTtsStore.getState().speak('msg-old', '旧消息')
    await useTtsStore.getState().speak('msg-new', '新消息')

    expect(useTtsStore.getState().playingMessageId).toBe('msg-new')
  })

  it('空文本不应调用 synthesize', async () => {
    await useTtsStore.getState().speak('msg-4', '')
    expect(mockSynthesize).not.toHaveBeenCalled()
  })
})
