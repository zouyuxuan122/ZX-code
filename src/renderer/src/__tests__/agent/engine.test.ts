import { describe, it, expect, vi } from 'vitest'
import type { ChatChunk } from '@shared/types/model'
import type { ChatMessage } from '@shared/types/conversation'

// Mock 依赖
const mockChatWithProvider = vi.fn()
vi.mock('../../../../main/providers', () => ({
  chatWithProvider: (...args: unknown[]) => mockChatWithProvider(...args),
}))

vi.mock('../../../../main/tools/registry', () => ({
  toolRegistry: {
    getToolDefinitions: vi.fn(() => []),
    getTool: vi.fn(() => ({
      execute: vi.fn(async () => ({ tool_call_id: '', content: '文件内容', is_error: false })),
    })),
  },
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../../main/services/permission.service', () => ({
  checkPermissionWithPath: vi.fn(() => 'allow'),
}))

import { AgentEngine } from '../../../../main/agent/engine'
import type { AgentEvent } from '../../../../main/agent/types'

describe('AgentEngine — reasoning_content 消费', () => {
  it('收到 reasoning_content chunk 时 yield thinking 事件', async () => {
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { reasoning_content: '正在分析搜索结果...' }
      yield { content: '这是最终回复' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]

    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv',
      providerId: 'test-provider',
      model: 'deepseek-chat',
      messages,
    })) {
      events.push(event)
    }

    const thinkingEvents = events.filter((e) => e.type === 'thinking')
    expect(thinkingEvents.length).toBe(1)
    expect((thinkingEvents[0] as { content: string }).content).toBe('正在分析搜索结果...')
  })

  it('只有 reasoning_content 没有 content 时仍正常结束（不报错）', async () => {
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { reasoning_content: '我在思考，但没有输出正文...' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const messages: ChatMessage[] = [{ role: 'user', content: '你好' }]

    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv',
      providerId: 'test-provider',
      model: 'deepseek-v4-flash',
      messages,
    })) {
      events.push(event)
    }

    // 应该有 thinking 事件
    const thinkingEvents = events.filter((e) => e.type === 'thinking')
    expect(thinkingEvents.length).toBe(1)

    // 应该有 finish 事件（不是 error）
    const finishEvents = events.filter((e) => e.type === 'finish')
    expect(finishEvents.length).toBe(1)
    expect((finishEvents[0] as { reason: string }).reason).toBe('stop')

    // 不应有 error 事件
    const errorEvents = events.filter((e) => e.type === 'error')
    expect(errorEvents.length).toBe(0)
  })

  it('signal abort 后停止消费流式响应，不会无限产出 content', async () => {
    // 模拟持续产出的流：1000 个 chunk
    // 在第 5 个 chunk 后触发 abort，engine 应停止消费
    const controller = new AbortController()
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      for (let i = 0; i < 1000; i++) {
        yield { content: `chunk${i}` }
        if (i === 5) {
          controller.abort()
        }
      }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '你好' }],
      signal: controller.signal,
    })) {
      events.push(event)
    }

    // 关键断言：engine 应在 abort 后停止消费，不会产出全部 1000 个 chunk
    const contentEvents = events.filter((e) => e.type === 'content')
    expect(contentEvents.length).toBeLessThan(50)

    // 应该有 finish 事件（正常结束，不是 error）
    const finishEvents = events.filter((e) => e.type === 'finish')
    expect(finishEvents.length).toBe(1)
  })

  it('signal 已 abort 时进入工具调用循环前就停止', async () => {
    // 第二个迭代轮次开始前 signal 已 abort，应直接停止
    const controller = new AbortController()
    let callCount = 0
    mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
      callCount++
      if (callCount === 1) {
        // 第一轮：产出 content + tool_call
        yield { content: '让我读取文件' }
        yield {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
          }],
        }
        yield { finish_reason: 'tool_calls' }
      } else {
        // 第二轮：如果 engine 没有检查 signal，这里会被调用
        yield { content: '不应该到达这里' }
        yield { finish_reason: 'stop' }
      }
    })

    const engine = new AgentEngine()
    // 模拟工具执行后 abort
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '读取 a.txt' }],
      signal: controller.signal,
      // 使用 autoAccept 跳过审批，工具执行后触发 abort
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
    })) {
      events.push(event)
      // 在工具调用结束后触发 abort
      if (event.type === 'tool_call_end') {
        controller.abort()
      }
    }

    // 第二轮不应该被调用（signal 在工具执行后已 abort）
    expect(callCount).toBe(1)
    // 应该有 finish 事件
    expect(events.some((e) => e.type === 'finish')).toBe(true)
  })
})
