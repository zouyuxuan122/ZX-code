import type { BuiltinTool, ToolDefinition, ToolContext } from '@shared/types/tool'
import { toolRegistry } from './registry'
import { logger } from '../services/logger.service'
import { getMcpTools } from '../services/mcp.service'
import { syncMcpToolExecutors } from './registry'
import { getDb } from '../database'
import { GoalService } from '../services/goal.service'
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
import { createGoalTool } from './builtin/goal.tool'
import { createCronManageTool } from './builtin/cron_manage.tool'
import { CronAgentService } from '../services/cron-agent.service'
import type { SchedulerService } from '../services/scheduler.service'
import { createSkillCreateTool } from './builtin/skill_create.tool'
import { SkillCreatorService } from '../services/skill-creator.service'
import { ToolRpcService } from '../services/tool-rpc.service'
import { ScriptSandboxService } from '../services/script-sandbox.service'
import { createRunScriptTool } from './builtin/run_script.tool'
import type { RpcToolInfo } from '@shared/types/rpc-script'

/** 静态内置工具列表（无需依赖注入的工具） */
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
/** CronAgentService 单例（registerBuiltinTools 时构造，供 index.ts 启动时调用 loadAndRegisterAll） */
let cronAgentServiceInstance: CronAgentService | null = null
/** ToolRpcService 单例（供脚本通过 RPC 调用已注册工具） */
let toolRpcServiceInstance: ToolRpcService | null = null
/** ScriptSandboxService 单例（供 run_script 工具执行沙箱脚本） */
let sandboxServiceInstance: ScriptSandboxService | null = null

/**
 * RPC 工具白名单——仅包含只读/无副作用工具
 *
 * 沙箱脚本（run_script）通过 RPC 调用这些工具时不受权限审批约束，
 * 因此有副作用的工具（write_file/edit/run_command/cron_manage/skill_create/goal_manage）
 * 必须排除，防止脚本绕过权限系统执行危险操作。
 */
export const RPC_ALLOWED_TOOLS = new Set<string>([
  'read_file',
  'list_files',
  'search_files',
  'grep',
  'webfetch',
  'websearch',
  'terminal_read',
  'todo_write',
])

/**
 * 从 BuiltinTool 提取 RPC 工具信息（name/description/parameters）
 */
function extractRpcToolInfo(tool: BuiltinTool): RpcToolInfo {
  const required = tool.required || []
  const parameters: RpcToolInfo['parameters'] = Object.entries(tool.parameters).map(
    ([name, schema]) => ({
      name,
      type: (schema as { type?: string })?.type || 'unknown',
      required: required.includes(name),
    }),
  )
  return { name: tool.name, description: tool.description, parameters }
}

/**
 * 将一个内置工具注册为 RPC 工具，使其可被沙箱脚本通过 tools.xxx(args) 调用
 *
 * 注意：RPC 调用时使用最小默认上下文（workspacePath 为空），
 * 依赖 workspacePath 的工具（如 read_file）在脚本中可能无法正常解析相对路径。
 */
function registerBuiltinAsRpc(rpcService: ToolRpcService, tool: BuiltinTool): void {
  const info = extractRpcToolInfo(tool)
  rpcService.registerRpcTool(info.name, info.description, info.parameters, async (args) => {
    const ctx: ToolContext = {
      workspacePath: '',
      projectId: null,
      conversationId: '',
      autoAccept: true,
    }
    const result = await tool.execute(args, ctx)
    return result
  })
}

/**
 * 注册所有内置工具，幂等
 * goal_manage 工具需要 GoalService 依赖注入，在注册时构造（确保 DB 已初始化）
 * cron_manage 工具需要 CronAgentService + SchedulerService 依赖注入
 * run_script 工具需要 ScriptSandboxService 依赖注入
 */
export function registerBuiltinTools(scheduler?: SchedulerService): void {
  if (registered) return
  for (const tool of builtinTools) {
    toolRegistry.registerTool(tool)
  }
  const goalTool = createGoalTool(new GoalService(getDb()))
  toolRegistry.registerTool(goalTool)
  // skill_create 工具：Agent 主动创建技能时使用
  // 工具仅调用 saveSkill，generator 用 no-op（自动流程在 engine.ts 中单独构造）
  const skillCreatorService = new SkillCreatorService(async () => null)
  const skillCreateTool = createSkillCreateTool(skillCreatorService)
  toolRegistry.registerTool(skillCreateTool)
  // cron_manage 工具：管理定时 Agent 任务
  // 注入 getToolDefinitions 避免 tools <-> cron-agent.service 循环依赖
  if (scheduler) {
    cronAgentServiceInstance = new CronAgentService(getDb(), scheduler, getToolDefinitions)
    const cronTool = createCronManageTool(cronAgentServiceInstance)
    toolRegistry.registerTool(cronTool)
  }
  // run_script 工具 + RPC 服务：在隔离沙箱中执行脚本，脚本可调用其他工具
  toolRpcServiceInstance = new ToolRpcService()
  sandboxServiceInstance = new ScriptSandboxService(toolRpcServiceInstance)
  const runScriptTool = createRunScriptTool(sandboxServiceInstance)
  toolRegistry.registerTool(runScriptTool)
  // 将白名单内的只读工具注册为 RPC 工具（供脚本调用）
  // 有副作用的工具（write_file/edit/run_command/cron_manage/skill_create/goal_manage/run_script）
  // 不注册为 RPC，防止沙箱脚本绕过权限审批
  for (const tool of toolRegistry.getAllTools()) {
    if (!RPC_ALLOWED_TOOLS.has(tool.name)) continue
    registerBuiltinAsRpc(toolRpcServiceInstance, tool)
  }
  registered = true
  const rpcCount = toolRpcServiceInstance.getAvailableTools().length
  logger.info(
    `已注册 ${toolRegistry.getAllTools().length} 个内置工具，${rpcCount} 个 RPC 工具可供脚本调用`,
  )
}

/** 获取 CronAgentService 单例（registerBuiltinTools 之后可用） */
export function getCronAgentService(): CronAgentService | null {
  return cronAgentServiceInstance
}

/** 获取 ToolRpcService 单例（registerBuiltinTools 之后可用） */
export function getToolRpcService(): ToolRpcService | null {
  return toolRpcServiceInstance
}

/** 获取 ScriptSandboxService 单例（registerBuiltinTools 之后可用） */
export function getSandboxService(): ScriptSandboxService | null {
  return sandboxServiceInstance
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
