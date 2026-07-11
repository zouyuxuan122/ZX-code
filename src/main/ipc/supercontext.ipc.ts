import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SuperContextService } from '../services/super-context.service'
import { MemoryRecallService } from '../services/memory-recall.service'
import { getDb } from '../database'
import type { ContextBriefing } from '../../shared/types/supercontext'

/**
 * SuperContext 上下文预热 IPC handler
 * 风格与 goal.ipc.ts 一致：函数式注册，使用 ipcMain.handle
 *
 * @param db 可选注入，用于测试；默认从全局 DB 构造
 */
export function registerSuperContextIpc(db?: Database.Database): void {
  const database = db ?? getDb()
  const recallService = new MemoryRecallService(database)
  const contextService = new SuperContextService(recallService, database)

  ipcMain.handle(
    'supercontext:build',
    async (_e, workspacePath: string, userMessage: string, timeoutMs?: number) => {
      return contextService.buildBriefing(workspacePath, userMessage, timeoutMs ?? 800)
    },
  )

  ipcMain.handle('supercontext:format', (_e, briefing: ContextBriefing) => {
    return contextService.formatBriefingAsText(briefing)
  })
}
