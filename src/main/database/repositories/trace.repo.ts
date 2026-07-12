import type Database from 'better-sqlite3'
import type { AgentTrace, TraceQuery, TraceStats, TraceEntry, ToolCallTrace } from '@shared/types/trace'

/** agent_traces 表的行结构(snake_case) */
interface TraceRow {
  id: string
  conversation_id: string
  message_id: string | null
  trace: string
  total_duration_ms: number | null
  tool_call_count: number
  success_count: number
  failure_count: number
  created_at: number
}

/** 将 DB 行(snake_case)转换为 AgentTrace(camelCase) */
function rowToTrace(row: TraceRow): AgentTrace {
  const trace = JSON.parse(row.trace) as AgentTrace
  // 优先使用 JSON 内的 createdAt（保留原始精度），DB 列作为兜底
  return {
    conversationId: row.conversation_id,
    ...(row.message_id ? { messageId: row.message_id } : {}),
    entries: trace.entries ?? [],
    totalDurationMs: row.total_duration_ms ?? trace.totalDurationMs ?? 0,
    totalToolCallCount: row.tool_call_count ?? trace.totalToolCallCount ?? 0,
    successCount: row.success_count ?? trace.successCount ?? 0,
    failureCount: row.failure_count ?? trace.failureCount ?? 0,
    createdAt: row.created_at ?? trace.createdAt ?? 0,
  }
}

/**
 * 插入一条 Agent 轨迹
 * - trace 字段存储完整 JSON
 * - total_duration_ms / tool_call_count / success_count / failure_count 同步写入独立列
 * @returns 新插入记录的 id
 */
export function insertTrace(db: Database.Database, trace: AgentTrace): string {
  const traceJson = JSON.stringify(trace)
  const row = db.prepare(
    `INSERT INTO agent_traces (conversation_id, message_id, trace, total_duration_ms, tool_call_count, success_count, failure_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
  ).get(
    trace.conversationId,
    trace.messageId ?? null,
    traceJson,
    trace.totalDurationMs ?? null,
    trace.totalToolCallCount ?? 0,
    trace.successCount ?? 0,
    trace.failureCount ?? 0,
    trace.createdAt ?? Date.now(),
  ) as { id: string }
  return row.id
}

/** 按 conversation ID 查询轨迹(按创建时间倒序) */
export function getTracesByConversation(
  db: Database.Database,
  conversationId: string,
  limit?: number,
): AgentTrace[] {
  const sql = limit
    ? 'SELECT * FROM agent_traces WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM agent_traces WHERE conversation_id = ? ORDER BY created_at DESC'
  const rows = limit
    ? (db.prepare(sql).all(conversationId, limit) as TraceRow[])
    : (db.prepare(sql).all(conversationId) as TraceRow[])
  return rows.map(rowToTrace)
}

/** 查询包含指定工具调用的轨迹(trace JSON LIKE 匹配) */
export function getTracesByTool(
  db: Database.Database,
  toolName: string,
  limit?: number,
): AgentTrace[] {
  const pattern = `%"toolName":"${toolName}"%`
  const sql = limit
    ? 'SELECT * FROM agent_traces WHERE trace LIKE ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM agent_traces WHERE trace LIKE ? ORDER BY created_at DESC'
  const rows = limit
    ? (db.prepare(sql).all(pattern, limit) as TraceRow[])
    : (db.prepare(sql).all(pattern) as TraceRow[])
  return rows.map(rowToTrace)
}

/** 查询有失败的轨迹(failure_count > 0) */
export function getFailedTraces(db: Database.Database, limit?: number): AgentTrace[] {
  const sql = limit
    ? 'SELECT * FROM agent_traces WHERE failure_count > 0 ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM agent_traces WHERE failure_count > 0 ORDER BY created_at DESC'
  const rows = limit
    ? (db.prepare(sql).all(limit) as TraceRow[])
    : (db.prepare(sql).all() as TraceRow[])
  return rows.map(rowToTrace)
}

/** 按 id 查询单条轨迹 */
export function getTraceById(db: Database.Database, id: string): AgentTrace | null {
  const row = db.prepare('SELECT * FROM agent_traces WHERE id = ?').get(id) as
    | TraceRow
    | undefined
  return row ? rowToTrace(row) : null
}

/** 按灵活条件查询轨迹 */
export function queryTraces(db: Database.Database, query: TraceQuery): AgentTrace[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (query.conversationId) {
    conditions.push('conversation_id = ?')
    params.push(query.conversationId)
  }
  if (query.toolName) {
    conditions.push("trace LIKE ?")
    params.push(`%"toolName":"${query.toolName}"%`)
  }
  if (query.failureOnly) {
    conditions.push('failure_count > 0')
  }
  if (query.successOnly) {
    conditions.push('failure_count = 0')
  }
  if (query.startTime !== undefined) {
    conditions.push('created_at >= ?')
    params.push(query.startTime)
  }
  if (query.endTime !== undefined) {
    conditions.push('created_at <= ?')
    params.push(query.endTime)
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = query.limit ?? 100
  const offset = query.offset ?? 0
  const sql = `SELECT * FROM agent_traces ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  const rows = db.prepare(sql).all(...params, limit, offset) as TraceRow[]
  return rows.map(rowToTrace)
}

/**
 * 获取轨迹聚合统计
 * - 总轨迹数、总工具调用数、平均时长、成功率
 * - topTools: 按工具调用次数倒序，含每个工具的成功率
 */
export function getTraceStats(db: Database.Database): TraceStats {
  const agg = db.prepare(
    `SELECT
       COUNT(*) AS total_traces,
       COALESCE(SUM(tool_call_count), 0) AS total_tool_calls,
       COALESCE(AVG(total_duration_ms), 0) AS avg_duration,
       COALESCE(SUM(success_count), 0) AS total_success,
       COALESCE(SUM(failure_count), 0) AS total_failure
     FROM agent_traces`,
  ).get() as {
    total_traces: number
    total_tool_calls: number
    avg_duration: number | null
    total_success: number
    total_failure: number
  }

  const totalTraces = agg.total_traces ?? 0
  const totalToolCalls = agg.total_tool_calls ?? 0
  const averageDurationMs = agg.avg_duration ?? 0
  const totalSuccess = agg.total_success ?? 0
  const totalCalls = totalSuccess + (agg.total_failure ?? 0)
  const successRate = totalCalls > 0 ? totalSuccess / totalCalls : 0

  // topTools: 需要解析每条 trace JSON 中的工具调用统计
  const rows = db.prepare('SELECT trace FROM agent_traces').all() as { trace: string }[]
  const toolCounts = new Map<string, { count: number; success: number }>()
  for (const row of rows) {
    try {
      const trace = JSON.parse(row.trace) as AgentTrace
      for (const entry of trace.entries ?? []) {
        for (const call of entry.toolCalls ?? []) {
          const stat = toolCounts.get(call.toolName) ?? { count: 0, success: 0 }
          stat.count += 1
          if (call.success) stat.success += 1
          toolCounts.set(call.toolName, stat)
        }
      }
    } catch {
      // JSON 解析失败时跳过该行
    }
  }
  const topTools = Array.from(toolCounts.entries())
    .map(([toolName, stat]) => ({
      toolName,
      count: stat.count,
      successRate: stat.count > 0 ? stat.success / stat.count : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalTraces,
    totalToolCalls,
    averageDurationMs,
    successRate,
    topTools,
  }
}

// 仅用于类型导出检查，避免未使用类型警告
export type { TraceEntry, ToolCallTrace }
