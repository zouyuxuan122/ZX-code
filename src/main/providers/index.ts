import { BaseProvider } from './base'
import { OpenAIProvider } from './openai.provider'
import { AnthropicProvider } from './anthropic.provider'
import { GeminiProvider } from './gemini.provider'
import { OllamaProvider } from './ollama.provider'
import { WebChatProvider } from './webchat.provider'
import * as providerRepo from '../database/repositories/provider.repo'
import type { ProviderConfig, ModelInfo, ChatParams, ChatChunk, ProviderType } from '@shared/types/model'
import { logger } from '../services/logger.service'

const providers = new Map<string, BaseProvider>()

function createProvider(config: ProviderConfig): BaseProvider {
  switch (config.type as ProviderType) {
    case 'openai':
    case 'custom':
      return new OpenAIProvider(config)
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    case 'webchat':
      return new WebChatProvider(config)
    default:
      return new OpenAIProvider(config)
  }
}

export function getProvider(providerId: string): BaseProvider | null {
  // 尝试从缓存获取
  if (providers.has(providerId)) {
    return providers.get(providerId)!
  }

  // 从数据库加载（对话场景要求 enabled）
  const config = providerRepo.findById(providerId)
  if (!config || !config.enabled) {
    return null
  }

  const provider = createProvider(config)
  providers.set(providerId, provider)
  return provider
}

export function getProviderByModel(modelId: string): BaseProvider | null {
  const allProviders = providerRepo.findEnabled()
  for (const config of allProviders) {
    const models = providerRepo.findModels(config.id)
    if (models.some(m => m.id === modelId || m.name === modelId)) {
      return getProvider(config.id)
    }
  }
  return null
}

export function clearProviderCache(providerId?: string): void {
  if (providerId) {
    providers.delete(providerId)
  } else {
    providers.clear()
  }
}

/**
 * 拉取模型列表：不走 getProvider（绕过 enabled 检查和缓存），
 * 直接读最新 config 创建临时实例，确保用户刚填的 api_key 生效。
 */
export async function listModelsFromProvider(providerId: string): Promise<ModelInfo[]> {
  const config = providerRepo.findById(providerId)
  if (!config) {
    throw new Error('Provider 不存在')
  }

  // 用最新 config 创建临时实例（不缓存，避免旧 key 残留）
  const provider = createProvider(config)

  try {
    const models = await provider.listModels()

    // 保存到数据库
    providerRepo.removeModels(providerId)
    for (const model of models) {
      providerRepo.addModel({
        provider_id: providerId,
        model_id: model.id,
        name: model.name,
        context_length: model.context_length,
        supports_tools: model.supports_tools,
        supports_vision: model.supports_vision,
        description: model.description,
      })
    }

    // 拉取成功后清缓存，让下次对话用新 config
    clearProviderCache(providerId)

    logger.info(`从 Provider ${providerId} 拉取 ${models.length} 个模型`)
    return models
  } catch (err) {
    logger.error(`拉取模型列表失败: ${(err as Error).message}`, err as Error)
    throw err
  }
}

/** 测试连接结果：带回具体错误信息，方便前端展示 */
export interface ConnectionTestResult {
  ok: boolean
  error?: string
  modelCount?: number
}

/**
 * 测试连接：绕过 enabled 检查和缓存，直接用最新 config。
 * 返回 { ok, error? } 让前端显示具体失败原因。
 */
export async function testProviderConnection(providerId: string): Promise<ConnectionTestResult> {
  const config = providerRepo.findById(providerId)
  if (!config) {
    return { ok: false, error: 'Provider 不存在' }
  }

  const provider = createProvider(config)
  try {
    const models = await provider.listModels()
    return { ok: true, modelCount: models.length }
  } catch (err) {
    const msg = (err as Error).message
    logger.error(`Provider 连接测试失败 [provider=${providerId}]: ${msg}`, err as Error)
    return { ok: false, error: msg }
  }
}

export async function* chatWithProvider(
  providerId: string,
  params: ChatParams
): AsyncGenerator<ChatChunk> {
  const provider = getProvider(providerId)
  if (!provider) {
    throw new Error('Provider not found or not enabled')
  }
  yield* provider.chat(params)
}

// 获取所有可用模型
export function getAllAvailableModels(): ModelInfo[] {
  const providers = providerRepo.findEnabled()
  const allModels: ModelInfo[] = []
  for (const config of providers) {
    const models = providerRepo.findModels(config.id)
    allModels.push(...models)
  }
  return allModels
}

// 创建默认 Provider
export function createDefaultProviders(): void {
  // 迁移：将旧名称 "网页大模型 (Chat2API)" 更新为 "网页大模型"
  const all = providerRepo.findAll()
  for (const p of all) {
    if (p.name === '网页大模型 (Chat2API)') {
      providerRepo.update(p.id, { name: '网页大模型', base_url: p.base_url, api_key: p.api_key, enabled: p.enabled })
    }
  }

  const existing = providerRepo.findAll()
  if (existing.length > 0) return

  const defaults: Array<{ name: string; type: ProviderType; base_url: string; api_key: string }> = [
    { name: 'OpenAI', type: 'openai', base_url: 'https://api.openai.com', api_key: '' },
    { name: 'Anthropic', type: 'anthropic', base_url: 'https://api.anthropic.com', api_key: '' },
    { name: 'Google', type: 'gemini', base_url: 'https://generativelanguage.googleapis.com', api_key: '' },
    { name: 'DeepSeek', type: 'openai', base_url: 'https://api.deepseek.com', api_key: '' },
    { name: 'Qwen', type: 'openai', base_url: 'https://dashscope.aliyuncs.com/compatible-mode', api_key: '' },
    { name: 'Ollama (本地)', type: 'ollama', base_url: 'http://localhost:11434', api_key: '' },
    { name: '网页大模型', type: 'webchat', base_url: 'http://127.0.0.1:8080', api_key: '' },
  ]

  for (const def of defaults) {
    providerRepo.create({
      name: def.name,
      type: def.type,
      base_url: def.base_url,
      api_key: def.api_key,
      enabled: def.type === 'ollama' || def.type === 'webchat', // 默认启用本地与网页大模型
    })
  }

  logger.info(`创建 ${defaults.length} 个默认 Provider`)
}
