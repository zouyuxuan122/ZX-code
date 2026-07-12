import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import type { AgentTrace, TraceEntry, ToolCallTrace } from '@shared/types/trace'

// 共享的内存数据库实例（在 mock 工厂中通过闭包访问）
let db: DBType

// Mock getDb 返回内存数据库
vi.mock('../../database', () => ({
  getDb: () => db,
}))

// Mock logger（避免引入 electron）
vi.mock('../logger.service', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

import { TraceService } from '../trace.service'

let conversationId: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const conv = db.prepare(
    "INSERT INTO conversations (title) VALUES (?) RETURNING *",
  ).get('测试对话') as { id: string }
  conversationId = conv.id
})

afterEach(() => {
  db.close()
})

/** 构造一个最小可用的 AgentTrace 对象 */
function buildTrace(overrides: Partial<AgentTrace> = {}): AgentTrace {
  const toolCall: ToolCallTrace = {
    toolName: 'read_file',
    argsSummary: '{"path":"a.txt"}',
    resultSummary: '文件内容',
    durationMs: 50,
    success: true,
  }
  const failedCall: ToolCallTrace = {
    toolName: 'write_file',
    argsSummary: '{"path":"b.txt"}',
    resultSummary: '权限被拒绝',
    durationMs: 30,
    success: false,
    error: 'EACCES',
  }
  const entry: TraceEntry = {
    iteration: 0,
    toolCalls: [toolCall, failedCall],
    iterationDurationMs: 100,
  }
  return {
    conversationId,
    entries: [entry],
    totalDurationMs: 100,
    totalToolCallCount: 2,
    successCount: 1,
    failureCount: 1,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('TraceService', () => {
  describe('recordTrace', () => {
    it('调用后轨迹被写入数据库', async () => {
      const service = new TraceService()
      const trace = buildTrace()
      await service.recordTrace(trace)
      // 验证数据库中有一条记录
      const row = db.prepare('SELECT trace FROM agent_traces').get() as {
        trace: string
      }
      expect(row).toBeDefined()
      const parsed = JSON.parse(row.trace) as AgentTrace
      expect(parsed.conversationId).toBe(conversationId)
      expect(parsed.totalToolCallCount).toBe(2)
    })

    it('返回 Promise 且能 resolve(fire-and-forget 但可等待)', async () => {
      const service = new TraceService()
      const trace = buildTrace()
      // recordTrace 应返回一个可 resolve 的 Promise
      await expect(service.recordTrace(trace)).resolves.toBeUndefined()
    })

    it('DB 失败时不抛出异常(捕获错误,仅记录 warning)', async () => {
      // 关闭数据库使其后续操作失败
      db.close()
      const service = new TraceService()
      const trace = buildTrace()
      // 不应抛出
      await expect(service.recordTrace(trace)).resolves.toBeUndefined()
    })
  })

  describe('queryTraces', () => {
    it('返回匹配的轨迹(按 conversationId 过滤)', () => {
      const service = new TraceService()
      const trace = buildTrace()
      // 直接写库准备数据
      db.prepare(
        `INSERT INTO agent_traces (conversation_id, trace, total_duration_ms, tool_call_count, success_count, failure_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        JSON.stringify(trace),
        trace.totalDurationMs,
        trace.totalToolCallCount,
        trace.successCount,
        trace.failureCount,
        trace.createdAt,
      )

      const results = service.queryTraces({ conversationId })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((t) => t.conversationId === conversationId)).toBe(true)
    })

    it('无匹配时返回空数组', () => {
      const service = new TraceService()
      const results = service.queryTraces({ conversationId: 'no-such-conv' })
      expect(results).toEqual([])
    })
  })

  describe('getTraceStats', () => {
    it('返回聚合统计', () => {
      const service = new TraceService()
      const trace = buildTrace({
        totalDurationMs: 200,
        totalToolCallCount: 2,
        successCount: 1,
        failureCount: 1,
      })
      db.prepare(
        `INSERT INTO agent_traces (conversation_id, trace, total_duration_ms, tool_call_count, success_count, failure_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        conversationId,
        JSON.stringify(trace),
        trace.totalDurationMs,
        trace.totalToolCallCount,
        trace.successCount,
        trace.failureCount,
        trace.createdAt,
      )

      const stats = service.getTraceStats()
      expect(stats.totalTraces).toBeGreaterThanOrEqual(1)
      expect(stats.totalToolCalls).toBeGreaterThanOrEqual(2)
    })

    it('无数据时返回零值统计', () => {
      const service = new TraceService()
      const stats = service.getTraceStats()
      expect(stats.totalTraces).toBe(0)
      expect(stats.topTools).toEqual([])
    })
  })
})
