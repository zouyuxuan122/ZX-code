import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { ContextUsage, MessageTokenInfo } from '@shared/types/context'

interface ContextState {
  usage: ContextUsage | null
  messageTokens: MessageTokenInfo[]
  loading: boolean
  compressing: boolean

  loadUsage: (conversationId: string) => Promise<void>
  loadMessageTokens: (conversationId: string) => Promise<void>
  compress: (conversationId: string) => Promise<{ ok: boolean; error?: string }>
  clear: () => void
}

export const useContextStore = create<ContextState>((set) => ({
  usage: null,
  messageTokens: [],
  loading: false,
  compressing: false,

  loadUsage: async (conversationId: string) => {
    if (!conversationId) {
      set({ usage: null })
      return
    }
    try {
      const usage = await ipc.context.getUsage(conversationId)
      set({ usage })
    } catch (err) {
      console.error('加载上下文使用情况失败:', err)
    }
  },

  loadMessageTokens: async (conversationId: string) => {
    if (!conversationId) {
      set({ messageTokens: [] })
      return
    }
    try {
      const list = await ipc.context.getMessageTokens(conversationId)
      set({ messageTokens: list })
    } catch (err) {
      console.error('加载消息 token 列表失败:', err)
    }
  },

  compress: async (conversationId: string) => {
    set({ compressing: true })
    try {
      const result = await ipc.context.compress(conversationId)
      return { ok: result.ok, error: result.error }
    } finally {
      set({ compressing: false })
    }
  },

  clear: () => set({ usage: null, messageTokens: [] }),
}))
