import { ipcMain } from 'electron'
import {
  initUsageStatsTable,
  recordUsage,
  getDailyStats,
  getTodaySummary,
} from '../services/usage-stats.service'
import type { UsageRecord } from '@shared/types/usage'

export function registerUsageIpc(): void {
  initUsageStatsTable()

  ipcMain.handle('usage:record', async (_event, record: UsageRecord) => {
    recordUsage(record)
  })

  ipcMain.handle('usage:getDailyStats', async (_event, days: number) => {
    return getDailyStats(days)
  })

  ipcMain.handle('usage:getTodaySummary', async () => {
    return getTodaySummary()
  })
}
