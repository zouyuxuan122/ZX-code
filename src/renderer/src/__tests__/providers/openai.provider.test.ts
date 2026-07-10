import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatChunk, ProviderConfig } from '@shared/types/model'

// Mock electron 模块（BaseProvider 依赖 net.fetch）
const mockFetch = vi.fn()
vi.mock('electron', () => ({
  net: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}))

// Mock logger
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { OpenAIProvider } from '../../../../main/providers/openai.provider'

/** 创建模拟 SSE Response */
function createMockSSEResponse(dataLines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const line of dataLines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`))
      }
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    body: stream,
  } as Response
}

const testConfig: ProviderConfig = {
  id: 'test',
  name: 'test-provider',
  type: 'openai',
  base_url: 'https://api.deepseek.com',
  api_key: 'sk-test',
  enabled: true,
  created_at: 0,
  updated_at: 0,
}

describe('OpenAIProvider — reasoning_content 解析', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('收到 reasoning_content 时应 yield 出来', async () => {
    const sseData = [
      JSON.stringify({ choices: [{ delta: { reasoning_content: '正在思考搜索结果...' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '这是回复内容' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ]
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(sseData))

    const provider = new OpenAIProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({ model: 'deepseek-chat', messages: [], stream: true })) {
      chunks.push(chunk)
    }

    const reasoningChunks = chunks.filter((c) => 'reasoning_content' in c && c.reasoning_content)
    expect(reasoningChunks.length).toBe(1)
    expect(reasoningChunks[0].reasoning_content).toBe('正在思考搜索结果...')
  })

  it('流中只有 reasoning_content 时不抛"未返回内容"异常', async () => {
    // 模拟 DeepSeek API 联网搜索后只返回 reasoning_content 无 content 的场景
    const sseData = [
      JSON.stringify({ choices: [{ delta: { reasoning_content: '我在分析搜索结果...' } }] }),
      '[DONE]',
    ]
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(sseData))

    const provider = new OpenAIProvider(testConfig)
    const chunks: ChatChunk[] = []

    // 不应抛出"模型未返回内容"异常
    for await (const chunk of provider.chat({ model: 'deepseek-v4-flash', messages: [], stream: true })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(0)
  })

  it('同时有 reasoning_content 和 content 时两者都被 yield', async () => {
    const sseData = [
      JSON.stringify({ choices: [{ delta: { reasoning_content: '思考过程片段1' } }] }),
      JSON.stringify({ choices: [{ delta: { reasoning_content: '思考过程片段2' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '回复' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '内容' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ]
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(sseData))

    const provider = new OpenAIProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({ model: 'deepseek-chat', messages: [], stream: true })) {
      chunks.push(chunk)
    }

    const reasoningContent = chunks
      .filter((c) => 'reasoning_content' in c && c.reasoning_content)
      .map((c) => c.reasoning_content)
      .join('')
    const content = chunks
      .filter((c) => 'content' in c && c.content)
      .map((c) => c.content)
      .join('')

    expect(reasoningContent).toBe('思考过程片段1思考过程片段2')
    expect(content).toBe('回复内容')
  })
})
