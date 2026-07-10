import { BaseProvider } from './base'
import type { ChatParams, ChatChunk, ModelInfo } from '@shared/types/model'

export class AnthropicProvider extends BaseProvider {
  get type(): string {
    return 'anthropic'
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.api_key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.config.base_url.replace(/\/$/, '')}/v1/models`
    try {
      const data = await this.fetchJson(url, {
        method: 'GET',
        headers: this.getHeaders(),
      }) as { data?: Array<{ id: string; display_name?: string; context_window?: number }> }

      if (!data.data) return []

      return data.data.map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        provider: this.config.name,
        provider_id: this.config.id,
        type: 'anthropic' as const,
        context_length: m.context_window || 200000,
        supports_tools: true,
        supports_vision: true,
      }))
    } catch {
      // 如果列表接口不可用，返回常见模型
      return this.getDefaultModels()
    }
  }

  private getDefaultModels(): ModelInfo[] {
    const models = [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', ctx: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', ctx: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', ctx: 200000 },
    ]
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: this.config.name,
      provider_id: this.config.id,
      type: 'anthropic' as const,
      context_length: m.ctx,
      supports_tools: true,
      supports_vision: true,
    }))
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    const url = `${this.config.base_url.replace(/\/$/, '')}/v1/messages`

    // 转换消息格式：分离 system 消息
    const systemMsgs = params.messages.filter(m => m.role === 'system')
    const chatMsgs = params.messages.filter(m => m.role !== 'system')

    const systemPrompt = systemMsgs.map(m => m.content).join('\n')

    const body: Record<string, unknown> = {
      model: params.model,
      messages: chatMsgs.map(m => {
        // Tool 结果消息（OpenAI 格式：role='tool', tool_call_id）→ Anthropic 格式：role='user' + tool_result content block
        if (m.role === 'tool' && m.tool_call_id) {
          return {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }],
          }
        }
        // Assistant 消息带 tool_calls → Anthropic content blocks
        if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
          const content: Array<Record<string, unknown>> = []
          if (m.content) {
            content.push({ type: 'text', text: m.content })
          }
          for (const tc of m.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: this.parseJsonSafely(tc.function.arguments) || {},
            })
          }
          return { role: 'assistant', content }
        }
        // 普通消息
        return { role: m.role, content: m.content }
      }),
      stream: params.stream !== false,
      max_tokens: params.max_tokens || 4096,
    }

    if (systemPrompt) body.system = systemPrompt

    // 工具定义转换：OpenAI 格式 → Anthropic 格式
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }))
    }

    if (params.thinking_level === 'fast') {
      body.temperature = 0.3
    } else if (params.thinking_level === 'deep') {
      body.temperature = 0.9
    } else {
      body.temperature = 0.7
    }

    const stream = body.stream as boolean
    if (!stream) {
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      }, params.signal) as {
        content?: Array<{
          type: string
          text?: string
          id?: string
          name?: string
          input?: unknown
        }>
        stop_reason?: string
        usage?: { input_tokens: number; output_tokens: number }
      }

      let hasToolUse = false
      for (const block of data.content || []) {
        if (block.type === 'text' && block.text) {
          yield { content: block.text }
        } else if (block.type === 'tool_use') {
          hasToolUse = true
          yield {
            tool_calls: [{
              id: block.id,
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input ?? {}),
              },
            }],
          }
        }
      }
      yield {
        finish_reason: hasToolUse
          ? 'tool_calls'
          : (data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason as 'stop' | 'length' | 'tool_calls' | null),
        usage: data.usage ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        } : undefined,
      }
      return
    }

    // 流式
    let stopReason: string | null = null
    for await (const chunkStr of this.fetchSSE(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    }, params.signal)) {
      const data = this.parseJsonSafely(chunkStr) as {
        type?: string
        index?: number
        content_block?: { type?: string; id?: string; name?: string }
        delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
        message?: { usage?: { input_tokens: number; output_tokens: number } }
        usage?: { output_tokens?: number; input_tokens?: number }
      } | null

      if (!data) continue

      if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
        yield {
          tool_calls: [{
            index: data.index,
            id: data.content_block.id,
            function: { name: data.content_block.name },
          }],
        }
      } else if (data.type === 'content_block_delta') {
        if (data.delta?.type === 'text_delta' && data.delta.text) {
          yield { content: data.delta.text }
        } else if (data.delta?.type === 'input_json_delta' && data.delta.partial_json) {
          yield {
            tool_calls: [{
              index: data.index,
              function: { arguments: data.delta.partial_json },
            }],
          }
        }
      } else if (data.type === 'message_delta') {
        if (data.delta?.stop_reason) {
          stopReason = data.delta.stop_reason
        }
      } else if (data.type === 'message_stop') {
        yield {
          finish_reason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
        }
      }
    }
  }
}
