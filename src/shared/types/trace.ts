/** 单次工具调用轨迹 */
export interface ToolCallTrace {
  toolName: string
  argsSummary: string
  resultSummary: string
  durationMs: number
  success: boolean
  error?: string
}

/** 单轮 Agent 执行轨迹条目 */
export interface TraceEntry {
  iteration: number
  toolCalls: ToolCallTrace[]
  iterationDurationMs: number
}

/** 完整 Agent 执行轨迹 */
export interface AgentTrace {
  conversationId: string
  messageId?: string
  entries: TraceEntry[]
  totalDurationMs: number
  totalToolCallCount: number
  successCount: number
  failureCount: number
  createdAt: number
}

/** 轨迹查询参数 */
export interface TraceQuery {
  conversationId?: string
  toolName?: string
  successOnly?: boolean
  failureOnly?: boolean
  limit?: number
  offset?: number
  startTime?: number
  endTime?: number
}

/** 轨迹统计 */
export interface TraceStats {
  totalTraces: number
  totalToolCalls: number
  averageDurationMs: number
  successRate: number
  topTools: Array<{ toolName: string; count: number; successRate: number }>
}
