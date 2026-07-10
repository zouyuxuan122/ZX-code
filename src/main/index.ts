import { app, BrowserWindow, protocol } from 'electron'
import { createMainWindow, getMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './database'
import { initLogger, logger } from './services/logger.service'
import { createTray, destroyTray } from './services/tray.service'
import { createDefaultProviders } from './providers'
import { registerBuiltinTools } from './tools'
import { initChat2Api, startChat2ApiServer, stopChat2ApiServer } from './chat2api'
import { terminalService } from './services/terminal.service'
import { disconnectAllServers } from './services/mcp.service'
import path from 'path'
import fs from 'fs'

const gotTheLock = app.requestSingleInstanceLock()

// 注册自定义协议，用于在沙箱化渲染进程中加载本地资源（头像/背景图片）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-asset',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    initLogger('info')
    logger.info('应用启动中...')

    // 注册自定义协议处理器，将 app-asset:///path 映射为本地文件
    protocol.handle('app-asset', (request) => {
      try {
        // app-asset:///C:/Users/.../img.png → 去掉 "app-asset://" 前缀得到 ///C:/Users/.../img.png
        const rawPath = decodeURIComponent(request.url.slice('app-asset://'.length))
        // 移除所有前导斜杠；Windows: C:/Users/... → C:\Users\...
        const filePath = process.platform === 'win32'
          ? rawPath.replace(/^\/+/, '').replace(/\//g, '\\')
          : rawPath.replace(/^\/+/, '/')

        // 安全校验：拒绝路径遍历（解码后检查 ../ 或 ..\）
        const normalized = path.normalize(filePath)
        if (normalized.includes('..')) {
          logger.warn(`[app-asset] 路径遍历被拒绝: ${filePath}`)
          return new Response(null, { status: 403 })
        }

        // 文件大小限制（50MB，防止读取超大文件耗尽内存）
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) {
          logger.warn(`[app-asset] 不是文件: ${filePath}`)
          return new Response(null, { status: 404 })
        }
        if (stat.size > 50 * 1024 * 1024) {
          logger.warn(`[app-asset] 文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${filePath}`)
          return new Response(null, { status: 413 })
        }

        logger.info(`[app-asset] loading: ${filePath}`)
        const data = fs.readFileSync(filePath)
        const ext = path.extname(filePath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
          '.json': 'application/json', '.moc3': 'application/octet-stream',
        }
        return new Response(data, { headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' } })
      } catch (err) {
        logger.error(`[app-asset] failed to load ${request.url}: ${(err as Error).message}`)
        return new Response(null, { status: 404 })
      }
    })
    logger.info('app-asset 协议已注册')

    initDatabase()
    logger.info('数据库已初始化')

    // 创建默认 Provider 配置
    createDefaultProviders()
    logger.info('默认 Provider 已就绪')

    // 注册内置工具
    registerBuiltinTools()
    logger.info('内置工具已注册')

    createMainWindow()
    createTray(getMainWindow)
    logger.info('应用启动完成')

    // 注册 IPC 处理器（需要 mainWindow）
    const ipcMainWindow = getMainWindow()
    if (ipcMainWindow) {
      registerIpcHandlers(ipcMainWindow)
      logger.info('IPC 处理器已注册')
    } else {
      logger.warn('主窗口未创建，跳过 IPC 处理器注册')
    }

    // 启动 Chat2API 内置引擎
    try {
      const mainWindow = getMainWindow()
      if (mainWindow) {
        await initChat2Api()
        await startChat2ApiServer(mainWindow)
        logger.info('Chat2API 引擎已启动')
      } else {
        logger.warn('主窗口未创建，跳过 Chat2API 引擎启动')
      }
    } catch (err) {
      logger.error('Chat2API 引擎启动失败，网页大模型功能不可用', err as Error)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', async () => {
    logger.info('应用退出中...')
    // 清理终端与 MCP 子进程，防止孤儿进程泄漏
    terminalService.disposeAll()
    await disconnectAllServers()
    destroyTray()
    await stopChat2ApiServer()
    closeDatabase()
  })
}
