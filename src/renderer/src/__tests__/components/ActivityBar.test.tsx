import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ToolCallState } from '@/stores/chatStore'

const mockToolCalls: Record<string, ToolCallState> = {}

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      isStreaming: true,
      toolCalls: mockToolCalls,
      streamingThinking: '',
      streamingContent: '',
    }
    return selector(state)
  }),
}))

import { ActivityBar } from '@/components/chat/ActivityBar'

function addToolCall(id: string, overrides: Partial<ToolCallState> = {}) {
  mockToolCalls[id] = {
    toolCallId: id,
    name: 'write_file',
    args: JSON.stringify({ path: 'src/App.tsx' }),
    status: 'running',
    startedAt: Date.now() - 3000,
    ...overrides,
  }
}

describe('ActivityBar', () => {
  it('renders activity items when streaming with tool calls', () => {
    Object.keys(mockToolCalls).forEach((k) => delete mockToolCalls[k])
    addToolCall('tc-1', { name: 'read_file', status: 'completed', endedAt: Date.now() })
    addToolCall('tc-2', { name: 'write_file', status: 'running' })
    const { container } = render(<ActivityBar />)
    const shimmerElements = container.querySelectorAll('.text-shimmer')
    expect(shimmerElements.length).toBeGreaterThan(0)
  })

  it('shows duration in formatted ms/s', () => {
    Object.keys(mockToolCalls).forEach((k) => delete mockToolCalls[k])
    addToolCall('tc-1', { startedAt: Date.now() - 500, endedAt: Date.now() })
    const { container } = render(<ActivityBar />)
    const durationText = container.textContent || ''
    expect(durationText).toMatch(/\d+ms|\d+\.\ds/)
  })

  it('shows status indicator emoji for each state', () => {
    Object.keys(mockToolCalls).forEach((k) => delete mockToolCalls[k])
    addToolCall('tc-1', { status: 'running' })
    const { container } = render(<ActivityBar />)
    expect(container.textContent).toContain('🔄')
  })
})
