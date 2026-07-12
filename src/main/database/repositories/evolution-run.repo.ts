import type Database from 'better-sqlite3'
import type { EvolutionRun } from '@shared/types/skill-evolution'

/** evolution_runs 表的行结构 (snake_case) */
interface EvolutionRunRow {
  id: string
  skill_id: string
  status: string
  iterations: number
  baseline_score: number | null
  best_score: number | null
  best_variant_id: string | null
  variant_count: number
  summary: string | null
  created_at: number
  completed_at: number | null
}

/** 将 DB 行 (snake_case) 转换为 EvolutionRun (camelCase) */
function rowToEvolutionRun(row: EvolutionRunRow): EvolutionRun {
  return {
    id: row.id,
    skillId: row.skill_id,
    status: row.status as EvolutionRun['status'],
    iterations: row.iterations,
    baselineScore: row.baseline_score,
    bestScore: row.best_score,
    bestVariantId: row.best_variant_id,
    variantCount: row.variant_count,
    summary: row.summary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

/**
 * 创建一条新的进化运行。
 * - status 默认为 'running'
 * - iterations / variant_count 默认为 0
 * @returns 新插入记录的 id
 */
export function insertRun(
  db: Database.Database,
  params: { skillId: string },
): string {
  const row = db
    .prepare(
      `INSERT INTO evolution_runs (skill_id, status, iterations, baseline_score, best_score, best_variant_id, variant_count, summary, created_at, completed_at)
       VALUES (?, 'running', 0, NULL, NULL, NULL, 0, NULL, ?, NULL)
       RETURNING id`,
    )
    .get(params.skillId, Date.now()) as { id: string }
  return row.id
}

/** 按 id 查询单条运行 (不存在时返回 null) */
export function getRun(db: Database.Database, id: string): EvolutionRun | null {
  const row = db
    .prepare('SELECT * FROM evolution_runs WHERE id = ?')
    .get(id) as EvolutionRunRow | undefined
  return row ? rowToEvolutionRun(row) : null
}

/**
 * 查询运行列表。
 * - 可选按 skillId 过滤
 * - 可选 limit 限制数量
 * - 默认按 created_at 倒序
 */
export function getRuns(
  db: Database.Database,
  skillId?: string,
  limit?: number,
): EvolutionRun[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (skillId) {
    conditions.push('skill_id = ?')
    params.push(skillId)
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  let sql = `SELECT * FROM evolution_runs ${whereClause} ORDER BY created_at DESC`
  if (limit) {
    sql += ' LIMIT ?'
    params.push(limit)
  }

  const rows = db.prepare(sql).all(...params) as EvolutionRunRow[]
  return rows.map(rowToEvolutionRun)
}

/** 更新运行状态 */
export function updateRunStatus(
  db: Database.Database,
  id: string,
  status: string,
): void {
  db.prepare('UPDATE evolution_runs SET status = ? WHERE id = ?').run(status, id)
}

/**
 * 更新运行结果字段 (部分更新,仅更新传入的字段)。
 */
export function updateRunResults(
  db: Database.Database,
  id: string,
  params: {
    baselineScore?: number | null
    bestScore?: number | null
    bestVariantId?: string | null
    variantCount?: number
    summary?: string | null
  },
): void {
  const sets: string[] = []
  const values: unknown[] = []

  if (params.baselineScore !== undefined) {
    sets.push('baseline_score = ?')
    values.push(params.baselineScore)
  }
  if (params.bestScore !== undefined) {
    sets.push('best_score = ?')
    values.push(params.bestScore)
  }
  if (params.bestVariantId !== undefined) {
    sets.push('best_variant_id = ?')
    values.push(params.bestVariantId)
  }
  if (params.variantCount !== undefined) {
    sets.push('variant_count = ?')
    values.push(params.variantCount)
  }
  if (params.summary !== undefined) {
    sets.push('summary = ?')
    values.push(params.summary)
  }

  if (sets.length === 0) return

  values.push(id)
  db.prepare(`UPDATE evolution_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

/**
 * 完成一次运行:
 * - status 置为 'completed'
 * - completed_at 置为当前时间
 * - summary 写入
 */
export function completeRun(db: Database.Database, id: string, summary: string): void {
  db.prepare(
    'UPDATE evolution_runs SET status = ?, completed_at = ?, summary = ? WHERE id = ?',
  ).run('completed', Date.now(), summary, id)
}
