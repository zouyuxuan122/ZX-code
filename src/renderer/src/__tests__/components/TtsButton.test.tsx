import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ttsStore — 支持 selector 模式
const mockSpeak = vi.fn()
const mockStop = vi.fn()
const ttsState = {
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => mockStop(...args),
  playingMessageId: null as string | null,
  isPlaying: false,
  loadingMessageId: null as string | null,
  error: null,
  audioElement: null,
  reset: vi.fn(),
}
vi.mock('@/stores/ttsStore', () => ({
  useTtsStore: (selector?: (s: typeof ttsState) => unknown) =>
    selector ? selector(ttsState) : ttsState,
}))

import { TtsButton } from '../../components/chat/TtsButton'

describe('TtsButton 组件', () => {
  beforeEach(() => {
    mockSpeak.mockReset()
    mockStop.mockReset()
    ttsState.playingMessageId = null
    ttsState.isPlaying = false
    ttsState.loadingMessageId = null
    ttsState.error = null
  })

  it('应渲染语音按钮', () => {
    render(<TtsButton messageId="msg-1" text="你好" />)
    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument()
  })

  it('点击应调用 speak', () => {
    render(<TtsButton messageId="msg-1" text="你好世界" />)
    fireEvent.click(screen.getByRole('button', { name: '朗读' }))
    expect(mockSpeak).toHaveBeenCalledWith('msg-1', '你好世界', undefined)
  })

  it('正在合成时显示加载状态', () => {
    ttsState.loadingMessageId = 'msg-1'
    render(<TtsButton messageId="msg-1" text="你好" />)
    expect(screen.getByRole('button', { name: '合成中' })).toBeInTheDocument()
  })

  it('正在播放时显示停止按钮，点击调用 stop', () => {
    ttsState.playingMessageId = 'msg-1'
    ttsState.isPlaying = true
    render(<TtsButton messageId="msg-1" text="你好" />)
    const stopBtn = screen.getByRole('button', { name: '停止朗读' })
    fireEvent.click(stopBtn)
    expect(mockStop).toHaveBeenCalled()
  })

  it('其他消息正在播放时不影响当前按钮状态', () => {
    ttsState.playingMessageId = 'msg-other'
    ttsState.isPlaying = true
    render(<TtsButton messageId="msg-1" text="你好" />)
    expect(screen.getByRole('button', { name: '朗读' })).toBeInTheDocument()
  })

  it('空文本时禁用按钮', () => {
    render(<TtsButton messageId="msg-1" text="" />)
    expect(screen.getByRole('button', { name: '朗读' })).toBeDisabled()
  })

  it('disabled prop 为 true 时禁用按钮', () => {
    render(<TtsButton messageId="msg-1" text="你好" disabled />)
    expect(screen.getByRole('button', { name: '朗读' })).toBeDisabled()
  })
})
