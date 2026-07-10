import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { getDailyStatsMock, getTodaySummaryMock } = vi.hoisted(() => ({
  getDailyStatsMock: vi.fn(),
  getTodaySummaryMock: vi.fn(),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    usage: {
      getDailyStats: getDailyStatsMock,
      getTodaySummary: getTodaySummaryMock,
    },
  },
}))

import { UsageHeatmapPanel } from '@/components/grid/panels/UsageHeatmapPanel'

describe('UsageHeatmapPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDailyStatsMock.mockResolvedValue([
      { date: '2026-07-09', tokens: 5000, calls: 10, promptTokens: 3000, completionTokens: 2000 },
      { date: '2026-07-08', tokens: 3000, calls: 5, promptTokens: 2000, completionTokens: 1000 },
    ])
    getTodaySummaryMock.mockResolvedValue({
      date: '2026-07-09',
      tokens: 5000,
      calls: 10,
      promptTokens: 3000,
      completionTokens: 2000,
    })
  })

  it('显示今日汇总（token + 调用次数）', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('heatmap-today-tokens')).toHaveTextContent('5,000')
      expect(screen.getByTestId('heatmap-today-calls')).toHaveTextContent('10')
    })
  })

  it('渲染热力图格子', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      expect(cells.length).toBeGreaterThan(0)
    })
  })

  it('格子颜色深浅反映 token 量', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      expect(cells.length).toBeGreaterThan(0)
      // 有数据的格子应有 data-level 属性
      const activeCells = Array.from(cells).filter((c) => c.getAttribute('data-level'))
      expect(activeCells.length).toBeGreaterThan(0)
    })
  })
})
