import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useChatStore } from '@/stores/chatStore'
import { usePetStore } from '@/stores/petStore'

// Mock IPC to avoid electron dependencies
vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      send: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      forceReset: vi.fn().mockResolvedValue(true),
      compress: vi.fn().mockResolvedValue(undefined),
      approveToolCall: vi.fn().mockResolvedValue(undefined),
      onChunk: vi.fn(() => () => {}),
      onThinking: vi.fn(() => () => {}),
      onToolCallStart: vi.fn(() => () => {}),
      onToolCallEnd: vi.fn(() => () => {}),
      onToolCallApproval: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
      onMessage: vi.fn(() => () => {}),
    },
    conversation: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'conv-1', title: '新对话' }),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      getMessages: vi.fn().mockResolvedValue([]),
      rollbackToMessage: vi.fn().mockResolvedValue({ deleted: 1, ok: true }),
    },
    provider: {
      getAllModels: vi.fn().mockResolvedValue([]),
      onModelsChanged: vi.fn(() => () => {}),
    },
    question: {
      onAsk: vi.fn(() => () => {}),
      reply: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    },
    permission: {
      getRules: vi.fn().mockResolvedValue([]),
      setRules: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

// Avoid loading heavy 3D/Live2D dependencies in unit tests
vi.mock('@/components/grid/panels/pet/ModelRenderer', () => ({
  ModelRenderer: () => <div data-testid="model-renderer">Model</div>,
}))

import { PetPanel } from '@/components/grid/panels/PetPanel'

function resetStores() {
  useChatStore.setState({
    currentConversationId: 'conv-1',
    currentConversation: { id: 'conv-1', title: 'Test' } as any,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
    toolCalls: {},
    pendingApprovals: [],
    pendingQuestion: null,
    pendingQuote: '',
    error: null,
  })
  usePetStore.setState(usePetStore.getInitialState())
}

describe('PetPanel 任务感知与情绪同步', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('任务开始时将 currentTaskName 同步到 petStore 并切换为 working 情绪', () => {
    render(<PetPanel />)

    act(() => {
      useChatStore.getState().setStreaming(true)
    })

    expect(usePetStore.getState().currentTaskName).toBe('对话')
    expect(usePetStore.getState().mood).toBe('working')
  })

  it('工具执行时同步具体任务名并保持 working 情绪', () => {
    render(<PetPanel />)

    act(() => {
      const chat = useChatStore.getState()
      chat.setStreaming(true)
      chat.setToolCallStart('tc-1', 'write_file', '{"path":"a.ts"}')
    })

    expect(usePetStore.getState().currentTaskName).toBe('写文件')
    expect(usePetStore.getState().mood).toBe('working')
  })

  it('任务结束后清空 currentTaskName 并短暂 happy 后回到 idle', () => {
    render(<PetPanel />)

    act(() => {
      const chat = useChatStore.getState()
      chat.setStreaming(true)
      chat.setToolCallStart('tc-1', 'write_file', '{"path":"a.ts"}')
    })

    expect(usePetStore.getState().mood).toBe('working')

    act(() => {
      const chat = useChatStore.getState()
      chat.setToolCallEnd('tc-1', { content: 'done', is_error: false, metadata: {} })
      chat.setStreaming(false)
    })

    expect(usePetStore.getState().currentTaskName).toBeNull()
    expect(usePetStore.getState().mood).toBe('happy')

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(usePetStore.getState().mood).toBe('idle')
  })
})
