import vm from 'node:vm'
import type { RpcScriptResult, RpcToolResult } from '@shared/types/rpc-script'
import { ToolRpcService } from './tool-rpc.service'

/**
 * ScriptSandboxService — 在隔离的 vm 沙箱中执行用户脚本
 *
 * 安全保证：
 * - 沙箱上下文中不提供 require / process / global / Buffer / setTimeout / setInterval 等
 * - 脚本只能通过 tools.xxx(args) 调用已注册的 RPC 工具
 * - 同步超时由 vm.Script.runInContext 的 timeout 选项处理
 * - 异步超时由 Promise.race + setTimeout 处理
 *
 * 已知限制：若脚本在 await 之后的微任务中进入死循环，Node.js vm 无法强制终止。
 * 同步死循环（首个 await 之前）可被 vm timeout 正确终止。
 */
export class ScriptSandboxService {
  constructor(private rpcService: ToolRpcService) {}

  async executeScript(code: string, timeoutMs: number = 30000): Promise<RpcScriptResult> {
    const toolCalls: RpcToolResult[] = []
    const start = Date.now()

    // 创建 tools 代理对象：任意属性访问都返回一个调用 rpcService 的 async 函数
    const tools = new Proxy(
      {} as Record<string, (args: Record<string, unknown>) => Promise<RpcToolResult>>,
      {
        get: (_target, prop) => {
          if (typeof prop !== 'string') return undefined
          return async (args: Record<string, unknown>) => {
            const result = await this.rpcService.callRpcTool(prop, args || {})
            toolCalls.push(result)
            return result
          }
        },
      },
    )

    // 构建安全的沙箱上下文：仅暴露最小可用全局对象
    // 明确不提供：require, process, global, Buffer, setTimeout, setInterval, setImmediate,
    //             clearTimeout, clearInterval, clearImmediate, __dirname, __filename, module, exports
    const sandbox = {
      tools,
      console: {
        log: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    }

    // 将用户代码包裹在 async 函数中，使其可以使用 await 调用工具
    const wrappedCode = `(async () => {\n${code}\n})()`

    let promise: Promise<unknown>
    try {
      const context = vm.createContext(sandbox)
      const script = new vm.Script(wrappedCode, { filename: 'rpc-script.js' })
      // vm timeout 仅对同步执行生效（编译 + async 函数体在首个 await 之前的部分）
      promise = script.runInContext(context, { timeout: timeoutMs })
    } catch (err) {
      // 编译错误（语法错误）或同步执行错误（含同步超时）
      const errCode = (err as NodeJS.ErrnoException).code
      const isTimeout = errCode === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
      return {
        success: false,
        output: null,
        toolCalls,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        timedOut: isTimeout,
      }
    }

    // 异步超时：Promise.race 与 setTimeout 竞速
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Script execution timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    try {
      const result = await Promise.race([promise, timeoutPromise])
      if (timeoutId) clearTimeout(timeoutId)
      return {
        success: true,
        output: result,
        toolCalls,
        durationMs: Date.now() - start,
        timedOut: false,
      }
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)
      const errCode = (err as NodeJS.ErrnoException).code
      const isTimeout =
        errCode === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
        (err instanceof Error && err.message.includes('timed out'))
      return {
        success: false,
        output: null,
        toolCalls,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        timedOut: isTimeout,
      }
    }
  }
}
