import { describe, it, expect } from 'vitest'
import { PromptGenerator } from '../../../../main/chat2api/proxy/services/promptGenerator'
import type { ChatCompletionTool } from '../../../../main/chat2api/proxy/types'

const mockTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定路径的文件内容',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
]

describe('PromptGenerator 工具调用提示词', () => {
  it('XML 格式提示词包含工具调用意图指导', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    // 包含工具列表
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('write_file')
    // 包含何时调用工具的指导
    expect(prompt).toContain('何时调用工具')
    // 包含工具调用示例
    expect(prompt).toContain('<tool_use>')
    // 包含工具结果格式说明
    expect(prompt).toContain('TOOL_RESULT')
  })

  it('提示词包含 preamble 规范（先说明再行动）', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    expect(prompt).toContain('先说明')
    expect(prompt).toContain('preamble')
  })

  it('提示词包含常见场景的工具调用示例', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'xml' })
    // 读取文件示例
    expect(prompt).toContain('read_file')
    // 写入文件示例
    expect(prompt).toContain('write_file')
  })

  it('bracket 格式同样包含完整指导', () => {
    const prompt = PromptGenerator.generate(mockTools, { format: 'bracket' })
    expect(prompt).toContain('[function_calls]')
    expect(prompt).toContain('何时调用工具')
    expect(prompt).toContain('preamble')
  })

  it('无工具时返回空字符串', () => {
    const prompt = PromptGenerator.generate([], { format: 'xml' })
    expect(prompt).toBe('')
  })
})
