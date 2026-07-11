import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { MemoryExtractService } from '../memory-extract.service'
import { MemoryRecallService } from '../memory-recall.service'
import type { Database as DBType } from 'better-sqlite3'
import type { Message } from '../../../shared/types/conversation'

let db: DBType
let recallService: MemoryRecallService
let extractService: MemoryExtractService

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      partition TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  recallService = new MemoryRecallService(db)
  // mock LLM 抽取函数
  const mockExtractor = vi.fn().mockResolvedValue([
    { partition: 'decision', title: '采用 JWT 认证', content: '决定使用 JWT 实现用户登录', tags: ['auth', 'jwt'] },
    { partition: 'error', title: '端口冲突错误', content: '端口 3000 被占用导致启动失败', tags: ['bug', 'port'] }
  ])
  extractService = new MemoryExtractService(recallService, mockExtractor)
})

describe('MemoryExtractService', () => {
  it('从对话内容抽取关键信息并写入记忆树', async () => {
    const messages: Message[] = [
      { id: '1', conversation_id: 'conv1', role: 'user', content: '帮我加个 JWT 登录', created_at: Date.now() } as Message,
      { id: '2', conversation_id: 'conv1', role: 'assistant', content: '好的,我来实现 JWT 认证。端口 3000 被占用了,我先换到 3001。', created_at: Date.now() } as Message,
    ]

    await extractService.extractFromConversation(messages)

    const nodes = recallService.listNodes()
    expect(nodes.length).toBe(2)
    expect(nodes.some(n => n.title === '采用 JWT 认证')).toBe(true)
    expect(nodes.some(n => n.title === '端口冲突错误')).toBe(true)
  })

  it('抽取失败不抛异常,返回空结果', async () => {
    const failingExtractor = vi.fn().mockRejectedValue(new Error('LLM 调用失败'))
    const failingService = new MemoryExtractService(recallService, failingExtractor)

    const messages: Message[] = [
      { id: '1', conversation_id: 'conv1', role: 'user', content: '测试', created_at: Date.now() } as Message,
    ]

    const result = await failingService.extractFromConversation(messages)
    expect(result).toEqual([])
    expect(recallService.listNodes().length).toBe(0)
  })

  it('空对话不调用抽取器', async () => {
    const result = await extractService.extractFromConversation([])
    expect(result).toEqual([])
  })
})
