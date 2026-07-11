import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TTS_SETTINGS,
  isTtsProvider,
  isTtsMode,
  type TtsSettings,
  type TtsProviderType,
  type TtsMode,
} from '../../../../shared/types/tts'

describe('TTS 类型定义', () => {
  it('DEFAULT_TTS_SETTINGS 应包含合理的默认值', () => {
    expect(DEFAULT_TTS_SETTINGS.enabled).toBe(false)
    expect(DEFAULT_TTS_SETTINGS.provider).toBe('edge')
    expect(DEFAULT_TTS_SETTINGS.mode).toBe('manual')
    expect(DEFAULT_TTS_SETTINGS.voice).toBe('zh-CN-XiaoxiaoNeural')
    expect(DEFAULT_TTS_SETTINGS.rate).toBe(1)
    expect(DEFAULT_TTS_SETTINGS.volume).toBe(1)
  })

  it('isTtsProvider 应正确识别合法 provider 类型', () => {
    expect(isTtsProvider('edge')).toBe(true)
    expect(isTtsProvider('openai')).toBe(true)
    expect(isTtsProvider('custom')).toBe(true)
    expect(isTtsProvider('invalid')).toBe(false)
    expect(isTtsProvider('')).toBe(false)
  })

  it('isTtsMode 应正确识别合法模式', () => {
    expect(isTtsMode('auto')).toBe(true)
    expect(isTtsMode('manual')).toBe(true)
    expect(isTtsMode('invalid')).toBe(false)
  })

  it('TtsSettings 类型应包含声音克隆字段', () => {
    const settings: TtsSettings = {
      ...DEFAULT_TTS_SETTINGS,
      cloneVoiceId: 'voice-abc-123',
    }
    expect(settings.cloneVoiceId).toBe('voice-abc-123')
  })
})
