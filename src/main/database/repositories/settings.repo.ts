import { getDb } from '../index'
import type { Setting, SettingCategory } from '@shared/types/settings'

export function get(key: string): unknown | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as Setting | undefined
  return row ? JSON.parse(row.value) : null
}

export function getAll(category?: SettingCategory): Setting[] {
  const db = getDb()
  if (category) {
    return db.prepare('SELECT * FROM settings WHERE category = ? ORDER BY key').all(category) as Setting[]
  }
  return db.prepare('SELECT * FROM settings ORDER BY category, key').all() as Setting[]
}

export function set(key: string, value: unknown, category: SettingCategory): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), category, Date.now())
}

export function remove(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}
