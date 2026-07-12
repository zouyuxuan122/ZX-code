import type Database from 'better-sqlite3'
import { logger } from './logger.service'
import * as userProfileRepo from '../database/repositories/user-profile.repo'
import type {
  ProfileExtractionResult,
  ProfileDimension,
  UserProfileSummary,
} from '@shared/types/user-profile'

/** 可注入的 LLM 调用函数类型(便于测试) */
export type ProfileLlmCaller = (prompt: string) => Promise<string>

/** 有效的画像维度集合,用于过滤 LLM 返回的非法维度 */
const VALID_DIMENSIONS: ReadonlySet<ProfileDimension> = new Set<ProfileDimension>([
  'tech_stack',
  'coding_style',
  'work_pattern',
  'communication_preference',
  'common_tasks',
  'expertise_level',
  'language_preference',
])

/** 摘要 raw 字符串的最大长度 */
const MAX_SUMMARY_LEN = 500

/**
 * 用户画像构建服务
 * - extractProfile: 调用 LLM 从对话中抽取画像维度
 * - mergeProfile: 将抽取结果写入数据库
 * - buildProfileSummary: 生成 ≤500 字符摘要用于注入 system message
 */
export class ProfileBuilderService {
  constructor(
    private db: Database.Database,
    private llmCaller?: ProfileLlmCaller,
  ) {}

  /**
   * 调用 LLM 从对话中抽取用户画像维度
   * @param conversationText 对话文本
   * @param llmCaller 可选的 LLM 调用函数(覆盖构造函数注入的)
   * @returns 抽取结果;失败或空输入时返回 null
   */
  async extractProfile(
    conversationText: string,
    llmCaller?: ProfileLlmCaller,
  ): Promise<ProfileExtractionResult | null> {
    if (!conversationText || !conversationText.trim()) return null

    const caller = llmCaller ?? this.llmCaller
    if (!caller) return null

    try {
      const prompt = `分析以下对话,抽取用户画像维度。返回 JSON,包含 dimensions 数组。
可用维度: tech_stack, coding_style, work_pattern, communication_preference, common_tasks, expertise_level, language_preference。
每项包含: dimension(维度), value(值), confidence(置信度 0-1)。
只抽取有明确依据的信息,忽略无关内容。返回纯 JSON,不要其他文字。

对话内容:
${conversationText.slice(0, 8000)}`

      const raw = await caller(prompt)

      // 尝试提取 JSON(LLM 可能包裹在 markdown 代码块中)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0]) as { dimensions?: unknown }
      if (!parsed || !Array.isArray(parsed.dimensions)) return null

      const dimensions = parsed.dimensions
        .filter((item: any): item is { dimension: ProfileDimension; value: string; confidence: number } =>
          item &&
          typeof item.dimension === 'string' &&
          VALID_DIMENSIONS.has(item.dimension as ProfileDimension) &&
          typeof item.value === 'string' &&
          typeof item.confidence === 'number',
        )
        .map((item) => ({
          dimension: item.dimension,
          value: item.value,
          confidence: item.confidence,
        }))

      if (dimensions.length === 0) return null

      return { dimensions }
    } catch (err) {
      logger.warn(`[ProfileBuilder] 抽取失败: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * 将抽取结果合并到数据库(对每个维度调用 upsertDimension)
   */
  mergeProfile(extraction: ProfileExtractionResult): void {
    for (const item of extraction.dimensions) {
      try {
        userProfileRepo.upsertDimension(this.db, {
          dimension: item.dimension,
          value: item.value,
          confidence: item.confidence,
          source: 'auto',
        })
      } catch (err) {
        logger.warn(`[ProfileBuilder] 合并维度 ${item.dimension} 失败: ${(err as Error).message}`)
      }
    }
  }

  /**
   * 读取全部画像维度,构建 ≤500 字符的摘要
   * 用于注入 system message
   */
  buildProfileSummary(): UserProfileSummary {
    const entries = userProfileRepo.getProfile(this.db)

    const summary: UserProfileSummary = {
      techStack: [],
      codingStyle: [],
      workPattern: [],
      communicationPreference: '',
      expertiseLevel: '',
      languagePreference: '',
      raw: '',
    }

    if (entries.length === 0) return summary

    const findByDim = (dim: ProfileDimension) =>
      entries.find((e) => e.dimension === dim)

    const splitList = (value: string | undefined): string[] =>
      value
        ? value
            .split(/[,，、]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : []

    const tech = findByDim('tech_stack')
    const coding = findByDim('coding_style')
    const work = findByDim('work_pattern')
    const comm = findByDim('communication_preference')
    const expertise = findByDim('expertise_level')
    const lang = findByDim('language_preference')

    summary.techStack = splitList(tech?.value)
    summary.codingStyle = splitList(coding?.value)
    summary.workPattern = splitList(work?.value)
    summary.communicationPreference = comm?.value ?? ''
    summary.expertiseLevel = expertise?.value ?? ''
    summary.languagePreference = lang?.value ?? ''

    // 构建 raw 字符串
    const lines: string[] = []
    if (summary.techStack.length > 0) lines.push(`技术栈: ${summary.techStack.join(', ')}`)
    if (summary.codingStyle.length > 0) lines.push(`编码风格: ${summary.codingStyle.join(', ')}`)
    if (summary.workPattern.length > 0) lines.push(`工作模式: ${summary.workPattern.join(', ')}`)
    if (summary.communicationPreference) lines.push(`沟通偏好: ${summary.communicationPreference}`)
    if (summary.expertiseLevel) lines.push(`专业水平: ${summary.expertiseLevel}`)
    if (summary.languagePreference) lines.push(`语言偏好: ${summary.languagePreference}`)

    let raw = lines.join('\n')
    if (raw.length > MAX_SUMMARY_LEN) {
      raw = raw.slice(0, MAX_SUMMARY_LEN)
    }
    summary.raw = raw

    return summary
  }

  /**
   * 完整流程: extract → merge(fire-and-forget 安全,不抛异常)
   * @param conversationText 对话文本
   */
  async maybeExtractAndMerge(conversationText: string): Promise<void> {
    if (!conversationText || !conversationText.trim()) return
    if (!this.llmCaller) return

    try {
      const extraction = await this.extractProfile(conversationText)
      if (extraction && extraction.dimensions.length > 0) {
        this.mergeProfile(extraction)
      }
    } catch (err) {
      logger.warn(`[ProfileBuilder] maybeExtractAndMerge 失败: ${(err as Error).message}`)
    }
  }
}
