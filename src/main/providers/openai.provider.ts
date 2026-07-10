import { BaseProvider } from './base'
import { logger } from '../services/logger.service'
import type { ChatParams, ChatChunk, ModelInfo } from '@shared/types/model'

export class OpenAIProvider extends BaseProvider {
  get type(): string {
    return 'openai'
  }

  /**
   * 规范化 base_url：去掉末尾斜杠。
   * 如果 base_url 已含 /v1，则不再重复添加（兼容用户填 https://api.openai.com 或 https://api.openai.com/v1 两种写法）。
   */
  private normalizedBase(): string {
    const base = this.config.base_url.replace(/\/+$/, '')
    // 已含 /v1 则直接用
    if (/\/v\d+$/.test(base)) return base
    // 否则补 /v1
    return `${base}/v1`
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.normalizedBase()}/models`
    const data = await this.fetchJson(url, {
      method: 'GET',
      headers: this.getHeaders(),
    }) as { data?: Array<{ id: string; owned_by?: string }> }

    if (!data.data) return []

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: this.config.name,
      provider_id: this.config.id,
      type: 'openai' as const,
      context_length: 4096,
      supports_tools: true,
      supports_vision: false,
      description: m.owned_by ? `Owner: ${m.owned_by}` : undefined,
    }))
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    const url = `${this.normalizedBase()}/chat/completions`
    
    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: params.stream !== false,
    }

    if (params.temperature !== undefined) body.temperature = params.temperature
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens
    if (params.tools && params.tools.length > 0) body.tools = params.tools

    // 思考强度映射为 temperature 提示
    if (params.thinking_level === 'fast') {
      body.temperature = 0.3
    } else if (params.thinking_level === 'deep') {
      body.temperature = 0.9
    }

    const stream = body.stream as boolean
    if (!stream) {
      // 非流式
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      }, params.signal) as {
        choices?: Array<{
          message?: {
            content?: string
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
          }
          finish_reason?: string
        }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      }

      const choice = data.choices?.[0]
      if (choice?.message?.content) {
        yield { content: choice.message.content }
      }
      if (choice?.message?.tool_calls) {
        yield { tool_calls: choice.message.tool_calls }
      }
      yield {
        finish_reason: choice?.finish_reason as 'stop' | 'length' | 'tool_calls' | null,
        usage: data.usage,
      }
      return
    }

    // 流式
    let receivedAny = false
    // 诊断日志：记录发送的消息概要（role + content 长度 + 是否带 tool_calls）
    const msgSummary = params.messages.map(m =>
      `${m.role}:${m.content === null ? 'null' : `[${m.content.length}chars]`}${m.tool_calls ? `+${(m.tool_calls as unknown[]).length}tc` : ''}`
    ).join(' | ')
    logger.info(`[OpenAI] 请求 model=${params.model} msgs=${params.messages.length} [${msgSummary}]`)

    for await (const chunkStr of this.fetchSSE(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    }, params.signal)) {
      const data = this.parseJsonSafely(chunkStr) as {
        error?: { message?: string; type?: string; code?: string }
        choices?: Array<{
          delta?: {
            content?: string
            reasoning_content?: string
            tool_calls?: Array<{ index?: number; id?: string; function: { name?: string; arguments?: string } }>
          }
          finish_reason?: string
        }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      } | null

      if (!data) continue

      // 部分兼容 API 会在 SSE body 内返回错误对象（HTTP 200 但 body 是 {"error":...}）
      if (data.error) {
        const errMsg = data.error.message || data.error.type || '未知错误'
        throw new Error(`模型返回错误 [${params.model}] [${url}]: ${errMsg}`)
      }

      const choice = data.choices?.[0]
      if (choice?.delta?.content) {
        receivedAny = true
        yield { content: choice.delta.content }
      }
      if (choice?.delta?.reasoning_content) {
        receivedAny = true
        yield { reasoning_content: choice.delta.reasoning_content }
      }
      if (choice?.delta?.tool_calls) {
        receivedAny = true
        yield { tool_calls: choice.delta.tool_calls }
      }
      if (choice?.finish_reason) {
        receivedAny = true
        yield {
          finish_reason: choice.finish_reason as 'stop' | 'length' | 'tool_calls' | null,
          usage: data.usage,
        }
      }
    }

    // 流式结束但未收到任何内容/工具调用/finish_reason → 空回复
    // 常见原因：模型名错误、API Key 无效、被限流、base_url 拼接错误
    if (!receivedAny) {
      logger.error(`[OpenAI] 空回复 model=${params.model} url=${url} msgs=${params.messages.length}`)
      throw new Error(
        `模型未返回内容 [model=${params.model}] [url=${url}]。请检查：1. 模型名是否正确 2. API Key 是否有效 3. Provider base_url 是否正确 4. 是否被限流`,
      )
    }
  }
}
