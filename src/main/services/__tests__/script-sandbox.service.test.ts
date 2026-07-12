import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToolRpcService } from '../tool-rpc.service'
import { ScriptSandboxService } from '../script-sandbox.service'

describe('ScriptSandboxService', () => {
  let rpcService: ToolRpcService
  let sandbox: ScriptSandboxService

  beforeEach(() => {
    rpcService = new ToolRpcService()
    sandbox = new ScriptSandboxService(rpcService)
  })

  describe('正常执行', () => {
    it('return 1 + 2 返回 3', async () => {
      const result = await sandbox.executeScript('return 1 + 2', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe(3)
      expect(result.timedOut).toBe(false)
      expect(result.toolCalls).toEqual([])
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('可执行多行代码并返回最后结果', async () => {
      const code = `
        const x = 10
        const y = 20
        return x + y
      `
      const result = await sandbox.executeScript(code, 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe(30)
    })

    it('支持 async/await', async () => {
      const code = `
        const val = await Promise.resolve(42)
        return val
      `
      const result = await sandbox.executeScript(code, 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe(42)
    })
  })

  describe('RPC 工具调用', () => {
    it('脚本可通过 tools.xxx() 调用已注册的 RPC 工具', async () => {
      rpcService.registerRpcTool('read_file', '读取文件', [
        { name: 'path', type: 'string', required: true },
      ], async (args) => ({ content: `content of ${args.path}` }))

      const code = `
        const result = await tools.read_file({ path: '/test.txt' })
        return result
      `
      const result = await sandbox.executeScript(code, 5000)

      expect(result.success).toBe(true)
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('read_file')
      expect(result.toolCalls[0].success).toBe(true)
      expect(result.toolCalls[0].result).toEqual({ content: 'content of /test.txt' })
    })

    it('多次工具调用都被记录在 toolCalls 中', async () => {
      rpcService.registerRpcTool('get_a', 'A', [], () => 'a_result')
      rpcService.registerRpcTool('get_b', 'B', [], () => 'b_result')

      const code = `
        const a = await tools.get_a({})
        const b = await tools.get_b({})
        return { a, b }
      `
      const result = await sandbox.executeScript(code, 5000)

      expect(result.success).toBe(true)
      expect(result.toolCalls).toHaveLength(2)
      expect(result.toolCalls[0].toolName).toBe('get_a')
      expect(result.toolCalls[1].toolName).toBe('get_b')
    })

    it('工具调用失败时 result 记录错误但脚本可继续', async () => {
      rpcService.registerRpcTool('fail_tool', '会失败', [], () => {
        throw new Error('boom')
      })

      const code = `
        const result = await tools.fail_tool({})
        return result.success
      `
      const result = await sandbox.executeScript(code, 5000)

      expect(result.success).toBe(true)
      expect(result.output).toBe(false)
      expect(result.toolCalls[0].success).toBe(false)
      expect(result.toolCalls[0].error).toContain('boom')
    })
  })

  describe('安全性', () => {
    it('require 不可用（返回错误结果）', async () => {
      const result = await sandbox.executeScript(`return require('fs')`, 5000)
      expect(result.success).toBe(false)
      expect(result.error).toContain('require')
    })

    it('process 在沙箱中未定义', async () => {
      const result = await sandbox.executeScript('return typeof process', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe('undefined')
    })

    it('globalThis 上没有 require', async () => {
      const result = await sandbox.executeScript('return typeof globalThis.require', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe('undefined')
    })

    it('globalThis 上没有 process', async () => {
      const result = await sandbox.executeScript('return typeof globalThis.process', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe('undefined')
    })

    it('globalThis 上没有 Buffer', async () => {
      const result = await sandbox.executeScript('return typeof globalThis.Buffer', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe('undefined')
    })

    it('setTimeout 不可用', async () => {
      const result = await sandbox.executeScript('return typeof setTimeout', 5000)
      expect(result.success).toBe(true)
      expect(result.output).toBe('undefined')
    })
  })

  describe('超时', () => {
    it('死循环脚本在超时后被终止', async () => {
      const result = await sandbox.executeScript('while (true) {}', 100)
      expect(result.success).toBe(false)
      expect(result.timedOut).toBe(true)
      expect(result.error).toBeDefined()
    })

    it('超时不影响正常执行的脚本', async () => {
      const result = await sandbox.executeScript('return 1 + 1', 5000)
      expect(result.success).toBe(true)
      expect(result.timedOut).toBe(false)
      expect(result.output).toBe(2)
    })
  })

  describe('错误处理', () => {
    it('语法错误返回错误结果', async () => {
      const result = await sandbox.executeScript('return 1 +', 5000)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.timedOut).toBe(false)
    })

    it('运行时错误返回错误结果', async () => {
      const result = await sandbox.executeScript('throw new Error("runtime error")', 5000)
      expect(result.success).toBe(false)
      expect(result.error).toContain('runtime error')
    })

    it('脚本抛出错误时已完成的 toolCalls 仍被保留', async () => {
      rpcService.registerRpcTool('ok_tool', 'OK', [], () => 'done')
      const code = `
        await tools.ok_tool({})
        throw new Error('after call')
      `
      const result = await sandbox.executeScript(code, 5000)
      expect(result.success).toBe(false)
      expect(result.error).toContain('after call')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].toolName).toBe('ok_tool')
    })
  })
})
