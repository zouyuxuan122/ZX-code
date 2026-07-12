import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import type { ScriptSandboxService } from '../../services/script-sandbox.service'
import type { RpcScriptResult } from '@shared/types/rpc-script'

/** 默认脚本执行超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 30000

/**
 * run_script 工具：在隔离沙箱中执行 JavaScript 脚本
 *
 * 脚本可通过 `tools.xxx(args)` 调用已注册的 RPC 工具（如 read_file、grep 等），
 * 适用于批量操作、组合调用等场景。
 *
 * 安全：
 * - 沙箱中不提供 require / process / Buffer 等危险全局对象
 * - 执行代码需用户确认（requiredPermissions: ['shell:execute']）
 */
export function createRunScriptTool(sandboxService: ScriptSandboxService): BuiltinTool {
  return {
    name: 'run_script',
    description:
      'Execute a JavaScript script in a sandbox that can call other tools via RPC. Useful for batch operations and combining multiple tool calls. Available tools are accessible via `tools.<tool_name>(args)`.',
    parameters: {
      code: {
        type: 'string',
        description: '要执行的 JavaScript 代码。可使用 `await tools.<name>(args)` 调用其他工具，用 `return` 返回结果。',
      },
      timeout: {
        type: 'number',
        description: '脚本执行超时时间（毫秒），默认 30000',
        default: DEFAULT_TIMEOUT_MS,
      },
    },
    required: ['code'],
    requiredPermissions: ['shell:execute'],
    async execute(args, _context): Promise<ToolExecutionResult> {
      const code = args.code as string | undefined
      const timeout = Number(args.timeout) > 0 ? Number(args.timeout) : DEFAULT_TIMEOUT_MS

      if (!code || typeof code !== 'string') {
        return {
          tool_call_id: '',
          content: '参数 code 必须为非空字符串',
          is_error: true,
        }
      }

      const result = await sandboxService.executeScript(code, timeout)
      const content = formatScriptResult(result)

      return {
        tool_call_id: '',
        content,
        is_error: !result.success,
      }
    },
  }
}

/**
 * 将脚本执行结果格式化为 agent 可读的文本
 */
function formatScriptResult(result: RpcScriptResult): string {
  const lines: string[] = []

  if (result.success) {
    lines.push('脚本执行成功')
  } else {
    lines.push('脚本执行失败')
  }

  if (result.timedOut) {
    lines.push(`原因: 执行超时 (timeout)`)
  }

  if (result.error) {
    lines.push(`错误: ${result.error}`)
  }

  if (result.output !== undefined && result.output !== null) {
    const outputStr =
      typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output)
    lines.push(`输出: ${outputStr}`)
  }

  if (result.toolCalls.length > 0) {
    lines.push(`工具调用 (${result.toolCalls.length}):`)
    for (const tc of result.toolCalls) {
      const status = tc.success ? '成功' : `失败(${tc.error || ''})`
      lines.push(`  - ${tc.toolName}: ${status}`)
    }
  }

  lines.push(`耗时: ${result.durationMs}ms`)

  return lines.join('\n')
}
