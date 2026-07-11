import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Message } from '@shared/types/conversation'

// Mock ttsStore
const mockSpeak = vi.fn()
const mockStop = vi.fn()
vi.mock('@/stores/ttsStore', () => ({
  useTtsStore: {
    getState: () => ({
      speak: mockSpeak,
      stop: mockStop,
      isPlaying: false,
      playingMessageId: null,
    }),
  },
}))

import { useTtsAutoPlay } from '../../hooks/useTtsAutoPlay'

function makeMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    conversation_id: 'conv-1',
    role,
    content,
    metadata: null,
    created_at: Date.now(),
  }
}

describe('useTtsAutoPlay hook', () => {
  beforeEach(() => {
    mockSpeak.mockReset()
    mockStop.mockReset()
  })

  it('流式结束后，tts.enabled 且 mode=auto 时自动朗读最后一条 AI 消息', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'user', '你好'),
      makeMessage('msg-2', 'assistant', '你好，我是 AI'),
    ]
    const { rerender } = renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: true,
          msgs: messages,
          enabled: true,
          mode: 'auto' as const,
        },
      },
    )

    // 流式结束 → 触发自动朗读
    rerender({
      isStreaming: false,
      msgs: messages,
      enabled: true,
      mode: 'auto' as const,
    })

    expect(mockSpeak).toHaveBeenCalledWith('msg-2', '你好，我是 AI')
  })

  it('tts.enabled=false 时不自动朗读', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'user', '你好'),
      makeMessage('msg-2', 'assistant', '你好'),
    ]
    const { rerender } = renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: true,
          msgs: messages,
          enabled: false,
          mode: 'auto' as const,
        },
      },
    )

    rerender({
      isStreaming: false,
      msgs: messages,
      enabled: false,
      mode: 'auto' as const,
    })

    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('mode=manual 时不自动朗读', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'assistant', '你好'),
    ]
    const { rerender } = renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: true,
          msgs: messages,
          enabled: true,
          mode: 'manual' as const,
        },
      },
    )

    rerender({
      isStreaming: false,
      msgs: messages,
      enabled: true,
      mode: 'manual' as const,
    })

    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('流式进行中不触发朗读', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'assistant', '你好'),
    ]
    renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: true,
          msgs: messages,
          enabled: true,
          mode: 'auto' as const,
        },
      },
    )

    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('初始非流式状态不触发朗读（只在 true→false 转换时触发）', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'assistant', '你好'),
    ]
    renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: false,
          msgs: messages,
          enabled: true,
          mode: 'auto' as const,
        },
      },
    )

    expect(mockSpeak).not.toHaveBeenCalled()
  })

  it('没有 AI 消息时不触发朗读', () => {
    const messages: Message[] = [
      makeMessage('msg-1', 'user', '你好'),
    ]
    const { rerender } = renderHook(
      ({ isStreaming, msgs, enabled, mode }) =>
        useTtsAutoPlay({ isStreaming, messages: msgs, ttsEnabled: enabled, ttsMode: mode }),
      {
        initialProps: {
          isStreaming: true,
          msgs: messages,
          enabled: true,
          mode: 'auto' as const,
        },
      },
    )

    rerender({
      isStreaming: false,
      msgs: messages,
      enabled: true,
      mode: 'auto' as const,
    })

    expect(mockSpeak).not.toHaveBeenCalled()
  })
})
