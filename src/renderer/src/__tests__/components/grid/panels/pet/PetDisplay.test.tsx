import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import type { PetCharacter, PetMood } from '@/stores/petStore'

vi.mock('@/components/grid/panels/pet/PetCharacter', () => ({
  PetCharacter: () => <div data-testid="pet-character">Pet</div>,
}))

interface MockPetState {
  backgroundType: 'theme' | 'solid' | 'gradient' | 'image'
  backgroundValue: string
  background: string
  bubbleText: string | null
  bubbleVisible: boolean
  character: PetCharacter
  mood: PetMood
}

let mockState: MockPetState

vi.mock('@/stores/petStore', () => ({
  usePetStore: vi.fn((selector: (s: MockPetState) => unknown) => {
    return selector(mockState)
  }),
}))

import { PetDisplay } from '@/components/grid/panels/pet/PetDisplay'

const defaultCharacter: PetCharacter = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪',
  greeting: '喵~',
  idleMessages: [],
  workingMessages: [],
  annoyedMessages: [],
  roleCard: '',
  avatarType: 'svg',
  modelPath: null,
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: [],
  expressions: [],
}

function getContainer(): HTMLElement {
  return screen.getByTestId('pet-display-container')
}

describe('PetDisplay background switching', () => {
  beforeEach(() => {
    mockState = {
      backgroundType: 'theme',
      backgroundValue: '',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      bubbleText: null,
      bubbleVisible: false,
      character: defaultCharacter,
      mood: 'idle',
    }

    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.setAttribute('data-style', 'base')
    document.documentElement.style.setProperty('--bg-primary', '#0a0a0a')
    document.documentElement.style.setProperty('--bg-secondary', '#0f0f0f')
  })

  afterEach(() => {
    cleanup()
    document.documentElement.style.removeProperty('--bg-primary')
    document.documentElement.style.removeProperty('--bg-secondary')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-style')
  })

  it('renders PetCharacter and bubble container', () => {
    render(<PetDisplay />)
    expect(screen.getByTestId('pet-character')).toBeInTheDocument()
  })

  it('uses theme gradient when backgroundType is theme', () => {
    render(<PetDisplay />)
    const container = getContainer()
    expect(container.style.background).toContain('linear-gradient')
    expect(container.style.background).toContain('rgb(10, 10, 10)')
    expect(container.style.background).toContain('rgb(15, 15, 15)')
  })

  it('uses solid color when backgroundType is solid', () => {
    mockState.backgroundType = 'solid'
    mockState.backgroundValue = '#ff0000'
    render(<PetDisplay />)
    const container = getContainer()
    expect(container.style.background).toBe('rgb(255, 0, 0)')
  })

  it('uses gradient value when backgroundType is gradient', () => {
    mockState.backgroundType = 'gradient'
    mockState.backgroundValue = 'linear-gradient(to right, red, blue)'
    render(<PetDisplay />)
    const container = getContainer()
    expect(container.style.background).toBe('linear-gradient(to right, red, blue)')
  })

  it('uses image url when backgroundType is image', () => {
    mockState.backgroundType = 'image'
    mockState.backgroundValue = 'file:///C:/Users/test/pet-bg.png'
    render(<PetDisplay />)
    const container = getContainer()
    expect(container.style.backgroundImage).toBe('url("file:///C:/Users/test/pet-bg.png")')
  })

  it('updates background when theme changes while backgroundType is theme', async () => {
    render(<PetDisplay />)
    const container = getContainer()
    const originalBackground = container.style.background

    await act(async () => {
      document.documentElement.style.setProperty('--bg-primary', '#1a1a1c')
      document.documentElement.style.setProperty('--bg-secondary', '#1c1c1e')
      document.documentElement.setAttribute('data-style', 'apple')
    })

    await waitFor(() => {
      expect(container.style.background).not.toBe(originalBackground)
      expect(container.style.background).toContain('rgb(26, 26, 28)')
      expect(container.style.background).toContain('rgb(28, 28, 30)')
    })
  })
})
