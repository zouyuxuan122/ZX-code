/** 记忆分区 */
export type MemoryPartition = 'project' | 'decision' | 'error' | 'preference' | 'subconscious' | 'general'

/** 记忆节点 */
export interface MemoryNode {
  id: string
  parent_id: string | null
  partition: MemoryPartition
  title: string
  content: string
  tags: string[]
  /** 相关度评分 0-1,检索时计算 */
  score?: number
  created_at: number
  updated_at: number
}

/** 创建记忆节点 DTO */
export interface CreateMemoryNodeDto {
  parent_id?: string | null
  partition: MemoryPartition
  title: string
  content: string
  tags?: string[]
}

/** 更新记忆节点 DTO */
export interface UpdateMemoryNodeDto {
  title?: string
  content?: string
  tags?: string[]
  partition?: MemoryPartition
}

/** 检索查询 */
export interface RecallQuery {
  keyword: string
  partition?: MemoryPartition
  limit?: number
}

/** 检索结果条目 */
export interface RecallResultItem {
  node: MemoryNode
  score: number
}

/** Obsidian 导出选项 */
export interface ObsidianExportOptions {
  outputPath: string
  /** 是否包含 subconscious 分区 */
  includeSubconscious?: boolean
}

/** Obsidian 导出结果 */
export interface ObsidianExportResult {
  ok: boolean
  exportedCount: number
  outputPath: string
  error?: string
}
