import { describe, it, expect, beforeEach } from 'vitest'
import { useGridStore, LAYOUT_PRESETS, sanitizeSizes, sanitizeSlots, type PanelType } from '@/stores/gridStore'

describe('gridStore 唯一性约束与布局操作', () => {
  beforeEach(() => {
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

  it('removeSlot 应将指定格子清空', () => {
    const state = useGridStore.getState()
    state.removeSlot(4)
    expect(useGridStore.getState().layout.slots[4]).toBeNull()
  })

  it('setSlot 应将面板放入指定格子', () => {
    const state = useGridStore.getState()
    state.setSlot(0, 'chat')
    expect(useGridStore.getState().layout.slots[0]).toBe('chat')
  })

  it('getPanelIndex 应返回核心面板所在索引', () => {
    const state = useGridStore.getState()
    expect(state.getPanelIndex('pet')).toBe(4)
    expect(state.getPanelIndex('aiView')).toBe(7)
    expect(state.getPanelIndex('chat')).toBe(6)
    expect(state.getPanelIndex('nonexistent' as any)).toBe(-1)
  })

  it('setSlot 放置核心面板时应移除已存在的实例', () => {
    const state = useGridStore.getState()
    // pet initially at index 4
    state.setSlot(8, 'pet')
    const layout = useGridStore.getState().layout.slots
    expect(layout[4]).toBeNull()
    expect(layout[8]).toBe('pet')
    expect(layout.filter((s) => s === 'pet').length).toBe(1)
  })

  it('ensureUniquePanel 应保证核心面板全局最多一个实例', () => {
    const state = useGridStore.getState()
    // Construct an invalid layout with duplicate chat panels
    useGridStore.setState({
      layout: { slots: ['chat', null, null, 'chat', 'pet', null, 'chat', 'aiView', 'chat'] },
    })
    state.ensureUniquePanel('chat')
    const layout = useGridStore.getState().layout.slots
    expect(layout.filter((s) => s === 'chat').length).toBe(1)
    expect(layout.indexOf('chat')).toBeGreaterThanOrEqual(0)
  })

  it('swapSlots 应保持核心面板唯一性不被破坏', () => {
    const state = useGridStore.getState()
    state.swapSlots(4, 6)
    const layout = useGridStore.getState().layout.slots
    expect(layout[4]).toBe('chat')
    expect(layout[6]).toBe('pet')
    expect(layout.filter((s) => s === 'pet').length).toBe(1)
    expect(layout.filter((s) => s === 'chat').length).toBe(1)
  })
})

describe('所有面板类型唯一性（非核心面板也不可重复）', () => {
  const nonCorePanels: Array<{ type: PanelType; label: string }> = [
    { type: 'browser', label: '浏览器预览' },
    { type: 'clock', label: '时钟' },
    { type: 'weather', label: '天气' },
    { type: 'heatmap', label: '热力图' },
    { type: 'extensions', label: '扩展' },
    { type: 'todo', label: '待办' },
  ]

  nonCorePanels.forEach(({ type, label }) => {
    it(`setSlot 放置已存在的 ${label}（${type}）时应移除旧实例`, () => {
      useGridStore.setState({
        layout: {
          slots: [type, null, null, null, 'pet', null, 'chat', 'aiView', null],
          colSizes: [1, 1, 1],
          rowSizes: [1, 1, 1],
        },
      })
      const state = useGridStore.getState()
      state.setSlot(2, type)
      const layout = useGridStore.getState().layout.slots
      expect(layout[0]).toBeNull()
      expect(layout[2]).toBe(type)
      expect(layout.filter((s) => s === type).length).toBe(1)
    })
  })

  it('ensureUniquePanel 对非核心面板也生效', () => {
    useGridStore.setState({
      layout: {
        slots: ['clock', null, 'clock', null, null, null, null, null, null],
        colSizes: [1, 1, 1],
        rowSizes: [1, 1, 1],
      },
    })
    const state = useGridStore.getState()
    state.ensureUniquePanel('clock')
    const layout = useGridStore.getState().layout.slots
    expect(layout.filter((s) => s === 'clock').length).toBe(1)
  })
})

describe('gridStore 布局预设', () => {
  it('应包含 focus-pet 预设', () => {
    expect(LAYOUT_PRESETS['focus-pet']).toBeDefined()
    const slots = LAYOUT_PRESETS['focus-pet'].slots
    expect(slots.filter((s) => s === 'pet').length).toBe(1)
    expect(slots.length).toBe(9)
  })

  it('应包含 classic 预设', () => {
    expect(LAYOUT_PRESETS['classic']).toBeDefined()
    const slots = LAYOUT_PRESETS['classic'].slots
    expect(slots.filter((s) => s === 'chat').length).toBe(1)
    expect(slots.filter((s) => s === 'aiView').length).toBe(1)
    expect(slots.filter((s) => s === 'pet').length).toBe(1)
    expect(slots.length).toBe(9)
  })

  it('applyPreset 应能切换到新增预设', () => {
    const state = useGridStore.getState()
    state.applyPreset('focus-pet')
    expect(useGridStore.getState().layout.slots).toEqual(LAYOUT_PRESETS['focus-pet'].slots)
    state.applyPreset('classic')
    expect(useGridStore.getState().layout.slots).toEqual(LAYOUT_PRESETS['classic'].slots)
  })
})

describe('gridStore 拖动分隔条调整格子大小', () => {
  beforeEach(() => {
    useGridStore.setState({
      layout: {
        slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null],
        colSizes: [1, 1, 1],
        rowSizes: [1, 1, 1],
      },
    })
  })

  it('resizeColumn 应在保持总和不变的前提下重新分配相邻两列', () => {
    const state = useGridStore.getState()
    state.resizeColumn(0, 0.5)
    const { colSizes } = useGridStore.getState().layout
    // 第 0 列增加 0.5，第 1 列减少 0.5，第 2 列不变
    expect(colSizes[0]).toBeCloseTo(1.5)
    expect(colSizes[1]).toBeCloseTo(0.5)
    expect(colSizes[2]).toBe(1)
    // 总和保持 3
    expect(colSizes[0] + colSizes[1] + colSizes[2]).toBeCloseTo(3)
  })

  it('resizeColumn 不应影响第 2 列', () => {
    const state = useGridStore.getState()
    state.resizeColumn(1, -0.3)
    const { colSizes } = useGridStore.getState().layout
    expect(colSizes[0]).toBe(1)
    expect(colSizes[1]).toBeCloseTo(0.7)
    expect(colSizes[2]).toBeCloseTo(1.3)
  })

  it('resizeColumn 应阻止列塌缩到最小值以下', () => {
    const state = useGridStore.getState()
    // 试图把第 0 列拖到极小
    state.resizeColumn(0, -5)
    const { colSizes } = useGridStore.getState().layout
    expect(colSizes[0]).toBeGreaterThanOrEqual(0.25 - 1e-9)
    expect(colSizes[1]).toBeGreaterThanOrEqual(0.25 - 1e-9)
  })

  it('resizeRow 应重新分配相邻两行且保持总和', () => {
    const state = useGridStore.getState()
    state.resizeRow(0, 0.6)
    const { rowSizes } = useGridStore.getState().layout
    expect(rowSizes[0]).toBeCloseTo(1.6)
    expect(rowSizes[1]).toBeCloseTo(0.4)
    expect(rowSizes[2]).toBe(1)
  })

  it('resetSizes 应将列/行比例重置为 [1,1,1]', () => {
    const state = useGridStore.getState()
    state.resizeColumn(0, 0.5)
    state.resizeRow(1, -0.4)
    state.resetSizes()
    const { colSizes, rowSizes } = useGridStore.getState().layout
    expect(colSizes).toEqual([1, 1, 1])
    expect(rowSizes).toEqual([1, 1, 1])
  })

  it('resizeColumn 对越界索引应无操作', () => {
    const state = useGridStore.getState()
    const before = useGridStore.getState().layout.colSizes
    // @ts-expect-error 测试越界
    state.resizeColumn(5, 0.5)
    expect(useGridStore.getState().layout.colSizes).toEqual(before)
  })
})

describe('sanitizeSizes 验证列/行比例的有效性', () => {
  it('应接受正常的 [1,1,1] 比例', () => {
    expect(sanitizeSizes([1, 1, 1])).toEqual([1, 1, 1])
  })

  it('应接受通过拖动产生的非均匀比例（总和=3）', () => {
    // resizeColumn 保持总和=3，这是正常操作可产生的值
    expect(sanitizeSizes([1.5, 0.5, 1])).toEqual([1.5, 0.5, 1])
  })

  it('应拒绝包含 NaN 的比例并重置为 [1,1,1]', () => {
    expect(sanitizeSizes([1, NaN, 1])).toEqual([1, 1, 1])
  })

  it('应拒绝包含负值的比例并重置为 [1,1,1]', () => {
    expect(sanitizeSizes([1, -0.5, 1])).toEqual([1, 1, 1])
  })

  it('应拒绝总和偏离 3 过多的比例并重置', () => {
    // [2,1,1] 总和=4，不可能通过 resizeColumn 产生（resize 保持总和不变）
    expect(sanitizeSizes([2, 1, 1])).toEqual([1, 1, 1])
  })

  it('应拒绝长度不为 3 的数组并重置', () => {
    expect(sanitizeSizes([1, 1])).toEqual([1, 1, 1])
    expect(sanitizeSizes([1, 1, 1, 1])).toEqual([1, 1, 1])
  })

  it('应拒绝非数组输入并重置', () => {
    expect(sanitizeSizes(null as unknown as number[])).toEqual([1, 1, 1])
    expect(sanitizeSizes(undefined as unknown as number[])).toEqual([1, 1, 1])
  })
})

describe('sanitizeSlots — 确保格子数量始终为 9', () => {
  it('正常的 9 格数组应原样返回', () => {
    const slots = [null, null, null, null, 'pet', null, 'chat', 'aiView', null]
    expect(sanitizeSlots(slots)).toEqual(slots)
    expect(sanitizeSlots(slots)).toHaveLength(9)
  })

  it('超过 9 格的数组应截断为 9 格', () => {
    const slots = [null, null, null, null, 'pet', null, 'chat', 'aiView', null, 'clock', 'weather']
    const result = sanitizeSlots(slots)
    expect(result).toHaveLength(9)
    // 保留前 9 个
    expect(result[8]).toBeNull()
  })

  it('不足 9 格的数组应补齐 null 到 9 格', () => {
    const slots = ['chat', null, 'pet']
    const result = sanitizeSlots(slots)
    expect(result).toHaveLength(9)
    expect(result[0]).toBe('chat')
    expect(result[2]).toBe('pet')
    expect(result[3]).toBeNull()
    expect(result[8]).toBeNull()
  })

  it('空数组应返回 9 个 null', () => {
    const result = sanitizeSlots([])
    expect(result).toHaveLength(9)
    expect(result.every((s) => s === null)).toBe(true)
  })

  it('非数组输入应返回默认 9 格布局', () => {
    expect(sanitizeSlots(null as unknown as PanelType[])).toHaveLength(9)
    expect(sanitizeSlots(undefined as unknown as PanelType[])).toHaveLength(9)
  })
})

describe('边界守卫：setSlot / swapSlots / updateLayout 拒绝越界操作', () => {
  beforeEach(() => {
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

  it('setSlot 拒绝 index >= 9，不应增加格子数量', () => {
    const before = useGridStore.getState().layout.slots
    const state = useGridStore.getState()
    // @ts-expect-error 测试越界索引
    state.setSlot(9, 'clock')
    const after = useGridStore.getState().layout.slots
    expect(after).toHaveLength(9)
    expect(after).toEqual(before)
  })

  it('setSlot 拒绝 index < 0', () => {
    const before = useGridStore.getState().layout.slots
    const state = useGridStore.getState()
    // @ts-expect-error 测试越界索引
    state.setSlot(-1, 'clock')
    expect(useGridStore.getState().layout.slots).toEqual(before)
  })

  it('swapSlots 拒绝越界索引', () => {
    const before = useGridStore.getState().layout.slots
    const state = useGridStore.getState()
    // @ts-expect-error 测试越界索引
    state.swapSlots(4, 9)
    expect(useGridStore.getState().layout.slots).toEqual(before)
    // @ts-expect-error 测试越界索引
    state.swapSlots(-1, 4)
    expect(useGridStore.getState().layout.slots).toEqual(before)
  })

  it('updateLayout 应对传入的 slots 做 sanitize，截断为 9 格', () => {
    const state = useGridStore.getState()
    state.updateLayout({
      slots: ['clock', null, null, null, 'pet', null, 'chat', 'aiView', null, 'weather', 'todo'],
      colSizes: [1, 1, 1],
      rowSizes: [1, 1, 1],
    })
    expect(useGridStore.getState().layout.slots).toHaveLength(9)
    // 第 10 个元素 'weather' 不应出现
    expect(useGridStore.getState().layout.slots).not.toContain('weather')
  })

  it('updateLayout 应对不足 9 格的 slots 补齐 null', () => {
    const state = useGridStore.getState()
    state.updateLayout({
      slots: ['clock', null],
      colSizes: [1, 1, 1],
      rowSizes: [1, 1, 1],
    })
    const slots = useGridStore.getState().layout.slots
    expect(slots).toHaveLength(9)
    expect(slots[0]).toBe('clock')
    expect(slots[1]).toBeNull()
    expect(slots[8]).toBeNull()
  })
})
