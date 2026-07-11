import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  MemoryNode,
  CreateMemoryNodeDto,
  UpdateMemoryNodeDto,
  RecallQuery,
  RecallResultItem,
  MemoryPartition,
} from '../../shared/types/memory'

interface MemoryNodeRow {
  id: string
  parent_id: string | null
  partition: string
  title: string
  content: string
  tags: string
  created_at: number
  updated_at: number
}

function rowToNode(row: MemoryNodeRow): MemoryNode {
  return {
    id: row.id,
    parent_id: row.parent_id,
    partition: row.partition as MemoryPartition,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags || '[]') as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * 记忆检索服务
 * 提供 memory_nodes 表的 CRUD 与关键词检索(带时间衰减评分)
 */
export class MemoryRecallService {
  constructor(private db: Database.Database) {}

  createNode(dto: CreateMemoryNodeDto): MemoryNode {
    const id = randomUUID()
    const now = Date.now()
    const tags = JSON.stringify(dto.tags ?? [])
    this.db
      .prepare(
        `INSERT INTO memory_nodes (id, parent_id, partition, title, content, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, dto.parent_id ?? null, dto.partition, dto.title, dto.content, tags, now, now)
    return this.getNode(id)!
  }

  queryNodes(query: RecallQuery): RecallResultItem[] {
    const keyword = `%${query.keyword}%`
    const sqlParts: string[] = [
      'SELECT * FROM memory_nodes WHERE (title LIKE ? OR content LIKE ?)',
    ]
    const params: unknown[] = [keyword, keyword]
    if (query.partition) {
      sqlParts.push('AND partition = ?')
      params.push(query.partition)
    }
    const rows = this.db
      .prepare(sqlParts.join(' '))
      .all(...params) as MemoryNodeRow[]

    const items: RecallResultItem[] = rows.map((row) => {
      const node = rowToNode(row)
      return { node, score: this.calculateScore(row, query.keyword) }
    })

    items.sort((a, b) => b.score - a.score)

    const limit = query.limit ?? 10
    return items.slice(0, limit)
  }

  updateNode(id: string, dto: UpdateMemoryNodeDto): MemoryNode {
    const existing = this.getNode(id)
    if (!existing) {
      throw new Error(`Memory node not found: ${id}`)
    }
    const now = Date.now()
    const title = dto.title ?? existing.title
    const content = dto.content ?? existing.content
    const partition = dto.partition ?? existing.partition
    const tags = dto.tags !== undefined ? JSON.stringify(dto.tags) : JSON.stringify(existing.tags)
    this.db
      .prepare(
        `UPDATE memory_nodes
         SET title = ?, content = ?, partition = ?, tags = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, content, partition, tags, now, id)
    return this.getNode(id)!
  }

  deleteNode(id: string): void {
    this.db.prepare('DELETE FROM memory_nodes WHERE id = ?').run(id)
  }

  listNodes(partition?: MemoryPartition): MemoryNode[] {
    if (partition) {
      const rows = this.db
        .prepare('SELECT * FROM memory_nodes WHERE partition = ? ORDER BY updated_at DESC')
        .all(partition) as MemoryNodeRow[]
      return rows.map(rowToNode)
    }
    const rows = this.db
      .prepare('SELECT * FROM memory_nodes ORDER BY updated_at DESC')
      .all() as MemoryNodeRow[]
    return rows.map(rowToNode)
  }

  getNode(id: string): MemoryNode | null {
    const row = this.db
      .prepare('SELECT * FROM memory_nodes WHERE id = ?')
      .get(id) as MemoryNodeRow | undefined
    return row ? rowToNode(row) : null
  }

  /** 返回记忆节点统计：总数与各分区数量 */
  getStats(): { total: number; byPartition: Record<string, number> } {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM memory_nodes').get() as {
      count: number
    }
    const partitions = this.db
      .prepare('SELECT partition, COUNT(*) as count FROM memory_nodes GROUP BY partition')
      .all() as Array<{ partition: string; count: number }>
    const byPartition: Record<string, number> = {}
    for (const p of partitions) {
      byPartition[p.partition] = p.count
    }
    return { total: total.count, byPartition }
  }

  /**
   * 计算相关度评分
   * score = 相关度(0-1) * 0.7 + 时间衰减(0-1) * 0.3
   * 相关度:title/content 命中关键词各占 0.5
   * 时间衰减:1 / (1 + daysSinceCreated / 30)
   */
  private calculateScore(row: MemoryNodeRow, keyword: string): number {
    const kw = keyword.toLowerCase()
    const titleHit = row.title.toLowerCase().includes(kw) ? 0.5 : 0
    const contentHit = row.content.toLowerCase().includes(kw) ? 0.5 : 0
    const relevance = titleHit + contentHit

    const daysSinceCreated = (Date.now() - row.created_at) / (1000 * 60 * 60 * 24)
    const timeDecay = 1 / (1 + daysSinceCreated / 30)

    return relevance * 0.7 + timeDecay * 0.3
  }
}
