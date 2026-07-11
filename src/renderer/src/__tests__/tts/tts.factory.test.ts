// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TtsSettings } from '../../../../shared/types/tts'

// Mock electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  net: { fetch: vi.fn() },
}))

// Mock logger
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock settingsRepo
const mockSettingsGet = vi.fn()
vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: (...args: unknown[]) => mockSettingsGet(...args),
}))

// Mock edge-tts provider
vi.mock('../../../../main/tts/edge-tts.provider', () => ({
  EdgeTtsProvider: vi.fn().mockImplementation(function() {
    return {
      synthesize: vi.fn().mockResolvedValue({ audioBase64: 'edge-audio', format: 'mp3' }),
      listVoices: vi.fn(() => []),
    }
  }),
}))

// Mock openai-tts provider
vi.mock('../../../../main/tts/openai-tts.provider', () => ({
  OpenAITtsProvider: vi.fn().mockImplementation(function() {
    return {
      synthesize: vi.fn().mockResolvedValue({ audioBase64: 'openai-audio', format: 'mp3' }),
      listVoices: vi.fn(() => []),
    }
  }),
  OPENAI_TTS_VOICES: [],
}))

import { synthesizeTts, getTtsVoices, loadTtsSettings } from '../../../../main/tts/index'

const defaultSettings: TtsSettings = {
  enabled: true,
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

describe('TTS 工厂 — loadTtsSettings', () => {
  beforeEach(() => {
    mockSettingsGet.mockReset()
  })

  it('应从设置数据库加载 TTS 设置', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      const map: Record<string, unknown> = {
        'tts.enabled': true,
        'tts.provider': 'edge',
        'tts.mode': 'manual',
        'tts.voice': 'zh-CN-XiaoxiaoNeural',
        'tts.rate': 1,
        'tts.volume': 1,
        'tts.apiKey': '',
        'tts.baseUrl': '',
        'tts.cloneVoiceId': '',
        'tts.format': 'mp3',
      }
      return map[key] ?? null
    })

    const settings = await loadTtsSettings()
    expect(settings.enabled).toBe(true)
    expect(settings.provider).toBe('edge')
    expect(settings.voice).toBe('zh-CN-XiaoxiaoNeural')
  })

  it('设置不存在时应返回默认值', async () => {
    mockSettingsGet.mockReturnValue(null)

    const settings = await loadTtsSettings()
    expect(settings.enabled).toBe(false)
    expect(settings.provider).toBe('edge')
  })
})

describe('TTS 工厂 — synthesizeTts', () => {
  beforeEach(() => {
    mockSettingsGet.mockReset()
  })

  it('enabled=false 时应抛出异常', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'tts.enabled') return false
      return null
    })

    await expect(
      synthesizeTts({ text: '测试' }),
    ).rejects.toThrow('未启用')
  })

  it('provider=edge 时应使用 EdgeTtsProvider', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      const map: Record<string, unknown> = {
        'tts.enabled': true,
        'tts.provider': 'edge',
        'tts.voice': 'zh-CN-XiaoxiaoNeural',
        'tts.rate': 1,
        'tts.volume': 1,
        'tts.format': 'mp3',
      }
      return map[key] ?? null
    })

    const result = await synthesizeTts({ text: '你好' })
    expect(result.audioBase64).toBe('edge-audio')
  })

  it('provider=openai 时应使用 OpenAITtsProvider', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      const map: Record<string, unknown> = {
        'tts.enabled': true,
        'tts.provider': 'openai',
        'tts.voice': 'alloy',
        'tts.apiKey': 'sk-test',
        'tts.baseUrl': 'https://api.openai.com',
        'tts.rate': 1,
        'tts.volume': 1,
        'tts.format': 'mp3',
      }
      return map[key] ?? null
    })

    const result = await synthesizeTts({ text: 'hello' })
    expect(result.audioBase64).toBe('openai-audio')
  })
})

describe('TTS 工厂 — getTtsVoices', () => {
  beforeEach(() => {
    mockSettingsGet.mockReset()
  })

  it('provider=edge 时应返回 Edge 音色列表', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'tts.provider') return 'edge'
      return null
    })

    const voices = await getTtsVoices()
    expect(Array.isArray(voices)).toBe(true)
  })
})
