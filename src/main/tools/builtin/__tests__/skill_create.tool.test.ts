import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SkillCreatorService } from '../../../services/skill-creator.service'
import { createSkillCreateTool } from '../skill_create.tool'

describe('skill_create tool', () => {
  let service: SkillCreatorService
  let tool: ReturnType<typeof createSkillCreateTool>

  beforeEach(() => {
    const mockGenerator = vi.fn()
    service = new SkillCreatorService(mockGenerator)
    // spy saveSkill，避免真实调用 scl.service（依赖数据库）
    vi.spyOn(service, 'saveSkill').mockImplementation(() => undefined)
    tool = createSkillCreateTool(service)
  })

  it('工具定义正确', () => {
    expect(tool.name).toBe('skill_create')
    expect(tool.description).toContain('skill')
    expect(tool.requiredPermissions).toEqual([])
    expect(tool.required).toEqual(expect.arrayContaining(['name', 'description', 'content']))
  })

  it('execute 调用 saveSkill 并返回成功', async () => {
    const result = await tool.execute(
      {
        name: '测试技能',
        description: '测试描述',
        content: '## 测试技能\n内容',
        tags: ['test'],
      },
      { workspacePath: '', projectId: null, conversationId: '', autoAccept: true },
    )

    expect(result.is_error).toBe(false)
    expect(result.content).toContain('测试技能')
    expect(service.saveSkill).toHaveBeenCalledWith({
      name: '测试技能',
      description: '测试描述',
      content: '## 测试技能\n内容',
      tags: ['test'],
    })
  })

  it('tags 为可选参数，缺省时为空数组', async () => {
    const result = await tool.execute(
      {
        name: '无标签技能',
        description: '描述',
        content: '内容',
      },
      { workspacePath: '', projectId: null, conversationId: '', autoAccept: true },
    )

    expect(result.is_error).toBe(false)
    expect(service.saveSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: '无标签技能', tags: [] }),
    )
  })

  it('缺少必填参数时返回错误', async () => {
    const result = await tool.execute(
      { name: '技能' },
      { workspacePath: '', projectId: null, conversationId: '', autoAccept: true },
    )

    expect(result.is_error).toBe(true)
  })
})
