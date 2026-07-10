import { ipcMain, dialog, BrowserWindow } from 'electron'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../services/logger.service'

/**
 * 文件上传 IPC
 *
 * 用途：
 * - 头像/背景图片：选择图片 → 复制到 userData/attachments/ → 返回 file:// 路径
 * - 对话附件：选择任意文件 → 复制到 userData/attachments/ → 返回路径与文件名
 *
 * 统一存放于 userData/attachments/，避免原始路径泄露与外部文件丢失。
 */

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/** 复制文件到目标目录，返回新路径 */
function copyFile(src: string, destDir: string, prefix = ''): string {
  ensureDir(destDir)
  const ext = path.extname(src)
  const base = path.basename(src, ext)
  const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}${ext}`
  const dest = path.join(destDir, filename)
  fs.copyFileSync(src, dest)
  return dest
}

/** 将本地路径转换为可在 <img src> 中使用的 app-asset:/// URL
 *  自定义协议用于绕过沙箱化渲染进程对 file:// 的安全限制
 *  使用三斜杠格式 app-asset:///C:/path 确保 URL 解析正确（避免 C: 被误认为主机名）
 */
export function localPathToFileUrl(p: string): string {
  if (!p) return ''
  if (/^https?:\/\//i.test(p) || /^app-asset:\/\//i.test(p)) return p
  // Windows 路径需要转成正斜杠
  const normalized = p.replace(/\\/g, '/')
  return `app-asset:///${normalized}`
}

export function registerUploadIpc(): void {
  /** 选择头像/背景图片，复制到 attachments 目录，返回 file:// URL */
  ipcMain.handle('upload:image', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window!, {
      title: '选择图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const src = result.filePaths[0]
    const destDir = path.join(app.getPath('userData'), 'attachments', 'images')
    try {
      const localPath = copyFile(src, destDir, 'img-')
      return {
        path: localPath,
        url: localPathToFileUrl(localPath),
        filename: path.basename(src),
      }
    } catch (err) {
      logger.error(`上传图片失败: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  /** 选择对话附件文件，复制到 attachments 目录，返回路径与文件名 */
  ipcMain.handle('upload:attachment', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window!, {
      title: '选择文件',
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const destDir = path.join(app.getPath('userData'), 'attachments', 'files')
    const items: Array<{ path: string; filename: string; size: number }> = []
    for (const src of result.filePaths) {
      try {
        const localPath = copyFile(src, destDir, 'file-')
        const stat = fs.statSync(localPath)
        items.push({
          path: localPath,
          filename: path.basename(src),
          size: stat.size,
        })
      } catch (err) {
        logger.warn(`复制附件失败 ${src}: ${(err as Error).message}`)
      }
    }
    return items
  })
}
