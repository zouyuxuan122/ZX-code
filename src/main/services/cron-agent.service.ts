import type Database from 'better-sqlite3'
import { CronExpressionParser } from 'cron-parser'
import { agentEngine } from '../agent/engine'
import { logger } from './logger.service'
import { SchedulerService } from './scheduler.service'
import * as cronJobRepo from '../database/repositories/cron-job.repo'
import type { AgentCronJob, CreateCronJobDto, CronJobResult } from '@shared/types/cron-agent'
import type { ToolDefinition } from '@shared/types/tool'
import type { ChatMessage } from '@shared/types/conversation'
import type { AgentEvent } from '../agent/types'

type DB = Database.Database

/** 写入类工具集合——allowWriteTools=false 时过滤掉 */
const WRITE_TOOLS = new Set(['write_file', 'edit', 'run_command', 'run_script'])

/** cron 表达式解析结果 */
export interface CronParseResult {
  valid: boolean
  nextRunTime: Date | null
  error?: string
}

/**
 * Cron Agent 服务
 *
 * 负责管理 Agent Cron 任务的完整生命周期：
 * 1. CRUD（createJob / listJobs / deleteJob / toggleJob）
 * 2. cron 表达式解析与校验（parseCronExpression）
 * 3. 向 SchedulerService 注册定时任务（registerJob / loadAndRegisterAll）
 * 4. 执行任务（executeJob）：创建对话 → 注入任务描述 → 运行 AgentEngine
 * 5. 安全约束：allowWriteTools=false 时过滤写入类工具
 *
 * 注意：为避免与 tools/index.ts 的循环依赖，getToolsFn 通过构造函数注入，
 * 而非在模块顶部 import { getToolDefinitions } from '../tools'。
 */
export class CronAgentService {
  /** 可被测试覆盖的 AgentEngine 实例 */
  private agentEngine: { runConversation: (params: unknown) => AsyncGenerator<AgentEvent> }
  /** 可被测试覆盖的工具定义提供者 */
  private getToolsFn: () => ToolDefinition[]

  constructor(
    private db: DB,
    private scheduler: SchedulerService,
    getToolsFn?: () => ToolDefinition[],
  ) {
    this.agentEngine = agentEngine as unknown as {
      runConversation: (params: unknown) => AsyncGenerator<AgentEvent>
    }
    // 使用注入的 getToolsFn，未提供时默认返回空列表（由 tools/index.ts 构造时注入）
    this.getToolsFn = getToolsFn ?? (() => [])
  }

  /** 解析 cron 表达式，返回是否有效及下次运行时间 */
  parseCronExpression(expr: string): CronParseResult {
    try {
      const iter = CronExpressionParser.parse(expr, { currentDate: new Date() })
      const next = iter.next()
      return { valid: true, nextRunTime: next.toDate() }
    } catch (err) {
      return {
        valid: false,
        nextRunTime: null,
        error: (err as Error).message,
      }
    }
  }

  /** 创建新的 cron 任务 */
  createJob(params: CreateCronJobDto): AgentCronJob {
    const parseResult = this.parseCronExpression(params.cronExpression)
    if (!parseResult.valid) {
      throw new Error(`无效的 cron 表达式 "${params.cronExpression}": ${parseResult.error}`)
    }
    const job = cronJobRepo.insertJob(this.db, {
      name: params.name,
      description: params.description,
      cronExpression: params.cronExpression,
      projectId: params.projectId ?? null,
      allowWriteTools: params.allowWriteTools ?? false,
    })
    logger.info(`[CronAgent] 创建任务: ${job.name} (id: ${job.id}, cron: ${job.cronExpression})`)
    return job
  }

  /** 列出所有任务 */
  listJobs(): AgentCronJob[] {
    return cronJobRepo.getJobs(this.db)
  }

  /** 删除任务（同时从 scheduler 注销） */
  deleteJob(id: string): void {
    this.scheduler.unregister(`cron:${id}`)
    cronJobRepo.deleteJob(this.db, id)
    logger.info(`[CronAgent] 删除任务: ${id}`)
  }

  /** 切换任务启用状态 */
  toggleJob(id: string): void {
    const job = cronJobRepo.getJob(this.db, id)
    if (!job) return
    const newEnabled = !job.enabled
    cronJobRepo.updateJobStatus(this.db, id, newEnabled)
    if (newEnabled) {
      this.registerJob(job)
    } else {
      this.scheduler.unregister(`cron:${id}`)
    }
    logger.info(`[CronAgent] 切换任务 ${id} enabled=${newEnabled}`)
  }

  /** 向 scheduler 注册单个任务 */
  registerJob(job: AgentCronJob): void {
    const parseResult = this.parseCronExpression(job.cronExpression)
    if (!parseResult.valid) {
      logger.warn(`[CronAgent] 任务 ${job.id} cron 表达式无效,跳过注册: ${job.cronExpression}`)
      return
    }
    const jobName = `cron:${job.id}`
    const ok = this.scheduler.registerCronJob(jobName, job.cronExpression, async () => {
      try {
        await this.executeJob(job.id)
      } catch (err) {
        logger.error(`[CronAgent] 任务 ${job.id} 执行异常: ${(err as Error).message}`, err as Error)
      }
    })
    if (ok) {
      this.scheduler.start(jobName)
      logger.info(`[CronAgent] 已注册任务: ${job.name} (下次运行: ${parseResult.nextRunTime?.toISOString()})`)
    }
  }

  /** 从 DB 加载所有 enabled 任务并注册（应用启动时调用） */
  loadAndRegisterAll(): void {
    const jobs = cronJobRepo.getEnabledJobs(this.db)
    logger.info(`[CronAgent] 加载 ${jobs.length} 个启用的 cron 任务`)
    for (const job of jobs) {
      this.registerJob(job)
    }
  }

  /** 执行一个 cron 任务：创建对话 → 注入任务描述 → 运行 AgentEngine */
  async executeJob(jobId: string): Promise<CronJobResult> {
    const startTime = Date.now()
    const job = cronJobRepo.getJob(this.db, jobId)
    if (!job) {
      return {
        jobId,
        status: 'failed',
        conversationId: '',
        durationMs: 0,
        summary: '',
        error: `任务不存在: ${jobId}`,
        executedAt: startTime,
      }
    }

    // 1. 创建对话
    const conversationId = this.createConversationForJob(job)

    // 2. 注入任务描述作为第一条用户消息
    this.injectTaskMessage(conversationId, job)

    // 3. 构建消息上下文
    const messages = this.buildMessages(job)

    // 4. 获取工具定义并按 allowWriteTools 过滤
    const tools = this.buildTools(job.allowWriteTools)

    // 5. 获取 provider / model
    const { providerId, model } = this.getProviderAndModel(job)

    // 6. 运行 AgentEngine
    let status: CronJobResult['status'] = 'success'
    let summary = ''
    let error: string | undefined

    try {
      let contentBuffer = ''
      let hasError = false
      const gen = this.agentEngine.runConversation({
        conversationId,
        providerId,
        model,
        messages,
        tools,
        context: {
          workspacePath: '',
          projectId: job.projectId,
          autoAccept: true, // cron 任务自动接受（无人值守）
        },
        maxIterations: 20,
      }) as AsyncGenerator<AgentEvent>

      for await (const event of gen) {
        if (event.type === 'content') {
          contentBuffer += event.content
        }
        if (event.type === 'error') {
          hasError = true
          error = event.message
        }
        if (event.type === 'finish') {
          if (event.reason === 'error') {
            hasError = true
          }
          break
        }
      }

      summary = contentBuffer.slice(0, 500) || (hasError ? '执行失败' : '执行完成')
      status = hasError ? 'failed' : 'success'
      if (hasError && error) {
        summary = `错误: ${error}`
      }
    } catch (err) {
      status = 'failed'
      error = (err as Error).message
      summary = `执行异常: ${error}`
      logger.error(`[CronAgent] 任务 ${jobId} 执行异常: ${error}`, err as Error)
    }

    const durationMs = Date.now() - startTime
    const result: CronJobResult = {
      jobId,
      status,
      conversationId,
      durationMs,
      summary,
      ...(error ? { error } : {}),
      executedAt: startTime,
    }

    // 7. 更新 DB
    this.handleResult(jobId, result)

    return result
  }

  /** 处理执行结果：更新 DB 的 last_run 字段 */
  handleResult(jobId: string, result: CronJobResult): void {
    cronJobRepo.updateLastRun(this.db, jobId, {
      result: result.summary,
      status: result.status,
    })
  }

  // ---------------------------------------------------------------------------
  // 私有辅助方法
  // ---------------------------------------------------------------------------

  /** 为任务创建一个新的对话 */
  private createConversationForJob(job: AgentCronJob): string {
    const row = this.db.prepare(
      `INSERT INTO conversations (project_id, title, model, thinking_level) VALUES (?, ?, ?, ?) RETURNING id`,
    ).get(
      job.projectId,
      `[Cron] ${job.name}`,
      null,
      'standard',
    ) as { id: string }
    return row.id
  }

  /** 注入任务描述作为第一条用户消息 */
  private injectTaskMessage(conversationId: string, job: AgentCronJob): void {
    const content = `# 定时任务: ${job.name}\n\n${job.description}\n\n_本任务由 Cron 调度器自动触发_`
    this.db.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, 'user', ?, ?)`,
    ).run(conversationId, content, Date.now())
  }

  /** 构建消息上下文（system + 用户任务描述） */
  private buildMessages(job: AgentCronJob): ChatMessage[] {
    return [
      {
        role: 'system',
        content: `你是一个自主执行定时任务的 Agent。请根据任务描述完成工作，使用可用工具进行操作。任务名称: ${job.name}`,
      },
      {
        role: 'user',
        content: `# 定时任务: ${job.name}\n\n${job.description}\n\n_本任务由 Cron 调度器自动触发_`,
      },
    ]
  }

  /** 构建工具定义列表，按 allowWriteTools 过滤 */
  private buildTools(allowWriteTools: boolean): ToolDefinition[] {
    const allTools = this.getToolsFn()
    if (allowWriteTools) {
      return allTools
    }
    return allTools.filter((t) => !WRITE_TOOLS.has(t.function.name))
  }

  /** 查找可用的 provider 和 model（model 返回 model_id 即 API 模型名,非 UUID 主键） */
  private getProviderAndModel(job: AgentCronJob): { providerId: string; model: string } {
    try {
      const provider = this.db.prepare('SELECT id FROM providers WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1').get() as
        | { id: string }
        | undefined
      if (provider) {
        const model = this.db.prepare('SELECT model_id FROM models WHERE provider_id = ? ORDER BY created_at ASC LIMIT 1').get(provider.id) as
          | { model_id: string }
          | undefined
        if (model) {
          return { providerId: provider.id, model: model.model_id }
        }
      }
    } catch {
      // DB 中无 providers 表或查询失败，返回空值
    }
    return { providerId: '', model: '' }
  }
}
