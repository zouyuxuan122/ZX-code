import { ipcMain, Notification } from 'electron'
import type Database from 'better-sqlite3'
import { AutoFetchService } from '../services/auto-fetch.service'
import { MemoryRecallService } from '../services/memory-recall.service'
import { getDb } from '../database'
import type { SchedulerService } from '../services/scheduler.service'
import type {
  CreateSyncSourceDto,
  UpdateSyncSourceDto,
} from '@shared/types/sync'

/**
 * 外部数据源同步 IPC handler
 *
 * 注册通道：
 * - sync:listSources / sync:addSource / sync:updateSource / sync:removeSource
 * - sync:triggerNow / sync:getSchedulerStatus
 *
 * @param db 可选注入,用于测试;默认从全局 DB 获取
 * @param scheduler 可选注入的调度器,用于查询运行状态
 */
export function registerSyncIpc(
  db?: Database.Database,
  scheduler?: SchedulerService
): void {
  const database = db ?? getDb()
  const recallService = new MemoryRecallService(database)
  const autoFetch = new AutoFetchService(recallService, database)

  ipcMain.handle('sync:listSources', () => autoFetch.listSources())

  ipcMain.handle('sync:addSource', (_event, dto: CreateSyncSourceDto) => {
    return autoFetch.addSource(dto)
  })

  ipcMain.handle(
    'sync:updateSource',
    (_event, id: string, dto: UpdateSyncSourceDto) => {
      return autoFetch.updateSource(id, dto)
    }
  )

  ipcMain.handle('sync:removeSource', (_event, id: string) => {
    autoFetch.removeSource(id)
  })

  ipcMain.handle('sync:triggerNow', async () => {
    const fetchResult = await autoFetch.fetchAll()

    new Notification({
      title: '同步完成',
      body: `已同步 ${fetchResult.totalWritten} 条记忆(耗时 ${fetchResult.durationMs}ms)`,
    }).show()

    return fetchResult
  })

  ipcMain.handle('sync:getSchedulerStatus', () => {
    if (!scheduler) return { running: false, jobs: [] }
    return {
      running: scheduler.isRunning('auto-fetch'),
      jobs: scheduler.getJobNames(),
    }
  })
}
