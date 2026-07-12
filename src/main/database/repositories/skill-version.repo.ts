import type Database from 'better-sqlite3'
import type { SkillVersion, ScoreBreakdown } from '@shared/types/skill-evolution'

/** skill_versions 表的行结构 (snake_case) */
interface SkillVersionRow {
  id: string
  skill_id: string
  version: number
  content: string
  score: number | null
  score_breakdown: string | null
  created_reason: string | null
  is_current: number
  created_at: number
}

/** 将 DB 行 (snake_case) 转换为 SkillVersion (camelCase) */
function rowToSkillVersion(row: SkillVersionRow): SkillVersion {
  return {
    id: row.id,
    skillId: row.skill_id,
    version: row.version,
    content: row.content,
    score: row.score,
    scoreBreakdown: row.score_breakdown
      ? (JSON.parse(row.score_breakdown) as ScoreBreakdown)
      : null,
    createdReason: row.created_reason,
    isCurrent: row.is_current === 1,
    createdAt: row.created_at,
  }
}

/**
 * 插入一条技能版本。
 * - version 自动递增:查询当前 skill 的 MAX(version) + 1,首条为 1
 * - score_breakdown 以 JSON 字符串形式存储
 * - is_current 默认为 0
 * @returns 新插入记录的 id
 */
export function insertVersion(
  db: Database.Database,
  params: {
    skillId: string
    content: string
    score?: number | null
    scoreBreakdown?: ScoreBreakdown | null
    createdReason?: string | null
  },
): string {
  const maxRow = db
    .prepare('SELECT MAX(version) AS max_version FROM skill_versions WHERE skill_id = ?')
    .get(params.skillId) as { max_version: number | null } | undefined
  const nextVersion = (maxRow?.max_version ?? 0) + 1

  const row = db
    .prepare(
      `INSERT INTO skill_versions (skill_id, version, content, score, score_breakdown, created_reason, is_current, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       RETURNING id`,
    )
    .get(
      params.skillId,
      nextVersion,
      params.content,
      params.score ?? null,
      params.scoreBreakdown ? JSON.stringify(params.scoreBreakdown) : null,
      params.createdReason ?? null,
      Date.now(),
    ) as { id: string }
  return row.id
}

/** 返回指定 skill 的全部版本 (按 version 倒序) */
export function getVersions(db: Database.Database, skillId: string): SkillVersion[] {
  const rows = db
    .prepare('SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC')
    .all(skillId) as SkillVersionRow[]
  return rows.map(rowToSkillVersion)
}

/** 返回 version 值最大的版本 (无版本时返回 null) */
export function getLatestVersion(
  db: Database.Database,
  skillId: string,
): SkillVersion | null {
  const row = db
    .prepare('SELECT * FROM skill_versions WHERE skill_id = ? ORDER BY version DESC LIMIT 1')
    .get(skillId) as SkillVersionRow | undefined
  return row ? rowToSkillVersion(row) : null
}

/** 返回 is_current=1 的版本 (无则返回 null) */
export function getCurrentVersion(
  db: Database.Database,
  skillId: string,
): SkillVersion | null {
  const row = db
    .prepare('SELECT * FROM skill_versions WHERE skill_id = ? AND is_current = 1 LIMIT 1')
    .get(skillId) as SkillVersionRow | undefined
  return row ? rowToSkillVersion(row) : null
}

/**
 * 将指定版本设为当前版本 (is_current=1),
 * 同时将同 skill 下其他版本的 is_current 置为 0。
 */
export function setCurrentVersion(db: Database.Database, versionId: string): void {
  const transaction = db.transaction(() => {
    const row = db
      .prepare('SELECT skill_id FROM skill_versions WHERE id = ?')
      .get(versionId) as { skill_id: string } | undefined
    if (!row) return
    db.prepare('UPDATE skill_versions SET is_current = 0 WHERE skill_id = ?').run(row.skill_id)
    db.prepare('UPDATE skill_versions SET is_current = 1 WHERE id = ?').run(versionId)
  })
  transaction()
}

/**
 * 回滚到指定版本:将其设为 current 并返回该版本。
 * versionId 不存在时返回 null。
 */
export function rollbackVersion(
  db: Database.Database,
  skillId: string,
  versionId: string,
): SkillVersion | null {
  const row = db
    .prepare('SELECT * FROM skill_versions WHERE id = ? AND skill_id = ?')
    .get(versionId, skillId) as SkillVersionRow | undefined
  if (!row) return null

  const transaction = db.transaction(() => {
    db.prepare('UPDATE skill_versions SET is_current = 0 WHERE skill_id = ?').run(skillId)
    db.prepare('UPDATE skill_versions SET is_current = 1 WHERE id = ?').run(versionId)
  })
  transaction()

  // 重新读取以获取最新 is_current 状态
  const updated = db
    .prepare('SELECT * FROM skill_versions WHERE id = ?')
    .get(versionId) as SkillVersionRow | undefined
  return updated ? rowToSkillVersion(updated) : null
}
