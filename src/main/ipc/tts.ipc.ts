import { ipcMain, dialog } from 'electron'
import { promises as fsp, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { synthesizeTts, getTtsVoices, loadTtsSettings } from '../tts'
import { cloneVoice } from '../tts/voice-clone'
import { logger } from '../services/logger.service'

/** TTS 临时音频目录 */
const TTS_TEMP_DIR = join(tmpdir(), 'zx-code-tts')

/** 确保临时目录存在 */
function ensureTempDir(): string {
  try {
    mkdirSync(TTS_TEMP_DIR, { recursive: true })
  } catch { /* 目录已存在 */ }
  return TTS_TEMP_DIR
}

/** 将 Base64 音频写入临时文件，返回文件路径（异步，不阻塞主进程） */
async function writeAudioToTempFile(audioBase64: string, format: string): Promise<string> {
  ensureTempDir()
  const filename = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format || 'mp3'}`
  const filePath = join(TTS_TEMP_DIR, filename)
  const buffer = Buffer.from(audioBase64, 'base64')
  await fsp.writeFile(filePath, buffer)
  return filePath
}

/** 删除临时音频文件（异步，不阻塞主进程） */
async function cleanupTempAudio(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath)
  } catch { /* 忽略删除错误 */ }
}

export function registerTtsIpc(): void {
  // 合成语音
  ipcMain.handle('tts:synthesize', async (_event, text: string, options?: {
    voice?: string
    rate?: number
    volume?: number
    format?: 'mp3' | 'wav'
    cloneVoiceId?: string
  }) => {
    try {
      const result = await synthesizeTts({
        text,
        ...options,
      })
      // 将音频写入临时文件（异步，不阻塞主进程）
      // 避免 Base64 data URL 或 blob URL 在 Electron sandbox 中播放失败
      const filePath = await writeAudioToTempFile(result.audioBase64, result.format || 'mp3')
      logger.info(`[tts] 音频已写入临时文件: ${filePath}`)
      return { ok: true, filePath, format: result.format }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      logger.error(`[tts] 合成失败: ${msg}`, err as Error)
      return { ok: false, error: msg }
    }
  })

  // 清理临时音频文件
  ipcMain.handle('tts:cleanupAudio', async (_event, filePath: string) => {
    await cleanupTempAudio(filePath)
    return { ok: true }
  })

  // 获取音色列表
  ipcMain.handle('tts:listVoices', async () => {
    try {
      const voices = await getTtsVoices()
      return { ok: true, voices }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      logger.error(`[tts] 获取音色列表失败: ${msg}`, err as Error)
      return { ok: false, error: msg, voices: [] }
    }
  })

  // 获取当前 TTS 设置
  ipcMain.handle('tts:getSettings', async () => {
    try {
      const settings = await loadTtsSettings()
      return { ok: true, settings }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      logger.error(`[tts] 获取设置失败: ${msg}`, err as Error)
      return { ok: false, error: msg }
    }
  })

  // 选择音频文件（用于语音克隆）
  ipcMain.handle('tts:selectAudio', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择音频文件',
      filters: [
        { name: '音频文件', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true }
    }
    return { ok: true, filePath: result.filePaths[0] }
  })

  // 语音克隆：上传音频 + 参考文本，创建克隆音色
  ipcMain.handle('tts:cloneVoice', async (_event, audioPath: string, referenceText: string) => {
    try {
      const result = await cloneVoice({ audioPath, referenceText })
      if (result.success && result.voiceId) {
        return { ok: true, voiceId: result.voiceId }
      }
      return { ok: false, error: result.error || '克隆失败' }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      logger.error(`[tts] 语音克隆失败: ${msg}`, err as Error)
      return { ok: false, error: msg }
    }
  })
}
