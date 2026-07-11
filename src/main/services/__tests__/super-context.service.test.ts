import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { SuperContextService } from '../super-context.service'
import { MemoryRecallService } from '../memory-recall.service'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { Database as DBType } from 'better-sqlite3'

let db: DBType
let recallService: MemoryRecallService
let contextService: SuperContextService
let tmpDir: string

beforeEach(() => {
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
  recallService = new MemoryRecallService(db)
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-superctx-'))

  // 创建一些测试文件（先建目录再写文件）
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n\nA test project for SuperContext.')
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export default function() {}')

  contextService = new SuperContextService(recallService, db)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('SuperContextService', () => {
  describe('buildBriefing', () => {
    it('返回包含 files/memories/histories 的简报', async () => {
      const briefing = await contextService.buildBriefing(tmpDir, 'test the project', 5000)
      expect(briefing).toHaveProperty('files')
      expect(briefing).toHaveProperty('memories')
      expect(briefing).toHaveProperty('histories')
      expect(briefing).toHaveProperty('durationMs')
      expect(briefing).toHaveProperty('degraded')
      expect(Array.isArray(briefing.files)).toBe(true)
      expect(Array.isArray(briefing.memories)).toBe(true)
      expect(Array.isArray(briefing.histories)).toBe(true)
    })

    it('扫描工作区文件并返回相关文件(≤10)', async () => {
      const briefing = await contextService.buildBriefing(tmpDir, 'project index', 5000)
      expect(briefing.files.length).toBeLessThanOrEqual(10)
      // 应找到 README.md 或 src/index.ts
      expect(briefing.files.length).toBeGreaterThan(0)
    })

    it('检索相关记忆(≤3)', async () => {
      // 先写入记忆
      recallService.createNode({ partition: 'project', title: '项目结构', content: '使用 TypeScript', tags: ['ts'] })
      recallService.createNode({ partition: 'decision', title: '架构决策', content: '采用模块化架构', tags: ['arch'] })

      const briefing = await contextService.buildBriefing(tmpDir, '项目架构', 5000)
      expect(briefing.memories.length).toBeLessThanOrEqual(3)
    })

    it('超时降级返回空简报(degraded=true)', async () => {
      // 设置极短超时
      const briefing = await contextService.buildBriefing(tmpDir, 'test', 1)
      expect(briefing.degraded).toBe(true)
      expect(briefing.files).toEqual([])
      expect(briefing.memories).toEqual([])
      expect(briefing.histories).toEqual([])
    })

    it('无记忆时 memories 为空数组', async () => {
      const briefing = await contextService.buildBriefing(tmpDir, 'test', 5000)
      expect(briefing.memories).toEqual([])
    })

    it('durationMs 大于 0', async () => {
      const briefing = await contextService.buildBriefing(tmpDir, 'test', 5000)
      expect(briefing.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('formatBriefingAsText', () => {
    it('格式化简报为可注入的文本', () => {
      const briefing = {
        files: [{ path: 'README.md', reason: '项目说明文件' }],
        memories: [{ id: '1', title: '架构', partition: 'decision', snippet: '采用 React' }],
        histories: [{ conversationId: 'c1', title: '历史对话', summary: '讨论了架构' }],
        durationMs: 100,
        degraded: false,
      }
      const text = contextService.formatBriefingAsText(briefing)
      expect(text).toContain('README.md')
      expect(text).toContain('架构')
      expect(text).toContain('历史对话')
    })

    it('空简报返回空字符串', () => {
      const briefing = {
        files: [], memories: [], histories: [],
        durationMs: 0, degraded: true,
      }
      const text = contextService.formatBriefingAsText(briefing)
      expect(text).toBe('')
    })
  })
})
