import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { runMigrations } from './migrate'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'zx-code.db')
  db = new Database(dbPath)
  
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  runMigrations(db)
  
  return db
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
