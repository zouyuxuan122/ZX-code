import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      rightSidebarCollapsed: false,
      toggleRightSidebar: vi.fn(),
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      todos: [],
      artifacts: [],
      toolUsageStats: {},
      toolCalls: {},
      isStreaming: false,
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { currentProject: null }
    return selector(state)
  }),
}))

vi.mock('@/components/chat/ContextUsagePanel', () => ({
  ContextUsagePanel: () => <div data-testid="context-usage-panel" />,
}))

vi.mock('@/components/chat/TodoListPanel', () => ({
  TodoListPanel: () => <div data-testid="todo-list-panel" />,
}))

import { RightSidebar } from '@/components/layout/RightSidebar'

describe('RightSidebar', () => {
  it('expanded content is vertically scrollable', () => {
    render(<RightSidebar />)
    // 右侧栏展开态内容容器应该有 overflow-y-auto
    const contentContainer = screen.getByText('详情').parentElement?.nextElementSibling
    expect(contentContainer).toHaveClass('overflow-y-auto')
  })
})
