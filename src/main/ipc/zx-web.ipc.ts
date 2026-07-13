import { ipcMain, BrowserWindow } from 'electron'
import { storeManager, oauthManager, proxyServer } from '../zx-web'
import { isZxWebRunning, getZxWebBaseUrl } from '../zx-web'
import { clearProviderCache } from '../providers'
import * as providerRepo from '../database/repositories/provider.repo'
import { logger } from '../services/logger.service'

/**
 * 注册 ZxWeb 相关 IPC 通道。
 */
export function registerZxWebIpc(mainWindow: BrowserWindow): void {
  // ===== 账户管理 =====

  ipcMain.handle('zx-web:accounts:list', (_e, providerId?: string) => {
    return providerId
      ? storeManager.getAccountsByProviderId(providerId)
      : storeManager.getAccounts()
  })

  ipcMain.handle('zx-web:accounts:delete', (_e, accountId: string) => {
    return storeManager.deleteAccount(accountId)
  })

  ipcMain.handle('zx-web:accounts:update', (_e, accountId: string, updates: any) => {
    return storeManager.updateAccount(accountId, updates)
  })

  // ===== Provider（ZxWeb 内置供应商）管理 =====

  ipcMain.handle('zx-web:providers:list', () => {
    return storeManager.getProviders()
  })

  ipcMain.handle('zx-web:providers:update', (_e, providerId: string, updates: any) => {
    return storeManager.updateProvider(providerId, updates)
  })

  // ===== OAuth 登录 =====

  ipcMain.handle('zx-web:oauth:startLogin', async (_e, options: any) => {
    try {
      const result = await oauthManager.startLogin(options)

      // 修复：登录成功后保存账户到 storeManager
      if (result.success && result.credentials) {
        const now = Date.now()
        const account = {
          id: storeManager.generateId(),
          providerId: options.providerId,
          name: result.accountInfo?.name || options.providerType,
          email: result.accountInfo?.email,
          credentials: result.credentials,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
          requestCount: 0,
          todayUsed: 0,
        }
        storeManager.addAccount(account)
        logger.info(`[zx-web:oauth] 外部浏览器登录成功，已保存账户: ${account.providerId}/${account.id}`)

        return {
          ...result,
          account: {
            id: account.id,
            providerId: account.providerId,
            name: account.name,
            status: account.status,
            todayUsed: account.todayUsed,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          },
        }
      }

      return result
    } catch (err) {
      logger.error('[zx-web:oauth] 登录失败', err as Error)
      return {
        success: false,
        providerId: options.providerId,
        providerType: options.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('zx-web:oauth:loginWithToken', async (_e, params: any) => {
    try {
      const result = await oauthManager.loginWithToken(
        params.providerId,
        params.providerType,
        params.token,
        params.realUserID,
        params.mimoUserId,
        params.mimoPhToken,
      )

      // 修复：登录成功后保存账户到 storeManager
      if (result.success && result.credentials) {
        const now = Date.now()
        const account = {
          id: storeManager.generateId(),
          providerId: params.providerId,
          name: result.accountInfo?.name || params.providerType,
          email: result.accountInfo?.email,
          credentials: result.credentials,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
          requestCount: 0,
          todayUsed: 0,
        }
        storeManager.addAccount(account)
        logger.info(`[zx-web:oauth] Token 登录成功，已保存账户: ${account.providerId}/${account.id}`)

        return {
          ...result,
          account: {
            id: account.id,
            providerId: account.providerId,
            name: account.name,
            status: account.status,
            todayUsed: account.todayUsed,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          },
        }
      }

      return result
    } catch (err) {
      logger.error('[zx-web:oauth] Token 登录失败', err as Error)
      return {
        success: false,
        providerId: params.providerId,
        providerType: params.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('zx-web:oauth:startInAppLogin', async (_e, options: any) => {
    try {
      const result = await oauthManager.startInAppLogin(
        options.providerId,
        options.providerType,
        options.timeout,
        options.proxyMode,
      )

      // 修复：登录成功后保存账户到 storeManager，否则 loadAccounts() 永远返回空
      if (result.success && result.credentials) {
        const now = Date.now()
        const account = {
          id: storeManager.generateId(),
          providerId: options.providerId,
          name: options.providerType,
          credentials: result.credentials,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
          requestCount: 0,
          todayUsed: 0,
        }
        storeManager.addAccount(account)
        logger.info(`[zx-web:oauth] 应用内登录成功，已保存账户: ${account.providerId}/${account.id}`)

        return {
          ...result,
          account: {
            id: account.id,
            providerId: account.providerId,
            name: account.name,
            status: account.status,
            todayUsed: account.todayUsed,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          },
        }
      }

      return result
    } catch (err) {
      logger.error('[zx-web:oauth] 应用内登录失败', err as Error)
      return {
        success: false,
        providerId: options.providerId,
        providerType: options.providerType,
        error: (err as Error).message,
      }
    }
  })

  ipcMain.handle('zx-web:oauth:cancelLogin', async () => {
    await oauthManager.cancelLogin()
    oauthManager.cancelInAppLogin()
    return true
  })

  ipcMain.handle('zx-web:oauth:validateToken', async (_e, providerId: string, providerType: string, credentials: any) => {
    return oauthManager.validateToken(providerId, providerType as any, credentials)
  })

  // ===== 代理服务器状态 =====

  ipcMain.handle('zx-web:proxy:status', () => {
    const config = storeManager.getConfig()
    return {
      running: isZxWebRunning(),
      port: config.proxyPort || 8080,
      host: config.proxyHost || '127.0.0.1',
    }
  })

  ipcMain.handle('zx-web:proxy:restart', async () => {
    try {
      const config = storeManager.getConfig()
      await proxyServer.restart(config.proxyPort, config.proxyHost)
      return true
    } catch (err) {
      logger.error('[zx-web:proxy] 重启失败', err as Error)
      return false
    }
  })

  // ===== 模型同步：拉取 ZxWeb 可用模型并写入 SQLite =====

  ipcMain.handle('zx-web:models:fetch', async () => {
    if (!isZxWebRunning()) {
      return { ok: false, models: [], error: 'ZxWeb 引擎未运行' }
    }
    try {
      const baseUrl = getZxWebBaseUrl()
      const resp = await fetch(`${baseUrl}/v1/models`)
      if (!resp.ok) {
        return { ok: false, models: [], error: `HTTP ${resp.status}` }
      }
      const data = await resp.json() as { data?: Array<{ id: string; owned_by?: string }> }
      const models = (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
        providerId: m.owned_by || 'webchat',
        providerName: m.owned_by || '网页大模型',
      }))

      // 同步到 SQLite：找到或创建 webchat 类型的 provider，更新其 models
      const providers = providerRepo.findAll()
      let webchatProvider = providers.find((p) => p.type === 'webchat')
      if (!webchatProvider) {
        // 用户数据库在 webchat 类型加入之前已创建，自动补建
        webchatProvider = providerRepo.create({
          name: '网页大模型',
          type: 'webchat',
          base_url: 'http://127.0.0.1:8080',
          api_key: '',
          enabled: true,
        })
        logger.info('[zx-web] 已自动创建 webchat provider')
      } else if (!webchatProvider.enabled) {
        // 确保已启用，否则 getAllAvailableModels 不会返回其模型
        webchatProvider = providerRepo.update(webchatProvider.id, { enabled: true })
        logger.info('[zx-web] webchat provider 已启用')
      }
      providerRepo.removeModels(webchatProvider.id)
      for (const m of models) {
        providerRepo.addModel({
          provider_id: webchatProvider.id,
          model_id: m.id,
          name: m.name,
          context_length: 8192,
          supports_tools: true,
          supports_vision: false,
          description: `网页大模型 ${m.providerName}`,
        })
      }
      clearProviderCache(webchatProvider.id)
      logger.info(`[zx-web] 已同步 ${models.length} 个网页模型到数据库`)

      return { ok: true, models }
    } catch (err) {
      logger.error('[zx-web:models] 拉取失败', err as Error)
      return { ok: false, models: [], error: (err as Error).message }
    }
  })
}
