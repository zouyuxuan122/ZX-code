import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePetStore, type PetCharacter } from '@/stores/petStore'
import { useGridStore } from '@/stores/gridStore'

// ─── Mocks ──────────────────────────────────────────────

vi.mock('@/services/ipc', () => ({
  ipc: {
    file: {
      selectFile: vi.fn((opts?: { filters?: Array<{ name: string; extensions: string[] }> }) => {
        const ext = opts?.filters?.[0]?.extensions?.[0]
        if (ext === 'model3.json' || ext === 'json') {
          return Promise.resolve('app-asset:///models/live2d/fense.model3.json')
        }
        return Promise.resolve('app-asset:///models/test.vrm')
      }),
      selectFolder: vi.fn(() => Promise.resolve('app-asset:///models/live2d')),
    },
  },
}))

vi.mock('@/components/grid/panels/pet/PetCharacter', () => ({
  PetCharacter: () => <div data-testid="pet-character-preview">Pet</div>,
}))

vi.mock('@/components/grid/panels/pet/ModelRenderer', () => ({
  ModelRenderer: ({ isVisible }: { isVisible?: boolean }) => (
    <div data-testid="model-renderer" data-visible={isVisible ? 'true' : 'false'}>Model</div>
  ),
}))

import { ipc } from '@/services/ipc'
import { PetSettings } from '@/components/settings/PetSettings'

const defaultCharacter: PetCharacter = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪',
  greeting: '喵~',
  idleMessages: ['idle1'],
  workingMessages: ['working1'],
  annoyedMessages: ['annoyed1'],
  roleCard: '角色卡',
  avatarType: 'svg',
  modelPath: null,
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: [],
  expressions: [],
}

function resetStores() {
  usePetStore.setState({
    character: defaultCharacter,
    backgroundType: 'theme',
    backgroundValue: '',
  })
  useGridStore.setState({
    layout: { slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null] },
  })
}

describe('PetSettings', () => {
  beforeEach(() => {
    cleanup()
    resetStores()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('updates petStore character fields when role card form changes', async () => {
    render(<PetSettings />)

    const nameInput = screen.getByLabelText(/角色名/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, '小汪')
    expect(usePetStore.getState().character.name).toBe('小汪')

    const avatarInput = screen.getByLabelText(/头像/i)
    await userEvent.clear(avatarInput)
    await userEvent.type(avatarInput, '🐶')
    expect(usePetStore.getState().character.avatar).toBe('🐶')

    const personalityInput = screen.getByLabelText(/性格描述/i)
    await userEvent.clear(personalityInput)
    await userEvent.type(personalityInput, '活泼的小狗')
    expect(usePetStore.getState().character.personality).toBe('活泼的小狗')

    const greetingInput = screen.getByLabelText(/问候语/i)
    await userEvent.clear(greetingInput)
    await userEvent.type(greetingInput, '汪！')
    expect(usePetStore.getState().character.greeting).toBe('汪！')
  })

  it('预览在 avatarType 为 svg 时显示 PetCharacter（猫）', () => {
    render(<PetSettings />)
    expect(screen.getByTestId('pet-character-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('model-renderer')).not.toBeInTheDocument()
  })

  it('预览在 avatarType 为 live2d 时渲染 ModelRenderer（而非猫）', () => {
    usePetStore.setState({
      character: { ...defaultCharacter, avatarType: 'live2d', modelPath: 'models/live2d/fense/fense.model3.json' },
    })
    render(<PetSettings />)
    expect(screen.getByTestId('model-renderer')).toBeInTheDocument()
    expect(screen.queryByTestId('pet-character-preview')).not.toBeInTheDocument()
  })

  it('预览在 avatarType 为 vrm 时渲染 ModelRenderer（而非猫）', () => {
    usePetStore.setState({
      character: { ...defaultCharacter, avatarType: 'vrm', modelPath: 'C:/models/test.vrm' },
    })
    render(<PetSettings />)
    expect(screen.getByTestId('model-renderer')).toBeInTheDocument()
    expect(screen.queryByTestId('pet-character-preview')).not.toBeInTheDocument()
  })

  it('imports VRM model and updates avatarType and modelPath', async () => {
    render(<PetSettings />)

    const vrmRadio = screen.getByRole('button', { name: /VRM 模型/i })
    await userEvent.click(vrmRadio)
    expect(usePetStore.getState().character.avatarType).toBe('vrm')

    const importBtn = screen.getByRole('button', { name: /导入 VRM 模型/i })
    await userEvent.click(importBtn)

    await vi.waitFor(() => {
      expect(ipc.file.selectFile).toHaveBeenCalledWith({
        filters: [{ name: 'VRM 模型', extensions: ['vrm'] }],
      })
    })
    expect(usePetStore.getState().character.modelPath).toBe('app-asset:///models/test.vrm')
  })

  it('imports Live2D model file and updates avatarType and modelPath', async () => {
    render(<PetSettings />)

    const live2dRadio = screen.getByRole('button', { name: /Live2D 模型/i })
    await userEvent.click(live2dRadio)
    expect(usePetStore.getState().character.avatarType).toBe('live2d')

    const importBtn = screen.getByRole('button', { name: /导入 Live2D 模型文件/i })
    await userEvent.click(importBtn)

    await vi.waitFor(() => {
      expect(ipc.file.selectFile).toHaveBeenCalledWith({
        filters: [{ name: 'Live2D 模型 (.model3.json)', extensions: ['model3.json', 'json'] }],
      })
    })
    expect(usePetStore.getState().character.modelPath).toBe('app-asset:///models/live2d/fense.model3.json')
  })

  it('updates background type and value', async () => {
    render(<PetSettings />)

    const solidRadio = screen.getByRole('button', { name: /纯色/i })
    await userEvent.click(solidRadio)
    expect(usePetStore.getState().backgroundType).toBe('solid')

    const colorInput = screen.getByLabelText(/背景值/i)
    await userEvent.clear(colorInput)
    await userEvent.type(colorInput, '#ff0000')
    expect(usePetStore.getState().backgroundValue).toBe('#ff0000')

    const imageRadio = screen.getByRole('button', { name: /图片/i })
    await userEvent.click(imageRadio)
    expect(usePetStore.getState().backgroundType).toBe('image')

    const selectImageBtn = screen.getByRole('button', { name: /选择背景图片/i })
    await userEvent.click(selectImageBtn)

    await vi.waitFor(() => {
      expect(ipc.file.selectFile).toHaveBeenCalledWith({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
    })
    expect(usePetStore.getState().backgroundValue).toBe('app-asset:///models/test.vrm')
  })

  it('updates subtitle enabled and style', async () => {
    render(<PetSettings />)

    const toggle = screen.getByRole('switch', { name: /开启字幕/i })
    await userEvent.click(toggle)
    expect(usePetStore.getState().character.subtitleEnabled).toBe(false)

    await userEvent.click(toggle)
    expect(usePetStore.getState().character.subtitleEnabled).toBe(true)

    const styleSelect = screen.getByLabelText(/字幕样式/i)
    await userEvent.selectOptions(styleSelect, 'line')
    expect(usePetStore.getState().character.subtitleStyle).toBe('line')
  })

  it('resets grid layout when reset button clicked', async () => {
    useGridStore.setState({
      layout: { slots: ['chat', null, null, null, null, null, null, null, null] },
    })
    render(<PetSettings />)

    const resetBtn = screen.getByRole('button', { name: /重置布局/i })
    await userEvent.click(resetBtn)

    expect(useGridStore.getState().layout.slots).toEqual([
      null, null, null, null, 'pet', null, 'chat', 'aiView', null,
    ])
  })

  it('renders live preview with selected background', () => {
    usePetStore.setState({
      backgroundType: 'solid',
      backgroundValue: '#00ff00',
    })
    render(<PetSettings />)

    // 默认 avatarType=svg → 显示 PetCharacter 预览
    expect(screen.getByTestId('pet-character-preview')).toBeInTheDocument()
    const preview = screen.getByTestId('pet-settings-preview')
    expect(preview.style.background).toBe('rgb(0, 255, 0)')
  })

  it('渲染角色卡 textarea 并可编辑 roleCard', () => {
    render(<PetSettings />)
    const textarea = screen.getByPlaceholderText('描述角色的设定、性格、说话风格...') as HTMLTextAreaElement
    expect(textarea).toBeInTheDocument()
    // 默认值来自 petStore
    expect(textarea.value).toBe('角色卡')

    fireEvent.change(textarea, { target: { value: '你是阿芙洛狄忒，优雅的爱之女神。' } })
    expect(usePetStore.getState().character.roleCard).toBe('你是阿芙洛狄忒，优雅的爱之女神。')
  })
})
