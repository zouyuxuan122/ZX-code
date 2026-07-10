import { describe, it, expect, vi } from 'vitest'

// Mock 所有 Node.js 依赖（conversation.service 顶层 import 的模块）
vi.mock('../../../../main/database/repositories/conversation.repo', () => ({}))
vi.mock('../../../../main/database/repositories/project.repo', () => ({}))
vi.mock('../../../../main/database/repositories/provider.repo', () => ({}))
vi.mock('../../../../main/database/repositories/settings.repo', () => ({}))
vi.mock('../../../../main/providers', () => ({ chatWithProvider: vi.fn() }))
vi.mock('../../../../main/agent/engine', () => ({ agentEngine: {} }))
vi.mock('../../../../main/tools', () => ({ getToolDefinitions: vi.fn(() => []) }))
vi.mock('../../../../main/services/context.builder', () => ({
  buildContext: vi.fn(() => []),
  DEFAULT_SYSTEM_PROMPT: 'You are a helpful assistant.',
}))
vi.mock('../../../../main/services/context-usage.service', () => ({
  getContextSettings: vi.fn(() => ({ maxContextLength: 8000, autoCompress: false, compressThreshold: 80 })),
  getContextUsage: vi.fn(() => null),
}))
vi.mock('../../../../main/services/logger.service', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../../../../main/services/permission.service', () => ({ getAllowedDirectories: vi.fn(() => []) }))

import { buildSystemPromptForMode } from '../../../../main/services/conversation.service'

describe('buildSystemPromptForMode 透传 systemPrompt', () => {
  it('提供 systemPrompt 时，应作为 base prompt 拼接到 mode prompt 之前', () => {
    const result = buildSystemPromptForMode('chat', '你是小喵，一只傲娇的 AI 猫咪。')

    // 角色卡应出现在最前面（替代 DEFAULT_SYSTEM_PROMPT 作为 base）
    expect(result.startsWith('你是小喵，一只傲娇的 AI 猫咪。')).toBe(true)
    // mode prompt 仍应存在
    expect(result).toContain('当前模式：Chat（对话模式）')
  })

  it('未提供 systemPrompt 时，行为不变（使用 DEFAULT_SYSTEM_PROMPT + mode prompt）', () => {
    const result = buildSystemPromptForMode('chat')

    expect(result).not.toContain('你是小喵')
    expect(result).toContain('当前模式：Chat（对话模式）')
  })

  it('build 模式 + systemPrompt 也应正确拼接', () => {
    const result = buildSystemPromptForMode('build', '你是阿芙洛狄忒，优雅的爱之女神。')

    expect(result.startsWith('你是阿芙洛狄忒，优雅的爱之女神。')).toBe(true)
    expect(result).toContain('当前模式：Build（构建模式）')
  })
})
