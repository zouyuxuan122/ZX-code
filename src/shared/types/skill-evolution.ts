/** 技能版本 */
export interface SkillVersion {
  id: string
  skillId: string
  version: number
  content: string
  score: number | null
  scoreBreakdown: ScoreBreakdown | null
  createdReason: string | null
  isCurrent: boolean
  createdAt: number
}

/** 评分明细 */
export interface ScoreBreakdown {
  adherence: number
  correctness: number
  conciseness: number
  overall: number
  notes?: string
}

/** 进化运行 */
export interface EvolutionRun {
  id: string
  skillId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  iterations: number
  baselineScore: number | null
  bestScore: number | null
  bestVariantId: string | null
  variantCount: number
  summary: string | null
  createdAt: number
  completedAt: number | null
}

/** 进化变体 */
export interface EvolutionVariant {
  id: string
  content: string
  score: number | null
  scoreBreakdown: ScoreBreakdown | null
  semanticPreserved: boolean
  semanticDeviationReason: string | null
  isWinner: boolean
}

/** 进化运行请求参数 */
export interface EvolutionRunParams {
  skillId: string
  iterations?: number
  evalSource?: 'synthetic' | 'trace' | 'mixed'
  /** LLM provider ID（用于构造默认 llmCaller） */
  providerId?: string
  /** LLM 模型 ID（用于构造默认 llmCaller） */
  model?: string
}

/** 进化运行结果 */
export interface EvolutionRunResult {
  run: EvolutionRun
  baselineScore: number
  bestVariant: EvolutionVariant | null
  allVariants: EvolutionVariant[]
  improved: boolean
}
