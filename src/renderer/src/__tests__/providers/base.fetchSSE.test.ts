import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatParams, ProviderConfig } from '@shared/types/model'

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

/**
 * 创建一个永不自行关闭的 SSE 流（模拟服务端持续推送）。
 * 流只在 reader.cancel() 或 controller.error()/close() 被调用时结束。
 */
function createNeverClosingSSEResponse(): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // 推送一条初始数据
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' } }] })}\n\n`),
      )
      // 不 close — 模拟服务端持续推送
    },
  })
  return { ok: true, status: 200, body: stream } as Response
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

describe('BaseProvider fetchSSE — abort 信号响应', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('abort 信号触发后，流式读取应在 500ms 内停止', async () => {
    mockFetch.mockResolvedValueOnce(createNeverClosingSSEResponse())

    const provider = new OpenAIProvider(testConfig)
    const abortController = new AbortController()

    const params: ChatParams = {
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      signal: abortController.signal,
    }

    const chunks: string[] = []
    const iter = provider.chat(params)

    // 读取第一个 chunk
    const first = await iter.next()
    if (first.value?.content) chunks.push(first.value.content)

    // 触发 abort（模拟用户点击停止生成）
    abortController.abort()

    // 生成器必须在 500ms 内结束（返回 done 或抛出错误）
    // 如果卡住超过 500ms，说明 abort 信号未被正确处理
    let completed = false
    const completionPromise = (async () => {
      try {
        for await (const chunk of iter) {
          if (chunk.content) chunks.push(chunk.content)
        }
      } catch {
        // 抛出错误也算停止
      }
      completed = true
    })()

    const result = await Promise.race([
      completionPromise.then(() => 'completed'),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ])

    expect(result).toBe('completed')
    expect(completed).toBe(true)
    // 至少收到了第一个 chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  }, 5000)
})
