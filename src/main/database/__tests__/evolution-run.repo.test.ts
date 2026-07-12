import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as evolutionRunRepo from '../repositories/evolution-run.repo'
import * as skillVersionRepo from '../repositories/skill-version.repo'
import type { EvolutionRun } from '@shared/types/skill-evolution'

let db: DBType
let skillId: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  // 先插入一条 skill_version (evolution_runs.skill_id 在语义上引用 skill_versions)
  skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'baseline content' })
  skillId = 'skill-1'
})

describe('evolution-run.repo', () => {
  describe('insertRun', () => {
    it('插入一条运行并返回 id', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('status 默认为 running', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const row = db
        .prepare('SELECT status FROM evolution_runs WHERE id = ?')
        .get(id) as { status: string }
      expect(row.status).toBe('running')
    })

    it('iterations 默认为 0', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const row = db
        .prepare('SELECT iterations FROM evolution_runs WHERE id = ?')
        .get(id) as { iterations: number }
      expect(row.iterations).toBe(0)
    })

    it('variant_count 默认为 0', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const row = db
        .prepare('SELECT variant_count FROM evolution_runs WHERE id = ?')
        .get(id) as { variant_count: number }
      expect(row.variant_count).toBe(0)
    })

    it('baseline_score / best_score / best_variant_id / summary / completed_at 默认为 NULL', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const row = db
        .prepare(
          'SELECT baseline_score, best_score, best_variant_id, summary, completed_at FROM evolution_runs WHERE id = ?',
        )
        .get(id) as {
          baseline_score: number | null
          best_score: number | null
          best_variant_id: string | null
          summary: string | null
          completed_at: number | null
        }
      expect(row.baseline_score).toBeNull()
      expect(row.best_score).toBeNull()
      expect(row.best_variant_id).toBeNull()
      expect(row.summary).toBeNull()
      expect(row.completed_at).toBeNull()
    })

    it('created_at 自动写入', () => {
      const before = Date.now()
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const after = Date.now()
      const row = db
        .prepare('SELECT created_at FROM evolution_runs WHERE id = ?')
        .get(id) as { created_at: number }
      expect(row.created_at).toBeGreaterThanOrEqual(before)
      expect(row.created_at).toBeLessThanOrEqual(after)
    })

    it('skill_id 正确写入', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const row = db
        .prepare('SELECT skill_id FROM evolution_runs WHERE id = ?')
        .get(id) as { skill_id: string }
      expect(row.skill_id).toBe(skillId)
    })
  })

  describe('getRun', () => {
    it('根据 id 返回单条 EvolutionRun', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const run = evolutionRunRepo.getRun(db, id)
      expect(run).not.toBeNull()
      expect(run!.id).toBe(id)
      expect(run!.skillId).toBe(skillId)
      expect(run!.status).toBe('running')
      expect(run!.iterations).toBe(0)
      expect(run!.variantCount).toBe(0)
    })

    it('完整字段映射 (snake_case -> camelCase)', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      // 手动更新一些字段以验证映射
      db.prepare(
        `UPDATE evolution_runs SET
           baseline_score = ?, best_score = ?, best_variant_id = ?,
           variant_count = ?, summary = ?, iterations = ?
         WHERE id = ?`,
      ).run(0.5, 0.8, 'variant-xyz', 3, '运行总结', 5, id)

      const run = evolutionRunRepo.getRun(db, id)
      expect(run).not.toBeNull()
      expect(run!.baselineScore).toBe(0.5)
      expect(run!.bestScore).toBe(0.8)
      expect(run!.bestVariantId).toBe('variant-xyz')
      expect(run!.variantCount).toBe(3)
      expect(run!.summary).toBe('运行总结')
      expect(run!.iterations).toBe(5)
    })

    it('id 不存在时返回 null', () => {
      const run = evolutionRunRepo.getRun(db, 'non-existent-id')
      expect(run).toBeNull()
    })
  })

  describe('getRuns', () => {
    it('返回全部运行 (按 created_at 倒序)', () => {
      evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.insertRun(db, { skillId })

      const runs = evolutionRunRepo.getRuns(db)
      expect(runs).toHaveLength(3)
      // 倒序:后插入的在前
      expect(runs[0].createdAt).toBeGreaterThanOrEqual(runs[1].createdAt)
      expect(runs[1].createdAt).toBeGreaterThanOrEqual(runs[2].createdAt)
    })

    it('按 skillId 过滤', () => {
      // 为 skill-1 插入 2 条
      evolutionRunRepo.insertRun(db, { skillId: 'skill-1' })
      evolutionRunRepo.insertRun(db, { skillId: 'skill-1' })
      // 为 skill-2 插入 1 条 (需先创建 skill_version 满足 FK)
      skillVersionRepo.insertVersion(db, { skillId: 'skill-2', content: 'other' })
      evolutionRunRepo.insertRun(db, { skillId: 'skill-2' })

      const runs = evolutionRunRepo.getRuns(db, 'skill-1')
      expect(runs).toHaveLength(2)
      expect(runs.every((r) => r.skillId === 'skill-1')).toBe(true)
    })

    it('支持 limit 参数', () => {
      for (let i = 0; i < 5; i++) {
        evolutionRunRepo.insertRun(db, { skillId })
      }
      const runs = evolutionRunRepo.getRuns(db, undefined, 2)
      expect(runs).toHaveLength(2)
    })

    it('同时指定 skillId 与 limit', () => {
      for (let i = 0; i < 4; i++) {
        evolutionRunRepo.insertRun(db, { skillId: 'skill-1' })
      }
      skillVersionRepo.insertVersion(db, { skillId: 'skill-2', content: 'other' })
      evolutionRunRepo.insertRun(db, { skillId: 'skill-2' })

      const runs = evolutionRunRepo.getRuns(db, 'skill-1', 2)
      expect(runs).toHaveLength(2)
      expect(runs.every((r) => r.skillId === 'skill-1')).toBe(true)
    })

    it('无运行时返回空数组', () => {
      const runs = evolutionRunRepo.getRuns(db, 'skill-no-runs')
      expect(runs).toEqual([])
    })
  })

  describe('updateRunStatus', () => {
    it('更新 status 字段', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunStatus(db, id, 'failed')
      const row = db
        .prepare('SELECT status FROM evolution_runs WHERE id = ?')
        .get(id) as { status: string }
      expect(row.status).toBe('failed')
    })

    it('可通过 getRun 读到新状态', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunStatus(db, id, 'cancelled')
      const run = evolutionRunRepo.getRun(db, id)
      expect(run!.status).toBe('cancelled')
    })

    it('支持设为 completed', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunStatus(db, id, 'completed')
      const run = evolutionRunRepo.getRun(db, id)
      expect(run!.status).toBe('completed')
    })
  })

  describe('updateRunResults', () => {
    it('更新 baseline_score 与 best_score', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunResults(db, id, {
        baselineScore: 0.5,
        bestScore: 0.8,
      })
      const row = db
        .prepare('SELECT baseline_score, best_score FROM evolution_runs WHERE id = ?')
        .get(id) as { baseline_score: number | null; best_score: number | null }
      expect(row.baseline_score).toBe(0.5)
      expect(row.best_score).toBe(0.8)
    })

    it('更新 best_variant_id 与 variant_count', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunResults(db, id, {
        bestVariantId: 'variant-xyz',
        variantCount: 4,
      })
      const row = db
        .prepare('SELECT best_variant_id, variant_count FROM evolution_runs WHERE id = ?')
        .get(id) as { best_variant_id: string | null; variant_count: number }
      expect(row.best_variant_id).toBe('variant-xyz')
      expect(row.variant_count).toBe(4)
    })

    it('更新 summary', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunResults(db, id, { summary: '进化完成总结' })
      const row = db
        .prepare('SELECT summary FROM evolution_runs WHERE id = ?')
        .get(id) as { summary: string | null }
      expect(row.summary).toBe('进化完成总结')
    })

    it('一次更新所有字段', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunResults(db, id, {
        baselineScore: 0.4,
        bestScore: 0.75,
        bestVariantId: 'var-1',
        variantCount: 6,
        summary: '全部字段',
      })
      const run = evolutionRunRepo.getRun(db, id)
      expect(run!.baselineScore).toBe(0.4)
      expect(run!.bestScore).toBe(0.75)
      expect(run!.bestVariantId).toBe('var-1')
      expect(run!.variantCount).toBe(6)
      expect(run!.summary).toBe('全部字段')
    })

    it('部分更新:只传部分字段不覆盖其他字段', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.updateRunResults(db, id, { baselineScore: 0.5 })
      evolutionRunRepo.updateRunResults(db, id, { bestScore: 0.9 })
      const run = evolutionRunRepo.getRun(db, id)
      expect(run!.baselineScore).toBe(0.5)
      expect(run!.bestScore).toBe(0.9)
    })
  })

  describe('completeRun', () => {
    it('设置 status=completed', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.completeRun(db, id, '完成')
      const row = db
        .prepare('SELECT status FROM evolution_runs WHERE id = ?')
        .get(id) as { status: string }
      expect(row.status).toBe('completed')
    })

    it('设置 completed_at 为当前时间', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const before = Date.now()
      evolutionRunRepo.completeRun(db, id, '完成')
      const after = Date.now()
      const row = db
        .prepare('SELECT completed_at FROM evolution_runs WHERE id = ?')
        .get(id) as { completed_at: number | null }
      expect(row.completed_at).not.toBeNull()
      expect(row.completed_at!).toBeGreaterThanOrEqual(before)
      expect(row.completed_at!).toBeLessThanOrEqual(after)
    })

    it('写入 summary', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.completeRun(db, id, '最终总结内容')
      const row = db
        .prepare('SELECT summary FROM evolution_runs WHERE id = ?')
        .get(id) as { summary: string | null }
      expect(row.summary).toBe('最终总结内容')
    })

    it('可通过 getRun 读到完整完成状态', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      evolutionRunRepo.completeRun(db, id, '完成总结')
      const run = evolutionRunRepo.getRun(db, id)
      expect(run!.status).toBe('completed')
      expect(run!.summary).toBe('完成总结')
      expect(run!.completedAt).not.toBeNull()
      expect(typeof run!.completedAt).toBe('number')
    })
  })

  describe('类型完整性', () => {
    it('返回的 EvolutionRun 满足接口契约', () => {
      const id = evolutionRunRepo.insertRun(db, { skillId })
      const run: EvolutionRun | null = evolutionRunRepo.getRun(db, id)
      expect(run).not.toBeNull()
      expect(typeof run!.id).toBe('string')
      expect(typeof run!.skillId).toBe('string')
      expect(typeof run!.status).toBe('string')
      expect(typeof run!.iterations).toBe('number')
      expect(typeof run!.variantCount).toBe('number')
      expect(typeof run!.createdAt).toBe('number')
      // 可空字段
      expect(run!.baselineScore === null || typeof run!.baselineScore === 'number').toBe(true)
      expect(run!.bestScore === null || typeof run!.bestScore === 'number').toBe(true)
      expect(run!.bestVariantId === null || typeof run!.bestVariantId === 'string').toBe(true)
      expect(run!.summary === null || typeof run!.summary === 'string').toBe(true)
      expect(run!.completedAt === null || typeof run!.completedAt === 'number').toBe(true)
    })
  })
})
