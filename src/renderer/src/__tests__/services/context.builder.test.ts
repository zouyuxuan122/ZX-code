import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock 依赖
vi.mock('../../../../main/database/repositories/conversation.repo', () => ({
  findMessages: vi.fn(() => []),
}))

vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: vi.fn(() => null),
  set: vi.fn(),
}))

vi.mock('../../../../main/services/scl.service', () => ({
  getEnabledSkillsContent: vi.fn(() => ''),
}))

import { buildContext } from '../../../../main/services/context.builder'
import * as conversationRepo from '../../../../main/database/repositories/conversation.repo'
import type { Message } from '@shared/types/conversation'

/** 构造数据库 Message 的辅助函数 */
function makeMessage(
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id: overrides.id || `msg_${Math.random().toString(36).slice(2)}`,
    conversation_id: 'conv-1',
    role,
    content,
    metadata: overrides.metadata ?? null,
    tool_call_id: overrides.tool_call_id ?? null,
    tool_name: overrides.tool_name ?? null,
    created_at: overrides.created_at ?? Date.now(),
    ...overrides,
  }
}

/** 构造带 tool_calls 的 assistant 消息 metadata */
function toolCallsMeta(toolCalls: Array<{ id: string; name: string; args: string }>) {
  return JSON.stringify({
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.args },
    })),
  })
}

describe('buildContext — 第二轮对话消息序列合规性', () => {
  beforeEach(() => {
    vi.mocked(conversationRepo.findMessages).mockReset()
  })

  it('第二轮纯文本对话：user → assistant → user，消息序列正确', () => {
    // 第一轮：用户问 + AI 回答（纯文本，无工具调用）
    // 第二轮：用户再问
    const messages: Message[] = [
      makeMessage('user', '你好'),
      makeMessage('assistant', '你好！有什么可以帮你的？'),
      makeMessage('user', '今天天气怎么样'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 应该是 3 条消息：user, assistant, user
    expect(result).toHaveLength(3)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toBe('你好')
    expect(result[1].role).toBe('assistant')
    expect(result[1].content).toBe('你好！有什么可以帮你的？')
    expect(result[2].role).toBe('user')
    expect(result[2].content).toBe('今天天气怎么样')
  })

  it('第二轮含工具调用历史：assistant(tool_calls,空content) + tool + user，content 不为空字符串', () => {
    // 第一轮：用户问 → AI 调工具（preamble 为空）→ 工具结果 → AI 总结
    // 第二轮：用户再问
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt'),
      // assistant 消息：content 为空字符串，metadata 含 tool_calls
      makeMessage('assistant', '', {
        metadata: toolCallsMeta([{ id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' }]),
      }),
      // tool 结果消息
      makeMessage('tool', '文件内容: hello', {
        tool_call_id: 'call_1',
        tool_name: 'read_file',
      }),
      // AI 总结
      makeMessage('assistant', 'a.txt 的内容是 hello'),
      // 第二轮用户消息
      makeMessage('user', '再读取 b.txt'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 验证消息序列：user, assistant(null+tc), tool, assistant, user
    expect(result.length).toBeGreaterThanOrEqual(4)

    // 关键断言：带 tool_calls 的 assistant 消息 content 不能是空字符串 ""
    // OpenAI 规范要求：content 为空时必须是 null，否则 DeepSeek 等 API 返回空响应
    const assistantWithToolCalls = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )
    expect(assistantWithToolCalls).toBeDefined()
    expect(assistantWithToolCalls!.content).not.toBe('')
    // 应该是 null
    expect(assistantWithToolCalls!.content).toBeNull()
  })

  it('assistant 消息有 tool_calls 但 content 有文本时，保留 content', () => {
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt'),
      makeMessage('assistant', '让我先读取文件。', {
        metadata: toolCallsMeta([{ id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' }]),
      }),
      makeMessage('tool', '文件内容: hello', {
        tool_call_id: 'call_1',
        tool_name: 'read_file',
      }),
      makeMessage('user', '谢谢'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    const assistantWithToolCalls = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )
    expect(assistantWithToolCalls).toBeDefined()
    expect(assistantWithToolCalls!.content).toBe('让我先读取文件。')
  })

  it('assistant 有 tool_calls 但下一条不是 tool 消息时，剥离 tool_calls 且 content 不为 null', () => {
    // 边界场景：assistant 有 tool_calls 但配对的 tool 消息被裁剪/丢失
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt'),
      makeMessage('assistant', '', {
        metadata: toolCallsMeta([{ id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' }]),
      }),
      // 没有 tool 消息！直接是下一条 user 消息
      makeMessage('user', '算了'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // assistant 消息的 tool_calls 应被剥离
    const assistantMsg = result.find((m) => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.tool_calls).toBeUndefined()
    // 剥离 tool_calls 后 content 不能是 null（否则 content:null 无 tool_calls 的畸形消息）
    expect(assistantMsg!.content).not.toBeNull()
  })

  it('tool 消息必须有 name 字段（DeepSeek 要求）', () => {
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt'),
      makeMessage('assistant', '读取中', {
        metadata: toolCallsMeta([{ id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' }]),
      }),
      makeMessage('tool', 'hello', {
        tool_call_id: 'call_1',
        tool_name: 'read_file',
      }),
      makeMessage('user', '再问一下'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    const toolMsg = result.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.name).toBeDefined()
    expect(toolMsg!.name).toBe('read_file')
  })

  it('token 裁剪后消息序列必须以 user 开头（不含 system 时）', () => {
    // 模拟大量历史消息触发 token 裁剪
    // 构造 30 轮对话历史，每轮约 2000 token
    const messages: Message[] = []
    for (let i = 0; i < 30; i++) {
      messages.push(makeMessage('user', `第${i + 1}轮问题 `.repeat(200)))
      messages.push(makeMessage('assistant', `第${i + 1}轮回答 `.repeat(200)))
    }
    // 最后一条是第二轮的用户消息
    messages.push(makeMessage('user', '最新问题'))
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    // 设置很小的 token 上限，强制裁剪
    const result = buildContext('conv-1', {
      includeSystem: false,
      maxContextTokens: 5000,
    })

    // 裁剪后第一条非 system 消息必须是 user（OpenAI API 要求）
    const firstNonSystem = result.find((m) => m.role !== 'system')
    expect(firstNonSystem).toBeDefined()
    expect(firstNonSystem!.role).toBe('user')
  })

  it('token 裁剪后最后一条消息必须是 user（当前用户输入）', () => {
    const messages: Message[] = []
    for (let i = 0; i < 20; i++) {
      messages.push(makeMessage('user', `问题${i} `.repeat(150)))
      messages.push(makeMessage('assistant', `回答${i} `.repeat(150)))
    }
    messages.push(makeMessage('user', '最新问题'))
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', {
      includeSystem: false,
      maxContextTokens: 3000,
    })

    const last = result[result.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('最新问题')
  })

  it('多轮工具调用历史后第二轮对话：消息序列完整且合规', () => {
    // 模拟完整的多轮对话：
    // user → assistant(tc) → tool → assistant(tc) → tool → assistant(总结) → user(第二轮)
    const messages: Message[] = [
      makeMessage('user', '帮我读取 a.txt 和 b.txt'),
      makeMessage('assistant', '好的，我来读取这两个文件。', {
        metadata: toolCallsMeta([
          { id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' },
          { id: 'call_2', name: 'read_file', args: '{"path":"b.txt"}' },
        ]),
      }),
      makeMessage('tool', '内容A', { tool_call_id: 'call_1', tool_name: 'read_file' }),
      makeMessage('tool', '内容B', { tool_call_id: 'call_2', tool_name: 'read_file' }),
      makeMessage('assistant', 'a.txt 是内容A，b.txt 是内容B。'),
      // 第二轮
      makeMessage('user', '帮我写一个总结'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 验证最后一条是 user 消息
    const last = result[result.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('帮我写一个总结')

    // 验证没有空 content 的 assistant 消息
    for (const msg of result) {
      if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // 有 tool_calls 的 assistant：content 可以是 null 或有值，但不能是空字符串
          expect(msg.content).not.toBe('')
        } else {
          // 无 tool_calls 的 assistant：content 必须有值且非空
          expect(msg.content).toBeTruthy()
          expect(msg.content).not.toBeNull()
        }
      }
    }
  })

  it('BUG复现：联网搜索后第二轮对话返回空回复 — 多个 tool_calls 中间穿插 tool 消息', () => {
    // 场景：用户让 AI 搜索，AI 调用 websearch 工具，工具返回结果，AI 总结
    // 然后用户再问一个问题 → API 返回空回复
    // 关键：websearch 工具结果可能很长，导致 token 裁剪或消息序列问题
    const searchResult = '搜索结果：'.repeat(500)  // 模拟长的搜索结果
    const messages: Message[] = [
      makeMessage('user', '帮我搜索一下最新的 AI 新闻'),
      // assistant 调用 websearch 工具，content 为空（preamble）
      makeMessage('assistant', '', {
        metadata: toolCallsMeta([{ id: 'call_ws_1', name: 'websearch', args: '{"query":"AI新闻"}' }]),
      }),
      // tool 结果（长文本）
      makeMessage('tool', searchResult, {
        tool_call_id: 'call_ws_1',
        tool_name: 'websearch',
      }),
      // AI 总结（基于搜索结果）
      makeMessage('assistant', '根据搜索结果，最新的 AI 新闻包括...'),
      // 第二轮：用户再问
      makeMessage('user', '帮我再搜索一下 Python 3.13 的新特性'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 关键断言1：带 tool_calls 的 assistant 消息 content 不能是空字符串
    const assistantWithToolCalls = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )
    if (assistantWithToolCalls) {
      expect(assistantWithToolCalls.content).not.toBe('')
    }

    // 关键断言2：assistant(tool_calls) 后面必须紧跟 tool 消息
    for (let i = 0; i < result.length - 1; i++) {
      const cur = result[i]
      if (cur.role === 'assistant' && cur.tool_calls && cur.tool_calls.length > 0) {
        const next = result[i + 1]
        expect(next.role).toBe('tool')
      }
    }

    // 关键断言3：tool 消息前必须有 assistant(tool_calls)
    for (let i = 1; i < result.length; i++) {
      const cur = result[i]
      if (cur.role === 'tool') {
        const prev = result[i - 1]
        expect(prev.role).toBe('assistant')
        expect(prev.tool_calls).toBeDefined()
        expect(prev.tool_calls!.length).toBeGreaterThan(0)
      }
    }

    // 关键断言4：最后一条是 user 消息
    const last = result[result.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toBe('帮我再搜索一下 Python 3.13 的新特性')
  })

  it('BUG复现：tool_calls 参数 JSON 格式问题导致 API 拒绝', () => {
    // 场景：tool_calls 的 arguments 字段存储时可能被截断或格式错误
    // buildContext 必须过滤掉格式错误的 tool_calls
    const messages: Message[] = [
      makeMessage('user', '搜索 AI 新闻'),
      makeMessage('assistant', '好的', {
        metadata: JSON.stringify({
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'websearch', arguments: '{"query":"AI新闻"}' } },
            // 格式错误的 tool_call：缺少 function.name
            { id: 'call_2', type: 'function', function: { arguments: '{}' } },
            // 缺少 id
            { type: 'function', function: { name: 'read_file', arguments: '{}' } },
          ],
        }),
      }),
      makeMessage('tool', '结果1', { tool_call_id: 'call_1', tool_name: 'websearch' }),
      makeMessage('user', '继续'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    const assistantWithToolCalls = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )
    if (assistantWithToolCalls) {
      // 所有保留的 tool_calls 必须有 id 和 function.name
      for (const tc of assistantWithToolCalls.tool_calls!) {
        expect(tc.id).toBeTruthy()
        expect(tc.function.name).toBeTruthy()
      }
    }
  })

  it('BUG复现：assistant 有 tool_calls 但 content 是 null（非空字符串），后接 tool 消息', () => {
    // 确保我们的 null 处理在 tool 消息存在时不会误删 tool_calls
    const messages: Message[] = [
      makeMessage('user', '搜索'),
      // content 是空字符串（会被 messageToChatMessage 转为 null）
      makeMessage('assistant', '', {
        metadata: toolCallsMeta([{ id: 'call_1', name: 'websearch', args: '{"query":"test"}' }]),
      }),
      makeMessage('tool', '搜索结果', { tool_call_id: 'call_1', tool_name: 'websearch' }),
      makeMessage('assistant', '根据搜索结果...'),
      makeMessage('user', '第二个问题'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // assistant(tool_calls) 的 content 应该是 null（不是空字符串）
    const assistantTc = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )
    expect(assistantTc).toBeDefined()
    expect(assistantTc!.content).toBeNull()  // null 是正确的（有 tool_calls）

    // tool_calls 不应被删除（后面紧跟 tool 消息）
    expect(assistantTc!.tool_calls).toBeDefined()
    expect(assistantTc!.tool_calls!.length).toBe(1)
  })

  it('BUG复现(API模型根因)：assistant 有 2 个 tool_calls 但只存了 1 个 tool 消息（中断/回退），剥离未配对的 tool_call', () => {
    // 场景：用户停止/回退对话导致 assistant(tool_calls) 已保存但部分 tool 消息未保存
    // API 报错：An assistant message with 'tool_calls' must be followed by tool messages
    //           responding to each 'tool_call_id'. (insufficient tool messages)
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt 和 b.txt'),
      makeMessage('assistant', '好的，我来读取这两个文件。', {
        metadata: toolCallsMeta([
          { id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' },
          { id: 'call_2', name: 'read_file', args: '{"path":"b.txt"}' },
        ]),
      }),
      // 只有 call_1 的 tool 消息，call_2 的 tool 消息因中断未保存
      makeMessage('tool', '内容A', { tool_call_id: 'call_1', tool_name: 'read_file' }),
      // 第二轮用户消息
      makeMessage('user', '继续'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 找到带 tool_calls 的 assistant 消息
    const assistantTc = result.find(
      (m) => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0,
    )

    // 关键断言：保留的 tool_calls 中每个 id 都必须有对应的 tool 消息
    if (assistantTc && assistantTc.tool_calls) {
      const toolMsgIds = new Set(
        result.filter(m => m.role === 'tool').map(m => m.tool_call_id)
      )
      for (const tc of assistantTc.tool_calls) {
        expect(toolMsgIds.has(tc.id)).toBe(true)
      }
    }
  })

  it('BUG复现(API模型根因)：assistant 有 tool_calls 但 0 个 tool 消息，剥离整个 tool_calls', () => {
    // 场景：assistant 保存了 tool_calls，但所有 tool 消息都未保存
    const messages: Message[] = [
      makeMessage('user', '读取 a.txt'),
      makeMessage('assistant', '好的。', {
        metadata: toolCallsMeta([
          { id: 'call_1', name: 'read_file', args: '{"path":"a.txt"}' },
        ]),
      }),
      // 没有 tool 消息，直接是下一条 user
      makeMessage('user', '算了'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // assistant 的 tool_calls 应被剥离
    const assistantMsg = result.find((m) => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.tool_calls).toBeUndefined()
    expect(assistantMsg!.content).not.toBeNull()
  })

  it('BUG复现(根因)：网页模型 tool_calls.function.name 含冒号导致第二轮 HTTP 400', () => {
    // Chat2API 网页模型返回的 tool_calls.function.name 含 "default_api:" 前缀
    // 冒号 ":" 不匹配 OpenAI API 要求的 ^[a-zA-Z0-9_-]+$ 模式
    // 第二轮对话发送历史消息时触发 HTTP 400 Invalid tools[N].function.name
    const messages: Message[] = [
      makeMessage('user', '搜索 AI 新闻'),
      // 网页模型返回的 tool_calls，function.name 含冒号
      makeMessage('assistant', '', {
        metadata: JSON.stringify({
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'default_api:websearch', arguments: '{"query":"AI新闻"}' },
          }],
        }),
      }),
      makeMessage('tool', '搜索结果', { tool_call_id: 'call_1', tool_name: 'default_api:websearch' }),
      makeMessage('assistant', '根据搜索结果...'),
      makeMessage('user', '第二个问题'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', { includeSystem: false })

    // 关键断言：所有 tool_calls 的 function.name 必须匹配 ^[a-zA-Z0-9_-]+$
    // 不能包含冒号、空格等非法字符
    for (const msg of result) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          expect(tc.function.name).toMatch(/^[a-zA-Z0-9_-]+$/)
        }
      }
    }
  })

  it('BUG复现：最新用户消息超过 token 预算时仍必须保留', () => {
    // 场景：最新用户消息本身很大（超过整个 maxContextTokens 预算）
    // 当前 bug：break 导致 kept 为空，最新用户消息被丢弃，AI 看不到用户问题
    // token 估算：'这是一个非常长的最新问题 ' = 11中文×0.7 + 1空格×0.25 ≈ 8 token/重复
    // repeat(500) ≈ 4000 token，超过 maxContextTokens=2000（budget=1900）
    const messages: Message[] = []
    for (let i = 0; i < 5; i++) {
      messages.push(makeMessage('user', `历史问题${i} `.repeat(50)))
      messages.push(makeMessage('assistant', `历史回答${i} `.repeat(50)))
    }
    const latestUserContent = '这是一个非常长的最新问题 '.repeat(500)
    messages.push(makeMessage('user', latestUserContent))
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', {
      includeSystem: false,
      maxContextTokens: 2000, // 预算远小于最新消息（~4000 token）
    })

    // 关键断言：最新用户消息必须被保留（即使超过预算）
    const lastMsg = result[result.length - 1]
    expect(lastMsg).toBeDefined()
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toBe(latestUserContent)
  })

  it('BUG复现：预算为负（system 超限）时仍必须保留最新用户消息', () => {
    // 场景：system 提示占用大量 token，导致 budget = maxContextTokens - systemTokens - 100 < 0
    // 当前 bug：budget 为负，第一条消息就 break，所有对话消息被丢弃
    const messages: Message[] = [
      makeMessage('user', '最新问题'),
    ]
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', {
      includeSystem: true,
      maxContextTokens: 100, // 极小预算，DEFAULT_SYSTEM_PROMPT 就超了
    })

    // 即使预算为负，最新用户消息也必须保留
    const userMsg = result.find(m => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toBe('最新问题')
  })

  it('BUG复现：最新是 tool 消息序列时，前面最近的 user 消息必须保留', () => {
    // 场景：用户提问 → AI 调工具（assistant+tool_calls）→ tool 结果
    // 此时 recent 末尾是 tool 消息，预算不足时可能把 user 消息裁掉
    // 但 AI 必须能看到用户的原始问题才能继续处理
    const messages: Message[] = []
    for (let i = 0; i < 10; i++) {
      messages.push(makeMessage('user', `历史问题${i} `.repeat(200)))
      messages.push(makeMessage('assistant', `历史回答${i} `.repeat(200)))
    }
    // 当前轮次：user 提问 → assistant 调工具 → tool 结果
    messages.push(makeMessage('user', '请读取 config.json 文件'))
    messages.push(makeMessage('assistant', '好的，我来读取。', {
      metadata: toolCallsMeta([{ id: 'call_1', name: 'read_file', args: '{"path":"config.json"}' }]),
    }))
    messages.push(makeMessage('tool', '{"name":"test"}', { tool_call_id: 'call_1', tool_name: 'read_file' }))
    vi.mocked(conversationRepo.findMessages).mockReturnValue(messages)

    const result = buildContext('conv-1', {
      includeSystem: false,
      maxContextTokens: 3000,
    })

    // 最新 user 消息必须保留
    const userMsg = result.find(m => m.role === 'user' && m.content === '请读取 config.json 文件')
    expect(userMsg).toBeDefined()
  })
})
