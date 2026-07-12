import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock scl.service 模块，避免依赖真实数据库
vi.mock('../scl.service', () => ({
  installSclExtension: vi.fn(),
}))

import { installSclExtension } from '../scl.service'
import { SkillCreatorService, type SkillDraft, type SkillDraftGenerator } from '../skill-creator.service'

describe('SkillCreatorService', () => {
  let service: SkillCreatorService
  let mockGenerator: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerator = vi.fn()
    service = new SkillCreatorService(mockGenerator as unknown as SkillDraftGenerator)
  })

  describe('assessComplexity', () => {
    it('toolCallCount >= 5 时返回 true', () => {
      expect(service.assessComplexity(5, '')).toBe(true)
      expect(service.assessComplexity(10, '')).toBe(true)
    })

    it('用户消息包含满意关键词时返回 true', () => {
      expect(service.assessComplexity(0, '谢谢')).toBe(true)
      expect(service.assessComplexity(0, '搞定了')).toBe(true)
      expect(service.assessComplexity(0, '完美')).toBe(true)
      expect(service.assessComplexity(0, 'great')).toBe(true)
      expect(service.assessComplexity(0, 'thanks')).toBe(true)
      expect(service.assessComplexity(0, 'done')).toBe(true)
    })

    it('关键词大小写不敏感', () => {
      expect(service.assessComplexity(0, 'Great')).toBe(true)
      expect(service.assessComplexity(0, 'THANKS')).toBe(true)
      expect(service.assessComplexity(0, 'Done!')).toBe(true)
    })

    it('toolCallCount < 5 且无满意关键词时返回 false', () => {
      expect(service.assessComplexity(0, '帮我写个函数')).toBe(false)
      expect(service.assessComplexity(4, '继续')).toBe(false)
      expect(service.assessComplexity(3, '请修改这段代码')).toBe(false)
    })
  })

  describe('generateSkillDraft', () => {
    it('调用 LLM 生成器并返回草稿', async () => {
      const draft: SkillDraft = {
        name: 'API 设计技能',
        description: 'RESTful API 设计规范',
        content: '## API 设计技能\n...',
        tags: ['api', 'design'],
      }
      mockGenerator.mockResolvedValue(draft)

      const result = await service.generateSkillDraft('对话摘要', '工具调用摘要')
      expect(result).toEqual(draft)
      expect(mockGenerator).toHaveBeenCalledWith('对话摘要', '工具调用摘要')
    })

    it('生成器返回 null 时返回 null', async () => {
      mockGenerator.mockResolvedValue(null)
      const result = await service.generateSkillDraft('摘要', '工具')
      expect(result).toBeNull()
    })

    it('生成器抛异常时返回 null 而非抛出', async () => {
      mockGenerator.mockRejectedValue(new Error('LLM 调用失败'))
      const result = await service.generateSkillDraft('摘要', '工具')
      expect(result).toBeNull()
    })
  })

  describe('saveSkill', () => {
    it('写入 SCL 时 source=auto, enabled=false', () => {
      const draft: SkillDraft = {
        name: '调试技能',
        description: '系统化调试流程',
        content: '## 调试技能\n...',
        tags: ['debug'],
      }
      service.saveSkill(draft)
      expect(installSclExtension).toHaveBeenCalledTimes(1)
      expect(installSclExtension).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '调试技能',
          description: '系统化调试流程',
          content: '## 调试技能\n...',
          tags: ['debug'],
          source: 'auto',
          enabled: false,
        }),
      )
    })
  })

  describe('maybeCreateSkill 完整流程', () => {
    it('复杂度不足时不调用生成器也不保存', async () => {
      await service.maybeCreateSkill({
        conversationId: 'conv1',
        toolCallCount: 2,
        userMessage: '继续',
        conversationSummary: '摘要',
        toolCallsSummary: '工具',
      })
      expect(mockGenerator).not.toHaveBeenCalled()
      expect(installSclExtension).not.toHaveBeenCalled()
    })

    it('toolCallCount >= 5 时触发完整流程并保存技能', async () => {
      const draft: SkillDraft = {
        name: '自动化技能',
        description: '自动化测试流程',
        content: '## 自动化技能\n...',
        tags: ['test', 'auto'],
      }
      mockGenerator.mockResolvedValue(draft)

      await service.maybeCreateSkill({
        conversationId: 'conv1',
        toolCallCount: 6,
        userMessage: '',
        conversationSummary: '用户要求实现自动化测试',
        toolCallsSummary: 'read_file, write_file, run_command',
      })

      expect(mockGenerator).toHaveBeenCalledWith('用户要求实现自动化测试', 'read_file, write_file, run_command')
      expect(installSclExtension).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'auto', enabled: false }),
      )
    })

    it('用户消息包含满意关键词时触发完整流程', async () => {
      const draft: SkillDraft = {
        name: '技能',
        description: '描述',
        content: '内容',
        tags: [],
      }
      mockGenerator.mockResolvedValue(draft)

      await service.maybeCreateSkill({
        conversationId: 'conv1',
        toolCallCount: 1,
        userMessage: '太完美了，谢谢！',
        conversationSummary: '摘要',
        toolCallsSummary: '工具',
      })

      expect(mockGenerator).toHaveBeenCalled()
      expect(installSclExtension).toHaveBeenCalled()
    })

    it('生成器返回 null 时不保存技能', async () => {
      mockGenerator.mockResolvedValue(null)
      await service.maybeCreateSkill({
        conversationId: 'conv1',
        toolCallCount: 8,
        userMessage: '',
        conversationSummary: '摘要',
        toolCallsSummary: '工具',
      })
      expect(installSclExtension).not.toHaveBeenCalled()
    })
  })
})
