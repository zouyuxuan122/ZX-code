import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { Message } from '@shared/types/conversation'

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
})

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { currentProject: null }
    return selector(state)
  }),
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { rollbackToMessage: vi.fn(), isStreaming: false }
    return selector(state)
  }),
}))

vi.mock('@/components/chat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

vi.mock('@/components/chat/ToolCallView', () => ({
  ToolCallView: () => <div data-testid="tool-call-view" />,
}))

import { MessageItem } from '@/components/chat/MessageItem'

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    role: 'assistant',
    content: 'Hello, this is a test response',
    metadata: null,
    created_at: Date.now(),
    ...overrides,
  }
}

describe('MessageItem', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders assistant message content', () => {
    const msg = makeMessage({ content: 'Test response' })
    render(<MessageItem message={msg} />)
    expect(screen.getByTestId('markdown')).toHaveTextContent('Test response')
  })

  it('renders user message content', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello AI' })
    render(<MessageItem message={msg} />)
    expect(screen.getByText('Hello AI')).toBeInTheDocument()
  })

  it('shows copy button on hover for assistant messages', async () => {
    const msg = makeMessage({ content: 'Copy me' })
    const { container } = render(<MessageItem message={msg} />)
    const assistantDiv = container.querySelector('[data-message-role="assistant"]')
    expect(assistantDiv).toBeTruthy()
    if (assistantDiv) {
      await act(async () => {
        fireEvent.mouseEnter(assistantDiv)
      })
    }
    const copyBtn = screen.queryByText('复制')
    expect(copyBtn).toBeInTheDocument()
  })

  it('copies content to clipboard when copy clicked', async () => {
    const msg = makeMessage({ content: 'Copy me' })
    const { container } = render(<MessageItem message={msg} />)
    const assistantDiv = container.querySelector('[data-message-role="assistant"]')
    if (assistantDiv) {
      await act(async () => {
        fireEvent.mouseEnter(assistantDiv)
      })
    }
    const copyBtn = screen.getByText('复制')
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me')
  })

  it('collapses long messages (>500 chars) when collapse button clicked', async () => {
    const longContent = 'A'.repeat(600)
    const msg = makeMessage({ content: longContent })
    render(<MessageItem message={msg} />)
    expect(screen.getByText('收起 ↑')).toBeInTheDocument()
    const collapseBtn = screen.getByText('收起 ↑')
    await act(async () => {
      fireEvent.click(collapseBtn)
    })
    expect(screen.getByText('展开全部 ↓')).toBeInTheDocument()
  })

  it('does not collapse messages during streaming', () => {
    const longContent = 'A'.repeat(600)
    const msg = makeMessage({ content: longContent })
    render(<MessageItem message={msg} isStreaming={true} streamingContent={longContent} />)
    expect(screen.queryByText('收起 ↑')).not.toBeInTheDocument()
    expect(screen.queryByText('展开全部 ↓')).not.toBeInTheDocument()
  })

  it('shows "收起 ↑" after clicking expand on collapsed message', async () => {
    const longContent = 'A'.repeat(600)
    const msg = makeMessage({ content: longContent })
    render(<MessageItem message={msg} />)
    const collapseBtn = screen.getByText('收起 ↑')
    await act(async () => {
      fireEvent.click(collapseBtn)
    })
    expect(screen.getByText('展开全部 ↓')).toBeInTheDocument()
    const expandBtn = screen.getByText('展开全部 ↓')
    await act(async () => {
      fireEvent.click(expandBtn)
    })
    expect(screen.getByText('收起 ↑')).toBeInTheDocument()
  })

  it('renders rollback button for user messages on hover (when not streaming)', async () => {
    const msg = makeMessage({ role: 'user', content: 'Rollback test' })
    const { container } = render(<MessageItem message={msg} />)
    const userDiv = container.querySelector('[data-message-role="user"]')
    expect(userDiv).toBeTruthy()
    if (userDiv) {
      await act(async () => {
        fireEvent.mouseEnter(userDiv)
      })
    }
    expect(screen.getByText('↶ 回退并编辑')).toBeInTheDocument()
  })
})
