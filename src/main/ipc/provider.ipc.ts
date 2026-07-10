import { ipcMain } from 'electron'
import * as providerRepo from '../database/repositories/provider.repo'
import {
  listModelsFromProvider,
  testProviderConnection,
  getAllAvailableModels,
  clearProviderCache,
  getProviderByModel,
} from '../providers'
import { logger } from '../services/logger.service'
import { getMainWindow } from '../window'
import type { CreateProviderDto, UpdateProviderDto } from '@shared/types/model'

/** 通知渲染进程模型列表已变更（provider 增删改后调用） */
function notifyModelsChanged(): void {
  getMainWindow()?.webContents.send('provider:modelsChanged')
}

/**
 * Provider 相关 IPC handler
 */
export function registerProviderIpc(): void {
  // 列出全部 Provider
  ipcMain.handle('provider:list', () => {
    return providerRepo.findAll()
  })

  // 获取单个 Provider
  ipcMain.handle('provider:get', (_event, id: string) => {
    return providerRepo.findById(id)
  })

  // 创建 Provider
  ipcMain.handle('provider:create', (_event, data: CreateProviderDto) => {
    logger.info(`创建 Provider: ${data.name} (${data.type})`)
    const created = providerRepo.create(data)
    notifyModelsChanged()
    return created
  })

  // 更新 Provider：更新后必须清缓存，否则旧 api_key 还在缓存实例里
  ipcMain.handle('provider:update', (_event, id: string, data: UpdateProviderDto) => {
    logger.info(`更新 Provider: ${id}`)
    const updated = providerRepo.update(id, data)
    clearProviderCache(id)
    notifyModelsChanged()
    return updated
  })

  // 删除 Provider
  ipcMain.handle('provider:delete', (_event, id: string) => {
    logger.info(`删除 Provider: ${id}`)
    providerRepo.remove(id)
    clearProviderCache(id)
    notifyModelsChanged()
  })

  // 拉取 Provider 的模型列表（async，会刷新数据库）
  ipcMain.handle('provider:listModels', async (_event, providerId: string) => {
    try {
      const models = await listModelsFromProvider(providerId)
      notifyModelsChanged()
      return { ok: true, models }
    } catch (err) {
      const msg = (err as Error).message
      logger.error(`拉取模型列表失败 [provider=${providerId}]: ${msg}`, err as Error)
      return { ok: false, error: msg, models: [] }
    }
  })

  // 测试 Provider 连接：返回 { ok, error? } 让前端显示具体原因
  ipcMain.handle('provider:testConnection', async (_event, providerId: string) => {
    const result = await testProviderConnection(providerId)
    logger.info(`Provider ${providerId} 连接测试: ${result.ok ? '成功' : '失败'}`)
    return result
  })

  // 获取所有启用的模型（同步返回）
  ipcMain.handle('provider:getAllModels', () => {
    return getAllAvailableModels()
  })

  // 非流式补全：根据 model 自动选择对应 Provider，返回完整内容
  ipcMain.handle('provider:complete', async (_event, params) => {
    try {
      const provider = getProviderByModel(params.model)
      if (!provider) {
        return { ok: false, error: `未找到模型 ${params.model} 对应的可用 Provider` }
      }

      const chunks: string[] = []
      // 始终使用流式调用并在服务端聚合，避免部分 Provider（如 DeepSeek）
      // 非流式模式下返回空 content 的问题。流式路径已在主对话中验证可靠。
      for await (const chunk of provider.chat({ ...params, stream: true })) {
        if (chunk.content) {
          chunks.push(chunk.content)
        }
      }

      const content = chunks.join('')
      if (!content) {
        return { ok: false, error: '模型返回内容为空' }
      }

      return { ok: true, content }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      logger.error(`provider:complete 失败 [model=${params.model}]: ${msg}`, err as Error)
      return { ok: false, error: msg }
    }
  })

  // 更新单个模型的上下文长度
  ipcMain.handle('provider:updateModelContextLength', (_event, providerId: string, modelId: string, contextLength: number) => {
    logger.info(`更新模型上下文长度 [provider=${providerId}, model=${modelId}, ctx=${contextLength}]`)
    providerRepo.updateModelContextLength(providerId, modelId, contextLength)
    notifyModelsChanged()
  })
}
