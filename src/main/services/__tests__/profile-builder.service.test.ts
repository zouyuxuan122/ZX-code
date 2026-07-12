import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import { ProfileBuilderService } from '../profile-builder.service'
import * as userProfileRepo from '../../database/repositories/user-profile.repo'
import type { ProfileExtractionResult } from '@shared/types/user-profile'

let db: DBType
let service: ProfileBuilderService

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  service = new ProfileBuilderService(db)
})

describe('ProfileBuilderService', () => {
  describe('extractProfile', () => {
    it('调用 LLM 并解析返回 ProfileExtractionResult', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          dimensions: [
            { dimension: 'tech_stack', value: 'TypeScript, React', confidence: 0.9 },
            { dimension: 'language_preference', value: '中文', confidence: 0.85 },
          ],
        }),
      )
      const result = await service.extractProfile('user: 我用 TS 和 React\nassistant: 好的', mockLlm)
      expect(result).not.toBeNull()
      expect(result!.dimensions).toHaveLength(2)
      expect(result!.dimensions[0].dimension).toBe('tech_stack')
      expect(result!.dimensions[0].value).toBe('TypeScript, React')
      expect(mockLlm).toHaveBeenCalledOnce()
    })

    it('LLM 返回无效 JSON 时返回 null', async () => {
      const mockLlm = vi.fn().mockResolvedValue('这不是 JSON')
      const result = await service.extractProfile('对话内容', mockLlm)
      expect(result).toBeNull()
    })

    it('LLM 调用失败时返回 null', async () => {
      const mockLlm = vi.fn().mockRejectedValue(new Error('LLM 失败'))
      const result = await service.extractProfile('对话内容', mockLlm)
      expect(result).toBeNull()
    })

    it('空对话文本返回 null 且不调用 LLM', async () => {
      const mockLlm = vi.fn()
      const result = await service.extractProfile('', mockLlm)
      expect(result).toBeNull()
      expect(mockLlm).not.toHaveBeenCalled()
    })

    it('LLM 返回的 dimensions 缺失字段时过滤无效项', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          dimensions: [
            { dimension: 'tech_stack', value: 'TS', confidence: 0.9 },
            { dimension: 'invalid_dim', value: 'x' }, // confidence 缺失
            { value: '无维度' }, // dimension 缺失
          ],
        }),
      )
      const result = await service.extractProfile('对话', mockLlm)
      expect(result).not.toBeNull()
      // 仅保留 dimension + value + confidence 都存在的项
      expect(result!.dimensions.length).toBeLessThanOrEqual(3)
      expect(result!.dimensions.every(d => d.dimension && d.value && typeof d.confidence === 'number')).toBe(true)
    })
  })

  describe('mergeProfile', () => {
    it('对每个抽取维度调用 upsertDimension 写入数据库', () => {
      const extraction: ProfileExtractionResult = {
        dimensions: [
          { dimension: 'tech_stack', value: 'TypeScript, React', confidence: 0.9 },
          { dimension: 'coding_style', value: '函数式', confidence: 0.8 },
          { dimension: 'language_preference', value: '中文', confidence: 0.85 },
        ],
      }
      service.mergeProfile(extraction)

      const all = userProfileRepo.getProfile(db)
      expect(all).toHaveLength(3)
      expect(userProfileRepo.getDimension(db, 'tech_stack')!.value).toBe('TypeScript, React')
      expect(userProfileRepo.getDimension(db, 'coding_style')!.value).toBe('函数式')
      expect(userProfileRepo.getDimension(db, 'language_preference')!.value).toBe('中文')
    })

    it('已存在维度执行更新而非插入', () => {
      // 预置一条
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: '旧值', confidence: 0.3 })
      const extraction: ProfileExtractionResult = {
        dimensions: [
          { dimension: 'tech_stack', value: '新值', confidence: 0.9 },
        ],
      }
      service.mergeProfile(extraction)

      const all = userProfileRepo.getProfile(db)
      expect(all).toHaveLength(1)
      expect(userProfileRepo.getDimension(db, 'tech_stack')!.value).toBe('新值')
      expect(userProfileRepo.getDimension(db, 'tech_stack')!.confidence).toBe(0.9)
    })

    it('空抽取结果不写入任何记录', () => {
      service.mergeProfile({ dimensions: [] })
      expect(userProfileRepo.getProfile(db)).toEqual([])
    })
  })

  describe('buildProfileSummary', () => {
    it('空画像返回 raw 为空字符串的摘要', () => {
      const summary = service.buildProfileSummary()
      expect(summary.raw).toBe('')
    })

    it('汇总各维度信息并生成 ≤500 字符的 raw 字符串', () => {
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: 'TypeScript, React, Node.js' })
      userProfileRepo.upsertDimension(db, { dimension: 'coding_style', value: '函数式, 偏好不可变数据' })
      userProfileRepo.upsertDimension(db, { dimension: 'work_pattern', value: 'TDD' })
      userProfileRepo.upsertDimension(db, { dimension: 'communication_preference', value: '简洁直接' })
      userProfileRepo.upsertDimension(db, { dimension: 'expertise_level', value: '高级' })
      userProfileRepo.upsertDimension(db, { dimension: 'language_preference', value: '中文' })

      const summary = service.buildProfileSummary()
      expect(summary.raw.length).toBeLessThanOrEqual(500)
      expect(summary.raw).toContain('TypeScript')
      expect(summary.raw).toContain('函数式')
      expect(summary.raw).toContain('TDD')
      expect(summary.raw).toContain('简洁直接')
      expect(summary.raw).toContain('高级')
      expect(summary.raw).toContain('中文')
    })

    it('techStack/codingStyle/workPattern 解析为数组', () => {
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: 'TypeScript, React, Node.js' })
      userProfileRepo.upsertDimension(db, { dimension: 'coding_style', value: '函数式, 不可变' })
      userProfileRepo.upsertDimension(db, { dimension: 'work_pattern', value: 'TDD, 小步迭代' })

      const summary = service.buildProfileSummary()
      expect(Array.isArray(summary.techStack)).toBe(true)
      expect(summary.techStack.length).toBeGreaterThan(0)
      expect(Array.isArray(summary.codingStyle)).toBe(true)
      expect(Array.isArray(summary.workPattern)).toBe(true)
    })

    it('超长内容被截断至 ≤500 字符', () => {
      // 写入超长 value,确保 raw 仍 ≤500
      const longValue = '技术'.repeat(300)
      userProfileRepo.upsertDimension(db, { dimension: 'tech_stack', value: longValue })
      userProfileRepo.upsertDimension(db, { dimension: 'coding_style', value: longValue })

      const summary = service.buildProfileSummary()
      expect(summary.raw.length).toBeLessThanOrEqual(500)
    })
  })

  describe('完整流程: extract → merge → buildSummary', () => {
    it('从抽取到摘要的端到端流程', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          dimensions: [
            { dimension: 'tech_stack', value: 'TypeScript, Vitest', confidence: 0.9 },
            { dimension: 'coding_style', value: 'TDD', confidence: 0.85 },
            { dimension: 'expertise_level', value: '中级', confidence: 0.7 },
          ],
        }),
      )

      // 1. 抽取
      const extraction = await service.extractProfile('user: 我用 TS 写测试', mockLlm)
      expect(extraction).not.toBeNull()
      expect(extraction!.dimensions).toHaveLength(3)

      // 2. 合并
      service.mergeProfile(extraction!)
      expect(userProfileRepo.getProfile(db)).toHaveLength(3)

      // 3. 摘要
      const summary = service.buildProfileSummary()
      expect(summary.raw.length).toBeLessThanOrEqual(500)
      expect(summary.raw).toContain('TypeScript')
      expect(summary.raw).toContain('TDD')
      expect(summary.raw).toContain('中级')
    })
  })

  describe('maybeExtractAndMerge', () => {
    it('完整执行 extract → merge,数据库中出现画像条目', async () => {
      const mockLlm = vi.fn().mockResolvedValue(
        JSON.stringify({
          dimensions: [
            { dimension: 'tech_stack', value: 'Rust', confidence: 0.9 },
          ],
        }),
      )
      // 用带 llmCaller 的 service
      const svc = new ProfileBuilderService(db, mockLlm)
      await svc.maybeExtractAndMerge('user: 我在学 Rust')

      expect(userProfileRepo.getProfile(db)).toHaveLength(1)
      expect(userProfileRepo.getDimension(db, 'tech_stack')!.value).toBe('Rust')
    })

    it('无 llmCaller 时不抛异常,静默返回', async () => {
      await expect(service.maybeExtractAndMerge('对话内容')).resolves.not.toThrow()
      expect(userProfileRepo.getProfile(db)).toEqual([])
    })

    it('LLM 失败时不抛异常(fire-and-forget 安全)', async () => {
      const mockLlm = vi.fn().mockRejectedValue(new Error('网络错误'))
      const svc = new ProfileBuilderService(db, mockLlm)
      await expect(svc.maybeExtractAndMerge('对话')).resolves.not.toThrow()
      expect(userProfileRepo.getProfile(db)).toEqual([])
    })

    it('空对话文本不调用 LLM', async () => {
      const mockLlm = vi.fn()
      const svc = new ProfileBuilderService(db, mockLlm)
      await svc.maybeExtractAndMerge('')
      expect(mockLlm).not.toHaveBeenCalled()
    })
  })
})
