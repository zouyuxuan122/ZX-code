import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { ToolCallState } from '@/stores/chatStore'

const { mockSetPendingPermissionRequest, mockApproveToolCall } = vi.hoisted(() => ({
  mockSetPendingPermissionRequest: vi.fn(),
  mockApproveToolCall: vi.fn(),
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: Object.assign(
    vi.fn((selector: (s: unknown) => unknown) => {
      const state = {
        setPendingPermissionRequest: mockSetPendingPermissionRequest,
      }
      return selector(state)
    }),
    { getState: vi.fn(() => ({ setPendingPermissionRequest: mockSetPendingPermissionRequest })) }
  ),
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    vi.fn((selector: (s: unknown) => unknown) => {
      const state = { approveToolCall: mockApproveToolCall }
      return selector ? selector(state) : state
    }),
    { getState: vi.fn(() => ({ approveToolCall: mockApproveToolCall })) }
  ),
}))

vi.mock('@/components/chat/DiffView', () => ({
  DiffView: ({ filepath, additions, deletions }: { filepath: string; additions: number; deletions: number }) => (
    <div data-testid="diff-view" data-filepath={filepath}>
      +{additions} -{deletions}
    </div>
  ),
}))

import { ToolCallView } from '@/components/chat/ToolCallView'

function makeToolCall(overrides: Partial<ToolCallState> = {}): ToolCallState {
  return {
    toolCallId: 'tc-1',
    name: 'write_file',
    args: JSON.stringify({ path: 'src/App.tsx', content: 'hello' }),
    status: 'running',
    startedAt: Date.now() - 5000,
    ...overrides,
  }
}

beforeEach(() => {
  mockSetPendingPermissionRequest.mockReset()
  mockApproveToolCall.mockReset()
  cleanup()
})

describe('ToolCallView', () => {
  it('renders tool name with text-shimmer class for run_command', () => {
    const tc = makeToolCall({ name: 'run_command', args: JSON.stringify({ command: 'echo hello' }) })
    render(<ToolCallView toolCall={tc} />)
    const shimmerSpans = document.querySelectorAll('.text-shimmer')
    const toolNameSpan = Array.from(shimmerSpans).find((s) => s.textContent === '执行命令')
    expect(toolNameSpan).toBeTruthy()
  })

  it('does not apply text-shimmer to tool name for non-run_command tools', () => {
    const tc = makeToolCall({ name: 'write_file', args: JSON.stringify({ path: 'src/App.tsx' }) })
    render(<ToolCallView toolCall={tc} />)
    const shimmerSpans = document.querySelectorAll('.text-shimmer')
    const toolNameSpan = Array.from(shimmerSpans).find((s) => s.textContent === '写入文件')
    expect(toolNameSpan).toBeFalsy()
  })

  it('renders file path when args contain path', () => {
    const tc = makeToolCall({ name: 'write_file', args: JSON.stringify({ path: 'src/App.tsx' }) })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('src/App.tsx')).toBeInTheDocument()
  })

  it('renders running status with correct label', () => {
    const tc = makeToolCall({ status: 'running' })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  it('renders completed status with correct label', () => {
    const tc = makeToolCall({
      status: 'completed',
      result: { tool_call_id: 'tc-1', content: 'ok', is_error: false },
    })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('已完成')).toBeInTheDocument()
  })

  it('renders error status with correct label', () => {
    const tc = makeToolCall({ status: 'error' })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('错误')).toBeInTheDocument()
  })

  it('shows [!] for high-risk tools', () => {
    const tc = makeToolCall({ name: 'run_command', status: 'pending_approval' })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('[!]')).toBeInTheDocument()
  })

  it('shows approval buttons when pending_approval and not high risk', () => {
    const tc = makeToolCall({ name: 'write_file', status: 'pending_approval' })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText('批准')).toBeInTheDocument()
    expect(screen.getByText('拒绝')).toBeInTheDocument()
  })

  it('opens permission dialog when high-risk pending_approval clicked', () => {
    const tc = makeToolCall({ name: 'run_command', status: 'pending_approval' })
    render(<ToolCallView toolCall={tc} />)
    fireEvent.click(screen.getByText('查看权限请求'))
    expect(mockSetPendingPermissionRequest).toHaveBeenCalledTimes(1)
    expect(mockSetPendingPermissionRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'run_command',
        riskLevel: 'high',
      }),
    )
  })

  it('renders duration when startedAt is set', () => {
    const tc = makeToolCall({ startedAt: Date.now() - 1500 })
    render(<ToolCallView toolCall={tc} />)
    expect(screen.getByText(/\d+\.\d+s/)).toBeInTheDocument()
  })

  it('extracts truncated command for run_command tool', () => {
    const longCommand = 'npm run build -- --mode production --verbose --profile'.repeat(3)
    const tc = makeToolCall({
      name: 'run_command',
      args: JSON.stringify({ command: longCommand }),
    })
    render(<ToolCallView toolCall={tc} />)
    const displayed = longCommand.slice(0, 40) + '...'
    expect(screen.getByText(displayed)).toBeInTheDocument()
  })
})
