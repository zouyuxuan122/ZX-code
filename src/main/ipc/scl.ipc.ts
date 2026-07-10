import { ipcMain } from 'electron'
import { logger } from '../services/logger.service'
import * as sclService from '../services/scl.service'
import type { SclExtension, RemoteCatalogEntry } from '@shared/types/scl'

/**
 * SCL (Skill Code Library) 技能扩展相关 IPC handler
 */
export function registerSclIpc(): void {
  // 初始化内置技能
  sclService.initBuiltinSkills()

  // scl:list — 列出所有已安装技能
  ipcMain.handle('scl:list', async (): Promise<SclExtension[]> => {
    try {
      return sclService.listSclExtensions()
    } catch (err) {
      logger.error(`scl:list 失败: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  // scl:install — 安装一个技能
  ipcMain.handle(
    'scl:install',
    async (
      _event,
      config: Omit<SclExtension, 'id' | 'created_at' | 'updated_at'>,
    ): Promise<SclExtension> => {
      try {
        return sclService.installSclExtension(config)
      } catch (err) {
        logger.error(`scl:install 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // scl:uninstall — 卸载一个技能
  ipcMain.handle('scl:uninstall', async (_event, id: string): Promise<void> => {
    try {
      sclService.uninstallSclExtension(id)
    } catch (err) {
      logger.error(`scl:uninstall 失败: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  // scl:update — 更新技能配置
  ipcMain.handle(
    'scl:update',
    async (
      _event,
      id: string,
      config: Partial<SclExtension>,
    ): Promise<SclExtension> => {
      try {
        return sclService.updateSclExtension(id, config)
      } catch (err) {
        logger.error(`scl:update 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // scl:toggle — 启用 / 禁用技能
  ipcMain.handle(
    'scl:toggle',
    async (_event, id: string, enabled: boolean): Promise<SclExtension> => {
      try {
        return sclService.toggleSclExtension(id, enabled)
      } catch (err) {
        logger.error(`scl:toggle 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // scl:getEnabledSkills — 获取所有已启用技能的内容（用于注入系统提示词）
  ipcMain.handle('scl:getEnabledSkills', async (): Promise<string> => {
    return sclService.getEnabledSkillsContent()
  })

  // scl:fetchRemoteCatalog — 从远程 URL 拉取技能目录
  ipcMain.handle(
    'scl:fetchRemoteCatalog',
    async (_event, url: string) => {
      try {
        return await sclService.fetchRemoteCatalog(url)
      } catch (err) {
        logger.error(`scl:fetchRemoteCatalog 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // scl:installFromRemote — 批量安装远程目录中的技能
  ipcMain.handle(
    'scl:installFromRemote',
    async (
      _event,
      url: string,
      entries: RemoteCatalogEntry[],
    ): Promise<SclExtension[]> => {
      try {
        return sclService.installFromRemote(url, entries)
      } catch (err) {
        logger.error(`scl:installFromRemote 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // scl:getDefaultCatalogs — 获取默认远程目录列表
  ipcMain.handle('scl:getDefaultCatalogs', async (): Promise<string[]> => {
    return sclService.getDefaultRemoteCatalogs()
  })

  logger.info('SCL IPC handler 已注册')
}
