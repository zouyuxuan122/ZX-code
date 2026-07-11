import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock settingsStore — 支持 zustand selector 模式 useSettingsStore((s) => s.xxx)
const mockGetSetting = vi.fn()
const mockUpdateSetting = vi.fn()
const storeState = {
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  updateSetting: (...args: unknown[]) => mockUpdateSetting(...args),
}
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState,
}))

// Mock toast
vi.mock('@/stores/toastStore', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock window.api.tts.listVoices
const mockListVoices = vi.fn()
Object.defineProperty(window, 'api', {
  value: {
    tts: {
      listVoices: (...args: unknown[]) => mockListVoices(...args),
    },
  },
  writable: true,
  configurable: true,
})

import { TtsSettings } from '../../components/settings/TtsSettings'

describe('TtsSettings 组件', () => {
  beforeEach(() => {
    mockGetSetting.mockReset()
    mockUpdateSetting.mockReset()
    mockListVoices.mockReset()
    mockListVoices.mockResolvedValue({ ok: true, voices: [] })
  })

  it('应渲染 TTS 设置标题', () => {
    mockGetSetting.mockImplementation((_key: string, def: unknown) => def)
    render(<TtsSettings />)
    expect(screen.getByText('语音合成')).toBeInTheDocument()
  })

  it('应渲染启用开关', () => {
    mockGetSetting.mockImplementation((_key: string, def: unknown) => def)
    render(<TtsSettings />)
    expect(screen.getByText('启用 TTS')).toBeInTheDocument()
  })

  it('应渲染引擎选择器', () => {
    mockGetSetting.mockImplementation((_key: string, def: unknown) => def)
    render(<TtsSettings />)
    expect(screen.getByText('TTS 引擎')).toBeInTheDocument()
  })

  it('应渲染朗读模式选择器（自动/手动）', () => {
    mockGetSetting.mockImplementation((_key: string, def: unknown) => def)
    render(<TtsSettings />)
    expect(screen.getByText('朗读模式')).toBeInTheDocument()
  })

  it('切换启用开关应调用 updateSetting', () => {
    mockGetSetting.mockImplementation((key: string, def: unknown) => {
      if (key === 'tts.enabled') return false
      return def
    })
    render(<TtsSettings />)

    const toggle = screen.getByRole('switch', { name: /启用 TTS/ })
    fireEvent.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('tts.enabled', true, 'tts')
  })

  it('provider=openai 时应渲染 API Key 输入框', () => {
    mockGetSetting.mockImplementation((key: string, def: unknown) => {
      if (key === 'tts.provider') return 'openai'
      if (key === 'tts.enabled') return true
      return def
    })
    render(<TtsSettings />)
    expect(screen.getByText('API Key')).toBeInTheDocument()
  })

  it('provider=edge 时不应渲染 API Key 输入框', () => {
    mockGetSetting.mockImplementation((key: string, def: unknown) => {
      if (key === 'tts.provider') return 'edge'
      if (key === 'tts.enabled') return true
      return def
    })
    render(<TtsSettings />)
    expect(screen.queryByText('API Key')).not.toBeInTheDocument()
  })

  it('应渲染声音克隆 voice ID 输入框（provider=openai 时）', () => {
    mockGetSetting.mockImplementation((key: string, def: unknown) => {
      if (key === 'tts.provider') return 'openai'
      if (key === 'tts.enabled') return true
      return def
    })
    render(<TtsSettings />)
    expect(screen.getByText('声音克隆')).toBeInTheDocument()
  })
})
