import { ipcMain } from 'electron'
import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from '../services/logger.service'
import { safeFormatSetting } from '../utils/redact.util'
import type { SettingCategory } from '@shared/types/settings'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', (_event, key: string) => {
    return settingsRepo.get(key)
  })

  ipcMain.handle('settings:getAll', (_event, category?: SettingCategory) => {
    return settingsRepo.getAll(category)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown, category: SettingCategory) => {
    // 脱敏：敏感 key（api_key/token/secret/password 等）的值不写入日志
    logger.debug(safeFormatSetting(key, value))
    settingsRepo.set(key, value, category)
  })

  ipcMain.handle('settings:delete', (_event, key: string) => {
    settingsRepo.remove(key)
  })
}
