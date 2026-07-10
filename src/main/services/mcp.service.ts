import { spawn, ChildProcess } from 'child_process'
import * as settingsRepo from '../database/repositories/settings.repo'
import { logger } from './logger.service'
import { killProcessTree } from '../utils/process.util'
import type { McpServerConfig, McpServerStatus, McpToolDefinition } from '@shared/types/mcp'
import type { ToolExecutionResult } from '@shared/types/tool'

/** settings 表中的存储键 */
const MCP_SERVERS_KEY = 'mcp.servers'

/** 默认连接超时（毫秒） */
const DEFAULT_TIMEOUT = 30000

// ============================================================================
// 内部状态
// ============================================================================

/** MCP 客户端接口（本地/远程通用） */
interface McpClient {
  /** 发送 JSON-RPC 请求并等待响应 */
  request(method: string, params?: unknown, timeout?: number): Promise<unknown>
  /** 关闭连接 */
  close(): Promise<void>
}

/** 本地进程 MCP 客户端（基于 stdio JSON-RPC） */
class LocalMcpClient implements McpClient {
  private process: ChildProcess
  private pendingRequests = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >()
  private nextRequestId = 1
  private buffer = ''
  private closed = false

  constructor(config: McpServerConfig) {
    if (!config.command) {
      throw new Error('本地 MCP 服务器缺少 command 参数')
    }
    this.process = spawn(config.command, config.args || [], {
      env: { ...process.env, ...(config.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      // 按行分割处理 JSON-RPC 消息
      let newlineIdx: number
      while ((newlineIdx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newlineIdx).trim()
        this.buffer = this.buffer.slice(newlineIdx + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          this.handleMessage(msg)
        } catch {
          // 忽略无法解析的行
        }
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      logger.warn(`MCP 本地服务器 [${config.name}] stderr: ${data.toString()}`)
    })

    this.process.on('exit', (code) => {
      logger.info(`MCP 本地服务器 [${config.name}] 退出，code=${code}`)
      this.cleanupPending(new Error(`MCP 服务器进程退出 (code=${code})`))
    })

    this.process.on('error', (err) => {
      logger.error(`MCP 本地服务器 [${config.name}] 启动失败: ${err.message}`, err)
      this.cleanupPending(err)
    })
  }

  private handleMessage(msg: unknown): void {
    const m = msg as { id?: number; result?: unknown; error?: { message?: string } }
    if (typeof m.id !== 'number') return
    const pending = this.pendingRequests.get(m.id)
    if (!pending) return
    this.pendingRequests.delete(m.id)
    clearTimeout(pending.timer)
    if (m.error) {
      pending.reject(new Error(m.error.message || 'MCP 请求失败'))
    } else {
      pending.resolve(m.result)
    }
  }

  private cleanupPending(err: Error): void {
    this.closed = true
    for (const pending of Array.from(this.pendingRequests.values())) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    this.pendingRequests.clear()
  }

  request(method: string, params?: unknown, timeout = DEFAULT_TIMEOUT): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('MCP 客户端已关闭'))
    }
    const id = this.nextRequestId++
    const msg = { jsonrpc: '2.0', id, method, params: params ?? {} }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`MCP 请求超时: ${method} (${timeout}ms)`))
        }
      }, timeout)
      this.pendingRequests.set(id, { resolve, reject, timer })
      try {
        this.process.stdin?.write(JSON.stringify(msg) + '\n')
      } catch (err) {
        clearTimeout(timer)
        this.pendingRequests.delete(id)
        reject(new Error(`发送 MCP 请求失败: ${(err as Error).message}`))
      }
    })
  }

  async close(): Promise<void> {
    this.closed = true
    this.cleanupPending(new Error('客户端已关闭'))
    // 使用 killProcessTree 杀掉整个进程树
    // Windows 上 shell:true 启动的是 cmd.exe 子进程，process.kill() 只杀 cmd.exe
    killProcessTree(this.process)
  }
}

/** 远程 HTTP MCP 客户端（基于 HTTP POST JSON-RPC） */
class RemoteMcpClient implements McpClient {
  private nextRequestId = 1
  private closed = false

  constructor(
    private url: string,
    private headers: Record<string, string> = {},
  ) {}

  async request(method: string, params?: unknown, timeout = DEFAULT_TIMEOUT): Promise<unknown> {
    if (this.closed) {
      throw new Error('MCP 客户端已关闭')
    }
    const id = this.nextRequestId++
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body,
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`MCP HTTP 请求失败: ${res.status} ${res.statusText}`)
      }
      const data = (await res.json()) as { result?: unknown; error?: { message?: string } }
      if (data.error) {
        throw new Error(data.error.message || 'MCP 请求失败')
      }
      return data.result
    } finally {
      clearTimeout(timer)
    }
  }

  async close(): Promise<void> {
    this.closed = true
  }
}

// ============================================================================
// 服务状态
// ============================================================================

/** 已连接的客户端映射：serverId -> client */
const clients = new Map<string, McpClient>()
/** 工具缓存：serverId -> 工具列表 */
const toolsCache = new Map<string, McpToolDefinition[]>()
/** 服务器错误信息：serverId -> error */
const errorMap = new Map<string, string>()
/** 最后连接时间：serverId -> timestamp */
const lastConnectedMap = new Map<string, number>()

// ============================================================================
// 配置管理
// ============================================================================

/** 生成服务器 ID */
function generateId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 读取所有 MCP 服务器配置 */
function loadServers(): McpServerConfig[] {
  const raw = settingsRepo.get(MCP_SERVERS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is McpServerConfig => {
    if (!item || typeof item !== 'object') return false
    const r = item as Record<string, unknown>
    return (
      typeof r.id === 'string' &&
      typeof r.name === 'string' &&
      (r.type === 'local' || r.type === 'remote') &&
      typeof r.enabled === 'boolean'
    )
  })
}

/** 保存所有 MCP 服务器配置 */
function saveServers(servers: McpServerConfig[]): void {
  settingsRepo.set(MCP_SERVERS_KEY, servers, 'mcp')
  logger.debug(`MCP 服务器配置已保存，共 ${servers.length} 个`)
}

/** 获取所有 MCP 服务器配置 */
export function getMcpServers(): McpServerConfig[] {
  return loadServers()
}

/** 添加 MCP 服务器配置 */
export function addMcpServer(config: Omit<McpServerConfig, 'id'>): McpServerConfig {
  const servers = loadServers()
  const newServer: McpServerConfig = {
    ...config,
    id: generateId(),
  }
  servers.push(newServer)
  saveServers(servers)
  logger.info(`已添加 MCP 服务器: ${newServer.name} (${newServer.id})`)
  return newServer
}

/** 更新 MCP 服务器配置 */
export function updateMcpServer(id: string, config: Partial<McpServerConfig>): McpServerConfig {
  const servers = loadServers()
  const idx = servers.findIndex(s => s.id === id)
  if (idx < 0) {
    throw new Error(`MCP 服务器不存在: ${id}`)
  }
  // 不允许修改 id
  const { id: _omit, ...rest } = config
  void _omit
  const updated: McpServerConfig = { ...servers[idx], ...rest }
  servers[idx] = updated
  saveServers(servers)
  logger.info(`已更新 MCP 服务器: ${updated.name} (${updated.id})`)
  // 如果服务器已连接且配置变化，需要断开重连（这里仅断开，由调用方决定是否重连）
  if (clients.has(id)) {
    void disconnectMcpServer(id).catch(() => {})
  }
  return updated
}

/** 删除 MCP 服务器配置 */
export function removeMcpServer(id: string): void {
  const servers = loadServers()
  const idx = servers.findIndex(s => s.id === id)
  if (idx < 0) {
    throw new Error(`MCP 服务器不存在: ${id}`)
  }
  // 先断开连接
  void disconnectMcpServer(id).catch(() => {})
  const removed = servers.splice(idx, 1)[0]
  saveServers(servers)
  logger.info(`已删除 MCP 服务器: ${removed.name} (${id})`)
}

// ============================================================================
// 连接管理
// ============================================================================

/** 创建 MCP 客户端 */
function createClient(config: McpServerConfig): McpClient {
  if (config.type === 'local') {
    return new LocalMcpClient(config)
  } else if (config.type === 'remote') {
    if (!config.url) {
      throw new Error('远程 MCP 服务器缺少 url 参数')
    }
    return new RemoteMcpClient(config.url, config.headers || {})
  }
  throw new Error(`未知的 MCP 服务器类型: ${config.type}`)
}

/** 连接到 MCP 服务器 */
export async function connectMcpServer(id: string): Promise<McpServerStatus> {
  const servers = loadServers()
  const config = servers.find(s => s.id === id)
  if (!config) {
    throw new Error(`MCP 服务器不存在: ${id}`)
  }
  if (!config.enabled) {
    throw new Error(`MCP 服务器已禁用: ${config.name}`)
  }
  // 若已连接，先断开
  if (clients.has(id)) {
    await disconnectMcpServer(id)
  }

  const timeout = config.timeout ?? DEFAULT_TIMEOUT
  try {
    logger.info(`正在连接 MCP 服务器: ${config.name} (${id})`)
    const client = createClient(config)

    // 1. initialize
    await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'zx-code', version: '0.1.0' },
    }, timeout)

    // 2. tools/list
    const toolsResult = await client.request('tools/list', {}, timeout) as {
      tools?: Array<{ name: string; description?: string; inputSchema?: object }>
    }
    const tools = (toolsResult?.tools || []).map(t => ({
      serverId: id,
      serverName: config.name,
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }))
    toolsCache.set(id, tools)
    clients.set(id, client)
    errorMap.delete(id)
    const now = Date.now()
    lastConnectedMap.set(id, now)

    logger.info(
      `MCP 服务器 [${config.name}] 已连接，发现 ${tools.length} 个工具`,
    )
    return {
      id,
      name: config.name,
      connected: true,
      toolCount: tools.length,
      lastConnected: now,
    }
  } catch (err) {
    const message = (err as Error).message || String(err)
    logger.error(`MCP 服务器 [${config.name}] 连接失败: ${message}`, err as Error)
    errorMap.set(id, message)
    clients.delete(id)
    toolsCache.delete(id)
    return {
      id,
      name: config.name,
      connected: false,
      error: message,
      toolCount: 0,
    }
  }
}

/** 断开 MCP 服务器连接 */
export async function disconnectMcpServer(id: string): Promise<void> {
  const client = clients.get(id)
  if (!client) {
    return
  }
  try {
    await client.close()
  } catch (err) {
    logger.warn(`关闭 MCP 客户端失败 [id=${id}]: ${(err as Error).message}`)
  }
  clients.delete(id)
  toolsCache.delete(id)
  logger.info(`MCP 服务器 [${id}] 已断开`)
}

/**
 * 断开所有已连接的 MCP 服务器。
 * 在应用退出（before-quit）时调用，防止 MCP 子进程泄漏。
 */
export async function disconnectAllServers(): Promise<void> {
  const ids = Array.from(clients.keys())
  if (ids.length === 0) return
  logger.info(`[mcp] disconnectAllServers 正在断开 ${ids.length} 个服务器...`)
  await Promise.all(ids.map((id) => disconnectMcpServer(id)))
  logger.info(`[mcp] disconnectAllServers 完成`)
}

/** 获取所有 MCP 服务器状态 */
export function getMcpServerStatuses(): McpServerStatus[] {
  const servers = loadServers()
  return servers.map(s => {
    const connected = clients.has(s.id)
    const tools = toolsCache.get(s.id) || []
    return {
      id: s.id,
      name: s.name,
      connected,
      error: errorMap.get(s.id),
      toolCount: connected ? tools.length : 0,
      lastConnected: lastConnectedMap.get(s.id),
    }
  })
}

// ============================================================================
// 工具发现与调用
// ============================================================================

/** 获取所有已连接服务器的工具列表 */
export function getMcpTools(): McpToolDefinition[] {
  const all: McpToolDefinition[] = []
  for (const tools of Array.from(toolsCache.values())) {
    all.push(...tools)
  }
  return all
}

/**
 * 调用 MCP 工具
 *
 * @param serverId 服务器 ID
 * @param toolName 工具名称
 * @param args 工具参数
 */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: object,
): Promise<ToolExecutionResult> {
  const client = clients.get(serverId)
  if (!client) {
    return {
      tool_call_id: '',
      content: `MCP 服务器未连接: ${serverId}`,
      is_error: true,
    }
  }
  const servers = loadServers()
  const config = servers.find(s => s.id === serverId)
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT

  try {
    const result = (await client.request(
      'tools/call',
      { name: toolName, arguments: args },
      timeout,
    )) as { content?: Array<{ type: string; text?: string }> ; isError?: boolean }

    // 拼接文本内容
    let content = ''
    const items = result?.content || []
    for (const item of items) {
      if (item.type === 'text' && typeof item.text === 'string') {
        content += item.text
      } else {
        content += JSON.stringify(item)
      }
    }
    if (!content) {
      content = '(MCP 工具未返回内容)'
    }
    return {
      tool_call_id: '',
      content,
      is_error: result?.isError === true,
    }
  } catch (err) {
    const message = (err as Error).message || String(err)
    logger.error(`MCP 工具调用失败 [server=${serverId}, tool=${toolName}]: ${message}`, err as Error)
    // 如果是连接类错误，标记服务器错误状态
    if (clients.has(serverId)) {
      // 检测进程是否还存活：如果客户端已死，清理状态
      // 简化处理：仅在下次状态查询时检测
    }
    return {
      tool_call_id: '',
      content: `MCP 工具调用失败: ${message}`,
      is_error: true,
    }
  }
}
