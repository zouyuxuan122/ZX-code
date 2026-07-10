import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const mockApprove = vi.fn()
const mockSetRequest = vi.fn()

let pendingRequest: {
  requestId: string
  sessionId: string
  toolName: string
  toolInput: string
  riskLevel: 'low' | 'medium' | 'high'
} | null = null

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      pendingPermissionRequest: pendingRequest,
      setPendingPermissionRequest: mockSetRequest,
    }
    return selector(state)
  }),
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    vi.fn((selector: (s: unknown) => unknown) => { const state = { approveToolCall: mockApprove, pendingApprovals: [] }; return selector(state) }),
    { getState: () => ({ approveToolCall: mockApprove, pendingApprovals: [] }) },
  ),
}))

import { PermissionDialog } from '@/components/chat/PermissionDialog'

beforeEach(() => {
  mockApprove.mockReset()
  mockSetRequest.mockReset()
  pendingRequest = null
})

afterEach(() => {
  cleanup()
})

function setRequest(overrides = {}) {
  pendingRequest = {
    requestId: 'req-1',
    sessionId: 'sess-1',
    toolName: 'run_command',
    toolInput: JSON.stringify({ command: 'rm -rf /' }),
    riskLevel: 'high',
    ...overrides,
  }
}

describe('PermissionDialog', () => {
  it('renders nothing when no pending request', () => {
    const { container } = render(<PermissionDialog />)
    expect(container.innerHTML).toBe('')
  })

  it('renders risk level label for high risk', () => {
    setRequest({ riskLevel: 'high' })
    render(<PermissionDialog />)
    expect(screen.getByText('[!] 高风险操作')).toBeInTheDocument()
  })

  it('renders risk level label for medium risk', () => {
    setRequest({ riskLevel: 'medium' })
    render(<PermissionDialog />)
    expect(screen.getByText('[i] 中风险')).toBeInTheDocument()
  })

  it('renders risk level label for low risk', () => {
    setRequest({ riskLevel: 'low' })
    render(<PermissionDialog />)
    expect(screen.getByText('[i] 低风险')).toBeInTheDocument()
  })

  it('displays tool name', () => {
    setRequest()
    render(<PermissionDialog />)
    expect(screen.getByText('run_command')).toBeInTheDocument()
  })

  it('has three action buttons', () => {
    setRequest()
    render(<PermissionDialog />)
    expect(screen.getByText('总是允许')).toBeInTheDocument()
    expect(screen.getByText('拒绝')).toBeInTheDocument()
    expect(screen.getByText('仅本次允许')).toBeInTheDocument()
  })

  it('clicking "仅本次允许" calls approve with true and once', () => {
    setRequest()
    render(<PermissionDialog />)
    fireEvent.click(screen.getByText('仅本次允许'))
    expect(mockApprove).toHaveBeenCalledWith('req-1', true, 'once')
    expect(mockSetRequest).toHaveBeenCalledWith(null)
  })

  it('clicking "拒绝" calls approve with false', () => {
    setRequest()
    render(<PermissionDialog />)
    fireEvent.click(screen.getByText('拒绝'))
    expect(mockApprove).toHaveBeenCalledWith('req-1', false)
    expect(mockSetRequest).toHaveBeenCalledWith(null)
  })

  it('clicking "总是允许" calls approve with true and always', () => {
    setRequest()
    render(<PermissionDialog />)
    fireEvent.click(screen.getByText('总是允许'))
    expect(mockApprove).toHaveBeenCalledWith('req-1', true, 'always')
    expect(mockSetRequest).toHaveBeenCalledWith(null)
  })

  it('closes when clicking overlay backdrop', () => {
    setRequest()
    render(<PermissionDialog />)
    const overlay = document.querySelector('.permission-overlay')
    expect(overlay).toBeTruthy()
    if (overlay) {
      fireEvent.click(overlay)
    }
    expect(mockSetRequest).toHaveBeenCalledWith(null)
  })
})
