import { describe, it, expect } from 'vitest'
import { buildUserProfileSection } from '../engine.memory'
import type { UserProfileSummary } from '@shared/types/user-profile'

describe('engine.memory - buildUserProfileSection', () => {
  it('无摘要(undefined)时返回空字符串', () => {
    expect(buildUserProfileSection(undefined)).toBe('')
  })

  it('空摘要(raw 为空)时返回空字符串', () => {
    const summary: UserProfileSummary = {
      techStack: [],
      codingStyle: [],
      workPattern: [],
      communicationPreference: '',
      expertiseLevel: '',
      languagePreference: '',
      raw: '',
    }
    expect(buildUserProfileSection(summary)).toBe('')
  })

  it('有画像时返回格式化的用户画像 section', () => {
    const summary: UserProfileSummary = {
      techStack: ['TypeScript', 'React'],
      codingStyle: ['函数式'],
      workPattern: ['TDD'],
      communicationPreference: '简洁直接',
      expertiseLevel: '高级',
      languagePreference: '中文',
      raw: '技术栈: TypeScript, React\n编码风格: 函数式\n工作模式: TDD\n沟通偏好: 简洁直接\n专业水平: 高级\n语言偏好: 中文',
    }
    const section = buildUserProfileSection(summary)
    expect(section).toContain('用户画像')
    expect(section).toContain('TypeScript')
    expect(section).toContain('函数式')
    expect(section).toContain('TDD')
    expect(section).toContain('高级')
    expect(section).toContain('中文')
  })

  it('section 内容不超过 500 字符(截断保护)', () => {
    const longRaw = 'x'.repeat(600)
    const summary: UserProfileSummary = {
      techStack: [],
      codingStyle: [],
      workPattern: [],
      communicationPreference: '',
      expertiseLevel: '',
      languagePreference: '',
      raw: longRaw,
    }
    const section = buildUserProfileSection(summary)
    // 即使 raw 超长,section 也应被截断到合理长度
    expect(section.length).toBeLessThanOrEqual(520)
  })
})
