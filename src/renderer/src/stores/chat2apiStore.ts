import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import { useChatStore } from './chatStore'

interface Chat2ApiAccount {
  id: string
  providerId: string
  name: string
  status: 'active' | 'inactive' | 'expired' | 'error'
  requestCount?: number
  todayUsed?: number
}

interface Chat2ApiProvider {
  id: string
  name: string
  type: 'builtin' | 'custom'
  enabled: boolean
  supportedModels?: string[]
}

interface ProxyStatus {
  running: boolean
  port: number
  host: string
}

interface Chat2ApiState {
  providers: Chat2ApiProvider[]
  accounts: Chat2ApiAccount[]
  proxyStatus: ProxyStatus | null
  loading: boolean
  loginInProgress: boolean
  loginProviderId: string | null
  error: string | null

  loadProviders: () => Promise<void>
  loadAccounts: () => Promise<void>
  loadProxyStatus: () => Promise<void>
  mergeAccount: (acct: Chat2ApiAccount) => void
  startLogin: (providerId: string, providerType: string) => Promise<boolean>
  startInAppLogin: (providerId: string, providerType: string) => Promise<boolean>
  cancelLogin: () => Promise<void>
  deleteAccount: (accountId: string) => Promise<void>
  fetchModels: () => Promise<number>
  restartProxy: () => Promise<void>
}

export const useChat2ApiStore = create<Chat2ApiState>((set, get) => ({
  providers: [],
  accounts: [],
  proxyStatus: null,
  loading: false,
  loginInProgress: false,
  loginProviderId: null,
  error: null,

  loadProviders: async () => {
    try {
      const providers = await ipc.chat2api.listProviders()
      set({ providers })
    } catch (err) {
      console.error('加载网页模型 Provider 失败', err)
      set({ error: (err as Error).message })
    }
  },

  loadAccounts: async () => {
    try {
      const accounts = await ipc.chat2api.listAccounts()
      set({ accounts })
    } catch (err) {
      console.error('加载账户失败', err)
    }
  },

  loadProxyStatus: async () => {
    try {
      const status = await ipc.chat2api.getProxyStatus()
      set({ proxyStatus: status })
    } catch (err) {
      console.error('加载代理状态失败', err)
    }
  },

  /** 将 IPC 返回的 account 合并到本地 accounts 列表 */
  mergeAccount: (acct: Chat2ApiAccount) => {
    const current = get().accounts
    const exists = current.some((a) => a.id === acct.id)
    if (!exists) {
      set({ accounts: [...current, acct] })
    }
  },

  startLogin: async (providerId, providerType) => {
    set({ loginInProgress: true, loginProviderId: providerId, error: null })
    try {
      const result = await ipc.chat2api.startLogin({ providerId, providerType })
      if (result.success) {
        if ((result as any).account) {
          get().mergeAccount((result as any).account)
        }
        await get().loadAccounts()
        await get().fetchModels()
      }
      return result.success
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    } finally {
      set({ loginInProgress: false, loginProviderId: null })
    }
  },

  startInAppLogin: async (providerId, providerType) => {
    set({ loginInProgress: true, loginProviderId: providerId, error: null })
    try {
      const result = await ipc.chat2api.startInAppLogin({ providerId, providerType })
      if (result.success) {
        if ((result as any).account) {
          get().mergeAccount((result as any).account)
        }
        await get().loadAccounts()
        await get().fetchModels()
      }
      return result.success
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    } finally {
      set({ loginInProgress: false, loginProviderId: null })
    }
  },

  cancelLogin: async () => {
    await ipc.chat2api.cancelLogin()
    set({ loginInProgress: false, loginProviderId: null })
  },

  deleteAccount: async (accountId) => {
    try {
      await ipc.chat2api.deleteAccount(accountId)
      await get().loadAccounts()
      await get().fetchModels()
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  fetchModels: async () => {
    const result = await ipc.chat2api.fetchModels()
    if (!result.ok) {
      set({ error: result.error || '拉取模型失败' })
    }
    // 同步完成后刷新聊天页面的模型列表
    useChatStore.getState().loadAvailableModels()
    return result.models?.length || 0
  },

  restartProxy: async () => {
    await ipc.chat2api.restartProxy()
    await get().loadProxyStatus()
  },
}))
