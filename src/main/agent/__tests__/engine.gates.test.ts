import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import type { ChatChunk } from '@shared/types/model'
import type { ChatMessage } from '@shared/types/conversation'

// --- Mock 依赖 ---

const mockChatWithProvider = vi.fn()
vi.mock('../../providers', () => ({
  chatWithProvider: (...args: unknown[]) => mockChatWithProvider(...args),
}))

// Mock settingsRepo：可按 key 返回不同的值
const mockSettingsGet = vi.fn()
vi.mock('../../database/repositories/settings.repo', () => ({
  get: (key: string) => mockSettingsGet(key),
}))

// Mock getDb：返回内存 DB（在 beforeEach 中初始化）
let testDb: DBType
vi.mock('../../database', () => ({
  getDb: () => testDb,
}))

vi.mock('../../tools/registry', () => ({
  toolRegistry: {
    getToolDefinitions: vi.fn(() => []),
    getTool: vi.fn(() => ({
      execute: vi.fn(async () => ({ tool_call_id: '', content: '', is_error: false })),
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

vi.mock('../../services/token-juice.service', () => ({
  compressToolOutput: vi.fn((content: string) => ({ output: content })),
}))

vi.mock('../../services/trace.service', () => ({
  getTraceService: () => ({ recordTrace: vi.fn().mockResolvedValue(undefined) }),
  TraceService: vi.fn(),
  resetTraceService: vi.fn(),
}))

// Mock SuperContextService 以避免复杂 DB 查询
vi.mock('../../services/super-context.service', () => ({
  SuperContextService: vi.fn(() => ({
    buildBriefing: vi.fn().mockResolvedValue(null),
    formatBriefingAsText: vi.fn().mockReturnValue(''),
  })),
}))

// Mock MemoryRecallService 以避免 DB 查询
vi.mock('../../services/memory-recall.service', () => ({
  MemoryRecallService: vi.fn(() => ({
    queryNodes: vi.fn().mockReturnValue([]),
  })),
}))

// Mock MemoryExtractService 以避免 triggerMemoryExtraction 调用 chatWithProvider
vi.mock('../../services/memory-extract.service', () => ({
  MemoryExtractService: vi.fn(() => ({
    extractFromConversation: vi.fn().mockResolvedValue([]),
  })),
}))

// Mock scl.service 的 installSclExtension 以避免副作用
vi.mock('../../services/scl.service', () => ({
  installSclExtension: vi.fn(),
}))

import { AgentEngine } from '../engine'
import { runMigrations } from '../../database/migrate'
import * as userProfileRepo from '../../database/repositories/user-profile.repo'

// ============================================================================
// 工具函数
// ============================================================================

/** 设置 mockSettingsGet 的返回值 */
function setupSettings(overrides: Record<string, unknown> = {}): void {
  const defaults: Record<string, unknown> = {
    'tokenJuice.enabled': true,
    'tokenJuice.maxToolOutputChars': 8000,
    'superContext.enabled': false,
    'superContext.timeoutMs': 800,
    'memory.enabled': false,
    'memory.autoRecall': false,
    'memory.autoExtract': false,
    'memory.recallLimit': 5,
    'evolution.enabled': true,
    'profile.enabled': true,
  }
  const merged = { ...defaults, ...overrides }
  mockSettingsGet.mockImplementation((key: string) => merged[key] ?? null)
}

/** 等待 fire-and-forget 异步操作完成 */
function flushMicrotasks(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 向 user_profile 表插入测试画像数据 */
function insertProfileData(): void {
  userProfileRepo.upsertDimension(testDb, {
    dimension: 'tech_stack',
    value: 'TypeScript, React',
    confidence: 0.9,
    source: 'auto',
  })
  userProfileRepo.upsertDimension(testDb, {
    dimension: 'coding_style',
    value: '函数式',
    confidence: 0.8,
    source: 'auto',
  })
}

beforeEach(() => {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  runMigrations(testDb)
  mockChatWithProvider.mockReset()
  mockSettingsGet.mockReset()
  setupSettings()
})

// ============================================================================

describe('AgentEngine — evolution.enabled 门控', () => {
  it('evolution.enabled=false 时不触发技能创建 LLM 调用', async () => {
    // 用户消息包含满意度关键词 "谢谢"，使 assessComplexity 返回 true
    setupSettings({
      'evolution.enabled': false,
      'memory.enabled': false,
      'profile.enabled': false,
    })

    // 主对话：单次回复，无工具调用
    mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '回复' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const messages: ChatMessage[] = [{ role: 'user', content: '谢谢' }]

    for await (const _event of engine.runConversation({
      conversationId: 'test-conv-evo-off',
      providerId: 'test-provider',
      model: 'test-model',
      messages,
    })) {
      // 消费事件
    }

    // 等待 fire-and-forget 异步操作完成
    await flushMicrotasks()

    // chatWithProvider 应只被调用一次（主对话），技能创建不应触发 LLM 调用
    expect(mockChatWithProvider).toHaveBeenCalledTimes(1)
  })

  it('evolution.enabled=true 时触发技能创建 LLM 调用（对照实验）', async () => {
    setupSettings({
      'evolution.enabled': true,
      'memory.enabled': false,
      'profile.enabled': false,
    })

    mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
      yield { content: '回复' }
      yield { finish_reason: 'stop' }
    })

    const engine = new AgentEngine()
    const messages: ChatMessage[] = [{ role: 'user', content: '谢谢' }]

    for await (const _event of engine.runConversation({
      conversationId: 'test-conv-evo-on',
      providerId: 'test-provider',
      model: 'test-model',
      messages,
    })) {
      // 消费事件
    }

    await flushMicrotasks()

    // chatWithProvider 应被调用 >=2 次（主对话 + 技能创建）
    expect(mockChatWithProvider.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

// ============================================================================

describe('AgentEngine — profile.enabled 门控', () => {
  describe('buildUserProfileText', () => {
    it('profile.enabled=false 时返回空字符串（系统消息不含用户画像）', async () => {
      insertProfileData()
      setupSettings({
        'profile.enabled': false,
        'evolution.enabled': false,
        'memory.enabled': false,
      })

      mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
        yield { content: '回复' }
        yield { finish_reason: 'stop' }
      })

      const engine = new AgentEngine()
      // 提供初始 system 消息以便验证画像是否被注入
      const messages: ChatMessage[] = [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' },
      ]

      for await (const _event of engine.runConversation({
        conversationId: 'test-conv-profile-off',
        providerId: 'test-provider',
        model: 'test-model',
        messages,
      })) {
        // 消费事件
      }

      // 检查传给 chatWithProvider 的消息
      const callArgs = mockChatWithProvider.mock.calls[0]
      const chatParams = callArgs[1] as { messages: Array<{ role: string; content: string }> }
      const systemMessage = chatParams.messages.find((m) => m.role === 'system')
      expect(systemMessage).toBeDefined()
      // 系统消息不应包含用户画像 section
      expect(systemMessage!.content).not.toContain('用户画像')
    })

    it('profile.enabled=true 时注入用户画像（对照实验）', async () => {
      insertProfileData()
      setupSettings({
        'profile.enabled': true,
        'evolution.enabled': false,
        'memory.enabled': false,
      })

      mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
        yield { content: '回复' }
        yield { finish_reason: 'stop' }
      })

      const engine = new AgentEngine()
      const messages: ChatMessage[] = [
        { role: 'system', content: '你是助手' },
        { role: 'user', content: '你好' },
      ]

      for await (const _event of engine.runConversation({
        conversationId: 'test-conv-profile-on',
        providerId: 'test-provider',
        model: 'test-model',
        messages,
      })) {
        // 消费事件
      }

      const callArgs = mockChatWithProvider.mock.calls[0]
      const chatParams = callArgs[1] as { messages: Array<{ role: string; content: string }> }
      const systemMessage = chatParams.messages.find((m) => m.role === 'system')
      expect(systemMessage).toBeDefined()
      // 系统消息应包含用户画像 section
      expect(systemMessage!.content).toContain('用户画像')
    })
  })

  describe('triggerProfileExtraction', () => {
    it('profile.enabled=false 时不触发画像抽取 LLM 调用', async () => {
      setupSettings({
        'profile.enabled': false,
        // memory 保持启用 + autoExtract=true，使旧的 getMemoryConfig 检查通过
        'memory.enabled': true,
        'memory.autoExtract': true,
        'memory.autoRecall': false,
        'evolution.enabled': false,
      })

      mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
        yield { content: '回复' }
        yield { finish_reason: 'stop' }
      })

      const engine = new AgentEngine()
      const messages: ChatMessage[] = [{ role: 'user', content: '我用 TypeScript 和 React' }]

      for await (const _event of engine.runConversation({
        conversationId: 'test-conv-profile-extract-off',
        providerId: 'test-provider',
        model: 'test-model',
        messages,
      })) {
        // 消费事件
      }

      await flushMicrotasks()

      // chatWithProvider 应只被调用一次（主对话）
      // 画像抽取不应触发额外的 LLM 调用
      expect(mockChatWithProvider).toHaveBeenCalledTimes(1)
    })

    it('profile.enabled=true 时触发画像抽取 LLM 调用（对照实验）', async () => {
      setupSettings({
        'profile.enabled': true,
        'memory.enabled': true,
        'memory.autoExtract': true,
        'memory.autoRecall': false,
        'evolution.enabled': false,
      })

      mockChatWithProvider.mockImplementation(async function* (): AsyncGenerator<ChatChunk> {
        yield { content: '回复' }
        yield { finish_reason: 'stop' }
      })

      const engine = new AgentEngine()
      const messages: ChatMessage[] = [{ role: 'user', content: '我用 TypeScript 和 React' }]

      for await (const _event of engine.runConversation({
        conversationId: 'test-conv-profile-extract-on',
        providerId: 'test-provider',
        model: 'test-model',
        messages,
      })) {
        // 消费事件
      }

      await flushMicrotasks()

      // chatWithProvider 应被调用 >=2 次（主对话 + 画像抽取）
      expect(mockChatWithProvider.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
