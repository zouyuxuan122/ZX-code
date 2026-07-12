import { getDb } from '../database'
import * as traceRepo from '../database/repositories/trace.repo'
import { logger } from './logger.service'
import type { AgentTrace, TraceQuery, TraceStats } from '@shared/types/trace'

/**
 * Agent 轨迹服务
 *
 * 负责：
 * 1. 异步记录 Agent 执行轨迹（fire-and-forget，不阻塞主流程，永不抛出）
 * 2. 查询轨迹（支持按会话/工具/失败等过滤）
 * 3. 提供聚合统计
 */
export class TraceService {
  /**
   * 异步记录一条 Agent 轨迹
   *
   * 设计为 fire-and-forget：调用方无需等待写入完成，也无需处理错误。
   * 内部捕获所有异常并记录 warning，绝不向上抛出。
   */
  async recordTrace(trace: AgentTrace): Promise<void> {
    try {
      const db = getDb()
      traceRepo.insertTrace(db, trace)
    } catch (err) {
      logger.warn(`Failed to record agent trace: ${(err as Error).message || String(err)}`)
    }
  }

  /** 按条件查询轨迹 */
  queryTraces(query: TraceQuery): AgentTrace[] {
    const db = getDb()
    return traceRepo.queryTraces(db, query)
  }

  /** 获取轨迹聚合统计 */
  getTraceStats(): TraceStats {
    const db = getDb()
    return traceRepo.getTraceStats(db)
  }
}

// 单例
let instance: TraceService | null = null
export function getTraceService(): TraceService {
  if (!instance) instance = new TraceService()
  return instance
}

/** 重置单例（仅供测试使用） */
export function resetTraceService(): void {
  instance = null
}
