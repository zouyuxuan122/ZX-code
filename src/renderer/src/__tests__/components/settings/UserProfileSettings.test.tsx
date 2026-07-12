import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserProfileEntry } from '@shared/types/user-profile'

// ─── Mocks ──────────────────────────────────────────────

const mockProfileGet = vi.fn()
const mockProfileUpdate = vi.fn()
const mockProfileClear = vi.fn()

vi.mock('@/services/ipc', () => ({
  ipc: {
    profile: {
      get: (...args: unknown[]) => mockProfileGet(...args),
      update: (...args: unknown[]) => mockProfileUpdate(...args),
      clear: (...args: unknown[]) => mockProfileClear(...args),
    },
  },
}))

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

import { UserProfileSettings } from '@/components/settings/UserProfileSettings'

const entry: UserProfileEntry = {
  id: 'p-1',
  dimension: 'tech_stack',
  value: 'React, TypeScript, Node.js',
  confidence: 0.92,
  source: 'auto',
  updatedAt: 1700000000000,
  createdAt: 1700000000000,
}

describe('UserProfileSettings 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    mockProfileGet.mockResolvedValue([entry])
    mockProfileUpdate.mockResolvedValue(undefined)
    mockProfileClear.mockResolvedValue(undefined)
  })

  it('渲染标题并加载画像', async () => {
    render(<UserProfileSettings />)
    expect(screen.getByText('用户画像')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockProfileGet).toHaveBeenCalled()
    })
  })

  it('显示维度值与置信度', async () => {
    render(<UserProfileSettings />)
    await waitFor(() => {
      expect(screen.getByText('React, TypeScript, Node.js')).toBeInTheDocument()
      expect(screen.getByText(/0\.92/)).toBeInTheDocument()
    })
  })

  it('点击刷新按钮重新加载 profile:get', async () => {
    render(<UserProfileSettings />)
    await waitFor(() => {
      expect(mockProfileGet).toHaveBeenCalled()
    })
    mockProfileGet.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /刷新/ }))
    await waitFor(() => {
      expect(mockProfileGet).toHaveBeenCalled()
    })
  })

  it('点击编辑按钮提交后调用 profile:update', async () => {
    render(<UserProfileSettings />)
    const editBtn = await screen.findByRole('button', { name: /编辑/ })
    fireEvent.click(editBtn)
    const textarea = await screen.findByPlaceholderText(/输入该维度的值/)
    fireEvent.change(textarea, { target: { value: 'Vue, Go' } })
    fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
    await waitFor(() => {
      expect(mockProfileUpdate).toHaveBeenCalledWith({
        dimension: 'tech_stack',
        value: 'Vue, Go',
        source: 'manual',
      })
    })
  })

  it('点击清除按钮调用 profile:clear', async () => {
    render(<UserProfileSettings />)
    await waitFor(() => {
      expect(screen.getByText('React, TypeScript, Node.js')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /清除/ }))
    await waitFor(() => {
      expect(mockProfileClear).toHaveBeenCalled()
    })
  })
})
