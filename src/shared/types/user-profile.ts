/** 用户画像维度 */
export type ProfileDimension =
  | 'tech_stack'
  | 'coding_style'
  | 'work_pattern'
  | 'communication_preference'
  | 'common_tasks'
  | 'expertise_level'
  | 'language_preference'

/** 用户画像条目 */
export interface UserProfileEntry {
  id: string
  dimension: ProfileDimension
  value: string
  confidence: number
  source: 'auto' | 'manual'
  updatedAt: number
  createdAt: number
}

/** 用户画像摘要(用于注入 system message) */
export interface UserProfileSummary {
  techStack: string[]
  codingStyle: string[]
  workPattern: string[]
  communicationPreference: string
  expertiseLevel: string
  languagePreference: string
  raw: string
}

/** 画像抽取结果(LLM 返回) */
export interface ProfileExtractionResult {
  dimensions: Array<{
    dimension: ProfileDimension
    value: string
    confidence: number
  }>
}
