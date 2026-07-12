import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../../database/migrate'
import { CronAgentService } from '../../../services/cron-agent.service'
import { SchedulerService } from '../../../services/scheduler.service'
import { createCronManageTool } from '../cron_manage.tool'
import type { BuiltinTool } from '@shared/types/tool'

let db: DBType
let service: CronAgentService
let tool: BuiltinTool

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const scheduler = new SchedulerService()
  service = new CronAgentService(db, scheduler)
  tool = createCronManageTool(service)
})

/** 工具执行上下文（最小可用） */
const ctx = {
  workspacePath: '',
  projectId: null,
  conversationId: '',
  autoAccept: true,
}

describe('cron_manage tool - 定义', () => {
  it('工具名称为 cron_manage', () => {
    expect(tool.name).toBe('cron_manage')
  })

  it('描述包含 "scheduled" 或 "定时" 或 "cron"', () => {
    expect(tool.description.toLowerCase()).toMatch(/scheduled|定时|cron/)
  })

  it('parameters 包含 action 字段,枚举值为 create/list/delete/toggle', () => {
    const params = tool.parameters as Record<string, Record<string, unknown>>
    expect(params.action).toBeDefined()
    expect(params.action.type).toBe('string')
    const enumValues = params.action.enum as string[]
    expect(enumValues).toContain('create')
    expect(enumValues).toContain('list')
    expect(enumValues).toContain('delete')
    expect(enumValues).toContain('toggle')
  })

  it('required 包含 action', () => {
    expect(tool.required).toContain('action')
  })

  it('requiredPermissions 为空数组(allow)', () => {
    expect(tool.requiredPermissions).toEqual([])
  })
})

describe('cron_manage tool - execute', () => {
  it('action=create 创建任务', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        name: '测试任务',
        description: '测试描述',
        cronExpression: '0 9 * * *',
      },
      ctx,
    )
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('测试任务')
    // 应该确实插入 DB
    const jobs = service.listJobs()
    expect(jobs).toHaveLength(1)
    expect(jobs[0].name).toBe('测试任务')
  })

  it('action=create 缺少 name 时返回错误', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        description: '描述',
        cronExpression: '0 9 * * *',
      },
      ctx,
    )
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('name')
  })

  it('action=create 缺少 cronExpression 时返回错误', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        name: '任务',
        description: '描述',
      },
      ctx,
    )
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('cron')
  })

  it('action=create 缺少 description 时返回错误', async () => {
    const result = await tool.execute(
      {
        action: 'create',
        name: '任务',
        cronExpression: '0 9 * * *',
      },
      ctx,
    )
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('description')
  })

  it('action=list 列出所有任务', async () => {
    service.createJob({ name: '任务A', description: 'd', cronExpression: '0 9 * * *' })
    service.createJob({ name: '任务B', description: 'd', cronExpression: '0 10 * * *' })
    const result = await tool.execute({ action: 'list' }, ctx)
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('任务A')
    expect(result.content).toContain('任务B')
  })

  it('action=list 无任务时返回提示', async () => {
    const result = await tool.execute({ action: 'list' }, ctx)
    expect(result.is_error).toBe(false)
    expect(result.content).toContain('暂无')
  })

  it('action=delete 删除任务', async () => {
    const job = service.createJob({ name: '待删除', description: 'd', cronExpression: '0 9 * * *' })
    const result = await tool.execute({ action: 'delete', jobId: job.id }, ctx)
    expect(result.is_error).toBe(false)
    expect(service.listJobs()).toHaveLength(0)
  })

  it('action=delete 缺少 jobId 时返回错误', async () => {
    const result = await tool.execute({ action: 'delete' }, ctx)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('jobId')
  })

  it('action=toggle 切换任务启用状态', async () => {
    const job = service.createJob({ name: '任务', description: 'd', cronExpression: '0 9 * * *' })
    expect(job.enabled).toBe(true)
    const result = await tool.execute({ action: 'toggle', jobId: job.id }, ctx)
    expect(result.is_error).toBe(false)
    const found = service.listJobs().find((j) => j.id === job.id)
    expect(found!.enabled).toBe(false)
  })

  it('action=toggle 缺少 jobId 时返回错误', async () => {
    const result = await tool.execute({ action: 'toggle' }, ctx)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('jobId')
  })

  it('未知 action 返回错误', async () => {
    const result = await tool.execute({ action: 'unknown' as 'create' }, ctx)
    expect(result.is_error).toBe(true)
  })
})
