import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generatePetAnimation } from '@/services/petAnimation.service'
import type { PetCharacter, PetMood } from '@/stores/petStore'

// ─── Mocks ──────────────────────────────────────────────

const { completeMock, uiSelectedMock, parseModelNameMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
  uiSelectedMock: vi.fn(() => null),
  parseModelNameMock: vi.fn((key: string) => {
    const idx = key.indexOf(':')
    return idx >= 0 ? key.slice(idx + 1) : key
  }),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    provider: {
      complete: completeMock,
    },
  },
}))

vi.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: vi.fn(() => ({
      currentConversation: { model: 'gpt-4' },
      availableModels: [{ id: 'gpt-4' }, { id: 'claude-3' }],
    })),
  },
}))

vi.mock('@/stores/uiStore', () => ({
  useUIStore: {
    getState: vi.fn(() => ({ selectedModel: uiSelectedMock() })),
  },
}))

vi.mock('@/components/chat/ModelSelector', () => ({
  parseModelName: parseModelNameMock,
}))

const baseCharacter: PetCharacter = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪',
  greeting: '喵~',
  idleMessages: [],
  workingMessages: [],
  annoyedMessages: [],
  roleCard: '你是小喵，一只傲娇的 AI 猫咪助手。',
  avatarType: 'svg',
  modelPath: null,
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: ['idle', 'wave', 'jump', 'sleep', 'angry'],
  expressions: ['neutral', 'happy', 'angry', 'surprised', 'sleepy'],
}

// ─── Helpers ────────────────────────────────────────────

function makeCharacter(partial: Partial<PetCharacter> = {}): PetCharacter {
  return { ...baseCharacter, ...partial }
}

// ─── Tests ──────────────────────────────────────────────

describe('generatePetAnimation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // 重置 chatStore / uiStore / parseModelName mock 到默认值，避免测试间状态泄漏
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: { model: 'gpt-4' },
      availableModels: [{ id: 'gpt-4' }, { id: 'claude-3' }],
    })
    uiSelectedMock.mockReturnValue(null)
    parseModelNameMock.mockImplementation((key: string) => {
      const idx = key.indexOf(':')
      return idx >= 0 ? key.slice(idx + 1) : key
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('应返回 LLM 提供的有效动作与表情', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "wave", "expression": "happy"}',
    })

    const result = await generatePetAnimation('你好呀', '喵~ 你好！', makeCharacter())

    expect(result).toEqual({ animation: 'wave', expression: 'happy' })
    expect(completeMock).toHaveBeenCalledTimes(1)
    const params = completeMock.mock.calls[0][0]
    expect(params.model).toBe('gpt-4')
    expect(params.messages[0].role).toBe('system')
    expect(params.messages[1].role).toBe('user')
    expect(params.stream).toBe(false)
  })

  it('无效动作应 fallback 到 idle', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "fly", "expression": "happy"}',
    })

    const result = await generatePetAnimation('飞起来', '我不会飞喵', makeCharacter())

    expect(result.animation).toBe('idle')
    expect(result.expression).toBe('happy')
  })

  it('无效表情应 fallback 到 neutral', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "wave", "expression": "confused"}',
    })

    const result = await generatePetAnimation('?', '嗯？', makeCharacter())

    expect(result.animation).toBe('wave')
    expect(result.expression).toBe('neutral')
  })

  it('LLM 返回非 JSON 时应 fallback 到 idle/neutral', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '我想选 wave 和 happy',
    })

    const result = await generatePetAnimation('跳舞', '好呀', makeCharacter())

    expect(result).toEqual({ animation: 'idle', expression: 'neutral' })
  })

  it('IPC 调用失败时应 fallback 到 idle/neutral', async () => {
    completeMock.mockRejectedValue(new Error('network error'))

    const result = await generatePetAnimation('跳舞', '好呀', makeCharacter())

    expect(result).toEqual({ animation: 'idle', expression: 'neutral' })
  })

  it('未配置任何模型时应直接 fallback 到 idle/neutral', async () => {
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: null,
      availableModels: [],
    })

    const result = await generatePetAnimation('你好', '喵', makeCharacter())

    expect(result).toEqual({ animation: 'idle', expression: 'neutral' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('应使用 availableModels 中第一个模型作为 fallback', async () => {
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: null,
      availableModels: [{ id: 'claude-3' }],
    })

    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "jump", "expression": "surprised"}',
    })

    await generatePetAnimation('哇', '吓我一跳', makeCharacter())

    expect(completeMock).toHaveBeenCalledTimes(1)
    expect(completeMock.mock.calls[0][0].model).toBe('claude-3')
  })

  it('九宫格场景：主对话与可用模型均为空时，应回退到 uiStore.selectedModel 并解析复合键', async () => {
    // 模拟九宫格对话：主对话不存在、无可用模型列表
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: null,
      availableModels: [],
    })
    // UI store 选中模型为复合键 provider:name
    uiSelectedMock.mockReturnValue('openai:gpt-4')
    parseModelNameMock.mockImplementation((key: string) => {
      const idx = key.indexOf(':')
      return idx >= 0 ? key.slice(idx + 1) : key
    })

    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "wave", "expression": "happy"}',
    })

    const result = await generatePetAnimation('你好呀', '喵~ 你好！', makeCharacter())

    expect(completeMock).toHaveBeenCalledTimes(1)
    // 应解析复合键为纯模型名
    expect(completeMock.mock.calls[0][0].model).toBe('gpt-4')
    expect(result).toEqual({ animation: 'wave', expression: 'happy' })

    uiSelectedMock.mockReturnValue(null)
  })

  it('九宫格场景：uiStore.selectedModel 为空时才 fallback 到 idle/neutral', async () => {
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: null,
      availableModels: [],
    })
    uiSelectedMock.mockReturnValue(null)

    const result = await generatePetAnimation('你好', '喵', makeCharacter())

    expect(result).toEqual({ animation: 'idle', expression: 'neutral' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('应优先使用 uiStore.selectedModel（解析复合键）而非 chatStore 的内部 ID', async () => {
    // chatStore.currentConversation.model 是数据库内部 ID，不能直接传给 provider
    const { useChatStore } = await import('@/stores/chatStore')
    ;(useChatStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      currentConversation: { model: '30b1e8ac8b6b69121a5ed7bfa08782d3' },
      availableModels: [{ id: '30b1e8ac8b6b69121a5ed7bfa08782d3' }],
    })
    // uiStore 选中模型为合法复合键
    uiSelectedMock.mockReturnValue('DeepSeek:deepseek-v4-flash')

    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "kaixin", "expression": "lianhong"}',
    })

    const character = makeCharacter({
      animations: ['idle', 'kaixin', 'wave'],
      expressions: ['neutral', 'lianhong', 'happy'],
    })

    const result = await generatePetAnimation('开心', '喵~', character)

    expect(completeMock).toHaveBeenCalledTimes(1)
    // 应使用解析后的纯模型名，而非内部 ID
    expect(completeMock.mock.calls[0][0].model).toBe('deepseek-v4-flash')
    expect(result).toEqual({ animation: 'kaixin', expression: 'lianhong' })
  })

  it('Prompt 中应包含角色卡、可用动作和可用表情列表', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "idle", "expression": "neutral"}',
    })

    const character = makeCharacter({
      roleCard: '你是小狗，忠诚友善。',
      animations: ['idle', 'run'],
      expressions: ['neutral', 'excited'],
    })

    await generatePetAnimation('出去玩', '好呀', character)

    const params = completeMock.mock.calls[0][0]
    const systemContent = params.messages[0].content
    expect(systemContent).toContain('你是小狗，忠诚友善。')
    expect(systemContent).toContain('idle, run')
    expect(systemContent).toContain('neutral, excited')
  })

  it('LLM 失败且 mood=annoyed 时应 fallback 到 angry+angry（情绪感知 fallback）', async () => {
    completeMock.mockRejectedValue(new Error('network error'))

    const result = await generatePetAnimation(
      '烦死了',
      '别烦我了，我正在执行 写代码 任务。',
      makeCharacter(),
      'annoyed' as PetMood,
    )

    expect(result).toEqual({ animation: 'angry', expression: 'angry' })
  })

  it('LLM 返回无效值且 mood=annoyed 时应 fallback 到 angry+angry', async () => {
    completeMock.mockResolvedValue({
      ok: true,
      content: '{"animation": "fly", "expression": "confused"}',
    })

    const result = await generatePetAnimation(
      '烦',
      '别烦我',
      makeCharacter(),
      'annoyed' as PetMood,
    )

    expect(result).toEqual({ animation: 'angry', expression: 'angry' })
  })

  it('未传 mood 时 LLM 失败仍 fallback 到 idle/neutral（向后兼容）', async () => {
    completeMock.mockRejectedValue(new Error('network error'))

    const result = await generatePetAnimation('跳舞', '好呀', makeCharacter())

    expect(result).toEqual({ animation: 'idle', expression: 'neutral' })
  })

  it('mood=happy 时 LLM 失败应 fallback 到 wave+happy', async () => {
    completeMock.mockRejectedValue(new Error('network error'))

    const result = await generatePetAnimation(
      '太棒了',
      '喵~ 谢谢夸奖！',
      makeCharacter(),
      'happy' as PetMood,
    )

    expect(result).toEqual({ animation: 'wave', expression: 'happy' })
  })
})
