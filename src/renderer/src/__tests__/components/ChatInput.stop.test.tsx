import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// 使用 hoisted mock 以便在测试用例中动态切换状态
const { mockChatStoreState, mockSettingsStoreState, mockUiStoreState } = vi.hoisted(() => ({
  mockChatStoreState: {
    isStreaming: false,
    stopStreaming: vi.fn(),
    sendMessage: vi.fn(),
    createConversation: vi.fn(),
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
})

describe('ChatInput 停止生成按钮', () => {
  it('未在生成时不显示停止按钮', () => {
    mockChatStoreState.isStreaming = false
    render(<ChatInput />)
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  })

  it('生成中显示停止按钮', () => {
    mockChatStoreState.isStreaming = true
    render(<ChatInput />)
    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument()
  })

  it('点击停止按钮调用 stopStreaming', () => {
    mockChatStoreState.isStreaming = true
    render(<ChatInput />)
    const stopBtn = screen.getByRole('button', { name: '停止生成' })
    fireEvent.click(stopBtn)
    expect(mockChatStoreState.stopStreaming).toHaveBeenCalledTimes(1)
  })
})
