import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import { SearchService } from '../search.service'
import type { ConversationSummarizer } from '../search.service'
import type { Message } from '../../../shared/types/conversation'

let db: DBType
let convId1: string
let convId2: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  const c1 = db.prepare('INSERT INTO conversations (title) VALUES (?) RETURNING *').get('架构讨论') as { id: string }
  const c2 = db.prepare('INSERT INTO conversations (title) VALUES (?) RETURNING *').get('测试对话') as { id: string }
  convId1 = c1.id
  convId2 = c2.id

  // 注意：unicode61 分词器将连续 CJK 视为单个 token，
  // 前缀匹配 keyword* 仅在关键词出现在 token 开头时生效。
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId1, 'user', '架构设计方案讨论',
  )
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId1, 'assistant', '架构采用模块化设计模式',
  )
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId2, 'user', '运行 vitest 单元测试',
  )
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId2, 'assistant', '测试全部通过',
  )
})

describe('SearchService', () => {
  describe('search', () => {
    it('返回消息级搜索结果', () => {
      const service = new SearchService(db)
      const results = service.search('架构')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((r) => r.conversationId === convId1)).toBe(true)
      const r = results[0]
      expect(r).toHaveProperty('messageId')
      expect(r).toHaveProperty('snippet')
      expect(r).toHaveProperty('rank')
    })

    it('支持 limit 参数', () => {
      const service = new SearchService(db)
      const limited = service.search('架构', 1)
      expect(limited.length).toBeLessThanOrEqual(1)
    })

    it('无匹配时返回空数组', () => {
      const service = new SearchService(db)
      const results = service.search('nonexistent')
      expect(results).toEqual([])
    })
  })

  describe('searchWithSummary', () => {
    it('返回对话级结果含 summary 字段', async () => {
      const mockSummarizer: ConversationSummarizer = vi.fn().mockResolvedValue('关于架构设计的讨论')
      const service = new SearchService(db, mockSummarizer)

      const results = await service.searchWithSummary('架构')

      expect(results.length).toBeGreaterThanOrEqual(1)
      const r = results[0]
      expect(r.conversationId).toBe(convId1)
      expect(r).toHaveProperty('matchCount')
      expect(r).toHaveProperty('bestSnippet')
      expect(r).toHaveProperty('summary')
      expect(r.summary).toBe('关于架构设计的讨论')
      expect(r.matchCount).toBeGreaterThanOrEqual(1)
    })

    it('调用 summarizer 时传入对话的消息列表', async () => {
      const mockSummarizer = vi.fn().mockResolvedValue('摘要')
      const service = new SearchService(db, mockSummarizer)

      await service.searchWithSummary('架构')

      expect(mockSummarizer).toHaveBeenCalledTimes(1)
      const callArgs = mockSummarizer.mock.calls[0]
      expect(callArgs[0]).toBe(convId1)
      // 第二个参数应为消息数组
      const messages = callArgs[1] as Message[]
      expect(Array.isArray(messages)).toBe(true)
      expect(messages.length).toBeGreaterThan(0)
    })

    it('summarizer 抛出异常时 summary 为空字符串', async () => {
      const failingSummarizer: ConversationSummarizer = vi.fn().mockRejectedValue(new Error('LLM 调用失败'))
      const service = new SearchService(db, failingSummarizer)

      const results = await service.searchWithSummary('架构')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((r) => r.summary === '')).toBe(true)
    })

    it('未注入 summarizer 时 summary 为空字符串', async () => {
      const service = new SearchService(db)
      const results = await service.searchWithSummary('架构')
      expect(results.length).toBeGreaterThan(0)
      expect(results.every((r) => r.summary === '')).toBe(true)
    })

    it('支持 limit 参数', async () => {
      const mockSummarizer: ConversationSummarizer = vi.fn().mockResolvedValue('摘要')
      const service = new SearchService(db, mockSummarizer)
      const results = await service.searchWithSummary('架构', 1)
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })
})
