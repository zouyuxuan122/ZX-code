import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import * as projectRepo from '../database/repositories/project.repo'
import { logger } from '../services/logger.service'

/**
 * 文件相关 IPC handler
 * 主要用于 @file 提及功能：在工作区内读取文件内容
 */
export function registerFileIpc(): void {
  /**
   * 读取工作区内指定相对路径的文件内容
   * @param projectId 项目 ID（用于确定工作区根路径）
   * @param relativePath 文件相对路径
   * @returns 文件内容或错误
   */
  ipcMain.handle(
    'file:readContent',
    async (_event, projectId: string, relativePath: string): Promise<{ ok: boolean; content?: string; error?: string; size?: number }> => {
      try {
        if (!projectId || !relativePath) {
          return { ok: false, error: '缺少 projectId 或 relativePath' }
        }

        const project = projectRepo.findById(projectId)
        if (!project) {
          return { ok: false, error: `项目不存在: ${projectId}` }
        }

        const workspacePath = project.workspace_path
        if (!workspacePath) {
          return { ok: false, error: '项目未配置工作区路径' }
        }

        // 安全检查：防止路径穿越
        const fullPath = path.resolve(workspacePath, relativePath)
        const rel = path.relative(workspacePath, fullPath)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          return { ok: false, error: '路径越界：不允许访问工作区外的文件' }
        }

        if (!fs.existsSync(fullPath)) {
          return { ok: false, error: `文件不存在: ${relativePath}` }
        }

        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) {
          return { ok: false, error: `不是文件: ${relativePath}` }
        }

        // 限制文件大小（最多 100KB，避免上下文爆炸）
        const maxSize = 100 * 1024
        if (stat.size > maxSize) {
          return { ok: false, error: `文件过大 (${(stat.size / 1024).toFixed(1)}KB)，最大支持 100KB` }
        }

        const content = fs.readFileSync(fullPath, 'utf-8')
        return { ok: true, content, size: stat.size }
      } catch (err) {
        logger.error(`读取文件内容失败: ${(err as Error).message}`, err as Error)
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  /**
   * 用系统默认程序打开文件
   * @param absolutePath 文件绝对路径
   * @param line 可选行号（记录到日志，当前由系统默认程序处理）
   */
  ipcMain.handle(
    'file:openInEditor',
    async (_event, absolutePath: string, line?: number): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (!absolutePath || !fs.existsSync(absolutePath)) {
          return { ok: false, error: `文件不存在: ${absolutePath}` }
        }
        // shell.openPath 返回空字符串表示成功
        const errorMsg = await shell.openPath(absolutePath)
        if (errorMsg) {
          logger.warn(`openPath 失败 [${absolutePath}]: ${errorMsg}`)
        }
        logger.info(`打开文件: ${absolutePath}${line ? `:${line}` : ''}`)
        return { ok: true }
      } catch (err) {
        logger.error(`打开文件失败: ${(err as Error).message}`, err as Error)
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  /**
   * 在文件资源管理器中显示文件
   */
  ipcMain.handle(
    'file:showInFolder',
    async (_event, absolutePath: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (!absolutePath || !fs.existsSync(absolutePath)) {
          return { ok: false, error: `文件不存在: ${absolutePath}` }
        }
        shell.showItemInFolder(absolutePath)
        return { ok: true }
      } catch (err) {
        logger.error(`在文件夹中显示失败: ${(err as Error).message}`, err as Error)
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  /**
   * 选择单个文件（用于导入 VRM 模型等）
   */
  ipcMain.handle(
    'file:selectFile',
    async (event, options?: { filters?: { name: string; extensions: string[] }[] }): Promise<string | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openFile'],
        filters: options?.filters,
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
  )

  /**
   * 选择文件夹（用于导入 Live2D 模型等）
   */
  ipcMain.handle('file:selectFolder', async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory'],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  /**
   * 读取绝对路径文件内容（用于浏览器预览面板加载本地 HTML）
   * 安全校验：文件存在性、类型、大小限制（100KB）
   */
  ipcMain.handle('file:readAbsoluteContent', async (_event, absolutePath: string) => {
    try {
      if (!absolutePath || typeof absolutePath !== 'string') {
        return { ok: false, error: '路径不能为空' }
      }

      const fs = await import('fs/promises')
      const stat = await fs.stat(absolutePath)
      if (!stat.isFile()) {
        return { ok: false, error: `不是文件: ${absolutePath}` }
      }
      // 限制文件大小（100KB，与 readContent 一致）
      if (stat.size > 100 * 1024) {
        return { ok: false, error: `文件过大 (${(stat.size / 1024).toFixed(1)}KB)，最大支持 100KB` }
      }
      const content = await fs.readFile(absolutePath, 'utf-8')
      return { ok: true, content }
    } catch (err) {
      const message = (err as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? `文件不存在: ${absolutePath}`
        : `读取文件失败: ${(err as Error).message}`
      logger.error(message, err as Error)
      return { ok: false, error: message }
    }
  })
}
