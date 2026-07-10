import { ipcMain } from 'electron'
import * as mcpService from '../services/mcp.service'
import { logger } from '../services/logger.service'
import type { McpServerConfig } from '@shared/types/mcp'

/**
 * MCP 相关 IPC handler
 */
export function registerMcpIpc(): void {
  // 获取所有 MCP 服务器配置
  ipcMain.handle('mcp:listServers', () => {
    return mcpService.getMcpServers()
  })

  // 添加 MCP 服务器配置
  ipcMain.handle('mcp:addServer', (_event, config: Omit<McpServerConfig, 'id'>) => {
    return mcpService.addMcpServer(config)
  })

  // 更新 MCP 服务器配置
  ipcMain.handle(
    'mcp:updateServer',
    (_event, id: string, config: Partial<McpServerConfig>) => {
      return mcpService.updateMcpServer(id, config)
    },
  )

  // 删除 MCP 服务器配置
  ipcMain.handle('mcp:removeServer', (_event, id: string) => {
    mcpService.removeMcpServer(id)
    return true
  })

  // 连接 MCP 服务器
  ipcMain.handle('mcp:connectServer', async (_event, id: string) => {
    try {
      return await mcpService.connectMcpServer(id)
    } catch (err) {
      logger.error(`MCP 连接失败 [id=${id}]: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  // 断开 MCP 服务器
  ipcMain.handle('mcp:disconnectServer', async (_event, id: string) => {
    await mcpService.disconnectMcpServer(id)
    return true
  })

  // 获取所有 MCP 服务器状态
  ipcMain.handle('mcp:listStatus', () => {
    return mcpService.getMcpServerStatuses()
  })

  // 获取所有已连接 MCP 服务器的工具
  ipcMain.handle('mcp:listTools', () => {
    return mcpService.getMcpTools()
  })
}
