import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useChatEvents } from '@/hooks/useChatEvents'
import { useChatStore } from '@/stores/chatStore'

// 捕获事件回调
const mockCallbacks: Record<string, Function> = {}

vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      onChunk: vi.fn((cb) => { mockCallbacks.chunk = cb; return () => {} }),
      onThinking: vi.fn((cb) => { mockCallbacks.thinking = cb; return () => {} }),
      onToolCallStart: vi.fn((cb) => { mockCallbacks.toolCallStart = cb; return () => {} }),
      onToolCallEnd: vi.fn((cb) => { mockCallbacks.toolCallEnd = cb; return () => {} }),
      onToolCallApproval: vi.fn((cb) => { mockCallbacks.toolCallApproval = cb; return () => {} }),
      onToolCallArgsDelta: vi.fn((cb) => { mockCallbacks.toolCallArgsDelta = cb; return () => {} }),
      onError: vi.fn((cb) => { mockCallbacks.error = cb; return () => {} }),
      onComplete: vi.fn((cb) => { mockCallbacks.complete = cb; return () => {} }),
      onMessage: vi.fn((cb) => { mockCallbacks.message = cb; return () => {} }),
    },
    question: {
      onAsk: vi.fn((cb) => { mockCallbacks.ask = cb; return () => {} }),
    },
  },
}))

describe('useChatEvents 并行事件路由', () => {
  beforeEach(() => {
    useChatStore.getState().resetParallelState()
    useChatStore.setState({
      currentConversationId: 'conv-current',
      isStreaming: false,
      streamingContent: '',
      toolCalls: {},
    })
    // 清空回调
    for (const k of Object.keys(mockCallbacks)) delete mockCallbacks[k]
  })

  it('onChunk 事件更新对应对话的并行状态，不检查是否当前对话', () => {
    renderHook(() => useChatEvents())

    // 对话 A 正在流式中
    useChatStore.getState().setParallelStreaming('conv-a', true)
    // 当前对话是 B（不是 A）
    useChatStore.getState().setCurrentConversationId('conv-b')
    mockCallbacks.chunk({ conversationId: 'conv-a', content: 'hello' })

    // 对话 A 的并行状态应被更新
    expect(useChatStore.getState().getStreamingState('conv-a').streamingContent).toBe('hello')
  })

  it('onChunk 在对话已停止流式后丢弃迟到的 chunk（竞态2修复）', () => {
    renderHook(() => useChatEvents())

    // 对话 A 已完成流式（isStreaming=false），有已有内容
    useChatStore.getState().setParallelStreaming('conv-a', false)
    useChatStore.getState().setParallelContent('conv-a', '已完成的回复')

    // 模拟迟到的 chunk（旧请求的残留）
    mockCallbacks.chunk({ conversationId: 'conv-a', content: '迟到的内容' })

    // 迟到的 chunk 不应被追加
    expect(useChatStore.getState().getStreamingState('conv-a').streamingContent).toBe('已完成的回复')
  })

  it('onThinking 在对话已停止流式后丢弃迟到的 thinking（竞态2修复）', () => {
    renderHook(() => useChatEvents())

    // 对话 A 已完成流式
    useChatStore.getState().setParallelStreaming('conv-a', false)
    useChatStore.getState().setParallelThinking('conv-a', '已有的思考')

    // 模拟迟到的 thinking
    mockCallbacks.thinking({ conversationId: 'conv-a', content: '迟到的思考' })

    // 迟到的 thinking 不应被追加
    expect(useChatStore.getState().getStreamingState('conv-a').streamingThinking).toBe('已有的思考')
  })

  it('onComplete 事件只重置对应对话的流式状态，不影响其他对话', () => {
    useChatStore.getState().setParallelStreaming('conv-a', true)
    useChatStore.getState().setParallelStreaming('conv-b', true)
    renderHook(() => useChatEvents())

    useChatStore.getState().setCurrentConversationId('conv-a')
    mockCallbacks.complete({ conversationId: 'conv-b' })

    // 对话 B 流式结束
    expect(useChatStore.getState().getStreamingState('conv-b').isStreaming).toBe(false)
    // 对话 A 不受影响
    expect(useChatStore.getState().getStreamingState('conv-a').isStreaming).toBe(true)
  })

  it('onError 事件只重置出错对话的流式状态，不影响其他对话', () => {
    useChatStore.getState().setParallelStreaming('conv-a', true)
    useChatStore.getState().setParallelStreaming('conv-b', true)
    renderHook(() => useChatEvents())

    useChatStore.getState().setCurrentConversationId('conv-a')
    mockCallbacks.error({ conversationId: 'conv-b', message: '出错了' })

    // 对话 B 流式结束
    expect(useChatStore.getState().getStreamingState('conv-b').isStreaming).toBe(false)
    expect(useChatStore.getState().getStreamingState('conv-b').error).toBe('出错了')
    // 对话 A 不受影响
    expect(useChatStore.getState().getStreamingState('conv-a').isStreaming).toBe(true)
  })
})
