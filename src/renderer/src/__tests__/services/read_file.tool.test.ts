// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { statMock, readFileMock } = vi.hoisted(() => ({
  statMock: vi.fn(),
  readFileMock: vi.fn(),
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      stat: statMock,
      readFile: readFileMock,
    },
    stat: statMock,
    readFile: readFileMock,
  }
})

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { readFileTool } from '../../../../main/tools/builtin/read_file.tool'
import type { ToolContext } from '@shared/types/tool'

describe('read_file 工具 — 大文件截断', () => {
  const baseContext: ToolContext = {
    workspacePath: process.platform === 'win32' ? 'D:\\proj' : '/home/proj',
    projectId: null,
    conversationId: 'test-conv',
    autoAccept: false,
  }

  beforeEach(() => {
    statMock.mockReset()
    readFileMock.mockReset()
  })

  it('小文件正常读取完整内容', async () => {
    statMock.mockResolvedValue({
      isFile: () => true,
      size: 100,
    } as never)
    readFileMock.mockResolvedValue('hello world' as never)
    const result = await readFileTool.execute(
      { path: 'src/test.ts' },
      baseContext,
    )
    expect(result.is_error).toBe(false)
    expect(result.content).toBe('hello world')
  })

  it('超过 256KB 的文件应拒绝读取并返回错误', async () => {
    statMock.mockResolvedValue({
      isFile: () => true,
      size: 512 * 1024, // 512KB
    } as never)
    const result = await readFileTool.execute(
      { path: 'big.log' },
      baseContext,
    )
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('过大')
  })

  it('超过 64KB 但小于 256KB 的文件应截断并提示', async () => {
    statMock.mockResolvedValue({
      isFile: () => true,
      size: 100 * 1024, // 100KB
    } as never)
    const longContent = 'x'.repeat(100 * 1024)
    readFileMock.mockResolvedValue(longContent as never)
    const result = await readFileTool.execute(
      { path: 'medium.log' },
      baseContext,
    )
    expect(result.is_error).toBe(false)
    // 内容应被截断
    expect(result.content.length).toBeLessThan(100 * 1024)
    expect(result.content).toContain('截断')
  })

  it('目录路径返回错误', async () => {
    statMock.mockResolvedValue({
      isFile: () => false,
      size: 0,
    } as never)
    const result = await readFileTool.execute(
      { path: 'src' },
      baseContext,
    )
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('不是文件')
  })
})
