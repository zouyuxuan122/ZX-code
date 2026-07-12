import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AgentTrace, TraceStats, TraceQuery } from '@shared/types/trace'

// 用 vi.hoisted 创建捕获 map，使其在 mock 工厂中可用
const { handlers, mockQueryTraces, mockGetTraceStats } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  mockQueryTraces: vi.fn(),
  mockGetTraceStats: vi.fn(),
}))

// mock electron 的 ipcMain.handle，捕获注册的 handler
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
}))

// Mock trace.service，使 getTraceService 返回可控的 mock 实例
vi.mock('../../services/trace.service', () => ({
  getTraceService: () => ({
    queryTraces: mockQueryTraces,
    getTraceStats: mockGetTraceStats,
  }),
}))

// Mock logger，避免拉入完整日志链
vi.mock('../../services/logger.service', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { registerTraceIpc } from '../trace.ipc'
import { logger } from '../../services/logger.service'

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
})

// ============================================================================
// 测试数据工厂
// ============================================================================

function buildTrace(overrides: Partial<AgentTrace> = {}): AgentTrace {
  return {
    conversationId: 'conv-1',
    entries: [
      {
        iteration: 0,
        toolCalls: [
          {
            toolName: 'read_file',
            argsSummary: '{"path":"a.ts"}',
            resultSummary: '文件内容',
            durationMs: 50,
            success: true,
          },
        ],
        iterationDurationMs: 100,
      },
    ],
    totalDurationMs: 100,
    totalToolCallCount: 1,
    successCount: 1,
    failureCount: 0,
    createdAt: 1700000000000,
    ...overrides,
  }
}

function buildStats(overrides: Partial<TraceStats> = {}): TraceStats {
  return {
    totalTraces: 10,
    totalToolCalls: 50,
    averageDurationMs: 2000,
    successRate: 0.9,
    topTools: [
      { toolName: 'read_file', count: 30, successRate: 1.0 },
    ],
    ...overrides,
  }
}

// ============================================================================
// 测试
// ============================================================================

describe('trace IPC', () => {
  it('注册 2 个通道', () => {
    registerTraceIpc()

    expect(handlers.has('trace:query')).toBe(true)
    expect(handlers.has('trace:stats')).toBe(true)
  })

  // --------------------------------------------------------------------------
  // trace:query
  // --------------------------------------------------------------------------
  describe('trace:query', () => {
    it('调用 getTraceService().queryTraces 并返回结果', () => {
      const traces = [buildTrace()]
      mockQueryTraces.mockReturnValue(traces)
      registerTraceIpc()

      const query: TraceQuery = { conversationId: 'conv-1' }
      const handler = handlers.get('trace:query')!
      const result = handler(null, query) as AgentTrace[]

      expect(mockQueryTraces).toHaveBeenCalledWith(query)
      expect(result).toBe(traces)
    })

    it('queryTraces 抛出异常时返回空数组并记录 warning', () => {
      mockQueryTraces.mockImplementation(() => {
        throw new Error('DB error')
      })
      registerTraceIpc()

      const handler = handlers.get('trace:query')!
      const result = handler(null, {}) as AgentTrace[]

      expect(result).toEqual([])
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('trace:query'),
      )
    })
  })

  // --------------------------------------------------------------------------
  // trace:stats
  // --------------------------------------------------------------------------
  describe('trace:stats', () => {
    it('调用 getTraceService().getTraceStats 并返回结果', () => {
      const stats = buildStats()
      mockGetTraceStats.mockReturnValue(stats)
      registerTraceIpc()

      const handler = handlers.get('trace:stats')!
      const result = handler(null) as TraceStats

      expect(mockGetTraceStats).toHaveBeenCalled()
      expect(result).toBe(stats)
    })

    it('getTraceStats 抛出异常时返回 null 并记录 warning', () => {
      mockGetTraceStats.mockImplementation(() => {
        throw new Error('DB error')
      })
      registerTraceIpc()

      const handler = handlers.get('trace:stats')!
      const result = handler(null)

      expect(result).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('trace:stats'),
      )
    })
  })
})
