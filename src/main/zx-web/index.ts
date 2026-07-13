/**
 * ZxWeb 内置引擎模块入口
 *
 * 负责初始化 storeManager、oauthManager，启动 Koa 代理服务器。
 * 服务器监听 127.0.0.1:8080，暴露 OpenAI 兼容 API。
 */
import { BrowserWindow } from 'electron'
import { logger } from '../services/logger.service'
import { storeManager } from './store'
import { oauthManager } from './oauth'
import { proxyServer } from './proxy/server'

const DEFAULT_PORT = 8080
const DEFAULT_HOST = '127.0.0.1'

let initialized = false
let serverStarted = false

/**
 * 初始化 ZxWeb 引擎：加载 store 配置。
 * 必须在 app.whenReady() 之后、createMainWindow 之前调用。
 */
export async function initZxWeb(): Promise<void> {
  if (initialized) {
    logger.warn('[zx-web] 已初始化，跳过')
    return
  }
  try {
    await storeManager.initialize()
    logger.info('[zx-web] storeManager 已初始化')
    initialized = true
  } catch (err) {
    logger.error('[zx-web] 初始化失败', err as Error)
    throw err
  }
}

/**
 * 启动 ZxWeb 代理服务器。
 * 在主窗口创建后调用（oauth 需要 mainWindow）。
 */
export async function startZxWebServer(mainWindow: BrowserWindow): Promise<void> {
  if (!initialized) {
    await initZxWeb()
  }
  if (serverStarted) {
    logger.warn('[zx-web] 服务器已启动，跳过')
    return
  }

  // 注入 mainWindow 给 oauthManager（登录进度通知）
  oauthManager.setMainWindow(mainWindow)

  // 读取端口配置（用户可在设置中修改）
  const config = storeManager.getConfig()
  const port = config.proxyPort || DEFAULT_PORT
  const host = config.proxyHost || DEFAULT_HOST

  try {
    const ok = await proxyServer.start(port, host)
    if (ok) {
      serverStarted = true
      logger.info(`[zx-web] 代理服务器已启动: http://${host}:${port}`)
    } else {
      logger.error('[zx-web] 代理服务器启动失败')
    }
  } catch (err) {
    logger.error('[zx-web] 代理服务器启动异常', err as Error)
  }
}

/**
 * 停止 ZxWeb 代理服务器（应用退出时调用）。
 */
export async function stopZxWebServer(): Promise<void> {
  if (serverStarted) {
    await proxyServer.stop()
    serverStarted = false
    logger.info('[zx-web] 代理服务器已停止')
  }
  if (initialized) {
    storeManager.flushPendingWrites()
  }
}

/**
 * 获取代理服务器运行状态。
 */
export function isZxWebRunning(): boolean {
  return serverStarted && proxyServer.isRunning()
}

/**
 * 获取代理服务器基础 URL。
 */
export function getZxWebBaseUrl(): string {
  const config = storeManager.getConfig()
  const port = config.proxyPort || DEFAULT_PORT
  const host = config.proxyHost || DEFAULT_HOST
  return `http://${host}:${port}`
}

export { storeManager, oauthManager, proxyServer }
