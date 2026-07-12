import type Database from 'better-sqlite3'
import { logger } from './logger.service'
import * as skillVersionRepo from '../database/repositories/skill-version.repo'
import * as evolutionRunRepo from '../database/repositories/evolution-run.repo'
import * as traceRepo from '../database/repositories/trace.repo'
import * as sclService from './scl.service'
import type {
  SkillVersion,
  EvolutionRun,
  EvolutionVariant,
  ScoreBreakdown,
  EvolutionRunParams,
  EvolutionRunResult,
} from '@shared/types/skill-evolution'
import type { SclExtension } from '@shared/types/scl'

/** 可注入的 LLM 调用函数类型（便于测试） */
export type LlmCaller = (prompt: string) => Promise<string>

/** 评估数据集条目 */
export interface EvalEntry {
  input: string
  expectedBehavior: string
  traceSummary: string
  success: boolean
}

/** 技能大小上限：15KB */
const SKILL_SIZE_LIMIT = 15360

/** 提升阈值：变体分数必须 ≥ 基线 × 1.1 */
const IMPROVEMENT_THRESHOLD = 1.1

/** 将数值限制在 [0, 1] 范围内 */
function clamp01(value: unknown): number {
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/** 默认低分（LLM 解析失败时使用） */
const DEFAULT_LOW_SCORE: ScoreBreakdown = {
  adherence: 0.3,
  correctness: 0.3,
  conciseness: 0.3,
  overall: 0.3,
}

/**
 * 技能进化服务
 *
 * 基于 GEPA（Reflective Evolution）理念：
 * 1. 从执行轨迹构建评估数据集
 * 2. 用 LLM-as-Judge 对技能变体评分
 * 3. 生成改进变体并进行语义保留检查
 * 4. 仅在提升 ≥10% 时部署新版本
 */
export class SkillEvolutionService {
  constructor(
    private db: Database.Database,
    private llmCaller?: LlmCaller,
  ) {}

  // --------------------------------------------------------------------------
  // 技能内容加载
  // --------------------------------------------------------------------------

  /** 从 SCL 加载技能内容（按 id 匹配） */
  private loadSkill(skillId: string): SclExtension | null {
    const extensions = sclService.listSclExtensions()
    return extensions.find((e) => e.id === skillId) ?? null
  }

  // --------------------------------------------------------------------------
  // 1. 构建评估数据集
  // --------------------------------------------------------------------------

  /**
   * 从执行轨迹构建评估数据集。
   * 若无轨迹，则通过 LLM 生成合成评估条目。
   */
  async buildEvalDataset(skillId: string): Promise<EvalEntry[]> {
    const traces = traceRepo.getTracesByTool(this.db, skillId)

    if (traces.length > 0) {
      return traces.map((trace) => {
        const toolCalls = trace.entries.flatMap((e) => e.toolCalls ?? [])
        const input =
          toolCalls.length > 0
            ? toolCalls.map((tc) => tc.argsSummary).join('; ')
            : '无工具调用记录'
        const traceSummary =
          toolCalls.length > 0
            ? toolCalls
                .map((tc) => `${tc.toolName}(${tc.success ? '成功' : '失败'})`)
                .join(', ')
            : '无轨迹'
        return {
          input,
          expectedBehavior: '正确遵循技能流程完成任务',
          traceSummary,
          success: trace.failureCount === 0,
        }
      })
    }

    // 无轨迹：通过 LLM 生成合成评估条目
    if (!this.llmCaller) return []

    const skill = this.loadSkill(skillId)
    if (!skill) {
      logger.warn(`[SkillEvolution] 技能不存在: ${skillId}`)
      return []
    }

    const prompt = `为以下技能生成 5 个测试任务。返回 JSON 数组，每项包含 input(任务描述) 和 expectedBehavior(期望行为)。
只返回纯 JSON 数组，不要其他文字。

技能内容:
${skill.content}`

    try {
      const raw = await this.llmCaller(prompt)
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        input: string
        expectedBehavior: string
      }>
      return parsed.map((item) => ({
        input: String(item.input),
        expectedBehavior: String(item.expectedBehavior),
        traceSummary: '合成测试任务',
        success: true,
      }))
    } catch (err) {
      logger.warn(`[SkillEvolution] 合成评估条目生成失败: ${(err as Error).message}`)
      return []
    }
  }

  // --------------------------------------------------------------------------
  // 2. LLM-as-Judge 评分
  // --------------------------------------------------------------------------

  /** 用 LLM-as-Judge 对技能在指定评估条目上的表现评分 */
  async scoreWithJudge(
    skillContent: string,
    evalEntry: EvalEntry,
  ): Promise<ScoreBreakdown> {
    if (!this.llmCaller) return { ...DEFAULT_LOW_SCORE }

    const prompt = `你是一个技能评审专家。请对以下技能在执行指定任务时的表现进行评分。

技能内容:
${skillContent}

任务输入:
${evalEntry.input}

期望行为:
${evalEntry.expectedBehavior}

执行轨迹摘要:
${evalEntry.traceSummary}

请从以下三个维度评分（0-1 浮点数），并返回 JSON：
{"adherence": 0-1, "correctness": 0-1, "conciseness": 0-1, "overall": 0-1}

- adherence: 是否遵循了技能定义的流程
- correctness: 输出结果是否正确
- conciseness: 是否简洁高效（在 token 预算内）

只返回 JSON，不要其他文字。`

    try {
      const raw = await this.llmCaller(prompt)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { ...DEFAULT_LOW_SCORE }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      return {
        adherence: clamp01(parsed.adherence),
        correctness: clamp01(parsed.correctness),
        conciseness: clamp01(parsed.conciseness),
        overall: clamp01(parsed.overall),
      }
    } catch (err) {
      logger.warn(`[SkillEvolution] 评分失败: ${(err as Error).message}`)
      return { ...DEFAULT_LOW_SCORE }
    }
  }

  // --------------------------------------------------------------------------
  // 3. 生成改进变体
  // --------------------------------------------------------------------------

  /** 基于失败分析生成 3 个改进变体 */
  async generateVariants(
    skillContent: string,
    failureTraces: EvalEntry[],
  ): Promise<string[]> {
    if (!this.llmCaller) return []

    const failureSummary =
      failureTraces.length > 0
        ? failureTraces
            .map((f) => `- 输入: ${f.input}\n  轨迹: ${f.traceSummary}`)
            .join('\n')
        : '无明确失败案例，请基于通用最佳实践改进。'

    const prompt = `你是一个技能优化专家。分析以下失败案例，生成 3 个改进版本的技能变体。

原始技能:
${skillContent}

失败案例分析:
${failureSummary}

请生成 3 个改进的技能变体。可以用 --- 分隔各变体，或返回 JSON 字符串数组。
每个变体应针对失败案例进行改进，保持技能的核心目的不变。`

    try {
      const raw = await this.llmCaller(prompt)

      // 优先尝试 JSON 数组格式
      const jsonArrayMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonArrayMatch) {
        try {
          const parsed = JSON.parse(jsonArrayMatch[0])
          if (
            Array.isArray(parsed) &&
            parsed.every((v) => typeof v === 'string')
          ) {
            return parsed
              .filter((v) => v.length <= SKILL_SIZE_LIMIT)
              .map((v) => v.trim())
          }
        } catch {
          // 非有效 JSON 数组，回退到 --- 分隔解析
        }
      }

      // 按 --- 分隔解析
      const variants = raw
        .split(/\n?---\n?/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v.length <= SKILL_SIZE_LIMIT)

      return variants
    } catch (err) {
      logger.warn(`[SkillEvolution] 变体生成失败: ${(err as Error).message}`)
      return []
    }
  }

  // --------------------------------------------------------------------------
  // 4. 语义保留检查
  // --------------------------------------------------------------------------

  /** 检查变体是否保留了原始技能的语义目的 */
  async checkSemanticPreservation(
    original: string,
    variant: string,
  ): Promise<{ preserved: boolean; reason: string }> {
    if (!this.llmCaller) {
      return { preserved: false, reason: '无 LLM 调用器' }
    }

    const prompt = `检查以下候选内容是否保留了原始技能的语义目的。

原始技能:
${original}

候选内容:
${variant}

请返回 JSON: {"preserved": true/false, "reason": "..."}
- preserved: 候选内容是否保留了原始技能的核心目的和功能
- reason: 判断理由

只返回 JSON，不要其他文字。`

    try {
      const raw = await this.llmCaller(prompt)
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { preserved: false, reason: '无法解析 LLM 响应' }
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      return {
        preserved: Boolean(parsed.preserved),
        reason: String(parsed.reason ?? ''),
      }
    } catch (err) {
      logger.warn(`[SkillEvolution] 语义检查失败: ${(err as Error).message}`)
      return { preserved: false, reason: 'LLM 响应解析失败' }
    }
  }

  // --------------------------------------------------------------------------
  // 5. 完整进化流程
  // --------------------------------------------------------------------------

  /** 运行完整进化流程 */
  async runEvolution(params: EvolutionRunParams): Promise<EvolutionRunResult> {
    const { skillId } = params

    // 创建进化运行记录
    const runId = evolutionRunRepo.insertRun(this.db, { skillId })

    try {
      // 1. 加载技能内容
      const skill = this.loadSkill(skillId)
      if (!skill) {
        throw new Error(`技能不存在: ${skillId}`)
      }
      const originalContent = skill.content

      // 2. 构建评估数据集
      const evalDataset = await this.buildEvalDataset(skillId)

      // 3. 评分基线
      let baselineScore = 0
      if (evalDataset.length > 0) {
        const baselineScores: ScoreBreakdown[] = []
        for (const entry of evalDataset) {
          baselineScores.push(
            await this.scoreWithJudge(originalContent, entry),
          )
        }
        baselineScore =
          baselineScores.reduce((sum, s) => sum + s.overall, 0) /
          baselineScores.length
      }

      // 4. 获取失败案例用于变体生成
      const failureEntries = evalDataset.filter((e) => !e.success)

      // 5. 生成变体
      const variantContents = await this.generateVariants(
        originalContent,
        failureEntries,
      )

      // 6. 评估每个变体
      const allVariants: EvolutionVariant[] = []
      let bestVariant: EvolutionVariant | null = null

      for (let i = 0; i < variantContents.length; i++) {
        const variantContent = variantContents[i]
        const variantId = `variant-${i}-${Date.now()}`

        // 语义保留检查
        const preservation = await this.checkSemanticPreservation(
          originalContent,
          variantContent,
        )

        const variant: EvolutionVariant = {
          id: variantId,
          content: variantContent,
          score: null,
          scoreBreakdown: null,
          semanticPreserved: preservation.preserved,
          semanticDeviationReason: preservation.preserved
            ? null
            : preservation.reason,
          isWinner: false,
        }

        // 仅对通过语义检查的变体评分
        if (preservation.preserved && evalDataset.length > 0) {
          const variantScores: ScoreBreakdown[] = []
          for (const entry of evalDataset) {
            variantScores.push(
              await this.scoreWithJudge(variantContent, entry),
            )
          }
          const variantScore =
            variantScores.reduce((sum, s) => sum + s.overall, 0) /
            variantScores.length

          variant.score = variantScore
          variant.scoreBreakdown = {
            adherence:
              variantScores.reduce((s, x) => s + x.adherence, 0) /
              variantScores.length,
            correctness:
              variantScores.reduce((s, x) => s + x.correctness, 0) /
              variantScores.length,
            conciseness:
              variantScores.reduce((s, x) => s + x.conciseness, 0) /
              variantScores.length,
            overall: variantScore,
          }

          // 跟踪最佳变体
          if (
            !bestVariant ||
            (bestVariant.score ?? 0) < variantScore
          ) {
            bestVariant = variant
          }
        }

        allVariants.push(variant)
      }

      // 7. 检查提升阈值
      const improved =
        bestVariant !== null &&
        bestVariant.score !== null &&
        bestVariant.score >= baselineScore * IMPROVEMENT_THRESHOLD

      // 8. 部署（若达标）
      if (improved && bestVariant) {
        // 保存旧版本（用于回滚）
        skillVersionRepo.insertVersion(this.db, {
          skillId,
          content: originalContent,
          createdReason: '进化前备份',
        })

        // 更新 SCL 技能内容
        sclService.updateSclExtension(skillId, {
          content: bestVariant.content,
        })

        // 保存新版本并设为当前
        const newVersionId = skillVersionRepo.insertVersion(this.db, {
          skillId,
          content: bestVariant.content,
          score: bestVariant.score,
          scoreBreakdown: bestVariant.scoreBreakdown,
          createdReason: '进化胜出版本',
        })
        skillVersionRepo.setCurrentVersion(this.db, newVersionId)

        bestVariant.isWinner = true
      }

      // 9. 更新运行记录
      evolutionRunRepo.updateRunResults(this.db, runId, {
        baselineScore,
        bestScore: bestVariant?.score ?? null,
        bestVariantId: bestVariant?.id ?? null,
        variantCount: allVariants.length,
      })

      const summary = improved
        ? `基线 ${baselineScore.toFixed(2)} → 最佳 ${bestVariant!.score!.toFixed(2)}，已部署`
        : bestVariant
          ? `基线 ${baselineScore.toFixed(2)}，最佳 ${bestVariant.score!.toFixed(2)}，未达提升阈值`
          : `基线 ${baselineScore.toFixed(2)}，无变体通过语义检查`

      evolutionRunRepo.completeRun(this.db, runId, summary)

      // 10. 返回结果
      const run = evolutionRunRepo.getRun(this.db, runId)!

      return {
        run,
        baselineScore,
        bestVariant,
        allVariants,
        improved,
      }
    } catch (err) {
      evolutionRunRepo.updateRunStatus(this.db, runId, 'failed')
      logger.error(
        `[SkillEvolution] 进化运行失败: ${(err as Error).message}`,
        err as Error,
      )
      throw err
    }
  }

  // --------------------------------------------------------------------------
  // 6. 回滚
  // --------------------------------------------------------------------------

  /** 回滚到指定版本 */
  rollbackEvolution(skillId: string, versionId: string): boolean {
    const rolled = skillVersionRepo.rollbackVersion(
      this.db,
      skillId,
      versionId,
    )
    if (!rolled) return false

    // 同步更新 SCL 技能内容为回滚版本
    try {
      sclService.updateSclExtension(skillId, { content: rolled.content })
    } catch (err) {
      logger.warn(
        `[SkillEvolution] 回滚后更新 SCL 失败: ${(err as Error).message}`,
      )
    }

    return true
  }
}
