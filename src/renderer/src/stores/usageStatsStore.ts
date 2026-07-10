import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { DailyUsageStat } from '@shared/types/usage'

interface UsageStatsState {
  dailyStats: DailyUsageStat[]
  today: DailyUsageStat | null
  loading: boolean
  load: (days?: number) => Promise<void>
}

export const useUsageStatsStore = create<UsageStatsState>((set) => ({
  dailyStats: [],
  today: null,
  loading: false,
  load: async (days = 90) => {
    set({ loading: true })
    try {
      const [stats, today] = await Promise.all([
        ipc.usage.getDailyStats(days),
        ipc.usage.getTodaySummary(),
      ])
      set({ dailyStats: stats, today })
    } finally {
      set({ loading: false })
    }
  },
}))
