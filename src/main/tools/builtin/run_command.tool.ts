import { exec } from 'child_process'
import path from 'path'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import { resolveSafePath } from './path.util'

/**
 * 将 exec 包装为 Promise，替代 promisify(exec)。
 * promisify(exec) 依赖 exec[Symbol.for('nodejs.util.promisify.custom')]，
 * 在测试中 mock exec 时该 symbol 丢失导致返回数组而非 { stdout, stderr }。
 * 自定义包装直接调用 callback 形式，兼容 mock。
 */
function execAsync(
  command: string,
  options: { cwd: string; timeout: number; maxBuffer: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        if (stdout) (err as NodeJS.ErrnoException & { stdout?: string | Buffer }).stdout = stdout
        if (stderr) (err as NodeJS.ErrnoException & { stderr?: string | Buffer }).stderr = stderr
        reject(err)
      } else {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        })
      }
    })
  })
}

/**
 * run_command 工具：在 workspace 内的指定 cwd 执行 shell 命令
 * 权限审批由 Agent 引擎层统一处理（per-call 审批），工具本身不再重复检查 autoAccept
 */
export const runCommandTool: BuiltinTool = {
  name: 'run_command',
  description: '在工作区内执行 shell 命令，返回 stdout/stderr/exitCode。需要用户确认。',
  parameters: {
    command: {
      type: 'string',
      description: '要执行的命令字符串',
    },
    cwd: {
      type: 'string',
      description: '命令执行的工作目录，默认为工作区根目录',
      default: '.',
    },
    timeout: {
      type: 'number',
      description: '超时时间（毫秒），默认 30000',
      default: 30000,
    },
  },
  required: ['command'],
  requiredPermissions: ['shell:execute'],
  async execute(args, context): Promise<ToolExecutionResult> {
    const command = args.command as string
    const cwdRaw = (args.cwd as string) || '.'
    const timeout = Number(args.timeout) > 0 ? Number(args.timeout) : 30000

    if (!command || typeof command !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 command 必须为非空字符串',
        is_error: true,
      }
    }

    const safeCwd = resolveSafePath(cwdRaw, context.workspacePath, context.allowedDirectories, true)
    if (!safeCwd) {
      return {
        tool_call_id: '',
        content: `cwd 路径越界或非法: ${cwdRaw}`,
        is_error: true,
      }
    }

    const startTime = Date.now()
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: safeCwd,
        timeout,
        maxBuffer: 1024 * 1024 * 4,
      })
      const duration = Date.now() - startTime
      const result = {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0,
        cwd: path.relative(context.workspacePath, safeCwd) || '.',
      }
      return {
        tool_call_id: '',
        content: JSON.stringify(result, null, 2),
        is_error: false,
        metadata: {
          command: {
            command,
            exitCode: 0,
            duration,
          },
        },
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer; code?: number | string; killed?: boolean; signal?: string }
      const duration = Date.now() - startTime
      // exec 在非零退出时也会抛错，但 stdout/stderr 通常已经填充
      const exitCode: number = typeof e.code === 'number' ? e.code : -1
      const killed = e.killed === true || (e.signal === 'SIGTERM' && !!e.message && e.message.toLowerCase().includes('timed out'))
      const result = {
        stdout: e.stdout ? e.stdout.toString() : '',
        stderr: e.stderr ? e.stderr.toString() : (e.message || ''),
        exitCode,
        killed,
        cwd: path.relative(context.workspacePath, safeCwd) || '.',
      }
      return {
        tool_call_id: '',
        content: JSON.stringify(result, null, 2),
        // 命令以非零码退出视为错误，但仍把输出回传给 Agent 用于排查
        is_error: exitCode !== 0,
        metadata: {
          command: {
            command,
            exitCode,
            duration,
          },
        },
      }
    }
  },
}
