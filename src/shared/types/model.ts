export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom' | 'webchat'

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  base_url: string
  api_key: string
  enabled: boolean
  created_at: number
  updated_at: number
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  provider_id: string
  type: ProviderType
  context_length: number
  supports_tools: boolean
  supports_vision: boolean
  description?: string
}

export interface CreateProviderDto {
  name: string
  type: ProviderType
  base_url: string
  api_key: string
  enabled?: boolean
}

export interface UpdateProviderDto {
  name?: string
  base_url?: string
  api_key?: string
  enabled?: boolean
}

export interface ChatParams {
  model: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    /** content 为 null 时表示 assistant 消息仅含 tool_calls（OpenAI 规范） */
    content: string | null
    tool_calls?: unknown[]
    tool_call_id?: string
  }>
  temperature?: number
  max_tokens?: number
  stream?: boolean
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
  thinking_level?: 'fast' | 'standard' | 'deep'
  /** 外部中断信号（用于 chat:stop 取消底层 HTTP 请求） */
  signal?: AbortSignal
}

export interface ChatChunk {
  content?: string
  reasoning_content?: string
  tool_calls?: Array<{
    index?: number
    id?: string
    function: {
      name?: string
      arguments?: string
    }
  }>
  finish_reason?: 'stop' | 'length' | 'tool_calls' | null
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** provider:complete 的非流式补全结果 */
export interface ProviderCompleteResult {
  ok: boolean
  content?: string
  error?: string
}
