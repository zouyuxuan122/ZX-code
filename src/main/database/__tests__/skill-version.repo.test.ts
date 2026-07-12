import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as skillVersionRepo from '../repositories/skill-version.repo'
import type { ScoreBreakdown, SkillVersion } from '@shared/types/skill-evolution'

let db: DBType

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

/** 构造一个评分明细对象 */
function buildScore(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    adherence: 0.8,
    correctness: 0.9,
    conciseness: 0.7,
    overall: 0.82,
    ...overrides,
  }
}

describe('skill-version.repo', () => {
  describe('insertVersion', () => {
    it('插入一条版本并返回 id', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: '技能内容 v1',
      })
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('首次插入时 version 自动设为 1', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: '技能内容 v1',
      })
      const row = db
        .prepare('SELECT version FROM skill_versions WHERE id = ?')
        .get(id) as { version: number }
      expect(row.version).toBe(1)
    })

    it('同一 skill 的后续插入自动递增 version', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2',
      })
      const id3 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v3',
      })
      const rows = db
        .prepare('SELECT id, version FROM skill_versions WHERE skill_id = ? ORDER BY version')
        .all('skill-1') as Array<{ id: string; version: number }>
      expect(rows).toHaveLength(3)
      expect(rows[0].version).toBe(1)
      expect(rows[1].version).toBe(2)
      expect(rows[2].version).toBe(3)
      // 三个 id 互不相同
      const ids = new Set([id1, id2, id3])
      expect(ids.size).toBe(3)
    })

    it('不同 skill 的 version 计数互不影响', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-A', content: 'a1' })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-A', content: 'a2' })
      const idB1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-B',
        content: 'b1',
      })
      const row = db
        .prepare('SELECT version FROM skill_versions WHERE id = ?')
        .get(idB1) as { version: number }
      expect(row.version).toBe(1)
    })

    it('写入 score 与 score_breakdown (JSON 字符串)', () => {
      const score = 0.85
      const breakdown = buildScore({ overall: 0.85 })
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
        score,
        scoreBreakdown: breakdown,
      })
      const row = db
        .prepare('SELECT score, score_breakdown FROM skill_versions WHERE id = ?')
        .get(id) as { score: number | null; score_breakdown: string | null }
      expect(row.score).toBe(0.85)
      expect(row.score_breakdown).not.toBeNull()
      const parsed = JSON.parse(row.score_breakdown!) as ScoreBreakdown
      expect(parsed.overall).toBe(0.85)
      expect(parsed.adherence).toBe(0.8)
    })

    it('写入 created_reason', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
        createdReason: '初始版本',
      })
      const row = db
        .prepare('SELECT created_reason FROM skill_versions WHERE id = ?')
        .get(id) as { created_reason: string | null }
      expect(row.created_reason).toBe('初始版本')
    })

    it('score / score_breakdown / created_reason 可选,缺省为 NULL', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const row = db
        .prepare('SELECT score, score_breakdown, created_reason FROM skill_versions WHERE id = ?')
        .get(id) as {
          score: number | null
          score_breakdown: string | null
          created_reason: string | null
        }
      expect(row.score).toBeNull()
      expect(row.score_breakdown).toBeNull()
      expect(row.created_reason).toBeNull()
    })

    it('is_current 默认为 0', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const row = db
        .prepare('SELECT is_current FROM skill_versions WHERE id = ?')
        .get(id) as { is_current: number }
      expect(row.is_current).toBe(0)
    })

    it('created_at 自动写入', () => {
      const before = Date.now()
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const after = Date.now()
      const row = db
        .prepare('SELECT created_at FROM skill_versions WHERE id = ?')
        .get(id) as { created_at: number }
      expect(row.created_at).toBeGreaterThanOrEqual(before)
      expect(row.created_at).toBeLessThanOrEqual(after)
    })
  })

  describe('getVersions', () => {
    it('返回指定 skill 的全部版本 (按 version 倒序)', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v1' })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v2' })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v3' })
      // 另一个 skill 的版本不应出现
      skillVersionRepo.insertVersion(db, { skillId: 'skill-2', content: 'other' })

      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      expect(versions).toHaveLength(3)
      // 倒序:version 大的在前
      expect(versions[0].version).toBe(3)
      expect(versions[1].version).toBe(2)
      expect(versions[2].version).toBe(1)
      // 全部属于 skill-1
      expect(versions.every((v) => v.skillId === 'skill-1')).toBe(true)
    })

    it('返回的 SkillVersion 字段完整映射 (snake_case -> camelCase)', () => {
      const breakdown = buildScore({ overall: 0.9 })
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: '内容',
        score: 0.9,
        scoreBreakdown: breakdown,
        createdReason: '测试原因',
      })
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      expect(versions).toHaveLength(1)
      const v = versions[0]
      expect(v.id).toBe(id)
      expect(v.skillId).toBe('skill-1')
      expect(v.version).toBe(1)
      expect(v.content).toBe('内容')
      expect(v.score).toBe(0.9)
      expect(v.scoreBreakdown).not.toBeNull()
      expect(v.scoreBreakdown!.overall).toBe(0.9)
      expect(v.createdReason).toBe('测试原因')
      expect(v.isCurrent).toBe(false)
      expect(typeof v.createdAt).toBe('number')
    })

    it('scoreBreakdown 为 NULL 时映射为 null', () => {
      skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      expect(versions[0].scoreBreakdown).toBeNull()
      expect(versions[0].score).toBeNull()
      expect(versions[0].createdReason).toBeNull()
    })

    it('is_current=1 时映射为 true', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      db.prepare('UPDATE skill_versions SET is_current = 1 WHERE id = ?').run(id)
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      expect(versions[0].isCurrent).toBe(true)
    })

    it('无版本时返回空数组', () => {
      const versions = skillVersionRepo.getVersions(db, 'no-such-skill')
      expect(versions).toEqual([])
    })
  })

  describe('getLatestVersion', () => {
    it('返回 version 值最大的版本', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v1' })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v2' })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v3' })

      const latest = skillVersionRepo.getLatestVersion(db, 'skill-1')
      expect(latest).not.toBeNull()
      expect(latest!.version).toBe(3)
      expect(latest!.content).toBe('v3')
    })

    it('仅一条版本时返回该版本', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'only' })
      const latest = skillVersionRepo.getLatestVersion(db, 'skill-1')
      expect(latest).not.toBeNull()
      expect(latest!.version).toBe(1)
    })

    it('无版本时返回 null', () => {
      const latest = skillVersionRepo.getLatestVersion(db, 'no-such-skill')
      expect(latest).toBeNull()
    })
  })

  describe('getCurrentVersion', () => {
    it('返回 is_current=1 的版本', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v2' })
      // 手动设置 v1 为 current
      db.prepare('UPDATE skill_versions SET is_current = 1 WHERE id = ?').run(id1)

      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current).not.toBeNull()
      expect(current!.id).toBe(id1)
      expect(current!.version).toBe(1)
      expect(current!.isCurrent).toBe(true)
    })

    it('无 current 版本时返回 null', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v1' })
      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current).toBeNull()
    })

    it('无版本时返回 null', () => {
      const current = skillVersionRepo.getCurrentVersion(db, 'no-such-skill')
      expect(current).toBeNull()
    })
  })

  describe('setCurrentVersion', () => {
    it('将指定版本设为 is_current=1', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      skillVersionRepo.setCurrentVersion(db, id1)
      const row = db
        .prepare('SELECT is_current FROM skill_versions WHERE id = ?')
        .get(id1) as { is_current: number }
      expect(row.is_current).toBe(1)
    })

    it('将同 skill 其他版本的 is_current 置为 0', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2',
      })
      // 先把 v1 设为 current
      skillVersionRepo.setCurrentVersion(db, id1)
      // 再把 v2 设为 current
      skillVersionRepo.setCurrentVersion(db, id2)

      const rows = db
        .prepare('SELECT id, is_current FROM skill_versions WHERE skill_id = ?')
        .all('skill-1') as Array<{ id: string; is_current: number }>
      const map = new Map(rows.map((r) => [r.id, r.is_current]))
      expect(map.get(id1)).toBe(0)
      expect(map.get(id2)).toBe(1)
    })

    it('不影响其他 skill 的 is_current 状态', () => {
      const idA = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-A',
        content: 'a',
      })
      const idB = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-B',
        content: 'b',
      })
      skillVersionRepo.setCurrentVersion(db, idA)
      skillVersionRepo.setCurrentVersion(db, idB)

      const rowA = db
        .prepare('SELECT is_current FROM skill_versions WHERE id = ?')
        .get(idA) as { is_current: number }
      // A 仍应为 current
      expect(rowA.is_current).toBe(1)
    })

    it('通过 getCurrentVersion 可立即读取到新设置的 current', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      skillVersionRepo.setCurrentVersion(db, id1)
      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current).not.toBeNull()
      expect(current!.id).toBe(id1)
    })
  })

  describe('rollbackVersion', () => {
    it('将指定版本设为 current 并返回该版本', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2',
      })
      // 先把 v2 设为 current
      skillVersionRepo.setCurrentVersion(db, id2)
      // 回滚到 v1
      const rolled = skillVersionRepo.rollbackVersion(db, 'skill-1', id1)
      expect(rolled).not.toBeNull()
      expect(rolled!.id).toBe(id1)
      expect(rolled!.version).toBe(1)
      expect(rolled!.isCurrent).toBe(true)
    })

    it('回滚后其他版本的 is_current 被清除', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2',
      })
      skillVersionRepo.setCurrentVersion(db, id2)
      skillVersionRepo.rollbackVersion(db, 'skill-1', id1)

      const rows = db
        .prepare('SELECT id, is_current FROM skill_versions WHERE skill_id = ?')
        .all('skill-1') as Array<{ id: string; is_current: number }>
      const map = new Map(rows.map((r) => [r.id, r.is_current]))
      expect(map.get(id1)).toBe(1)
      expect(map.get(id2)).toBe(0)
    })

    it('versionId 不存在时返回 null', () => {
      skillVersionRepo.insertVersion(db, { skillId: 'skill-1', content: 'v1' })
      const rolled = skillVersionRepo.rollbackVersion(db, 'skill-1', 'non-existent-id')
      expect(rolled).toBeNull()
    })

    it('回滚后 getCurrentVersion 返回回滚目标', () => {
      const id1 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
      })
      const id2 = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v2',
      })
      skillVersionRepo.setCurrentVersion(db, id2)
      skillVersionRepo.rollbackVersion(db, 'skill-1', id1)
      const current = skillVersionRepo.getCurrentVersion(db, 'skill-1')
      expect(current).not.toBeNull()
      expect(current!.id).toBe(id1)
    })
  })

  describe('类型完整性', () => {
    it('返回的 SkillVersion 满足接口契约', () => {
      const id = skillVersionRepo.insertVersion(db, {
        skillId: 'skill-1',
        content: 'v1',
        score: 0.5,
        scoreBreakdown: buildScore(),
        createdReason: '初始',
      })
      const versions = skillVersionRepo.getVersions(db, 'skill-1')
      const v: SkillVersion = versions[0]
      expect(v.id).toBe(id)
      expect(v.skillId).toBe('skill-1')
      expect(typeof v.version).toBe('number')
      expect(typeof v.content).toBe('string')
      expect(typeof v.isCurrent).toBe('boolean')
      expect(typeof v.createdAt).toBe('number')
    })
  })
})
