import type { BuiltinTool, ToolDefinition } from '@shared/types/tool'
import { toolRegistry } from './registry'
import { logger } from '../services/logger.service'
import { getMcpTools } from '../services/mcp.service'
import { syncMcpToolExecutors } from './registry'
import { readFileTool } from './builtin/read_file.tool'
import { writeFileTool } from './builtin/write_file.tool'
import { editTool } from './builtin/edit.tool'
import { listFilesTool } from './builtin/list_files.tool'
import { runCommandTool } from './builtin/run_command.tool'
import { searchFilesTool } from './builtin/search_files.tool'
import { grepTool } from './builtin/grep.tool'
import { todoWriteTool } from './builtin/todo_write.tool'
import { questionTool } from './builtin/question.tool'
import { taskTool } from './builtin/task.tool'
import { webfetchTool } from './builtin/webfetch.tool'
import { websearchTool } from './builtin/websearch.tool'
import { terminalReadTool } from './builtin/terminal_read.tool'

/** 所有内置工具列表 */
const builtinTools: BuiltinTool[] = [
  readFileTool,
  writeFileTool,
  listFilesTool,
  runCommandTool,
  searchFilesTool,
  grepTool,
  todoWriteTool,
  questionTool,
  taskTool,
  webfetchTool,
  websearchTool,
  terminalReadTool,
]

let registered = false

/**
 * 注册所有内置工具，幂等
 */
export function registerBuiltinTools(): void {
  if (registered) return
  for (const tool of builtinTools) {
    toolRegistry.registerTool(tool)
  }
  registered = true
  logger.info(`已注册 ${builtinTools.length} 个内置工具`)
}

/**
 * 获取已注册的全部工具实例
 */
export function getRegisteredTools(): BuiltinTool[] {
  return toolRegistry.getAllTools()
}

/**
 * 获取全部工具定义（用于传给 Provider）
 *
 * 包含内置工具 + 已连接的 MCP 服务器的工具。
 * 调用时会先把当前 MCP 工具执行器同步到 registry（保留内置工具，
 * 替换所有 `mcp_` 前缀工具），使 MCP 工具可被 Agent 调用。
 */
export function getToolDefinitions(): ToolDefinition[] {
  // 同步 MCP 工具执行器到 registry，使其可被 Agent 调用
  // syncMcpToolExecutors 会保留内置工具并替换所有 mcp_ 前缀工具
  syncMcpToolExecutors(getMcpTools())
  // 返回 registry 中的所有工具定义（内置 + MCP）
  return toolRegistry.getToolDefinitions()
}

export { toolRegistry }
