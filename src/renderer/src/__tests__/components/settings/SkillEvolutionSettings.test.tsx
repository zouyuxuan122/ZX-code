import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SclExtension } from '@shared/types/scl'
import type {
  EvolutionRun,
  EvolutionRunResult,
  SkillVersion,
} from '@shared/types/skill-evolution'

// ─── Mocks ──────────────────────────────────────────────

const mockSclList = vi.fn()
const mockEvolutionHistory = vi.fn()
const mockEvolutionRun = vi.fn()
const mockEvolutionCompare = vi.fn()
const mockEvolutionRollback = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    scl: {
      list: (...args: unknown[]) => mockSclList(...args),
    },
    evolution: {
      history: (...args: unknown[]) => mockEvolutionHistory(...args),
      run: (...args: unknown[]) => mockEvolutionRun(...args),
      compare: (...args: unknown[]) => mockEvolutionCompare(...args),
      rollback: (...args: unknown[]) => mockEvolutionRollback(...args),
    },
  },
}))

// Mock settingsStore — 支持 zustand selector 模式
const storeState = {
  getSetting: (_key: string, def: unknown) => def,
  updateSetting: vi.fn(),
  getEvolutionEnabled: () => true,
  setEvolutionEnabled: vi.fn(),
  getProfileEnabled: () => true,
  setProfileEnabled: vi.fn(),
}
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState,
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { SkillEvolutionSettings } from '@/components/settings/SkillEvolutionSettings'

const skill: SclExtension = {
  id: 'skill-1',
  name: '代码审查',
  description: '代码审查技能',
  category: 'review',
  author: 'test',
  version: '1.0.0',
  content: 'review content',
  tags: [],
  enabled: true,
  source: 'builtin',
  icon: '🔍',
  created_at: 0,
  updated_at: 0,
}

const run: EvolutionRun = {
  id: 'run-1',
  skillId: 'skill-1',
  status: 'completed',
  iterations: 3,
  baselineScore: 0.6,
  bestScore: 0.85,
  bestVariantId: 'var-1',
  variantCount: 3,
  summary: '提升明显',
  createdAt: 1700000000000,
  completedAt: 1700000001000,
}

const version: SkillVersion = {
  id: 'ver-1',
  skillId: 'skill-1',
  version: 2,
  content: 'v2 content',
  score: 0.85,
  scoreBreakdown: { adherence: 0.8, correctness: 0.9, conciseness: 0.85, overall: 0.85 },
  createdReason: 'evolution',
  isCurrent: false,
  createdAt: 1700000000000,
}

describe('SkillEvolutionSettings 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockSclList.mockResolvedValue([skill])
    mockEvolutionHistory.mockResolvedValue([run])
    const runResult: EvolutionRunResult = {
      run,
      baselineScore: 0.6,
      bestVariant: null,
      allVariants: [],
      improved: true,
    }
    mockEvolutionRun.mockResolvedValue(runResult)
    mockEvolutionCompare.mockResolvedValue({ run, versions: [version] })
    mockEvolutionRollback.mockResolvedValue(true)
  })

  it('渲染标题并加载技能列表', async () => {
    render(<SkillEvolutionSettings />)
    expect(screen.getByText('技能进化')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockSclList).toHaveBeenCalled()
      expect(screen.getByText('代码审查')).toBeInTheDocument()
    })
  })

  it('显示技能来源标签', async () => {
    render(<SkillEvolutionSettings />)
    await waitFor(() => {
      expect(screen.getByText('内置')).toBeInTheDocument()
    })
  })

  it('加载并显示进化历史（状态、基线分数、最佳分数）', async () => {
    render(<SkillEvolutionSettings />)
    await waitFor(() => {
      expect(mockEvolutionHistory).toHaveBeenCalledWith('skill-1')
    })
    await waitFor(() => {
      expect(screen.getByText(/已完成|completed/)).toBeInTheDocument()
      expect(screen.getByText(/0\.60/)).toBeInTheDocument()
      expect(screen.getByText(/0\.85/)).toBeInTheDocument()
    })
  })

  it('点击进化按钮调用 evolution:run', async () => {
    render(<SkillEvolutionSettings />)
    const evolveBtn = await screen.findByRole('button', { name: /进化/ })
    fireEvent.click(evolveBtn)
    await waitFor(() => {
      expect(mockEvolutionRun).toHaveBeenCalledWith({
        skillId: 'skill-1',
      })
    })
  })

  it('展开历史运行后加载版本并显示回滚按钮', async () => {
    render(<SkillEvolutionSettings />)
    await waitFor(() => {
      expect(screen.getByText(/0\.85/)).toBeInTheDocument()
    })
    // 点击运行行展开
    const expandBtn = screen.getByRole('button', { name: /查看变体|展开/ })
    fireEvent.click(expandBtn)
    await waitFor(() => {
      expect(mockEvolutionCompare).toHaveBeenCalledWith('run-1')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /回滚/ })).toBeInTheDocument()
    })
  })

  it('点击回滚按钮调用 evolution:rollback', async () => {
    render(<SkillEvolutionSettings />)
    await waitFor(() => {
      expect(screen.getByText(/0\.85/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /查看变体|展开/ }))
    const rollbackBtn = await screen.findByRole('button', { name: /回滚/ })
    fireEvent.click(rollbackBtn)
    await waitFor(() => {
      expect(mockEvolutionRollback).toHaveBeenCalledWith(
        'skill-1',
        'ver-1',
      )
    })
  })
})
