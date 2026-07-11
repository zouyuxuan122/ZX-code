import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import axios from 'axios'
import { MemoryRecallService } from '../memory-recall.service'
import { AutoFetchService } from '../auto-fetch.service'
import type { Database as DBType } from 'better-sqlite3'

// mock axios
vi.mock('axios')

let db: DBType
let recallService: MemoryRecallService
let autoFetch: AutoFetchService

beforeEach(() => {
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
  autoFetch = new AutoFetchService(recallService, db)
  vi.clearAllMocks()
})

describe('AutoFetchService', () => {
  describe('fetchSource (GitHub)', () => {
    it('拉取 GitHub issues 并写入记忆', async () => {
      const source = {
        id: 'src1', type: 'github' as const, name: 'Test Repo',
        endpoint: 'owner/repo', token: 'fake-token', enabled: true,
        last_synced_at: null, last_sync_result: null,
        created_at: Date.now(), updated_at: Date.now()
      }

      // mock axios 返回 issues
      vi.mocked(axios.get).mockResolvedValue({
        data: [
          { number: 1, title: 'Bug 修复', state: 'open', body: '描述内容', user: { login: 'user1' } },
          { number: 2, title: '新功能', state: 'closed', body: '功能描述', user: { login: 'user2' } }
        ]
      })

      const result = await autoFetch.fetchSource(source)
      expect(result.ok).toBe(true)
      expect(result.fetchedCount).toBe(2)
      expect(result.writtenCount).toBe(2)

      // 验证记忆已写入
      const nodes = recallService.listNodes('general')
      expect(nodes.length).toBe(2)
      // listNodes 按 updated_at DESC 排序,同毫秒写入顺序不确定,故用 some 断言
      expect(nodes.some((n) => n.title.includes('Bug 修复'))).toBe(true)
    })

    it('GitHub API 错误返回 ok=false', async () => {
      const source = {
        id: 'src1', type: 'github' as const, name: 'Test',
        endpoint: 'owner/repo', token: 'fake', enabled: true,
        last_synced_at: null, last_sync_result: null,
        created_at: Date.now(), updated_at: Date.now()
      }

      vi.mocked(axios.get).mockRejectedValue(new Error('API 401'))

      const result = await autoFetch.fetchSource(source)
      expect(result.ok).toBe(false)
      expect(result.error).toContain('401')
    })
  })

  describe('fetchSource (RSS)', () => {
    it('拉取 RSS feed 并写入记忆', async () => {
      const source = {
        id: 'src2', type: 'rss' as const, name: 'Tech Blog',
        endpoint: 'https://blog.example.com/feed.xml', token: '', enabled: true,
        last_synced_at: null, last_sync_result: null,
        created_at: Date.now(), updated_at: Date.now()
      }

      const rssXml = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Tech Blog</title>
            <item>
              <title>文章1</title>
              <description>文章1描述</description>
              <link>https://blog.example.com/1</link>
            </item>
            <item>
              <title>文章2</title>
              <description>文章2描述</description>
              <link>https://blog.example.com/2</link>
            </item>
          </channel>
        </rss>`

      vi.mocked(axios.get).mockResolvedValue({ data: rssXml })

      const result = await autoFetch.fetchSource(source)
      expect(result.ok).toBe(true)
      expect(result.fetchedCount).toBe(2)
      expect(result.writtenCount).toBe(2)

      const nodes = recallService.listNodes('general')
      expect(nodes.length).toBe(2)
    })
  })

  describe('fetchAll', () => {
    it('拉取所有已启用的数据源', async () => {
      // 插入两个源
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's1', 'github', 'Repo1', 'owner/repo', 'token', 1, Date.now(), Date.now()
      )
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's2', 'rss', 'Blog', 'https://blog.com/feed', '', 1, Date.now(), Date.now()
      )

      vi.mocked(axios.get).mockResolvedValue({ data: [] })

      const result = await autoFetch.fetchAll()
      expect(result.ok).toBe(true)
      expect(result.results.length).toBe(2)
    })

    it('跳过禁用的源', async () => {
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's1', 'github', 'Repo1', 'owner/repo', 'token', 0, Date.now(), Date.now()
      )

      const result = await autoFetch.fetchAll()
      expect(result.results.length).toBe(0)
    })

    it('单源失败不影响其他源', async () => {
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's1', 'github', 'Repo1', 'owner/repo', 'token', 1, Date.now(), Date.now()
      )
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's2', 'rss', 'Blog', 'https://blog.com/feed', '', 1, Date.now(), Date.now()
      )

      // 第一次调用失败,第二次成功
      vi.mocked(axios.get)
        .mockRejectedValueOnce(new Error('网络错误'))
        .mockResolvedValueOnce({ data: '<?xml version="1.0"?><rss><channel><title>T</title></channel></rss>' })

      const result = await autoFetch.fetchAll()
      expect(result.results.length).toBe(2)
      expect(result.results[0].ok).toBe(false)
      expect(result.results[1].ok).toBe(true)
    })
  })

  describe('CRUD', () => {
    it('listSources 返回所有源', () => {
      db.prepare(`INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        's1', 'github', 'Repo1', 'owner/repo', 'token', 1, Date.now(), Date.now()
      )
      const sources = autoFetch.listSources()
      expect(sources.length).toBe(1)
      expect(sources[0].name).toBe('Repo1')
    })

    it('addSource 创建新源', () => {
      const source = autoFetch.addSource({ type: 'github', name: 'New', endpoint: 'owner/repo' })
      expect(source.id).toBeDefined()
      expect(source.enabled).toBe(true)
    })

    it('removeSource 删除源', () => {
      const source = autoFetch.addSource({ type: 'github', name: 'Test', endpoint: 'o/r' })
      autoFetch.removeSource(source.id)
      expect(autoFetch.listSources().length).toBe(0)
    })

    it('updateSource 更新源', () => {
      const source = autoFetch.addSource({ type: 'github', name: 'Test', endpoint: 'o/r' })
      const updated = autoFetch.updateSource(source.id, { name: 'Updated' })
      expect(updated.name).toBe('Updated')
    })
  })
})
