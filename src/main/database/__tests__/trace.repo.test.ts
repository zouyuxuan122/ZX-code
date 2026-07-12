import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as traceRepo from '../repositories/trace.repo'
import type { AgentTrace, TraceEntry, ToolCallTrace } from '@shared/types/trace'

let db: DBType
let conversationId: string

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  // 创建一条 conversation 用于 FK 约束
  const conv = db.prepare(
    "INSERT INTO conversations (title) VALUES (?) RETURNING *",
  ).get('测试对话') as { id: string }
  conversationId = conv.id
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

describe('trace.repo', () => {
  describe('insertTrace', () => {
    it('插入一条轨迹并返回 id', () => {
      const trace = buildTrace()
      const id = traceRepo.insertTrace(db, trace)
      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('写入的 trace 字段为 JSON 字符串,可反序列化回 AgentTrace', () => {
      const trace = buildTrace()
      const id = traceRepo.insertTrace(db, trace)
      const row = db.prepare(
        'SELECT trace, total_duration_ms, tool_call_count, success_count, failure_count FROM agent_traces WHERE id = ?',
      ).get(id) as {
        trace: string
        total_duration_ms: number | null
        tool_call_count: number
        success_count: number
        failure_count: number
      }
      expect(row.trace).toBeDefined()
      const parsed = JSON.parse(row.trace) as AgentTrace
      expect(parsed.conversationId).toBe(conversationId)
      expect(parsed.entries).toHaveLength(1)
      expect(parsed.entries[0].toolCalls).toHaveLength(2)
      expect(parsed.totalToolCallCount).toBe(2)
    })

    it('将 total_duration_ms / tool_call_count / success_count / failure_count 写入独立列', () => {
      const trace = buildTrace({
        totalDurationMs: 1234,
        totalToolCallCount: 5,
        successCount: 3,
        failureCount: 2,
      })
      const id = traceRepo.insertTrace(db, trace)
      const row = db.prepare(
        'SELECT total_duration_ms, tool_call_count, success_count, failure_count FROM agent_traces WHERE id = ?',
      ).get(id) as {
        total_duration_ms: number | null
        tool_call_count: number
        success_count: number
        failure_count: number
      }
      expect(row.total_duration_ms).toBe(1234)
      expect(row.tool_call_count).toBe(5)
      expect(row.success_count).toBe(3)
      expect(row.failure_count).toBe(2)
    })

    it('支持可选的 message_id 字段', () => {
      const trace = buildTrace({ messageId: 'msg-123' })
      const id = traceRepo.insertTrace(db, trace)
      const row = db.prepare(
        'SELECT message_id FROM agent_traces WHERE id = ?',
      ).get(id) as { message_id: string | null }
      expect(row.message_id).toBe('msg-123')
    })
  })

  describe('getTraceById', () => {
    it('根据 id 返回单条 AgentTrace', () => {
      const trace = buildTrace()
      const id = traceRepo.insertTrace(db, trace)
      const found = traceRepo.getTraceById(db, id)
      expect(found).not.toBeNull()
      expect(found!.conversationId).toBe(conversationId)
      expect(found!.entries).toHaveLength(1)
      expect(found!.totalToolCallCount).toBe(2)
    })

    it('id 不存在时返回 null', () => {
      const found = traceRepo.getTraceById(db, 'non-existent-id')
      expect(found).toBeNull()
    })

    it('返回对象包含 createdAt 字段', () => {
      const trace = buildTrace({ createdAt: 1700000000000 })
      const id = traceRepo.insertTrace(db, trace)
      const found = traceRepo.getTraceById(db, id)
      expect(found).not.toBeNull()
      expect(found!.createdAt).toBe(1700000000000)
    })
  })

  describe('getTracesByConversation', () => {
    it('返回指定 conversation 的全部轨迹(按创建时间倒序)', () => {
      // 插入两条同一会话的轨迹
      const t1 = buildTrace({ createdAt: 1000 })
      const t2 = buildTrace({ createdAt: 2000 })
      const id1 = traceRepo.insertTrace(db, t1)
      const id2 = traceRepo.insertTrace(db, t2)
      // 插入另一会话的轨迹(不应出现)
      const otherConv = db.prepare(
        "INSERT INTO conversations (title) VALUES (?) RETURNING *",
      ).get('其他对话') as { id: string }
      const otherTrace = buildTrace({ conversationId: otherConv.id })
      traceRepo.insertTrace(db, otherTrace)

      const results = traceRepo.getTracesByConversation(db, conversationId)
      expect(results).toHaveLength(2)
      // 倒序:后插入的在前
      expect(results[0].createdAt).toBeGreaterThanOrEqual(results[1].createdAt)
      // 都属于当前会话
      expect(results.every((t) => t.conversationId === conversationId)).toBe(true)
      // id 集合匹配
      const ids = new Set(results.map((t) => t.conversationId))
      expect(ids.has(conversationId)).toBe(true)
      void id1
      void id2
    })

    it('支持 limit 参数限制返回数量', () => {
      for (let i = 0; i < 5; i++) {
        traceRepo.insertTrace(db, buildTrace({ createdAt: 1000 + i }))
      }
      const results = traceRepo.getTracesByConversation(db, conversationId, 2)
      expect(results).toHaveLength(2)
    })

    it('无轨迹时返回空数组', () => {
      const results = traceRepo.getTracesByConversation(db, 'empty-conv-id-no-traces')
      expect(results).toEqual([])
    })
  })

  describe('getTracesByTool', () => {
    it('返回包含指定工具名的轨迹', () => {
      const trace = buildTrace()
      traceRepo.insertTrace(db, trace)
      const results = traceRepo.getTracesByTool(db, 'read_file')
      expect(results.length).toBeGreaterThanOrEqual(1)
      // 每条轨迹的 entries 中应包含 read_file 工具调用
      const hasTool = results.some((t) =>
        t.entries.some((e) => e.toolCalls.some((c) => c.toolName === 'read_file')),
      )
      expect(hasTool).toBe(true)
    })

    it('未调用过该工具时返回空数组', () => {
      const trace = buildTrace()
      traceRepo.insertTrace(db, trace)
      const results = traceRepo.getTracesByTool(db, 'nonexistent_tool')
      expect(results).toEqual([])
    })
  })

  describe('getFailedTraces', () => {
    it('返回 failure_count > 0 的轨迹', () => {
      // 一条有失败
      traceRepo.insertTrace(db, buildTrace({ failureCount: 1 }))
      // 一条无失败
      const successOnly: ToolCallTrace = {
        toolName: 'list_files',
        argsSummary: '{}',
        resultSummary: 'ok',
        durationMs: 10,
        success: true,
      }
      const successTrace = buildTrace({
        entries: [{ iteration: 0, toolCalls: [successOnly], iterationDurationMs: 10 }],
        totalToolCallCount: 1,
        successCount: 1,
        failureCount: 0,
      })
      traceRepo.insertTrace(db, successTrace)

      const results = traceRepo.getFailedTraces(db)
      expect(results).toHaveLength(1)
      expect(results[0].failureCount).toBeGreaterThan(0)
    })

    it('无失败轨迹时返回空数组', () => {
      const successOnly: ToolCallTrace = {
        toolName: 'list_files',
        argsSummary: '{}',
        resultSummary: 'ok',
        durationMs: 10,
        success: true,
      }
      traceRepo.insertTrace(
        db,
        buildTrace({
          entries: [{ iteration: 0, toolCalls: [successOnly], iterationDurationMs: 10 }],
          totalToolCallCount: 1,
          successCount: 1,
          failureCount: 0,
        }),
      )
      const results = traceRepo.getFailedTraces(db)
      expect(results).toEqual([])
    })

    it('支持 limit 参数', () => {
      for (let i = 0; i < 3; i++) {
        traceRepo.insertTrace(db, buildTrace({ failureCount: 1 }))
      }
      const results = traceRepo.getFailedTraces(db, 2)
      expect(results).toHaveLength(2)
    })
  })

  describe('queryTraces', () => {
    it('按 conversationId 过滤', () => {
      traceRepo.insertTrace(db, buildTrace())
      const results = traceRepo.queryTraces(db, { conversationId })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((t) => t.conversationId === conversationId)).toBe(true)
    })

    it('按 toolName 过滤', () => {
      traceRepo.insertTrace(db, buildTrace())
      const results = traceRepo.queryTraces(db, { toolName: 'read_file' })
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('failureOnly=true 只返回有失败的轨迹', () => {
      traceRepo.insertTrace(db, buildTrace({ failureCount: 1 }))
      traceRepo.insertTrace(
        db,
        buildTrace({
          failureCount: 0,
          successCount: 1,
          entries: [
            {
              iteration: 0,
              toolCalls: [
                {
                  toolName: 'list_files',
                  argsSummary: '{}',
                  resultSummary: 'ok',
                  durationMs: 10,
                  success: true,
                },
              ],
              iterationDurationMs: 10,
            },
          ],
        }),
      )
      const results = traceRepo.queryTraces(db, { failureOnly: true })
      expect(results).toHaveLength(1)
      expect(results[0].failureCount).toBeGreaterThan(0)
    })

    it('支持 limit 参数', () => {
      for (let i = 0; i < 4; i++) {
        traceRepo.insertTrace(db, buildTrace())
      }
      const results = traceRepo.queryTraces(db, { limit: 2 })
      expect(results).toHaveLength(2)
    })
  })

  describe('getTraceStats', () => {
    it('返回聚合统计:总轨迹数、总工具调用数、平均时长', () => {
      traceRepo.insertTrace(
        db,
        buildTrace({
          totalDurationMs: 100,
          totalToolCallCount: 2,
          successCount: 1,
          failureCount: 1,
        }),
      )
      traceRepo.insertTrace(
        db,
        buildTrace({
          totalDurationMs: 300,
          totalToolCallCount: 4,
          successCount: 4,
          failureCount: 0,
        }),
      )

      const stats = traceRepo.getTraceStats(db)
      expect(stats.totalTraces).toBe(2)
      expect(stats.totalToolCalls).toBe(6)
      // 平均时长 = (100 + 300) / 2 = 200
      expect(stats.averageDurationMs).toBe(200)
    })

    it('计算成功率 = 总成功数 / 总工具调用数', () => {
      traceRepo.insertTrace(
        db,
        buildTrace({
          totalToolCallCount: 4,
          successCount: 3,
          failureCount: 1,
        }),
      )
      const stats = traceRepo.getTraceStats(db)
      // 3/4 = 0.75
      expect(stats.successRate).toBeCloseTo(0.75, 2)
    })

    it('返回 topTools:按工具调用次数倒序排列,含成功率', () => {
      // read_file 调用 2 次(都成功),write_file 调用 1 次(失败)
      traceRepo.insertTrace(db, buildTrace())
      const stats = traceRepo.getTraceStats(db)
      expect(stats.topTools.length).toBeGreaterThan(0)
      // read_file 应排前面(调用次数多)
      const readFile = stats.topTools.find((t) => t.toolName === 'read_file')
      expect(readFile).toBeDefined()
      expect(readFile!.count).toBeGreaterThanOrEqual(1)
      expect(readFile!.successRate).toBeGreaterThan(0)
    })

    it('无轨迹时返回零值统计', () => {
      const stats = traceRepo.getTraceStats(db)
      expect(stats.totalTraces).toBe(0)
      expect(stats.totalToolCalls).toBe(0)
      expect(stats.averageDurationMs).toBe(0)
      expect(stats.successRate).toBe(0)
      expect(stats.topTools).toEqual([])
    })
  })
})
