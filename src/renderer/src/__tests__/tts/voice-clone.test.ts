// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFile } from 'fs/promises'
import {
  buildCloneRequestParams,
  parseCloneResponse,
} from '../../../../main/tts/voice-clone'

// Mock electron net
vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(),
  },
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

// Mock logger
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// Mock settings repo
vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: vi.fn((key: string) => {
    if (key === 'tts.apiKey') return 'test-api-key'
    if (key === 'tts.baseUrl') return 'https://api.example.com'
    return null
  }),
}))

import { net } from 'electron'
import { cloneVoice } from '../../../../main/tts/voice-clone'

describe('voice-clone — buildCloneRequestParams', () => {
  it('应构造包含音频和文本的 multipart 表单参数', () => {
    const audioBuffer = Buffer.from('fake-audio-data')
    const params = buildCloneRequestParams({
      audioBuffer,
      audioFilename: 'voice.wav',
      referenceText: '你好世界',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com',
    })

    expect(params.url).toBe('https://api.example.com/v1/audio/clone')
    expect(params.method).toBe('POST')
    expect(params.headers['Authorization']).toBe('Bearer sk-test')
    expect(params.body).toBeInstanceOf(FormData)
  })

  it('FormData 应包含 audio 和 reference_text 字段', () => {
    const audioBuffer = Buffer.from('fake-audio-data')
    const params = buildCloneRequestParams({
      audioBuffer,
      audioFilename: 'voice.mp3',
      referenceText: '这是参考文本',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com',
    })

    const formData = params.body as FormData
    expect(formData.get('reference_text')).toBe('这是参考文本')
    const audioFile = formData.get('audio') as File
    expect(audioFile).toBeTruthy()
    expect(audioFile.name).toBe('voice.mp3')
  })
})

describe('voice-clone — parseCloneResponse', () => {
  it('应从 JSON 响应中提取 voice_id', () => {
    const result = parseCloneResponse({ voice_id: 'cloned-voice-abc123' })
    expect(result.voiceId).toBe('cloned-voice-abc123')
    expect(result.success).toBe(true)
  })

  it('应支持 id 字段名', () => {
    const result = parseCloneResponse({ id: 'voice-xyz' })
    expect(result.voiceId).toBe('voice-xyz')
    expect(result.success).toBe(true)
  })

  it('缺少 voice_id 时返回失败', () => {
    const result = parseCloneResponse({ error: 'invalid audio' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('invalid audio')
  })

  it('null 响应返回失败', () => {
    const result = parseCloneResponse(null)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('voice-clone — cloneVoice', () => {
  beforeEach(() => {
    vi.mocked(net.fetch).mockReset()
    vi.mocked(readFile).mockReset()
  })

  it('应读取音频文件并上传到云端 API', async () => {
    const fakeAudio = Buffer.from('fake-audio-wav-data')
    vi.mocked(readFile).mockResolvedValue(fakeAudio)
    vi.mocked(net.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ voice_id: 'cloned-voice-001' }),
    } as Response)

    const result = await cloneVoice({
      audioPath: '/path/to/voice.wav',
      referenceText: '你好世界',
    })

    expect(result.success).toBe(true)
    expect(result.voiceId).toBe('cloned-voice-001')
    expect(readFile).toHaveBeenCalledWith('/path/to/voice.wav')
    expect(net.fetch).toHaveBeenCalled()
    const fetchArgs = vi.mocked(net.fetch).mock.calls[0]
    expect(fetchArgs[0]).toContain('/v1/audio/clone')
  })

  it('API 返回错误时应传递错误信息', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('audio'))
    vi.mocked(net.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response)

    const result = await cloneVoice({
      audioPath: '/path/to/voice.wav',
      referenceText: '你好',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('401')
  })

  it('文件读取失败应返回错误', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: file not found'))

    const result = await cloneVoice({
      audioPath: '/nonexistent.wav',
      referenceText: '你好',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('file not found')
  })

  it('空参考文本应返回验证错误', async () => {
    const result = await cloneVoice({
      audioPath: '/path/to/voice.wav',
      referenceText: '',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('参考文本')
  })

  it('空音频路径应返回验证错误', async () => {
    const result = await cloneVoice({
      audioPath: '',
      referenceText: '你好',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('音频')
  })
})
