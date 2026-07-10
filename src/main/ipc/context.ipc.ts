import { ipcMain } from 'electron'
import * as contextUsageService from '../services/context-usage.service'
import * as conversationService from '../services/conversation.service'
import { logger } from '../services/logger.service'

/**
 * 上下文使用情况相关 IPC handler
 */
export function registerContextIpc(): void {
  // 获取对话的上下文使用情况
  ipcMain.handle('context:getUsage', (_event, conversationId: string) => {
    return contextUsageService.getContextUsage(conversationId)
  })

  // 获取对话内每条消息的 token 信息
  ipcMain.handle('context:getMessageTokens', (_event, conversationId: string) => {
    return contextUsageService.getMessageTokenList(conversationId)
  })

  // 手动触发对话压缩
  ipcMain.handle('context:compress', async (_event, conversationId: string) => {
    try {
      const result = await conversationService.compressConversation(conversationId, {})
      return { ok: true, ...result }
    } catch (err) {
      const message = (err as Error).message || String(err)
      logger.error(`手动压缩对话失败 [conv=${conversationId}]: ${message}`, err as Error)
      return { ok: false, error: message }
    }
  })
}
