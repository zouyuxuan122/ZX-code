import type { BuiltinTool, ToolExecutionResult, SubAgentParams } from '@shared/types/tool'

/**
 * task 工具：派发子智能体执行独立任务
 *
 * 使用场景：
 * - 复杂任务拆分：主 Agent 将子任务委派给子智能体并行/串行处理
 * - 信息收集：派子智能体去研究、搜索、阅读代码
 * - 隔离执行：子智能体在受限工具集下工作，避免影响主对话上下文
 *
 * 子智能体特点：
 * - 拥有独立的上下文（不影响主对话历史）
 * - 仅能使用只读工具（read_file, list_files, search_files, grep）
 * - 执行完毕后返回最终回复给主 Agent
 * - 主 Agent 可通过 metadata.task 看到执行状态与结果
 */
export const taskTool: BuiltinTool = {
  name: 'task',
  description: `派发一个子智能体执行独立子任务。子智能体拥有独立的上下文，只能使用只读工具（read_file, list_files, search_files, grep）。
适用场景：复杂任务拆分、信息收集、代码研究、隔离执行。
参数：
- description: 任务简短描述（≤60字符，用于任务卡片显示）
- prompt: 子任务的完整指令（包含目标、约束、期望输出格式）
- subagentType: 子智能体类型（general 通用 / research 研究 / coder 编码），默认 general
返回：子智能体的最终回复文本。
注意：子智能体无法修改文件，仅能读取和搜索。如需修改文件，请在主对话中使用 write_file。`,
  parameters: {
    description: {
      type: 'string',
      description: '任务简短描述（≤60字符）',
    },
    prompt: {
      type: 'string',
      description: '子任务的完整指令',
    },
    subagentType: {
      type: 'string',
      description: '子智能体类型：general / research / coder',
      default: 'general',
    },
  },
  required: ['description', 'prompt'],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const description = args.description as string
    const prompt = args.prompt as string
    const subagentType = (args.subagentType as string) || 'general'

    if (!description || typeof description !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 description 必须为非空字符串',
        is_error: true,
      }
    }
    if (!prompt || typeof prompt !== 'string') {
      return {
        tool_call_id: '',
        content: '参数 prompt 必须为非空字符串',
        is_error: true,
      }
    }

    if (!context.spawnSubAgent) {
      return {
        tool_call_id: '',
        content: '当前环境不支持子智能体派发',
        is_error: true,
      }
    }

    const params: SubAgentParams = {
      description,
      prompt,
      subagentType,
      workspacePath: context.workspacePath,
      projectId: context.projectId,
      parentConversationId: context.conversationId,
    }

    try {
      const result = await context.spawnSubAgent(params)
      return {
        tool_call_id: '',
        content:
          result.state === 'completed'
            ? result.content
            : `子智能体执行失败: ${result.error || '未知错误'}`,
        is_error: result.state !== 'completed',
        metadata: {
          task: {
            taskId: `subagent_${Date.now()}`,
            subagentType,
            description,
            state: result.state,
            result: result.content,
          },
        },
      }
    } catch (err) {
      return {
        tool_call_id: '',
        content: `子智能体派发异常: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}
