import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const { mockOnMaximizeChanged, mockIsMaximized } = vi.hoisted(() => ({
  mockOnMaximizeChanged: vi.fn(() => vi.fn()),
  mockIsMaximized: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: mockIsMaximized,
      onMaximizeChanged: mockOnMaximizeChanged,
    },
  },
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { setMaximized: vi.fn() }
    return selector(state)
  }),
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { getSetting: () => 'apple' }
    return selector(state)
  }),
}))

import { TitleBar } from '@/components/layout/TitleBar'

describe('TitleBar', () => {
  it('subscribes to window maximize changes via ipc.window.onMaximizeChanged on mount', () => {
    mockOnMaximizeChanged.mockClear()
    render(<TitleBar />)
    expect(mockOnMaximizeChanged).toHaveBeenCalledTimes(1)
  })

  it('calls ipc.window.isMaximized on mount to get initial state', () => {
    mockIsMaximized.mockClear()
    render(<TitleBar />)
    expect(mockIsMaximized).toHaveBeenCalled()
  })

  it('renders app name', () => {
    const { container } = render(<TitleBar />)
    expect(container.textContent).toContain('ZX-Code')
  })
})
