import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../../database/migrate'
import { SkillEvolutionService } from '../../services/skill-evolution.service'
import { CronAgentService } from '../../services/cron-agent.service'
import { SchedulerService } from '../../services/scheduler.service'

// 用 vi.hoisted 创建捕获 map，使其在 mock 工厂中可用
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

// mock electron 的 ipcMain.handle，捕获注册的 handler
// 显式提供 net: undefined，使 providers/base.ts 的 `typeof net !== 'undefined'` 判定为 false
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
  net: undefined,
}))

// Mock scl.service（依赖全局 getDb + electron net，需隔离）
vi.mock('../../services/scl.service', () => ({
  listSclExtensions: vi.fn(),
  updateSclExtension: vi.fn(),
}))

// Mock trace.repo（SkillEvolutionService 依赖）
vi.mock('../../database/repositories/trace.repo', () => ({
  getTracesByTool: vi.fn(),
  getFailedTraces: vi.fn(),
  queryTraces: vi.fn(),
}))

// Mock tools 模块（避免拉入 provider/electron net 依赖链；测试中通过注入 service 绕过单例）
vi.mock('../../tools', () => ({
  getCronAgentService: vi.fn(() => null),
}))

import { registerEvolutionIpc } from '../evolution.ipc'
import { registerSearchIpc } from '../search.ipc'
import { registerProfileIpc } from '../profile.ipc'
import { registerCronIpc } from '../cron.ipc'

let db: DBType

beforeEach(() => {
  handlers.clear()
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  vi.clearAllMocks()
})

describe('IPC 模块注册', () => {
  it('evolution IPC 注册 4 个通道', () => {
    const service = new SkillEvolutionService(db)
    registerEvolutionIpc(service, db)

    expect(handlers.has('evolution:run')).toBe(true)
    expect(handlers.has('evolution:history')).toBe(true)
    expect(handlers.has('evolution:rollback')).toBe(true)
    expect(handlers.has('evolution:compare')).toBe(true)
  })

  it('search IPC 注册 3 个通道', () => {
    registerSearchIpc(db)

    expect(handlers.has('search:files')).toBe(true)
    expect(handlers.has('search:messages')).toBe(true)
    expect(handlers.has('search:conversations')).toBe(true)
  })

  it('profile IPC 注册 3 个通道', () => {
    registerProfileIpc(db)

    expect(handlers.has('profile:get')).toBe(true)
    expect(handlers.has('profile:update')).toBe(true)
    expect(handlers.has('profile:clear')).toBe(true)
  })

  it('cron IPC 注册 5 个通道', () => {
    const scheduler = new SchedulerService()
    const cronService = new CronAgentService(db, scheduler)
    registerCronIpc(cronService, db)

    expect(handlers.has('cron:create')).toBe(true)
    expect(handlers.has('cron:list')).toBe(true)
    expect(handlers.has('cron:delete')).toBe(true)
    expect(handlers.has('cron:toggle')).toBe(true)
    expect(handlers.has('cron:history')).toBe(true)
  })

  it('所有 4 个模块的注册函数都存在且为函数', () => {
    expect(typeof registerEvolutionIpc).toBe('function')
    expect(typeof registerSearchIpc).toBe('function')
    expect(typeof registerProfileIpc).toBe('function')
    expect(typeof registerCronIpc).toBe('function')
  })
})

describe('profile IPC handler 行为', () => {
  it('profile:get 初始返回空数组', async () => {
    registerProfileIpc(db)
    const handler = handlers.get('profile:get')!
    const result = await handler(null)
    expect(result).toEqual([])
  })

  it('profile:update 插入后 profile:get 返回该条目', async () => {
    registerProfileIpc(db)

    const updateHandler = handlers.get('profile:update')!
    await updateHandler(null, {
      dimension: 'tech_stack',
      value: 'TypeScript',
      confidence: 0.9,
      source: 'manual',
    })

    const getHandler = handlers.get('profile:get')!
    const entries = (await getHandler(null)) as Array<{
      dimension: string
      value: string
    }>
    expect(entries.length).toBe(1)
    expect(entries[0].dimension).toBe('tech_stack')
    expect(entries[0].value).toBe('TypeScript')
  })

  it('profile:clear 清空所有画像', async () => {
    registerProfileIpc(db)

    const updateHandler = handlers.get('profile:update')!
    await updateHandler(null, { dimension: 'tech_stack', value: 'TS' })

    const clearHandler = handlers.get('profile:clear')!
    await clearHandler(null)

    const getHandler = handlers.get('profile:get')!
    const entries = await getHandler(null)
    expect(entries).toEqual([])
  })
})

describe('cron IPC handler 行为', () => {
  it('cron:create 创建任务后 cron:list 返回该任务', async () => {
    const scheduler = new SchedulerService()
    const cronService = new CronAgentService(db, scheduler)
    registerCronIpc(cronService, db)

    const createHandler = handlers.get('cron:create')!
    const job = (await createHandler(null, {
      name: '测试任务',
      description: '用于测试',
      cronExpression: '0 9 * * *',
    })) as { id: string; name: string }

    expect(job.name).toBe('测试任务')

    const listHandler = handlers.get('cron:list')!
    const jobs = (await listHandler(null)) as Array<{ id: string; name: string }>
    expect(jobs.length).toBe(1)
    expect(jobs[0].id).toBe(job.id)
  })

  it('cron:history 返回 DB 中的任务', async () => {
    const scheduler = new SchedulerService()
    const cronService = new CronAgentService(db, scheduler)
    registerCronIpc(cronService, db)

    // 直接通过 service 创建一条任务
    cronService.createJob({
      name: '历史任务',
      description: '历史',
      cronExpression: '*/5 * * * *',
    })

    const historyHandler = handlers.get('cron:history')!
    const jobs = (await historyHandler(null)) as Array<{ name: string }>
    expect(jobs.length).toBe(1)
    expect(jobs[0].name).toBe('历史任务')
  })

  it('cron:delete 删除任务', async () => {
    const scheduler = new SchedulerService()
    const cronService = new CronAgentService(db, scheduler)
    registerCronIpc(cronService, db)

    const job = cronService.createJob({
      name: '待删除',
      description: '删除测试',
      cronExpression: '0 9 * * *',
    })

    const deleteHandler = handlers.get('cron:delete')!
    await deleteHandler(null, job.id)

    const listHandler = handlers.get('cron:list')!
    const jobs = (await listHandler(null)) as unknown[]
    expect(jobs).toHaveLength(0)
  })
})

describe('search IPC handler 行为', () => {
  it('search:messages 无匹配时返回空数组', async () => {
    registerSearchIpc(db)
    const handler = handlers.get('search:messages')!
    const result = await handler(null, '不存在的关键词')
    expect(result).toEqual([])
  })

  it('search:conversations 无匹配时返回空数组', async () => {
    registerSearchIpc(db)
    const handler = handlers.get('search:conversations')!
    const result = await handler(null, '不存在的关键词')
    expect(result).toEqual([])
  })
})
