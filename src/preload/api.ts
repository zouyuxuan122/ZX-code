import { ipcRenderer } from 'electron'
import type { IpcApi } from '@shared/types/ipc'
import type { SearchOptions } from '@shared/types/search'

export const api: IpcApi = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (id: string) => ipcRenderer.invoke('project:get', id),
    create: (data) => ipcRenderer.invoke('project:create', data),
    update: (id: string, data) => ipcRenderer.invoke('project:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
    setActive: (id: string) => ipcRenderer.invoke('project:setActive', id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    getAll: (category) => ipcRenderer.invoke('settings:getAll', category),
    set: (key: string, value, category) => ipcRenderer.invoke('settings:set', key, value, category),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
  },
  conversation: {
    list: (projectId?: string) => ipcRenderer.invoke('conversation:list', projectId),
    get: (id: string) => ipcRenderer.invoke('conversation:get', id),
    // 接口要求传入 CreateConversationDto，主进程 handler 接收 (projectId, title)
    create: (data) =>
      ipcRenderer.invoke('conversation:create', data.project_id ?? null, data.title),
    update: (id: string, data) => ipcRenderer.invoke('conversation:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('conversation:delete', id),
    getMessages: (conversationId: string) =>
      ipcRenderer.invoke('conversation:getMessages', conversationId),
    deleteMessages: (conversationId: string) =>
      ipcRenderer.invoke('conversation:deleteMessages', conversationId),
    rollbackToMessage: (conversationId: string, messageId: string) =>
      ipcRenderer.invoke('conversation:rollbackToMessage', conversationId, messageId),
  },
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    get: (id: string) => ipcRenderer.invoke('provider:get', id),
    create: (data) => ipcRenderer.invoke('provider:create', data),
    update: (id: string, data) => ipcRenderer.invoke('provider:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('provider:delete', id),
    listModels: (providerId: string) => ipcRenderer.invoke('provider:listModels', providerId),
    testConnection: (providerId: string) =>
      ipcRenderer.invoke('provider:testConnection', providerId),
    getAllModels: () => ipcRenderer.invoke('provider:getAllModels'),
    complete: (params) => ipcRenderer.invoke('provider:complete', params),
    updateModelContextLength: (providerId: string, modelId: string, contextLength: number) =>
      ipcRenderer.invoke('provider:updateModelContextLength', providerId, modelId, contextLength),
    onModelsChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('provider:modelsChanged', handler)
      return () => ipcRenderer.removeListener('provider:modelsChanged', handler)
    },
  },
  zxWeb: {
    // 账户
    listAccounts: (providerId?: string) => ipcRenderer.invoke('zx-web:accounts:list', providerId),
    deleteAccount: (accountId: string) => ipcRenderer.invoke('zx-web:accounts:delete', accountId),
    updateAccount: (accountId: string, updates: any) => ipcRenderer.invoke('zx-web:accounts:update', accountId, updates),
    // Provider
    listProviders: () => ipcRenderer.invoke('zx-web:providers:list'),
    updateProvider: (providerId: string, updates: any) => ipcRenderer.invoke('zx-web:providers:update', providerId, updates),
    // OAuth
    startLogin: (options: any) => ipcRenderer.invoke('zx-web:oauth:startLogin', options),
    loginWithToken: (params: any) => ipcRenderer.invoke('zx-web:oauth:loginWithToken', params),
    startInAppLogin: (options: any) => ipcRenderer.invoke('zx-web:oauth:startInAppLogin', options),
    cancelLogin: () => ipcRenderer.invoke('zx-web:oauth:cancelLogin'),
    validateToken: (providerId: string, providerType: string, credentials: any) =>
      ipcRenderer.invoke('zx-web:oauth:validateToken', providerId, providerType, credentials),
    // 代理状态
    getProxyStatus: () => ipcRenderer.invoke('zx-web:proxy:status'),
    restartProxy: () => ipcRenderer.invoke('zx-web:proxy:restart'),
    // 模型同步
    fetchModels: () => ipcRenderer.invoke('zx-web:models:fetch'),
    // OAuth 进度事件
    onOAuthProgress: (callback: (event: any) => void) => {
      ipcRenderer.on('oauth:progress', (_e, event) => callback(event))
    },
  },
  chat: {
    send: (
      conversationId: string,
      content: string,
      options?: {
        providerId?: string
        model?: string
        thinkingLevel?: 'fast' | 'standard' | 'deep'
        autoAccept?: boolean
        mode?: import('@shared/types/ipc').AgentMode
        attachments?: string[]
        systemPrompt?: string
      },
    ) => ipcRenderer.invoke('chat:send', conversationId, content, options),
    stop: (conversationId: string) => ipcRenderer.invoke('chat:stop', conversationId),
    forceReset: (conversationId: string) => ipcRenderer.invoke('chat:forceReset', conversationId),
    compress: (conversationId: string, options?: any) =>
      ipcRenderer.invoke('chat:compress', conversationId, options),
    approveToolCall: (conversationId: string, toolCallId: string, approved: boolean, decision?: 'once' | 'always') =>
      ipcRenderer.invoke('chat:approveToolCall', conversationId, toolCallId, approved, decision),
    onChunk: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.removeListener('chat:chunk', handler)
    },
    onThinking: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:thinking', handler)
      return () => ipcRenderer.removeListener('chat:thinking', handler)
    },
    onMessage: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:message', handler)
      return () => ipcRenderer.removeListener('chat:message', handler)
    },
    onError: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:error', handler)
      return () => ipcRenderer.removeListener('chat:error', handler)
    },
    onComplete: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:complete', handler)
      return () => ipcRenderer.removeListener('chat:complete', handler)
    },
    onToolCallStart: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:toolCallStart', handler)
      return () => ipcRenderer.removeListener('chat:toolCallStart', handler)
    },
    onToolCallEnd: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:toolCallEnd', handler)
      return () => ipcRenderer.removeListener('chat:toolCallEnd', handler)
    },
    onToolCallApproval: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:toolCallApproval', handler)
      return () => ipcRenderer.removeListener('chat:toolCallApproval', handler)
    },
    onToolCallArgsDelta: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('chat:toolCallArgsDelta', handler)
      return () => ipcRenderer.removeListener('chat:toolCallArgsDelta', handler)
    },
  },
  tool: {
    execute: (
      toolName: string,
      args: Record<string, unknown>,
      context?: {
        workspacePath?: string
        projectId?: string
        conversationId?: string
        autoAccept?: boolean
      },
    ) => ipcRenderer.invoke('tool:execute', toolName, args, context),
    list: () => ipcRenderer.invoke('tool:list'),
    onToolRequest: (callback) => {
      const handler = (_e: unknown, data: any) => {
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = data.args ? JSON.parse(data.args) : {}
        } catch {
          parsedArgs = {}
        }
        callback({
          conversationId: data.conversationId,
          toolCallId: data.tool_call_id,
          toolName: data.name,
          args: parsedArgs,
        })
      }
      ipcRenderer.on('chat:toolCallApproval', handler)
      return () => ipcRenderer.removeListener('chat:toolCallApproval', handler)
    },
  },
  question: {
    reply: (conversationId: string, questionId: string, answers: string[][]) =>
      ipcRenderer.invoke('question:reply', conversationId, questionId, answers),
    cancel: (conversationId: string, questionId: string) =>
      ipcRenderer.invoke('question:cancel', conversationId, questionId),
    onAsk: (callback) => {
      const handler = (_e: unknown, data: any) => callback(data)
      ipcRenderer.on('question:ask', handler)
      return () => ipcRenderer.removeListener('question:ask', handler)
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChanged: (callback: (maximized: boolean) => void) => {
      const handler = (_e: unknown, maximized: boolean) => callback(maximized)
      ipcRenderer.on('window:maximizeChanged', handler)
      return () => ipcRenderer.removeListener('window:maximizeChanged', handler)
    },
  },
  system: {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },
  context: {
    getUsage: (conversationId: string) =>
      ipcRenderer.invoke('context:getUsage', conversationId),
    getMessageTokens: (conversationId: string) =>
      ipcRenderer.invoke('context:getMessageTokens', conversationId),
    compress: (conversationId: string) =>
      ipcRenderer.invoke('context:compress', conversationId),
  },
  upload: {
    image: () => ipcRenderer.invoke('upload:image'),
    attachment: () => ipcRenderer.invoke('upload:attachment'),
  },
  file: {
    readContent: (projectId: string, relativePath: string) =>
      ipcRenderer.invoke('file:readContent', projectId, relativePath),
    readAbsoluteContent: (absolutePath: string) =>
      ipcRenderer.invoke('file:readAbsoluteContent', absolutePath),
    openInEditor: (absolutePath: string, line?: number) =>
      ipcRenderer.invoke('file:openInEditor', absolutePath, line),
    showInFolder: (absolutePath: string) =>
      ipcRenderer.invoke('file:showInFolder', absolutePath),
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('file:selectFile', options),
    selectFolder: () => ipcRenderer.invoke('file:selectFolder'),
  },
  permission: {
    getRules: () => ipcRenderer.invoke('permission:getRules'),
    setRules: (rules) => ipcRenderer.invoke('permission:setRules', rules),
    check: (toolName: string) => ipcRenderer.invoke('permission:check', toolName),
    getAllowedDirectories: () => ipcRenderer.invoke('permission:getAllowedDirectories'),
    setAllowedDirectories: (dirs: string[]) => ipcRenderer.invoke('permission:setAllowedDirectories', dirs),
    addAllowedDirectory: (dir: string) => ipcRenderer.invoke('permission:addAllowedDirectory', dir),
    getAllowReadOutsideWorkspace: () => ipcRenderer.invoke('permission:getAllowReadOutsideWorkspace'),
    setAllowReadOutsideWorkspace: (value: boolean) => ipcRenderer.invoke('permission:setAllowReadOutsideWorkspace', value),
  },
  mcp: {
    listServers: () => ipcRenderer.invoke('mcp:listServers'),
    addServer: (config) => ipcRenderer.invoke('mcp:addServer', config),
    updateServer: (id, config) => ipcRenderer.invoke('mcp:updateServer', id, config),
    removeServer: (id) => ipcRenderer.invoke('mcp:removeServer', id),
    connectServer: (id) => ipcRenderer.invoke('mcp:connectServer', id),
    disconnectServer: (id) => ipcRenderer.invoke('mcp:disconnectServer', id),
    listStatus: () => ipcRenderer.invoke('mcp:listStatus'),
    listTools: () => ipcRenderer.invoke('mcp:listTools'),
  },
  scl: {
    list: () => ipcRenderer.invoke('scl:list'),
    install: (config) => ipcRenderer.invoke('scl:install', config),
    uninstall: (id) => ipcRenderer.invoke('scl:uninstall', id),
    update: (id, config) => ipcRenderer.invoke('scl:update', id, config),
    toggle: (id, enabled) => ipcRenderer.invoke('scl:toggle', id, enabled),
    getEnabledSkills: () => ipcRenderer.invoke('scl:getEnabledSkills'),
    fetchRemoteCatalog: (url) => ipcRenderer.invoke('scl:fetchRemoteCatalog', url),
    installFromRemote: (url, entries) => ipcRenderer.invoke('scl:installFromRemote', url, entries),
  },
  marketplace: {
    listRegistries: () => ipcRenderer.invoke('marketplace:listRegistries'),
    fetchAll: () => ipcRenderer.invoke('marketplace:fetchAll'),
    fetchOne: (registry) => ipcRenderer.invoke('marketplace:fetchOne', registry),
    search: (listings, filters) => ipcRenderer.invoke('marketplace:search', listings, filters),
    install: (listing) => ipcRenderer.invoke('marketplace:install', listing),
  },
  usage: {
    record: (record) => ipcRenderer.invoke('usage:record', record),
    getDailyStats: (days) => ipcRenderer.invoke('usage:getDailyStats', days),
    getTodaySummary: () => ipcRenderer.invoke('usage:getTodaySummary'),
  },
  weather: {
    fetch: (city: string) => ipcRenderer.invoke('weather:fetch', city),
  },
  search: {
    files: (options: SearchOptions) => ipcRenderer.invoke('search:files', options),
    messages: (keyword: string, limit?: number) =>
      ipcRenderer.invoke('search:messages', keyword, limit),
    conversations: (keyword: string, limit?: number) =>
      ipcRenderer.invoke('search:conversations', keyword, limit),
  },
  terminal: {
    create: (shell: 'powershell' | 'cmd' | 'bash' | 'wsl', cwd: string) =>
      ipcRenderer.invoke('terminal:create', shell, cwd),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('terminal:write', id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    list: () => ipcRenderer.invoke('terminal:list'),
    getOutput: (id: string, lines?: number) =>
      ipcRenderer.invoke('terminal:getOutput', id, lines),
  },
  onTerminalOutput: (callback) => {
    const handler = (_e: unknown, payload: { id: string; data: string }) => callback(payload)
    ipcRenderer.on('terminal:output', handler)
    return () => ipcRenderer.removeListener('terminal:output', handler)
  },
  onTerminalExit: (callback) => {
    const handler = (_e: unknown, payload: { id: string; code: number | null }) => callback(payload)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  tts: {
    synthesize: (text: string, options?: {
      voice?: string
      rate?: number
      volume?: number
      format?: 'mp3' | 'wav'
      cloneVoiceId?: string
    }) => ipcRenderer.invoke('tts:synthesize', text, options),
    cleanupAudio: (filePath: string) => ipcRenderer.invoke('tts:cleanupAudio', filePath),
    listVoices: () => ipcRenderer.invoke('tts:listVoices'),
    getSettings: () => ipcRenderer.invoke('tts:getSettings'),
    selectAudio: () => ipcRenderer.invoke('tts:selectAudio'),
    cloneVoice: (audioPath: string, referenceText: string) =>
      ipcRenderer.invoke('tts:cloneVoice', audioPath, referenceText),
  },
  goal: {
    listGoals: (type?: 'long_term' | 'session') =>
      ipcRenderer.invoke('goal:listGoals', type),
    getGoal: (id: string) => ipcRenderer.invoke('goal:getGoal', id),
    createGoal: (dto) => ipcRenderer.invoke('goal:createGoal', dto),
    updateGoalStatus: (id: string, status: 'active' | 'completed' | 'archived') =>
      ipcRenderer.invoke('goal:updateGoalStatus', id, status),
    deleteGoal: (id: string) => ipcRenderer.invoke('goal:deleteGoal', id),
    listTasks: (goalId: string, status?) => ipcRenderer.invoke('goal:listTasks', goalId, status),
    createTask: (dto) => ipcRenderer.invoke('goal:createTask', dto),
    updateTaskStatus: (id: string, status) => ipcRenderer.invoke('goal:updateTaskStatus', id, status),
    updateTask: (id: string, updates) => ipcRenderer.invoke('goal:updateTask', id, updates),
    deleteTask: (id: string) => ipcRenderer.invoke('goal:deleteTask', id),
  },
  memory: {
    list: (partition?) => ipcRenderer.invoke('memory:list', partition),
    search: (query) => ipcRenderer.invoke('memory:search', query),
    get: (id: string) => ipcRenderer.invoke('memory:get', id),
    create: (dto) => ipcRenderer.invoke('memory:create', dto),
    update: (id: string, dto) => ipcRenderer.invoke('memory:update', id, dto),
    delete: (id: string) => ipcRenderer.invoke('memory:delete', id),
    stats: () => ipcRenderer.invoke('memory:stats'),
    exportObsidian: (options) => ipcRenderer.invoke('memory:exportObsidian', options),
  },
  supercontext: {
    build: (workspacePath: string, userMessage: string, timeoutMs?: number) =>
      ipcRenderer.invoke('supercontext:build', workspacePath, userMessage, timeoutMs),
    format: (briefing) => ipcRenderer.invoke('supercontext:format', briefing),
  },
  sync: {
    listSources: () => ipcRenderer.invoke('sync:listSources'),
    addSource: (dto) => ipcRenderer.invoke('sync:addSource', dto),
    updateSource: (id, dto) => ipcRenderer.invoke('sync:updateSource', id, dto),
    removeSource: (id) => ipcRenderer.invoke('sync:removeSource', id),
    triggerNow: () => ipcRenderer.invoke('sync:triggerNow'),
    getSchedulerStatus: () => ipcRenderer.invoke('sync:getSchedulerStatus'),
  },
  evolution: {
    run: (params) => ipcRenderer.invoke('evolution:run', params),
    history: (skillId: string) => ipcRenderer.invoke('evolution:history', skillId),
    rollback: (skillId: string, versionId: string) =>
      ipcRenderer.invoke('evolution:rollback', skillId, versionId),
    compare: (runId: string) => ipcRenderer.invoke('evolution:compare', runId),
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    update: (params) => ipcRenderer.invoke('profile:update', params),
    clear: () => ipcRenderer.invoke('profile:clear'),
  },
  cron: {
    create: (params) => ipcRenderer.invoke('cron:create', params),
    list: () => ipcRenderer.invoke('cron:list'),
    delete: (id: string) => ipcRenderer.invoke('cron:delete', id),
    toggle: (id: string) => ipcRenderer.invoke('cron:toggle', id),
    history: () => ipcRenderer.invoke('cron:history'),
  },
  trace: {
    query: (query) => ipcRenderer.invoke('trace:query', query),
    stats: () => ipcRenderer.invoke('trace:stats'),
  },
}
