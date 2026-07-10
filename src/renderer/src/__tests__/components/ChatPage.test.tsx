import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/hooks/useChatEvents', () => ({
  useChatEvents: vi.fn(),
  useProviderModelsSync: vi.fn(),
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      currentConversationId: null,
      currentConversation: null,
      loadConversations: vi.fn(),
      loadAvailableModels: vi.fn(),
      conversations: [],
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      currentProject: {
        id: 'proj-1',
        name: 'TestProject',
        ai_avatar: '',
        user_avatar: '',
        workspace_path: '/test',
        background_type: 'none',
        background: null,
      },
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/terminalStore', () => ({
  useTerminalStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { isOpen: false }
    return selector(state)
  }),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { setPendingInput: vi.fn() }
    return selector(state)
  }),
}))

vi.mock('@/components/chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}))

vi.mock('@/components/chat/MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}))

vi.mock('@/components/chat/ModeSwitcher', () => ({
  ModeSwitcher: () => <div data-testid="mode-switcher" />,
}))

vi.mock('@/components/chat/ActivityBar', () => ({
  ActivityBar: () => <div data-testid="activity-bar" />,
}))

vi.mock('@/components/chat/TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar" />,
}))

vi.mock('@/components/chat/SelectionToolbar', () => ({
  SelectionToolbar: () => null,
}))

vi.mock('@/components/chat/ChatContextMenu', () => ({
  ChatContextMenu: () => null,
}))

import ChatPage from '@/pages/ChatPage'

beforeEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('ChatPage', () => {
  it('renders welcome screen when no conversation', () => {
    render(<ChatPage />)
    expect(screen.getByText('开始新对话')).toBeInTheDocument()
  })

  it('shows example prompt buttons', () => {
    render(<ChatPage />)
    expect(screen.getByText('帮我写一段 Python 代码')).toBeInTheDocument()
    expect(screen.getByText('优化这个项目的性能')).toBeInTheDocument()
    expect(screen.getByText('帮我重构这个文件')).toBeInTheDocument()
    expect(screen.getByText('写一个单元测试')).toBeInTheDocument()
  })

  it('shows project name in title bar', () => {
    render(<ChatPage />)
    expect(screen.getByText('TestProject')).toBeInTheDocument()
  })

  it('renders chat input component', () => {
    render(<ChatPage />)
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })
})
