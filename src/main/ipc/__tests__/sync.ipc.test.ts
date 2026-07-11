import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import axios from 'axios'
import type { Database as DBType } from 'better-sqlite3'
import { MemoryRecallService } from '../../services/memory-recall.service'
import { SchedulerService } from '../../services/scheduler.service'

// 用 vi.hoisted 创建捕获 map,使其在 mock 工厂中可用
const { handlers, notificationCalls } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  notificationCalls: [] as Array<{ title: string; body: string }>,
}))

// mock electron 的 ipcMain.handle 与 Notification
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
  Notification: class {
    constructor(private options: { title: string; body: string }) {
      notificationCalls.push({ title: options.title, body: options.body })
    }
    show() {}
  },
}))

// mock axios
vi.mock('axios')

import { registerSyncIpc } from '../sync.ipc'

let db: DBType
let recallService: MemoryRecallService
let scheduler: SchedulerService

beforeEach(() => {
  handlers.clear()
  notificationCalls.length = 0
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, partition TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE sync_sources (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      endpoint TEXT NOT NULL, token TEXT DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at INTEGER, last_sync_result TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `)
  recallService = new MemoryRecallService(db)
  scheduler = new SchedulerService()
  vi.clearAllMocks()
})

describe('sync IPC', () => {
  it('sync:listSources 返回所有源', () => {
    registerSyncIpc(db, scheduler)
    db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      's1', 'github', 'Repo1', 'owner/repo', 'token', 1, Date.now(), Date.now()
    )
    const handler = handlers.get('sync:listSources')
    expect(handler).toBeDefined()
    const sources = handler!(null) as Array<{ name: string }>
    expect(sources.length).toBe(1)
    expect(sources[0].name).toBe('Repo1')
  })

  it('sync:addSource 创建新源', () => {
    registerSyncIpc(db, scheduler)
    const handler = handlers.get('sync:addSource')
    expect(handler).toBeDefined()
    const source = handler!(null, { type: 'github', name: 'New', endpoint: 'o/r' }) as {
      id: string; name: string; enabled: boolean
    }
    expect(source.id).toBeDefined()
    expect(source.name).toBe('New')
    expect(source.enabled).toBe(true)
  })

  it('sync:updateSource 更新源', () => {
    registerSyncIpc(db, scheduler)
    const addHandler = handlers.get('sync:addSource')!
    const created = addHandler(null, { type: 'github', name: 'Test', endpoint: 'o/r' }) as {
      id: string
    }
    const updateHandler = handlers.get('sync:updateSource')
    expect(updateHandler).toBeDefined()
    const updated = updateHandler!(null, created.id, { name: 'Updated' }) as { name: string }
    expect(updated.name).toBe('Updated')
  })

  it('sync:removeSource 删除源', () => {
    registerSyncIpc(db, scheduler)
    const addHandler = handlers.get('sync:addSource')!
    const created = addHandler(null, { type: 'github', name: 'Test', endpoint: 'o/r' }) as {
      id: string
    }
    const removeHandler = handlers.get('sync:removeSource')
    expect(removeHandler).toBeDefined()
    removeHandler!(null, created.id)
    const listHandler = handlers.get('sync:listSources')!
    const sources = listHandler!(null) as unknown[]
    expect(sources.length).toBe(0)
  })

  it('sync:triggerNow 触发同步并返回 FullSyncResult', async () => {
    registerSyncIpc(db, scheduler)
    db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      's1', 'github', 'Repo1', 'owner/repo', 'token', 1, Date.now(), Date.now()
    )
    vi.mocked(axios.get).mockResolvedValue({ data: [] })

    const handler = handlers.get('sync:triggerNow')
    expect(handler).toBeDefined()
    const result = (await handler!(null)) as {
      ok: boolean; results: unknown[]; totalWritten: number
    }
    expect(result.ok).toBe(true)
    expect(result.results.length).toBe(1)
    expect(result.totalWritten).toBe(0)
    // 验证通知已弹出
    expect(notificationCalls.length).toBe(1)
    expect(notificationCalls[0].title).toBe('同步完成')
  })

  it('sync:getSchedulerStatus 返回调度器状态', () => {
    scheduler.register('auto-fetch', 60000, () => {})
    registerSyncIpc(db, scheduler)
    const handler = handlers.get('sync:getSchedulerStatus')
    expect(handler).toBeDefined()
    const status = handler!(null) as { running: boolean; jobs: string[] }
    expect(status.running).toBe(false)
    expect(status.jobs).toContain('auto-fetch')
  })

  it('sync:getSchedulerStatus 无调度器时返回默认状态', () => {
    registerSyncIpc(db)
    const handler = handlers.get('sync:getSchedulerStatus')
    expect(handler).toBeDefined()
    const status = handler!(null) as { running: boolean; jobs: string[] }
    expect(status.running).toBe(false)
    expect(status.jobs.length).toBe(0)
  })
})
