// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    exec: execMock as unknown as typeof actual.exec,
  }
})

vi.mock('../../../../main/services/logger.service', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { runCommandTool } from '../../../../main/tools/builtin/run_command.tool'
import type { ToolContext } from '@shared/types/tool'

describe('run_command 工具 — 审批后执行', () => {
  const baseContext: ToolContext = {
    workspacePath: process.platform === 'win32' ? 'D:\\proj' : '/home/proj',
    projectId: null,
    conversationId: 'test-conv',
    autoAccept: false,
  }

  beforeEach(() => {
    execMock.mockReset()
  })

  it('autoAccept=false 时不应直接返回错误（审批由引擎层处理）', async () => {
    execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      cb(null, 'output', '')
      return undefined as never
    })
    const result = await runCommandTool.execute(
      { command: 'echo hello', cwd: '.' },
      baseContext,
    )
    // 诊断：检查 mock 是否被调用
    expect(execMock).toHaveBeenCalled()
    // 工具应执行命令而不是返回"需要用户授权"
    expect(result.is_error).toBe(false)
    expect(result.content).not.toContain('需要用户授权')
  })

  it('autoAccept=true 时正常执行', async () => {
    execMock.mockImplementation((_cmd, _opts, cb) => {
      cb(null, 'done', '')
      return undefined as never
    })
    const result = await runCommandTool.execute(
      { command: 'echo test', cwd: '.' },
      { ...baseContext, autoAccept: true },
    )
    expect(result.is_error).toBe(false)
  })

  it('命令执行成功返回 stdout', async () => {
    execMock.mockImplementation((_cmd, _opts, cb) => {
      cb(null, 'hello world', '')
      return undefined as never
    })
    const result = await runCommandTool.execute(
      { command: 'echo "hello world"', cwd: '.' },
      { ...baseContext, autoAccept: true },
    )
    const parsed = JSON.parse(result.content)
    expect(parsed.stdout).toContain('hello world')
    expect(parsed.exitCode).toBe(0)
  })

  it('命令非零退出时返回错误但包含输出', async () => {
    execMock.mockImplementation((_cmd, _opts, cb) => {
      const err = Object.assign(new Error('Command failed'), {
        code: 1,
        stdout: 'partial output',
        stderr: 'error message',
        killed: false,
      })
      cb(err, 'partial output', 'error message')
      return undefined as never
    })
    const result = await runCommandTool.execute(
      { command: 'exit 1', cwd: '.' },
      { ...baseContext, autoAccept: true },
    )
    expect(result.is_error).toBe(true)
    const parsed = JSON.parse(result.content)
    expect(parsed.exitCode).toBe(1)
    expect(parsed.stdout).toContain('partial output')
  })

  it('缺少 command 参数时返回错误', async () => {
    const result = await runCommandTool.execute({}, baseContext)
    expect(result.is_error).toBe(true)
    expect(result.content).toContain('command')
  })
})
