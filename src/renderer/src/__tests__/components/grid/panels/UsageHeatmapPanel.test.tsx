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

  it('GitHub 风格：活跃格子渲染可见的绿色背景（非透明）', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      const activeCells = Array.from(cells).filter((c) => c.getAttribute('data-level'))
      expect(activeCells.length).toBeGreaterThan(0)
      // 每个活跃格子的内联样式应包含绿色 color-mix（非透明）
      for (const cell of activeCells) {
        const el = cell as HTMLElement
        const bg = el.style.backgroundColor
        // 应使用 color-mix 引用 --accent-green（GitHub 风格绿色）
        expect(bg).toContain('accent-green')
        expect(bg).not.toContain('accent-blue')
      }
    })
  })

  it('GitHub 风格：等级越高绿色越深（color-mix 透明度递增）', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      // 按等级分组
      const byLevel = new Map<number, Element[]>()
      cells.forEach((c) => {
        const lv = c.getAttribute('data-level')
        if (lv) {
          const n = parseInt(lv, 10)
          if (!byLevel.has(n)) byLevel.set(n, [])
          byLevel.get(n)!.push(c)
        }
      })
      // 验证等级 1-4 的 color-mix 透明度递增（20% 40% 70% 90%）
      const opacities = [20, 40, 70, 90]
      for (let lv = 1; lv <= 4; lv++) {
        const group = byLevel.get(lv)
        if (group && group.length > 0) {
          const el = group[0] as HTMLElement
          expect(el.style.backgroundColor).toContain(`${opacities[lv - 1]}%`)
        }
      }
    })
  })

  it('GitHub 风格：无数据格子不使用绿色', async () => {
    render(<UsageHeatmapPanel />)
    await waitFor(() => {
      const cells = document.querySelectorAll('[data-heatmap-cell]')
      const emptyCells = Array.from(cells).filter((c) => !c.getAttribute('data-level'))
      expect(emptyCells.length).toBeGreaterThan(0)
      // 空格子的内联样式不应包含 accent-green
      for (const cell of emptyCells) {
        const el = cell as HTMLElement
        expect(el.style.backgroundColor).not.toContain('accent-green')
      }
    })
  })
})
