import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import type { GoalManageToolParams } from '@shared/types/goal'
import type { GoalService } from '../../services/goal.service'

/**
 * goal_manage 工具：让 Agent 管理持久化目标与看板任务
 *
 * 支持 6 种 action：
 * - create_goal: 创建目标
 * - create_task: 创建任务
 * - update_task: 更新任务标题/描述/状态
 * - list_goals: 列出目标（可按类型过滤）
 * - list_tasks: 列出某目标下的任务
 * - complete_task: 标记任务完成
 *
 * 看板状态流转：todo → doing → done
 */
export function createGoalTool(goalService: GoalService): BuiltinTool {
  return {
    name: 'goal_manage',
    description: `管理持久化目标与看板任务。可创建/查询目标和任务，更新任务状态。
action 取值：
- create_goal: 创建目标（需提供 goal）
- create_task: 创建任务（需提供 task，含 goal_id）
- update_task: 更新任务（需提供 task_id 和 updates）
- list_goals: 列出目标（可选 goal_type 过滤）
- list_tasks: 列出任务（需提供 goal_id）
- complete_task: 标记任务完成（需提供 task_id）
看板状态：todo → doing → done`,
    parameters: {
      action: {
        type: 'string',
        enum: ['create_goal', 'create_task', 'update_task', 'list_goals', 'list_tasks', 'complete_task'],
        description: '要执行的操作',
      },
      goal: {
        type: 'object',
        description: 'create_goal 时的目标数据',
        properties: {
          type: { type: 'string', enum: ['long_term', 'session'], description: '目标类型' },
          title: { type: 'string', description: '目标标题' },
          description: { type: 'string', description: '目标描述' },
        },
      },
      task: {
        type: 'object',
        description: 'create_task 时的任务数据',
        properties: {
          goal_id: { type: 'string', description: '所属目标 ID' },
          title: { type: 'string', description: '任务标题' },
          description: { type: 'string', description: '任务描述' },
        },
      },
      task_id: { type: 'string', description: '任务 ID（update_task / complete_task 使用）' },
      goal_id: { type: 'string', description: '目标 ID（list_tasks 列出该目标下的任务）' },
      updates: {
        type: 'object',
        description: 'update_task 时的更新字段',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        },
      },
      goal_type: { type: 'string', enum: ['long_term', 'session'], description: 'list_goals 时按类型过滤' },
    },
    required: ['action'],
    requiredPermissions: [],
    async execute(args, _context): Promise<ToolExecutionResult> {
      const params = args as unknown as GoalManageToolParams
      const action = params.action

      try {
        switch (action) {
          case 'create_goal': {
            if (!params.goal) {
              return fail('create_goal 需要提供 goal 参数')
            }
            const goal = goalService.createGoal(params.goal)
            return ok(`已创建目标: ${goal.title} (id: ${goal.id}, type: ${goal.type})`)
          }
          case 'create_task': {
            if (!params.task) {
              return fail('create_task 需要提供 task 参数')
            }
            const task = goalService.createTask(params.task)
            return ok(`已创建任务: ${task.title} (id: ${task.id}, status: ${task.status})`)
          }
          case 'update_task': {
            if (!params.task_id || !params.updates) {
              return fail('update_task 需要 task_id 和 updates 参数')
            }
            const task = goalService.updateTask(params.task_id, params.updates)
            return ok(`已更新任务: ${task.title} (status: ${task.status})`)
          }
          case 'list_goals': {
            const goals = goalService.listGoals(params.goal_type)
            if (goals.length === 0) {
              return ok('暂无目标')
            }
            const lines = goals.map((g) => `- [${g.type}] ${g.title} (status: ${g.status}, id: ${g.id})`)
            return ok(`目标列表 (${goals.length}):\n${lines.join('\n')}`)
          }
          case 'list_tasks': {
            if (!params.goal_id) {
              return fail('list_tasks 需要 goal_id 参数')
            }
            const tasks = goalService.listTasks(params.goal_id)
            if (tasks.length === 0) {
              return ok('该目标下暂无任务')
            }
            const lines = tasks.map((t) => `- [${t.status}] ${t.title} (id: ${t.id})`)
            return ok(`任务列表 (${tasks.length}):\n${lines.join('\n')}`)
          }
          case 'complete_task': {
            if (!params.task_id) {
              return fail('complete_task 需要 task_id 参数')
            }
            const task = goalService.updateTaskStatus(params.task_id, 'done')
            return ok(`已完成任务: ${task.title}`)
          }
          default:
            return fail(`未知 action: ${action}`)
        }
      } catch (err) {
        return fail(`操作失败: ${(err as Error).message}`)
      }
    },
  }
}

/** 成功结果（含 ok 标志供调用方判断） */
function ok(content: string): ToolExecutionResult {
  return { tool_call_id: '', content, is_error: false, ok: true } as unknown as ToolExecutionResult
}

/** 失败结果 */
function fail(content: string): ToolExecutionResult {
  return { tool_call_id: '', content, is_error: true, ok: false } as unknown as ToolExecutionResult
}
