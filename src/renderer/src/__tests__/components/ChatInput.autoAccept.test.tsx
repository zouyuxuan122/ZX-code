import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// 可动态修改的 mock 状态
const { mockChatStoreState, mockSettingsStoreState, mockUiStoreState } = vi.hoisted(() => ({
  mockChatStoreState: {
    isStreaming: false,
    stopStreaming: vi.fn(),
    sendMessage: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    loadConversations: vi.fn(),
    compressConversation: vi.fn(),
    currentConversationId: 'conv-1',
    messages: [],
    error: null,
    clearError: vi.fn(),
    pendingQuestion: null,
    replyQuestion: vi.fn(),
    cancelQuestion: vi.fn(),
    todos: [],
  },
  mockSettingsStoreState: {
    getSetting: vi.fn(<T,>(_key: string, def: T) => def),
    updateSetting: vi.fn(async () => {}),
  },
  mockUiStoreState: {
    selectedModel: 'deepseek-v4-flash',
    setSelectedModel: vi.fn(),
    thinkingLevel: 0,
    agentMode: 'chat',
    setAgentMode: vi.fn(),
    quotedText: '',
    setQuotedText: vi.fn(),
    pendingInput: '',
    setPendingInput: vi.fn(),
  },
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => selector(mockChatStoreState)),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: unknown) => unknown) => selector(mockSettingsStoreState)),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => selector(mockUiStoreState)),
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({ currentProject: { id: 'proj-1', workspace_path: '/test' } }),
  ),
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    upload: { attachment: vi.fn() },
    file: { readContent: vi.fn() },
    conversation: { deleteMessages: vi.fn() },
  },
}))

vi.mock('@/components/chat/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
  parseModelName: (s: string) => s,
}))

vi.mock('@/components/chat/ThinkingLevelSelector', () => ({
  ThinkingLevelSelector: () => <div data-testid="thinking-selector" />,
}))

vi.mock('@/components/chat/QuestionCard', () => ({
  QuestionCard: () => null,
}))

vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ChatInput } from '@/components/chat/ChatInput'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mockChatStoreState.isStreaming = false
  mockChatStoreState.currentConversationId = 'conv-1'
  // 默认返回 def 值
  mockSettingsStoreState.getSetting.mockImplementation(<T,>(_key: string, def: T) => def)
})

afterEach(() => {
  cleanup()
})

/**
 * Bug 描述：用户开启"自动接受工具调用"后，工具调用仍然弹出审批对话框。
 *
 * 根因分析：
 * 1. Toggle 组件的 layout + style.transform 冲突导致白点视觉不更新（已修复）
 * 2. 用户以为开关已开但实际状态为关，导致 autoAccept=false 被传递给引擎
 *
 * 本测试验证数据流：ChatInput 必须正确读取 permission.autoAccept 设置
 * 并将其传递给 sendMessage，确保引擎能收到正确的 autoAccept 值。
 */
describe('ChatInput — autoAccept 设置传递', () => {
  it('permission.autoAccept=true 时 sendMessage 收到 autoAccept=true', async () => {
    // 模拟设置存储中 autoAccept = true
    mockSettingsStoreState.getSetting.mockImplementation(<T,>(key: string, def: T): T => {
      if (key === 'permission.autoAccept') return true as T
      return def
    })

    render(<ChatInput />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '测试消息' } })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockChatStoreState.sendMessage).toHaveBeenCalledTimes(1)
    const callArgs = mockChatStoreState.sendMessage.mock.calls[0]
    const options = callArgs[1] as { autoAccept?: boolean }
    expect(options.autoAccept).toBe(true)
  })

  it('permission.autoAccept=false 时 sendMessage 收到 autoAccept=false', async () => {
    mockSettingsStoreState.getSetting.mockImplementation(<T,>(key: string, def: T): T => {
      if (key === 'permission.autoAccept') return false as T
      return def
    })

    render(<ChatInput />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '测试消息' } })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockChatStoreState.sendMessage).toHaveBeenCalledTimes(1)
    const callArgs = mockChatStoreState.sendMessage.mock.calls[0]
    const options = callArgs[1] as { autoAccept?: boolean }
    expect(options.autoAccept).toBe(false)
  })

  it('permission.autoAccept 未设置时使用默认值 true（UI 默认）', async () => {
    // getSetting 返回 def 值
    mockSettingsStoreState.getSetting.mockImplementation(<T,>(_key: string, def: T) => def)

    render(<ChatInput />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '测试消息' } })

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockChatStoreState.sendMessage).toHaveBeenCalledTimes(1)
    const callArgs = mockChatStoreState.sendMessage.mock.calls[0]
    const options = callArgs[1] as { autoAccept?: boolean }
    // 默认值应为 true（与 ChatInput.tsx 中 getSetting 的 def 一致）
    expect(options.autoAccept).toBe(true)
  })
})
