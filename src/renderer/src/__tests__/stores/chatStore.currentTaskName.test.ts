import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore, type ToolCallState } from '@/stores/chatStore'

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

function baseState() {
  return {
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
  }
}

describe('chatStore currentTaskName 派生状态', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useChatStore.setState(baseState())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('无流式且无运行中工具时返回 null', () => {
    expect(useChatStore.getState().currentTaskName).toBeNull()
  })

  it('流式中无工具时返回「对话」', () => {
    useChatStore.getState().setStreaming(true)
    expect(useChatStore.getState().currentTaskName).toBe('对话')
  })

  it('存在 running 工具时返回最后一个工具的中文映射', () => {
    const store = useChatStore.getState()
    store.setStreaming(true)
    store.setToolCallStart('tc-1', 'write_file', '{"path":"a.ts"}')
    vi.advanceTimersByTime(100)
    store.setToolCallStart('tc-2', 'run_command', '{"command":"npm test"}')
    expect(useChatStore.getState().currentTaskName).toBe('运行命令')
  })

  it('存在 pending_approval 工具时也算作运行中任务', () => {
    const store = useChatStore.getState()
    store.addPendingApproval({
      conversationId: 'conv-1',
      toolCallId: 'tc-approve',
      name: 'edit',
      args: '{"path":"b.ts"}',
    })
    expect(useChatStore.getState().currentTaskName).toBe('编辑文件')
  })

  it('running 与 pending_approval 共存时取时间戳最新的任务', () => {
    const store = useChatStore.getState()
    store.setToolCallStart('tc-1', 'webfetch', '{"url":"x"}')
    vi.advanceTimersByTime(100)
    store.addPendingApproval({
      conversationId: 'conv-1',
      toolCallId: 'tc-2',
      name: 'task',
      args: '{"description":"sub"}',
    })
    expect(useChatStore.getState().currentTaskName).toBe('执行子任务')
  })

  it('工具结束后 currentTaskName 清空', () => {
    const store = useChatStore.getState()
    store.setStreaming(true)
    store.setToolCallStart('tc-1', 'write_file', '{"path":"a.ts"}')
    expect(useChatStore.getState().currentTaskName).toBe('写文件')

    store.setToolCallEnd('tc-1', {
      content: 'done',
      is_error: false,
      metadata: {},
    })
    expect(useChatStore.getState().currentTaskName).toBe('对话')

    store.setStreaming(false)
    expect(useChatStore.getState().currentTaskName).toBeNull()
  })
})
