import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import type { SclExtension } from '@shared/types/scl'
import type { AgentTrace } from '@shared/types/trace'
import type { ChatChunk } from '@shared/types/model'

// 用 vi.hoisted 创建捕获 map，使其在 mock 工厂中可用
const { handlers, mockChatWithProvider } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  mockChatWithProvider: vi.fn(),
}))

// mock electron 的 ipcMain.handle，捕获注册的 handler
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

// Mock chatWithProvider：用于验证 evolution.ipc.ts 默认构造的 llmCaller 是否调用 LLM
vi.mock('../../providers', () => ({
  chatWithProvider: (...args: unknown[]) => mockChatWithProvider(...args),
}))

// Mock scl.service（依赖全局 getDb + electron net，需隔离）
vi.mock('../../services/scl.service', () => ({
  listSclExtensions: vi.fn(),
  updateSclExtension: vi.fn(),
}))

// Mock trace.repo（按任务要求 mock trace.repo 调用）
vi.mock('../../database/repositories/trace.repo', () => ({
  getTracesByTool: vi.fn(),
  getFailedTraces: vi.fn(),
  queryTraces: vi.fn(),
}))

import { registerEvolutionIpc } from '../evolution.ipc'
import { SkillEvolutionService } from '../../services/skill-evolution.service'
import * as sclService from '../../services/scl.service'
import * as traceRepo from '../../database/repositories/trace.repo'
import * as skillVersionRepo from '../../database/repositories/skill-version.repo'
import * as evolutionRunRepo from '../../database/repositories/evolution-run.repo'

let db: DBType

beforeEach(() => {
  handlers.clear()
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  vi.clearAllMocks()
})

// ============================================================================
// 测试数据工厂
// ============================================================================

function buildSkill(overrides: Partial<SclExtension> = {}): SclExtension {
  return {
    id: 'skill-1',
    name: '测试技能',
    description: '用于测试的技能',
    category: 'testing',
    author: 'test',
    version: '1.0.0',
    content: '## 测试技能\n\n遵循 TDD 流程进行开发',
    tags: ['test'],
    enabled: true,
    source: 'builtin',
    icon: '🧪',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  }
}

function buildTrace(overrides: Partial<AgentTrace> = {}): AgentTrace {
  return {
    conversationId: 'conv-1',
    entries: [
      {
        iteration: 0,
        toolCalls: [
          {
            toolName: 'read_file',
            argsSummary: '{"path":"a.ts"}',
            resultSummary: '文件内容',
            durationMs: 50,
            success: true,
          },
        ],
        iterationDurationMs: 100,
      },
    ],
    totalDurationMs: 100,
    totalToolCallCount: 1,
    successCount: 1,
    failureCount: 0,
    createdAt: Date.now(),
    ...overrides,
  }
}

/** 构造一个路由 4 类请求的 mock LLM（语义/生成/基线评分/变体评分） */
function buildMockLlmForRun() {
  let scoreCallIndex = 0
  return vi.fn().mockImplementation(async (prompt: string) => {
    if (prompt.includes('语义')) {
      return JSON.stringify({ preserved: true, reason: '保留了原始目的' })
    }
    if (prompt.includes('生成')) {
      return '改进版本1\n---\n改进版本2\n---\n改进版本3'
    }
    scoreCallIndex++
    if (scoreCallIndex === 1) {
      return JSON.stringify({
        adherence: 0.5,
        correctness: 0.5,
        conciseness: 0.5,
        overall: 0.5,
      })
    }
    return JSON.stringify({
      adherence: 0.8,
      correctness: 0.8,
      conciseness: 0.8,
      overall: 0.8,
    })
  })
}

// ============================================================================
// 测试
// ============================================================================

describe('evolution IPC', () => {
  it('注册 4 个通道', () => {
    const service = new SkillEvolutionService(db)
    registerEvolutionIpc(service, db)

    expect(handlers.has('evolution:run')).toBe(true)
    expect(handlers.has('evolution:history')).toBe(true)
    expect(handlers.has('evolution:rollback')).toBe(true)
    expect(handlers.has('evolution:compare')).toBe(true)
  })

  // --------------------------------------------------------------------------
  // evolution:run
  // --------------------------------------------------------------------------
  describe('evolution:run', () => {
    it('调用 service.runEvolution 返回结果', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      const service = new SkillEvolutionService(db, buildMockLlmForRun())
      registerEvolutionIpc(service, db)

      const handler = handlers.get('evolution:run')!
      const result = (await handler(null, { skillId: 'skill-1' })) as {
        improved: boolean
        baselineScore: number
        run: { status: string }
      }

      expect(result.improved).toBe(true)
      expect(result.baselineScore).toBe(0.5)
      expect(result.run.status).toBe('completed')
    })

    it('未注入 service 时使用默认 getDb 构造（兼容性）', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      // 不注入 service，仅注入 db（生产环境从 getDb 构造）
      registerEvolutionIpc(undefined, db)

      const handler = handlers.get('evolution:run')!
      // 未提供 LLM，runEvolution 仍可完成（基线 0 分，无变体生成，improved=false）
      const result = (await handler(null, { skillId: 'skill-1' })) as {
        improved: boolean
        run: { status: string }
      }

      expect(result.improved).toBe(false)
      expect(result.run.status).toBe('completed')
    })

    it('未注入 service 但传入 providerId/model 时,默认构造的 service 会调用 LLM 完成进化', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      // 模拟 chatWithProvider 的流式响应：按 prompt 内容路由不同 LLM 回复
      let scoreCallIndex = 0
      mockChatWithProvider.mockImplementation(async function* (
        _providerId: string,
        params: { messages: Array<{ role: string; content: string }> },
      ): AsyncGenerator<ChatChunk> {
        const userContent = params.messages.find((m) => m.role === 'user')?.content || ''

        // 语义保留检查
        if (userContent.includes('语义')) {
          yield { content: JSON.stringify({ preserved: true, reason: '保留了原始目的' }) }
          return
        }
        // 变体生成
        if (userContent.includes('生成')) {
          yield { content: '改进版本1\n---\n改进版本2\n---\n改进版本3' }
          return
        }
        // 评分：第一次是基线（低分），后续是变体（高分）
        scoreCallIndex++
        if (scoreCallIndex === 1) {
          yield {
            content: JSON.stringify({
              adherence: 0.5,
              correctness: 0.5,
              conciseness: 0.5,
              overall: 0.5,
            }),
          }
        } else {
          yield {
            content: JSON.stringify({
              adherence: 0.8,
              correctness: 0.8,
              conciseness: 0.8,
              overall: 0.8,
            }),
          }
        }
      })

      // 不注入 service，仅注入 db（生产环境从 getDb 构造）
      registerEvolutionIpc(undefined, db)

      const handler = handlers.get('evolution:run')!
      // 传入 providerId 和 model，使 IPC handler 构造 llmCaller
      const result = (await handler(null, {
        skillId: 'skill-1',
        providerId: 'test-provider',
        model: 'test-model',
      })) as {
        improved: boolean
        baselineScore: number
        run: { status: string }
      }

      // chatWithProvider 应被调用（LLM 被实际使用）
      expect(mockChatWithProvider).toHaveBeenCalled()
      // 进化应产生改进（基线 0.5 → 变体 0.8，达到 10% 提升阈值）
      expect(result.improved).toBe(true)
      expect(result.baselineScore).toBe(0.5)
      expect(result.run.status).toBe('completed')
    })
  })

  // --------------------------------------------------------------------------
  // evolution:history
  // --------------------------------------------------------------------------
  describe('evolution:history', () => {
    it('返回指定技能的进化运行历史', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      const service = new SkillEvolutionService(db, buildMockLlmForRun())
      // 先跑一次进化产生历史
      await service.runEvolution({ skillId: 'skill-1' })

      registerEvolutionIpc(service, db)
      const handler = handlers.get('evolution:history')!
      const runs = (await handler(null, 'skill-1')) as Array<{
        skillId: string
        status: string
      }>

      expect(runs.length).toBeGreaterThanOrEqual(1)
      expect(runs[0].skillId).toBe('skill-1')
      expect(runs[0].status).toBe('completed')
    })

    it('无历史时返回空数组', () => {
      const service = new SkillEvolutionService(db)
      registerEvolutionIpc(service, db)

      const handler = handlers.get('evolution:history')!
      const runs = handler(null, 'no-such-skill') as unknown[]

      expect(Array.isArray(runs)).toBe(true)
      expect(runs).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // evolution:rollback
  // --------------------------------------------------------------------------
  describe('evolution:rollback', () => {
    it('回滚到指定版本并返回 true', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      const service = new SkillEvolutionService(db, buildMockLlmForRun())
      // 先跑一次进化产生版本
      await service.runEvolution({ skillId: 'skill-1' })

      // 获取所有版本，找到备份版本（非当前）
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      const backupVersion = versions.find((v) => !v.isCurrent)
      expect(backupVersion).toBeDefined()

      registerEvolutionIpc(service, db)
      const handler = handlers.get('evolution:rollback')!
      const ok = handler(null, 'skill-1', backupVersion!.id) as boolean

      expect(ok).toBe(true)
      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current!.id).toBe(backupVersion!.id)
    })

    it('版本不存在时返回 false', () => {
      const service = new SkillEvolutionService(db)
      registerEvolutionIpc(service, db)

      const handler = handlers.get('evolution:rollback')!
      const ok = handler(null, 'skill-1', 'non-existent') as boolean

      expect(ok).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // evolution:compare
  // --------------------------------------------------------------------------
  describe('evolution:compare', () => {
    it('返回基线与最佳变体的对比数据', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      const service = new SkillEvolutionService(db, buildMockLlmForRun())
      const runResult = await service.runEvolution({ skillId: 'skill-1' })
      const runId = runResult.run.id

      registerEvolutionIpc(service, db)
      const handler = handlers.get('evolution:compare')!
      const comparison = (await handler(null, runId)) as {
        run: { id: string; baselineScore: number | null; bestScore: number | null }
        versions: Array<{ id: string; content: string }>
      }

      expect(comparison.run.id).toBe(runId)
      expect(comparison.run.baselineScore).toBe(0.5)
      expect(comparison.run.bestScore).toBe(0.8)
      expect(comparison.versions.length).toBeGreaterThanOrEqual(2)
    })

    it('runId 不存在时返回 null', () => {
      const service = new SkillEvolutionService(db)
      registerEvolutionIpc(service, db)

      const handler = handlers.get('evolution:compare')!
      const comparison = handler(null, 'non-existent-run')

      expect(comparison).toBeNull()
    })
  })
})
