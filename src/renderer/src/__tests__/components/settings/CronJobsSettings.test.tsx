import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentCronJob } from '@shared/types/cron-agent'

// ─── Mocks ──────────────────────────────────────────────

const mockCronList = vi.fn()
const mockCronCreate = vi.fn()
const mockCronDelete = vi.fn()
const mockCronToggle = vi.fn()
const mockCronHistory = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    cron: {
      list: (...args: unknown[]) => mockCronList(...args),
      create: (...args: unknown[]) => mockCronCreate(...args),
      delete: (...args: unknown[]) => mockCronDelete(...args),
      toggle: (...args: unknown[]) => mockCronToggle(...args),
      history: (...args: unknown[]) => mockCronHistory(...args),
    },
  },
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { CronJobsSettings } from '@/components/settings/CronJobsSettings'

const job: AgentCronJob = {
  id: 'job-1',
  name: '每日日报',
  description: '每天生成项目进展日报',
  cronExpression: '0 9 * * *',
  projectId: null,
  enabled: true,
  allowWriteTools: false,
  lastRunAt: 1700000000000,
  lastRunResult: '成功生成日报',
  lastRunStatus: 'success',
  runCount: 5,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}

describe('CronJobsSettings 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockCronList.mockResolvedValue([job])
    mockCronHistory.mockResolvedValue([job])
    mockCronCreate.mockResolvedValue(job)
    mockCronDelete.mockResolvedValue(undefined)
    mockCronToggle.mockResolvedValue(undefined)
  })

  it('渲染标题与创建表单字段', async () => {
    render(<CronJobsSettings />)
    expect(screen.getByText('定时任务')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/任务名称/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/用自然语言描述/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/0 9 \* \* \*/)).toBeInTheDocument()
  })

  it('加载并显示任务列表（名称、cron 表达式、运行次数）', async () => {
    render(<CronJobsSettings />)
    await waitFor(() => {
      expect(mockCronList).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('每日日报')).toBeInTheDocument()
      expect(screen.getByText('0 9 * * *')).toBeInTheDocument()
      expect(screen.getByText(/运行.*5.*次/)).toBeInTheDocument()
    })
  })

  it('提交创建表单调用 cron:create', async () => {
    render(<CronJobsSettings />)
    fireEvent.change(screen.getByPlaceholderText(/任务名称/), { target: { value: '周报' } })
    fireEvent.change(screen.getByPlaceholderText(/用自然语言描述/), {
      target: { value: '每周一生成周报' },
    })
    fireEvent.change(screen.getByPlaceholderText(/0 9 \* \* \*/), {
      target: { value: '0 10 * * 1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /创建|添加/ }))
    await waitFor(() => {
      expect(mockCronCreate).toHaveBeenCalledWith({
        name: '周报',
        description: '每周一生成周报',
        cronExpression: '0 10 * * 1',
        allowWriteTools: false,
      })
    })
  })

  it('点击删除按钮调用 cron:delete', async () => {
    render(<CronJobsSettings />)
    await waitFor(() => {
      expect(screen.getByText('每日日报')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /删除/ }))
    await waitFor(() => {
      expect(mockCronDelete).toHaveBeenCalledWith('job-1')
    })
  })

  it('展开任务显示执行历史（last_run_result）', async () => {
    render(<CronJobsSettings />)
    await waitFor(() => {
      expect(screen.getByText('每日日报')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /查看历史|展开/ }))
    await waitFor(() => {
      expect(mockCronHistory).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('成功生成日报')).toBeInTheDocument()
    })
  })
})
