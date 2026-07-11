import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from '../services/logger.service'
import { EdgeTtsProvider, EDGE_TTS_VOICES } from './edge-tts.provider'
import { OpenAITtsProvider, OPENAI_TTS_VOICES } from './openai-tts.provider'
import { DEFAULT_TTS_SETTINGS, isTtsProvider, isTtsMode, type TtsSettings, type TtsSynthesizeParams, type TtsSynthesizeResult, type TtsVoice } from '@shared/types/tts'

/**
 * TTS 工厂与统一入口
 *
 * 从设置数据库加载 TTS 配置，根据 provider 类型创建对应的 TTS 引擎实例。
 */

/** 从设置数据库加载 TTS 设置 */
export async function loadTtsSettings(): Promise<TtsSettings> {
  const get = <T>(key: string, defaultValue: T): T => {
    const val = settingsRepo.get(key)
    return (val ?? defaultValue) as T
  }

  const providerRaw = get<string>('tts.provider', DEFAULT_TTS_SETTINGS.provider)
  const modeRaw = get<string>('tts.mode', DEFAULT_TTS_SETTINGS.mode)

  return {
    enabled: get<boolean>('tts.enabled', DEFAULT_TTS_SETTINGS.enabled),
    provider: isTtsProvider(providerRaw) ? providerRaw : DEFAULT_TTS_SETTINGS.provider,
    mode: isTtsMode(modeRaw) ? modeRaw : DEFAULT_TTS_SETTINGS.mode,
    voice: get<string>('tts.voice', DEFAULT_TTS_SETTINGS.voice),
    rate: get<number>('tts.rate', DEFAULT_TTS_SETTINGS.rate),
    volume: get<number>('tts.volume', DEFAULT_TTS_SETTINGS.volume),
    apiKey: get<string>('tts.apiKey', DEFAULT_TTS_SETTINGS.apiKey),
    baseUrl: get<string>('tts.baseUrl', DEFAULT_TTS_SETTINGS.baseUrl),
    cloneVoiceId: get<string>('tts.cloneVoiceId', DEFAULT_TTS_SETTINGS.cloneVoiceId),
    format: get<'mp3' | 'wav'>('tts.format', DEFAULT_TTS_SETTINGS.format),
  }
}

/**
 * 合成语音。
 * 从设置数据库加载配置，创建对应 provider 实例，调用 synthesize。
 */
export async function synthesizeTts(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult> {
  const settings = await loadTtsSettings()

  if (!settings.enabled) {
    throw new Error('TTS 功能未启用，请在设置中开启')
  }

  logger.info(`[tts] 合成语音 provider=${settings.provider} text=${params.text.slice(0, 50)}...`)

  const provider = createTtsProvider(settings)
  return provider.synthesize(params)
}

/** 获取当前 provider 的可用音色列表 */
export async function getTtsVoices(): Promise<TtsVoice[]> {
  const settings = await loadTtsSettings()
  const provider = createTtsProvider(settings)
  return provider.listVoices()
}

/** 根据设置创建 TTS provider 实例 */
function createTtsProvider(settings: TtsSettings): TtsProviderInstance {
  switch (settings.provider) {
    case 'edge':
      return new EdgeTtsProvider({
        voice: settings.voice,
        rate: settings.rate,
        volume: settings.volume,
      })
    case 'openai':
    case 'custom':
      return new OpenAITtsProvider({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || 'https://api.openai.com',
        voice: settings.voice,
        rate: settings.rate,
        format: settings.format,
        cloneVoiceId: settings.cloneVoiceId,
      })
    default:
      throw new Error(`不支持的 TTS provider: ${settings.provider}`)
  }
}

/** TTS provider 实例接口（统一抽象） */
interface TtsProviderInstance {
  synthesize(params: TtsSynthesizeParams): Promise<TtsSynthesizeResult>
  listVoices(): TtsVoice[]
}
