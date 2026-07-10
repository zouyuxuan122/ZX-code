export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface ToolExecutionResult {
  tool_call_id: string
  content: string
  is_error: boolean
  /** 工具元数据（如 diff、todo 列表、文件信息等，由前端用于富展示） */
  metadata?: {
    /** write_file / edit_file 的 diff 信息 */
    diff?: {
      filepath: string
      patch: string
      additions: number
      deletions: number
    }
    /** todo_write 的任务列表 */
    todos?: Array<{
      id: string
      content: string
      status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
      priority: 'high' | 'medium' | 'low'
    }>
    /** run_command 的命令信息 */
    command?: {
      command: string
      exitCode: number
      duration: number
    }
    /** 子智能体任务信息 */
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
    [key: string]: unknown
  }
}

export interface BuiltinTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  required?: string[]
  requiredPermissions: string[]
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult>
}

/** Question 选项 */
export interface QuestionOption {
  label: string
  description: string
}

/** Question 问题 */
export interface QuestionItem {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface ToolContext {
  workspacePath: string
  projectId: string | null
  conversationId: string
  autoAccept: boolean
  /** 白名单外部目录列表（绝对路径）：允许工具访问工作区外的目录 */
  allowedDirectories?: string[]
  /** question 工具使用的回调：向用户提问并等待回答 */
  onQuestion?: (questions: QuestionItem[]) => Promise<string[][]>
  /** task 工具使用的回调：派发子智能体执行独立任务 */
  spawnSubAgent?: (params: SubAgentParams) => Promise<SubAgentResult>
}

/** 子智能体派发参数 */
export interface SubAgentParams {
  /** 子任务描述（简短标签） */
  description: string
  /** 子任务详细指令 */
  prompt: string
  /** 子智能体类型（general/research/coder） */
  subagentType?: string
  /** 工作区路径 */
  workspacePath: string
  /** 项目 ID */
  projectId: string | null
  /** 父对话 ID */
  parentConversationId: string
}

/** 子智能体执行结果 */
export interface SubAgentResult {
  /** 子智能体的最终回复文本 */
  content: string
  /** 执行状态 */
  state: 'completed' | 'error'
  /** 执行的工具调用次数 */
  toolCallCount: number
  /** 耗时（毫秒） */
  duration: number
  /** 错误信息（state=error 时） */
  error?: string
}
