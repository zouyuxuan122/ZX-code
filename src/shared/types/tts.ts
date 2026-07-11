/**
 * TTS（文本转语音）类型定义
 */

/** TTS 引擎类型 */
export type TtsProviderType = 'edge' | 'openai' | 'custom'

/** 朗读模式：auto=自动朗读 AI 回复，manual=点击按钮手动朗读 */
export type TtsMode = 'auto' | 'manual'

/** TTS 设置 */
export interface TtsSettings {
  /** 是否启用 TTS */
  enabled: boolean
  /** TTS 引擎 */
  provider: TtsProviderType
  /** 朗读模式 */
  mode: TtsMode
  /** 音色 ID（edge 使用 Neural 音色名，openai 使用 voice 名） */
  voice: string
  /** 语速（0.5 ~ 2.0，1.0 为正常速度） */
  rate: number
  /** 音量（0.0 ~ 1.0） */
  volume: number
  /** 云端 API key（openai/custom 引擎使用） */
  apiKey: string
  /** 自定义 API base URL（openai 兼容端点） */
  baseUrl: string
  /** 声音克隆的 voice ID（云端引擎支持） */
  cloneVoiceId: string
  /** 音频格式 */
  format: 'mp3' | 'wav'
}

/** 默认 TTS 设置 */
export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  enabled: false,
  provider: 'edge',
  mode: 'manual',
  voice: 'zh-CN-XiaoxiaoNeural',
  rate: 1,
  volume: 1,
  apiKey: '',
  baseUrl: '',
  cloneVoiceId: '',
  format: 'mp3',
}

const VALID_PROVIDERS: TtsProviderType[] = ['edge', 'openai', 'custom']
const VALID_MODES: TtsMode[] = ['auto', 'manual']

/** 判断字符串是否为合法的 TTS provider 类型 */
export function isTtsProvider(value: string): value is TtsProviderType {
  return (VALID_PROVIDERS as string[]).includes(value)
}

/** 判断字符串是否为合法的 TTS 模式 */
export function isTtsMode(value: string): value is TtsMode {
  return (VALID_MODES as string[]).includes(value)
}

/** TTS 合成参数 */
export interface TtsSynthesizeParams {
  /** 要合成的文本 */
  text: string
  /** 音色 ID（覆盖设置中的 voice） */
  voice?: string
  /** 语速（覆盖设置中的 rate） */
  rate?: number
  /** 音量（覆盖设置中的 volume） */
  volume?: number
  /** 音频格式 */
  format?: 'mp3' | 'wav'
  /** 声音克隆的 voice ID（覆盖设置中的 cloneVoiceId） */
  cloneVoiceId?: string
}

/** TTS 合成结果 */
export interface TtsSynthesizeResult {
  /** 音频数据（Base64 编码） */
  audioBase64: string
  /** 音频格式 */
  format: 'mp3' | 'wav'
  /** 音频时长（毫秒，可选） */
  duration?: number
}

/** TTS 音色信息 */
export interface TtsVoice {
  /** 音色 ID */
  id: string
  /** 显示名称 */
  name: string
  /** 语言代码（如 zh-CN, en-US） */
  language: string
  /** 性别 */
  gender: 'male' | 'female' | 'neutral'
  /** 是否支持声音克隆 */
  cloneable?: boolean
}
