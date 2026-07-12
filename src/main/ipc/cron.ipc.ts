import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDb } from '../database'
import { getCronAgentService } from '../tools'
import type { CronAgentService } from '../services/cron-agent.service'
import * as cronJobRepo from '../database/repositories/cron-job.repo'
import type { CreateCronJobDto } from '@shared/types/cron-agent'

/**
 * Cron Agent 任务 IPC handler
 *
 * 注册通道：
 * - cron:create  — 创建新的 cron 任务
 * - cron:list    — 列出所有任务
 * - cron:delete  — 删除指定任务
 * - cron:toggle  — 切换任务启用状态
 * - cron:history — 查询所有任务（与 list 等价，返回 DB 行）
 *
 * @param service 可选注入的 CronAgentService，用于测试；默认从全局单例获取
 * @param db      可选注入，用于测试；默认使用全局 getDb()
 */
export function registerCronIpc(
  service?: CronAgentService,
  db?: Database.Database,
): void {
  const database = db ?? getDb()
  const svc = service ?? getCronAgentService()

  // --- 创建 cron 任务 ---
  ipcMain.handle('cron:create', (_event, params: CreateCronJobDto) => {
    if (!svc) throw new Error('CronAgentService 未初始化')
    return svc.createJob(params)
  })

  // --- 列出所有任务 ---
  ipcMain.handle('cron:list', () => {
    if (!svc) throw new Error('CronAgentService 未初始化')
    return svc.listJobs()
  })

  // --- 删除任务 ---
  ipcMain.handle('cron:delete', (_event, id: string) => {
    if (!svc) throw new Error('CronAgentService 未初始化')
    svc.deleteJob(id)
  })

  // --- 切换任务启用状态 ---
  ipcMain.handle('cron:toggle', (_event, id: string) => {
    if (!svc) throw new Error('CronAgentService 未初始化')
    svc.toggleJob(id)
  })

  // --- 查询任务历史（直接读取 DB） ---
  ipcMain.handle('cron:history', () => {
    return cronJobRepo.getJobs(database)
  })
}
