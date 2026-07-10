export interface Conversation {
  id: string
  project_id: string | null
  title: string
  model: string | null
  thinking_level: string
  created_at: number
  updated_at: number
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  metadata: string | null
  tool_call_id?: string | null
  tool_name?: string | null
  created_at: number
}

export interface MessageMetadata {
  tokens?: number
  model?: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  tool_name?: string
  thinking?: string
  error?: string
  duration?: number
  /** tool 角色消息：工具执行结果元数据（diff、command、task 等） */
  result_metadata?: {
    diff?: {
      filepath: string
      patch: string
      additions: number
      deletions: number
    }
    todos?: Array<{
      id: string
      content: string
      status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
      priority: 'high' | 'medium' | 'low'
    }>
    command?: {
      command: string
      exitCode: number
      duration: number
    }
    task?: {
      taskId: string
      subagentType: string
      description: string
      state: 'running' | 'completed' | 'error'
      result?: string
    }
    /** terminal_read 工具的会话信息 */
    terminal?: {
      sessionId: string
      shell?: string
      lines: number
    }
  }
  /** tool 角色消息：是否为错误结果 */
  is_error?: boolean
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  content: string
  is_error: boolean
}

export interface CreateConversationDto {
  project_id?: string
  title?: string
  model?: string
  thinking_level?: string
}

export interface UpdateConversationDto {
  title?: string
  model?: string
  thinking_level?: string
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatMessage {
  role: MessageRole
  /**
   * 消息内容。
   * 注意：OpenAI 规范要求带 tool_calls 的 assistant 消息，content 为空时必须为 null（不能是空字符串）。
   * DeepSeek 等严格 API 对 content="" 的 assistant 消息会返回空响应或 400 错误。
   */
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}
