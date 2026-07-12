import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DBType } from 'better-sqlite3'
import { runMigrations } from '../migrate'
import * as cronJobRepo from '../repositories/cron-job.repo'
import type { AgentCronJob } from '@shared/types/cron-agent'

let db: DBType

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
})

/** 构造一个最小可用的插入参数对象 */
function buildInsertParams(overrides: Partial<{
  name: string
  description: string
  cronExpression: string
  projectId: string | null
  allowWriteTools: boolean
}> = {}) {
  return {
    name: overrides.name ?? '测试任务',
    description: overrides.description ?? '这是一个测试定时任务',
    cronExpression: overrides.cronExpression ?? '0 9 * * *',
    projectId: overrides.projectId ?? null,
    allowWriteTools: overrides.allowWriteTools ?? false,
  }
}

describe('cron-job.repo', () => {
  describe('insertJob', () => {
    it('插入任务并返回 AgentCronJob,默认 enabled=1', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(typeof job.id).toBe('string')
      expect(job.name).toBe('测试任务')
      expect(job.cronExpression).toBe('0 9 * * *')
      expect(job.enabled).toBe(true)
      expect(job.allowWriteTools).toBe(false)
      expect(job.runCount).toBe(0)
      expect(job.lastRunAt).toBeNull()
      expect(job.lastRunResult).toBeNull()
      expect(job.lastRunStatus).toBeNull()
      expect(job.createdAt).toBeGreaterThan(0)
      expect(job.updatedAt).toBeGreaterThan(0)
    })

    it('allowWriteTools=true 时写入 allow_write_tools=1', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams({ allowWriteTools: true }))
      expect(job.allowWriteTools).toBe(true)
    })

    it('带 projectId 时写入 project_id', () => {
      // 先创建一个 project 以满足 FK 约束
      const proj = db.prepare(
        "INSERT INTO projects (name, workspace_path) VALUES (?, ?) RETURNING *",
      ).get('测试项目', '/tmp/test') as { id: string }
      const job = cronJobRepo.insertJob(db, buildInsertParams({ projectId: proj.id }))
      expect(job.projectId).toBe(proj.id)
    })

    it('projectId 为 null 时 project_id 列为 NULL', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams({ projectId: null }))
      expect(job.projectId).toBeNull()
    })
  })

  describe('getJob', () => {
    it('根据 id 返回单个任务', () => {
      const inserted = cronJobRepo.insertJob(db, buildInsertParams())
      const found = cronJobRepo.getJob(db, inserted.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(inserted.id)
      expect(found!.name).toBe('测试任务')
    })

    it('id 不存在时返回 null', () => {
      const found = cronJobRepo.getJob(db, 'non-existent-id')
      expect(found).toBeNull()
    })
  })

  describe('getJobs', () => {
    it('返回所有任务(按创建时间倒序)', () => {
      cronJobRepo.insertJob(db, buildInsertParams({ name: '任务1' }))
      cronJobRepo.insertJob(db, buildInsertParams({ name: '任务2' }))
      const jobs = cronJobRepo.getJobs(db)
      expect(jobs).toHaveLength(2)
      // 倒序：后插入的在前
      expect(jobs[0].name).toBe('任务2')
      expect(jobs[1].name).toBe('任务1')
    })

    it('无任务时返回空数组', () => {
      const jobs = cronJobRepo.getJobs(db)
      expect(jobs).toEqual([])
    })
  })

  describe('getEnabledJobs', () => {
    it('只返回 enabled=1 的任务', () => {
      const j1 = cronJobRepo.insertJob(db, buildInsertParams({ name: '任务1' }))
      cronJobRepo.insertJob(db, buildInsertParams({ name: '任务2' }))
      // 禁用第一个
      cronJobRepo.updateJobStatus(db, j1.id, false)
      const enabled = cronJobRepo.getEnabledJobs(db)
      expect(enabled).toHaveLength(1)
      expect(enabled[0].name).toBe('任务2')
      expect(enabled[0].enabled).toBe(true)
    })
  })

  describe('updateJobStatus', () => {
    it('切换 enabled 状态为 false', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      expect(job.enabled).toBe(true)
      cronJobRepo.updateJobStatus(db, job.id, false)
      const updated = cronJobRepo.getJob(db, job.id)
      expect(updated!.enabled).toBe(false)
    })

    it('切换 enabled 状态为 true 并更新 updated_at', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      cronJobRepo.updateJobStatus(db, job.id, false)
      const before = cronJobRepo.getJob(db, job.id)
      // 稍等确保 updated_at 变化
      cronJobRepo.updateJobStatus(db, job.id, true)
      const after = cronJobRepo.getJob(db, job.id)
      expect(after!.enabled).toBe(true)
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt)
    })
  })

  describe('updateLastRun', () => {
    it('更新 last_run_at / last_run_result / last_run_status 并自增 run_count', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      expect(job.runCount).toBe(0)
      const before = Date.now()
      cronJobRepo.updateLastRun(db, job.id, {
        result: '执行成功，共修改 3 个文件',
        status: 'success',
      })
      const updated = cronJobRepo.getJob(db, job.id)
      expect(updated!.lastRunAt).toBeGreaterThanOrEqual(before)
      expect(updated!.lastRunResult).toBe('执行成功，共修改 3 个文件')
      expect(updated!.lastRunStatus).toBe('success')
      expect(updated!.runCount).toBe(1)
    })

    it('多次执行后 run_count 累加', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      cronJobRepo.updateLastRun(db, job.id, { result: 'ok', status: 'success' })
      cronJobRepo.updateLastRun(db, job.id, { result: '失败', status: 'failed' })
      const updated = cronJobRepo.getJob(db, job.id)
      expect(updated!.runCount).toBe(2)
      expect(updated!.lastRunStatus).toBe('failed')
    })

    it('支持 timeout 状态', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      cronJobRepo.updateLastRun(db, job.id, { result: '超时', status: 'timeout' })
      const updated = cronJobRepo.getJob(db, job.id)
      expect(updated!.lastRunStatus).toBe('timeout')
    })
  })

  describe('deleteJob', () => {
    it('根据 id 删除任务', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams())
      cronJobRepo.deleteJob(db, job.id)
      const found = cronJobRepo.getJob(db, job.id)
      expect(found).toBeNull()
    })

    it('删除不存在的 id 不抛错', () => {
      expect(() => cronJobRepo.deleteJob(db, 'non-existent-id')).not.toThrow()
    })
  })

  describe('rowToJob 类型映射', () => {
    it('DB 行的 snake_case 正确映射为 AgentCronJob 的 camelCase', () => {
      const job = cronJobRepo.insertJob(db, buildInsertParams({
        name: '映射测试',
        description: '描述',
        cronExpression: '*/5 * * * *',
        allowWriteTools: true,
      }))
      const found = cronJobRepo.getJob(db, job.id) as AgentCronJob
      expect(found.name).toBe('映射测试')
      expect(found.description).toBe('描述')
      expect(found.cronExpression).toBe('*/5 * * * *')
      expect(found.allowWriteTools).toBe(true)
      expect(found.enabled).toBe(true)
      expect(found.projectId).toBeNull()
      expect(found.lastRunAt).toBeNull()
      expect(found.lastRunResult).toBeNull()
      expect(found.lastRunStatus).toBeNull()
      expect(found.runCount).toBe(0)
      expect(typeof found.createdAt).toBe('number')
      expect(typeof found.updatedAt).toBe('number')
    })
  })
})
