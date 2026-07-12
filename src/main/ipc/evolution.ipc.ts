import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SkillEvolutionService, type LlmCaller } from '../services/skill-evolution.service'
import { getDb } from '../database'
import { chatWithProvider } from '../providers'
import * as evolutionRunRepo from '../database/repositories/evolution-run.repo'
import * as skillVersionRepo from '../database/repositories/skill-version.repo'
import type { EvolutionRunParams } from '@shared/types/skill-evolution'
import type { ChatParams, ChatChunk } from '@shared/types/model'

/** 进化对比结果 */
interface EvolutionCompareResult {
  run: ReturnType<typeof evolutionRunRepo.getRun>
  versions: ReturnType<typeof skillVersionRepo.getVersions>
}

/**
 * 从 providerId/model 构造默认的 LLM 调用函数（流式累积为完整字符串）
 * 与 engine.ts 中 triggerProfileExtraction 的 llmCaller 构造方式一致
 */
function createDefaultLlmCaller(providerId: string, model: string): LlmCaller {
  return async (prompt: string): Promise<string> => {
    const chatParams: ChatParams = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }
    let fullContent = ''
    for await (const chunk of chatWithProvider(providerId, chatParams) as AsyncGenerator<ChatChunk>) {
      if (chunk.content) fullContent += chunk.content
    }
    return fullContent
  }
}

/**
 * 技能进化 IPC handler
 *
 * 注册 4 个通道：
 * - evolution:run        — 运行完整进化流程
 * - evolution:history    — 查询指定技能的进化运行历史
 * - evolution:rollback   — 回滚到指定版本
 * - evolution:compare    — 返回基线与最佳变体的对比数据
 *
 * @param service 可选注入，用于测试；默认从全局 DB 构造
 * @param db      可选注入，用于测试；默认使用全局 getDb()
 */
export function registerEvolutionIpc(
  service?: SkillEvolutionService,
  db?: Database.Database,
): void {
  const database = db ?? getDb()
  const svc = service ?? new SkillEvolutionService(database)

  // --- 运行进化 ---
  ipcMain.handle('evolution:run', async (_event, params: EvolutionRunParams) => {
    // 当未注入 service 且 params 携带 providerId/model 时，
    // 构造默认 llmCaller 以驱动 LLM 评分/生成/语义检查
    if (!service && params.providerId && params.model) {
      const llmCaller = createDefaultLlmCaller(params.providerId, params.model)
      const runSvc = new SkillEvolutionService(database, llmCaller)
      return runSvc.runEvolution(params)
    }
    return svc.runEvolution(params)
  })

  // --- 查询进化历史 ---
  ipcMain.handle('evolution:history', (_event, skillId: string) => {
    return evolutionRunRepo.getRuns(database, skillId)
  })

  // --- 回滚到指定版本 ---
  ipcMain.handle(
    'evolution:rollback',
    (_event, skillId: string, versionId: string) => {
      return svc.rollbackEvolution(skillId, versionId)
    },
  )

  // --- 基线 vs 最佳变体对比 ---
  ipcMain.handle('evolution:compare', (_event, runId: string): EvolutionCompareResult | null => {
    const run = evolutionRunRepo.getRun(database, runId)
    if (!run) return null

    const versions = skillVersionRepo.getVersions(database, run.skillId)
    return { run, versions }
  })
}
