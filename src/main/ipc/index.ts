import { ipcMain, BrowserWindow } from 'electron'
import { registerProjectIpc } from './project.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerConversationIpc } from './conversation.ipc'
import { registerProviderIpc } from './provider.ipc'
import { registerChatIpc } from './chat.ipc'
import { registerToolIpc } from './tool.ipc'
import { registerContextIpc } from './context.ipc'
import { registerUploadIpc } from './upload.ipc'
import { registerFileIpc } from './file.ipc'
import { registerPermissionIpc } from './permission.ipc'
import { registerMcpIpc } from './mcp.ipc'
import { registerSclIpc } from './scl.ipc'
import { registerUsageIpc } from './usage.ipc'
import { registerWeatherIpc } from './weather.ipc'
import { registerSearchIpc } from './search.ipc'
import { registerTerminalIpc } from './terminal.ipc'
import { registerChat2ApiIpc } from './chat2api.ipc'
import { registerTtsIpc } from './tts.ipc'
import { registerGoalIpc } from './goal.ipc'
import { registerMemoryIpc } from './memory.ipc'
import { registerSuperContextIpc } from './supercontext.ipc'
import { registerSyncIpc } from './sync.ipc'
import type { SchedulerService } from '../services/scheduler.service'
import { getMainWindow } from '../window'
import { APP_VERSION } from '@shared/constants/app'

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  scheduler?: SchedulerService
): void {
  registerProjectIpc()
  registerSettingsIpc()
  registerConversationIpc()
  registerProviderIpc()
  registerChatIpc()
  registerToolIpc()
  registerContextIpc()
  registerUploadIpc()
  registerFileIpc()
  registerPermissionIpc()
  registerMcpIpc()
  registerSclIpc()
  registerUsageIpc()
  registerWeatherIpc()
  registerSearchIpc()
  registerTerminalIpc()
  registerChat2ApiIpc(mainWindow)
  registerTtsIpc()
  registerGoalIpc()
  registerSuperContextIpc()
  registerMemoryIpc()
  registerSyncIpc(undefined, scheduler)

  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    getMainWindow()?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() ?? false
  })

  ipcMain.handle('system:getVersion', () => {
    return APP_VERSION
  })

  const win = getMainWindow()
  if (win) {
    win.on('maximize', () => {
      BrowserWindow.fromId(win.id)?.webContents.send('window:maximizeChanged', true)
    })
    win.on('unmaximize', () => {
      BrowserWindow.fromId(win.id)?.webContents.send('window:maximizeChanged', false)
    })
  }
}
