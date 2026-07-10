import { describe, it, expect, beforeEach, vi } from 'vitest'

// vi.hoisted 确保 mock 在 vi.mock 提升后仍可访问
const { settingsSetMock, settingsGetMock } = vi.hoisted(() => ({
  settingsSetMock: vi.fn().mockResolvedValue(undefined),
  settingsGetMock: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/services/ipc', () => ({
  ipc: {
    provider: {
      complete: vi.fn().mockResolvedValue({ ok: true, content: '{"animation":"idle","expression":"idle"}' }),
      getAllModels: vi.fn().mockResolvedValue([{ id: 'm1', name: 'model-1' }]),
    },
    chat: {
      onChunk: vi.fn(() => () => {}),
      onThinking: vi.fn(() => () => {}),
      onMessage: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
      onComplete: vi.fn(() => () => {}),
    },
    settings: {
      get: settingsGetMock,
      getAll: vi.fn().mockResolvedValue([]),
      set: settingsSetMock,
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

import { usePetStore, migratePetConfig } from '@/stores/petStore'

beforeEach(() => {
  vi.clearAllMocks()
  // 重置 character 到默认值，防止测试间状态泄露
  usePetStore.setState({
    character: migratePetConfig({}),
    petMessages: [],
    bubbleText: null,
    bubbleVisible: false,
  })
})

describe('petStore.pushPetMessage', () => {
  it('追加 pet 角色消息并显示气泡', () => {
    usePetStore.getState().pushPetMessage('喵~ 你好呀！')
    const msgs = usePetStore.getState().petMessages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('pet')
    expect(msgs[0].content).toBe('喵~ 你好呀！')
    expect(usePetStore.getState().bubbleText).toBe('喵~ 你好呀！')
    expect(usePetStore.getState().bubbleVisible).toBe(true)
  })

  it('追加 user 角色消息不显示气泡', () => {
    usePetStore.getState().pushPetMessage('你好', 'user')
    const msgs = usePetStore.getState().petMessages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(usePetStore.getState().bubbleVisible).toBe(false)
  })
})

describe('petStore 持久化', () => {
  it('updateCharacter 应异步调用 ipc.settings.set 持久化 character', async () => {
    await usePetStore.getState().updateCharacter({ roleCard: '你是新的猫咪助手' })

    expect(settingsSetMock).toHaveBeenCalled()
    const [key, value, category] = settingsSetMock.mock.calls[0]
    expect(key).toBe('pet.character')
    expect(category).toBe('pet')
    // value 应包含更新后的 roleCard
    const savedChar = value as { roleCard: string }
    expect(savedChar.roleCard).toBe('你是新的猫咪助手')
  })

  it('loadCharacter 应从 ipc.settings.get 读取并合并默认值', async () => {
    settingsGetMock.mockResolvedValueOnce({
      name: '自定义小猫',
      roleCard: '自定义提示词',
      avatarType: 'live2d',
    })

    await usePetStore.getState().loadCharacter()

    const character = usePetStore.getState().character
    expect(character.name).toBe('自定义小猫')
    expect(character.roleCard).toBe('自定义提示词')
    // 未保存的字段应回退到默认值
    expect(character.greeting).toBeTruthy()
    expect(character.animations.length).toBeGreaterThan(0)
  })

  it('loadCharacter 无保存数据时应使用默认 character', async () => {
    settingsGetMock.mockResolvedValueOnce(null)

    await usePetStore.getState().loadCharacter()

    const character = usePetStore.getState().character
    expect(character.name).toBe('小喵')
    expect(character.roleCard).toContain('小喵')
  })
})
