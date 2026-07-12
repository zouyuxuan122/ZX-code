import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────
// 注意：这里【不】mock @/services/ipc，让真实的 ipc proxy 与 invokeRaw 生效。
// 通过设置 window.api 让 ipc.* 走通；不设置 window.electron 让 invokeRaw 抛错。
// 这样可以验证面板是否使用 ipc.*（走 window.api）而非 invokeRaw（走 window.electron）。

const storeState = {
  getSetting: (_key: string, def: unknown) => def,
  updateSetting: vi.fn(),
  getEvolutionEnabled: () => true,
  setEvolutionEnabled: vi.fn(),
  getProfileEnabled: () => true,
  setProfileEnabled: vi.fn(),
}
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState,
}))

vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { CronJobsSettings } from '@/components/settings/CronJobsSettings'
import { UserProfileSettings } from '@/components/settings/UserProfileSettings'
import { SkillEvolutionSettings } from '@/components/settings/SkillEvolutionSettings'
import { HistorySearchSettings } from '@/components/settings/HistorySearchSettings'
import { TraceExplorerSettings } from '@/components/settings/TraceExplorerSettings'

// ─── window.api mock 工厂 ───────────────────────────────

function buildApiMock() {
  return {
    cron: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      toggle: vi.fn().mockResolvedValue(undefined),
      history: vi.fn().mockResolvedValue([]),
    },
    profile: {
      get: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    evolution: {
      run: vi.fn().mockResolvedValue({
        improved: false,
        run: { id: 'r1', status: 'completed' },
        baselineScore: 0,
        bestVariant: null,
        allVariants: [],
      }),
      history: vi.fn().mockResolvedValue([]),
      rollback: vi.fn().mockResolvedValue(true),
      compare: vi.fn().mockResolvedValue(null),
    },
    scl: {
      list: vi.fn().mockResolvedValue([]),
    },
    search: {
      conversations: vi.fn().mockResolvedValue([]),
      files: vi.fn().mockResolvedValue([]),
      messages: vi.fn().mockResolvedValue([]),
    },
    trace: {
      query: vi.fn().mockResolvedValue([]),
      stats: vi.fn().mockResolvedValue(null),
    },
  }
}

let apiMock: ReturnType<typeof buildApiMock>

beforeEach(() => {
  apiMock = buildApiMock()
  // 设置 window.api —— ipc proxy 会读取它
  Object.defineProperty(window, 'api', {
    value: apiMock,
    writable: true,
    configurable: true,
  })
  // 确保 window.electron 不存在 —— invokeRaw 会因找不到它而抛错
  delete (window as unknown as { electron?: unknown }).electron
})

// ============================================================================
// 测试：每个面板都通过 window.api.* 调用 IPC，而非 window.electron.ipcRenderer
// ============================================================================

describe('设置面板 IPC 路由（使用 window.api 而非 window.electron.ipcRenderer）', () => {
  // --------------------------------------------------------------------------
  // CronJobsSettings
  // --------------------------------------------------------------------------
  describe('CronJobsSettings', () => {
    it('挂载时调用 window.api.cron.list（不抛 invokeRaw 错误）', async () => {
      render(<CronJobsSettings />)
      await waitFor(() => {
        expect(apiMock.cron.list).toHaveBeenCalled()
      })
      // 不应出现 invokeRaw 的错误信息
      expect(screen.queryByText(/window\.electron\.ipcRenderer/)).not.toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // UserProfileSettings
  // --------------------------------------------------------------------------
  describe('UserProfileSettings', () => {
    it('挂载时调用 window.api.profile.get（不抛 invokeRaw 错误）', async () => {
      render(<UserProfileSettings />)
      await waitFor(() => {
        expect(apiMock.profile.get).toHaveBeenCalled()
      })
      expect(screen.queryByText(/window\.electron\.ipcRenderer/)).not.toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // SkillEvolutionSettings
  // --------------------------------------------------------------------------
  describe('SkillEvolutionSettings', () => {
    it('挂载时调用 window.api.scl.list 与 window.api.evolution.history（不抛 invokeRaw 错误）', async () => {
      render(<SkillEvolutionSettings />)
      await waitFor(() => {
        expect(apiMock.scl.list).toHaveBeenCalled()
      })
      expect(screen.queryByText(/window\.electron\.ipcRenderer/)).not.toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // HistorySearchSettings
  // --------------------------------------------------------------------------
  describe('HistorySearchSettings', () => {
    it('搜索时调用 window.api.search.conversations（不抛 invokeRaw 错误）', async () => {
      render(<HistorySearchSettings />)
      const input = screen.getByPlaceholderText(/搜索对话/) as HTMLInputElement
      fireEvent.change(input, { target: { value: 'memo' } })
      fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
      await waitFor(() => {
        expect(apiMock.search.conversations).toHaveBeenCalled()
      })
      expect(screen.queryByText(/window\.electron\.ipcRenderer/)).not.toBeInTheDocument()
    })
  })

  // --------------------------------------------------------------------------
  // TraceExplorerSettings
  // --------------------------------------------------------------------------
  describe('TraceExplorerSettings', () => {
    it('挂载时调用 window.api.trace.query 与 window.api.trace.stats（不抛 invokeRaw 错误）', async () => {
      render(<TraceExplorerSettings />)
      await waitFor(() => {
        expect(apiMock.trace.query).toHaveBeenCalled()
        expect(apiMock.trace.stats).toHaveBeenCalled()
      })
      expect(screen.queryByText(/window\.electron\.ipcRenderer/)).not.toBeInTheDocument()
    })
  })
})
