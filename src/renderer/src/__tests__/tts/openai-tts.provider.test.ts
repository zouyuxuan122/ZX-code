// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TtsSynthesizeResult } from '../../../../shared/types/tts'

// Mock electron（BaseTtsProvider 可能依赖 net.fetch）
const mockFetch = vi.fn()
vi.mock('electron', () => ({
  net: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}))

// Mock logger
vi.mock('../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { OpenAITtsProvider, buildOpenAITtsBody, OPENAI_TTS_VOICES } from '../../../../main/tts/openai-tts.provider'

describe('OpenAI TTS — buildOpenAITtsBody', () => {
  it('应构造标准 OpenAI TTS 请求 body', () => {
    const body = buildOpenAITtsBody({
      text: '你好',
      voice: 'alloy',
      model: 'tts-1',
      format: 'mp3',
      rate: 1,
    })
    expect(body.model).toBe('tts-1')
    expect(body.voice).toBe('alloy')
    expect(body.input).toBe('你好')
    expect(body.response_format).toBe('mp3')
  })

  it('有 cloneVoiceId 时应使用克隆音色', () => {
    const body = buildOpenAITtsBody({
      text: 'test',
      voice: 'alloy',
      model: 'tts-1',
      format: 'mp3',
      rate: 1,
      cloneVoiceId: 'clone-voice-123',
    })
    expect(body.voice).toBe('clone-voice-123')
  })

  it('语速应通过 speed 字段传递', () => {
    const body = buildOpenAITtsBody({
      text: 'test',
      voice: 'alloy',
      model: 'tts-1',
      format: 'mp3',
      rate: 1.5,
    })
    expect(body.speed).toBe(1.5)
  })
})

describe('OpenAI TTS — OPENAI_TTS_VOICES', () => {
  it('应包含标准 OpenAI 音色', () => {
    const alloy = OPENAI_TTS_VOICES.find((v) => v.id === 'alloy')
    expect(alloy).toBeDefined()
    expect(alloy!.name).toBeTruthy()
  })

  it('标准音色不应标记为 cloneable', () => {
    for (const voice of OPENAI_TTS_VOICES) {
      expect(voice.cloneable).toBeFalsy()
    }
  })
})

describe('OpenAI TTS Provider — synthesize', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应调用 /v1/audio/speech 端点并返回 Base64 音频', async () => {
    const fakeAudio = Buffer.from([0xFF, 0xFB, 0x90, 0x00]) // MP3 帧头
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeAudio.buffer.slice(fakeAudio.byteOffset, fakeAudio.byteOffset + fakeAudio.byteLength),
    })

    const provider = new OpenAITtsProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
    })

    const result: TtsSynthesizeResult = await provider.synthesize({
      text: '你好世界',
      voice: 'alloy',
      format: 'mp3',
    })

    expect(result.audioBase64).toBe(fakeAudio.toString('base64'))
    expect(result.format).toBe('mp3')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/audio/speech')
    expect(options.method).toBe('POST')
    expect(options.headers['Authorization']).toBe('Bearer sk-test')
  })

  it('HTTP 错误时应抛出带状态码的异常', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })

    const provider = new OpenAITtsProvider({
      apiKey: 'invalid-key',
      baseUrl: 'https://api.openai.com',
    })

    await expect(
      provider.synthesize({ text: 'test', voice: 'alloy' }),
    ).rejects.toThrow('401')
  })

  it('无 apiKey 时应抛出异常', async () => {
    const provider = new OpenAITtsProvider({
      apiKey: '',
      baseUrl: 'https://api.openai.com',
    })

    await expect(
      provider.synthesize({ text: 'test', voice: 'alloy' }),
    ).rejects.toThrow('api_key')
  })

  it('空文本时应抛出异常', async () => {
    const provider = new OpenAITtsProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
    })

    await expect(
      provider.synthesize({ text: '', voice: 'alloy' }),
    ).rejects.toThrow('空')
  })

  it('cloneVoiceId 应传递到请求 body', async () => {
    const fakeAudio = Buffer.from([0x52, 0x49, 0x46, 0x46]) // WAV 帧头
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeAudio.buffer.slice(fakeAudio.byteOffset, fakeAudio.byteOffset + fakeAudio.byteLength),
    })

    const provider = new OpenAITtsProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
    })

    await provider.synthesize({
      text: '克隆测试',
      voice: 'alloy',
      cloneVoiceId: 'ft-voice-abc',
      format: 'wav',
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.voice).toBe('ft-voice-abc')
  })
})
