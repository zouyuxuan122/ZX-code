import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoPanel } from '@/components/grid/panels/TodoPanel'
import { useChatStore } from '@/stores/chatStore'

beforeEach(() => {
  useChatStore.setState({ todos: [], currentTaskName: null })
})

describe('TodoPanel', () => {
  it('无待办时显示空状态', () => {
    render(<TodoPanel />)
    expect(screen.getByText(/暂无待办/)).toBeInTheDocument()
  })

  it('展示待办列表，按状态着色', () => {
    useChatStore.setState({
      todos: [
        { id: '1', content: '完成 API', status: 'completed', priority: 'high' },
        { id: '2', content: '写测试', status: 'in_progress', priority: 'high' },
        { id: '3', content: '文档', status: 'pending', priority: 'low' },
      ],
    })
    render(<TodoPanel />)
    expect(screen.getByText('完成 API')).toBeInTheDocument()
    expect(screen.getByText('写测试')).toBeInTheDocument()
    expect(screen.getByText('文档')).toBeInTheDocument()
    // in_progress 项应有高亮
    expect(screen.getByText('写测试').closest('[data-todo-item]')).toHaveClass('bg-accent-blue/10')
  })

  it('显示进度统计（已完成/总数）', () => {
    useChatStore.setState({
      todos: [
        { id: '1', content: 'a', status: 'completed', priority: 'high' },
        { id: '2', content: 'b', status: 'pending', priority: 'low' },
      ],
    })
    render(<TodoPanel />)
    expect(screen.getByTestId('todo-progress')).toHaveTextContent('1/2')
  })
})
