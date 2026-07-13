// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuestionItem } from '@shared/types/tool'

// 捕获 ipcMain.handle 注册的 handler
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
}))

// Mock conversation.service — 捕获 runChat 收到的参数（含 onQuestion）
const mockRunChat = vi.fn()
vi.mock('../../../../main/services/conversation.service', () => ({
  runChat: (...args: unknown[]) => mockRunChat(...args),
}))

vi.mock('../../../../main/database/repositories/conversation.repo', () => ({
  findMessages: vi.fn(() => []),
}))

vi.mock('../../../../main/database/repositories/provider.repo', () => ({
  findEnabled: vi.fn(() => []),
  findModels: vi.fn(() => []),
}))

vi.mock('../../../../main/agent/engine', () => ({
  agentEngine: {
    runSubConversation: vi.fn(),
  },
}))

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../../../main/services/permission.service', () => ({
  rememberApprovalWithPath: vi.fn(),
}))

import { registerChatIpc } from '../../../../main/ipc/chat.ipc'

describe('chat.ipc — chat:stop 清理 pendingQuestions', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerChatIpc()
  })

  it('chat:stop 时清理 pendingQuestions（onQuestion Promise 被 reject）', async () => {
    let resolveGen: () => void = () => {}
    const genPaused = new Promise<void>((resolve) => { resolveGen = resolve })
    let capturedOnQuestion: ((q: QuestionItem[]) => Promise<string[][]>) | undefined

    mockRunChat.mockImplementation(async function* (params: {
      options?: { onQuestion?: (q: QuestionItem[]) => Promise<string[][]> }
    }): AsyncGenerator {
      capturedOnQuestion = params.options?.onQuestion
      yield { type: 'content', content: '开始' }
      await genPaused
      yield { type: 'finish', reason: 'stop' as const, usage: undefined }
    })

    const sender = { send: vi.fn(), isDestroyed: () => false }

    // 启动 chat
    const sendPromise = handlers.get('chat:send')!(
      { sender }, 'conv-q', '你好', { providerId: 'prov-1', model: 'test-model' },
    )
    await vi.waitFor(() => expect(mockRunChat).toHaveBeenCalledTimes(1))

    // 调用 onQuestion（不 await，让它 pending）
    const questionPromise = capturedOnQuestion!([{ id: 'q1', question: '选择', type: 'choice' }])
    const rejectSpy = vi.fn()
    questionPromise.catch(rejectSpy)

    // 调用 chat:stop
    handlers.get('chat:stop')!({}, 'conv-q')

    // 等待微任务刷新
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 关键断言：onQuestion 的 Promise 应该被 reject（而非一直 pending）
    expect(rejectSpy).toHaveBeenCalled()

    // 清理
    resolveGen()
    await sendPromise
  })
})
