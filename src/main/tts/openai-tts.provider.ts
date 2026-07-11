import { net } from 'electron'
import type { TtsSynthesizeParams, TtsSynthesizeResult, TtsVoice } from '@shared/types/tts'

/**
 * OpenAI 兼容 TTS Provider
 *
 * 调用 OpenAI /v1/audio/speech 端点（或兼容的第三方端点）合成语音。
 * 支持声音克隆（通过 cloneVoiceId 传递 fine-tuned voice ID）。
 *
 * 兼容端点示例：
 * - OpenAI 官方: https://api.openai.com/v1/audio/speech
 * - Azure OpenAI: https://{resource}.openai.azure.com/.../audio/speech
 * - 鱼云/MiniMax 等第三方兼容端点
 */

/** buildOpenAITtsBody 的参数 */
export interface BuildBodyParams {
  text: string
  voice: string
  model: string
  format: 'mp3' | 'wav'
  rate: number
  cloneVoiceId?: string
}

/**
 * 构造 OpenAI TTS API 请求 body。
 * 如果提供了 cloneVoiceId，使用克隆音色 ID 覆盖 voice。
 */
export function buildOpenAITtsBody(params: BuildBodyParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    voice: params.cloneVoiceId || params.voice,
    input: params.text,
    response_format: params.format,
  }
  // OpenAI TTS speed 范围 0.25 ~ 4.0，默认 1.0
  if (params.rate !== 1) {
    body.speed = params.rate
  }
  return body
}

/** OpenAI 标准 TTS 音色 */
export const OPENAI_TTS_VOICES: TtsVoice[] = [
  { id: 'alloy', name: 'Alloy (中性)', language: 'en-US', gender: 'neutral' },
  { id: 'echo', name: 'Echo (男声)', language: 'en-US', gender: 'male' },
  { id: 'fable', name: 'Fable (中性)', language: 'en-US', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx (男声)', language: 'en-US', gender: 'male' },
  { id: 'nova', name: 'Nova (女声)', language: 'en-US', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer (女声)', language: 'en-US', gender: 'female' },
]

/** OpenAI TTS Provider 配置 */
export interface OpenAITtsProviderConfig {
  apiKey: string
  baseUrl: string
  model?: string
  voice?: string
  rate?: number
  format?: 'mp3' | 'wav'
  cloneVoiceId?: string
}

/**
 * OpenAI 兼容 TTS Provider
 */
export class OpenAITtsProvider {
  private apiKey: string
  private baseUrl: string
  private model: string
  private voice: string
  private rate: number
  private format: 'mp3' | 'wav'
  private cloneVoiceId: string

  constructor(config: OpenAITtsProviderConfig) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.model = config.model ?? 'tts-1'
    this.voice = config.voice ?? 'alloy'
    this.rate = config.rate ?? 1
    this.format = config.format ?? 'mp3'
    this.cloneVoiceId = config.cloneVoiceId ?? ''
  }

  /** 获取可用音色列表 */
  listVoices(): TtsVoice[] {
    return OPENAI_TTS_VOICES
  }

  /**
   * 合成语音。
   * 调用 POST /v1/audio/speech，返回音频二进制。
   */
  async synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI TTS 需要 api_key')
    }
    if (!params.text.trim()) {
      throw new Error('TTS 合成文本不能为空')
    }

    const format = params.format ?? this.format
    const voice = params.voice ?? this.voice
    const rate = params.rate ?? this.rate
    const cloneVoiceId = params.cloneVoiceId || this.cloneVoiceId || undefined

    const body = buildOpenAITtsBody({
      text: params.text,
      voice,
      model: this.model,
      format,
      rate,
      cloneVoiceId,
    })

    const url = `${this.baseUrl}/v1/audio/speech`
    const response = await net.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI TTS 请求失败 HTTP ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const audio = Buffer.from(arrayBuffer)

    return {
      audioBase64: audio.toString('base64'),
      format,
    }
  }
}
