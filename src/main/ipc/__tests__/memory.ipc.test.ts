import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryRecallService } from '../../services/memory-recall.service'

// 用 vi.hoisted 创建捕获 map，使其在 mock 工厂中可用
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}))

// mock electron 的 ipcMain.handle，捕获注册的 handler
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

import { registerMemoryIpc } from '../memory.ipc'

let db: DBType
let service: MemoryRecallService
const tmpDirs: string[] = []

beforeEach(() => {
  handlers.clear()
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, partition TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_memory_nodes_partition ON memory_nodes(partition);
  `)
  service = new MemoryRecallService(db)
  registerMemoryIpc(service)
})

afterEach(() => {
  // 清理导出测试创建的临时目录
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // 忽略清理失败
    }
  }
  tmpDirs.length = 0
})

describe('memory IPC', () => {
  it('memory:create 创建节点', () => {
    const handler = handlers.get('memory:create')
    expect(handler).toBeDefined()
    const result = handler!(null, { partition: 'general', title: '测试', content: '内容' }) as {
      title: string
    }
    expect(result.title).toBe('测试')
  })

  it('memory:list 列出节点（支持按分区过滤）', () => {
    service.createNode({ partition: 'general', title: 'n1', content: 'c1' })
    service.createNode({ partition: 'project', title: 'n2', content: 'c2' })
    const handler = handlers.get('memory:list')
    expect(handler).toBeDefined()

    const all = handler!(null) as Array<{ title: string }>
    expect(all.length).toBe(2)

    const projectOnly = handler!(null, 'project') as Array<{ title: string }>
    expect(projectOnly.length).toBe(1)
    expect(projectOnly[0].title).toBe('n2')
  })

  it('memory:search 搜索节点', () => {
    service.createNode({ partition: 'general', title: 'React 架构', content: '组件设计' })
    const handler = handlers.get('memory:search')
    expect(handler).toBeDefined()
    const results = handler!(null, { keyword: 'React', limit: 10 }) as Array<{
      node: { title: string }
      score: number
    }>
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].node.title).toBe('React 架构')
  })

  it('memory:get 获取单个节点', () => {
    const created = service.createNode({ partition: 'general', title: 'test', content: 'c' })
    const handler = handlers.get('memory:get')
    expect(handler).toBeDefined()
    const found = handler!(null, created.id) as { title: string } | null
    expect(found?.title).toBe('test')
  })

  it('memory:get 不存在的节点返回 null', () => {
    const handler = handlers.get('memory:get')
    expect(handler).toBeDefined()
    const found = handler!(null, 'nonexistent-id') as null
    expect(found).toBeNull()
  })

  it('memory:update 更新节点', () => {
    const created = service.createNode({ partition: 'general', title: 'old', content: 'c' })
    const handler = handlers.get('memory:update')
    expect(handler).toBeDefined()
    const updated = handler!(null, created.id, { title: 'new' }) as { title: string }
    expect(updated.title).toBe('new')
  })

  it('memory:delete 删除节点', () => {
    const created = service.createNode({ partition: 'general', title: 'del', content: 'c' })
    const handler = handlers.get('memory:delete')
    expect(handler).toBeDefined()
    handler!(null, created.id)
    expect(service.getNode(created.id)).toBeNull()
  })

  it('memory:stats 返回统计', () => {
    service.createNode({ partition: 'general', title: 'n1', content: 'c1' })
    service.createNode({ partition: 'project', title: 'n2', content: 'c2' })
    service.createNode({ partition: 'project', title: 'n3', content: 'c3' })
    const handler = handlers.get('memory:stats')
    expect(handler).toBeDefined()
    const stats = handler!(null) as {
      total: number
      byPartition: Record<string, number>
    }
    expect(stats.total).toBe(3)
    expect(stats.byPartition.project).toBe(2)
    expect(stats.byPartition.general).toBe(1)
  })

  it('memory:exportObsidian 导出为 Markdown', () => {
    service.createNode({
      partition: 'general',
      title: '节点1',
      content: '内容1',
      tags: ['tag1'],
    })
    const handler = handlers.get('memory:exportObsidian')
    expect(handler).toBeDefined()

    const tmpDir = path.join(os.tmpdir(), `zx-memory-test-${Date.now()}`)
    tmpDirs.push(tmpDir)
    const result = handler!(null, { outputPath: tmpDir }) as {
      ok: boolean
      exportedCount: number
      outputPath: string
    }
    expect(result.ok).toBe(true)
    expect(result.exportedCount).toBe(1)
    expect(result.outputPath).toBe(tmpDir)

    // 验证文件存在：应在分区子目录下生成 .md 文件
    const partitionDir = path.join(tmpDir, 'general')
    const files = fs.readdirSync(partitionDir)
    expect(files.length).toBeGreaterThan(0)
    expect(files[0].endsWith('.md')).toBe(true)

    // 验证文件内容包含 YAML frontmatter 与标题
    const content = fs.readFileSync(path.join(partitionDir, files[0]), 'utf-8')
    expect(content).toContain('---')
    expect(content).toContain('# 节点1')
    expect(content).toContain('内容1')
  })

  it('memory:exportObsidian 排除 subconscious 分区', () => {
    service.createNode({ partition: 'general', title: '可见', content: 'c1' })
    service.createNode({ partition: 'subconscious', title: '隐藏', content: 'c2' })
    const handler = handlers.get('memory:exportObsidian')

    const tmpDir = path.join(os.tmpdir(), `zx-memory-test-sub-${Date.now()}`)
    tmpDirs.push(tmpDir)
    const result = handler!(null, {
      outputPath: tmpDir,
      includeSubconscious: false,
    }) as { ok: boolean; exportedCount: number }
    expect(result.ok).toBe(true)
    expect(result.exportedCount).toBe(1)

    // subconscious 子目录不应存在
    expect(fs.existsSync(path.join(tmpDir, 'subconscious'))).toBe(false)
  })
})
