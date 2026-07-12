/** RPC 工具调用 */
export interface RpcToolCall {
  toolName: string
  args: Record<string, unknown>
}

/** RPC 工具调用结果 */
export interface RpcToolResult {
  toolName: string
  success: boolean
  result: unknown
  error?: string
  durationMs: number
}

/** 脚本执行结果 */
export interface RpcScriptResult {
  success: boolean
  output: unknown
  toolCalls: RpcToolResult[]
  durationMs: number
  error?: string
  timedOut: boolean
}

/** 可用 RPC 工具信息 */
export interface RpcToolInfo {
  name: string
  description: string
  parameters: Array<{ name: string; type: string; required: boolean }>
}
