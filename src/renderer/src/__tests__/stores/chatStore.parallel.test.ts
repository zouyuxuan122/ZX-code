import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore } from '@/stores/chatStore'
import { ipc } from '@/services/ipc'

// Mock IPC
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

describe('ChatStore 并行对话状态隔离', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
    useChatStore.setState({
      currentConversationId: null,
      currentConversation: null,
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
      error: null,
    })
  })

  it('切换对话不应重置原对话的 isStreaming 状态', () => {
    const store = useChatStore.getState()
    // 对话 A 开始流式
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '正在生成...')
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('正在生成...')

    // 切换到对话 B
    store.setCurrentConversationId('conv-b')
    // 对话 A 的状态应保持
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('正在生成...')
    // 对话 B 状态应为空（非流式）
    expect(store.getStreamingState('conv-b').isStreaming).toBe(false)
  })

  it('getStreamingState 对未知对话返回空状态', () => {
    const store = useChatStore.getState()
    const state = store.getStreamingState('unknown')
    expect(state.isStreaming).toBe(false)
    expect(state.streamingContent).toBe('')
    expect(state.toolCalls).toEqual({})
  })

  it('isCurrentStreaming 反映当前对话的流式状态', () => {
    const store = useChatStore.getState()
    store.setCurrentConversationId('conv-a')
    store.setParallelStreaming('conv-a', true)
    expect(store.isCurrentStreaming()).toBe(true)
    store.setParallelStreaming('conv-a', false)
    expect(store.isCurrentStreaming()).toBe(false)
  })
})

describe('selectConversation 并行行为', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
    useChatStore.setState({
      currentConversationId: null,
      currentConversation: null,
      conversations: [],
      conversationsByWorkspace: {},
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
      error: null,
    })
    ;(ipc.chat.stop as ReturnType<typeof vi.fn>).mockClear()
  })

  it('切换对话不调用 ipc.chat.stop', async () => {
    const store = useChatStore.getState()

    // 模拟对话 A 正在流式
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-a')

    // 切换到对话 B
    await store.selectConversation('conv-b')

    // 不应调用 stop
    expect(ipc.chat.stop).not.toHaveBeenCalled()
  })

  it('切换对话保留原对话的流式状态', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '生成中...')
    store.setCurrentConversationId('conv-a')

    await store.selectConversation('conv-b')

    // 对话 A 状态保留
    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('生成中...')
  })

  it('切回原对话恢复流式状态', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setParallelContent('conv-a', '生成中...')

    await store.selectConversation('conv-b')
    await store.selectConversation('conv-a')

    expect(store.getStreamingState('conv-a').isStreaming).toBe(true)
    expect(store.getStreamingState('conv-a').streamingContent).toBe('生成中...')
    expect(store.isCurrentStreaming()).toBe(true)
  })
})

describe('sendMessage 并行检查', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
    useChatStore.setState({
      currentConversationId: null,
      currentConversation: null,
      conversations: [],
      conversationsByWorkspace: {},
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
      error: null,
      messages: [],
    })
    ;(ipc.chat.send as ReturnType<typeof vi.fn>).mockClear()
    ;(ipc.chat.send as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  it('当前对话非流式时允许发送，即使其他对话在流式', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-b')
    // 对话 B 非流式，应允许发送
    store.setParallelStreaming('conv-b', false)

    await store.sendMessage('test')
    // 不应有错误，且应调用 send
    expect(useChatStore.getState().error).toBeNull()
    expect(ipc.chat.send).toHaveBeenCalled()
  })

  it('当前对话流式时阻止发送', async () => {
    const store = useChatStore.getState()
    store.setParallelStreaming('conv-a', true)
    store.setCurrentConversationId('conv-a')

    await store.sendMessage('test')
    expect(useChatStore.getState().error).toContain('进行中')
    expect(ipc.chat.send).not.toHaveBeenCalled()
  })
})
