import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatChunk, ProviderConfig } from '@shared/types/model'
import type { ToolDefinition } from '@shared/types/tool'

// Mock electron
const mockFetch = vi.fn()
vi.mock('electron', () => ({
  net: {
    fetch: (...args: unknown[]) => mockFetch(...args),
  },
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { GeminiProvider } from '../../../../main/providers/gemini.provider'

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
  return { ok: true, status: 200, body: stream } as Response
}

function createMockJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response
}

const testConfig: ProviderConfig = {
  id: 'test',
  name: 'test-gemini',
  type: 'gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'AIza-test',
  enabled: true,
  created_at: 0,
  updated_at: 0,
}

const testTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
]

describe('GeminiProvider — tool_calls 支持', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('非流式响应中 functionCall 被 yield 为 tool_calls', async () => {
    const responseData = {
      candidates: [{
        content: {
          parts: [
            { text: '让我读取文件' },
            { functionCall: { name: 'read_file', args: { path: 'a.txt' } } },
          ],
        },
        finishReason: 'STOP',
      }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
    }
    mockFetch.mockResolvedValueOnce(createMockJsonResponse(responseData))

    const provider = new GeminiProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({
      model: 'gemini-2.0-flash',
      messages: [],
      stream: false,
      tools: testTools,
    })) {
      chunks.push(chunk)
    }

    // 应有 content chunk
    const contentChunks = chunks.filter((c) => c.content)
    expect(contentChunks.length).toBe(1)
    expect(contentChunks[0].content).toBe('让我读取文件')

    // 应有 tool_calls chunk
    const toolCallChunks = chunks.filter((c) => c.tool_calls && c.tool_calls.length > 0)
    expect(toolCallChunks.length).toBe(1)
    expect(toolCallChunks[0].tool_calls![0].function.name).toBe('read_file')
    expect(toolCallChunks[0].tool_calls![0].function.arguments).toBe(JSON.stringify({ path: 'a.txt' }))

    // finish_reason 应为 tool_calls（有 functionCall 时）
    const finishChunks = chunks.filter((c) => c.finish_reason)
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0].finish_reason).toBe('tool_calls')
  })

  it('流式响应中 functionCall 被正确解析为 tool_calls', async () => {
    const sseData = [
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: '让我读取文件' }] },
        }],
      }),
      JSON.stringify({
        candidates: [{
          content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'a.txt' } } }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      }),
    ]
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(sseData))

    const provider = new GeminiProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({
      model: 'gemini-2.0-flash',
      messages: [],
      stream: true,
      tools: testTools,
    })) {
      chunks.push(chunk)
    }

    // 文本内容
    const contentChunks = chunks.filter((c) => c.content)
    expect(contentChunks.map((c) => c.content).join('')).toBe('让我读取文件')

    // tool_calls
    const toolCallChunks = chunks.filter((c) => c.tool_calls && c.tool_calls.length > 0)
    expect(toolCallChunks.length).toBe(1)
    expect(toolCallChunks[0].tool_calls![0].function.name).toBe('read_file')
    expect(toolCallChunks[0].tool_calls![0].function.arguments).toBe(JSON.stringify({ path: 'a.txt' }))

    // finish_reason 应为 tool_calls
    const finishChunks = chunks.filter((c) => c.finish_reason)
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0].finish_reason).toBe('tool_calls')
  })

  it('请求 body 中 tools 被转换为 Gemini functionDeclarations 格式', async () => {
    let capturedBody: Record<string, unknown> | undefined
    mockFetch.mockImplementationOnce(async (_url: string, options: RequestInit) => {
      capturedBody = JSON.parse(options.body as string)
      return createMockJsonResponse({
        candidates: [{
          content: { parts: [{ text: 'ok' }] },
          finishReason: 'STOP',
        }],
      })
    })

    const provider = new GeminiProvider(testConfig)
    for await (const _ of provider.chat({
      model: 'gemini-2.0-flash',
      messages: [],
      stream: false,
      tools: testTools,
    })) {
      // 消费生成器
    }

    expect(capturedBody).toBeDefined()
    expect(capturedBody!.tools).toBeDefined()
    const tools = capturedBody!.tools as Array<Record<string, unknown>>
    expect(tools.length).toBe(1)
    const funcDecls = tools[0].functionDeclarations as Array<Record<string, unknown>>
    expect(funcDecls.length).toBe(1)
    expect(funcDecls[0].name).toBe('read_file')
    expect(funcDecls[0].description).toBe('读取文件内容')
    expect(funcDecls[0].parameters).toBeDefined()
    // Gemini 格式不应有 'function' 嵌套
    expect(funcDecls[0].function).toBeUndefined()
  })
})
