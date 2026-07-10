import { useEffect, useMemo } from 'react'
import { useUsageStatsStore } from '@/stores/usageStatsStore'
import { Flame } from 'lucide-react'
import { cn } from '@/utils/cn'

/** 根据 token 量计算等级 0-4 */
function calcLevel(tokens: number, max: number): number {
  if (tokens === 0 || max === 0) return 0
  const ratio = tokens / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const LEVEL_COLORS = [
  'bg-bg-tertiary/40',
  'bg-accent-blue/20',
  'bg-accent-blue/40',
  'bg-accent-blue/60',
  'bg-accent-blue/80',
]

export function UsageHeatmapPanel() {
  const dailyStats = useUsageStatsStore((s) => s.dailyStats)
  const today = useUsageStatsStore((s) => s.today)
  const load = useUsageStatsStore((s) => s.load)

  useEffect(() => {
    void load(90)
    const timer = setInterval(() => void load(90), 60 * 1000)
    return () => clearInterval(timer)
  }, [load])

  // 构建 90 天日历，补全无数据日期
  const calendar = useMemo(() => {
    const map = new Map(dailyStats.map((d) => [d.date, d]))
    const days: Array<{ date: string; tokens: number; calls: number }> = []
    const now = new Date()
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const stat = map.get(dateStr)
      days.push({ date: dateStr, tokens: stat?.tokens ?? 0, calls: stat?.calls ?? 0 })
    }
    return days
  }, [dailyStats])

  const maxTokens = useMemo(() => Math.max(...calendar.map((d) => d.tokens), 1), [calendar])

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      <div className="flex h-7 flex-shrink-0 items-center gap-1.5 border-b border-border-default/30 px-2.5">
        <Flame className="h-3 w-3 text-text-tertiary" />
        <span className="text-[11px] text-text-tertiary">Token 热力图</span>
      </div>
      {/* 今日汇总 */}
      {today && (
        <div className="flex flex-shrink-0 gap-3 border-b border-border-default/20 px-3 py-1.5">
          <div>
            <div data-testid="heatmap-today-tokens" className="text-lg font-semibold text-text-primary">
              {today.tokens.toLocaleString()}
            </div>
            <div className="text-[9px] text-text-tertiary">今日 Token</div>
          </div>
          <div>
            <div data-testid="heatmap-today-calls" className="text-lg font-semibold text-text-primary">
              {today.calls}
            </div>
            <div className="text-[9px] text-text-tertiary">今日调用</div>
          </div>
        </div>
      )}
      {/* 热力图网格：7 行（周）x 13 列（约 90 天） */}
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-flow-col grid-rows-7 gap-0.5">
          {calendar.map((day) => {
            const level = calcLevel(day.tokens, maxTokens)
            return (
              <div
                key={day.date}
                data-heatmap-cell
                data-level={level || undefined}
                title={`${day.date}: ${day.tokens.toLocaleString()} tokens / ${day.calls} 次`}
                className={cn('h-2.5 w-2.5 rounded-sm', LEVEL_COLORS[level])}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
