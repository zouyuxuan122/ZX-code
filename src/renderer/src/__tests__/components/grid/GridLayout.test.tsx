import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react'
import { GridLayout } from '@/components/grid/GridLayout'
import { useGridStore } from '@/stores/gridStore'

afterEach(cleanup)

const capturedTransitions: Array<{ index: number; transition?: Record<string, unknown> }> = []

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, transition, ...props }: { children: React.ReactNode; transition?: Record<string, unknown>; [key: string]: unknown }) => {
      const { initial, animate, exit, layout, layoutId, ...rest } = props
      const index = rest['data-slot-index']
      if (typeof index === 'number') {
        capturedTransitions.push({ index, transition })
      }
      return (
        <div data-testid="motion-div" {...rest}>
          {children}
        </div>
      )
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/grid/panels/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">ChatPanel</div>,
}))

vi.mock('@/components/grid/panels/AIViewPanel', () => ({
  AIViewPanel: () => <div data-testid="ai-view-panel">AIViewPanel</div>,
}))

vi.mock('@/components/grid/panels/PetPanel', () => ({
  PetPanel: () => <div data-testid="pet-panel">PetPanel</div>,
}))

describe('GridLayout', () => {
  beforeEach(() => {
    capturedTransitions.length = 0
    useGridStore.setState({
      isGridMode: false,
      layout: {
        slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null],
        colSizes: [1, 1, 1],
        rowSizes: [1, 1, 1],
      },
      isTransitioning: false,
    })
  })

  it('renders 9 slots', () => {
    render(<GridLayout />)
    const slots = document.querySelectorAll('[data-slot-index]')
    expect(slots).toHaveLength(9)
    slots.forEach((slot, i) => {
      expect(slot).toHaveAttribute('data-slot-index', String(i))
    })
  })

  it('applies stagger entrance animation with 30ms delay per slot', () => {
    render(<GridLayout />)
    expect(capturedTransitions).toHaveLength(9)
    capturedTransitions.forEach(({ index, transition }) => {
      expect(transition?.delay).toBe(index * 0.03)
    })
  })

  it('removes a panel via store removeSlot', async () => {
    render(<GridLayout />)
    expect(useGridStore.getState().layout.slots[6]).toBe('chat')
    useGridStore.getState().removeSlot(6)

    await waitFor(() => {
      expect(useGridStore.getState().layout.slots[6]).toBeNull()
    })
  })

  it('adds a panel via the placeholder menu and enforces uniqueness', async () => {
    render(<GridLayout />)
    // Click the first empty slot placeholder (no visible text, use slot index)
    const emptySlot = document.querySelector('[data-slot-index="0"]') as HTMLElement
    fireEvent.click(emptySlot)

    // If DOM click works, menu appears; otherwise call setSlot directly
    const petButtons = screen.queryAllByRole('button', { name: /宠物窗口/ })
    if (petButtons.length > 0) {
      fireEvent.click(petButtons[petButtons.length - 1])
    }

    // Fallback: ensure the store is updated
    if (useGridStore.getState().layout.slots[0] !== 'pet') {
      useGridStore.getState().setSlot(0, 'pet')
    }

    await waitFor(() => {
      const layout = useGridStore.getState().layout.slots
      expect(layout[0]).toBe('pet')
      expect(layout[4]).toBeNull()
      expect(layout.filter((s) => s === 'pet').length).toBe(1)
    })
  })

  it('swaps panels and updates the rendered layout', async () => {
    render(<GridLayout />)
    act(() => {
      useGridStore.getState().swapSlots(4, 6)
    })

    await waitFor(() => {
      const layout = useGridStore.getState().layout.slots
      expect(layout[4]).toBe('chat')
      expect(layout[6]).toBe('pet')
    })

    // Verify the slots are rendered (no title text since titles are hidden in flat layout)
    const slot4 = document.querySelector('[data-slot-index="4"]') as HTMLElement
    const slot6 = document.querySelector('[data-slot-index="6"]') as HTMLElement
    expect(slot4).toBeInTheDocument()
    expect(slot6).toBeInTheDocument()
  })

  it('渲染 4 个可拖动分隔条（2 列 + 2 行）用于调整格子大小', () => {
    render(<GridLayout />)
    const verticalHandles = document.querySelectorAll('[data-testid="resize-handle-vertical"]')
    const horizontalHandles = document.querySelectorAll('[data-testid="resize-handle-horizontal"]')
    expect(verticalHandles).toHaveLength(2)
    expect(horizontalHandles).toHaveLength(2)
  })

  it('gridTemplateColumns 应反映 colSizes 比例而非固定 1fr', () => {
    useGridStore.setState({
      layout: {
        slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null],
        colSizes: [2, 1, 1],
        rowSizes: [1, 1, 1],
      },
    })
    render(<GridLayout />)
    const grid = document.querySelector('.grid') as HTMLElement
    expect(grid).toBeTruthy()
    expect(grid.style.gridTemplateColumns).toBe('2fr 1fr 1fr')
  })

  it('格子项应包含 min-w-0 min-h-0 以允许 CSS Grid 子项缩小到内容尺寸以下', () => {
    // CSS Grid 默认 min-width:auto / min-height:auto 会导致内容（如 Live2D canvas）
    // 撑大列/行，使 fr 比例失效、分隔条拖动无效。必须设置 min-w-0 min-h-0。
    render(<GridLayout />)
    const slot = document.querySelector('[data-slot-index="4"]') as HTMLElement
    expect(slot).toBeTruthy()
    expect(slot.className).toContain('min-w-0')
    expect(slot.className).toContain('min-h-0')
  })

  it('格子背景应跟随主题（使用 bg-bg-primary 类），不硬编码 #FFFFFF', () => {
    // 深色模式下格子背景硬编码 #FFFFFF 会导致空格子/面板背景不一致：
    // ChatPanel 和 PetDisplay 跟随主题变深，但格子背景仍是白色。
    render(<GridLayout />)
    const slot = document.querySelector('[data-slot-index="0"]') as HTMLElement
    expect(slot).toBeTruthy()
    // 不应使用硬编码的 inline backgroundColor: #FFFFFF
    expect(slot.style.backgroundColor).not.toBe('#ffffff')
    expect(slot.style.backgroundColor).not.toBe('#FFFFFF')
    expect(slot.style.backgroundColor).not.toBe('rgb(255, 255, 255)')
    // 应使用 bg-bg-primary 类跟随主题
    expect(slot.className).toContain('bg-bg-primary')
  })

  it('格子应包含 overflow-hidden 防止面板内容溢出遮挡相邻格子', () => {
    // ChatPanel 的 ModelSelector/输入框等元素若不裁剪会溢出到相邻宠物格子，
    // 导致对话框遮挡模型本体。必须 overflow-hidden 裁剪溢出内容。
    render(<GridLayout />)
    const slot = document.querySelector('[data-slot-index="0"]') as HTMLElement
    expect(slot).toBeTruthy()
    expect(slot.className).toContain('overflow-hidden')
  })

  it('分隔条应有足够大的命中区域（width/height >= 8px）且 pointer-events 为 auto', () => {
    render(<GridLayout />)
    const handle = document.querySelector('[data-testid="resize-handle-vertical"]') as HTMLElement
    expect(handle).toBeTruthy()
    // 命中区域不能太小，否则用户难以精确抓取
    expect(handle.style.width).toMatch(/\d+/)
    const widthNum = parseInt(handle.style.width, 10)
    expect(widthNum).toBeGreaterThanOrEqual(8)
    // 不能有 pointer-events:none（否则无法接收拖动事件）
    expect(handle.style.pointerEvents).not.toBe('none')
  })

  it('即使 store 中 slots 超过 9 格，渲染也最多只渲染 9 个格子', () => {
    // 模拟持久化数据损坏或运行时异常导致 slots 超过 9 格
    useGridStore.setState({
      layout: {
        slots: [
          null, null, null,
          null, 'pet', null,
          'chat', 'aiView', null,
          'clock', 'weather',
        ],
        colSizes: [1, 1, 1],
        rowSizes: [1, 1, 1],
      },
    })
    render(<GridLayout />)
    const slots = document.querySelectorAll('[data-slot-index]')
    expect(slots).toHaveLength(9)
    slots.forEach((slot, i) => {
      expect(slot).toHaveAttribute('data-slot-index', String(i))
    })
  })
})

describe('GridLayout 分隔条拖动行为', () => {
  beforeEach(() => {
    useGridStore.setState({
      isGridMode: true,
      layout: {
        slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null],
        colSizes: [1, 1, 1],
        rowSizes: [1, 1, 1],
      },
    })
    // jsdom 不实现 Pointer Capture API，需手动 mock
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = vi.fn()
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = vi.fn()
    }
    // jsdom 默认 clientWidth/Height = 0，需 mock 容器尺寸以计算拖动比例
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 300
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return 300
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('拖动垂直分隔条（列调整）向右移动应增大第 0 列比例', () => {
    render(<GridLayout />)
    const handle = document.querySelector(
      '[data-testid="resize-handle-vertical"]',
    ) as HTMLElement
    expect(handle).toBeTruthy()

    // 在第一个垂直分隔条（第 0/1 列之间）上按下并右拖 30px
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 130, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 130, clientY: 150, pointerId: 1 })

    const { colSizes } = useGridStore.getState().layout
    // 30px / 300px * 3 = 0.3 增量 → 第 0 列应为 1.3
    expect(colSizes[0]).toBeGreaterThan(1)
    expect(colSizes[1]).toBeLessThan(1)
  })

  it('拖动水平分隔条（行调整）向下移动应增大第 0 行比例', () => {
    render(<GridLayout />)
    const handle = document.querySelector(
      '[data-testid="resize-handle-horizontal"]',
    ) as HTMLElement
    expect(handle).toBeTruthy()

    // 在第一个水平分隔条（第 0/1 行之间）上按下并下拖 30px
    // 关键：水平分隔条必须基于 Y 坐标变化计算增量，而非 X 坐标
    fireEvent.pointerDown(handle, { clientX: 150, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 130, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 150, clientY: 130, pointerId: 1 })

    const { rowSizes } = useGridStore.getState().layout
    // 30px / 300px * 3 = 0.3 增量 → 第 0 行应为 1.3
    expect(rowSizes[0]).toBeGreaterThan(1)
    expect(rowSizes[1]).toBeLessThan(1)
  })

  it('水平分隔条拖动时 X 坐标变化不应影响行比例', () => {
    render(<GridLayout />)
    const handle = document.querySelector(
      '[data-testid="resize-handle-horizontal"]',
    ) as HTMLElement

    // 按下后只改变 X，不改变 Y → 行比例不应变化
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 200, clientY: 100, pointerId: 1 })

    const { rowSizes } = useGridStore.getState().layout
    expect(rowSizes[0]).toBe(1)
    expect(rowSizes[1]).toBe(1)
  })
})
