import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import type { CronJobAction } from '@shared/types/cron-agent'
import type { CronAgentService } from '../../services/cron-agent.service'

/**
 * cron_manage 工具：让 Agent 管理定时任务
 *
 * 支持 4 种 action：
 * - create: 创建定时任务（需提供 name, description, cronExpression）
 * - list: 列出所有定时任务
 * - delete: 删除定时任务（需提供 jobId）
 * - toggle: 切换定时任务启用状态（需提供 jobId）
 */
export function createCronManageTool(service: CronAgentService): BuiltinTool {
  return {
    name: 'cron_manage',
    description: `管理定时 Agent 任务（scheduled cron jobs）。可创建、列出、删除、切换任务。
action 取值：
- create: 创建定时任务（需提供 name, description, cronExpression，可选 allowWriteTools）
- list: 列出所有定时任务
- delete: 删除定时任务（需提供 jobId）
- toggle: 切换定时任务启用/禁用状态（需提供 jobId）
cronExpression 为标准 5 字段 cron 格式（分 时 日 月 周），如 "0 9 * * *" 表示每天 9 点。`,
    parameters: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'delete', 'toggle'],
        description: '要执行的操作',
      },
      name: {
        type: 'string',
        description: 'create 时的任务名称',
      },
      description: {
        type: 'string',
        description: 'create 时的任务描述（Agent 执行时收到的指令）',
      },
      cronExpression: {
        type: 'string',
        description: 'create 时的 cron 表达式（5 字段：分 时 日 月 周），如 "0 9 * * *"',
      },
      jobId: {
        type: 'string',
        description: 'delete / toggle 时的任务 ID',
      },
      allowWriteTools: {
        type: 'boolean',
        description: 'create 时是否允许写入工具（write_file/edit/run_command），默认 false',
      },
    },
    required: ['action'],
    requiredPermissions: [],
    async execute(args, _context): Promise<ToolExecutionResult> {
      const action = args.action as CronJobAction

      try {
        switch (action) {
          case 'create': {
            const name = args.name as string | undefined
            const description = args.description as string | undefined
            const cronExpression = args.cronExpression as string | undefined
            if (!name) {
              return fail('create 需要提供 name 参数')
            }
            if (!description) {
              return fail('create 需要提供 description 参数')
            }
            if (!cronExpression) {
              return fail('create 需要提供 cronExpression 参数')
            }
            const job = service.createJob({
              name,
              description,
              cronExpression,
              ...(typeof args.allowWriteTools === 'boolean'
                ? { allowWriteTools: args.allowWriteTools }
                : {}),
            })
            return ok(`已创建定时任务: ${job.name} (id: ${job.id}, cron: ${job.cronExpression}, allowWriteTools: ${job.allowWriteTools})`)
          }
          case 'list': {
            const jobs = service.listJobs()
            if (jobs.length === 0) {
              return ok('暂无定时任务')
            }
            const lines = jobs.map((j) =>
              `- [${j.enabled ? '启用' : '禁用'}] ${j.name} (id: ${j.id}, cron: ${j.cronExpression}, allowWriteTools: ${j.allowWriteTools}, runCount: ${j.runCount})`,
            )
            return ok(`定时任务列表 (${jobs.length}):\n${lines.join('\n')}`)
          }
          case 'delete': {
            const jobId = args.jobId as string | undefined
            if (!jobId) {
              return fail('delete 需要提供 jobId 参数')
            }
            service.deleteJob(jobId)
            return ok(`已删除定时任务: ${jobId}`)
          }
          case 'toggle': {
            const jobId = args.jobId as string | undefined
            if (!jobId) {
              return fail('toggle 需要提供 jobId 参数')
            }
            service.toggleJob(jobId)
            return ok(`已切换定时任务状态: ${jobId}`)
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

/** 成功结果 */
function ok(content: string): ToolExecutionResult {
  return { tool_call_id: '', content, is_error: false }
}

/** 失败结果 */
function fail(content: string): ToolExecutionResult {
  return { tool_call_id: '', content, is_error: true }
}
