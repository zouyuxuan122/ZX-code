import type { BuiltinTool, ToolDefinition, ToolExecutionResult } from '@shared/types/tool'
import type { McpToolDefinition } from '@shared/types/mcp'
import { logger } from '../services/logger.service'
import { callMcpTool } from '../services/mcp.service'

/**
 * 工具注册器
 * 维护一个工具名称到工具实例的映射，提供注册、查询与定义导出能力
 */
class ToolRegistryImpl {
  private tools = new Map<string, BuiltinTool>()

  /**
   * 注册一个工具；若同名工具已存在，将覆盖旧实现
   */
  registerTool(tool: BuiltinTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`工具 ${tool.name} 已存在，将被覆盖`)
    }
    this.tools.set(tool.name, tool)
    logger.debug(`已注册工具: ${tool.name}`)
  }

  /**
   * 根据名称获取工具实例
   */
  getTool(name: string): BuiltinTool | undefined {
    return this.tools.get(name)
  }

  /**
   * 获取全部已注册的工具实例
   */
  getAllTools(): BuiltinTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取全部工具定义（用于传给 Provider 的 tools 字段）
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters,
          ...(tool.required && tool.required.length > 0 ? { required: tool.required } : {}),
        },
      },
    }))
  }

  /**
   * 清空所有已注册的工具
   */
  clear(): void {
    this.tools.clear()
  }
}

export const toolRegistry = new ToolRegistryImpl()

// ============================================================================
// MCP 工具执行器
// ============================================================================

/**
 * 生成合法的 MCP 工具名。
 *
 * OpenAI 兼容 API（含 DeepSeek）要求 function.name 匹配 `^[a-zA-Z0-9_-]+$`，
 * 但 MCP serverName 可能含空格、点号、中文等非法字符（如 "Google Drive"、"GitHub MCP Server"），
 * 直接拼接会导致 API 返回 HTTP 400 Invalid tools[N].function.name。
 *
 * 此函数将 serverName / toolName 中所有非 `[a-zA-Z0-9_-]` 字符替换为 `_`，
 * 并在描述中保留原始 serverName 以便用户识别来源。
 */
function sanitizeMcpToolName(serverName: string, toolName: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `mcp_${sanitize(serverName)}_${sanitize(toolName)}`
}

/**
 * 将 MCP 工具包装为 BuiltinTool，使其可被 Agent 调用
 *
 * 命名规则：`mcp_<sanitizedServerName>_<sanitizedToolName>`，
 * 执行时通过闭包捕获的 serverId + 原始 toolName 调用 MCP，不受 name sanitize 影响。
 */
function mcpToolToBuiltin(mt: McpToolDefinition): BuiltinTool {
  const schema =
    mt.inputSchema && typeof mt.inputSchema === 'object'
      ? (mt.inputSchema as {
          type?: string
          properties?: Record<string, unknown>
          required?: string[]
        })
      : {}
  const properties = schema.properties || {}
  const required = schema.required || []
  return {
    name: sanitizeMcpToolName(mt.serverName, mt.name),
    description: `[${mt.serverName}] ${mt.description}`,
    parameters: properties,
    required,
    requiredPermissions: [],
    async execute(args): Promise<ToolExecutionResult> {
      const result = await callMcpTool(mt.serverId, mt.name, args)
      return result
    },
  }
}

/**
 * 同步 MCP 工具执行器到 registry
 *
 * 每次 MCP 服务器连接/断开后，工具列表会发生变化，
 * 此函数负责把最新的 MCP 工具集合注册到 toolRegistry，
 * 并清理已失效的 MCP 工具条目。
 *
 * @param mcpTools 当前所有已连接 MCP 服务器的工具列表
 */
export function syncMcpToolExecutors(mcpTools: McpToolDefinition[]): void {
  // 计算最新 MCP 工具名称集合（使用 sanitize 后的名称，与 mcpToolToBuiltin 保持一致）
  const newNames = new Set(mcpTools.map(mt => sanitizeMcpToolName(mt.serverName, mt.name)))
  // 收集要保留的非 MCP 内置工具
  const builtinTools = toolRegistry.getAllTools().filter(t => !t.name.startsWith('mcp_'))
  // 标记失效的 MCP 工具日志
  for (const name of toolRegistry.getAllTools().map(t => t.name)) {
    if (name.startsWith('mcp_') && !newNames.has(name)) {
      logger.debug(`移除失效的 MCP 工具: ${name}`)
    }
  }
  // 重建 registry
  toolRegistry.clear()
  for (const tool of builtinTools) {
    // 直接调用 registerTool 会触发日志，使用 set 静默注册
    ;(toolRegistry as unknown as { tools: Map<string, BuiltinTool> }).tools.set(tool.name, tool)
  }
  // 注册新的 MCP 工具
  for (const mt of mcpTools) {
    ;(toolRegistry as unknown as { tools: Map<string, BuiltinTool> }).tools.set(
      sanitizeMcpToolName(mt.serverName, mt.name),
      mcpToolToBuiltin(mt),
    )
  }
  logger.debug(`MCP 工具执行器已同步，共 ${mcpTools.length} 个 MCP 工具`)
}

