import { ipcMain } from 'electron'
import { logger } from '../services/logger.service'
import * as marketplaceService from '../services/marketplace.service'
import type {
  MarketRegistry,
  MarketListing,
  MarketSearchFilters,
} from '@shared/types/marketplace'

/**
 * 社区市场（Marketplace）IPC handler
 *
 * 聚合真实社区注册表：
 *  - MCP 官方 registry（https://registry.modelcontextprotocol.io）
 *  - Smithery（https://registry.smithery.ai）
 *  - 技能 / 插件目录（任意 RemoteCatalogResponse / 通用 JSON）
 */
export function registerMarketplaceIpc(): void {
  // marketplace:listRegistries — 列出所有内置注册表
  ipcMain.handle('marketplace:listRegistries', async () => {
    return marketplaceService.listRegistries()
  })

  // marketplace:fetchAll — 并发拉取所有注册表（单个失败不影响其它）
  ipcMain.handle('marketplace:fetchAll', async () => {
    try {
      return await marketplaceService.fetchAllListings()
    } catch (err) {
      logger.error(`marketplace:fetchAll 失败: ${(err as Error).message}`, err as Error)
      throw err
    }
  })

  // marketplace:fetchOne — 拉取单个注册表
  ipcMain.handle(
    'marketplace:fetchOne',
    async (_event, registry: MarketRegistry) => {
      try {
        return await marketplaceService.fetchListings(registry)
      } catch (err) {
        logger.error(`marketplace:fetchOne 失败: ${(err as Error).message}`, err as Error)
        throw err
      }
    },
  )

  // marketplace:search — 在已拉取条目上做本地过滤
  ipcMain.handle(
    'marketplace:search',
    async (_event, listings: MarketListing[], filters: MarketSearchFilters) => {
      return marketplaceService.searchListings(listings, filters)
    },
  )

  // marketplace:install — 安装一个市场条目
  ipcMain.handle('marketplace:install', async (_event, listing: MarketListing) => {
    try {
      return await marketplaceService.installListing(listing)
    } catch (err) {
      logger.error(`marketplace:install 失败: ${(err as Error).message}`, err as Error)
      return { ok: false, message: `安装失败：${(err as Error).message}` }
    }
  })

  logger.info('Marketplace IPC handler 已注册')
}
