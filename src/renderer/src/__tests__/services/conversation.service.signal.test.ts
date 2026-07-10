// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 捕获 runConversation 收到的参数
const mockRunConversation = vi.fn()
vi.mock('../../../../main/agent/engine', () => ({
  agentEngine: {
    runConversation: (...args: unknown[]) => mockRunConversation(...args),
  },
}))

vi.mock('../../../../main/database/repositories/conversation.repo', () => ({
  findById: vi.fn(() => ({
    id: 'conv-1',
    project_id: 'proj-1',
    model: 'test-model',
  })),
  touch: vi.fn(),
  addMessage: vi.fn(() => ({ id: 'msg-1' })),
  findMessages: vi.fn(() => []),
}))

vi.mock('../../../../main/database/repositories/project.repo', () => ({
  findById: vi.fn(() => ({ id: 'proj-1', workspace_path: '/workspace' })),
}))

vi.mock('../../../../main/database/repositories/provider.repo', () => ({
  findEnabled: vi.fn(() => [{ id: 'prov-1' }]),
  findModels: vi.fn(() => [{ id: 'test-model', name: 'test-model' }]),
}))

vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: vi.fn(() => null),
}))

vi.mock('../../../../main/providers', () => ({
  chatWithProvider: vi.fn(),
}))

vi.mock('../../../../main/tools', () => ({
  getToolDefinitions: vi.fn(() => []),
}))

vi.mock('../../../../main/services/context.builder', () => ({
  buildContext: vi.fn(() => [{ role: 'user', content: 'hello' }]),
  DEFAULT_SYSTEM_PROMPT: 'system',
}))

vi.mock('../../../../main/services/context-usage.service', () => ({
  getContextSettings: vi.fn(() => ({
    maxContextLength: 32000,
    autoCompress: false,
    compressThreshold: 80,
    compressKeepRecent: 6,
  })),
  getContextUsage: vi.fn(() => null),
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../../../main/services/usage-stats.service', () => ({
  recordUsage: vi.fn(),
}))

vi.mock('../../../../main/services/permission.service', () => ({
  getAllowedDirectories: vi.fn(() => []),
}))

import { runChat } from '../../../../main/services/conversation.service'

describe('conversation.service — signal 传递', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认 mock：runConversation 产出 finish 事件后结束
    mockRunConversation.mockImplementation(async function* (): AsyncGenerator {
      yield { type: 'content', content: '回复' }
      yield { type: 'finish', reason: 'stop', usage: undefined }
    })
  })

  it('runChat 将 options.signal 传递给 agentEngine.runConversation', async () => {
    const controller = new AbortController()

    const events: unknown[] = []
    for await (const event of runChat({
      conversationId: 'conv-1',
      content: '你好',
      providerId: 'prov-1',
      model: 'test-model',
      options: {
        signal: controller.signal,
      },
    })) {
      events.push(event)
    }

    // 验证 runConversation 被调用
    expect(mockRunConversation).toHaveBeenCalledTimes(1)
    const params = mockRunConversation.mock.calls[0][0] as { signal?: AbortSignal }
    // signal 应被传递
    expect(params.signal).toBe(controller.signal)
  })

  it('runChat 无 signal 时 runConversation 也不带 signal', async () => {
    const events: unknown[] = []
    for await (const event of runChat({
      conversationId: 'conv-1',
      content: '你好',
      providerId: 'prov-1',
      model: 'test-model',
    })) {
      events.push(event)
    }

    expect(mockRunConversation).toHaveBeenCalledTimes(1)
    const params = mockRunConversation.mock.calls[0][0] as { signal?: AbortSignal }
    expect(params.signal).toBeUndefined()
  })
})
