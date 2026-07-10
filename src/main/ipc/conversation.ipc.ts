import { ipcMain } from 'electron'
import * as conversationService from '../services/conversation.service'
import * as conversationRepo from '../database/repositories/conversation.repo'
import { logger } from '../services/logger.service'

/**
 * 对话相关 IPC handler
 * 风格与 project.ipc.ts 一致：函数式注册，使用 ipcMain.handle
 */
export function registerConversationIpc(): void {
  // 列出对话（可按项目过滤）
  ipcMain.handle('conversation:list', (_event, projectId?: string) => {
    return conversationService.listConversations(projectId)
  })

  // 获取对话（含消息列表）
  ipcMain.handle('conversation:get', (_event, id: string) => {
    return conversationService.getConversation(id)
  })

  // 创建对话：入参 (projectId, title?)
  ipcMain.handle(
    'conversation:create',
    (_event, projectId: string | null, title?: string) => {
      logger.info(`创建对话: projectId=${projectId}, title=${title || '新对话'}`)
      return conversationService.createConversation(projectId, title)
    },
  )

  // 更新对话
  ipcMain.handle(
    'conversation:update',
    (_event, id: string, data: { title?: string; model?: string; thinking_level?: string }) => {
      logger.info(`更新对话: ${id}`)
      return conversationService.updateConversation(id, data)
    },
  )

  // 删除对话
  ipcMain.handle('conversation:delete', (_event, id: string) => {
    logger.info(`删除对话: ${id}`)
    conversationService.deleteConversation(id)
  })

  // 获取对话消息列表
  ipcMain.handle('conversation:getMessages', (_event, conversationId: string) => {
    return conversationRepo.findMessages(conversationId)
  })

  // 删除对话的全部消息
  ipcMain.handle('conversation:deleteMessages', (_event, conversationId: string) => {
    logger.info(`清空对话消息: ${conversationId}`)
    conversationRepo.deleteMessages(conversationId)
  })

  // 回退到指定消息：删除该消息及之后的所有消息
  ipcMain.handle(
    'conversation:rollbackToMessage',
    (_event, conversationId: string, messageId: string) => {
      try {
        const deleted = conversationRepo.deleteMessagesFrom(conversationId, messageId)
        logger.info(`回退对话 ${conversationId} 到消息 ${messageId} 之前，删除了 ${deleted} 条消息`)
        return { deleted, ok: true }
      } catch (err) {
        const msg = (err as Error).message || String(err)
        logger.error(`回退对话失败 conv=${conversationId} msg=${messageId}: ${msg}`, err as Error)
        return { deleted: 0, ok: false, error: msg }
      }
    },
  )
}
