import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as searchRepo from '../repositories/search.repo'

let db: DBType
let convId1: string
let convId2: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  // 创建两个测试对话
  const c1 = db.prepare('INSERT INTO conversations (title) VALUES (?) RETURNING *').get('English conversation') as { id: string }
  const c2 = db.prepare('INSERT INTO conversations (title) VALUES (?) RETURNING *').get('中文对话') as { id: string }
  convId1 = c1.id
  convId2 = c2.id

  // 对话1：英文内容
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId1, 'user', 'hello world from vitest testing framework',
  )
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId1, 'assistant', 'running unit tests with vitest is great',
  )

  // 对话2：中文内容（unicode61 将连续 CJK 视为单个 token，前缀匹配需关键词在 token 开头）
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId2, 'user', '项目架构设计方案讨论',
  )
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(
    convId2, 'assistant', '项目架构采用模块化设计模式',
  )
})

describe('search.repo', () => {
  describe('searchMessages', () => {
    it('英文关键词匹配返回 SearchResult 列表', () => {
      const results = searchRepo.searchMessages(db, 'vitest')
      expect(results.length).toBeGreaterThanOrEqual(1)
      const r = results[0]
      expect(r).toHaveProperty('messageId')
      expect(r).toHaveProperty('conversationId')
      expect(r).toHaveProperty('content')
      expect(r).toHaveProperty('snippet')
      expect(r).toHaveProperty('rank')
      expect(typeof r.messageId).toBe('string')
      expect(typeof r.snippet).toBe('string')
    })

    it('匹配结果属于正确对话', () => {
      const results = searchRepo.searchMessages(db, 'vitest')
      expect(results.length).toBe(2)
      expect(results.every((r) => r.conversationId === convId1)).toBe(true)
    })

    it('snippet 包含高亮标记', () => {
      const results = searchRepo.searchMessages(db, 'vitest')
      expect(results.length).toBeGreaterThan(0)
      // snippet 应包含 << >> 高亮标记
      expect(results.some((r) => r.snippet.includes('<<'))).toBe(true)
    })

    it('中文前缀匹配', () => {
      const results = searchRepo.searchMessages(db, '项目')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((r) => r.conversationId === convId2)).toBe(true)
    })

    it('多词搜索（空格分隔，隐式 AND）', () => {
      // hello 和 vitest 都在同一消息中出现
      const results = searchRepo.searchMessages(db, 'hello vitest')
      expect(results.length).toBeGreaterThanOrEqual(1)
      // 第一条消息同时包含 hello 和 vitest
      const hasFirstMsg = results.some((r) => r.content.includes('hello world from vitest'))
      expect(hasFirstMsg).toBe(true)
    })

    it('无匹配关键词返回空数组', () => {
      const results = searchRepo.searchMessages(db, 'nonexistentkeyword')
      expect(results).toEqual([])
    })

    it('支持 limit 参数限制返回数量', () => {
      const all = searchRepo.searchMessages(db, 'vitest')
      expect(all.length).toBe(2)
      const limited = searchRepo.searchMessages(db, 'vitest', 1)
      expect(limited.length).toBe(1)
    })

    it('转义 FTS5 特殊字符防止注入', () => {
      // 包含特殊字符的关键词不应抛出异常
      expect(() => searchRepo.searchMessages(db, 'hello"world*')).not.toThrow()
      expect(() => searchRepo.searchMessages(db, '(test)')).not.toThrow()
    })
  })

  describe('getConversationsByFts', () => {
    it('返回去重的对话列表含 matchCount 和 bestSnippet', () => {
      const results = searchRepo.getConversationsByFts(db, 'vitest')
      expect(results.length).toBe(1)
      const r = results[0]
      expect(r.conversationId).toBe(convId1)
      expect(r.matchCount).toBe(2)
      expect(typeof r.bestSnippet).toBe('string')
      expect(r.bestSnippet.length).toBeGreaterThan(0)
      expect(r).toHaveProperty('lastMatchAt')
    })

    it('中文关键词匹配返回正确对话', () => {
      const results = searchRepo.getConversationsByFts(db, '项目')
      expect(results.length).toBe(1)
      expect(results[0].conversationId).toBe(convId2)
      expect(results[0].matchCount).toBe(2)
    })

    it('无匹配时返回空数组', () => {
      const results = searchRepo.getConversationsByFts(db, 'nonexistentkeyword')
      expect(results).toEqual([])
    })

    it('支持 limit 参数', () => {
      // 搜索能匹配多个对话的关键词
      const results = searchRepo.getConversationsByFts(db, '项目', 1)
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('lastMatchAt 为消息的 created_at 时间戳', () => {
      const results = searchRepo.getConversationsByFts(db, 'vitest')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].lastMatchAt).toBeGreaterThan(0)
    })
  })
})
