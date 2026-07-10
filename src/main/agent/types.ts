import type { ToolExecutionResult, SubAgentParams, SubAgentResult } from '@shared/types/tool'
import type { ChatMessage } from '@shared/types/conversation'

/** 用量统计 */
export interface AgentUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/** Agent 在执行过程中向外推送的事件 */
export type AgentEvent =
  | { type: 'content'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_calls_batch'; tool_calls: Array<{ id: string; name: string; args: string }> }
  | { type: 'tool_call_start'; tool_call_id: string; name: string; args: string }
  | { type: 'tool_call_end'; tool_call_id: string; result: ToolExecutionResult }
  | { type: 'tool_call_args_delta'; tool_call_id: string; name: string; args: string }
  | {
      type: 'tool_call_approval'
      tool_call_id: string
      name: string
      args: string
    }
  | {
      type: 'finish'
      reason: 'stop' | 'length' | 'max_iterations' | 'error'
      usage?: AgentUsage
    }
  | { type: 'error'; message: string }

/** Agent 运行参数 */
export interface AgentRunParams {
  /** 关联的会话 ID（用于日志与上下文） */
  conversationId: string
  /** Provider ID */
  providerId: string
  /** 模型 ID */
  model: string
  /** 已构建好的初始消息（含 system / 历史 / 当前用户消息） */
  messages: ChatMessage[]
  /** 可用工具定义；若为 undefined 表示不启用工具调用 */
  tools?: import('@shared/types/tool').ToolDefinition[]
  /** 工具执行上下文所需的基础信息 */
  context?: {
    workspacePath: string
    projectId: string | null
    autoAccept: boolean
    /** 白名单外部目录列表（允许工具访问工作区外的目录） */
    allowedDirectories?: string[]
  }
  /** 思考强度 */
  thinkingLevel?: 'fast' | 'standard' | 'deep'
  /** 最大迭代轮次（每轮 = 一次 Provider 调用 + 可能的工具调用），默认 20 */
  maxIterations?: number
  /** 温度 */
  temperature?: number
  /** 工具调用审批回调；返回 true 表示允许执行，false 表示拒绝 */
  onToolCall?: (
    toolCallId: string,
    name: string,
    args: string,
    targetPath?: string,
    workspacePath?: string,
  ) => Promise<boolean>
  /** question 工具回调：向用户提问并等待回答 */
  onQuestion?: (questions: import('@shared/types/tool').QuestionItem[]) => Promise<string[][]>
  /** task 工具回调：派发子智能体执行独立任务 */
  spawnSubAgent?: (params: SubAgentParams) => Promise<SubAgentResult>
  /** 外部中断信号（chat:stop 时 abort，取消底层 HTTP 流并停止消费） */
  signal?: AbortSignal
}

/** Agent 工作模式 */
export type AgentMode = 'chat' | 'plan' | 'build'

/** Agent 运行选项（用于在 service 层包裹 params 的可选字段） */
export interface AgentRunOptions {
  thinkingLevel?: 'fast' | 'standard' | 'deep'
  maxIterations?: number
  temperature?: number
  autoAccept?: boolean
  onToolCall?: AgentRunParams['onToolCall']
  /** question 工具回调：向用户提问并等待回答 */
  onQuestion?: AgentRunParams['onQuestion']
  /** task 工具回调：派发子智能体执行独立任务 */
  spawnSubAgent?: AgentRunParams['spawnSubAgent']
  /** 工作模式：chat 普通对话 / plan 规划优先 / build 直接构建 */
  mode?: AgentMode
  /** 自定义 system prompt（角色卡），会覆盖默认 base prompt */
  systemPrompt?: string
  /** 外部中断信号（chat:stop 时 abort） */
  signal?: AbortSignal
}
