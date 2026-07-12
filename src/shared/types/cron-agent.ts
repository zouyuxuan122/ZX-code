/** Agent Cron 任务 */
export interface AgentCronJob {
  id: string
  name: string
  description: string
  cronExpression: string
  projectId: string | null
  enabled: boolean
  allowWriteTools: boolean
  lastRunAt: number | null
  lastRunResult: string | null
  lastRunStatus: 'success' | 'failed' | 'timeout' | null
  runCount: number
  createdAt: number
  updatedAt: number
}

/** 创建 Cron 任务 DTO */
export interface CreateCronJobDto {
  name: string
  description: string
  cronExpression: string
  projectId?: string | null
  allowWriteTools?: boolean
}

/** Cron 任务执行结果 */
export interface CronJobResult {
  jobId: string
  status: 'success' | 'failed' | 'timeout'
  conversationId: string
  durationMs: number
  summary: string
  error?: string
  executedAt: number
}

/** Cron 任务操作类型 */
export type CronJobAction = 'create' | 'list' | 'delete' | 'toggle'
