import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryRecallService } from '../memory-recall.service'
import { SubconsciousService } from '../subconscious.service'
import type { Database as DBType } from 'better-sqlite3'

let db: DBType
let recallService: MemoryRecallService
let subconscious: SubconsciousService
let tmpDir: string

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE memory_nodes (
      id TEXT PRIMARY KEY, parent_id TEXT, partition TEXT NOT NULL,
      title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `)
  recallService = new MemoryRecallService(db)
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-subconscious-'))

  // 创建一些文件
  fs.writeFileSync(path.join(tmpDir, 'file1.ts'), 'export const a = 1')
  fs.writeFileSync(path.join(tmpDir, 'file2.ts'), 'export const b = 2')

  // mock child_process (git diff 可能不可用)
  subconscious = new SubconsciousService(recallService)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('SubconsciousService', () => {
  it('scanWorkspaceChanges 返回变更文件列表', async () => {
    // 修改一个文件
    fs.writeFileSync(path.join(tmpDir, 'file1.ts'), 'export const a = 2 // changed')
    // 新增一个文件
    fs.writeFileSync(path.join(tmpDir, 'file3.ts'), 'export const c = 3')

    const changes = await subconscious.scanWorkspaceChanges(tmpDir)
    expect(changes.length).toBeGreaterThan(0)
  })

  it('runSync 生成变更摘要并写入记忆 subconscious 分区', async () => {
    // 首次运行建立基线(不写入变更记忆)
    await subconscious.runSync(tmpDir)

    // 修改文件触发变更
    fs.writeFileSync(path.join(tmpDir, 'file1.ts'), 'changed content')

    await subconscious.runSync(tmpDir)

    const nodes = recallService.listNodes('subconscious')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0].partition).toBe('subconscious')
  })

  it('无变更时不写入记忆', async () => {
    // 先运行一次建立基线
    await subconscious.runSync(tmpDir)
    const countBefore = recallService.listNodes('subconscious').length

    // 再次运行(无变更)
    await subconscious.runSync(tmpDir)
    const countAfter = recallService.listNodes('subconscious').length

    expect(countAfter).toBe(countBefore)
  })

  it('工作区不存在时不抛错', async () => {
    await expect(subconscious.runSync('/nonexistent/path')).resolves.not.toThrow()
  })

  it('摘要包含文件变更统计', async () => {
    // 首次运行建立基线(不写入变更记忆)
    await subconscious.runSync(tmpDir)

    fs.writeFileSync(path.join(tmpDir, 'file1.ts'), 'changed')
    fs.writeFileSync(path.join(tmpDir, 'new.ts'), 'new file')

    await subconscious.runSync(tmpDir)

    const nodes = recallService.listNodes('subconscious')
    expect(nodes.length).toBe(1)
    // 摘要应包含文件名
    expect(nodes[0].content).toContain('file1.ts')
  })
})
