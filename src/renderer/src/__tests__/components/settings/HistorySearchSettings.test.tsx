import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────

const mockSearchConversations = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    search: {
      conversations: (...args: unknown[]) => mockSearchConversations(...args),
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { HistorySearchSettings } from '@/components/settings/HistorySearchSettings'

const result = {
  conversationId: 'conv-1',
  title: 'React 性能优化讨论',
  summary: '讨论了 React 渲染优化与 memo 使用场景。',
  matchCount: 3,
  snippet: '使用 memo 优化渲染性能',
}

describe('HistorySearchSettings 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchConversations.mockResolvedValue([result])
  })

  it('渲染标题与搜索输入框', () => {
    render(<HistorySearchSettings />)
    expect(screen.getByText('历史搜索')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/搜索对话/)).toBeInTheDocument()
  })

  it('点击搜索按钮调用 search:conversations', async () => {
    render(<HistorySearchSettings />)
    const input = screen.getByPlaceholderText(/搜索对话/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'memo' } })
    fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
    await waitFor(() => {
      expect(mockSearchConversations).toHaveBeenCalledWith('memo')
    })
  })

  it('回车触发搜索调用 search:conversations', async () => {
    render(<HistorySearchSettings />)
    const input = screen.getByPlaceholderText(/搜索对话/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'react' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockSearchConversations).toHaveBeenCalledWith('react')
    })
  })

  it('显示搜索结果（标题、摘要、匹配数、片段、对话 ID）', async () => {
    render(<HistorySearchSettings />)
    const input = screen.getByPlaceholderText(/搜索对话/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'memo' } })
    fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
    await waitFor(() => {
      expect(screen.getByText('React 性能优化讨论')).toBeInTheDocument()
      expect(screen.getByText('讨论了 React 渲染优化与 memo 使用场景。')).toBeInTheDocument()
      expect(screen.getByText(/3/)).toBeInTheDocument()
      expect(screen.getByText(/conv-1/)).toBeInTheDocument()
    })
  })

  it('搜索失败时显示错误提示', async () => {
    mockSearchConversations.mockRejectedValueOnce(new Error('网络错误'))
    render(<HistorySearchSettings />)
    fireEvent.change(screen.getByPlaceholderText(/搜索对话/), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
    await waitFor(() => {
      expect(screen.getByText(/网络错误/)).toBeInTheDocument()
    })
  })
})
