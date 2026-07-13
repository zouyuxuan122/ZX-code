import { BaseProvider } from './base'
import { OpenAIProvider } from './openai.provider'
import type { ChatParams, ChatChunk, ModelInfo, ProviderConfig } from '@shared/types/model'
import { getZxWebBaseUrl, isZxWebRunning } from '../zx-web'
import { logger } from '../services/logger.service'

/**
 * WebChatProvider：桥接到内置 ZxWeb 引擎。
 *
 * ZxWeb 暴露 OpenAI 兼容 API（/v1/chat/completions、/v1/models），
 * 因此本 Provider 复用 OpenAIProvider 的请求逻辑，
 * 仅将 base_url 指向本地 ZxWeb 服务（127.0.0.1:8080）。
 *
 * 用户在"网页大模型"设置页登录的账户（DeepSeek/GLM/Kimi 等）的模型，
 * 会通过 ZxWeb 的 /v1/models 端点暴露，本 Provider 拉取后写入 SQLite。
 */
export class WebChatProvider extends BaseProvider {
  private delegate: OpenAIProvider

  constructor(config: ProviderConfig) {
    super(config)
    // 用 OpenAIProvider 处理实际请求，但覆盖 base_url 为本地 ZxWeb
    this.delegate = new OpenAIProvider({
      ...config,
      base_url: getZxWebBaseUrl(),
      api_key: 'zx-web-internal', // ZxWeb 内部调用无需真实 key
    })
  }

  get type(): string {
    return 'webchat'
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!isZxWebRunning()) {
      logger.warn('[webchat] ZxWeb 引擎未运行，无法拉取模型列表')
      return []
    }
    try {
      const models = await this.delegate.listModels()
      // 标记来源为 webchat
      return models.map((m) => ({
        ...m,
        provider: 'webchat',
        type: 'webchat' as const,
      }))
    } catch (err) {
      logger.error('[webchat] 拉取模型列表失败', err as Error)
      throw err
    }
  }

  chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    if (!isZxWebRunning()) {
      throw new Error('ZxWeb 引擎未运行，请检查设置或重启应用')
    }
    return this.delegate.chat(params)
  }
}
