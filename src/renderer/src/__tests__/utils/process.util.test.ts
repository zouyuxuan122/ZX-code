// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock child_process
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

import { killProcessTree } from '../../../../main/utils/process.util'

describe('process.util — killProcessTree', () => {
  it('Windows 上应调用 taskkill /T /F 杀进程树', () => {
    const fakeProc = { pid: 12345, kill: vi.fn() }
    mockSpawn.mockClear()

    killProcessTree(fakeProc as unknown as import('child_process').ChildProcess)

    const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === 'taskkill')
    expect(taskkillCall).toBeDefined()
    expect(taskkillCall![1]).toContain('/pid')
    expect(taskkillCall![1]).toContain('12345')
    expect(taskkillCall![1]).toContain('/T')
    expect(taskkillCall![1]).toContain('/F')
  })

  it('进程无 pid 时应安全跳过 taskkill', () => {
    const fakeProc = { pid: undefined, kill: vi.fn() }
    mockSpawn.mockClear()

    expect(() => killProcessTree(fakeProc as unknown as import('child_process').ChildProcess)).not.toThrow()
    // 不应调用 taskkill
    const taskkillCall = mockSpawn.mock.calls.find((c) => c[0] === 'taskkill')
    expect(taskkillCall).toBeUndefined()
  })
})
