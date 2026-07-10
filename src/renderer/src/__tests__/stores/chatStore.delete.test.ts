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

describe('deleteConversation 状态清理', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
    useChatStore.setState({
      conversations: [],
      conversationsByWorkspace: {},
      currentConversationId: null,
      currentConversation: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
      error: null,
      streamingByConversation: {},
    })
    vi.clearAllMocks()
  })

  it('删除当前正在流式的对话后，isStreaming 必须重置为 false（否则输入框永久 disabled）', async () => {
    const store = useChatStore.getState()
    // 模拟：当前对话 conv-stream 正在流式
    useChatStore.setState({
      conversations: [
        { id: 'conv-stream', title: '流式中对话' } as any,
        { id: 'conv-other', title: '其他对话' } as any,
      ],
      currentConversationId: 'conv-stream',
      currentConversation: { id: 'conv-stream', title: '流式中对话' } as any,
      messages: [{ id: 'm1', role: 'user', content: 'hi' } as any],
      isStreaming: true, // 正在流式
      streamingContent: '生成中...',
      streamingByConversation: {
        'conv-stream': { isStreaming: true, streamingContent: '生成中...' } as any,
      },
    })

    // 删除当前流式对话
    await store.deleteConversation('conv-stream')

    const after = useChatStore.getState()
    // 核心断言：isStreaming 必须为 false，否则 ChatInput 的 textarea disabled=true 永久无法输入
    expect(after.isStreaming).toBe(false)
    // 附加断言：残留流式状态也应清理
    expect(after.streamingContent).toBe('')
    expect(after.streamingByConversation['conv-stream']).toBeUndefined()
  })

  it('删除当前非流式对话后，状态应正确清理且不影响其他对话', async () => {
    const store = useChatStore.getState()
    useChatStore.setState({
      conversations: [
        { id: 'conv-current', title: '当前对话' } as any,
        { id: 'conv-other', title: '其他对话' } as any,
      ],
      currentConversationId: 'conv-current',
      currentConversation: { id: 'conv-current', title: '当前对话' } as any,
      messages: [{ id: 'm1', role: 'user', content: 'hi' } as any],
      isStreaming: false,
    })

    await store.deleteConversation('conv-current')

    const after = useChatStore.getState()
    expect(after.currentConversationId).toBeNull()
    expect(after.currentConversation).toBeNull()
    expect(after.messages).toEqual([])
    expect(after.isStreaming).toBe(false)
    expect(after.conversations).toHaveLength(1)
    expect(after.conversations[0].id).toBe('conv-other')
  })

  it('删除非当前对话时，不应影响当前对话状态', async () => {
    const store = useChatStore.getState()
    useChatStore.setState({
      conversations: [
        { id: 'conv-current', title: '当前对话' } as any,
        { id: 'conv-other', title: '其他对话' } as any,
      ],
      currentConversationId: 'conv-current',
      currentConversation: { id: 'conv-current', title: '当前对话' } as any,
      messages: [{ id: 'm1', role: 'user', content: 'hi' } as any],
      isStreaming: false,
    })

    await store.deleteConversation('conv-other')

    const after = useChatStore.getState()
    expect(after.currentConversationId).toBe('conv-current')
    expect(after.conversations).toHaveLength(1)
    expect(after.conversations[0].id).toBe('conv-current')
    expect(after.isStreaming).toBe(false)
  })
})
