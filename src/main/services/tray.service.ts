import { Tray, Menu, BrowserWindow, app, nativeImage, Notification } from 'electron'
import type { NativeImage } from 'electron'
import path from 'path'
import { APP_NAME } from '@shared/constants/app'
import { AutoFetchService } from './auto-fetch.service'
import { MemoryRecallService } from './memory-recall.service'
import { getDb } from '../database'

let tray: Tray | null = null

export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  const iconPath = path.join(__dirname, '../../resources/icons/favicon.ico')
  
  let icon: NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip(APP_NAME)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        const win = getMainWindow()
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
      },
    },
    {
      label: '立即同步',
      click: async () => {
        try {
          const db = getDb()
          const recallService = new MemoryRecallService(db)
          const autoFetch = new AutoFetchService(recallService, db)
          const result = await autoFetch.fetchAll()

          new Notification({
            title: '同步完成',
            body: `已同步 ${result.totalWritten} 条记忆(耗时 ${result.durationMs}ms)`,
          }).show()
        } catch (err) {
          new Notification({
            title: '同步失败',
            body: err instanceof Error ? err.message : String(err),
          }).show()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isVisible()) {
        if (win.isFocused()) {
          win.hide()
        } else {
          win.focus()
        }
      } else {
        win.show()
        win.focus()
      }
    }
  })

  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
