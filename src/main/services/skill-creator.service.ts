import { installSclExtension } from './scl.service'
import { logger } from './logger.service'

/** 技能草稿 */
export interface SkillDraft {
  name: string
  description: string
  content: string
  tags: string[]
}

/** LLM 生成器函数类型(便于测试注入) */
export type SkillDraftGenerator = (
  conversationSummary: string,
  toolCallsSummary: string,
) => Promise<SkillDraft | null>

/** 用户满意度关键词(触发技能创建) */
const SATISFACTION_KEYWORDS = ['谢谢', '搞定了', '完美', 'great', 'thanks', 'done']

/** 触发技能创建的最小工具调用次数 */
const MIN_TOOL_CALL_COUNT = 5

/**
 * 技能创建服务
 * 对话结束后评估是否值得将对话经验沉淀为可复用技能
 * generator 通过构造函数注入,便于测试与后续集成真实 LLM
 */
export class SkillCreatorService {
  constructor(private generator: SkillDraftGenerator) {}

  /**
   * 评估对话是否复杂到值得创建技能
   * @param toolCallCount 工具调用次数
   * @param userMessage 用户最后一条消息(用于检测满意关键词)
   */
  assessComplexity(toolCallCount: number, userMessage: string): boolean {
    if (toolCallCount >= MIN_TOOL_CALL_COUNT) return true
    const lower = userMessage.toLowerCase()
    return SATISFACTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
  }

  /**
   * 调用 LLM 从对话中生成技能草稿
   * @returns 技能草稿;LLM 判断不值得创建时返回 null
   */
  async generateSkillDraft(
    conversationSummary: string,
    toolCallsSummary: string,
  ): Promise<SkillDraft | null> {
    try {
      return await this.generator(conversationSummary, toolCallsSummary)
    } catch (err) {
      logger.warn(`[SkillCreator] 生成技能草稿失败: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 将技能草稿保存到 SCL 系统
   * 自动创建的技能 source='auto', enabled=false(用户手动启用)
   */
  saveSkill(draft: SkillDraft): void {
    installSclExtension({
      name: draft.name,
      description: draft.description,
      category: 'custom',
      author: 'auto',
      version: '1.0.0',
      content: draft.content,
      tags: draft.tags,
      enabled: false,
      source: 'auto',
      icon: '⚡',
    })
    logger.info(`[SkillCreator] 已保存自动技能: ${draft.name}`)
  }

  /**
   * 完整流程:评估 → 生成 → 保存
   * 异步 fire-and-forget 安全,失败时静默处理
   */
  async maybeCreateSkill(params: {
    conversationId: string
    toolCallCount: number
    userMessage: string
    conversationSummary: string
    toolCallsSummary: string
  }): Promise<void> {
    if (!this.assessComplexity(params.toolCallCount, params.userMessage)) return
    const draft = await this.generateSkillDraft(
      params.conversationSummary,
      params.toolCallsSummary,
    )
    if (draft) this.saveSkill(draft)
  }
}
