// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcRenderer: {
    on: vi.fn(),
    invoke: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

import { api } from '../../../../preload/api'

describe('preload api — 安全收紧', () => {
  it('不暴露通用 on 方法（防止渲染进程监听任意 IPC 频道）', () => {
    expect((api as Record<string, unknown>).on).toBeUndefined()
  })
})
