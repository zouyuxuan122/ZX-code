import type Database from 'better-sqlite3'
import type { AgentCronJob, CreateCronJobDto, CronJobResult } from '@shared/types/cron-agent'

type DB = Database.Database

/** agent_cron_jobs 表的行结构(snake_case) */
interface CronJobRow {
  id: string
  name: string
  description: string
  cron_expression: string
  project_id: string | null
  enabled: number
  allow_write_tools: number
  last_run_at: number | null
  last_run_result: string | null
  last_run_status: string | null
  run_count: number
  created_at: number
  updated_at: number
}

/** 将 DB 行(snake_case)转换为 AgentCronJob(camelCase) */
function rowToJob(row: CronJobRow): AgentCronJob {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cronExpression: row.cron_expression,
    projectId: row.project_id,
    enabled: row.enabled === 1,
    allowWriteTools: row.allow_write_tools === 1,
    lastRunAt: row.last_run_at,
    lastRunResult: row.last_run_result,
    lastRunStatus: row.last_run_status as AgentCronJob['lastRunStatus'],
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 插入参数 */
export interface InsertJobParams {
  name: string
  description: string
  cronExpression: string
  projectId?: string | null
  allowWriteTools?: boolean
}

/** 插入一条 cron 任务，默认 enabled=1 */
export function insertJob(db: DB, params: InsertJobParams): AgentCronJob {
  const now = Date.now()
  const row = db.prepare(
    `INSERT INTO agent_cron_jobs (name, description, cron_expression, project_id, enabled, allow_write_tools, run_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?)
     RETURNING *`,
  ).get(
    params.name,
    params.description,
    params.cronExpression,
    params.projectId ?? null,
    params.allowWriteTools ? 1 : 0,
    now,
    now,
  ) as CronJobRow
  return rowToJob(row)
}

/** 根据 id 查询单条任务 */
export function getJob(db: DB, id: string): AgentCronJob | null {
  const row = db.prepare('SELECT * FROM agent_cron_jobs WHERE id = ?').get(id) as
    | CronJobRow
    | undefined
  return row ? rowToJob(row) : null
}

/** 查询所有任务(按插入顺序倒序，使用 rowid 保证同毫秒插入也有稳定顺序) */
export function getJobs(db: DB): AgentCronJob[] {
  const rows = db.prepare('SELECT * FROM agent_cron_jobs ORDER BY created_at DESC, rowid DESC').all() as CronJobRow[]
  return rows.map(rowToJob)
}

/** 查询所有 enabled=1 的任务 */
export function getEnabledJobs(db: DB): AgentCronJob[] {
  const rows = db.prepare('SELECT * FROM agent_cron_jobs WHERE enabled = 1 ORDER BY created_at DESC, rowid DESC').all() as CronJobRow[]
  return rows.map(rowToJob)
}

/** 更新 enabled 状态 */
export function updateJobStatus(db: DB, id: string, enabled: boolean): void {
  db.prepare('UPDATE agent_cron_jobs SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    Date.now(),
    id,
  )
}

/** 更新最后执行信息并自增 run_count */
export function updateLastRun(
  db: DB,
  id: string,
  data: { result: string; status: CronJobResult['status'] },
): void {
  db.prepare(
    `UPDATE agent_cron_jobs
     SET last_run_at = ?, last_run_result = ?, last_run_status = ?, run_count = run_count + 1, updated_at = ?
     WHERE id = ?`,
  ).run(Date.now(), data.result, data.status, Date.now(), id)
}

/** 根据 id 删除任务 */
export function deleteJob(db: DB, id: string): void {
  db.prepare('DELETE FROM agent_cron_jobs WHERE id = ?').run(id)
}

/** 从 CreateCronJobDto 构造 InsertJobParams */
export function dtoToInsertParams(dto: CreateCronJobDto): InsertJobParams {
  return {
    name: dto.name,
    description: dto.description,
    cronExpression: dto.cronExpression,
    projectId: dto.projectId ?? null,
    allowWriteTools: dto.allowWriteTools ?? false,
  }
}
