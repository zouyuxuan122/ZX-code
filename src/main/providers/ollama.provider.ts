import { BaseProvider, CONNECT_TIMEOUT_MS, SSE_READ_TIMEOUT_MS } from './base'
import type { ChatParams, ChatChunk, ModelInfo } from '@shared/types/model'

export class OllamaProvider extends BaseProvider {
  get type(): string {
    return 'ollama'
  }

  protected getHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' }
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.config.base_url.replace(/\/$/, '')}/api/tags`
    try {
      const data = await this.fetchJson(url, {
        method: 'GET',
        headers: this.getHeaders(),
      }) as { models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; context_length?: number } }> }

      if (!data.models) return []

      return data.models.map((m) => ({
        id: m.name,
        name: m.name,
        provider: this.config.name,
        provider_id: this.config.id,
        type: 'ollama' as const,
        context_length: m.details?.context_length || 4096,
        supports_tools: false,
        supports_vision: false,
        description: m.details?.parameter_size ? `参数: ${m.details.parameter_size}` : undefined,
      }))
    } catch {
      return []
    }
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    const url = `${this.config.base_url.replace(/\/$/, '')}/api/chat`
    const stream = params.stream !== false

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: stream,
    }

    if (params.thinking_level === 'fast') {
      body.options = { temperature: 0.3 }
    } else if (params.thinking_level === 'deep') {
      body.options = { temperature: 0.9 }
    }

    if (!stream) {
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      }, params.signal) as {
        message?: { content?: string }
        done?: boolean
        prompt_eval_count?: number
        eval_count?: number
      }

      if (data.message?.content) {
        yield { content: data.message.content }
      }
      yield {
        finish_reason: 'stop',
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      }
      return
    }

    // 流式 - Ollama 使用 NDJSON（每行一个 JSON）
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    }, CONNECT_TIMEOUT_MS)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status} [${url}]: ${errorText.slice(0, 500)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        // 为每次 read 设置超时，防止服务端卡住
        const readPromise = reader.read()
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) => {
          setTimeout(() => reject(new Error(`SSE 读取超时 (${SSE_READ_TIMEOUT_MS}ms) [${url}]`)), SSE_READ_TIMEOUT_MS)
        })
        const { done, value } = await Promise.race([readPromise, timeoutPromise])
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const data = this.parseJsonSafely(trimmed) as {
            message?: { content?: string }
            done?: boolean
            prompt_eval_count?: number
            eval_count?: number
          } | null

          if (!data) continue

          if (data.message?.content) {
            yield { content: data.message.content }
          }
          if (data.done) {
            yield {
              finish_reason: 'stop',
              usage: {
                prompt_tokens: data.prompt_eval_count || 0,
                completion_tokens: data.eval_count || 0,
                total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
              },
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
