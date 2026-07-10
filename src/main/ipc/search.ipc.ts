import { ipcMain } from 'electron'
import { searchFiles } from '../services/search.service'
import { logger } from '../services/logger.service'
import type { SearchOptions } from '@shared/types/search'

/**
 * 搜索相关 IPC handler
 * 暴露文件名 / 内容搜索能力给渲染进程
 */
export function registerSearchIpc(): void {
  // search:files — 按文件名 / 内容搜索工作区文件
  ipcMain.handle('search:files', async (_event, options: SearchOptions) => {
    try {
      return await searchFiles(options)
    } catch (err) {
      logger.error(`search:files 失败: ${(err as Error).message}`, err as Error)
      return []
    }
  })
}
