import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { logger } from '../services/logger.service'
import type { TtsSynthesizeParams, TtsSynthesizeResult, TtsVoice } from '@shared/types/tts'

/**
 * Edge TTS（微软免费在线 TTS）Provider
 *
 * 通过 WebSocket 连接 speech.platform.bing.com，发送 SSML 请求，接收音频流。
 * 免费、无需 API key，支持多种 Neural 音色。
 *
 * 参考实现：https://github.com/rany2/edge-tts
 */

/** Edge TTS WebSocket 端点 */
const EDGE_TTS_WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
/** TrustedClientToken（公开的固定值，Edge 浏览器内置） */
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
/** Chromium 完整版本号（对应 Edge 浏览器版本） */
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
/** Sec-MS-GEC 版本号 */
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`

/** Windows 纪元偏移量（1601-01-01 到 1970-01-01 的秒数） */
const WIN_EPOCH = 11644473600
/** 秒到 100 纳秒间隔的转换因子（1e9 / 100） */
const S_TO_100NS = 1e7

/** 生成无连字符的 UUID（Edge TTS 要求 ConnectionId 无连字符） */
function generateConnectionId(): string {
  const hex = '0123456789abcdef'
  let id = ''
  for (let i = 0; i < 32; i++) {
    id += hex[Math.floor(Math.random() * 16)]
  }
  return id
}

/**
 * 生成 Sec-MS-GEC 认证 token。
 *
 * 算法（参考 edge-tts DRM.generate_sec_ms_gec）：
 * 1. 获取当前 Unix 时间戳
 * 2. 加 WIN_EPOCH（11644473600）转为 Windows file time 纪元
 * 3. 向下取整到 5 分钟窗口（300 秒）
 * 4. 乘以 1e7 转为 100 纳秒间隔
 * 5. SHA256("{ticks}{TrustedClientToken}") 取大写 hex 摘要
 *
 * @param nowSeconds 当前 Unix 时间戳（秒），可选（测试用）
 */
export function generateSecMsGec(nowSeconds?: number): string {
  const now = nowSeconds ?? Date.now() / 1000
  // 转为 Windows file time 纪元
  let ticks = Math.floor(now) + WIN_EPOCH
  // 向下取整到 5 分钟窗口
  ticks -= ticks % 300
  // 转为 100 纳秒间隔
  ticks = ticks * S_TO_100NS
  // 拼接并哈希
  const strToHash = `${ticks}${EDGE_TTS_TOKEN}`
  return createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

/** 构造 Edge TTS WebSocket URL（包含 ConnectionId + Sec-MS-GEC 认证） */
export function buildEdgeTtsUrl(): string {
  const connectionId = generateConnectionId()
  const secMsGec = generateSecMsGec()
  return `${EDGE_TTS_WSS_URL}?TrustedClientToken=${EDGE_TTS_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`
}

/**
 * 将语速（0.5~2.0）转为 SSML prosody rate 百分比。
 * 1.0 = +0%，2.0 = +100%，0.5 = -50%
 */
function rateToPercent(rate: number): string {
  if (rate === 1) return '+0%'
  const percent = Math.round((rate - 1) * 100)
  return percent >= 0 ? `+${percent}%` : `${percent}%`
}

/**
 * 将音量（0.0~1.0）转为 SSML prosody volume 百分比。
 * 1.0 = +0%，0.5 = -50%，0.0 = -100%（静音）
 */
function volumeToPercent(volume: number): string {
  if (volume === 1) return '+0%'
  const percent = Math.round((volume - 1) * 100)
  return percent >= 0 ? `+${percent}%` : `${percent}%`
}

/**
 * 构造 SSML（Speech Synthesis Markup Language）请求
 */
export function buildSsml(text: string, voice: string, rate: number, volume: number): string {
  const rateStr = rateToPercent(rate)
  const volStr = volumeToPercent(volume)
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody pitch='+0Hz' rate='${rateStr}' volume='${volStr}'>
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`
}

/** XML 转义 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
}

/** 解析后的 Edge TTS 消息类型 */
export interface ParsedEdgeMessage {
  type: 'audio' | 'end' | 'metadata' | 'unknown'
  audio?: Buffer
}

/** 已知的非音频路径（控制/元数据消息） */
const KNOWN_METADATA_PATHS = new Set(['audio.metadata', 'response', 'turn.start'])

/**
 * 解析 Edge TTS 文本帧消息。
 *
 * 文本帧格式：纯头部行，以 "\r\n" 分隔，如 "Path:turn.end\r\n"
 * 无前导长度字段。
 *
 * - Path:turn.end → 流结束
 * - Path:audio.metadata / response / turn.start → 元数据
 * - 其他 → unknown
 */
export function parseEdgeTtsTextMessage(msg: Buffer): ParsedEdgeMessage {
  if (msg.length === 0) {
    return { type: 'unknown' }
  }
  const headerStr = msg.toString('utf-8')
  const pathMatch = headerStr.match(/Path:([^\r\n]+)/)
  const path = pathMatch ? pathMatch[1].trim() : ''

  if (path === 'turn.end') {
    return { type: 'end' }
  }
  if (KNOWN_METADATA_PATHS.has(path)) {
    return { type: 'metadata' }
  }
  return { type: 'unknown' }
}

/**
 * 解析 Edge TTS 二进制帧消息。
 *
 * 二进制帧格式（参考 edge-tts get_headers_and_data）：
 * - 前 2 字节：header_length（大端 uint16）
 * - 接下来 header_length 字节：headers（用 \r\n 分隔，key:value 格式）
 * - 接下来 2 字节：\r\n（header 结束分隔符）
 * - 剩余字节：payload（音频数据）
 *
 * - Path:audio → 音频数据块
 * - Path:turn.end → 流结束
 * - Path:audio.metadata / response / turn.start → 元数据
 * - 其他 → unknown
 */
export function parseEdgeTtsMessage(msg: Buffer): ParsedEdgeMessage {
  if (msg.length === 0) {
    return { type: 'unknown' }
  }

  // 二进制消息前 2 字节是 header_length（大端 uint16）
  if (msg.length < 2) {
    return { type: 'unknown' }
  }

  const headerLength = msg.readUInt16BE(0)
  if (headerLength === 0 || headerLength + 2 > msg.length) {
    return { type: 'unknown' }
  }

  // 解析 headers
  const headerBytes = msg.slice(2, 2 + headerLength)
  const headerStr = headerBytes.toString('utf-8')
  const pathMatch = headerStr.match(/Path:([^\r\n]+)/)
  const path = pathMatch ? pathMatch[1].trim() : ''

  if (path === 'audio') {
    // 音频数据：跳过 2(header_length 字段) + headerLength(headers，含尾部 \r\n)
    // 参考 edge-tts Python _get_headers_and_data:
    //   headers_length = message[:2]  (大端 uint16)
    //   headers = message[2 : headers_length + 2]
    //   payload = message[headers_length + 2 :]
    //
    // headerLength 是 headers 区域的总长度（包含尾部的 \r\n 分隔符），
    // payload 紧接在 headers 区域之后，不需要额外跳过 2 字节。
    const audioStart = 2 + headerLength
    const audio = audioStart <= msg.length ? msg.slice(audioStart) : Buffer.alloc(0)
    return { type: 'audio', audio }
  }

  if (path === 'turn.end') {
    return { type: 'end' }
  }

  if (KNOWN_METADATA_PATHS.has(path)) {
    return { type: 'metadata' }
  }

  return { type: 'unknown' }
}

/** Edge TTS 内置音色列表（常用中文 + 英文） */
export const EDGE_TTS_VOICES: TtsVoice[] = [
  // 中文
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（女声）', language: 'zh-CN', gender: 'female' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊（女声）', language: 'zh-CN', gender: 'female' },
  { id: 'zh-CN-YunjianNeural', name: '云健（男声）', language: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-YunxiNeural', name: '云希（男声）', language: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏（男声）', language: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-YunyangNeural', name: '云扬（男声）', language: 'zh-CN', gender: 'male' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓贝（东北女声）', language: 'zh-CN', gender: 'female' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', name: '晓妮（陕西女声）', language: 'zh-CN', gender: 'female' },
  { id: 'zh-HK-HiuMaanNeural', name: '曉曼（粤语女声）', language: 'zh-HK', gender: 'female' },
  { id: 'zh-HK-WanLungNeural', name: '雲龍（粤语男声）', language: 'zh-HK', gender: 'male' },
  { id: 'zh-TW-HsiaoChenNeural', name: '曉臻（台湾女声）', language: 'zh-TW', gender: 'female' },
  { id: 'zh-TW-YunJheNeural', name: '雲哲（台湾男声）', language: 'zh-TW', gender: 'male' },
  // 英文
  { id: 'en-US-JennyNeural', name: 'Jenny (US Female)', language: 'en-US', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy (US Male)', language: 'en-US', gender: 'male' },
  { id: 'en-US-AriaNeural', name: 'Aria (US Female)', language: 'en-US', gender: 'female' },
  { id: 'en-US-DavisNeural', name: 'Davis (US Male)', language: 'en-US', gender: 'male' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK Female)', language: 'en-GB', gender: 'female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK Male)', language: 'en-GB', gender: 'male' },
  // 日文
  { id: 'ja-JP-NanamiNeural', name: '七海（日本語女声）', language: 'ja-JP', gender: 'female' },
  { id: 'ja-JP-KeitaNeural', name: '圭太（日本語男声）', language: 'ja-JP', gender: 'male' },
  // 韩文
  { id: 'ko-KR-SunHiNeural', name: '선히（한국어 여성）', language: 'ko-KR', gender: 'female' },
  { id: 'ko-KR-InJoonNeural', name: '인준（한국어 남성）', language: 'ko-KR', gender: 'male' },
]

/**
 * Edge TTS Provider 类
 *
 * 使用 Electron 的 WebSocket（或 Node.js ws 包）连接 Edge TTS 服务。
 * synthesize 方法返回合成的音频 Buffer（Base64 编码）。
 */
export class EdgeTtsProvider {
  private voice: string
  private rate: number
  private volume: number

  constructor(options?: { voice?: string; rate?: number; volume?: number }) {
    this.voice = options?.voice ?? 'zh-CN-XiaoxiaoNeural'
    this.rate = options?.rate ?? 1
    this.volume = options?.volume ?? 1
  }

  /** 获取可用音色列表 */
  listVoices(): TtsVoice[] {
    return EDGE_TTS_VOICES
  }

  /**
   * 合成语音。
   *
   * 需要在 Electron 主进程中调用，使用 WebSocket 连接 Edge TTS 服务。
   * 此方法返回 Promise<TtsSynthesizeResult>，音频以 Base64 编码。
   *
   * 注意：实际的 WebSocket 连接在运行时动态 import('ws')，
   * 避免在测试环境中加载 ws 包。
   */
  async synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult> {
    const text = params.text
    const voice = params.voice ?? this.voice
    const rate = params.rate ?? this.rate
    const volume = params.volume ?? this.volume
    const format = params.format ?? 'mp3'

    if (!text.trim()) {
      throw new Error('TTS 合成文本不能为空')
    }

    const ssml = buildSsml(text, voice, rate, volume)
    const url = buildEdgeTtsUrl()

    // 动态加载 ws 包，避免测试环境依赖
    const { WebSocket } = await import('ws')

    return new Promise<TtsSynthesizeResult>((resolve, reject) => {
      // 必须携带完整的请求头，否则微软返回 403
      const ws = new WebSocket(url, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'Sec-WebSocket-Version': '13',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      const audioChunks: Buffer[] = []
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          ws.close()
          reject(new Error('Edge TTS 合成超时（30s）'))
        }
      }, 30000)

      ws.on('open', () => {
        logger.info('[edge-tts] WebSocket 已连接，发送配置和 SSML 请求')

        // 发送配置消息
        const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`
        ws.send(configMsg)

        // 发送 SSML 请求
        const requestId = generateConnectionId()
        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}\r\n`
        ws.send(ssmlMsg)
      })

      ws.on('message', (data: Buffer | string, isBinary: boolean) => {
        // ws v8 回调签名: (data, isBinary)
        // 二进制消息: data 是 Buffer
        // 文本消息: data 是 string（需转为 Buffer）
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8')
        const parsed = isBinary ? parseEdgeTtsMessage(buf) : parseEdgeTtsTextMessage(buf)
        if (parsed.type === 'audio' && parsed.audio) {
          audioChunks.push(parsed.audio)
          logger.debug(`[edge-tts] 收到音频块: ${parsed.audio.length} bytes (累计 ${audioChunks.length} 块)`)
        } else if (parsed.type === 'end') {
          settled = true
          clearTimeout(timeout)
          ws.close()
          const audio = Buffer.concat(audioChunks)
          logger.info(`[edge-tts] 合成完成，共 ${audio.length} bytes 音频数据`)
          if (audio.length === 0) {
            reject(new Error('Edge TTS 未返回音频数据（可能文本过长或被过滤）'))
          } else {
            resolve({
              audioBase64: audio.toString('base64'),
              format,
            })
          }
        } else if (parsed.type === 'metadata') {
          logger.debug(`[edge-tts] 收到元数据消息`)
        }
      })

      ws.on('error', (err: Error) => {
        logger.error(`[edge-tts] WebSocket 错误: ${err.message}`, err)
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new Error(`Edge TTS 连接失败: ${err.message}`))
        }
      })

      ws.on('close', (code: number, reason: Buffer) => {
        logger.info(`[edge-tts] WebSocket 关闭 code=${code} reason=${reason.toString()}`)
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          if (audioChunks.length > 0) {
            const audio = Buffer.concat(audioChunks)
            resolve({
              audioBase64: audio.toString('base64'),
              format,
            })
          } else {
            reject(new Error(`Edge TTS 连接关闭但未收到音频数据 (code=${code})`))
          }
        }
      })
    })
  }
}
