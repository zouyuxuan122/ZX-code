import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { Conversation, Message, MessageMetadata } from '@shared/types/conversation'
import type { ModelInfo } from '@shared/types/model'
import type { ToolExecutionResult, QuestionItem } from '@shared/types/tool'
import type { AgentMode } from '@shared/types/ipc'

/** 工具调用状态 */
export interface ToolCallState {
  toolCallId: string
  name: string
  args: string
  /** 流式累积的 args（Provider 流式返回期间的实时 args 快照） */
  streamingArgs?: string
  result?: ToolExecutionResult
  status: 'running' | 'completed' | 'error' | 'pending_approval'
  /** 时间戳（用于排序与耗时显示） */
  startedAt?: number
  endedAt?: number
}

/** 待审批的工具调用 */
export interface PendingApproval {
  conversationId: string
  toolCallId: string
  name: string
  args: string
}

/** AI 向用户提出的待回答问题 */
export interface PendingQuestion {
  conversationId: string
  questionId: string
  questions: QuestionItem[]
}

/** 发送消息选项 */
export interface SendMessageOptions {
  model?: string
  thinkingLevel?: 'fast' | 'standard' | 'deep'
  autoAccept?: boolean
  mode?: AgentMode
  attachments?: string[]
}

/** 按对话 ID 隔离的流式状态（支持多对话并行运行） */
export interface ConversationStreamingState {
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  toolCalls: Record<string, ToolCallState>
  pendingApprovals: PendingApproval[]
  pendingQuestion: PendingQuestion | null
  error: string | null
}

/** 空流式状态工厂 */
function emptyStreamingState(): ConversationStreamingState {
  return {
    isStreaming: false,
    streamingContent: '',
    streamingThinking: '',
    toolCalls: {},
    pendingApprovals: [],
    pendingQuestion: null,
    error: null,
  }
}

interface ChatState {
  // 当前对话
  currentConversationId: string | null
  currentConversation: Conversation | null
  /** @deprecated 旧的全局对话列表，保留用于兼容；新代码请用 conversationsByWorkspace */
  conversations: Conversation[]
  /** 按工作区 ID 缓存的对话列表（各工作区独立，不共享） */
  conversationsByWorkspace: Record<string, Conversation[]>
  messages: Message[]

  // TODO 列表（由 todo_write 工具更新）
  todos: Array<{
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    priority: 'high' | 'medium' | 'low'
  }>

  /** 任务产物（由各类工具产生：文件编辑 / 命令 / 网页抓取 / 子任务 / 终端输出等） */
  artifacts: Array<{
    /** 文件类产物的相对路径；非文件类产物为标题或摘要 */
    filepath: string
    /** 产物类型 */
    tool: 'write_file' | 'edit' | 'run_command' | 'webfetch' | 'websearch' | 'task' | 'terminal_read'
    /** 文件类产物的增删行数；非文件类为 0 */
    additions: number
    deletions: number
    timestamp: number
    /** 关联的 todo ID（若产物产生时有 in_progress 的 todo） */
    todoId?: string
    /** 产物摘要（命令类：命令文本；网页类：URL；子任务：描述；终端：会话ID） */
    summary?: string
  }>

  /** 工具使用统计（按工具名计数） */
  toolUsageStats: Record<string, { count: number; success: number; error: number; totalMs: number }>

  // 流式状态
  isStreaming: boolean
  streamingContent: string
  streamingThinking: string
  error: string | null

  // 工具调用状态（按 tool_call_id 索引，使用 Record 代替 Map 以保证可序列化）
  toolCalls: Record<string, ToolCallState>

  // 待审批的工具调用
  pendingApprovals: PendingApproval[]

  // 待回答的 AI 提问
  pendingQuestion: PendingQuestion | null

  // 九宫格 ChatPanel 引用内容（同步到主输入框）
  pendingQuote: string

  // 当前运行中的任务名称（派生状态，由 isStreaming / toolCalls 计算）
  currentTaskName: string | null

  // 模型列表
  availableModels: ModelInfo[]

  // 加载状态
  loadingConversations: boolean
  /** 按工作区 ID 记录加载状态 */
  loadingByWorkspace: Record<string, boolean>
  loadingMessages: boolean

  // 新增：按对话 ID 隔离的并行流式状态 Map
  streamingByConversation: Record<string, ConversationStreamingState>

  // Actions
  loadConversations: (projectId?: string) => Promise<void>
  /** 仅加载某个工作区的对话到 conversationsByWorkspace[workspaceId]，不影响全局 conversations */
  loadWorkspaceConversations: (workspaceId: string) => Promise<void>
  loadMessages: (conversationId: string) => Promise<void>
  createConversation: (projectId: string | null, title?: string) => Promise<string>
  selectConversation: (id: string | null) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>
  stopStreaming: () => Promise<void>
  compressConversation: () => Promise<void>
  /** 回退到指定消息：删除该消息及之后的所有消息，并重新加载 */
  rollbackToMessage: (messageId: string) => Promise<void>
  approveToolCall: (toolCallId: string, approved: boolean, decision?: 'once' | 'always') => Promise<void>
  loadAvailableModels: () => Promise<void>
  clearError: () => void

  // Question 相关
  replyQuestion: (answers: string[][]) => Promise<void>
  cancelQuestion: () => Promise<void>

  // 九宫格引用同步
  setPendingQuote: (text: string) => void

  // 内部状态更新（由事件回调调用）
  appendChunk: (content: string) => void
  appendThinking: (content: string) => void
  setToolCallStart: (toolCallId: string, name: string, args: string) => void
  setToolCallEnd: (toolCallId: string, result: ToolExecutionResult) => void
  /** 更新工具调用的流式 args（实时渲染文件写入过程） */
  updateToolCallArgs: (toolCallId: string, args: string) => void
  addPendingApproval: (approval: PendingApproval) => void
  removePendingApproval: (toolCallId: string) => void
  setPendingQuestion: (question: PendingQuestion | null) => void
  onMessageComplete: (message: Message) => void
  setError: (error: string) => void
  setStreaming: (streaming: boolean) => void

  // 派生状态刷新
  refreshCurrentTaskName: () => void

  // 并行状态管理方法（按对话 ID 隔离）
  resetParallelState: () => void
  getStreamingState: (conversationId: string) => ConversationStreamingState
  setParallelStreaming: (conversationId: string, streaming: boolean) => void
  setParallelContent: (conversationId: string, content: string) => void
  setParallelThinking: (conversationId: string, content: string) => void
  setParallelToolCalls: (conversationId: string, toolCalls: Record<string, ToolCallState>) => void
  addParallelToolCall: (conversationId: string, toolCall: ToolCallState) => void
  updateParallelToolCall: (conversationId: string, toolCallId: string, update: Partial<ToolCallState>) => void
  addParallelApproval: (conversationId: string, approval: PendingApproval) => void
  removeParallelApproval: (conversationId: string, toolCallId: string) => void
  clearParallelApprovals: (conversationId: string) => void
  setParallelQuestion: (conversationId: string, question: PendingQuestion | null) => void
  setParallelError: (conversationId: string, error: string | null) => void
  clearParallelState: (conversationId: string) => void
  isCurrentStreaming: () => boolean
  setCurrentConversationId: (id: string | null) => void
}

/**
 * 从历史消息重建工具使用统计、任务产物和 TODO 列表。
 * 遍历 tool 角色消息，根据 metadata 还原统计信息。
 */
function rebuildStatsFromMessages(messages: Message[]) {
  const toolUsageStats: Record<string, { count: number; success: number; error: number; totalMs: number }> = {}
  const artifacts: Array<{ filepath: string; tool: 'write_file' | 'edit' | 'run_command' | 'webfetch' | 'websearch' | 'task' | 'terminal_read'; additions: number; deletions: number; timestamp: number; todoId?: string; summary?: string }> = []
  let todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled'; priority: 'high' | 'medium' | 'low' }> = []
  /** 跟踪当前 in_progress 的 todo，用于关联产物 */
  let currentTodoId: string | undefined

  for (const msg of messages) {
    if (msg.role !== 'tool') continue
    const toolName = msg.tool_name ?? 'tool'
    let meta: MessageMetadata | null = null
    try {
      meta = msg.metadata ? (JSON.parse(msg.metadata) as MessageMetadata) : null
    } catch {
      continue
    }
    const isError = meta?.is_error ?? false
    const duration = meta?.duration ?? 0
    const prev = toolUsageStats[toolName] ?? { count: 0, success: 0, error: 0, totalMs: 0 }
    toolUsageStats[toolName] = {
      count: prev.count + 1,
      success: prev.success + (isError ? 0 : 1),
      error: prev.error + (isError ? 1 : 0),
      totalMs: prev.totalMs + duration,
    }
    // TODO 列表：todo_write 的最新结果；同时更新 currentTodoId
    if (!isError && meta?.result_metadata?.todos && toolName === 'todo_write') {
      todos = meta.result_metadata.todos
      const inProgress = todos.find((t) => t.status === 'in_progress')
      currentTodoId = inProgress?.id
    }
    // 任务产物：write_file/edit 产生的 diff
    if (!isError && meta?.result_metadata?.diff && (toolName === 'write_file' || toolName === 'edit')) {
      const diff = meta.result_metadata.diff
      artifacts.push({
        filepath: diff.filepath,
        tool: toolName as 'write_file' | 'edit',
        additions: diff.additions,
        deletions: diff.deletions,
        timestamp: msg.created_at,
        todoId: currentTodoId,
      })
    }
    // 任务产物：run_command 的命令信息
    if (!isError && meta?.result_metadata?.command && toolName === 'run_command') {
      const cmd = meta.result_metadata.command
      artifacts.push({
        filepath: `$ 命令 #${artifacts.filter((a) => a.tool === 'run_command').length + 1}`,
        tool: 'run_command',
        additions: 0,
        deletions: 0,
        timestamp: msg.created_at,
        todoId: currentTodoId,
        summary: cmd.command,
      })
    }
    // 任务产物：task 子智能体
    if (!isError && meta?.result_metadata?.task && toolName === 'task') {
      const t = meta.result_metadata.task
      artifacts.push({
        filepath: `§ 子任务: ${t.description}`,
        tool: 'task',
        additions: 0,
        deletions: 0,
        timestamp: msg.created_at,
        todoId: currentTodoId,
        summary: t.description,
      })
    }
    // 任务产物：webfetch / websearch — 仅记录成功的抓取
    if (!isError && (toolName === 'webfetch' || toolName === 'websearch')) {
      // 从 args JSON 提取 URL / query（msg.content 是工具结果，args 在 tool_calls 父消息里）
      // 这里简化处理：用 content 的前 80 字符作为摘要
      const contentPreview = (msg.content || '').slice(0, 80).replace(/\s+/g, ' ').trim()
      artifacts.push({
        filepath: `🌐 ${toolName === 'webfetch' ? '网页' : '搜索'}: ${contentPreview || '-'}`,
        tool: toolName as 'webfetch' | 'websearch',
        additions: 0,
        deletions: 0,
        timestamp: msg.created_at,
        todoId: currentTodoId,
        summary: contentPreview,
      })
    }
    // 任务产物：terminal_read 终端审阅
    if (!isError && toolName === 'terminal_read') {
      const sessionId = meta?.result_metadata?.terminal?.sessionId ?? '-'
      artifacts.push({
        filepath: `⌘ 终端输出: ${sessionId}`,
        tool: 'terminal_read',
        additions: 0,
        deletions: 0,
        timestamp: msg.created_at,
        todoId: currentTodoId,
        summary: `会话 ${sessionId}`,
      })
    }
  }
  return { toolUsageStats, artifacts, todos }
}

// ─── 工具名中文映射（用于宠物任务感知）────────────────────

const toolNameMap: Record<string, string> = {
  write_file: '写文件',
  edit: '编辑文件',
  run_command: '运行命令',
  webfetch: '抓取网页',
  websearch: '搜索网页',
  task: '执行子任务',
  terminal_read: '终端审阅',
  todo_write: '更新待办',
}

/**
 * 根据全局流式状态与工具调用状态派生当前任务名。
 * - 无流式且无运行中/待审批工具 → null
 * - 有运行中/待审批工具 → 取最近一个工具的中文映射名
 * - 仅流式中 → 「对话」
 */
function deriveCurrentTaskName(state: ChatState): string | null {
  const activeToolCalls = Object.values(state.toolCalls).filter(
    (t) => t.status === 'running' || t.status === 'pending_approval',
  )

  if (activeToolCalls.length > 0) {
    const lastTool = activeToolCalls.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]
    return toolNameMap[lastTool.name] ?? lastTool.name
  }

  if (state.isStreaming) {
    return '对话'
  }

  return null
}

export const useChatStore = create<ChatState>((set, get) => ({
  currentConversationId: null,
  currentConversation: null,
  conversations: [],
  conversationsByWorkspace: {},
  messages: [],
  todos: [],
  artifacts: [],
  toolUsageStats: {},

  isStreaming: false,
  streamingContent: '',
  streamingThinking: '',
  error: null,

  toolCalls: {},
  pendingApprovals: [],
  pendingQuestion: null,
  pendingQuote: '',
  currentTaskName: null,

  availableModels: [],

  loadingConversations: false,
  loadingByWorkspace: {},
  loadingMessages: false,

  streamingByConversation: {},

  loadConversations: async (projectId?: string) => {
    set({ loadingConversations: true, error: null })
    try {
      const conversations = await ipc.conversation.list(projectId)
      // 按 updated_at 倒序
      conversations.sort((a, b) => b.updated_at - a.updated_at)
      set({
        conversations,
        // 同时更新 conversationsByWorkspace 缓存
        ...(projectId ? { conversationsByWorkspace: { ...get().conversationsByWorkspace, [projectId]: conversations } } : {}),
        loadingConversations: false,
      })
    } catch (err) {
      set({
        error: (err as Error).message,
        loadingConversations: false,
      })
    }
  },

  /** 仅加载某个工作区的对话到独立缓存，不影响全局 conversations */
  loadWorkspaceConversations: async (workspaceId: string) => {
    set((s) => ({ loadingByWorkspace: { ...s.loadingByWorkspace, [workspaceId]: true } }))
    try {
      const conversations = await ipc.conversation.list(workspaceId)
      conversations.sort((a, b) => b.updated_at - a.updated_at)
      set((s) => ({
        conversationsByWorkspace: { ...s.conversationsByWorkspace, [workspaceId]: conversations },
        loadingByWorkspace: { ...s.loadingByWorkspace, [workspaceId]: false },
      }))
    } catch (err) {
      set((s) => ({
        error: (err as Error).message,
        loadingByWorkspace: { ...s.loadingByWorkspace, [workspaceId]: false },
      }))
    }
  },

  loadMessages: async (conversationId: string) => {
    set({ loadingMessages: true, error: null })
    try {
      const messages = await ipc.conversation.getMessages(conversationId)
      // 从历史消息重建工具统计、产物和 TODO，确保切换/重载对话时右侧栏信息完整
      const { toolUsageStats, artifacts, todos } = rebuildStatsFromMessages(messages)
      set({
        messages,
        toolUsageStats,
        artifacts,
        todos,
        // 清空活跃的 toolCalls（流式期间累积的），避免残留状态干扰
        toolCalls: {},
        loadingMessages: false,
      })
    } catch (err) {
      set({
        error: (err as Error).message,
        loadingMessages: false,
      })
    }
  },

  createConversation: async (projectId: string | null, title?: string) => {
    const conversation = await ipc.conversation.create({
      project_id: projectId ?? undefined,
      title: title ?? '新对话',
    })
    set((state) => {
      const nextByWorkspace = { ...state.conversationsByWorkspace }
      if (projectId) {
        nextByWorkspace[projectId] = [conversation, ...(nextByWorkspace[projectId] ?? [])]
      }
      return {
        conversations: [conversation, ...state.conversations],
        conversationsByWorkspace: nextByWorkspace,
        currentConversationId: conversation.id,
        currentConversation: conversation,
        messages: [],
        // 新对话不在流式状态：必须重置 isStreaming，否则从流式对话切来时输入框被永久禁用
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        toolCalls: {},
        pendingApprovals: [],
        pendingQuestion: null,
        artifacts: [],
        toolUsageStats: {},
        error: null,
      }
    })
    get().refreshCurrentTaskName()
    return conversation.id
  },

  selectConversation: async (id: string | null) => {
    if (id === null) {
      set({
        currentConversationId: null,
        currentConversation: null,
        messages: [],
      })
      get().refreshCurrentTaskName()
      return
    }
    // 在所有工作区缓存里找这条对话
    const all = Object.values(get().conversationsByWorkspace).flat()
    const conversation = all.find((c) => c.id === id) ?? get().conversations.find((c) => c.id === id) ?? null

    // 不停止原对话的后台流式请求——保留所有对话的并行状态
    // 不调用 ipc.chat.stop——让原对话在后台继续运行
    // 从并行状态恢复当前对话的全局状态（兼容旧组件）
    const parallelState = get().getStreamingState(id)
    set({
      currentConversationId: id,
      currentConversation: conversation,
      // 全局状态从并行 Map 同步，保持一致性
      isStreaming: parallelState.isStreaming,
      streamingContent: parallelState.streamingContent,
      streamingThinking: parallelState.streamingThinking,
      toolCalls: { ...parallelState.toolCalls },
      pendingApprovals: [...parallelState.pendingApprovals],
      pendingQuestion: parallelState.pendingQuestion,
      todos: [],
      artifacts: [],
      toolUsageStats: {},
      error: parallelState.error,
    })
    get().refreshCurrentTaskName()
    await get().loadMessages(id)
  },

  deleteConversation: async (id: string) => {
    // 若删除的是当前正在流式的对话，先停止后端流式请求，避免 isStreaming 卡死
    const wasStreaming = get().isStreaming
    const isCurrent = get().currentConversationId === id
    if (wasStreaming && isCurrent) {
      try {
        await ipc.chat.stop(id)
      } catch {
        // 忽略：即使后端停止失败，前端仍需重置状态
      }
    }
    await ipc.conversation.delete(id)
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      // 同步从所有工作区缓存里删除
      const nextByWorkspace: Record<string, Conversation[]> = {}
      for (const [k, v] of Object.entries(state.conversationsByWorkspace)) {
        nextByWorkspace[k] = v.filter((c) => c.id !== id)
      }
      const isCurrentDel = state.currentConversationId === id
      // 清理已删除对话的并行流式状态（避免内存泄漏）
      const { [id]: _removed, ...restStreaming } = state.streamingByConversation
      if (!isCurrentDel) {
        return {
          conversations,
          conversationsByWorkspace: nextByWorkspace,
          streamingByConversation: restStreaming,
        }
      }
      // 删除的是当前对话：重置全部流式/交互状态，防止 isStreaming 卡死导致输入框永久 disabled
      return {
        conversations,
        conversationsByWorkspace: nextByWorkspace,
        currentConversationId: null,
        currentConversation: null,
        messages: [],
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        toolCalls: {},
        pendingApprovals: [],
        pendingQuestion: null,
        error: null,
        streamingByConversation: restStreaming,
      }
    })
    get().refreshCurrentTaskName()
  },

  renameConversation: async (id: string, title: string) => {
    const updated = await ipc.conversation.update(id, { title })
    set((state) => {
      const nextByWorkspace: Record<string, Conversation[]> = {}
      for (const [k, v] of Object.entries(state.conversationsByWorkspace)) {
        nextByWorkspace[k] = v.map((c) => (c.id === id ? updated : c))
      }
      return {
        conversations: state.conversations.map((c) => (c.id === id ? updated : c)),
        conversationsByWorkspace: nextByWorkspace,
        currentConversation:
          state.currentConversationId === id ? updated : state.currentConversation,
      }
    })
  },

  sendMessage: async (content: string, options?: SendMessageOptions) => {
    const state = get()
    const conversationId = state.currentConversationId
    if (!conversationId) {
      set({ error: '当前没有活动对话' })
      return
    }
    // 使用并行状态检查：只检查当前对话是否在流式
    if (state.isCurrentStreaming()) {
      set({ error: '当前对话正在进行中的请求，请稍候或先停止' })
      return
    }

    // 设置当前对话的并行流式状态
    state.setParallelStreaming(conversationId, true)
    state.setParallelContent(conversationId, '')
    state.setParallelThinking(conversationId, '')
    state.setParallelToolCalls(conversationId, {})
    state.clearParallelApprovals(conversationId)
    state.setParallelQuestion(conversationId, null)
    state.setParallelError(conversationId, null)

    // 乐观追加用户消息
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content,
      metadata: null,
      created_at: Date.now(),
    }

    set({
      messages: [...state.messages, tempUserMessage],
      isStreaming: true,
      streamingContent: '',
      streamingThinking: '',
      error: null,
      toolCalls: {},
      pendingApprovals: [],
      pendingQuestion: null,
    })
    get().refreshCurrentTaskName()

    // 超时安全网：5 分钟后自动重置 isStreaming，防止卡死
    const streamingConversationId = conversationId
    const timeoutId = setTimeout(() => {
      const cur = get()
      if (cur.getStreamingState(streamingConversationId).isStreaming) {
        console.warn('[chatStore] isStreaming 超时（5分钟），自动重置')
        cur.setParallelStreaming(streamingConversationId, false)
        cur.setParallelError(streamingConversationId, '请求超时（5分钟），已自动重置。可能是 API 响应缓慢或网络问题。')
        if (cur.currentConversationId === streamingConversationId) {
          set({ isStreaming: false, error: '请求超时（5分钟），已自动重置。可能是 API 响应缓慢或网络问题。' })
          get().refreshCurrentTaskName()
          // 仅当前对话才重载消息，避免后台对话超时覆盖当前对话的全局状态
          void cur.loadMessages(streamingConversationId)
        }
      }
    }, 5 * 60 * 1000)

    // 不阻塞等待 ipc.chat.send 的 resolve——后端 handler 在流式 for-await 循环完成前不会 resolve
    // isStreaming 由 chat:complete / chat:error 事件来重置
    // 这里只需捕获同步错误（如"该对话已有进行中的请求"）
    const sendOpts = {
      model: options?.model,
      thinkingLevel: options?.thinkingLevel,
      autoAccept: options?.autoAccept,
      mode: options?.mode,
      attachments: options?.attachments,
    }

    /** 同步重置出错对话的并行 + 全局状态 */
    const resetOnError = (errMsg: string) => {
      get().setParallelStreaming(streamingConversationId, false)
      get().setParallelError(streamingConversationId, errMsg)
      if (get().currentConversationId === streamingConversationId) {
        set({ isStreaming: false, error: errMsg })
        get().refreshCurrentTaskName()
      }
    }

    ipc.chat.send(conversationId, content, sendOpts).then(
      () => {
        // 后端 handler 返回（流式完成），清除超时安全网
        clearTimeout(timeoutId)
      },
      (err: Error) => {
        clearTimeout(timeoutId)
        const errMsg = err.message || String(err)
        // 如果是"该对话已有进行中的请求"，尝试强制重置后重试一次
        if (errMsg.includes('进行中的请求')) {
          ipc.chat.forceReset(conversationId).then(
            () => {
              // 重置后重试发送
              ipc.chat.send(conversationId, content, sendOpts).then(
                () => { /* 流式完成，无需操作 */ },
                (retryErr: Error) => {
                  resetOnError(retryErr.message || String(retryErr))
                },
              )
            },
            () => {
              resetOnError(errMsg)
            },
          )
        } else {
          resetOnError(errMsg)
        }
      },
    )
  },

  stopStreaming: async () => {
    const conversationId = get().currentConversationId
    if (!conversationId) {
      // 即使没有当前对话，也强制重置 streaming 及交互状态
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        pendingApprovals: [],
        pendingQuestion: null,
        error: null,
      })
      get().refreshCurrentTaskName()
      return
    }
    try {
      // 先尝试正常停止
      await ipc.chat.stop(conversationId)
    } catch {
      // 正常停止失败，尝试强制重置后端状态
      try {
        await ipc.chat.forceReset(conversationId)
      } catch {
        // 忽略
      }
    } finally {
      // 无论后端是否响应，前端强制重置当前对话的并行 + 全局 streaming 状态
      get().setParallelStreaming(conversationId, false)
      get().setParallelContent(conversationId, '')
      get().setParallelThinking(conversationId, '')
      // 清理残留的交互状态，避免停止后 QuestionCard/审批弹窗仍显示
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        pendingApprovals: [],
        pendingQuestion: null,
      })
      get().refreshCurrentTaskName()
      // 重新加载消息，确保 store 与数据库一致
      try {
        await get().loadMessages(conversationId)
      } catch {
        // 忽略重载失败
      }
    }
  },

  compressConversation: async () => {
    const conversationId = get().currentConversationId
    if (!conversationId) {
      set({ error: '当前没有活动对话' })
      return
    }
    try {
      await ipc.chat.compress(conversationId)
      await get().loadMessages(conversationId)
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  rollbackToMessage: async (messageId: string) => {
    const conversationId = get().currentConversationId
    if (!conversationId) {
      set({ error: '当前没有活动对话' })
      return
    }
    if (get().isStreaming) {
      set({ error: '正在生成回复中，请先停止后再回退' })
      return
    }
    // 回退前捕获用户消息内容，回退后回填到输入框供重新编辑
    const messages = get().messages
    const targetMsg = messages.find((m) => m.id === messageId)
    const rollbackContent = targetMsg?.role === 'user' ? targetMsg.content : ''
    try {
      // 先强制清理后端可能残留的 runningChats，避免回退后无法发送新消息
      try {
        await ipc.chat.forceReset(conversationId)
      } catch {
        // 忽略 forceReset 失败
      }
      const result = await ipc.conversation.rollbackToMessage(conversationId, messageId) as { deleted: number; ok: boolean; error?: string }
      if (!result.ok) {
        set({ error: result.error ?? '回退失败：未知错误' })
        return
      }
      if (result.deleted <= 0) {
        set({ error: '回退失败：未找到该消息，请刷新后重试' })
        return
      }
      // 先重置 streaming 状态，避免 loadMessages 期间输入框被禁用
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        toolCalls: {},
        pendingApprovals: [],
        pendingQuestion: null,
        error: null,
      })
      get().refreshCurrentTaskName()
      await get().loadMessages(conversationId)
      // 将回退的用户消息内容回填到输入框
      if (rollbackContent) {
        const { useUIStore } = await import('@/stores/uiStore')
        useUIStore.getState().setPendingInput(rollbackContent)
      }
    } catch (err) {
      const msg = (err as Error).message || String(err)
      // catch 块也必须重置 streaming 状态，防止卡死
      set({
        isStreaming: false,
        streamingContent: '',
        streamingThinking: '',
        toolCalls: {},
        pendingApprovals: [],
        pendingQuestion: null,
        error: `回退失败：${msg}`,
      })
      get().refreshCurrentTaskName()
    }
  },

  approveToolCall: async (toolCallId: string, approved: boolean, decision?: 'once' | 'always') => {
    const state = get()
    const conversationId = state.currentConversationId
    if (!conversationId) return
    try {
      await ipc.chat.approveToolCall(conversationId, toolCallId, approved, decision)
      set((s) => ({
        pendingApprovals: s.pendingApprovals.filter((p) => p.toolCallId !== toolCallId),
        toolCalls: {
          ...s.toolCalls,
          [toolCallId]: {
            ...(s.toolCalls[toolCallId] ?? {
              toolCallId,
              name: '',
              args: '',
            }),
            status: approved ? 'running' : 'error',
          },
        },
      }))
      get().refreshCurrentTaskName()
    } catch (err) {
      set({ error: (err as Error).message })
      get().refreshCurrentTaskName()
    }
  },

  loadAvailableModels: async () => {
    try {
      const models = await ipc.provider.getAllModels()
      set({ availableModels: models })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  clearError: () => set({ error: null }),

  replyQuestion: async (answers: string[][]) => {
    const state = get()
    const q = state.pendingQuestion
    if (!q) return
    try {
      await ipc.question.reply(q.conversationId, q.questionId, answers)
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ pendingQuestion: null })
    }
  },

  cancelQuestion: async () => {
    const state = get()
    const q = state.pendingQuestion
    if (!q) return
    try {
      await ipc.question.cancel(q.conversationId, q.questionId)
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ pendingQuestion: null })
    }
  },

  setPendingQuote: (text: string) => set({ pendingQuote: text }),

  appendChunk: (content: string) =>
    set((state) => ({ streamingContent: state.streamingContent + content })),

  appendThinking: (content: string) =>
    set((state) => ({ streamingThinking: state.streamingThinking + content })),

  setToolCallStart: (toolCallId: string, name: string, args: string) => {
    set((state) => ({
      toolCalls: {
        ...state.toolCalls,
        [toolCallId]: { toolCallId, name, args, status: 'running', startedAt: Date.now() },
      },
    }))
    get().refreshCurrentTaskName()
  },

  updateToolCallArgs: (toolCallId: string, args: string) => {
    set((state) => {
      const prev = state.toolCalls[toolCallId]
      if (!prev) {
        // delta 可能在 tool_call_start 之前到达，创建一个临时 running 状态
        return {
          toolCalls: {
            ...state.toolCalls,
            [toolCallId]: { toolCallId, name: '', args: '', streamingArgs: args, status: 'running' as const, startedAt: Date.now() },
          },
        }
      }
      return {
        toolCalls: {
          ...state.toolCalls,
          [toolCallId]: { ...prev, streamingArgs: args },
        },
      }
    })
  },

  setToolCallEnd: (toolCallId: string, result: ToolExecutionResult) => {
    set((state) => {
      const prev = state.toolCalls[toolCallId]
      const toolName = prev?.name ?? ''
      // 检测 todo_write 工具，更新 todos 状态
      const isTodoWrite = toolName === 'todo_write' && !result.is_error && result.metadata?.todos
      // 检测 write_file/edit 工具，记录产物
      const isFileWrite =
        (toolName === 'write_file' || toolName === 'edit') &&
        !result.is_error &&
        result.metadata?.diff
      // 计算耗时
      const durationMs =
        prev?.startedAt ? Date.now() - prev.startedAt : 0
      // 更新工具使用统计
      const prevStats = state.toolUsageStats[toolName] ?? { count: 0, success: 0, error: 0, totalMs: 0 }
      const newStats = {
        count: prevStats.count + 1,
        success: prevStats.success + (result.is_error ? 0 : 1),
        error: prevStats.error + (result.is_error ? 1 : 0),
        totalMs: prevStats.totalMs + durationMs,
      }
      // 关联当前 in_progress 的 todo
      const currentTodoId = state.todos.find((t) => t.status === 'in_progress')?.id
      // 生成新产物（仅在非错误且有 metadata 时）
      let newArtifact: typeof state.artifacts[number] | null = null
      if (!result.is_error) {
        if (isFileWrite) {
          newArtifact = {
            filepath: result.metadata!.diff!.filepath,
            tool: toolName as 'write_file' | 'edit',
            additions: result.metadata!.diff!.additions,
            deletions: result.metadata!.diff!.deletions,
            timestamp: Date.now(),
            todoId: currentTodoId,
          }
        } else if (toolName === 'run_command' && result.metadata?.command) {
          newArtifact = {
            filepath: `$ 命令 #${state.artifacts.filter((a) => a.tool === 'run_command').length + 1}`,
            tool: 'run_command',
            additions: 0,
            deletions: 0,
            timestamp: Date.now(),
            todoId: currentTodoId,
            summary: result.metadata.command.command,
          }
        } else if (toolName === 'task' && result.metadata?.task) {
          newArtifact = {
            filepath: `§ 子任务: ${result.metadata.task.description}`,
            tool: 'task',
            additions: 0,
            deletions: 0,
            timestamp: Date.now(),
            todoId: currentTodoId,
            summary: result.metadata.task.description,
          }
        } else if (toolName === 'webfetch' || toolName === 'websearch') {
          const contentPreview = (result.content || '').slice(0, 80).replace(/\s+/g, ' ').trim()
          newArtifact = {
            filepath: `🌐 ${toolName === 'webfetch' ? '网页' : '搜索'}: ${contentPreview || '-'}`,
            tool: toolName as 'webfetch' | 'websearch',
            additions: 0,
            deletions: 0,
            timestamp: Date.now(),
            todoId: currentTodoId,
            summary: contentPreview,
          }
        } else if (toolName === 'terminal_read' && result.metadata?.terminal) {
          newArtifact = {
            filepath: `⌘ 终端输出: ${result.metadata.terminal.sessionId}`,
            tool: 'terminal_read',
            additions: 0,
            deletions: 0,
            timestamp: Date.now(),
            todoId: currentTodoId,
            summary: `会话 ${result.metadata.terminal.sessionId}`,
          }
        }
      }
      return {
        toolCalls: {
          ...state.toolCalls,
          [toolCallId]: {
            toolCallId,
            name: toolName,
            args: prev?.args ?? '',
            result,
            status: result.is_error ? 'error' : 'completed',
            startedAt: prev?.startedAt,
            endedAt: Date.now(),
          },
        },
        toolUsageStats: {
          ...state.toolUsageStats,
          [toolName]: newStats,
        },
        ...(isTodoWrite ? { todos: result.metadata!.todos! } : {}),
        ...(newArtifact
          ? {
              artifacts: [...state.artifacts, newArtifact],
            }
          : {}),
      }
    })
    get().refreshCurrentTaskName()
  },

  addPendingApproval: (approval: PendingApproval) => {
    set((state) => {
      // 避免重复添加
      if (state.pendingApprovals.some((p) => p.toolCallId === approval.toolCallId)) {
        return state
      }
      return {
        pendingApprovals: [...state.pendingApprovals, approval],
        toolCalls: {
          ...state.toolCalls,
          [approval.toolCallId]: {
            toolCallId: approval.toolCallId,
            name: approval.name,
            args: approval.args,
            status: 'pending_approval',
            startedAt: Date.now(),
          },
        },
      }
    })
    get().refreshCurrentTaskName()
  },

  removePendingApproval: (toolCallId: string) => {
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter((p) => p.toolCallId !== toolCallId),
    }))
    get().refreshCurrentTaskName()
  },

  setPendingQuestion: (question: PendingQuestion | null) => set({ pendingQuestion: question }),

  onMessageComplete: (message: Message) =>
    set((state) => {
      // 如果已存在（按 id），则替换；否则追加
      const exists = state.messages.some((m) => m.id === message.id)
      return {
        messages: exists
          ? state.messages.map((m) => (m.id === message.id ? message : m))
          : [...state.messages, message],
        streamingContent: '',
        streamingThinking: '',
      }
    }),

  setError: (error: string) => {
    set({ error, isStreaming: false })
    get().refreshCurrentTaskName()
  },

  setStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming })
    get().refreshCurrentTaskName()
  },

  refreshCurrentTaskName: () =>
    set((state) => ({ currentTaskName: deriveCurrentTaskName(state) })),

  // ===== 并行状态管理方法（按对话 ID 隔离）=====
  resetParallelState: () => {
    set({ streamingByConversation: {} })
  },

  getStreamingState: (conversationId: string) => {
    return get().streamingByConversation[conversationId] ?? emptyStreamingState()
  },

  setParallelStreaming: (conversationId: string, streaming: boolean) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, isStreaming: streaming },
        },
      }
    })
  },

  setParallelContent: (conversationId: string, content: string) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, streamingContent: content },
        },
      }
    })
  },

  setParallelThinking: (conversationId: string, content: string) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, streamingThinking: content },
        },
      }
    })
  },

  setParallelToolCalls: (conversationId: string, toolCalls: Record<string, ToolCallState>) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, toolCalls },
        },
      }
    })
  },

  addParallelToolCall: (conversationId: string, toolCall: ToolCallState) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            toolCalls: { ...current.toolCalls, [toolCall.toolCallId]: toolCall },
          },
        },
      }
    })
  },

  updateParallelToolCall: (conversationId: string, toolCallId: string, update: Partial<ToolCallState>) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      const existing = current.toolCalls[toolCallId]
      if (!existing) return state
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            toolCalls: {
              ...current.toolCalls,
              [toolCallId]: { ...existing, ...update },
            },
          },
        },
      }
    })
  },

  addParallelApproval: (conversationId: string, approval: PendingApproval) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      // 避免重复添加
      if (current.pendingApprovals.some((p) => p.toolCallId === approval.toolCallId)) {
        return state
      }
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            pendingApprovals: [...current.pendingApprovals, approval],
          },
        },
      }
    })
  },

  removeParallelApproval: (conversationId: string, toolCallId: string) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: {
            ...current,
            pendingApprovals: current.pendingApprovals.filter((a) => a.toolCallId !== toolCallId),
          },
        },
      }
    })
  },

  clearParallelApprovals: (conversationId: string) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, pendingApprovals: [] },
        },
      }
    })
  },

  setParallelQuestion: (conversationId: string, question: PendingQuestion | null) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, pendingQuestion: question },
        },
      }
    })
  },

  setParallelError: (conversationId: string, error: string | null) => {
    set((state) => {
      const current = state.streamingByConversation[conversationId] ?? emptyStreamingState()
      return {
        streamingByConversation: {
          ...state.streamingByConversation,
          [conversationId]: { ...current, error },
        },
      }
    })
  },

  clearParallelState: (conversationId: string) => {
    set((state) => {
      const next = { ...state.streamingByConversation }
      delete next[conversationId]
      return { streamingByConversation: next }
    })
  },

  isCurrentStreaming: () => {
    const id = get().currentConversationId
    if (!id) return false
    return get().getStreamingState(id).isStreaming
  },

  setCurrentConversationId: (id: string | null) => {
    set({ currentConversationId: id })
  },
}))
