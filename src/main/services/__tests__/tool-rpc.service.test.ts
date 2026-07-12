import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ToolRpcService } from '../tool-rpc.service'
import type { RpcToolInfo } from '@shared/types/rpc-script'

describe('ToolRpcService', () => {
  let service: ToolRpcService

  beforeEach(() => {
    service = new ToolRpcService()
  })

  describe('registerRpcTool', () => {
    it('注册工具后可通过 getAvailableTools 查询到', () => {
      const executor = vi.fn().mockResolvedValue('ok')
      service.registerRpcTool('read_file', '读取文件', [
        { name: 'path', type: 'string', required: true },
      ], executor)

      const tools = service.getAvailableTools()
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe('read_file')
      expect(tools[0].description).toBe('读取文件')
      expect(tools[0].parameters).toEqual([
        { name: 'path', type: 'string', required: true },
      ])
    })

    it('注册多个工具后 getAvailableTools 返回全部', () => {
      service.registerRpcTool('tool_a', 'A', [], vi.fn())
      service.registerRpcTool('tool_b', 'B', [], vi.fn())

      const tools = service.getAvailableTools()
      expect(tools).toHaveLength(2)
      const names = tools.map((t) => t.name)
      expect(names).toContain('tool_a')
      expect(names).toContain('tool_b')
    })
  })

  describe('callRpcTool', () => {
    it('调用已注册的执行器并返回成功结果', async () => {
      const executor = vi.fn().mockResolvedValue({ content: 'file content' })
      service.registerRpcTool('read_file', '读取文件', [
        { name: 'path', type: 'string', required: true },
      ], executor)

      const result = await service.callRpcTool('read_file', { path: '/test.txt' })

      expect(result.toolName).toBe('read_file')
      expect(result.success).toBe(true)
      expect(result.result).toEqual({ content: 'file content' })
      expect(result.error).toBeUndefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(executor).toHaveBeenCalledWith({ path: '/test.txt' })
    })

    it('支持同步执行器', async () => {
      const executor = vi.fn().mockReturnValue(42)
      service.registerRpcTool('calc', '计算', [], executor)

      const result = await service.callRpcTool('calc', {})
      expect(result.success).toBe(true)
      expect(result.result).toBe(42)
    })

    it('执行器抛异常时返回错误结果', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('执行失败'))
      service.registerRpcTool('bad_tool', '会失败的工具', [], executor)

      const result = await service.callRpcTool('bad_tool', {})

      expect(result.success).toBe(false)
      expect(result.result).toBeNull()
      expect(result.error).toContain('执行失败')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('调用未注册的工具时返回错误结果', async () => {
      const result = await service.callRpcTool('nonexistent', {})

      expect(result.toolName).toBe('nonexistent')
      expect(result.success).toBe(false)
      expect(result.result).toBeNull()
      expect(result.error).toContain('nonexistent')
      expect(result.durationMs).toBe(0)
    })
  })

  describe('getAvailableTools', () => {
    it('无工具时返回空数组', () => {
      expect(service.getAvailableTools()).toEqual([])
    })

    it('返回的工具信息包含 name/description/parameters', () => {
      service.registerRpcTool('grep', '搜索文件内容', [
        { name: 'pattern', type: 'string', required: true },
        { name: 'path', type: 'string', required: false },
      ], vi.fn())

      const tools = service.getAvailableTools()
      expect(tools).toHaveLength(1)
      const info = tools[0] as RpcToolInfo
      expect(info.name).toBe('grep')
      expect(info.description).toBe('搜索文件内容')
      expect(info.parameters).toHaveLength(2)
      expect(info.parameters[0]).toEqual({
        name: 'pattern',
        type: 'string',
        required: true,
      })
    })
  })
})
