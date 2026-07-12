import { app, BrowserWindow, protocol } from 'electron'
import { createMainWindow, getMainWindow } from './window'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase, getDb } from './database'
import { initLogger, logger } from './services/logger.service'
import { createTray, destroyTray } from './services/tray.service'
import { createDefaultProviders } from './providers'
import { registerBuiltinTools, getCronAgentService } from './tools'
import { initChat2Api, startChat2ApiServer, stopChat2ApiServer } from './chat2api'
import { terminalService } from './services/terminal.service'
import { disconnectAllServers } from './services/mcp.service'
import { handleAppAssetRequest } from './utils/appAssetHandler'
import { configureCommandLine } from './configureCommandLine'
import { SchedulerService } from './services/scheduler.service'
import { SubconsciousService } from './services/subconscious.service'
import { MemoryRecallService } from './services/memory-recall.service'
import { AutoFetchService } from './services/auto-fetch.service'
import * as settingsRepo from './database/repositories/settings.repo'
import * as projectRepo from './database/repositories/project.repo'

// 后台调度器(模块级单例,便于生命周期管理)
const scheduler = new SchedulerService()

// 配置 Chromium 命令行开关（必须在 app.whenReady() 之前）
// autoplay-policy=no-user-gesture-required：允许 TTS 在异步合成后播放音频
configureCommandLine()

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
    // 支持 HTTP Range 请求，避免 Audio 元素反复请求整个文件导致主进程卡顿
    protocol.handle('app-asset', (request) => {
      return handleAppAssetRequest(request)
    })
    logger.info('app-asset 协议已注册（支持 Range 请求）')

    initDatabase()
    logger.info('数据库已初始化')

    // 初始化后台调度器与潜意识服务
    const recallService = new MemoryRecallService(getDb())
    const subconscious = new SubconsciousService(recallService)
    const syncEnabled = settingsRepo.get('sync.enabled') === true
    const intervalMin = (settingsRepo.get('sync.intervalMinutes') as number) ?? 20

    scheduler.register('subconscious', intervalMin * 60 * 1000, async () => {
      const project = projectRepo.findActive()
      if (project?.workspace_path) {
        try {
          await subconscious.runSync(project.workspace_path)
          logger.info('[Subconscious] 同步完成')
        } catch (err) {
          logger.warn(`[Subconscious] 同步失败: ${(err as Error).message}`)
        }
      }
    })

    if (syncEnabled) {
      scheduler.start('subconscious')
      logger.info(`[Subconscious] 后台同步已启动,间隔 ${intervalMin} 分钟`)
    }

    // auto-fetch job:定时从外部数据源(GitHub issues / RSS)拉取并写入记忆树
    scheduler.register('auto-fetch', intervalMin * 60 * 1000, async () => {
      try {
        const autoFetch = new AutoFetchService(recallService, getDb())
        const result = await autoFetch.fetchAll()
        logger.info(`[AutoFetch] 同步完成: ${result.totalWritten} 条`)
      } catch (err) {
        logger.warn(`[AutoFetch] 同步失败: ${(err as Error).message}`)
      }
    })

    if (syncEnabled) {
      scheduler.start('auto-fetch')
      logger.info(`[AutoFetch] 后台同步已启动,间隔 ${intervalMin} 分钟`)
    }

    // 创建默认 Provider 配置
    createDefaultProviders()
    logger.info('默认 Provider 已就绪')

    // 注册内置工具
    registerBuiltinTools(scheduler)
    logger.info('内置工具已注册')

    // 加载并注册所有已启用的 Cron Agent 任务
    const cronAgentService = getCronAgentService()
    if (cronAgentService) {
      cronAgentService.loadAndRegisterAll()
      logger.info('Cron Agent 任务已加载')
    }

    createMainWindow()
    createTray(getMainWindow)
    logger.info('应用启动完成')

    // 注册 IPC 处理器（需要 mainWindow）
    const ipcMainWindow = getMainWindow()
    if (ipcMainWindow) {
      registerIpcHandlers(ipcMainWindow, scheduler)
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
    // 停止后台调度器
    scheduler.stopAll()
    // 清理终端与 MCP 子进程，防止孤儿进程泄漏
    terminalService.disposeAll()
    await disconnectAllServers()
    destroyTray()
    await stopChat2ApiServer()
    closeDatabase()
  })
}
