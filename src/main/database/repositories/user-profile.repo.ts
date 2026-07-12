import type Database from 'better-sqlite3'
import type { UserProfileEntry, ProfileDimension } from '@shared/types/user-profile'

/** user_profile 表的行结构(snake_case) */
interface UserProfileRow {
  id: string
  dimension: string
  value: string
  confidence: number
  source: string
  updated_at: number
  created_at: number
}

/** 将 DB 行(snake_case)转换为 UserProfileEntry(camelCase) */
function rowToEntry(row: UserProfileRow): UserProfileEntry {
  return {
    id: row.id,
    dimension: row.dimension as ProfileDimension,
    value: row.value,
    confidence: row.confidence,
    source: row.source as 'auto' | 'manual',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}

/** 返回全部画像条目 */
export function getProfile(db: Database.Database): UserProfileEntry[] {
  const rows = db
    .prepare('SELECT * FROM user_profile ORDER BY dimension')
    .all() as UserProfileRow[]
  return rows.map(rowToEntry)
}

/** 返回指定维度的单条记录,不存在时返回 null */
export function getDimension(
  db: Database.Database,
  dimension: ProfileDimension,
): UserProfileEntry | null {
  const row = db
    .prepare('SELECT * FROM user_profile WHERE dimension = ?')
    .get(dimension) as UserProfileRow | undefined
  return row ? rowToEntry(row) : null
}

/**
 * 插入或更新指定维度(唯一索引在 dimension 上)
 * - 新维度:执行 INSERT
 * - 已存在维度:更新 value/confidence/source/updated_at,保留 created_at 与 id
 */
export function upsertDimension(
  db: Database.Database,
  params: {
    dimension: ProfileDimension
    value: string
    confidence?: number
    source?: 'auto' | 'manual'
  },
): void {
  const confidence = params.confidence ?? 0.5
  const source = params.source ?? 'auto'
  const now = Date.now()

  // 利用唯一索引:先尝试更新,未命中则插入(check-then-insert,保留 created_at)
  const existing = db
    .prepare('SELECT id, created_at FROM user_profile WHERE dimension = ?')
    .get(params.dimension) as { id: string; created_at: number } | undefined

  if (existing) {
    db.prepare(
      `UPDATE user_profile
       SET value = ?, confidence = ?, source = ?, updated_at = ?
       WHERE id = ?`,
    ).run(params.value, confidence, source, now, existing.id)
  } else {
    db.prepare(
      `INSERT INTO user_profile (dimension, value, confidence, source, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(params.dimension, params.value, confidence, source, now, now)
  }
}

/** 返回所有条目(与 getProfile 等价) */
export function getAllDimensions(db: Database.Database): UserProfileEntry[] {
  return getProfile(db)
}

/** 删除全部画像条目 */
export function clearProfile(db: Database.Database): void {
  db.prepare('DELETE FROM user_profile').run()
}

/** 删除指定维度单条记录 */
export function clearDimension(
  db: Database.Database,
  dimension: ProfileDimension,
): void {
  db.prepare('DELETE FROM user_profile WHERE dimension = ?').run(dimension)
}
