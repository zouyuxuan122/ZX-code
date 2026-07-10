import { terminalService } from '../../services/terminal.service'
import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'

/**
 * terminal_read 工具：让 Agent 读取某个终端会话最近的输出，用于代码审查与排错
 *
 * 使用场景：
 *  - Agent 通过 run_command 执行构建/测试后，想查看终端中的完整输出
 *  - 用户在终端中跑了某个命令，让 Agent 分析输出结果
 *
 * 说明：
 *  - 会话 ID 由前端在创建终端时分配，Agent 通常通过 context 或用户提示获得
 *  - 若不传 sessionId，则返回最近活跃会话的输出
 *  - 输出已去除 ANSI 转义序列（颜色 / 光标控制）
 */
export const terminalReadTool: BuiltinTool = {
  name: 'terminal_read',
  description:
    '读取终端会话最近的输出（已去除 ANSI 颜色控制序列），用于审查命令执行结果、排查构建或测试错误。若不传 sessionId，则返回最近活跃会话的输出。',
  parameters: {
    sessionId: {
      type: 'string',
      description: '要读取的终端会话 ID。不传则返回最近活跃的会话。',
    },
    lines: {
      type: 'number',
      description: '返回最近的行数（从末尾截取），默认 100，最大 500',
      default: 100,
    },
  },
  required: [],
  requiredPermissions: [],
  async execute(args, _context): Promise<ToolExecutionResult> {
    const sessionId = (args.sessionId as string | undefined)?.trim() || ''
    const linesRaw = Number(args.lines)
    const lines =
      Number.isFinite(linesRaw) && linesRaw > 0
        ? Math.min(Math.floor(linesRaw), 500)
        : 100

    // 未指定 sessionId：尝试取最近活跃的会话
    const sessions = terminalService.listSessions()
    if (sessions.length === 0) {
      return {
        tool_call_id: '',
        content:
          '当前没有任何活动的终端会话。请先通过终端面板创建会话并执行命令，再调用本工具。',
        is_error: true,
      }
    }

    let targetId = sessionId
    if (!targetId) {
      // 按 createdAt 倒序取第一个
      const latest = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[0]
      targetId = latest.id
    }

    const exists = sessions.some((s) => s.id === targetId)
    if (!exists) {
      return {
        tool_call_id: '',
        content: `会话不存在或已退出: ${targetId}`,
        is_error: true,
      }
    }

    const output = terminalService.getRecentOutput(targetId, lines)
    if (!output.trim()) {
      return {
        tool_call_id: '',
        content: `会话 ${targetId} 暂无输出。可能刚创建还未输入命令，或所有输出已被清理。`,
        is_error: false,
      }
    }

    const meta = sessions.find((s) => s.id === targetId)
    const header = `# 终端输出（会话: ${meta?.name ?? targetId}, shell: ${meta?.shell ?? 'unknown'}）\n最近 ${lines} 行：\n\n`

    return {
      tool_call_id: '',
      content: header + output,
      is_error: false,
      metadata: {
        terminal: {
          sessionId: targetId,
          shell: meta?.shell,
          lines,
        },
      },
    }
  },
}
