import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatChunk } from '@shared/types/model'
import type { ChatMessage } from '@shared/types/conversation'

// 可配置的 mock
const mockChatWithProvider = vi.fn()
const mockToolExecute = vi.fn(async () => ({
  tool_call_id: '',
  content: '工具执行结果',
  is_error: false,
}))
const mockCheckPermissionWithPath = vi.fn(() => 'allow')

vi.mock('../../../../main/providers', () => ({
  chatWithProvider: (...args: unknown[]) => mockChatWithProvider(...args),
}))

vi.mock('../../../../main/tools/registry', () => ({
  toolRegistry: {
    getToolDefinitions: vi.fn(() => []),
    getTool: vi.fn(() => ({ execute: mockToolExecute })),
  },
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../../main/services/permission.service', () => ({
  checkPermissionWithPath: (...args: unknown[]) => mockCheckPermissionWithPath(...args),
}))

import { AgentEngine } from '../../../../main/agent/engine'
import type { AgentEvent } from '../../../../main/agent/types'

describe('AgentEngine — handleToolCalls 权限与参数安全', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermissionWithPath.mockReturnValue('allow')
    mockToolExecute.mockImplementation(async () => ({
      tool_call_id: '',
      content: '工具执行结果',
      is_error: false,
    }))
  })

  it('autoAccept=true 时 deny 权限的工具仍被拒绝执行', async () => {
    mockCheckPermissionWithPath.mockReturnValue('deny')

    // 第一轮：LLM 请求调用 write_file
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield {
        tool_calls: [{
          index: 0,
          id: 'call_deny_1',
          function: { name: 'write_file', arguments: '{"path":"/outside/file.txt","content":"test"}' },
        }],
      }
      yield { finish_reason: 'tool_calls' }
    })
    // 第二轮：模型收到拒绝结果后停止
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '工具被拒绝' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-deny',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '写入外部文件' }],
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
    })) {
      events.push(event)
    }

    // 关键断言：工具不应被执行
    expect(mockToolExecute).not.toHaveBeenCalled()

    // 应该有 tool_call_end 事件，且 is_error=true
    const toolCallEndEvents = events.filter((e) => e.type === 'tool_call_end')
    expect(toolCallEndEvents.length).toBe(1)
    const result = (toolCallEndEvents[0] as { result: { is_error: boolean; content: string } }).result
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('禁止')
  })

  it('autoAccept=true 时 ask 权限的工具自动执行无需审批', async () => {
    mockCheckPermissionWithPath.mockReturnValue('ask')
    const onToolCall = vi.fn()

    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield {
        tool_calls: [{
          index: 0,
          id: 'call_ask_1',
          function: { name: 'write_file', arguments: '{"path":"/test/file.txt","content":"test"}' },
        }],
      }
      yield { finish_reason: 'tool_calls' }
    })
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '已完成' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-ask',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '写入文件' }],
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
      onToolCall,
    })) {
      events.push(event)
    }

    // 关键断言：工具应被执行
    expect(mockToolExecute).toHaveBeenCalledTimes(1)

    // 不应有 tool_call_approval 事件
    const approvalEvents = events.filter((e) => e.type === 'tool_call_approval')
    expect(approvalEvents.length).toBe(0)

    // onToolCall 回调不应被调用
    expect(onToolCall).not.toHaveBeenCalled()
  })

  it('工具参数 JSON 解析失败时不执行工具，返回 is_error', async () => {
    mockCheckPermissionWithPath.mockReturnValue('allow')

    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield {
        tool_calls: [{
          index: 0,
          id: 'call_bad_args',
          function: { name: 'read_file', arguments: '不是有效的JSON{{{' },
        }],
      }
      yield { finish_reason: 'tool_calls' }
    })
    mockChatWithProvider.mockImplementationOnce(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '参数错误' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const events: AgentEvent[] = []
    for await (const event of engine.runConversation({
      conversationId: 'test-conv-badargs',
      providerId: 'test-provider',
      model: 'test-model',
      messages: [{ role: 'user', content: '读文件' }],
      context: {
        workspacePath: '/test',
        projectId: null,
        autoAccept: true,
      },
    })) {
      events.push(event)
    }

    // 关键断言：工具不应被执行
    expect(mockToolExecute).not.toHaveBeenCalled()

    // 应该有 tool_call_end 事件，且 is_error=true
    const toolCallEndEvents = events.filter((e) => e.type === 'tool_call_end')
    expect(toolCallEndEvents.length).toBe(1)
    const result = (toolCallEndEvents[0] as { result: { is_error: boolean } }).result
    expect(result.is_error).toBe(true)
  })
})
