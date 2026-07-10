// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 捕获 ipcMain.handle 注册的 handler
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
}))

// Mock conversation.service — 捕获 runChat 收到的参数
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

describe('chat.ipc — AbortController + 竞态3', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerChatIpc()
  })

  it('chat:stop 调用 controller.abort() 中断底层请求', async () => {
    let capturedSignal: AbortSignal | undefined
    let resolveGenerator: () => void = () => {}
    const generatorPaused = new Promise<void>((resolve) => { resolveGenerator = resolve })

    mockRunChat.mockImplementation(async function* (params: { options?: { signal?: AbortSignal } }): AsyncGenerator {
      capturedSignal = params.options?.signal
      yield { type: 'content', content: '正在回复' }
      await generatorPaused
      yield { type: 'finish', reason: 'stop' as const, usage: undefined }
    })

    const sender = { send: vi.fn(), isDestroyed: () => false }

    // 调用 chat:send（不 await，生成器不会自动结束）
    const sendPromise = handlers.get('chat:send')!(
      { sender },
      'conv-1',
      '你好',
      { providerId: 'prov-1', model: 'test-model' },
    )

    // 等待 runChat 被调用
    await vi.waitFor(() => expect(mockRunChat).toHaveBeenCalledTimes(1))

    // 调用 chat:stop
    const stopResult = handlers.get('chat:stop')!({}, 'conv-1')
    expect(stopResult).toBe(true)

    // 关键断言：signal 被 abort
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(true)

    // 让生成器结束
    resolveGenerator()
    await sendPromise
  })

  it('竞态3：旧请求 finally 不误删新请求的 runningChats 条目', async () => {
    let resolveFirstGen: () => void = () => {}
    const firstGenPaused = new Promise<void>((resolve) => { resolveFirstGen = resolve })

    let secondSignal: AbortSignal | undefined

    // 第一次调用：等待外部信号才结束
    mockRunChat.mockImplementationOnce(async function* (params: { options?: { signal?: AbortSignal } }): AsyncGenerator {
      yield { type: 'content', content: '请求A' }
      await firstGenPaused
      yield { type: 'finish', reason: 'stop' as const, usage: undefined }
    })

    // 第二次调用：正常结束
    mockRunChat.mockImplementationOnce(async function* (params: { options?: { signal?: AbortSignal } }): AsyncGenerator {
      secondSignal = params.options?.signal
      yield { type: 'content', content: '请求B' }
      yield { type: 'finish', reason: 'stop' as const, usage: undefined }
    })

    const sender = { send: vi.fn(), isDestroyed: () => false }

    // 1. 请求 A 开始
    const sendPromiseA = handlers.get('chat:send')!(
      { sender }, 'conv-1', '你好A', { providerId: 'prov-1', model: 'test-model' },
    )
    await vi.waitFor(() => expect(mockRunChat).toHaveBeenCalledTimes(1))

    // 2. 停止请求 A（删除 runningChats 条目 + abort controller A）
    handlers.get('chat:stop')!({}, 'conv-1')

    // 3. 请求 B 开始（因 chat:stop 已删除旧条目，应成功）
    const sendPromiseB = handlers.get('chat:send')!(
      { sender }, 'conv-1', '你好B', { providerId: 'prov-1', model: 'test-model' },
    )
    await vi.waitFor(() => expect(mockRunChat).toHaveBeenCalledTimes(2))

    // 4. 让请求 A 的生成器结束 → 触发 A 的 finally 块
    resolveFirstGen()
    await sendPromiseA

    // 5. 关键断言：请求 B 的 signal 未被 A 的 finally 块影响
    expect(secondSignal).toBeDefined()
    expect(secondSignal!.aborted).toBe(false)

    // 等待请求 B 完成
    await sendPromiseB
  })

  it('chat:send 将 controller.signal 通过 options.signal 传递给 runChat', async () => {
    let capturedSignal: AbortSignal | undefined

    mockRunChat.mockImplementationOnce(async function* (params: { options?: { signal?: AbortSignal } }): AsyncGenerator {
      capturedSignal = params.options?.signal
      yield { type: 'content', content: '回复' }
      yield { type: 'finish', reason: 'stop' as const, usage: undefined }
    })

    const sender = { send: vi.fn(), isDestroyed: () => false }

    await handlers.get('chat:send')!(
      { sender }, 'conv-1', '你好', { providerId: 'prov-1', model: 'test-model' },
    )

    // signal 应被传递
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    // 未被 stop，应未 aborted
    expect(capturedSignal!.aborted).toBe(false)
  })
})
