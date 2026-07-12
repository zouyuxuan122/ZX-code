import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as userProfileRepo from '../repositories/user-profile.repo'
import type { UserProfileEntry, ProfileDimension } from '@shared/types/user-profile'

let db: DBType

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

describe('user-profile.repo', () => {
  describe('getProfile', () => {
    it('空表返回空数组', () => {
      expect(userProfileRepo.getProfile(db)).toEqual([])
    })

    it('返回全部画像条目', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'tech_stack',
        value: 'TypeScript, React',
      })
      userProfileRepo.upsertDimension(db, {
        dimension: 'language_preference',
        value: '中文',
      })
      const rows = userProfileRepo.getProfile(db)
      expect(rows).toHaveLength(2)
      expect(rows.map(r => r.dimension).sort()).toEqual(['language_preference', 'tech_stack'])
    })
  })

  describe('getDimension', () => {
    it('维度不存在时返回 null', () => {
      expect(userProfileRepo.getDimension(db, 'tech_stack')).toBeNull()
    })

    it('返回指定维度的单条记录', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'tech_stack',
        value: 'TypeScript',
        confidence: 0.9,
        source: 'auto',
      })
      const row = userProfileRepo.getDimension(db, 'tech_stack')
      expect(row).not.toBeNull()
      expect(row!.dimension).toBe('tech_stack')
      expect(row!.value).toBe('TypeScript')
      expect(row!.confidence).toBe(0.9)
      expect(row!.source).toBe('auto')
    })
  })

  describe('upsertDimension', () => {
    it('新维度执行插入', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'coding_style',
        value: '函数式',
        confidence: 0.8,
        source: 'auto',
      })
      const row = userProfileRepo.getDimension(db, 'coding_style')
      expect(row).not.toBeNull()
      expect(row!.value).toBe('函数式')
      expect(row!.confidence).toBe(0.8)
      expect(row!.source).toBe('auto')
      expect(row!.id).toBeDefined()
      expect(row!.createdAt).toBeGreaterThan(0)
      expect(row!.updatedAt).toBeGreaterThanOrEqual(row!.createdAt)
    })

    it('未提供 confidence/source 时使用默认值', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'tech_stack',
        value: 'Rust',
      })
      const row = userProfileRepo.getDimension(db, 'tech_stack')
      expect(row).not.toBeNull()
      expect(row!.confidence).toBe(0.5)
      expect(row!.source).toBe('auto')
    })

    it('已存在维度执行更新(value/confidence/source/updated_at 变化,created_at 保留)', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'tech_stack',
        value: 'TypeScript',
        confidence: 0.5,
        source: 'auto',
      })
      const original = userProfileRepo.getDimension(db, 'tech_stack')!

      // 等待时间推进,确保 updated_at 变化
      const waitMs = 5
      const start = Date.now()
      while (Date.now() - start < waitMs) {
        // busy wait
      }

      userProfileRepo.upsertDimension(db, {
        dimension: 'tech_stack',
        value: 'TypeScript, React, Node',
        confidence: 0.9,
        source: 'manual',
      })
      const updated = userProfileRepo.getDimension(db, 'tech_stack')!

      expect(updated.value).toBe('TypeScript, React, Node')
      expect(updated.confidence).toBe(0.9)
      expect(updated.source).toBe('manual')
      expect(updated.updatedAt).toBeGreaterThan(original.updatedAt)
      // created_at 应保留原值
      expect(updated.createdAt).toBe(original.createdAt)
      // id 不变(同一条记录)
      expect(updated.id).toBe(original.id)
      // 仍然只有一条记录
      expect(userProfileRepo.getProfile(db)).toHaveLength(1)
    })
  })

  describe('getAllDimensions', () => {
    it('返回所有条目(与 getProfile 等价)', () => {
      const dims: ProfileDimension[] = [
        'tech_stack',
        'coding_style',
        'work_pattern',
      ]
      for (const d of dims) {
        userProfileRepo.upsertDimension(db, { dimension: d, value: d })
      }
      const all = userProfileRepo.getAllDimensions(db)
      expect(all).toHaveLength(3)
    })

    it('空表返回空数组', () => {
      expect(userProfileRepo.getAllDimensions(db)).toEqual([])
    })
  })

  describe('clearDimension', () => {
    it('删除指定维度单条记录', () => {
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: 'TS' })
      userProfileRepo.upsertDimension(db, { dimension: 'coding_style', value: '函数式' })

      userProfileRepo.clearDimension(db, 'tech_stack')

      expect(userProfileRepo.getDimension(db, 'tech_stack')).toBeNull()
      expect(userProfileRepo.getDimension(db, 'coding_style')).not.toBeNull()
      expect(userProfileRepo.getProfile(db)).toHaveLength(1)
    })

    it('删除不存在的维度不报错', () => {
      expect(() => userProfileRepo.clearDimension(db, 'tech_stack')).not.toThrow()
    })
  })

  describe('clearProfile', () => {
    it('删除全部画像条目', () => {
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: 'TS' })
      userProfileRepo.upsertDimension(db, { dimension: 'coding_style', value: '函数式' })

      userProfileRepo.clearProfile(db)

      expect(userProfileRepo.getProfile(db)).toEqual([])
    })

    it('空表调用不报错', () => {
      expect(() => userProfileRepo.clearProfile(db)).not.toThrow()
    })
  })

  describe('返回数据结构完整性', () => {
    it('返回的 UserProfileEntry 字段完整且类型正确', () => {
      userProfileRepo.upsertDimension(db, {
        dimension: 'expertise_level',
        value: '高级',
        confidence: 0.95,
        source: 'manual',
      })
      const rows = userProfileRepo.getProfile(db) as UserProfileEntry[]
      const row = rows[0]
      expect(typeof row.id).toBe('string')
      expect(row.dimension).toBe('expertise_level')
      expect(typeof row.value).toBe('string')
      expect(typeof row.confidence).toBe('number')
      expect(row.source === 'auto' || row.source === 'manual').toBe(true)
      expect(typeof row.createdAt).toBe('number')
      expect(typeof row.updatedAt).toBe('number')
    })
  })
})
