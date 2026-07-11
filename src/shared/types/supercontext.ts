/** 上下文简报文件项 */
export interface BriefingFileItem {
  path: string
  /** 相关性原因 */
  reason: string
}

/** 上下文简报记忆项 */
export interface BriefingMemoryItem {
  id: string
  title: string
  partition: string
  /** 摘要片段 */
  snippet: string
}

/** 上下文简报历史对话项 */
export interface BriefingHistoryItem {
  conversationId: string
  title: string
  summary: string
}

/** 上下文简报 */
export interface ContextBriefing {
  /** 相关文件(≤10) */
  files: BriefingFileItem[]
  /** 相关记忆(≤3) */
  memories: BriefingMemoryItem[]
  /** 历史相似对话(≤2) */
  histories: BriefingHistoryItem[]
  /** 简报构建耗时 ms */
  durationMs: number
  /** 是否因超时降级为空 */
  degraded: boolean
}

/** 简报构建配置 */
export interface BriefingConfig {
  enabled: boolean
  timeoutMs: number
  maxFiles: number
  maxMemories: number
  maxHistories: number
}
