import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import type { AgentTrace } from '@shared/types/trace'
import type { SclExtension } from '@shared/types/scl'

// Mock scl.service（依赖全局 getDb + electron net，需隔离）
vi.mock('../scl.service', () => ({
  listSclExtensions: vi.fn(),
  updateSclExtension: vi.fn(),
}))

// Mock trace.repo（按任务要求 mock trace.repo 调用）
vi.mock('../../database/repositories/trace.repo', () => ({
  getTracesByTool: vi.fn(),
  getFailedTraces: vi.fn(),
  queryTraces: vi.fn(),
}))

import { SkillEvolutionService, type EvalEntry } from '../skill-evolution.service'
import * as sclService from '../scl.service'
import * as traceRepo from '../../database/repositories/trace.repo'
import * as skillVersionRepo from '../../database/repositories/skill-version.repo'
import * as evolutionRunRepo from '../../database/repositories/evolution-run.repo'

let db: DBType

beforeEach(() => {
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

function buildEvalEntry(overrides: Partial<EvalEntry> = {}): EvalEntry {
  return {
    input: '审查 a.ts 的代码质量',
    expectedBehavior: '按技能流程检查四个维度',
    traceSummary: '调用了 read_file，成功读取文件',
    success: true,
    ...overrides,
  }
}

// ============================================================================
// 测试
// ============================================================================

describe('SkillEvolutionService', () => {
  // --------------------------------------------------------------------------
  // 1. buildEvalDataset
  // --------------------------------------------------------------------------
  describe('buildEvalDataset', () => {
    it('从 traces 构建 EvalEntry 数组', async () => {
      const traces = [
        buildTrace({ failureCount: 0, successCount: 1 }),
        buildTrace({ failureCount: 1, successCount: 0 }),
      ]
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue(traces)

      const service = new SkillEvolutionService(db)
      const dataset = await service.buildEvalDataset('skill-1')

      expect(dataset).toHaveLength(2)
      // 成功的 trace → success=true
      expect(dataset[0].success).toBe(true)
      // 失败的 trace → success=false
      expect(dataset[1].success).toBe(false)
      // 每条都有非空字段
      for (const entry of dataset) {
        expect(entry.input).toBeTruthy()
        expect(entry.expectedBehavior).toBeTruthy()
        expect(entry.traceSummary).toBeTruthy()
      }
    })

    it('无 traces 时通过 LLM 生成合成 eval 条目', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])

      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify([
          { input: '任务1: 审查代码', expectedBehavior: '按四维度检查' },
          { input: '任务2: 调试 bug', expectedBehavior: '按流程定位' },
        ]),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const dataset = await service.buildEvalDataset('skill-1')

      expect(dataset).toHaveLength(2)
      expect(dataset[0].input).toBe('任务1: 审查代码')
      expect(dataset[0].expectedBehavior).toBe('按四维度检查')
      expect(mockLlm).toHaveBeenCalledOnce()
    })
  })

  // --------------------------------------------------------------------------
  // 2. scoreWithJudge
  // --------------------------------------------------------------------------
  describe('scoreWithJudge', () => {
    it('调用 LLM 返回 ScoreBreakdown', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          adherence: 0.8,
          correctness: 0.9,
          conciseness: 0.7,
          overall: 0.82,
        }),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const score = await service.scoreWithJudge('技能内容', buildEvalEntry())

      expect(score.adherence).toBe(0.8)
      expect(score.correctness).toBe(0.9)
      expect(score.conciseness).toBe(0.7)
      expect(score.overall).toBe(0.82)
      expect(mockLlm).toHaveBeenCalledOnce()
    })

    it('LLM 返回无效 JSON 时返回默认低分', async () => {
      const mockLlm = vi.fn().mockResolvedValue('这不是 JSON')
      const service = new SkillEvolutionService(db, mockLlm)

      const score = await service.scoreWithJudge('技能内容', buildEvalEntry())

      expect(score.overall).toBeLessThanOrEqual(0.5)
      expect(score.adherence).toBeGreaterThanOrEqual(0)
      expect(score.correctness).toBeGreaterThanOrEqual(0)
      expect(score.conciseness).toBeGreaterThanOrEqual(0)
    })

    it('分数被限制在 0-1 范围内', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          adherence: 1.5,
          correctness: -0.3,
          conciseness: 0.8,
          overall: 2.0,
        }),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const score = await service.scoreWithJudge('技能内容', buildEvalEntry())

      expect(score.adherence).toBeLessThanOrEqual(1)
      expect(score.correctness).toBeGreaterThanOrEqual(0)
      expect(score.overall).toBeLessThanOrEqual(1)
    })
  })

  // --------------------------------------------------------------------------
  // 3. generateVariants
  // --------------------------------------------------------------------------
  describe('generateVariants', () => {
    it('调用 LLM 生成 3 个变体（--- 分隔）', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        '变体1内容\n---\n变体2内容\n---\n变体3内容',
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const variants = await service.generateVariants('原始技能', [
        buildEvalEntry({ success: false }),
      ])

      expect(variants).toHaveLength(3)
      expect(variants[0]).toBe('变体1内容')
      expect(variants[2]).toBe('变体3内容')
    })

    it('支持 JSON 数组格式返回', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify(['变体A', '变体B', '变体C']),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const variants = await service.generateVariants('原始技能', [])

      expect(variants).toHaveLength(3)
      expect(variants).toContain('变体A')
    })

    it('拒绝超过 15KB(15360 字符)的变体', async () => {
      const oversized = 'x'.repeat(15361)
      const mockLlm = vi.fn().mockResolvedValue(
        `正常变体A\n---\n${oversized}\n---\n正常变体C`,
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const variants = await service.generateVariants('原始技能', [])

      expect(variants).toHaveLength(2)
      expect(variants.every((v) => v.length <= 15360)).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // 4. checkSemanticPreservation
  // --------------------------------------------------------------------------
  describe('checkSemanticPreservation', () => {
    it('LLM 判定保留语义时返回 preserved=true', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          preserved: true,
          reason: '变体保留了原始技能的核心目的',
        }),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const result = await service.checkSemanticPreservation('原始内容', '变体内容')

      expect(result.preserved).toBe(true)
      expect(result.reason).toContain('保留')
    })

    it('LLM 判定偏离语义时返回 preserved=false', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          preserved: false,
          reason: '变体改变了技能的核心目的',
        }),
      )
      const service = new SkillEvolutionService(db, mockLlm)

      const result = await service.checkSemanticPreservation('原始内容', '变体内容')

      expect(result.preserved).toBe(false)
      expect(result.reason).toContain('改变')
    })

    it('LLM 返回无效 JSON 时默认 preserved=false', async () => {
      const mockLlm = vi.fn().mockResolvedValue('无效响应')
      const service = new SkillEvolutionService(db, mockLlm)

      const result = await service.checkSemanticPreservation('原始内容', '变体内容')

      expect(result.preserved).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // 5. runEvolution
  // --------------------------------------------------------------------------
  describe('runEvolution', () => {
    it('完整进化流程:基线低分→变体高分→部署最佳变体', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])
      vi.mocked(sclService.updateSclExtension).mockReturnValue(buildSkill())

      let scoreCallIndex = 0
      const mockLlm = vi.fn().mockImplementation(async (prompt: string) => {
        // 语义保留检查（优先匹配，因为变体内容可能包含"变体"字样）
        if (prompt.includes('语义')) {
          return JSON.stringify({ preserved: true, reason: '保留了原始目的' })
        }
        // 变体生成
        if (prompt.includes('生成')) {
          return '改进版本1\n---\n改进版本2\n---\n改进版本3'
        }
        // 评分：第一次是基线，后续是变体
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

      const service = new SkillEvolutionService(db, mockLlm)
      const result = await service.runEvolution({ skillId: 'skill-1' })

      // 结果正确
      expect(result.improved).toBe(true)
      expect(result.baselineScore).toBe(0.5)
      expect(result.bestVariant).not.toBeNull()
      expect(result.bestVariant!.score).toBe(0.8)
      expect(result.bestVariant!.isWinner).toBe(true)
      expect(result.allVariants).toHaveLength(3)

      // SCL 被更新
      expect(sclService.updateSclExtension).toHaveBeenCalled()

      // evolution_runs 记录已创建并完成
      expect(result.run.status).toBe('completed')
      expect(result.run.baselineScore).toBe(0.5)
      expect(result.run.bestScore).toBe(0.8)

      // skill_versions 表有记录
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      expect(versions.length).toBeGreaterThanOrEqual(1)

      // evolution_runs 表有记录
      const runs = evolutionRunRepo.getRuns(db, 'skill-1')
      expect(runs.length).toBeGreaterThanOrEqual(1)
    })

    it('变体未达 10% 提升阈值时不部署', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])

      let scoreCallIndex = 0
      const mockLlm = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('语义')) {
          return JSON.stringify({ preserved: true, reason: '保留' })
        }
        if (prompt.includes('生成')) {
          return '改进版本1\n---\n改进版本2\n---\n改进版本3'
        }
        scoreCallIndex++
        if (scoreCallIndex === 1) {
          // 基线 0.8
          return JSON.stringify({
            adherence: 0.8,
            correctness: 0.8,
            conciseness: 0.8,
            overall: 0.8,
          })
        }
        // 变体 0.82 < 0.88 (0.8 * 1.1)
        return JSON.stringify({
          adherence: 0.82,
          correctness: 0.82,
          conciseness: 0.82,
          overall: 0.82,
        })
      })

      const service = new SkillEvolutionService(db, mockLlm)
      const result = await service.runEvolution({ skillId: 'skill-1' })

      expect(result.improved).toBe(false)
      expect(result.baselineScore).toBe(0.8)
      // SCL 未被更新
      expect(sclService.updateSclExtension).not.toHaveBeenCalled()
    })

    it('所有变体未通过语义保留检查时不部署', async () => {
      vi.mocked(traceRepo.getTracesByTool).mockReturnValue([buildTrace()])
      vi.mocked(sclService.listSclExtensions).mockReturnValue([buildSkill()])

      const mockLlm = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('语义')) {
          return JSON.stringify({ preserved: false, reason: '偏离原始目的' })
        }
        if (prompt.includes('生成')) {
          return '改进版本1\n---\n改进版本2\n---\n改进版本3'
        }
        // 评分（仅基线，变体未通过语义检查不评分）
        return JSON.stringify({
          adherence: 0.5,
          correctness: 0.5,
          conciseness: 0.5,
          overall: 0.5,
        })
      })

      const service = new SkillEvolutionService(db, mockLlm)
      const result = await service.runEvolution({ skillId: 'skill-1' })

      expect(result.improved).toBe(false)
      expect(result.bestVariant).toBeNull()
      expect(sclService.updateSclExtension).not.toHaveBeenCalled()
    })
  })

  // --------------------------------------------------------------------------
  // 6. rollbackEvolution
  // --------------------------------------------------------------------------
  describe('rollbackEvolution', () => {
    it('回滚到指定版本并返回 true', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1 内容',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2 内容',
      })
      skillVersionRepo.setCurrentVersion(db, id2)

      const service = new SkillEvolutionService(db)
      const result = service.rollbackEvolution('skill-1', id1)

      expect(result).toBe(true)
      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current!.id).toBe(id1)
      expect(current!.content).toBe('v1 内容')
    })

    it('版本不存在时返回 false', () => {
      const service = new SkillEvolutionService(db)
      const result = service.rollbackEvolution('skill-1', 'non-existent-id')
      expect(result).toBe(false)
    })
  })
})
