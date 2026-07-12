import type { BuiltinTool, ToolExecutionResult } from '@shared/types/tool'
import type { SkillCreatorService } from '../../services/skill-creator.service'

/**
 * skill_create 工具：让 Agent 从当前任务经验中创建可复用技能
 *
 * Agent 在完成复杂任务后，可以主动调用此工具将经验沉淀为技能。
 * 创建的技能 source='auto', enabled=false（用户需手动启用）。
 */
export function createSkillCreateTool(skillCreatorService: SkillCreatorService): BuiltinTool {
  return {
    name: 'skill_create',
    description:
      'Create a new reusable skill from the current task experience. The skill will be saved with source=auto and disabled by default (user can enable it manually).',
    parameters: {
      name: {
        type: 'string',
        description: '技能名称（简短、可读）',
      },
      description: {
        type: 'string',
        description: '技能描述（一句话说明适用场景）',
      },
      content: {
        type: 'string',
        description: '技能内容（Markdown 格式的指令文本，会注入到系统提示词中）',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '搜索标签（可选）',
      },
    },
    required: ['name', 'description', 'content'],
    requiredPermissions: [],
    async execute(args): Promise<ToolExecutionResult> {
      const name = args.name as string | undefined
      const description = args.description as string | undefined
      const content = args.content as string | undefined
      const tags = (args.tags as string[] | undefined) ?? []

      if (!name || !description || !content) {
        return {
          tool_call_id: '',
          content: '缺少必填参数: name, description, content 均为必填',
          is_error: true,
        }
      }

      try {
        skillCreatorService.saveSkill({ name, description, content, tags })
        return {
          tool_call_id: '',
          content: `已创建技能: ${name}（默认未启用，可在技能管理中开启）`,
          is_error: false,
        }
      } catch (err) {
        return {
          tool_call_id: '',
          content: `创建技能失败: ${(err as Error).message}`,
          is_error: true,
        }
      }
    },
  }
}
