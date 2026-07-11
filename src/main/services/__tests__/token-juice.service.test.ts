import { describe, it, expect } from 'vitest'
import { compressToolOutput } from '../token-juice.service'

describe('token-juice.service', () => {
  describe('compressToolOutput', () => {
    it('短输出不压缩(原样返回)', () => {
      const input = 'Hello World'
      const result = compressToolOutput(input, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(false)
      expect(result.output).toBe('Hello World')
    })

    it('超长输出触发压缩(长度显著减少)', () => {
      const input = 'line of content\n'.repeat(1000) // 约 16000 字符
      const result = compressToolOutput(input, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(true)
      expect(result.output.length).toBeLessThan(input.length)
      expect(result.originalLength).toBe(input.length)
      expect(result.compressedLength).toBe(result.output.length)
    })

    it('去除 ANSI 终端转义码', () => {
      const ansiInput = '\x1b[31mRed Text\x1b[0m\n' + 'x'.repeat(9000)
      const result = compressToolOutput(ansiInput, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(true)
      expect(result.output).not.toContain('\x1b[31m')
      expect(result.output).not.toContain('\x1b[0m')
    })

    it('文件类输出保留头部和尾部,中间用省略映射替代', () => {
      const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: content here`)
      const input = lines.join('\n')
      const result = compressToolOutput(input, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(true)
      // 头部保留
      expect(result.output).toContain('Line 1: content here')
      // 尾部保留
      expect(result.output).toContain('Line 500: content here')
      // 中间省略
      expect(result.output).toContain('...')
      // 中间行不出现
      expect(result.output).not.toContain('Line 250: content here')
    })

    it('enabled=false 时不压缩', () => {
      const input = 'x'.repeat(20000)
      const result = compressToolOutput(input, { enabled: false, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(false)
      expect(result.output).toBe(input)
    })

    it('去除重复空行(多于2个连续空行压缩为2个)', () => {
      const input = 'text1\n\n\n\n\n\ntext2\n' + 'x'.repeat(9000)
      const result = compressToolOutput(input, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(true)
      // 不应包含4个以上连续换行
      expect(result.output).not.toMatch(/\n{4,}/)
    })

    it('压缩后 token 减少 ≥ 50%(对超长输出)', () => {
      // 模拟一个超长工具输出:大量重复日志行
      const input = Array.from({ length: 2000 }, (_, i) =>
        `[2026-07-11 10:00:${String(i % 60).padStart(2, '0')}] INFO Processing item ${i} with data payload`
      ).join('\n')
      const result = compressToolOutput(input, { enabled: true, maxToolOutputChars: 8000 })
      expect(result.compressed).toBe(true)
      // 粗略 token 估算:长度/4
      const originalTokens = Math.ceil(input.length / 4)
      const compressedTokens = Math.ceil(result.output.length / 4)
      const reduction = 1 - compressedTokens / originalTokens
      expect(reduction).toBeGreaterThanOrEqual(0.5)
    })
  })
})
