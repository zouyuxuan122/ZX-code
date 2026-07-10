/** MCP 服务器配置 */
export interface McpServerConfig {
  id: string
  name: string
  /** 服务器类型：本地进程或远程 URL */
  type: 'local' | 'remote'
  /** 本地服务器：启动命令 */
  command?: string
  /** 本地服务器：命令参数 */
  args?: string[]
  /** 本地服务器：环境变量 */
  env?: Record<string, string>
  /** 远程服务器：URL */
  url?: string
  /** 远程服务器：请求头 */
  headers?: Record<string, string>
  /** 是否启用 */
  enabled: boolean
  /** 连接超时（毫秒） */
  timeout?: number
}

/** MCP 服务器状态 */
export interface McpServerStatus {
  id: string
  name: string
  connected: boolean
  error?: string
  toolCount: number
  lastConnected?: number
}

/** MCP 工具定义（来自外部服务器） */
export interface McpToolDefinition {
  serverId: string
  serverName: string
  name: string
  description: string
  inputSchema: object
}

/** MCP API 接口 */
export interface McpApi {
  listServers(): Promise<McpServerConfig[]>
  addServer(config: Omit<McpServerConfig, 'id'>): Promise<McpServerConfig>
  updateServer(id: string, config: Partial<McpServerConfig>): Promise<McpServerConfig>
  removeServer(id: string): Promise<void>
  connectServer(id: string): Promise<McpServerStatus>
  disconnectServer(id: string): Promise<void>
  listStatus(): Promise<McpServerStatus[]>
  listTools(): Promise<McpToolDefinition[]>
}
