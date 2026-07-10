import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const mockConversations = [
  { id: 'conv-1', title: 'Chat One', updated_at: Date.now() - 30000 },
  { id: 'conv-2', title: 'Chat Two', updated_at: Date.now() - 7200000 },
]

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      conversations: mockConversations,
      currentConversationId: 'conv-1',
      selectConversation: vi.fn(),
      deleteConversation: vi.fn(),
      toolCalls: {},
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/searchStore', () => ({
  useSearchStore: {
    getState: vi.fn(() => ({
      open: vi.fn(),
    })),
  },
}))

import { TabBar } from '@/components/chat/TabBar'

beforeEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('TabBar', () => {
  it('renders conversation titles', () => {
    render(<TabBar />)
    expect(screen.getByText('Chat One')).toBeInTheDocument()
    expect(screen.getByText('Chat Two')).toBeInTheDocument()
  })

  it('shows relative time for conversations', () => {
    render(<TabBar />)
    expect(screen.getByText('刚刚')).toBeInTheDocument()
    expect(screen.getByText('2 小时前')).toBeInTheDocument()
  })

  it('has + button for opening search', () => {
    render(<TabBar />)
    const addButtons = screen.getAllByTitle('搜索文件')
    expect(addButtons.length).toBeGreaterThan(0)
  })

  it('shows status dot for active conversation', () => {
    const { container } = render(<TabBar />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots.length).toBeGreaterThan(0)
  })
})