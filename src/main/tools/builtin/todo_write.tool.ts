import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'

/**
 * todo_write 工具：让 AI 维护任务清单
 *
 * 状态机：
 * - pending: 未开始
 * - in_progress: 正在进行（同一时间只允许一个）
 * - completed: 已完成
 * - cancelled: 已取消
 *
 * 工具返回 todos 列表到 metadata.todos，前端用于渲染 TodoListPanel
 */
export const todoWriteTool: BuiltinTool = {
  name: 'todo_write',
  description: `创建或更新任务清单。当任务需要 3+ 个独立步骤时使用此工具。
状态规则：
- pending: 未开始
- in_progress: 正在进行（同一时间仅允许一个 in_progress）
- completed: 已完成（仅在实际工作完成后标记）
- cancelled: 不再需要
使用时机：任务需要 3+ 个独立步骤、用户提供多个任务、需要规划时。
不要在单一简单任务或纯信息请求时使用。`,
  parameters: {
    todos: {
      type: 'array',
      description: '完整的 todos 列表（会替换现有列表）',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '唯一标识' },
          content: { type: 'string', description: '任务描述' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            description: '任务状态',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: '优先级',
          },
        },
        required: ['id', 'content', 'status'],
      },
    },
  },
  required: ['todos'],
  requiredPermissions: [],
  async execute(args): Promise<ToolExecutionResult> {
    const todos = args.todos as Array<{
      id: string
      content: string
      status: string
      priority?: string
    }>

    if (!Array.isArray(todos)) {
      return {
        tool_call_id: '',
        content: '参数 todos 必须为数组',
        is_error: true,
      }
    }

    // 校验：同一时间只允许一个 in_progress
    const inProgressCount = todos.filter((t) => t.status === 'in_progress').length
    if (inProgressCount > 1) {
      return {
        tool_call_id: '',
        content: '同一时间只允许一个 in_progress 任务',
        is_error: true,
      }
    }

    // 统计
    const stats = {
      total: todos.length,
      pending: todos.filter((t) => t.status === 'pending').length,
      in_progress: todos.filter((t) => t.status === 'in_progress').length,
      completed: todos.filter((t) => t.status === 'completed').length,
      cancelled: todos.filter((t) => t.status === 'cancelled').length,
    }

    const normalizedTodos = todos.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status as 'pending' | 'in_progress' | 'completed' | 'cancelled',
      priority: (t.priority || 'medium') as 'high' | 'medium' | 'low',
    }))

    return {
      tool_call_id: '',
      content: `任务清单已更新: ${stats.completed}/${stats.total} 完成, ${stats.in_progress} 进行中, ${stats.pending} 待开始`,
      is_error: false,
      metadata: {
        todos: normalizedTodos,
      },
    }
  },
}
