import { BrowserWindow, shell } from 'electron'
import path from 'path'
import { config } from './services/config.service'
import { DEFAULT_WINDOW_SIZE } from '@shared/constants/app'
import { logger } from './services/logger.service'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  const windowState = config.getWindowState()

  mainWindow = new BrowserWindow({
    width: windowState.width || DEFAULT_WINDOW_SIZE.width,
    height: windowState.height || DEFAULT_WINDOW_SIZE.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: DEFAULT_WINDOW_SIZE.minWidth,
    minHeight: DEFAULT_WINDOW_SIZE.minHeight,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,
    icon: path.join(__dirname, '../../resources/icons/favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (windowState.isMaximized) {
      mainWindow?.maximize()
    }
  })

  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? undefined : mainWindow.getBounds()
    config.setWindowState({
      width: bounds?.width || windowState.width,
      height: bounds?.height || windowState.height,
      x: bounds?.x,
      y: bounds?.y,
      isMaximized,
    })
  }

  mainWindow.on('resize', saveState)
  mainWindow.on('move', saveState)
  mainWindow.on('maximize', saveState)
  mainWindow.on('unmaximize', saveState)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  logger.info('主窗口已创建')
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
