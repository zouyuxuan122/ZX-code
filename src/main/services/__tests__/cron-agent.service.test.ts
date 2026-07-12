import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import { CronAgentService } from '../cron-agent.service'
import { SchedulerService } from '../scheduler.service'
import type { AgentCronJob } from '@shared/types/cron-agent'
import type { ToolDefinition } from '@shared/types/tool'

let db: DBType
let scheduler: SchedulerService
let service: CronAgentService

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  scheduler = new SchedulerService()
  service = new CronAgentService(db, scheduler)
})

describe('CronAgentService', () => {
  describe('parseCronExpression', () => {
    it('解析有效的 5 字段 cron 表达式 "0 9 * * *"', () => {
      const result = service.parseCronExpression('0 9 * * *')
      expect(result.valid).toBe(true)
      expect(result.nextRunTime).toBeInstanceOf(Date)
      expect(result.nextRunTime!.getTime()).toBeGreaterThan(Date.now())
    })

    it('解析 "*/5 * * * *" 为有效表达式', () => {
      const result = service.parseCronExpression('*/5 * * * *')
      expect(result.valid).toBe(true)
      expect(result.nextRunTime).toBeInstanceOf(Date)
    })

    it('解析 "0 0 1 * *" (每月 1 号) 为有效表达式', () => {
      const result = service.parseCronExpression('0 0 1 * *')
      expect(result.valid).toBe(true)
    })

    it('无效表达式返回 valid=false', () => {
      const result = service.parseCronExpression('not a cron')
      expect(result.valid).toBe(false)
      expect(result.nextRunTime).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('字段数不足返回 valid=false', () => {
      const result = service.parseCronExpression('0 9 *')
      expect(result.valid).toBe(false)
    })
  })

  describe('createJob', () => {
    it('创建任务并返回 AgentCronJob', () => {
      const job = service.createJob({
        name: '每日构建',
        description: '每天早上 9 点执行构建任务',
        cronExpression: '0 9 * * *',
        allowWriteTools: false,
      })
      expect(job.id).toBeDefined()
      expect(job.name).toBe('每日构建')
      expect(job.cronExpression).toBe('0 9 * * *')
      expect(job.enabled).toBe(true)
      expect(job.allowWriteTools).toBe(false)
    })

    it('无效 cron 表达式抛出错误', () => {
      expect(() =>
        service.createJob({
          name: '坏任务',
          description: '描述',
          cronExpression: 'invalid',
        }),
      ).toThrow()
    })
  })

  describe('listJobs', () => {
    it('返回所有任务', () => {
      service.createJob({ name: '任务1', description: 'd', cronExpression: '0 9 * * *' })
      service.createJob({ name: '任务2', description: 'd', cronExpression: '0 10 * * *' })
      const jobs = service.listJobs()
      expect(jobs).toHaveLength(2)
    })

    it('无任务时返回空数组', () => {
      expect(service.listJobs()).toEqual([])
    })
  })

  describe('deleteJob', () => {
    it('删除任务', () => {
      const job = service.createJob({ name: '任务', description: 'd', cronExpression: '0 9 * * *' })
      service.deleteJob(job.id)
      expect(service.listJobs()).toHaveLength(0)
    })
  })

  describe('toggleJob', () => {
    it('切换任务启用状态', () => {
      const job = service.createJob({ name: '任务', description: 'd', cronExpression: '0 9 * * *' })
      expect(job.enabled).toBe(true)
      service.toggleJob(job.id)
      const found = service.listJobs().find((j) => j.id === job.id)
      expect(found!.enabled).toBe(false)
    })
  })

  describe('registerJob', () => {
    it('有效表达式时向 SchedulerService 注册任务', () => {
      const job: AgentCronJob = {
        id: 'test-id',
        name: '注册测试',
        description: '描述',
        cronExpression: '0 9 * * *',
        projectId: null,
        enabled: true,
        allowWriteTools: false,
        lastRunAt: null,
        lastRunResult: null,
        lastRunStatus: null,
        runCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.registerJob(job)
      // scheduler 应该有该 job（按 name 注册）
      expect(scheduler.getJobNames()).toContain('cron:test-id')
    })

    it('无效表达式时不注册', () => {
      const job: AgentCronJob = {
        id: 'bad-id',
        name: '坏任务',
        description: '描述',
        cronExpression: 'invalid',
        projectId: null,
        enabled: true,
        allowWriteTools: false,
        lastRunAt: null,
        lastRunResult: null,
        lastRunStatus: null,
        runCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      service.registerJob(job)
      expect(scheduler.getJobNames()).not.toContain('cron:bad-id')
    })
  })

  describe('loadAndRegisterAll', () => {
    it('从 DB 加载所有 enabled 任务并注册', () => {
      service.createJob({ name: '任务1', description: 'd', cronExpression: '0 9 * * *' })
      service.createJob({ name: '任务2', description: 'd', cronExpression: '0 10 * * *' })
      // 创建后手动禁用第二个
      const jobs = service.listJobs()
      service.toggleJob(jobs[1].id)
      // 清空 scheduler 中的注册（模拟重启）
      for (const name of scheduler.getJobNames()) {
        scheduler.unregister(name)
      }
      // 重新加载
      service.loadAndRegisterAll()
      const names = scheduler.getJobNames()
      // 只应注册 enabled 的任务
      const cronNames = names.filter((n) => n.startsWith('cron:'))
      expect(cronNames).toHaveLength(1)
    })
  })

  describe('executeJob - 安全性', () => {
    /** 模拟工具定义列表（含只读 + 写入工具） */
    const mockToolDefinitions = [
      { type: 'function' as const, function: { name: 'read_file', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'list_files', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'grep', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'terminal_read', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'write_file', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'edit', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'run_command', description: 'd', parameters: { type: 'object', properties: {} } } },
      { type: 'function' as const, function: { name: 'run_script', description: 'd', parameters: { type: 'object', properties: {} } } },
    ]

    /** 安装 mock：替换 agentEngine 和工具定义提供者 */
    function installMocks(runConversation: unknown): void {
      ;(service as unknown as { agentEngine: { runConversation: unknown } }).agentEngine = {
        runConversation,
      }
      ;(service as unknown as { getToolsFn: () => unknown[] }).getToolsFn = () => mockToolDefinitions
    }

    it('allowWriteTools=false 时,传给 AgentEngine 的工具集不包含 write_file/edit/run_command', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '只读任务',
        description: '只读分析任务',
        cronExpression: '0 9 * * *',
        allowWriteTools: false,
      })

      await service.executeJob(job.id)

      expect(mockRunConversation).toHaveBeenCalledTimes(1)
      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      expect(callArgs.tools).toBeDefined()
      const toolNames = callArgs.tools!.map((t) => t.function.name)
      expect(toolNames).not.toContain('write_file')
      expect(toolNames).not.toContain('edit')
      expect(toolNames).not.toContain('run_command')
    })

    it('allowWriteTools=true 时,传给 AgentEngine 的工具集包含 write_file/edit', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '读写任务',
        description: '可修改文件的任务',
        cronExpression: '0 9 * * *',
        allowWriteTools: true,
      })

      await service.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      expect(callArgs.tools).toBeDefined()
      const toolNames = callArgs.tools!.map((t) => t.function.name)
      expect(toolNames).toContain('write_file')
      expect(toolNames).toContain('edit')
    })

    it('allowWriteTools=false 时,run_script 不在可用工具集中（防止绕过写入限制）', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '只读任务',
        description: '测试 run_script 被过滤',
        cronExpression: '0 9 * * *',
        allowWriteTools: false,
      })

      await service.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      expect(callArgs.tools).toBeDefined()
      const toolNames = callArgs.tools!.map((t) => t.function.name)
      // run_script 可通过 RPC 调用 write_file/edit/run_command，必须被过滤
      expect(toolNames).not.toContain('run_script')
    })

    it('allowWriteTools=false 时,terminal_read 仍在可用工具集中（只读工具不应被过滤）', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '只读任务',
        description: '测试 terminal_read 保留',
        cronExpression: '0 9 * * *',
        allowWriteTools: false,
      })

      await service.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      expect(callArgs.tools).toBeDefined()
      const toolNames = callArgs.tools!.map((t) => t.function.name)
      // terminal_read 是只读工具，不应被 WRITE_TOOLS 过滤
      expect(toolNames).toContain('terminal_read')
    })

    it('执行完成后更新 DB 的 last_run 字段', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '任务执行完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '任务',
        description: '描述',
        cronExpression: '0 9 * * *',
      })

      const result = await service.executeJob(job.id)
      expect(result.status).toBe('success')
      expect(result.conversationId).toBeDefined()
      expect(result.jobId).toBe(job.id)

      // DB 应已更新
      const found = service.listJobs().find((j) => j.id === job.id)
      expect(found!.lastRunStatus).toBe('success')
      expect(found!.lastRunAt).not.toBeNull()
      expect(found!.runCount).toBe(1)
    })

    it('AgentEngine 抛错时记录 failed 状态', async () => {
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'error', message: '模型调用失败' }
        yield { type: 'finish', reason: 'error' as const }
      })
      installMocks(mockRunConversation)

      const job = service.createJob({
        name: '失败任务',
        description: '描述',
        cronExpression: '0 9 * * *',
      })

      const result = await service.executeJob(job.id)
      expect(result.status).toBe('failed')
      expect(result.error).toBeDefined()

      const found = service.listJobs().find((j) => j.id === job.id)
      expect(found!.lastRunStatus).toBe('failed')
      expect(found!.runCount).toBe(1)
    })

    it('执行不存在的 jobId 返回 failed 结果', async () => {
      const result = await service.executeJob('non-existent-id')
      expect(result.status).toBe('failed')
      expect(result.error).toContain('不存在')
    })
  })

  describe('handleResult', () => {
    it('更新 DB 中的 last_run 字段', () => {
      const job = service.createJob({
        name: '任务',
        description: '描述',
        cronExpression: '0 9 * * *',
      })
      service.handleResult(job.id, {
        jobId: job.id,
        status: 'success',
        conversationId: 'conv-1',
        durationMs: 500,
        summary: '执行成功',
        executedAt: Date.now(),
      })
      const found = service.listJobs().find((j) => j.id === job.id)
      expect(found!.lastRunStatus).toBe('success')
      expect(found!.lastRunResult).toBe('执行成功')
      expect(found!.runCount).toBe(1)
    })
  })

  describe('依赖注入 - 避免循环依赖', () => {
    it('构造函数接受第三个参数 getToolsFn 并使用注入的工具列表', async () => {
      const injectedTools: ToolDefinition[] = [
        {
          type: 'function',
          function: {
            name: 'injected_only_tool',
            description: '仅存在于注入列表的工具',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]
      const injectedService = new CronAgentService(db, scheduler, () => injectedTools)

      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      ;(injectedService as unknown as { agentEngine: { runConversation: unknown } }).agentEngine = {
        runConversation: mockRunConversation,
      }

      const job = injectedService.createJob({
        name: '注入测试',
        description: '验证 getToolsFn 注入',
        cronExpression: '0 9 * * *',
        allowWriteTools: true,
      })

      await injectedService.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      expect(callArgs.tools).toBeDefined()
      const toolNames = callArgs.tools!.map((t) => t.function.name)
      // 注入的工具应出现
      expect(toolNames).toContain('injected_only_tool')
    })

    it('不传 getToolsFn 时,默认返回空工具列表（不导入 tools 模块）', async () => {
      const defaultService = new CronAgentService(db, scheduler)
      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      ;(defaultService as unknown as { agentEngine: { runConversation: unknown } }).agentEngine = {
        runConversation: mockRunConversation,
      }

      const job = defaultService.createJob({
        name: '默认测试',
        description: '验证默认 getToolsFn',
        cronExpression: '0 9 * * *',
        allowWriteTools: true,
      })

      await defaultService.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        tools?: Array<{ function: { name: string } }>
      }
      // 不传 getToolsFn 时,工具列表应为空（不触发循环导入）
      expect(callArgs.tools).toEqual([])
    })
  })

  describe('getProviderAndModel - 模型标识符', () => {
    it('返回 models.model_id (API 模型名) 而非 models.id (UUID)', async () => {
      // 在 DB 中插入 provider 和 model
      db.prepare(
        `INSERT INTO providers (id, name, type, enabled, base_url, api_key, created_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
      ).run('test-provider-id', '测试Provider', 'openai', 'https://api.test.com', 'sk-test', Date.now())

      db.prepare(
        `INSERT INTO models (id, provider_id, model_id, name, context_length, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        'uuid-for-model-row',
        'test-provider-id',
        'gpt-4-test',
        'GPT-4 Test',
        8192,
        Date.now(),
      )

      const mockRunConversation = vi.fn().mockImplementation(async function* () {
        yield { type: 'content', content: '完成' }
        yield { type: 'finish', reason: 'stop' as const }
      })
      ;(service as unknown as { agentEngine: { runConversation: unknown } }).agentEngine = {
        runConversation: mockRunConversation,
      }
      ;(service as unknown as { getToolsFn: () => unknown[] }).getToolsFn = () => []

      const job = service.createJob({
        name: '模型测试',
        description: '验证 model 标识符',
        cronExpression: '0 9 * * *',
      })

      await service.executeJob(job.id)

      const callArgs = mockRunConversation.mock.calls[0][0] as {
        providerId?: string
        model?: string
      }
      // providerId 应为 providers.id (UUID)
      expect(callArgs.providerId).toBe('test-provider-id')
      // model 应为 models.model_id (API 模型名),而非 models.id (UUID)
      expect(callArgs.model).toBe('gpt-4-test')
      expect(callArgs.model).not.toBe('uuid-for-model-row')
    })
  })
})
