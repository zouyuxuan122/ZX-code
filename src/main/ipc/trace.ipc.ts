import { ipcMain } from 'electron'
import { getTraceService } from '../services/trace.service'
import type { TraceQuery } from '@shared/types/trace'
import { logger } from '../services/logger.service'

/**
 * Agent 轨迹 IPC handler
 *
 * 注册 2 个通道：
 * - trace:query — 按条件查询轨迹
 * - trace:stats — 获取轨迹聚合统计
 */
export function registerTraceIpc(): void {
  ipcMain.handle('trace:query', (_event, query: TraceQuery) => {
    try {
      return getTraceService().queryTraces(query)
    } catch (err) {
      logger.warn(`trace:query 失败: ${(err as Error).message}`)
      return []
    }
  })

  ipcMain.handle('trace:stats', () => {
    try {
      return getTraceService().getTraceStats()
    } catch (err) {
      logger.warn(`trace:stats 失败: ${(err as Error).message}`)
      return null
    }
  })
}
