import axios from 'axios'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import type { MemoryRecallService } from './memory-recall.service'
import type {
  SyncSource,
  CreateSyncSourceDto,
  UpdateSyncSourceDto,
  SyncRunResult,
  FullSyncResult,
} from '../../shared/types/sync'

interface SyncSourceRow {
  id: string
  type: string
  name: string
  endpoint: string
  token: string
  enabled: number
  last_synced_at: number | null
  last_sync_result: string | null
  created_at: number
  updated_at: number
}

interface GitHubIssue {
  number: number
  title: string
  state: string
  body: string
  user: { login: string }
}

interface RssItem {
  title: string
  description: string
  link: string
}

/**
 * 外部数据源自动拉取服务
 * 支持 GitHub issues / RSS feed,拉取后写入记忆树 general 分区
 */
export class AutoFetchService {
  constructor(
    private recallService: MemoryRecallService,
    private db: Database.Database
  ) {}

  /** 拉取单个数据源 */
  async fetchSource(source: SyncSource): Promise<SyncRunResult> {
    const startTime = Date.now()
    try {
      let fetchedCount = 0
      let writtenCount = 0

      if (source.type === 'github') {
        const result = await this.fetchGitHub(source)
        fetchedCount = result.fetched
        writtenCount = result.written
      } else if (source.type === 'rss') {
        const result = await this.fetchRss(source)
        fetchedCount = result.fetched
        writtenCount = result.written
      }

      // 更新 last_synced_at
      this.updateSyncStatus(source.id, true, `${fetchedCount} 条已同步`)

      return {
        ok: true,
        sourceId: source.id,
        sourceName: source.name,
        fetchedCount,
        writtenCount,
        durationMs: Date.now() - startTime,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.updateSyncStatus(source.id, false, errorMsg)

      return {
        ok: false,
        sourceId: source.id,
        sourceName: source.name,
        fetchedCount: 0,
        writtenCount: 0,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /** 拉取所有已启用的源 */
  async fetchAll(): Promise<FullSyncResult> {
    const startTime = Date.now()
    const sources = this.listSources().filter((s) => s.enabled)
    const results: SyncRunResult[] = []

    for (const source of sources) {
      const result = await this.fetchSource(source)
      results.push(result)
    }

    const totalFetched = results.reduce((sum, r) => sum + r.fetchedCount, 0)
    const totalWritten = results.reduce((sum, r) => sum + r.writtenCount, 0)

    return {
      ok: results.every((r) => r.ok),
      results,
      totalFetched,
      totalWritten,
      durationMs: Date.now() - startTime,
    }
  }

  /** GitHub issues 拉取 */
  private async fetchGitHub(
    source: SyncSource
  ): Promise<{ fetched: number; written: number }> {
    const url = `https://api.github.com/repos/${source.endpoint}/issues?state=all&per_page=30`
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
    if (source.token) headers.Authorization = `token ${source.token}`

    const response = await axios.get<GitHubIssue[]>(url, { headers, timeout: 10000 })
    const issues = response.data

    for (const issue of issues) {
      this.recallService.createNode({
        partition: 'general',
        title: `[GitHub] #${issue.number} ${issue.title}`,
        content: `仓库: ${source.endpoint}\n状态: ${issue.state}\n作者: ${issue.user.login}\n\n${issue.body || '无描述'}`,
        tags: ['github', 'issue', source.endpoint],
      })
    }

    return { fetched: issues.length, written: issues.length }
  }

  /** RSS 拉取 */
  private async fetchRss(
    source: SyncSource
  ): Promise<{ fetched: number; written: number }> {
    const response = await axios.get<string>(source.endpoint, { timeout: 10000 })
    const xml = response.data

    // 简单 XML 解析(提取 item 中的 title/description/link)
    const items = this.parseRssItems(xml)

    for (const item of items) {
      this.recallService.createNode({
        partition: 'general',
        title: `[RSS] ${item.title}`,
        content: `来源: ${source.name}\n链接: ${item.link}\n\n${item.description}`,
        tags: ['rss', source.name],
      })
    }

    return { fetched: items.length, written: items.length }
  }

  /** 简单 RSS XML 解析 */
  private parseRssItems(xml: string): RssItem[] {
    const items: RssItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]
      const title = this.extractTag(itemXml, 'title') || '无标题'
      const description = this.extractTag(itemXml, 'description') || ''
      const link = this.extractTag(itemXml, 'link') || ''
      items.push({ title, description, link })
    }

    return items
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
    )
    const match = xml.match(regex)
    return match ? (match[1] || match[2] || '').trim() : null
  }

  // CRUD 方法
  listSources(): SyncSource[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_sources ORDER BY created_at DESC')
      .all() as SyncSourceRow[]
    return rows.map(this.rowToSource)
  }

  addSource(dto: CreateSyncSourceDto): SyncSource {
    const id = randomUUID()
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO sync_sources (id, type, name, endpoint, token, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, dto.type, dto.name, dto.endpoint, dto.token || '', dto.enabled !== false ? 1 : 0, now, now)
    return this.getSource(id)!
  }

  getSource(id: string): SyncSource | null {
    const row = this.db.prepare('SELECT * FROM sync_sources WHERE id = ?').get(id) as
      | SyncSourceRow
      | undefined
    return row ? this.rowToSource(row) : null
  }

  updateSource(id: string, dto: UpdateSyncSourceDto): SyncSource {
    const now = Date.now()
    const fields: string[] = []
    const values: unknown[] = []

    if (dto.name !== undefined) {
      fields.push('name = ?')
      values.push(dto.name)
    }
    if (dto.endpoint !== undefined) {
      fields.push('endpoint = ?')
      values.push(dto.endpoint)
    }
    if (dto.token !== undefined) {
      fields.push('token = ?')
      values.push(dto.token)
    }
    if (dto.enabled !== undefined) {
      fields.push('enabled = ?')
      values.push(dto.enabled ? 1 : 0)
    }

    fields.push('updated_at = ?')
    values.push(now)
    values.push(id)

    this.db.prepare(`UPDATE sync_sources SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.getSource(id)!
  }

  removeSource(id: string): void {
    this.db.prepare('DELETE FROM sync_sources WHERE id = ?').run(id)
  }

  private updateSyncStatus(id: string, ok: boolean, message: string): void {
    this.db
      .prepare('UPDATE sync_sources SET last_synced_at = ?, last_sync_result = ? WHERE id = ?')
      .run(Date.now(), `${ok ? '✓' : '✗'} ${message}`, id)
  }

  private rowToSource = (row: SyncSourceRow): SyncSource => {
    return {
      id: row.id,
      type: row.type as SyncSource['type'],
      name: row.name,
      endpoint: row.endpoint,
      token: row.token,
      enabled: row.enabled === 1,
      last_synced_at: row.last_synced_at,
      last_sync_result: row.last_sync_result,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }
}
