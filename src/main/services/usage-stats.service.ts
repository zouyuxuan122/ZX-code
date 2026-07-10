import { getDb } from '../database'
import type { DailyUsageStat, UsageRecord } from '@shared/types/usage'

/** 初始化统计表 */
export function initUsageStatsTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      conversation_id TEXT,
      model TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_stats(date);
  `)
}

function toDateStr(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function recordUsage(rec: UsageRecord): void {
  const db = getDb()
  const date = toDateStr(rec.timestamp)
  db.prepare(
    `INSERT INTO usage_stats (date, conversation_id, model, prompt_tokens, completion_tokens, total_tokens, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(date, rec.conversationId, rec.model, rec.promptTokens, rec.completionTokens, rec.totalTokens, rec.timestamp)
}

export function getDailyStats(days: number): DailyUsageStat[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT date,
       SUM(total_tokens) as tokens,
       COUNT(*) as calls,
       SUM(prompt_tokens) as promptTokens,
       SUM(completion_tokens) as completionTokens
     FROM usage_stats
     WHERE date >= date('now', ?)
     GROUP BY date
     ORDER BY date ASC`,
  ).all(`-${days} days`) as Array<{ date: string; tokens: number; calls: number; promptTokens: number; completionTokens: number }>
  return rows.map((r) => ({
    date: r.date,
    tokens: r.tokens ?? 0,
    calls: r.calls ?? 0,
    promptTokens: r.promptTokens ?? 0,
    completionTokens: r.completionTokens ?? 0,
  }))
}

export function getTodaySummary(): DailyUsageStat | null {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const row = db.prepare(
    `SELECT date,
       SUM(total_tokens) as tokens,
       COUNT(*) as calls,
       SUM(prompt_tokens) as promptTokens,
       SUM(completion_tokens) as completionTokens
     FROM usage_stats WHERE date = ?`,
  ).get(today) as { date: string; tokens: number; calls: number; promptTokens: number; completionTokens: number } | undefined
  if (!row || !row.calls) return null
  return {
    date: row.date,
    tokens: row.tokens ?? 0,
    calls: row.calls ?? 0,
    promptTokens: row.promptTokens ?? 0,
    completionTokens: row.completionTokens ?? 0,
  }
}
