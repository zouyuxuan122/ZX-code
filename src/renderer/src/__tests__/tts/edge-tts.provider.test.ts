// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import {
  buildEdgeTtsUrl,
  buildSsml,
  parseEdgeTtsMessage,
  parseEdgeTtsTextMessage,
  EDGE_TTS_VOICES,
  generateSecMsGec,
} from '../../../../main/tts/edge-tts.provider'

describe('Edge TTS — generateSecMsGec', () => {
  it('应返回 64 字符的大写 hex 字符串（SHA256）', () => {
    const token = generateSecMsGec()
    expect(token).toMatch(/^[0-9A-F]{64}$/)
  })

  it('同一 5 分钟窗口内应返回相同值', () => {
    const now = 1736000000
    const t1 = generateSecMsGec(now)
    const t2 = generateSecMsGec(now + 60)
    expect(t1).toBe(t2)
  })

  it('不同 5 分钟窗口应返回不同值', () => {
    const now = 1736000000
    const t1 = generateSecMsGec(now)
    const t2 = generateSecMsGec(now + 400)
    expect(t1).not.toBe(t2)
  })

  it('应使用 Windows file time 纪元和 100 纳秒间隔', () => {
    // 固定时间戳验证确定性
    const now = 1736000000
    const token = generateSecMsGec(now)
    // 手动计算：
    // ticks = 1736000000 + 11644473600 = 13380473600
    // ticks -= ticks % 300 → 13380473400
    // ticks *= 1e7 → 133804734000000000
    // str = "1338047340000000006A5AA1D4EAFF4E9FB37E23D68491D6F4"
    // sha256(str).toUpperCase()
    const expectedTicks = (13380473600 - (13380473600 % 300)) * 1e7
    const expectedStr = `${expectedTicks}6A5AA1D4EAFF4E9FB37E23D68491D6F4`
    const expected = createHash('sha256').update(expectedStr, 'ascii').digest('hex').toUpperCase()
    expect(token).toBe(expected)
  })
})

describe('Edge TTS — buildEdgeTtsUrl', () => {
  it('应构造合法的 WebSocket URL', () => {
    const url = buildEdgeTtsUrl()
    expect(url).toContain('wss://')
    expect(url).toContain('speech.platform.bing.com')
    expect(url).toContain('TrustedClientToken')
    expect(url).toContain('ConnectionId')
  })

  it('URL 应包含 Sec-MS-GEC 认证 token', () => {
    const url = buildEdgeTtsUrl()
    expect(url).toContain('Sec-MS-GEC=')
  })

  it('URL 应包含 Sec-MS-GEC-Version', () => {
    const url = buildEdgeTtsUrl()
    expect(url).toContain('Sec-MS-GEC-Version=')
  })

  it('每次调用 ConnectionId 应不同（UUID）', () => {
    const url1 = buildEdgeTtsUrl()
    const url2 = buildEdgeTtsUrl()
    expect(url1).not.toBe(url2)
  })
})

describe('Edge TTS — buildSsml', () => {
  it('应构造包含文本和音色的 SSML', () => {
    const ssml = buildSsml('你好世界', 'zh-CN-XiaoxiaoNeural', 1, 1)
    expect(ssml).toContain('<speak')
    expect(ssml).toContain('你好世界')
    expect(ssml).toContain('zh-CN-XiaoxiaoNeural')
    expect(ssml).toContain('rate=')
    expect(ssml).toContain('volume=')
  })

  it('语速 2.0 应反映为 +100% rate', () => {
    const ssml = buildSsml('test', 'en-US-JennyNeural', 2, 1)
    expect(ssml).toContain('+100%')
  })

  it('语速 0.5 应反映为 -50% rate', () => {
    const ssml = buildSsml('test', 'en-US-JennyNeural', 0.5, 1)
    expect(ssml).toContain('-50%')
  })

  it('音量 0.5 应反映为 -50% volume', () => {
    const ssml = buildSsml('test', 'en-US-JennyNeural', 1, 0.5)
    expect(ssml).toContain('-50%')
  })
})

describe('Edge TTS — parseEdgeTtsTextMessage', () => {
  it('空消息应返回 unknown', () => {
    const msg = Buffer.alloc(0)
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('unknown')
  })

  it('Path:turn.end 文本消息应返回 end', () => {
    const msg = Buffer.from('Path:turn.end\r\n')
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('end')
  })

  it('Path:audio.metadata 文本消息应返回 metadata', () => {
    const msg = Buffer.from('Path:audio.metadata\r\nContent-Type:application/json\r\n\r\n{"Metadata":[]}')
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('metadata')
  })

  it('Path:response 文本消息应返回 metadata（非 audio/end 的已知路径）', () => {
    const msg = Buffer.from('Path:response\r\n')
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('metadata')
  })

  it('Path:turn.start 文本消息应返回 metadata', () => {
    const msg = Buffer.from('Path:turn.start\r\n')
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('metadata')
  })

  it('未知 Path 应返回 unknown', () => {
    const msg = Buffer.from('Path:unknown.path\r\n')
    const result = parseEdgeTtsTextMessage(msg)
    expect(result.type).toBe('unknown')
  })
})

describe('Edge TTS — parseEdgeTtsMessage (binary)', () => {
  it('空消息应返回 unknown', () => {
    const msg = Buffer.alloc(0)
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('unknown')
  })

  it('二进制消息 Path:audio 应正确提取音频（headerLength 含 \\r\\n，无额外分隔符）', () => {
    // 参考 edge-tts Python _get_headers_and_data:
    //   headers_length = message[:2]  (大端 uint16)
    //   headers = message[2 : headers_length + 2]
    //   data = message[headers_length + 2 :]
    //
    // 原始消息格式（\r\n 包含在 headerLength 中，无额外分隔符）:
    //   [2字节 header_length][header_length 字节 headers(含\r\n)][payload]
    //
    // 注意：headerLength 是 headers 区域的总长度（包含尾部的 \r\n），
    // payload 紧接在 headers 区域之后，不需要额外跳过 2 字节。
    const headerStr = 'Path:audio\r\nContent-Type:audio/mpeg\r\n'
    const headerBytes = Buffer.from(headerStr, 'utf-8')
    const audioData = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x01, 0x02])
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeInt16BE(headerBytes.length, 0)
    const msg = Buffer.concat([
      lenBuf,                 // 2字节 header length（含 \r\n）
      headerBytes,            // headers（含尾部 \r\n）
      audioData,              // 音频数据（紧接 headers 之后）
    ])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('audio')
    expect(result.audio).toEqual(audioData)
  })

  it('二进制消息 header 较长时也能正确提取音频', () => {
    const headerStr = 'Path:audio\r\nContent-Type:audio/mpeg\r\nX-RequestId:abc12345\r\nX-Timestamp:2025-01-01\r\n'
    const headerBytes = Buffer.from(headerStr, 'utf-8')
    const audioData = Buffer.from([0x49, 0x44, 0x33, 0x03]) // ID3 tag
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeInt16BE(headerBytes.length, 0)
    const msg = Buffer.concat([
      lenBuf,
      headerBytes,
      audioData,
    ])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('audio')
    expect(result.audio).toEqual(audioData)
  })

  it('第一个音频块的 MP3 同步字应完整保留（0xFF 0xFB）', () => {
    // 验证：解析后的音频数据应以 MP3 同步字开头
    // 如果 audioStart 多了 +2，同步字的头 2 字节会被截断
    const headerStr = 'Path:audio\r\nContent-Type:audio/mpeg\r\n'
    const headerBytes = Buffer.from(headerStr, 'utf-8')
    // MP3 帧头：FF FB = MPEG-1 Layer 3, 128kbps
    const mp3Frame = Buffer.from([0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x01, 0x02])
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeInt16BE(headerBytes.length, 0)
    const msg = Buffer.concat([lenBuf, headerBytes, mp3Frame])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('audio')
    expect(result.audio![0]).toBe(0xFF)
    expect(result.audio![1]).toBe(0xFB)
  })

  it('二进制消息过短（<2字节）应返回 unknown', () => {
    const msg = Buffer.from([0x00])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('unknown')
  })

  it('二进制消息 header length 超出消息长度应返回 unknown', () => {
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeInt16BE(999, 0) // 远超消息长度
    const msg = Buffer.concat([lenBuf, Buffer.from('short')])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('unknown')
  })

  it('二进制消息 Path 非 audio 时应返回 metadata', () => {
    const headerStr = 'Path:audio.metadata\r\nContent-Type:application/json\r\n'
    const headerBytes = Buffer.from(headerStr, 'utf-8')
    const jsonData = Buffer.from('{"Metadata":[]}')
    const lenBuf = Buffer.alloc(2)
    lenBuf.writeInt16BE(headerBytes.length, 0)
    const msg = Buffer.concat([
      lenBuf,
      headerBytes,
      jsonData,
    ])
    const result = parseEdgeTtsMessage(msg)
    expect(result.type).toBe('metadata')
  })
})

describe('Edge TTS — EDGE_TTS_VOICES', () => {
  it('应包含中文音色', () => {
    const zhVoices = EDGE_TTS_VOICES.filter((v) => v.language.startsWith('zh'))
    expect(zhVoices.length).toBeGreaterThan(0)
    const xiaoxiao = zhVoices.find((v) => v.id === 'zh-CN-XiaoxiaoNeural')
    expect(xiaoxiao).toBeDefined()
    expect(xiaoxiao!.gender).toBe('female')
  })

  it('应包含英文音色', () => {
    const enVoices = EDGE_TTS_VOICES.filter((v) => v.language.startsWith('en'))
    expect(enVoices.length).toBeGreaterThan(0)
  })

  it('每个音色应有 id/name/language/gender', () => {
    for (const voice of EDGE_TTS_VOICES) {
      expect(voice.id).toBeTruthy()
      expect(voice.name).toBeTruthy()
      expect(voice.language).toBeTruthy()
      expect(['male', 'female', 'neutral']).toContain(voice.gender)
    }
  })
})
