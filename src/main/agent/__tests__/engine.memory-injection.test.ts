import { describe, it, expect, vi } from 'vitest'
import { buildMemoryRecallSection, createMemoryExtractor } from '../engine.memory'

describe('engine.memory helpers', () => {
  describe('buildMemoryRecallSection', () => {
    it('无记忆时返回空字符串', () => {
      const section = buildMemoryRecallSection([])
      expect(section).toBe('')
    })

    it('有记忆时返回格式化的 section', () => {
      const memories = [
        {
          node: {
            id: '1',
            parent_id: null,
            partition: 'decision' as const,
            title: '采用 JWT 认证',
            content: '决定使用 JWT 实现用户登录',
            tags: ['auth'],
            created_at: Date.now(),
            updated_at: Date.now()
          },
          score: 0.9
        },
        {
          node: {
            id: '2',
            parent_id: null,
            partition: 'error' as const,
            title: '端口冲突',
            content: '端口 3000 被占用',
            tags: ['bug'],
            created_at: Date.now(),
            updated_at: Date.now()
          },
          score: 0.7
        }
      ]
      const section = buildMemoryRecallSection(memories)
      expect(section).toContain('相关记忆')
      expect(section).toContain('采用 JWT 认证')
      expect(section).toContain('端口冲突')
      expect(section).toContain('decision')
      expect(section).toContain('error')
    })

    it('记忆内容截断(超过 200 字符)', () => {
      const longContent = 'x'.repeat(300)
      const memories = [
        {
          node: {
            id: '1', parent_id: null, partition: 'general' as const,
            title: '长内容', content: longContent, tags: [],
            created_at: Date.now(), updated_at: Date.now()
          },
          score: 0.5
        }
      ]
      const section = buildMemoryRecallSection(memories)
      // 截断后不应包含完整的 300 字符
      expect(section).not.toContain('x'.repeat(300))
      expect(section).toContain('...')
    })
  })

  describe('createMemoryExtractor', () => {
    it('返回一个函数', () => {
      const extractor = createMemoryExtractor(() => Promise.resolve({ content: '' } as any))
      expect(typeof extractor).toBe('function')
    })

    it('调用 LLM 并解析返回的记忆条目', async () => {
      const mockComplete = vi.fn().mockResolvedValue({
        content: JSON.stringify([
          { partition: 'decision', title: '决策1', content: '内容1', tags: ['tag1'] },
          { partition: 'error', title: '错误1', content: '内容2', tags: ['tag2'] }
        ])
      })
      const extractor = createMemoryExtractor(mockComplete)
      const messages = [
        { id: '1', role: 'user', content: '用户消息' },
        { id: '2', role: 'assistant', content: '助手回复' }
      ] as any

      const result = await extractor(messages)
      expect(result.length).toBe(2)
      expect(result[0].title).toBe('决策1')
      expect(result[1].title).toBe('错误1')
    })

    it('LLM 返回无效 JSON 时返回空数组', async () => {
      const mockComplete = vi.fn().mockResolvedValue({
        content: '这不是 JSON'
      })
      const extractor = createMemoryExtractor(mockComplete)
      const result = await extractor([] as any)
      expect(result).toEqual([])
    })

    it('LLM 调用失败时返回空数组', async () => {
      const mockComplete = vi.fn().mockRejectedValue(new Error('LLM 失败'))
      const extractor = createMemoryExtractor(mockComplete)
      const result = await extractor([] as any)
      expect(result).toEqual([])
    })
  })
})
