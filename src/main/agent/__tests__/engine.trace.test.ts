import { describe, it, expect, vi } from 'vitest'
import type { ChatChunk } from '@shared/types/model'
import type { ChatMessage } from '@shared/types/conversation'
import type { AgentTrace } from '@shared/types/trace'

// --- Mock 依赖 ---

const mockChatWithProvider = vi.fn()
vi.mock('../../providers', () => ({
  chatWithProvider: (...args: unknown[]) => mockChatWithProvider(...args),
}))

vi.mock('../../tools/registry', () => ({
  toolRegistry: {
    getToolDefinitions: vi.fn(() => []),
    getTool: vi.fn(() => ({
      execute: vi.fn(async () => ({ tool_call_id: '', content: '文件内容', is_error: false })),
    })),
  },
}))

vi.mock('../../services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn() },
}))

vi.mock('../../services/permission.service', () => ({
  checkPermissionWithPath: vi.fn(() => 'allow'),
  getAllowedDirectories: vi.fn(() => []),
}))

// Mock trace.service 以验证 recordTrace 被调用
const mockRecordTrace = vi.fn().mockResolvedValue(undefined)
vi.mock('../../services/trace.service', () => ({
  getTraceService: () => ({ recordTrace: mockRecordTrace }),
  TraceService: vi.fn(),
  resetTraceService: vi.fn(),
}))

import { AgentEngine } from '../engine'
import type { AgentEvent } from '../types'

describe('AgentEngine — 轨迹记录', () => {
  it('对话结束后调用 recordTrace 记录轨迹(无工具调用)', async () => {
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '你好，我是助手' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]

    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-simple',
      providerId: 'test-provider',
      model: 'test-model',
      messages,
    })) {
      events.push(event)
    }

    // recordTrace 应被调用一次
    expect(mockRecordTrace).toHaveBeenCalledTimes(1)

    const trace = mockRecordTrace.mock.calls[0][0] as AgentTrace
    expect(trace.conversationId).toBe('test-conv-simple')
    // 无工具调用时，totalToolCallCount 应为 0
    expect(trace.totalToolCallCount).toBe(0)
    expect(trace.entries).toBeDefined()
    expect(Array.isArray(trace.entries)).toBe(true)
    // 总时长应大于等于 0
    expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0)
    // createdAt 应为近期时间戳
    expect(trace.createdAt).toBeGreaterThan(0)
    // 无失败
    expect(trace.failureCount).toBe(0)
    expect(trace.successCount).toBe(0)
  })

  it('包含工具调用的对话:轨迹记录工具名称、成功/失败计数', async () => {
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '让我读取文件' }
      yield {
        tool_calls: [{
          index: 0,
          id: 'call_1',
          function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
        }],
      }
      yield { finish_reason: 'tool_calls' }
    }).mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '文件内容已读取' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-tool',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '读取 a.txt' }],
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
    })) {
      events.push(event)
    }

    // recordTrace 应被调用
    expect(mockRecordTrace).toHaveBeenCalled()
    const trace = mockRecordTrace.mock.calls[mockRecordTrace.mock.calls.length - 1][0] as AgentTrace
    expect(trace.conversationId).toBe('test-conv-tool')
    // 应有 1 次工具调用
    expect(trace.totalToolCallCount).toBe(1)
    expect(trace.successCount).toBe(1)
    expect(trace.failureCount).toBe(0)
    // entries 中应包含 read_file 工具调用
    const allToolCalls = trace.entries.flatMap((e) => e.toolCalls)
    expect(allToolCalls.length).toBe(1)
    expect(allToolCalls[0].toolName).toBe('read_file')
    expect(allToolCalls[0].success).toBe(true)
    expect(allToolCalls[0].durationMs).toBeGreaterThanOrEqual(0)
    // argsSummary 应包含 path 信息
    expect(allToolCalls[0].argsSummary).toContain('a.txt')
    // resultSummary 应有内容
    expect(allToolCalls[0].resultSummary.length).toBeGreaterThan(0)
  })

  it('工具执行失败时:failureCount 正确计数', async () => {
    // 重新 mock toolRegistry 让工具执行抛出异常
    const { toolRegistry } = await import('../../tools/registry')
    vi.mocked(toolRegistry.getTool).mockReturnValueOnce({
      execute: vi.fn(async () => {
        throw new Error('工具执行失败')
      }),
    } as never)

    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '执行工具' }
      yield {
        tool_calls: [{
          index: 0,
          id: 'call_fail',
          function: { name: 'run_command', arguments: '{"command":"exit 1"}' },
        }],
      }
      yield { finish_reason: 'tool_calls' }
    }).mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '工具失败了' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-fail',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '执行命令' }],
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
    })) {
      events.push(event)
    }

    const trace = mockRecordTrace.mock.calls[mockRecordTrace.mock.calls.length - 1][0] as AgentTrace
    expect(trace.totalToolCallCount).toBe(1)
    expect(trace.failureCount).toBe(1)
    expect(trace.successCount).toBe(0)
    const allToolCalls = trace.entries.flatMap((e) => e.toolCalls)
    expect(allToolCalls[0].success).toBe(false)
  })

  it('recordTrace 调用不阻塞 AgentEvent 流(事件全部产出)', async () => {
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '回复' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-noblock',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
    })) {
      events.push(event)
    }

    // 应该有 content 和 finish 事件
    expect(events.some((e) => e.type === 'content')).toBe(true)
    expect(events.some((e) => e.type === 'finish')).toBe(true)
  })
})
