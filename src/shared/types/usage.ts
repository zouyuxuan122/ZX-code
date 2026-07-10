/** 单日统计 */
export interface DailyUsageStat {
  /** 日期 YYYY-MM-DD */
  date: string
  /** 当日总 token */
  tokens: number
  /** 当日调用次数 */
  calls: number
  /** 当日 prompt token */
  promptTokens: number
  /** 当日 completion token */
  completionTokens: number
}

/** 记录一次对话完成的用量 */
export interface UsageRecord {
  conversationId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  timestamp: number
}

export interface UsageStatsApi {
  /** 记录一次用量 */
  record: (record: UsageRecord) => Promise<void>
  /** 获取最近 N 天的每日统计（用于热力图） */
  getDailyStats: (days: number) => Promise<DailyUsageStat[]>
  /** 获取今日汇总 */
  getTodaySummary: () => Promise<DailyUsageStat | null>
}
