/** 同步数据源类型 */
export type SyncSourceType = 'github' | 'rss' | 'webhook'

/** 同步数据源配置 */
export interface SyncSource {
  id: string
  type: SyncSourceType
  name: string
  /** GitHub: repo owner/repo; RSS: feed url; webhook: endpoint url */
  endpoint: string
  /** 认证 token(GitHub PAT 等) */
  token: string
  enabled: boolean
  /** 上次同步时间戳 */
  last_synced_at: number | null
  /** 上次同步结果摘要 */
  last_sync_result: string | null
  created_at: number
  updated_at: number
}

/** 创建同步源 DTO */
export interface CreateSyncSourceDto {
  type: SyncSourceType
  name: string
  endpoint: string
  token?: string
  enabled?: boolean
}

/** 更新同步源 DTO */
export interface UpdateSyncSourceDto {
  name?: string
  endpoint?: string
  token?: string
  enabled?: boolean
}

/** 同步运行结果 */
export interface SyncRunResult {
  ok: boolean
  sourceId: string
  sourceName: string
  fetchedCount: number
  writtenCount: number
  error?: string
  durationMs: number
}

/** 完整同步运行结果(所有源) */
export interface FullSyncResult {
  ok: boolean
  results: SyncRunResult[]
  totalFetched: number
  totalWritten: number
  durationMs: number
}
