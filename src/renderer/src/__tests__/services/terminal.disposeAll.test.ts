// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Mock fs（terminal.service 检查 cwd 是否存在）
vi.mock('fs', () => ({
  default: { existsSync: vi.fn(() => true) },
  existsSync: vi.fn(() => true),
}))

// Mock logger
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { terminalService } from '../../../../main/services/terminal.service'

/** 创建模拟 ChildProcess */
function createFakeChild(pid: number) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    pid,
    stdout: { on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[evt]) handlers[evt] = []
      handlers[evt].push(cb)
    }) },
    stderr: { on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[evt]) handlers[evt] = []
      handlers[evt].push(cb)
    }) },
    stdin: { write: vi.fn(), destroyed: false },
    on: vi.fn((evt: string, cb: (...args: unknown[]) => void) => {
      if (!handlers[evt]) handlers[evt] = []
      handlers[evt].push(cb)
    }),
    kill: vi.fn(),
    _handlers: handlers,
  }
}

describe('TerminalService — disposeAll', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
    // 清理终端服务状态
    terminalService.disposeAll()
  })

  it('disposeAll 应清理所有会话', () => {
    // 创建 2 个模拟子进程
    const fakeChild1 = createFakeChild(10001)
    const fakeChild2 = createFakeChild(10002)
    mockSpawn
      .mockReturnValueOnce(fakeChild1)
      .mockReturnValueOnce(fakeChild2)

    // 创建 2 个会话
    terminalService.createSession('powershell', '/tmp')
    terminalService.createSession('powershell', '/tmp')

    expect(terminalService.listSessions().length).toBe(2)

    // 调用 disposeAll
    terminalService.disposeAll()

    // 验证所有会话已清理
    expect(terminalService.listSessions().length).toBe(0)
  })

  it('disposeAll 在无会话时应安全无异常', () => {
    expect(() => terminalService.disposeAll()).not.toThrow()
    expect(terminalService.listSessions().length).toBe(0)
  })

  it('disposeAll 应终止运行中的进程', () => {
    const fakeChild = createFakeChild(20001)
    mockSpawn.mockReturnValueOnce(fakeChild)

    terminalService.createSession('powershell', '/tmp')

    // disposeAll 应触发 killSession → Windows 上调用 taskkill
    terminalService.disposeAll()

    // 验证 taskkill 被调用（Windows 平台）
    const taskkillCall = mockSpawn.mock.calls.find(
      (call) => call[0] === 'taskkill',
    )
    expect(taskkillCall).toBeDefined()
    expect(taskkillCall![1]).toContain('/T')
    expect(taskkillCall![1]).toContain('/F')
  })
})
