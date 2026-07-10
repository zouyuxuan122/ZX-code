// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 1,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}))

// Mock settingsRepo
vi.mock('../../../../main/database/repositories/settings.repo', () => ({
  get: vi.fn(() => null),
  set: vi.fn(),
}))

// Mock logger
vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { disconnectAllServers, getMcpServerStatuses } from '../../../../main/services/mcp.service'

describe('MCP — disconnectAllServers', () => {
  it('无已连接服务器时应安全无异常', async () => {
    // 初始状态下无已连接服务器
    const statuses = getMcpServerStatuses()
    const connectedCount = statuses.filter((s) => s.connected).length
    expect(connectedCount).toBe(0)

    // 调用 disconnectAllServers 不应抛异常
    await expect(disconnectAllServers()).resolves.toBeUndefined()
  })
})
