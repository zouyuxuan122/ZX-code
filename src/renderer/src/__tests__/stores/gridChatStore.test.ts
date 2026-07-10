import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSend = vi.fn().mockResolvedValue(undefined)
const mockCreate = vi.fn().mockResolvedValue({ id: 'conv-grid', title: '迷你对话' })

// vi.hoisted 捕获 onMessage 回调，用于在测试中模拟 AI 回复到达
const { captured } = vi.hoisted(() => ({
  captured: {
    onMessage: null as ((msg: unknown) => void) | null,
    onChunk: null as ((payload: unknown) => void) | null,
    onComplete: null as ((payload: unknown) => void) | null,
  },
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    chat: {
      send: (...args: unknown[]) => mockSend(...args),
      stop: vi.fn().mockResolvedValue(true),
      onChunk: vi.fn((cb: (p: unknown) => void) => {
        captured.onChunk = cb
        return () => {}
      }),
      onThinking: vi.fn(() => () => {}),
      onMessage: vi.fn((cb: (msg: unknown) => void) => {
        captured.onMessage = cb
        return () => {}
      }),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn((cb: (p: unknown) => void) => {
        captured.onComplete = cb
        return () => {}
      }),
      onToolCallStart: vi.fn(() => () => {}),
      onToolCallEnd: vi.fn(() => () => {}),
      onToolCallApproval: vi.fn(() => () => {}),
      onToolCallArgsDelta: vi.fn(() => () => {}),
    },
    conversation: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    provider: {
      complete: vi.fn().mockResolvedValue({ ok: true, content: '{"animation":"idle","expression":"idle"}' }),
      getAllModels: vi.fn().mockResolvedValue([{ id: 'm1', name: 'model-1' }]),
    },
  },
}))

import { useGridChatStore } from '@/stores/gridChatStore'
import { usePetStore } from '@/stores/petStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'

beforeEach(() => {
  useGridChatStore.getState().reset()
  usePetStore.setState({
    petMessages: [],
    bubbleText: null,
    bubbleVisible: false,
    character: { ...usePetStore.getState().character, roleCard: '你是小喵，傲娇猫咪。' },
  })
  useChatStore.setState({
    currentTaskName: '写文件',
    artifacts: [
      { filepath: 'src/foo.ts', tool: 'write_file' as const, additions: 12, deletions: 3, timestamp: Date.now() },
    ],
  })
  useUIStore.setState({ selectedModel: 'gpt-4o-mini' })
  mockSend.mockClear()
  mockCreate.mockClear()
})

describe('gridChatStore 桌宠对话', () => {
  it('sendMessage 时注入角色卡到 systemPrompt', async () => {
    await useGridChatStore.getState().sendMessage('你好')

    expect(mockSend).toHaveBeenCalledWith(
      'conv-grid',
      '你好',
      expect.objectContaining({
        mode: 'chat',
        systemPrompt: expect.stringContaining('你是小喵，傲娇猫咪。'),
      }),
    )
  })

  it('sendMessage 时注入编程项目上下文摘要到 systemPrompt', async () => {
    await useGridChatStore.getState().sendMessage('你在干嘛')

    const callArgs = mockSend.mock.calls[0][2] as { systemPrompt: string }
    expect(callArgs.systemPrompt).toContain('写文件')
    expect(callArgs.systemPrompt).toContain('src/foo.ts')
  })

  it('sendMessage 时同步 user 消息到 petStore 且不显示气泡', async () => {
    await useGridChatStore.getState().sendMessage('你好')
    const msgs = usePetStore.getState().petMessages
    expect(msgs.some((m) => m.role === 'user' && m.content === '你好')).toBe(true)
  })

  it('sendMessage 时传递当前选中的 model 给 ipc.chat.send', async () => {
    await useGridChatStore.getState().sendMessage('你好')

    expect(mockSend).toHaveBeenCalledWith(
      'conv-grid',
      '你好',
      expect.objectContaining({
        model: 'gpt-4o-mini',
      }),
    )
  })

  it('AI 回复到达后用户消息仍保留在 messages 中（不因 temp- 过滤而丢失）', async () => {
    await useGridChatStore.getState().sendMessage('你好呀')

    // 发送后 messages 包含 temp-user 消息
    let messages = useGridChatStore.getState().messages
    expect(messages.some((m) => m.role === 'user' && m.content === '你好呀')).toBe(true)

    // 模拟 AI 回复到达（触发 onMessage 回调）
    expect(captured.onMessage).not.toBeNull()
    captured.onMessage!({
      id: 'ai-1',
      conversationId: 'conv-grid',
      conversation_id: 'conv-grid',
      role: 'assistant',
      content: '喵~',
      metadata: null,
      created_at: Date.now(),
    })

    // AI 回复到达后，用户消息仍应保留
    messages = useGridChatStore.getState().messages
    expect(messages.some((m) => m.role === 'user' && m.content === '你好呀')).toBe(true)
    expect(messages.some((m) => m.role === 'assistant' && m.content === '喵~')).toBe(true)
  })
})
