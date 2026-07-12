import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDb } from '../database'
import * as userProfileRepo from '../database/repositories/user-profile.repo'
import type { ProfileDimension } from '@shared/types/user-profile'

/**
 * 用户画像 IPC handler
 *
 * 注册通道：
 * - profile:get    — 返回全部画像条目
 * - profile:update — 插入或更新指定维度
 * - profile:clear  — 清空全部画像
 *
 * @param db 可选注入，用于测试；默认使用全局 getDb()
 */
export function registerProfileIpc(db?: Database.Database): void {
  const database = db ?? getDb()

  // --- 查询全部画像 ---
  ipcMain.handle('profile:get', () => {
    return userProfileRepo.getProfile(database)
  })

  // --- 插入或更新指定维度 ---
  ipcMain.handle(
    'profile:update',
    (_event, params: {
      dimension: ProfileDimension
      value: string
      confidence?: number
      source?: 'auto' | 'manual'
    }) => {
      userProfileRepo.upsertDimension(database, params)
    },
  )

  // --- 清空画像 ---
  ipcMain.handle('profile:clear', () => {
    userProfileRepo.clearProfile(database)
  })
}
