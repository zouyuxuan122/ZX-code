import type { Project, CreateProjectDto, UpdateProjectDto } from './project'
import type { Setting, SettingCategory } from './settings'
import type { Conversation, Message, CreateConversationDto, UpdateConversationDto } from './conversation'
import type { ProviderConfig, ModelInfo, CreateProviderDto, UpdateProviderDto, ChatParams, ChatChunk, ProviderCompleteResult } from './model'
import type { ToolExecutionResult, ToolDefinition } from './tool'
import type { ContextUsage, MessageTokenInfo } from './context'
import type { McpApi } from './mcp'
import type { SclApi } from './scl'
import type {
  MarketRegistry,
  MarketListing,
  MarketSearchFilters,
  MarketFetchResult,
  MarketInstallResult,
} from './marketplace'
import type { UsageStatsApi } from './usage'
import type { WeatherApi } from './weather'
import type { FileSearchResult, SearchOptions, MessageSearchResult, ConversationSearchResult } from './search'
import type { TerminalApi } from './terminal'
import type { ContextBriefing } from './supercontext'
import type {
  MemoryNode,
  CreateMemoryNodeDto,
  UpdateMemoryNodeDto,
  RecallQuery,
  RecallResultItem,
  ObsidianExportOptions,
  ObsidianExportResult,
  MemoryPartition,
} from './memory'
import type { Goal, Task, KanbanStatus, CreateGoalDto, CreateTaskDto } from './goal'
import type {
  SyncSource,
  CreateSyncSourceDto,
  UpdateSyncSourceDto,
  FullSyncResult,
} from './sync'
import type { EvolutionRunParams, EvolutionRunResult, EvolutionRun, SkillVersion } from './skill-evolution'
import type { UserProfileEntry, ProfileDimension } from './user-profile'
import type { AgentCronJob, CreateCronJobDto } from './cron-agent'
import type { AgentTrace, TraceQuery, TraceStats } from './trace'

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
  /** FTS5 全文搜索消息，返回带高亮片段的结果列表 */
  messages: (keyword: string, limit?: number) => Promise<MessageSearchResult[]>
  /** FTS5 全文搜索，返回按对话去重的结果列表 */
  conversations: (keyword: string, limit?: number) => Promise<ConversationSearchResult[]>
}

/** TTS 合成响应 */
export interface TtsSynthesizeResponse {
  ok: boolean
  /** 音频临时文件路径（主进程写入临时文件，前端用 file:// 播放） */
  filePath?: string
  format?: 'mp3' | 'wav'
  error?: string
}

/** TTS 音色列表响应 */
export interface TtsVoicesResponse {
  ok: boolean
  voices?: import('./tts').TtsVoice[]
  error?: string
}

/** TTS 设置响应 */
export interface TtsSettingsResponse {
  ok: boolean
  settings?: import('./tts').TtsSettings
  error?: string
}

/** TTS 选择音频文件响应 */
export interface TtsSelectAudioResponse {
  ok: boolean
  filePath?: string
  canceled?: boolean
}

/** TTS 语音克隆响应 */
export interface TtsCloneVoiceResponse {
  ok: boolean
  voiceId?: string
  error?: string
}

/** TTS（文本转语音）API */
export interface TtsApi {
  /** 合成语音，返回音频临时文件路径 */
  synthesize: (text: string, options?: {
    voice?: string
    rate?: number
    volume?: number
    format?: 'mp3' | 'wav'
    cloneVoiceId?: string
  }) => Promise<TtsSynthesizeResponse>
  /** 清理临时音频文件 */
  cleanupAudio: (filePath: string) => Promise<{ ok: boolean }>
  /** 获取当前 provider 的可用音色列表 */
  listVoices: () => Promise<TtsVoicesResponse>
  /** 获取当前 TTS 设置 */
  getSettings: () => Promise<TtsSettingsResponse>
  /** 选择音频文件（用于语音克隆） */
  selectAudio: () => Promise<TtsSelectAudioResponse>
  /** 语音克隆：上传音频 + 参考文本，创建克隆音色 */
  cloneVoice: (audioPath: string, referenceText: string) => Promise<TtsCloneVoiceResponse>
}

/** 目标与看板任务 API */
export interface GoalApi {
  listGoals: (type?: 'long_term' | 'session') => Promise<Goal[]>
  getGoal: (id: string) => Promise<Goal | null>
  createGoal: (dto: CreateGoalDto) => Promise<Goal>
  updateGoalStatus: (id: string, status: 'active' | 'completed' | 'archived') => Promise<Goal>
  deleteGoal: (id: string) => Promise<void>
  listTasks: (goalId: string, status?: KanbanStatus) => Promise<Task[]>
  createTask: (dto: CreateTaskDto) => Promise<Task>
  updateTaskStatus: (id: string, status: KanbanStatus) => Promise<Task>
  updateTask: (id: string, updates: { title?: string; description?: string; status?: KanbanStatus }) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
}

/** 记忆节点统计 */
export interface MemoryStats {
  total: number
  byPartition: Record<string, number>
}

/** 记忆检索与导出 API */
export interface MemoryApi {
  list: (partition?: MemoryPartition) => Promise<MemoryNode[]>
  search: (query: RecallQuery) => Promise<RecallResultItem[]>
  get: (id: string) => Promise<MemoryNode | null>
  create: (dto: CreateMemoryNodeDto) => Promise<MemoryNode>
  update: (id: string, dto: UpdateMemoryNodeDto) => Promise<MemoryNode>
  delete: (id: string) => Promise<void>
  stats: () => Promise<MemoryStats>
  exportObsidian: (options: ObsidianExportOptions) => Promise<ObsidianExportResult>
}

export interface SuperContextApi {
  /** 构建上下文简报（相关文件 / 记忆 / 历史对话） */
  build: (workspacePath: string, userMessage: string, timeoutMs?: number) => Promise<ContextBriefing>
  /** 格式化简报为可注入的文本 */
  format: (briefing: ContextBriefing) => Promise<string>
}

/** 调度器运行状态 */
export interface SchedulerStatus {
  running: boolean
  jobs: string[]
}

/** 外部数据源同步 API */
export interface SyncApi {
  listSources: () => Promise<SyncSource[]>
  addSource: (dto: CreateSyncSourceDto) => Promise<SyncSource>
  updateSource: (id: string, dto: UpdateSyncSourceDto) => Promise<SyncSource>
  removeSource: (id: string) => Promise<void>
  triggerNow: () => Promise<FullSyncResult>
  getSchedulerStatus: () => Promise<SchedulerStatus>
}

/** 技能进化对比结果 */
export interface EvolutionCompareResult {
  run: EvolutionRun
  versions: SkillVersion[]
}

/** 技能进化 API */
export interface EvolutionApi {
  /** 运行完整进化流程 */
  run: (params: EvolutionRunParams) => Promise<EvolutionRunResult>
  /** 查询指定技能的进化运行历史 */
  history: (skillId: string) => Promise<EvolutionRun[]>
  /** 回滚到指定版本 */
  rollback: (skillId: string, versionId: string) => Promise<boolean>
  /** 返回基线与最佳变体的对比数据 */
  compare: (runId: string) => Promise<EvolutionCompareResult | null>
}

/** 用户画像更新参数 */
export interface ProfileUpdateParams {
  dimension: ProfileDimension
  value: string
  confidence?: number
  source?: 'auto' | 'manual'
}

/** 用户画像 API */
export interface ProfileApi {
  /** 返回全部画像条目 */
  get: () => Promise<UserProfileEntry[]>
  /** 插入或更新指定维度 */
  update: (params: ProfileUpdateParams) => Promise<void>
  /** 清空全部画像 */
  clear: () => Promise<void>
}

/** Cron Agent 任务 API */
export interface CronApi {
  /** 创建新的 cron 任务 */
  create: (params: CreateCronJobDto) => Promise<AgentCronJob>
  /** 列出所有任务 */
  list: () => Promise<AgentCronJob[]>
  /** 删除指定任务 */
  delete: (id: string) => Promise<void>
  /** 切换任务启用状态 */
  toggle: (id: string) => Promise<void>
  /** 查询所有任务（历史） */
  history: () => Promise<AgentCronJob[]>
}

/** Agent 轨迹 API */
export interface TraceApi {
  /** 按条件查询轨迹 */
  query: (query: TraceQuery) => Promise<AgentTrace[]>
  /** 获取轨迹聚合统计 */
  stats: () => Promise<TraceStats | null>
}

export interface ZxWebApi {
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

/** 社区市场 API（聚合 MCP / Skill / Plugin 真实社区注册表） */
export interface MarketplaceApi {
  /** 列出所有内置注册表（官方 MCP registry、Smithery、技能 / 插件目录等） */
  listRegistries: () => Promise<MarketRegistry[]>
  /** 并发拉取所有注册表（单个失败不影响其它） */
  fetchAll: () => Promise<MarketFetchResult[]>
  /** 拉取单个注册表 */
  fetchOne: (registry: MarketRegistry) => Promise<MarketListing[]>
  /** 在已拉取条目上做本地过滤 */
  search: (listings: MarketListing[], filters: MarketSearchFilters) => Promise<MarketListing[]>
  /** 安装一个市场条目（路由到 mcp / scl 安装管线） */
  install: (listing: MarketListing) => Promise<MarketInstallResult>
}

export interface IpcApi {
  project: ProjectApi
  settings: SettingsApi
  conversation: ConversationApi
  provider: ProviderApi
  zxWeb: ZxWebApi
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
  /** 社区市场（聚合 MCP / Skill / Plugin 注册表） */
  marketplace: MarketplaceApi
  /** TTS（文本转语音） */
  tts: TtsApi
  /** 目标与看板任务 */
  goal: GoalApi
  /** 记忆检索与导出 */
  memory: MemoryApi
  /** SuperContext 上下文预热 */
  supercontext: SuperContextApi
  /** 外部数据源同步 */
  sync: SyncApi
  /** 技能进化 */
  evolution: EvolutionApi
  /** 用户画像 */
  profile: ProfileApi
  /** Cron Agent 定时任务 */
  cron: CronApi
  /** Agent 轨迹查询与统计 */
  trace: TraceApi
  /** 终端事件监听（输出 / 退出） */
  onTerminalOutput: (callback: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (callback: (payload: { id: string; code: number | null }) => void) => () => void
}
