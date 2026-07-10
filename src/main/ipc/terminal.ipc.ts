import { ipcMain, type WebContents } from 'electron'
import { terminalService } from '../services/terminal.service'
import { logger } from '../services/logger.service'
import type { TerminalShell } from '@shared/types/terminal'

/**
 * 终端相关 IPC handler
 *
 * 输出 / 退出事件由 service 触发，通过 EventEmitter 转发到这里。
 * 这里维护 sessionSenders，将事件回送到对应创建会话的渲染进程 WebContents。
 */
export function registerTerminalIpc(): void {
  // 维护每个会话对应的 sender（创建会话时的 WebContents）
  const sessionSenders = new Map<string, WebContents>()

  // 注册 service 输出事件 → 转发给对应 sender
  terminalService.onOutput(({ id, data }) => {
    const sender = sessionSenders.get(id)
    if (sender && !sender.isDestroyed()) {
      sender.send('terminal:output', { id, data })
    }
  })

  // 注册 service 退出事件 → 转发给对应 sender，并清理映射
  terminalService.onExit(({ id, code }) => {
    const sender = sessionSenders.get(id)
    if (sender && !sender.isDestroyed()) {
      sender.send('terminal:exit', { id, code })
    }
    sessionSenders.delete(id)
  })

  // terminal:create — 创建一个终端会话，返回会话 ID
  ipcMain.handle('terminal:create', async (event, shell: TerminalShell, cwd: string) => {
    try {
      const id = terminalService.createSession(shell, cwd)
      sessionSenders.set(id, event.sender)
      return id
    } catch (err) {
      logger.error(`terminal:create 失败: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  // terminal:write — 向会话 stdin 写入数据
  ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
    terminalService.writeToSession(id, data)
  })

  // terminal:resize — 调整终端尺寸（spawn 模式下仅存储）
  ipcMain.handle(
    'terminal:resize',
    async (_event, id: string, cols: number, rows: number) => {
      terminalService.resizeSession(id, cols, rows)
    },
  )

  // terminal:kill — 终止会话
  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    terminalService.killSession(id)
    sessionSenders.delete(id)
  })

  // terminal:list — 列出所有活动会话
  ipcMain.handle('terminal:list', async () => {
    return terminalService.listSessions()
  })

  // terminal:getOutput — 获取会话最近的输出（用于 Agent 审阅）
  ipcMain.handle('terminal:getOutput', async (_event, id: string, lines?: number) => {
    return terminalService.getRecentOutput(id, lines)
  })
}
