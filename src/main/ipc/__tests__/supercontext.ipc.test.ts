import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// 捕获注册的 ipcMain.handle handler（参考 goal.ipc.test.ts 的 mock 模式）
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

import { registerSuperContextIpc } from '../supercontext.ipc'

let db: DBType
let tmpDir: string

beforeEach(() => {
  handlers.clear()
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, partition TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, project_id TEXT, updated_at INTEGER);
    CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, created_at INTEGER);
  `)
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-superctx-ipc-'))
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project\nA test project.')
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export default function() {}')

  registerSuperContextIpc(db)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('supercontext IPC', () => {
  it('注册 supercontext:build 通道', () => {
    expect(handlers.has('supercontext:build')).toBe(true)
  })

  it('supercontext:build 返回 ContextBriefing', async () => {
    const handler = handlers.get('supercontext:build')!
    const briefing = (await handler(null, tmpDir, 'project index', 5000)) as {
      files: unknown[]
      memories: unknown[]
      histories: unknown[]
      durationMs: number
      degraded: boolean
    }
    expect(briefing).toHaveProperty('files')
    expect(briefing).toHaveProperty('memories')
    expect(briefing).toHaveProperty('histories')
    expect(briefing).toHaveProperty('durationMs')
    expect(briefing).toHaveProperty('degraded')
    expect(Array.isArray(briefing.files)).toBe(true)
    expect(briefing.files.length).toBeGreaterThan(0)
  })

  it('supercontext:build 默认超时为 800ms', async () => {
    const handler = handlers.get('supercontext:build')!
    // 不传 timeoutMs，应使用默认值且正常返回
    const briefing = (await handler(null, tmpDir, 'project', undefined)) as { degraded: boolean }
    expect(briefing.degraded).toBe(false)
  })

  it('注册 supercontext:format 通道', () => {
    expect(handlers.has('supercontext:format')).toBe(true)
  })

  it('supercontext:format 格式化简报为文本', () => {
    const handler = handlers.get('supercontext:format')!
    const briefing = {
      files: [{ path: 'README.md', reason: '项目说明' }],
      memories: [{ id: '1', title: '架构', partition: 'decision', snippet: '采用 React' }],
      histories: [{ conversationId: 'c1', title: '历史对话', summary: '讨论了架构' }],
      durationMs: 100,
      degraded: false,
    }
    const text = handler(null, briefing) as string
    expect(text).toContain('README.md')
    expect(text).toContain('架构')
    expect(text).toContain('历史对话')
  })

  it('supercontext:format 空简报返回空字符串', () => {
    const handler = handlers.get('supercontext:format')!
    const briefing = {
      files: [],
      memories: [],
      histories: [],
      durationMs: 0,
      degraded: true,
    }
    const text = handler(null, briefing) as string
    expect(text).toBe('')
  })
})
