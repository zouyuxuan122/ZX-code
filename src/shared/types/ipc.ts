import type { Project, CreateProjectDto, UpdateProjectDto } from './project'
import type { Setting, SettingCategory } from './settings'
import type { Conversation, Message, CreateConversationDto, UpdateConversationDto } from './conversation'
import type { ProviderConfig, ModelInfo, CreateProviderDto, UpdateProviderDto, ChatParams, ChatChunk, ProviderCompleteResult } from './model'
import type { ToolExecutionResult, ToolDefinition } from './tool'
import type { ContextUsage, MessageTokenInfo } from './context'
import type { McpApi } from './mcp'
import type { SclApi } from './scl'
import type { UsageStatsApi } from './usage'
import type { WeatherApi } from './weather'
import type { FileSearchResult, SearchOptions } from './search'
import type { TerminalApi } from './terminal'

export interface ProjectApi {
  list: () => Promise<Project[]>
  get: (id: string) => Promise<Project | null>
  create: (data: CreateProjectDto) => Promise<Project>
  update: (id: string, data: UpdateProjectDto) => Promise<Project>
  delete: (id: string) => Promise<void>
  setActive: (id: string) => Promise<void>
}

export interface SettingsApi {
  get: (key: string) => Promise<unknown>
  getAll: (category?: SettingCategory) => Promise<Setting[]>
  set: (key: string, value: unknown, category: SettingCategory) => Promise<void>
  delete: (key: string) => Promise<void>
}

export interface ConversationApi {
  list: (projectId?: string) => Promise<Conversation[]>
  get: (id: string) => Promise<Conversation | null>
  create: (data: CreateConversationDto) => Promise<Conversation>
  update: (id: string, data: UpdateConversationDto) => Promise<Conversation>
  delete: (id: string) => Promise<void>
  getMessages: (conversationId: string) => Promise<Message[]>
  deleteMessages: (conversationId: string) => Promise<void>
  /** 回退到指定消息之前：删除该消息及之后的所有消息 */
  rollbackToMessage: (conversationId: string, messageId: string) => Promise<{ deleted: number; ok: boolean; error?: string }>
}

/** 拉取模型列表的结果 */
export interface ListModelsResult {
  ok: boolean
  models: ModelInfo[]
  error?: string
}

/** 测试连接的结果 */
export interface ConnectionTestResult {
  ok: boolean
  error?: string
  modelCount?: number
}

export interface ProviderApi {
  list: () => Promise<ProviderConfig[]>
  get: (id: string) => Promise<ProviderConfig | null>
  create: (data: CreateProviderDto) => Promise<ProviderConfig>
  update: (id: string, data: UpdateProviderDto) => Promise<ProviderConfig>
  delete: (id: string) => Promise<void>
  /** 拉取模型列表，返回 { ok, models, error? } */
  listModels: (providerId: string) => Promise<ListModelsResult>
  /** 测试连接，返回 { ok, error?, modelCount? } */
  testConnection: (providerId: string) => Promise<ConnectionTestResult>
  /** 获取所有已启用 Provider 的全部模型（用于模型选择器） */
  getAllModels: () => Promise<ModelInfo[]>
  /** 监听模型列表变更事件（provider 增删改后触发），返回取消订阅函数 */
  onModelsChanged: (callback: () => void) => () => void
  /** 使用指定 Provider/模型执行一次非流式补全（用于宠物动作/表情等轻量调用） */
  complete: (params: ChatParams) => Promise<ProviderCompleteResult>
  /** 更新单个模型的上下文长度 */
  updateModelContextLength: (providerId: string, modelId: string, contextLength: number) => Promise<void>
}

/** 工具调用过程事件载荷 */
export interface ToolCallStartPayload {
  conversationId: string
  tool_call_id: string
  name: string
  args: string
}

export interface ToolCallEndPayload {
  conversationId: string
  tool_call_id: string
  result: ToolExecutionResult
}

export interface ToolCallApprovalPayload {
  conversationId: string
  tool_call_id: string
  name: string
  args: string
}

export interface ToolCallArgsDeltaPayload {
  conversationId: string
  tool_call_id: string
  name: string
  args: string
}

export interface ChatChunkPayload {
  conversationId: string
  content: string
}

export interface ChatThinkingPayload {
  conversationId: string
  content: string
}

export interface ChatErrorPayload {
  conversationId: string
  message: string
}

export interface ChatCompletePayload {
  conversationId: string
  reason: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** question:ask 事件载荷（AI 向用户提问） */
export interface QuestionAskPayload {
  conversationId: string
  questionId: string
  questions: import('./tool').QuestionItem[]
}

/** Question 相关 API */
export interface QuestionApi {
  /** 用户回答提问 */
  reply: (conversationId: string, questionId: string, answers: string[][]) => Promise<void>
  /** 用户取消提问 */
  cancel: (conversationId: string, questionId: string) => Promise<void>
  /** 监听 AI 的提问事件 */
  onAsk: (callback: (payload: QuestionAskPayload) => void) => () => void
}

export interface ChatApi {
  /** 发送消息并流式接收回复 */
  send: (
    conversationId: string,
    content: string,
    options?: {
      providerId?: string
      model?: string
      thinkingLevel?: 'fast' | 'standard' | 'deep'
      autoAccept?: boolean
      /** Agent 工作模式：chat 普通对话 / plan 规划 / build 构建 */
      mode?: AgentMode
      /** 附件文件路径列表（会附加到消息内容前缀） */
      attachments?: string[]
      /** 自定义 system prompt（角色卡） */
      systemPrompt?: string
    },
  ) => Promise<void>
  /** 中止正在进行的聊天 */
  stop: (conversationId: string) => Promise<boolean>
  /** 强制重置对话状态（isStreaming 卡死时使用） */
  forceReset: (conversationId: string) => Promise<boolean>
  /** 压缩对话历史 */
  compress: (
    conversationId: string,
    options?: { keepRecent?: number; providerId?: string; model?: string },
  ) => Promise<void>
  /** 工具调用审批回写（decision: 'once'|'always'，always 时将写入权限规则） */
  approveToolCall: (
    conversationId: string,
    toolCallId: string,
    approved: boolean,
    decision?: 'once' | 'always',
  ) => Promise<void>
  /** 文本内容增量 */
  onChunk: (callback: (payload: ChatChunkPayload) => void) => () => void
  /** 思考过程增量 */
  onThinking: (callback: (payload: ChatThinkingPayload) => void) => () => void
  /** 完整 assistant 消息（聊天结束时触发） */
  onMessage: (callback: (message: Message & { conversationId: string }) => void) => () => void
  /** 错误事件 */
  onError: (callback: (error: ChatErrorPayload) => void) => () => void
  /** 聊天完成事件 */
  onComplete: (callback: (payload: ChatCompletePayload) => void) => () => void
  /** 工具调用开始 */
  onToolCallStart: (callback: (payload: ToolCallStartPayload) => void) => () => void
  /** 工具调用结束 */
  onToolCallEnd: (callback: (payload: ToolCallEndPayload) => void) => () => void
  /** 工具调用需要审批 */
  onToolCallApproval: (callback: (payload: ToolCallApprovalPayload) => void) => () => void
  /** 工具调用参数流式增量（用于实时渲染文件写入过程） */
  onToolCallArgsDelta: (callback: (payload: ToolCallArgsDeltaPayload) => void) => () => void
}

export interface ToolApi {
  /** 手动执行工具 */
  execute: (
    toolName: string,
    args: Record<string, unknown>,
    context?: {
      workspacePath?: string
      projectId?: string
      conversationId?: string
      autoAccept?: boolean
    },
  ) => Promise<ToolExecutionResult>
  /** 获取所有已注册工具定义 */
  list: () => Promise<ToolDefinition[]>
  /** 工具调用需要审批（与 ChatApi.onToolCallApproval 等价，保留以兼容接口） */
  onToolRequest: (
    callback: (request: {
      conversationId: string
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
    }) => void,
  ) => () => void
}

export interface WindowApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChanged: (callback: (maximized: boolean) => void) => () => void
}

export interface SystemApi {
  getVersion: () => Promise<string>
  selectDirectory: () => Promise<string | null>
}

export interface ContextApi {
  /** 获取指定对话的上下文使用情况（用于右侧栏进度条） */
  getUsage: (conversationId: string) => Promise<ContextUsage | null>
  /** 获取对话内每条消息的 token 信息（用于使用详情面板） */
  getMessageTokens: (conversationId: string) => Promise<MessageTokenInfo[]>
  /** 手动触发对话压缩 */
  compress: (conversationId: string) => Promise<{ ok: boolean; error?: string; compressed?: boolean; summary?: string }>
}

/** Agent 工作模式 */
export type AgentMode = 'chat' | 'plan' | 'build'

/** 上传图片的结果 */
export interface UploadImageResult {
  path: string
  url: string
  filename: string
}

/** 上传附件的结果 */
export interface UploadAttachmentItem {
  path: string
  filename: string
  size: number
}

export interface UploadApi {
  /** 选择图片，复制到本地 attachments 目录，返回 file:// URL */
  image: () => Promise<UploadImageResult | null>
  /** 选择文件附件，复制到本地 attachments 目录 */
  attachment: () => Promise<UploadAttachmentItem[]>
}

/** 文件读取结果（@file 提及使用） */
export interface FileReadResult {
  ok: boolean
  content?: string
  error?: string
  size?: number
}

export interface FileApi {
  /** 读取工作区内指定相对路径的文件内容（用于 @file 提及） */
  readContent: (projectId: string, relativePath: string) => Promise<FileReadResult>
  /** 读取绝对路径文件内容（用于浏览器预览面板加载本地 HTML） */
  readAbsoluteContent: (absolutePath: string) => Promise<{ ok: boolean; content?: string; error?: string }>
  /** 用系统默认程序打开文件 */
  openInEditor: (absolutePath: string, line?: number) => Promise<{ ok: boolean; error?: string }>
  /** 在文件资源管理器中显示文件 */
  showInFolder: (absolutePath: string) => Promise<{ ok: boolean; error?: string }>
  /** 选择单个文件（用于导入 VRM 模型等） */
  selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  /** 选择文件夹（用于导入 Live2D 模型等） */
  selectFolder: () => Promise<string | null>
}

/** 权限动作类型 */
export type PermissionAction = 'allow' | 'ask' | 'deny'

/** 单条权限规则 */
export interface PermissionRule {
  /** 工具名，支持通配符 '*' */
  tool: string
  action: PermissionAction
}

export interface PermissionApi {
  /** 获取所有权限规则 */
  getRules: () => Promise<PermissionRule[]>
  /** 设置权限规则 */
  setRules: (rules: PermissionRule[]) => Promise<boolean>
  /** 检查指定工具的权限动作 */
  check: (toolName: string) => Promise<PermissionAction>
  /** 读取白名单外部目录列表（允许工具访问工作区外的目录） */
  getAllowedDirectories: () => Promise<string[]>
  /** 写入白名单外部目录列表 */
  setAllowedDirectories: (dirs: string[]) => Promise<boolean>
  /** 添加单个目录到白名单（自动去重） */
  addAllowedDirectory: (dir: string) => Promise<boolean>
  /** 读取"允许读取工作区外文件"开关状态 */
  getAllowReadOutsideWorkspace: () => Promise<boolean>
  /** 设置"允许读取工作区外文件"开关状态 */
  setAllowReadOutsideWorkspace: (value: boolean) => Promise<boolean>
}

/** 文件搜索 API */
export interface SearchApi {
  /** 按文件名 / 内容搜索工作区文件 */
  files: (options: SearchOptions) => Promise<FileSearchResult[]>
}

export interface Chat2ApiApi {
  listAccounts(providerId?: string): Promise<any[]>
  deleteAccount(accountId: string): Promise<boolean>
  updateAccount(accountId: string, updates: any): Promise<any>
  listProviders(): Promise<any[]>
  updateProvider(providerId: string, updates: any): Promise<any>
  startLogin(options: any): Promise<any>
  loginWithToken(params: any): Promise<any>
  startInAppLogin(options: any): Promise<any>
  cancelLogin(): Promise<boolean>
  validateToken(providerId: string, providerType: string, credentials: any): Promise<any>
  getProxyStatus(): Promise<any>
  restartProxy(): Promise<boolean>
  fetchModels(): Promise<any>
  onOAuthProgress(callback: (event: any) => void): void
}

export interface IpcApi {
  project: ProjectApi
  settings: SettingsApi
  conversation: ConversationApi
  provider: ProviderApi
  chat2api: Chat2ApiApi
  chat: ChatApi
  tool: ToolApi
  question: QuestionApi
  window: WindowApi
  system: SystemApi
  context: ContextApi
  upload: UploadApi
  file: FileApi
  permission: PermissionApi
  mcp: McpApi
  scl: SclApi
  usage: UsageStatsApi
  weather: WeatherApi
  search: SearchApi
  terminal: TerminalApi
  /** 终端事件监听（输出 / 退出） */
  onTerminalOutput: (callback: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (callback: (payload: { id: string; code: number | null }) => void) => () => void
}
