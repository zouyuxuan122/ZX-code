import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { TerminalSession, TerminalShell } from '@shared/types/terminal'
import { useProjectStore } from '@/stores/projectStore'

interface TerminalState {
  /** 面板是否展开 */
  isOpen: boolean
  /** 当前活动会话 ID */
  activeSessionId: string | null
  /** 当前选择的 shell 类型 */
  shell: TerminalShell
  /** 已创建的所有会话 */
  sessions: TerminalSession[]

  open: () => void
  close: () => void
  toggle: () => void
  setShell: (shell: TerminalShell) => void
  setActiveSession: (id: string | null) => void
  /** 创建一个新的会话并自动激活 */
  createSession: (cwd?: string) => Promise<string | null>
  /** 终止指定会话 */
  killSession: (id: string) => Promise<void>
  /** 拉取主进程当前的会话列表 */
  loadSessions: () => Promise<void>
}

/** 根据当前工作区推断 cwd；无工作区时回退到空字符串，由主进程再回退到用户主目录 */
function resolveCwd(): string {
  return useProjectStore.getState().currentProject?.workspace_path ?? ''
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  isOpen: false,
  activeSessionId: null,
  shell: 'powershell',
  sessions: [],

  open: () => {
    set({ isOpen: true })
    // 打开时若没有活动会话，自动创建一个
    if (!get().activeSessionId) {
      void get().createSession()
    }
  },

  close: () => set({ isOpen: false }),

  toggle: () => {
    if (get().isOpen) {
      set({ isOpen: false })
    } else {
      get().open()
    }
  },

  setShell: (shell) => set({ shell }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  createSession: async (cwd?: string) => {
    const { shell } = get()
    try {
      const id = await ipc.terminal.create(shell, cwd ?? resolveCwd())
      set((s) => ({
        activeSessionId: id,
        isOpen: true,
      }))
      await get().loadSessions()
      return id
    } catch (err) {
      console.error('[terminalStore] 创建会话失败:', err)
      return null
    }
  },

  killSession: async (id) => {
    try {
      await ipc.terminal.kill(id)
    } catch (err) {
      console.error('[terminalStore] 终止会话失败:', err)
    }
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    }))
    await get().loadSessions()
  },

  loadSessions: async () => {
    try {
      const sessions = await ipc.terminal.list()
      set({ sessions })
    } catch (err) {
      console.error('[terminalStore] 加载会话列表失败:', err)
    }
  },
}))
