import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 被提升到文件顶部，必须用 vi.hoisted 定义 mock 变量
const { mockAddMessage, mockFindById } = vi.hoisted(() => ({
  mockAddMessage: vi.fn(),
  mockFindById: vi.fn(() => ({
    id: 'test-conv',
    project_id: 'test-project',
    title: 'Test',
    model: 'deepseek-chat',
  })),
}))

vi.mock('../../../../main/database/repositories/conversation.repo', () => ({
  findById: mockFindById,
  addMessage: mockAddMessage,
  touch: vi.fn(),
  findMessages: vi.fn(() => []),
  deleteOldMessages: vi.fn(),
}))
vi.mock('../../../../main/database/repositories/project.repo', () => ({
  findById: vi.fn(() => ({ id: 'test-project', workspace_path: '/test', name: 'Test' })),
}))
vi.mock('../../../../main/database/repositories/provider.repo', () => ({
  findEnabled: vi.fn(() => []),
  findModels: vi.fn(() => []),
  getById: vi.fn(() => ({ id: 'test-provider', name: 'Test', type: 'openai' })),
}))
vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: vi.fn(() => null),
  getAll: vi.fn(() => []),
}))
vi.mock('../../../../main/providers', () => ({
  chatWithProvider: vi.fn(),
}))
vi.mock('../../../../main/agent/engine', () => ({
  agentEngine: {
    runConversation: vi.fn(),
  },
}))
vi.mock('../../../../main/tools', () => ({
  getToolDefinitions: vi.fn(() => []),
}))
vi.mock('../../../../main/services/context.builder', () => ({
  buildContext: vi.fn(() => []),
  DEFAULT_SYSTEM_PROMPT: 'You are a helpful assistant.',
}))
vi.mock('../../../../main/services/context-usage.service', () => ({
  getContextSettings: vi.fn(() => ({ maxContextLength: 8000, autoCompress: false, compressThreshold: 80 })),
  getContextUsage: vi.fn(() => null),
}))
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../../main/services/usage-stats.service', () => ({
  recordUsage: vi.fn(),
}))
vi.mock('../../../../main/services/permission.service', () => ({
  getAllowedDirectories: vi.fn(() => []),
}))

import { runChat } from '../../../../main/services/conversation.service'
import { agentEngine } from '../../../../main/agent/engine'

describe('runChat — thinking 内容 fallback', () => {
  beforeEach(() => {
    mockAddMessage.mockClear()
    mockFindById.mockClear()
    mockFindById.mockReturnValue({
      id: 'test-conv',
      project_id: 'test-project',
      title: 'Test',
      model: 'deepseek-chat',
    })
  })

  it('只有 thinking 没有 content 时不显示"未返回内容"错误', async () => {
    vi.mocked(agentEngine.runConversation).mockReturnValueOnce(
      (async function* () {
        yield { type: 'thinking' as const, content: '这是思考过程内容' }
        yield { type: 'finish' as const, reason: 'stop' as const }
      })(),
    )

    const events: unknown[] = []
    for await (const event of runChat({
      conversationId: 'test-conv',
      content: '你好',
      providerId: 'test-provider',
      model: 'deepseek-chat',
    })) {
      events.push(event)
    }

    // 找到最终的 assistant 消息（非 user、非 tool）
    const assistantCalls = mockAddMessage.mock.calls.filter(
      (call) => call[0]?.role === 'assistant' || call[0]?.role === undefined,
    )

    // 最终存储的内容不应包含"未返回内容"
    const allStoredContent = mockAddMessage.mock.calls
      .map((call) => call[0]?.content || '')
      .join('')
    expect(allStoredContent).not.toContain('未返回内容')
  })

  it('有 content 和 thinking 时正常存储 content', async () => {
    vi.mocked(agentEngine.runConversation).mockReturnValueOnce(
      (async function* () {
        yield { type: 'thinking' as const, content: '思考过程' }
        yield { type: 'content' as const, content: '正式回复' }
        yield { type: 'finish' as const, reason: 'stop' as const }
      })(),
    )

    for await (const _event of runChat({
      conversationId: 'test-conv',
      content: '你好',
      providerId: 'test-provider',
      model: 'deepseek-chat',
    })) {
      // 消费事件
    }

    const allStoredContent = mockAddMessage.mock.calls
      .map((call) => call[0]?.content || '')
      .join('')
    expect(allStoredContent).toContain('正式回复')
    expect(allStoredContent).not.toContain('未返回内容')
  })
})
