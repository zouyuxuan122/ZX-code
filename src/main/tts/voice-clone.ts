import { net } from 'electron'
import { readFile } from 'fs/promises'
import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from '../services/logger.service'

/**
 * 语音克隆模块
 *
 * 支持用户上传音频文件 + 对应参考文本，通过云端 API 创建克隆音色。
 * 克隆成功后返回 voice ID，存入 tts.cloneVoiceId 设置项。
 *
 * 云端 API 约定：
 * - POST {baseUrl}/v1/audio/clone
 * - multipart/form-data: audio (音频文件) + reference_text (参考文本)
 * - Authorization: Bearer {apiKey}
 * - 返回 JSON: { voice_id: "xxx" } 或 { id: "xxx" }
 */

/** buildCloneRequestParams 的参数 */
export interface BuildCloneParams {
  /** 音频文件 Buffer */
  audioBuffer: Buffer
  /** 音频文件名（含扩展名） */
  audioFilename: string
  /** 参考文本（音频对应的文字） */
  referenceText: string
  /** API Key */
  apiKey: string
  /** API Base URL */
  baseUrl: string
}

/** cloneVoice 的参数 */
export interface CloneVoiceParams {
  /** 音频文件路径 */
  audioPath: string
  /** 参考文本（音频对应的文字） */
  referenceText: string
}

/** cloneVoice 的结果 */
export interface CloneVoiceResult {
  /** 是否成功 */
  success: boolean
  /** 克隆得到的 voice ID */
  voiceId?: string
  /** 错误信息 */
  error?: string
}

/** 解析后的云端响应 */
export interface ParsedCloneResponse {
  success: boolean
  voiceId?: string
  error?: string
}

/**
 * 构造语音克隆请求参数（纯函数，便于测试）
 */
export function buildCloneRequestParams(params: BuildCloneParams): {
  url: string
  method: string
  headers: Record<string, string>
  body: FormData
} {
  const baseUrl = params.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/v1/audio/clone`

  // 从文件名推断 MIME 类型
  const ext = params.audioFilename.toLowerCase().split('.').pop() ?? ''
  const mimeType =
    ext === 'wav' ? 'audio/wav' :
    ext === 'mp3' ? 'audio/mpeg' :
    ext === 'ogg' ? 'audio/ogg' :
    ext === 'flac' ? 'audio/flac' :
    'application/octet-stream'

  const formData = new FormData()
  formData.append('audio', new Blob([new Uint8Array(params.audioBuffer)], { type: mimeType }), params.audioFilename)
  formData.append('reference_text', params.referenceText)

  return {
    url,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: formData,
  }
}

/**
 * 解析云端克隆 API 的响应（纯函数，便于测试）
 */
export function parseCloneResponse(data: unknown): ParsedCloneResponse {
  if (!data || typeof data !== 'object') {
    return { success: false, error: '云端返回空响应' }
  }

  const obj = data as Record<string, unknown>

  // 支持 voice_id 或 id 字段
  const voiceId = obj.voice_id ?? obj.id
  if (typeof voiceId === 'string' && voiceId.trim()) {
    return { success: true, voiceId: voiceId.trim() }
  }

  // 失败：提取错误信息
  const errorMsg = typeof obj.error === 'string'
    ? obj.error
    : typeof obj.message === 'string'
      ? obj.message
      : '云端未返回 voice_id'
  return { success: false, error: errorMsg }
}

/**
 * 执行语音克隆。
 *
 * 从设置中读取 apiKey 和 baseUrl，读取音频文件，
 * 上传到云端 API，返回克隆的 voice ID。
 */
export async function cloneVoice(params: CloneVoiceParams): Promise<CloneVoiceResult> {
  // 参数校验
  if (!params.audioPath.trim()) {
    return { success: false, error: '音频文件路径不能为空' }
  }
  if (!params.referenceText.trim()) {
    return { success: false, error: '参考文本不能为空，请输入音频对应的文字内容' }
  }

  // 从设置读取云端配置
  const apiKey = (settingsRepo.get('tts.apiKey') as string) || ''
  const baseUrl = (settingsRepo.get('tts.baseUrl') as string) || ''

  if (!apiKey) {
    return { success: false, error: '未配置 API Key，请在设置中填写云端 API Key' }
  }
  if (!baseUrl) {
    return { success: false, error: '未配置 Base URL，请在设置中填写云端 API 地址' }
  }

  // 读取音频文件
  let audioBuffer: Buffer
  try {
    audioBuffer = await readFile(params.audioPath)
  } catch (err) {
    const msg = (err as Error).message || String(err)
    logger.error(`[tts:clone] 读取音频文件失败: ${msg}`, err as Error)
    return { success: false, error: `读取音频文件失败: ${msg}` }
  }

  // 从路径提取文件名
  const audioFilename = params.audioPath.replace(/\\/g, '/').split('/').pop() ?? 'audio.wav'

  // 构造请求
  const requestParams = buildCloneRequestParams({
    audioBuffer,
    audioFilename,
    referenceText: params.referenceText,
    apiKey,
    baseUrl,
  })

  logger.info(`[tts:clone] 上传音频进行克隆: ${audioFilename} (${audioBuffer.length} bytes)`)

  // 发送请求
  let response: Response
  try {
    response = await net.fetch(requestParams.url, {
      method: requestParams.method,
      headers: requestParams.headers,
      body: requestParams.body,
    })
  } catch (err) {
    const msg = (err as Error).message || String(err)
    logger.error(`[tts:clone] 网络请求失败: ${msg}`, err as Error)
    return { success: false, error: `网络请求失败: ${msg}` }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    const msg = `HTTP ${response.status}: ${errorText.slice(0, 200)}`
    logger.error(`[tts:clone] 云端返回错误: ${msg}`)
    return { success: false, error: msg }
  }

  // 解析响应
  const jsonData = await response.json().catch(() => null)
  const parsed = parseCloneResponse(jsonData)

  if (!parsed.success || !parsed.voiceId) {
    logger.error(`[tts:clone] 克隆失败: ${parsed.error}`)
    return { success: false, error: parsed.error || '克隆失败' }
  }

  logger.info(`[tts:clone] 克隆成功，voiceId=${parsed.voiceId}`)
  return { success: true, voiceId: parsed.voiceId }
}
