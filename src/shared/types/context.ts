/**
 * 上下文使用情况
 * 用于右侧栏进度条与使用详情面板
 */
export interface ContextUsage {
  /** 对话 ID */
  conversationId: string
  /** 当前估算的 token 总量（system + 历史消息 + 工具调用） */
  totalTokens: number
  /** 配置的最大上下文长度（token） */
  maxContextLength: number
  /** 压缩阈值（百分比 0-100） */
  compressThreshold: number
  /** 是否启用自动压缩 */
  autoCompress: boolean
  /** 使用率（0-100） */
  usagePercent: number
  /** 各部分 token 占用明细 */
  breakdown: ContextBreakdown
  /** 最近一次压缩时间（时间戳，0 表示未压缩过） */
  lastCompressedAt: number
  /** 历史压缩次数 */
  compressCount: number
}

/** 各部分 token 占用明细 */
export interface ContextBreakdown {
  /** 系统提示 */
  system: number
  /** 用户消息累计 */
  user: number
  /** 助手回复累计 */
  assistant: number
  /** 工具调用与结果累计 */
  tool: number
  /** 历史摘要（被压缩后的 system 摘要） */
  summary: number
}

/** 单条消息的 token 估算结果 */
export interface MessageTokenInfo {
  messageId: string
  role: string
  tokens: number
  /** 简短描述（如 "用户消息"、"工具调用：read_file"） */
  description: string
}
