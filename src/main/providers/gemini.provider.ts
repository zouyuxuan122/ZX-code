import { BaseProvider } from './base'
import type { ChatParams, ChatChunk, ModelInfo } from '@shared/types/model'

export class GeminiProvider extends BaseProvider {
  get type(): string {
    return 'gemini'
  }

  private getApiKeyParam(): string {
    return `?key=${this.config.api_key}`
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.config.base_url.replace(/\/$/, '')}/v1beta/models${this.getApiKeyParam()}`
    try {
      const data = await this.fetchJson(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }) as { models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }> }

      if (!data.models) return []

      return data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name,
          provider: this.config.name,
          provider_id: this.config.id,
          type: 'gemini' as const,
          context_length: m.inputTokenLimit || 32000,
          supports_tools: true,
          supports_vision: m.name?.includes('vision') || false,
        }))
    } catch {
      return this.getDefaultModels()
    }
  }

  private getDefaultModels(): ModelInfo[] {
    const models = [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', ctx: 1048576 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: 2097152 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', ctx: 1048576 },
    ]
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: this.config.name,
      provider_id: this.config.id,
      type: 'gemini' as const,
      context_length: m.ctx,
      supports_tools: true,
      supports_vision: true,
    }))
  }

  async *chat(params: ChatParams): AsyncGenerator<ChatChunk> {
    const model = params.model
    const stream = params.stream !== false
    const method = stream ? 'streamGenerateContent' : 'generateContent'
    const url = `${this.config.base_url.replace(/\/$/, '')}/v1beta/models/${model}:${method}${this.getApiKeyParam()}${stream ? '&alt=sse' : ''}`

    // 转换消息格式
    const systemMsgs = params.messages.filter(m => m.role === 'system')
    const chatMsgs = params.messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      contents: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }

    if (systemMsgs.length > 0) {
      body.systemInstruction = {
        parts: [{ text: systemMsgs.map(m => m.content).join('\n') }],
      }
    }

    const genConfig: Record<string, unknown> = {}
    if (params.temperature !== undefined) genConfig.temperature = params.temperature
    if (params.max_tokens !== undefined) genConfig.maxOutputTokens = params.max_tokens

    // 思考强度
    if (params.thinking_level === 'fast') {
      genConfig.temperature = 0.3
    } else if (params.thinking_level === 'deep') {
      genConfig.temperature = 0.9
    }

    if (Object.keys(genConfig).length > 0) {
      body.generationConfig = genConfig
    }

    // 工具定义转换：OpenAI 格式 → Gemini functionDeclarations 格式
    if (params.tools && params.tools.length > 0) {
      body.tools = [{
        functionDeclarations: params.tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      }]
    }

    if (!stream) {
      const data = await this.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, params.signal) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> }
          finishReason?: string
        }>
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
      }

      const parts = data.candidates?.[0]?.content?.parts || []
      let hasFunctionCall = false
      for (const part of parts) {
        if (part.text) {
          yield { content: part.text }
        } else if (part.functionCall) {
          hasFunctionCall = true
          yield {
            tool_calls: [{
              id: `call_${part.functionCall.name}_${Math.random().toString(36).slice(2, 8)}`,
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args ?? {}),
              },
            }],
          }
        }
      }
      yield {
        finish_reason: hasFunctionCall
          ? 'tool_calls'
          : (data.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : null),
        usage: data.usageMetadata ? {
          prompt_tokens: data.usageMetadata.promptTokenCount || 0,
          completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
          total_tokens: data.usageMetadata.totalTokenCount || 0,
        } : undefined,
      }
      return
    }

    // 流式
    for await (const chunkStr of this.fetchSSE(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, params.signal)) {
      const data = this.parseJsonSafely(chunkStr) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> }
          finishReason?: string
        }>
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
      } | null

      if (!data) continue

      const parts = data.candidates?.[0]?.content?.parts || []
      let hasFunctionCall = false
      for (const part of parts) {
        if (part.text) {
          yield { content: part.text }
        } else if (part.functionCall) {
          hasFunctionCall = true
          yield {
            tool_calls: [{
              id: `call_${part.functionCall.name}_${Math.random().toString(36).slice(2, 8)}`,
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args ?? {}),
              },
            }],
          }
        }
      }

      if (data.candidates?.[0]?.finishReason === 'STOP') {
        yield {
          finish_reason: hasFunctionCall ? 'tool_calls' : 'stop',
          usage: data.usageMetadata ? {
            prompt_tokens: data.usageMetadata.promptTokenCount || 0,
            completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
            total_tokens: data.usageMetadata.totalTokenCount || 0,
          } : undefined,
        }
      }
    }
  }
}
