import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentTrace, TraceStats } from '@shared/types/trace'

// ─── Mocks ──────────────────────────────────────────────

const mockTraceQuery = vi.fn()
const mockTraceStats = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    trace: {
      query: (...args: unknown[]) => mockTraceQuery(...args),
      stats: (...args: unknown[]) => mockTraceStats(...args),
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { TraceExplorerSettings } from '@/components/settings/TraceExplorerSettings'

const stats: TraceStats = {
  totalTraces: 42,
  totalToolCalls: 120,
  averageDurationMs: 3500,
  successRate: 0.85,
  topTools: [
    { toolName: 'read_file', count: 50, successRate: 1.0 },
    { toolName: 'edit_file', count: 30, successRate: 0.8 },
  ],
}

const trace: AgentTrace = {
  conversationId: 'conv-trace-1',
  messageId: 'msg-1',
  entries: [
    {
      iteration: 1,
      toolCalls: [
        {
          toolName: 'read_file',
          argsSummary: 'src/index.ts',
          resultSummary: '读取成功，200 行',
          durationMs: 50,
          success: true,
        },
        {
          toolName: 'edit_file',
          argsSummary: 'src/index.ts:10',
          resultSummary: '已修改第 10 行',
          durationMs: 80,
          success: true,
        },
      ],
      iterationDurationMs: 130,
    },
  ],
  totalDurationMs: 5000,
  totalToolCallCount: 2,
  successCount: 2,
  failureCount: 0,
  createdAt: 1700000000000,
}

describe('TraceExplorerSettings 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTraceQuery.mockResolvedValue([trace])
    mockTraceStats.mockResolvedValue(stats)
  })

  it('渲染标题、刷新按钮与筛选控件', async () => {
    render(<TraceExplorerSettings />)
    expect(screen.getByText('轨迹浏览器')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/会话 ID/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/工具名称/)).toBeInTheDocument()
  })

  it('加载并显示统计摘要（总轨迹数、成功率、平均耗时）', async () => {
    render(<TraceExplorerSettings />)
    await waitFor(() => {
      expect(mockTraceStats).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText(/42/)).toBeInTheDocument()
      expect(screen.getByText(/85%/)).toBeInTheDocument()
      expect(screen.getByText(/3\.5/)).toBeInTheDocument()
    })
  })

  it('加载并显示轨迹列表（会话 ID、工具调用数、成功/失败数）', async () => {
    render(<TraceExplorerSettings />)
    await waitFor(() => {
      expect(screen.getByText('conv-trace-1')).toBeInTheDocument()
      expect(screen.getByText(/^2$/)).toBeInTheDocument()
    })
  })

  it('勾选"仅失败"筛选后调用 trace:query 传 failureOnly', async () => {
    render(<TraceExplorerSettings />)
    await waitFor(() => {
      expect(screen.getByText('conv-trace-1')).toBeInTheDocument()
    })
    // 点击"仅失败"筛选
    const failureToggle = screen.getByRole('switch', { name: /仅失败/ })
    fireEvent.click(failureToggle)
    await waitFor(() => {
      expect(mockTraceQuery).toHaveBeenCalledWith(expect.objectContaining({
        failureOnly: true,
      }))
    })
  })

  it('展开轨迹行显示工具调用详情（工具名、参数摘要、结果摘要）', async () => {
    render(<TraceExplorerSettings />)
    await waitFor(() => {
      expect(screen.getByText('conv-trace-1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /查看详情|展开/ }))
    await waitFor(() => {
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('src/index.ts')).toBeInTheDocument()
      expect(screen.getByText('读取成功，200 行')).toBeInTheDocument()
    })
  })
})
