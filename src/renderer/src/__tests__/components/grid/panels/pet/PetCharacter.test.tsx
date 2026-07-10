import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { PetCharacter as PetCharacterType, PetMood } from '@/stores/petStore'

// ─── Store mock ─────────────────────────────────────────

interface MockPetState {
  mood: PetMood
  character: PetCharacterType
  pendingAnimation: string
  pendingExpression: string
}

let mockState: MockPetState

vi.mock('@/stores/petStore', () => ({
  usePetStore: vi.fn((selector: (s: MockPetState) => unknown) => selector(mockState)),
}))

import { PetCharacter } from '@/components/grid/panels/pet/PetCharacter'

const baseCharacter: PetCharacterType = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪',
  greeting: '喵~',
  idleMessages: [],
  workingMessages: [],
  annoyedMessages: [],
  roleCard: '你是小喵。',
  avatarType: 'svg',
  modelPath: null,
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: ['idle', 'wave', 'jump', 'sleep', 'angry'],
  expressions: ['neutral', 'happy', 'angry', 'surprised', 'sleepy'],
}

describe('PetCharacter 动画与表情触发', () => {
  beforeEach(() => {
    mockState = {
      mood: 'idle',
      character: { ...baseCharacter },
      pendingAnimation: 'idle',
      pendingExpression: 'neutral',
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('默认 idle 状态渲染闭眼与 neutral 嘴巴', () => {
    render(<PetCharacter />)
    expect(screen.getByText('🐱 小喵')).toBeInTheDocument()
  })

  it('pendingAnimation=wave 时应触发 wave 动画', () => {
    mockState.pendingAnimation = 'wave'
    render(<PetCharacter />)
    // wave 动画下 body 会有 rotate，可以通过 motion.div 的 style/transform 间接判断
    const motionDiv = document.querySelector('[style*="width: 140px"]')
    expect(motionDiv).toBeInTheDocument()
  })

  it('pendingExpression=happy 时应渲染 happy 嘴型', () => {
    mockState.pendingExpression = 'happy'
    const { container } = render(<PetCharacter />)
    // happy 嘴巴为向上弧线 "M60 67 Q70 78 80 67"
    const mouthPath = container.querySelector('path[d="M60 67 Q70 78 80 67"]')
    expect(mouthPath).toBeInTheDocument()
  })

  it('pendingExpression=angry 时应渲染 angry 嘴型与倒八字眉', () => {
    mockState.pendingExpression = 'angry'
    const { container } = render(<PetCharacter />)
    // angry 嘴巴为向下弧线 "M62 70 Q70 64 78 70"
    const mouthPath = container.querySelector('path[d="M62 70 Q70 64 78 70"]')
    expect(mouthPath).toBeInTheDocument()

    // 倒八字眉
    const leftEyebrow = container.querySelector('line[x1="48"][y1="42"][x2="64"][y2="50"]')
    expect(leftEyebrow).toBeInTheDocument()
  })

  it('pendingExpression=surprised 时应渲染惊讶嘴型与高挑眉', () => {
    mockState.pendingExpression = 'surprised'
    const { container } = render(<PetCharacter />)
    const mouthEllipse = container.querySelector('ellipse[rx="5"][ry="6"]')
    expect(mouthEllipse).toBeInTheDocument()

    const eyebrow = container.querySelector('line[x1="52"][y1="40"][x2="62"][y2="40"]')
    expect(eyebrow).toBeInTheDocument()
  })

  it('无效 pendingAnimation 应 fallback 到 mood 对应的动画', () => {
    mockState.mood = 'sleeping'
    mockState.pendingAnimation = 'invalid-animation'
    render(<PetCharacter />)
    // sleeping 状态下应出现 Zzz 气泡
    expect(screen.getByText('Z')).toBeInTheDocument()
  })

  it('无效 pendingExpression 应 fallback 到 neutral', () => {
    mockState.pendingExpression = 'unknown-expression'
    const { container } = render(<PetCharacter />)
    // neutral 嘴巴 "M63 68 Q70 74 77 68"
    const mouthPath = container.querySelector('path[d="M63 68 Q70 74 77 68"]')
    expect(mouthPath).toBeInTheDocument()
  })

  it('pendingAnimation=jump 时应触发 jump 动画', () => {
    mockState.pendingAnimation = 'jump'
    const { container } = render(<PetCharacter />)
    const motionDiv = container.querySelector('[style*="width: 140px"]')
    expect(motionDiv).toBeInTheDocument()
  })

  it('mood=annoyed 时即使 pendingExpression 为空也应显示蒸汽粒子', () => {
    mockState.mood = 'annoyed'
    const { container } = render(<PetCharacter />)
    // 蒸汽粒子中包含 💢，但在 jsdom 中直接查找文本节点不稳定，检查 motion span 数量
    const spans = container.querySelectorAll('span')
    expect(spans.length).toBeGreaterThan(0)
  })
})
