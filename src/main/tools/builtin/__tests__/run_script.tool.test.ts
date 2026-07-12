import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToolRpcService } from '../../../services/tool-rpc.service'
import { ScriptSandboxService } from '../../../services/script-sandbox.service'
import { createRunScriptTool } from '../run_script.tool'
import type { BuiltinTool } from '@shared/types/tool'

describe('run_script tool', () => {
  let rpcService: ToolRpcService
  let sandboxService: ScriptSandboxService
  let tool: BuiltinTool

  beforeEach(() => {
    rpcService = new ToolRpcService()
    sandboxService = new ScriptSandboxService(rpcService)
    tool = createRunScriptTool(sandboxService)
  })

  const ctx = {
    workspacePath: '',
    projectId: null,
    conversationId: '',
    autoAccept: true,
  }

  describe('工具定义', () => {
    it('工具名称为 run_script', () => {
      expect(tool.name).toBe('run_script')
    })

    it('描述包含 script 或 RPC 或 batch 关键字', () => {
      expect(tool.description.toLowerCase()).toMatch(/script|rpc|batch/)
    })

    it('parameters 包含 code 字段且类型为 string', () => {
      const params = tool.parameters as Record<string, Record<string, unknown>>
      expect(params.code).toBeDefined()
      expect(params.code.type).toBe('string')
    })

    it('parameters 包含 timeout 字段且类型为 number', () => {
      const params = tool.parameters as Record<string, Record<string, unknown>>
      expect(params.timeout).toBeDefined()
      expect(params.timeout.type).toBe('number')
    })

    it('required 包含 code', () => {
      expect(tool.required).toContain('code')
    })

    it('requiredPermissions 包含 shell:execute（执行代码需确认）', () => {
      expect(tool.requiredPermissions).toContain('shell:execute')
    })
  })

  describe('execute', () => {
    it('执行简单脚本并返回结果', async () => {
      const result = await tool.execute(
        { code: 'return 1 + 2' },
        ctx,
      )
      expect(result.is_error).toBe(false)
      expect(result.content).toContain('3')
    })

    it('调用 sandbox 服务执行脚本', async () => {
      const spy = vi.spyOn(sandboxService, 'executeScript')
      await tool.execute({ code: 'return 42', timeout: 5000 }, ctx)
      expect(spy).toHaveBeenCalledWith('return 42', 5000)
    })

    it('未提供 timeout 时使用默认值', async () => {
      const spy = vi.spyOn(sandboxService, 'executeScript')
      await tool.execute({ code: 'return 1' }, ctx)
      expect(spy).toHaveBeenCalledWith('return 1', expect.any(Number))
      const calledTimeout = spy.mock.calls[0][1]
      expect(calledTimeout).toBeGreaterThan(0)
    })

    it('脚本中的工具调用结果包含在返回内容中', async () => {
      rpcService.registerRpcTool('get_value', '获取值', [], () => 'hello')
      const result = await tool.execute(
        { code: 'const r = await tools.get_value({}); return r.result' },
        ctx,
      )
      expect(result.is_error).toBe(false)
      expect(result.content).toContain('get_value')
    })

    it('安全错误（require）正确返回给 agent', async () => {
      const result = await tool.execute(
        { code: "return require('fs')" },
        ctx,
      )
      expect(result.is_error).toBe(true)
      expect(result.content).toContain('require')
    })

    it('语法错误正确返回给 agent', async () => {
      const result = await tool.execute(
        { code: 'return 1 +' },
        ctx,
      )
      expect(result.is_error).toBe(true)
      expect(result.content).toBeDefined()
    })

    it('超时错误正确返回给 agent', async () => {
      const result = await tool.execute(
        { code: 'while (true) {}', timeout: 100 },
        ctx,
      )
      expect(result.is_error).toBe(true)
      expect(result.content).toMatch(/timeout|超时/i)
    })

    it('缺少 code 参数时返回错误', async () => {
      const result = await tool.execute({}, ctx)
      expect(result.is_error).toBe(true)
      expect(result.content).toContain('code')
    })
  })
})
