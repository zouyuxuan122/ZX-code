import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { searchFiles } from '../services/search.service'
import { logger } from '../services/logger.service'
import { getDb } from '../database'
import * as searchRepo from '../database/repositories/search.repo'
import type { SearchOptions } from '@shared/types/search'

/**
 * 搜索相关 IPC handler
 *
 * 注册通道：
 * - search:files         — 按文件名 / 内容搜索工作区文件
 * - search:messages      — FTS5 全文搜索消息，返回带高亮片段的结果列表
 * - search:conversations — FTS5 全文搜索，返回按对话去重的结果列表
 *
 * @param db 可选注入，用于测试；默认使用全局 getDb()
 */
export function registerSearchIpc(db?: Database.Database): void {
  const database = db ?? getDb()

  // search:files — 按文件名 / 内容搜索工作区文件
  ipcMain.handle('search:files', async (_event, options: SearchOptions) => {
    try {
      return await searchFiles(options)
    } catch (err) {
      logger.error(`search:files 失败: ${(err as Error).message}`, err as Error)
      return []
    }
  })

  // search:messages — FTS5 全文搜索消息
  ipcMain.handle(
    'search:messages',
    (_event, keyword: string, limit?: number) => {
      return searchRepo.searchMessages(database, keyword, limit)
    },
  )

  // search:conversations — FTS5 全文搜索，按对话去重
  ipcMain.handle(
    'search:conversations',
    (_event, keyword: string, limit?: number) => {
      return searchRepo.getConversationsByFts(database, keyword, limit)
    },
  )
}
