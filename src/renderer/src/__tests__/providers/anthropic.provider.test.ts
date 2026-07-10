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

import { AnthropicProvider } from '../../../../main/providers/anthropic.provider'

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
  name: 'test-anthropic',
  type: 'anthropic',
  base_url: 'https://api.anthropic.com',
  api_key: 'sk-ant-test',
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

describe('AnthropicProvider — tool_calls 支持', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('非流式响应中 tool_use 被 yield 为 tool_calls', async () => {
    const responseData = {
      content: [
        { type: 'text', text: '让我读取文件' },
        { type: 'tool_use', id: 'toolu_123', name: 'read_file', input: { path: 'a.txt' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 100, output_tokens: 50 },
    }
    mockFetch.mockResolvedValueOnce(createMockJsonResponse(responseData))

    const provider = new AnthropicProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({
      model: 'claude-3-5-sonnet',
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
    expect(toolCallChunks[0].tool_calls![0].id).toBe('toolu_123')
    expect(toolCallChunks[0].tool_calls![0].function.name).toBe('read_file')
    expect(toolCallChunks[0].tool_calls![0].function.arguments).toBe(JSON.stringify({ path: 'a.txt' }))

    // finish_reason 应为 tool_calls
    const finishChunks = chunks.filter((c) => c.finish_reason)
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0].finish_reason).toBe('tool_calls')
  })

  it('流式响应中 tool_use 被正确解析为 tool_calls', async () => {
    const sseData = [
      JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '让我读取' } }),
      JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '文件' } }),
      JSON.stringify({ type: 'content_block_stop', index: 0 }),
      JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_456', name: 'read_file' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":"a' } }),
      JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '.txt"}' } }),
      JSON.stringify({ type: 'content_block_stop', index: 1 }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 50 } }),
      JSON.stringify({ type: 'message_stop' }),
    ]
    mockFetch.mockResolvedValueOnce(createMockSSEResponse(sseData))

    const provider = new AnthropicProvider(testConfig)
    const chunks: ChatChunk[] = []
    for await (const chunk of provider.chat({
      model: 'claude-3-5-sonnet',
      messages: [],
      stream: true,
      tools: testTools,
    })) {
      chunks.push(chunk)
    }

    // 文本内容
    const contentChunks = chunks.filter((c) => c.content)
    expect(contentChunks.map((c) => c.content).join('')).toBe('让我读取文件')

    // tool_calls: 应有 start（id+name）和 delta（arguments 分片）
    const toolCallChunks = chunks.filter((c) => c.tool_calls && c.tool_calls.length > 0)
    expect(toolCallChunks.length).toBeGreaterThanOrEqual(2)

    // 第一个 tool_call chunk 应包含 id 和 name
    const firstTc = toolCallChunks[0].tool_calls![0]
    expect(firstTc.id).toBe('toolu_456')
    expect(firstTc.function.name).toBe('read_file')

    // arguments 应被分片累积
    const allArgs = toolCallChunks
      .map((c) => c.tool_calls![0].function.arguments || '')
      .join('')
    expect(JSON.parse(allArgs)).toEqual({ path: 'a.txt' })

    // finish_reason 应为 tool_calls
    const finishChunks = chunks.filter((c) => c.finish_reason)
    expect(finishChunks.length).toBe(1)
    expect(finishChunks[0].finish_reason).toBe('tool_calls')
  })

  it('请求 body 中 tools 被转换为 Anthropic 格式', async () => {
    let capturedBody: Record<string, unknown> | undefined
    mockFetch.mockImplementationOnce(async (_url: string, options: RequestInit) => {
      capturedBody = JSON.parse(options.body as string)
      return createMockJsonResponse({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    })

    const provider = new AnthropicProvider(testConfig)
    for await (const _ of provider.chat({
      model: 'claude-3-5-sonnet',
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
    expect(tools[0].name).toBe('read_file')
    expect(tools[0].description).toBe('读取文件内容')
    expect(tools[0].input_schema).toBeDefined()
    // Anthropic 格式不应有 'function' 嵌套
    expect(tools[0].function).toBeUndefined()
  })
})
