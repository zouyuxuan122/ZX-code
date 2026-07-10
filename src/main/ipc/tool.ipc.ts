import { ipcMain } from 'electron'
import { toolRegistry, getToolDefinitions } from '../tools'
import { logger } from '../services/logger.service'
import { checkPermissionWithPath, getAllowedDirectories } from '../services/permission.service'
import type { ToolExecutionResult } from '@shared/types/tool'

/**
 * 工具相关 IPC handler
 */
export function registerToolIpc(): void {
  // 返回工具定义列表（用于 UI 展示）
  ipcMain.handle('tool:list', () => {
    return getToolDefinitions()
  })

  // 直接执行某个工具（手动触发，区别于 Agent 内部调用）
  ipcMain.handle(
    'tool:execute',
    async (
      _event,
      toolName: string,
      args: Record<string, unknown>,
      context?: {
        workspacePath?: string
        projectId?: string
        conversationId?: string
        autoAccept?: boolean
      },
    ): Promise<ToolExecutionResult> => {
      const tool = toolRegistry.getTool(toolName)
      if (!tool) {
        logger.warn(`工具不存在: ${toolName}`)
        return {
          tool_call_id: '',
          content: `工具不存在: ${toolName}`,
          is_error: true,
        }
      }

      const workspacePath = context?.workspacePath ?? ''
      const allowedDirectories = getAllowedDirectories()

      // 权限检查：提取路径参数，对写入类工具做路径校验
      const targetPath = (args.path as string) || (args.file_path as string) || (args.cwd as string) || undefined
      if (workspacePath && targetPath) {
        const permission = checkPermissionWithPath(toolName, targetPath, workspacePath)
        if (permission === 'deny') {
          return {
            tool_call_id: '',
            content: `权限被拒绝：工具 ${toolName} 不允许执行`,
            is_error: true,
          }
        }
        if (permission === 'ask' && !context?.autoAccept) {
          return {
            tool_call_id: '',
            content: `需要用户确认：工具 ${toolName} 访问了工作区外的路径 ${targetPath}`,
            is_error: true,
          }
        }
      }

      try {
        const result = await tool.execute(args, {
          workspacePath,
          projectId: context?.projectId ?? null,
          conversationId: context?.conversationId ?? '',
          autoAccept: context?.autoAccept ?? false,
          allowedDirectories,
        })
        return result
      } catch (err) {
        const message = (err as Error).message || String(err)
        logger.error(`工具执行失败 [tool=${toolName}]: ${message}`, err as Error)
        return {
          tool_call_id: '',
          content: message,
          is_error: true,
        }
      }
    },
  )
}
