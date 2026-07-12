import type { RpcToolResult, RpcToolInfo } from '@shared/types/rpc-script'

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown> | unknown

/**
 * ToolRpcService — 管理 RPC 工具执行器
 *
 * 注册的工具执行器可被沙箱脚本通过 tools.xxx(args) 调用，
 * 每次调用的结果（成功/失败）都会被记录。
 */
export class ToolRpcService {
  private executors = new Map<string, ToolExecutor>()
  private toolInfos = new Map<string, RpcToolInfo>()

  /**
   * 注册一个 RPC 工具执行器
   */
  registerRpcTool(
    name: string,
    description: string,
    parameters: RpcToolInfo['parameters'],
    executor: ToolExecutor,
  ): void {
    this.executors.set(name, executor)
    this.toolInfos.set(name, { name, description, parameters })
  }

  /**
   * 调用已注册的 RPC 工具，返回结构化结果
   */
  async callRpcTool(name: string, args: Record<string, unknown>): Promise<RpcToolResult> {
    const executor = this.executors.get(name)
    if (!executor) {
      return {
        toolName: name,
        success: false,
        result: null,
        error: `Tool "${name}" not registered`,
        durationMs: 0,
      }
    }
    const start = Date.now()
    try {
      const result = await executor(args)
      return {
        toolName: name,
        success: true,
        result,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        toolName: name,
        success: false,
        result: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      }
    }
  }

  /**
   * 获取所有已注册 RPC 工具的信息
   */
  getAvailableTools(): RpcToolInfo[] {
    return Array.from(this.toolInfos.values())
  }
}
