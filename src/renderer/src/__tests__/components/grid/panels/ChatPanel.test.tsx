import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'

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
      onToolCallArgsDelta: vi.fn(() => () => {}),
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
      rollbackToMessage: vi.fn().mockResolvedValue({ deleted: 2, ok: true }),
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

import { ChatPanel } from '@/components/grid/panels/ChatPanel'
import { useGridChatStore } from '@/stores/gridChatStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { ipc } from '@/services/ipc'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useGridChatStore.getState().reset()
  useChatStore.setState({
    availableModels: [],
    loadAvailableModels: vi.fn().mockResolvedValue(undefined),
  })
  useUIStore.setState({ selectedModel: 'gpt-4' })
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('ChatPanel (迷你独立对话)', () => {
  it('渲染空状态占位符与输入框', () => {
    render(<ChatPanel />)
    expect(screen.getByText('独立对话 · 不影响编程项目')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('渲染模型选择器，显示当前选中的模型名', () => {
    useChatStore.setState({
      loadAvailableModels: vi.fn().mockResolvedValue(undefined),
      availableModels: [
        { id: 'm1', name: 'deepseek-chat', provider: 'deepseek', type: 'openai' as never },
      ],
    })
    useUIStore.setState({ selectedModel: 'deepseek:deepseek-chat' })
    render(<ChatPanel />)
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument()
  })

  it('点击模型选择器按钮后展开下拉列表', async () => {
    useChatStore.setState({
      loadAvailableModels: vi.fn().mockResolvedValue(undefined),
      availableModels: [
        { id: 'm1', name: 'deepseek-chat', provider: 'deepseek', type: 'openai' as never },
        { id: 'm2', name: 'gpt-4o', provider: 'openai', type: 'openai' as never },
      ],
    })
    useUIStore.setState({ selectedModel: 'deepseek:deepseek-chat' })
    render(<ChatPanel />)
    // 初始状态下拉未展开，gpt-4o 不可见
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument()
    // 点击模型选择器按钮
    await act(async () => {
      fireEvent.click(screen.getByText('deepseek-chat'))
    })
    // 下拉展开后 gpt-4o 可见
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
  })

  it('发送消息时自动创建独立对话并调用 chat.send（Chat 模式 + 角色卡 systemPrompt）', async () => {
    render(<ChatPanel />)
    const input = screen.getByPlaceholderText('输入消息...') as HTMLInputElement
    fireEvent.change(input, { target: { value: '你好' } })
    await act(async () => {
      fireEvent.click(screen.getByTitle('发送'))
    })

    await waitFor(() => {
      expect(ipc.conversation.create).toHaveBeenCalledWith({ project_id: undefined, title: '你好' })
    })
    expect(ipc.chat.send).toHaveBeenCalledWith(
      'new-conv',
      '你好',
      expect.objectContaining({ mode: 'chat', autoAccept: true, systemPrompt: expect.any(String) }),
    )
  })

  it('流式状态下显示停止按钮', async () => {
    useGridChatStore.setState({
      conversationId: 'conv-1',
      isStreaming: true,
      messages: [{ id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'hi', metadata: null, created_at: 1 } as never],
    })
    render(<ChatPanel />)
    expect(screen.getByTitle('停止')).toBeInTheDocument()
  })

  it('有消息时显示新建对话按钮，点击后清空消息并重置 conversationId', async () => {
    useGridChatStore.setState({
      conversationId: 'conv-1',
      messages: [
        { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'hi', metadata: null, created_at: 1 } as never,
        { id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'hello', metadata: null, created_at: 2 } as never,
      ],
    })
    render(<ChatPanel />)

    const newChatBtn = screen.getByTitle('新建对话')
    expect(newChatBtn).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(newChatBtn)
    })

    expect(useGridChatStore.getState().messages).toHaveLength(0)
    expect(useGridChatStore.getState().conversationId).toBeNull()
  })
})
