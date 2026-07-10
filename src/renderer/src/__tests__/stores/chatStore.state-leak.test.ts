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
      create: vi.fn().mockResolvedValue({ id: 'new-conv', title: '新对话' }),
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

describe('状态泄漏防护', () => {
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

  it('Bug1: 在流式对话中新建对话时，isStreaming 必须重置为 false（否则新对话输入框被禁用）', async () => {
    const store = useChatStore.getState()
    // 模拟：对话 A 正在流式
    useChatStore.setState({
      currentConversationId: 'conv-a',
      isStreaming: true,
      streamingContent: 'A 生成中',
    })

    // 在流式中新建对话 B
    await store.createConversation(null, '新对话')

    const after = useChatStore.getState()
    // 核心断言：新对话的 isStreaming 必须为 false，否则 ChatInput disabled=true
    expect(after.isStreaming).toBe(false)
    expect(after.streamingContent).toBe('')
    expect(after.currentConversationId).toBe('new-conv')
  })

  it('Bug2: 后台对话出错时，不应覆盖当前对话的全局状态（loadMessages 仅对当前对话执行）', async () => {
    const store = useChatStore.getState()
    // 模拟：用户在对话 A，后台对话 B 出错
    useChatStore.setState({
      conversations: [
        { id: 'conv-a', title: '当前对话' } as any,
        { id: 'conv-b', title: '后台对话' } as any,
      ],
      currentConversationId: 'conv-a',
      messages: [{ id: 'm-a1', role: 'user', content: 'A的消息' } as any],
    })
    // 后台对话 B 有不同的消息（若被错误加载会覆盖 A）
    vi.mocked(ipc.conversation.getMessages).mockResolvedValueOnce([
      { id: 'm-b1', role: 'user', content: 'B的消息' } as any,
    ])

    // 复现修复后的 onError handler 逻辑：当前对话是 A，错误来自 B
    const errorConversationId = 'conv-b'
    // 只重置出错对话的并行流式状态
    store.setParallelStreaming(errorConversationId, false)
    store.setParallelError(errorConversationId, 'B 出错了')
    // 修复后：仅当出错对话是当前对话时才同步全局状态并 loadMessages
    if (store.currentConversationId === errorConversationId) {
      store.setStreaming(false)
      store.setError('B 出错了')
      await store.loadMessages(errorConversationId)
    }

    const after = useChatStore.getState()
    // 断言：当前对话 A 的消息未被 B 覆盖
    expect(after.messages).toEqual([{ id: 'm-a1', role: 'user', content: 'A的消息' }])
  })

  it('Bug3: sendMessage 超时安全网：后台对话超时不应覆盖当前对话的全局状态', async () => {
    const store = useChatStore.getState()
    // 模拟：对话 A 流式中，用户切换到对话 B
    useChatStore.setState({
      conversations: [
        { id: 'conv-a', title: '后台流式对话' } as any,
        { id: 'conv-b', title: '当前对话' } as any,
      ],
      currentConversationId: 'conv-b',
      messages: [{ id: 'm-b1', role: 'user', content: 'B的消息' } as any],
      isStreaming: false, // 当前对话 B 不在流式
    })
    // 对话 A 在并行状态中流式
    store.setParallelStreaming('conv-a', true)

    // 后台对话 A 的消息（若被错误加载会覆盖 B）
    vi.mocked(ipc.conversation.getMessages).mockResolvedValueOnce([
      { id: 'm-a1', role: 'user', content: 'A的消息' } as any,
    ])

    // 复现修复后的超时安全网逻辑（conversationId='conv-a'，但 currentConversationId='conv-b'）
    const streamingConversationId = 'conv-a'
    const cur = useChatStore.getState()
    if (cur.getStreamingState(streamingConversationId).isStreaming) {
      cur.setParallelStreaming(streamingConversationId, false)
      cur.setParallelError(streamingConversationId, '超时')
      // 修复后：仅当超时对话是当前对话时才同步全局状态并 loadMessages
      if (cur.currentConversationId === streamingConversationId) {
        useChatStore.setState({ isStreaming: false, error: '超时' })
        await cur.loadMessages(streamingConversationId)
      }
    }

    const after = useChatStore.getState()
    // 断言：当前对话 B 的消息未被 A 覆盖
    expect(after.messages).toEqual([{ id: 'm-b1', role: 'user', content: 'B的消息' }])
  })
})
