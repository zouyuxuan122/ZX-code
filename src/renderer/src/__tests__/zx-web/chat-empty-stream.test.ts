import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'stream'

// Mock 依赖：chat.ts 内部 import 的模块需全部 mock，避免触碰真实 store/网络
vi.mock('../../../../main/zx-web/proxy/forwarder', () => ({
  requestForwarder: {
    forwardChatCompletion: vi.fn(),
  },
}))

vi.mock('../../../../main/zx-web/proxy/loadbalancer', () => ({
  loadBalancer: {
    selectAccount: vi.fn(),
    clearAccountFailure: vi.fn(),
    markAccountFailed: vi.fn(),
  },
}))

vi.mock('../../../../main/zx-web/proxy/status', () => ({
  proxyStatusManager: {
    recordRequestStart: vi.fn(),
    recordRequestFailure: vi.fn(),
    recordRequestSuccess: vi.fn(),
    getConfig: vi.fn(() => ({ timeout: 120000 })),
  },
}))

vi.mock('../../../../main/zx-web/proxy/modelMapper', () => ({
  modelMapper: {
    getPreferredProvider: vi.fn(() => undefined),
    getPreferredAccount: vi.fn(() => undefined),
  },
}))

vi.mock('../../../../main/zx-web/store/store', () => ({
  storeManager: {
    getConfig: vi.fn(() => ({
      retryCount: 0,
      loadBalanceStrategy: 'round-robin',
      contextManagement: { enabled: false },
    })),
    addLog: vi.fn(),
    addRequestLog: vi.fn(() => ({ id: 'log-1' })),
    updateRequestLog: vi.fn(),
    updateAccount: vi.fn(),
    recordRequestInStats: vi.fn(),
  },
}))

vi.mock('../../../../main/zx-web/proxy/stream', () => ({
  streamHandler: {
    createTransformStream: vi.fn(),
  },
}))

vi.mock('../../../../main/zx-web/proxy/utils/toolFormatConverter', () => ({
  isAnthropicToolFormat: vi.fn(() => false),
  transformResponseToAnthropic: vi.fn(),
  transformChunkToAnthropic: vi.fn(),
}))

import router from '../../../../main/zx-web/proxy/routes/chat'
import { requestForwarder } from '../../../../main/zx-web/proxy/forwarder'
import { loadBalancer } from '../../../../main/zx-web/proxy/loadbalancer'

/** 构造最小化 mock Koa Context，仅提供 chat.ts 用到的属性 */
function createMockCtx(body: any): any {
  return {
    request: { body },
    headers: {},
    ip: '127.0.0.1',
    status: 200,
    body: null,
    set: vi.fn(),
  }
}

/** 从 @koa/router 实例中提取首个注册的 handler */
function getFirstHandler(): (ctx: any, next: any) => Promise<void> {
  const layers = (router as any).stack
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error('router.stack 为空，无法获取 handler')
  }
  const stack = layers[0].stack
  if (!Array.isArray(stack) || stack.length === 0) {
    throw new Error('路由 layer.stack 为空，无法获取 handler')
  }
  return stack[0]
}

describe('chat 路由流式空响应兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadBalancer.selectAccount).mockReturnValue({
      account: {
        id: 'acc-1',
        name: 'test',
        credentials: {},
        requestCount: 0,
        todayUsed: 0,
      },
      provider: {
        id: 'prov-1',
        name: 'test',
        type: 'custom',
        authType: 'token',
        apiEndpoint: '',
        headers: {},
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
      actualModel: 'test-model',
    })
  })

  it('skipTransform 源流空结束时，应补一个带 finish_reason=stop 的兜底 chunk 与 [DONE]', async () => {
    // 构造空源流：不发任何 data，直接 end
    const emptyStream = new PassThrough()

    vi.mocked(requestForwarder.forwardChatCompletion).mockResolvedValue({
      success: true,
      status: 200,
      stream: emptyStream,
      skipTransform: true,
      latency: 10,
    } as any)

    const ctx = createMockCtx({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })

    const handler = getFirstHandler()
    await handler(ctx, async () => {})

    // handler 应已设置 ctx.body 为 wrapperStream (PassThrough)
    const wrapperStream = ctx.body
    expect(wrapperStream).toBeInstanceOf(PassThrough)

    // 收集 wrapperStream 输出
    const chunks: Buffer[] = []
    wrapperStream.on('data', (c: Buffer) => chunks.push(c))
    const done = new Promise<void>((resolve) => wrapperStream.on('end', resolve))

    // 触发源流结束（不发任何 data，模拟网页模型在工具调用后空响应）
    emptyStream.end()

    await done

    const output = Buffer.concat(chunks).toString('utf-8')

    // 断言：应包含带 finish_reason 的兜底 chunk（而非完全空输出）
    expect(output).toContain('finish_reason')
    expect(output).toContain('stop')
    // 断言：应包含 [DONE] 结束标记
    expect(output).toContain('[DONE]')
  })

  it('skipTransform 源流有内容时，不应额外补兜底 chunk', async () => {
    // 构造有内容的源流
    const sourceStream = new PassThrough()

    vi.mocked(requestForwarder.forwardChatCompletion).mockResolvedValue({
      success: true,
      status: 200,
      stream: sourceStream,
      skipTransform: true,
      latency: 10,
    } as any)

    const ctx = createMockCtx({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    })

    const handler = getFirstHandler()
    await handler(ctx, async () => {})

    const wrapperStream = ctx.body as PassThrough
    const chunks: Buffer[] = []
    wrapperStream.on('data', (c: Buffer) => chunks.push(c))
    const done = new Promise<void>((resolve) => wrapperStream.on('end', resolve))

    // 源流先写一个正常 chunk，再 end
    const normalChunk = {
      id: 'chatcmpl-x',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'test-model',
      choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
    }
    sourceStream.write(`data: ${JSON.stringify(normalChunk)}\n\n`)
    sourceStream.write('data: [DONE]\n\n')
    sourceStream.end()

    await done

    const output = Buffer.concat(chunks).toString('utf-8')

    // 断言：原内容被透传
    expect(output).toContain('hello')
    expect(output).toContain('[DONE]')
    // 断言：不应出现重复的 finish_reason=stop（原流已自带 [DONE]）
    const stopCount = (output.match(/"finish_reason"\s*:\s*"stop"/g) || []).length
    expect(stopCount).toBe(0)
  })
})
