import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PanelType = 'chat' | 'aiView' | 'pet' | 'browser' | 'clock' | 'weather' | 'heatmap' | 'extensions' | 'todo' | 'kanban' | null

export interface GridLayout {
  // 9个格子的面板映射，位置索引 0-8 (从左到右，从上到下)
  // 默认布局:
  // [空, 空, 空]
  // [空, 宠物窗口, 实时AI视图]
  // [空, 对话, 空]
  slots: PanelType[]
  // 三列/三行的相对比例（fr），可通过拖动分隔条调整格子大小
  colSizes: number[]
  rowSizes: number[]
}

/** 布局预设方案 — 底部三格为矮面板行 */
export const LAYOUT_PRESETS = {
  'default': {
    name: '默认布局',
    slots: [null, null, null, null, 'pet', null, 'chat', 'aiView', null] as PanelType[],
  },
  'focus-chat': {
    name: '对话优先',
    slots: [null, null, null, null, null, null, 'chat', 'pet', 'aiView'] as PanelType[],
  },
  'monitor': {
    name: '监控模式',
    slots: [null, null, null, null, null, null, 'aiView', 'chat', 'pet'] as PanelType[],
  },
  'focus-pet': {
    name: '宠物专注',
    slots: [null, 'pet', null, null, null, null, 'chat', 'aiView', null] as PanelType[],
  },
  'classic': {
    name: '经典布局',
    slots: ['chat', null, null, 'aiView', null, 'pet', null, null, null] as PanelType[],
  },
} as const

export type LayoutPresetKey = keyof typeof LAYOUT_PRESETS

/** 需要保证全局唯一的面板（所有非 null 面板都必须唯一） */
const UNIQUE_PANELS: PanelType[] = ['chat', 'aiView', 'pet', 'browser', 'clock', 'weather', 'heatmap', 'extensions', 'todo', 'kanban']

interface GridStore {
  isGridMode: boolean
  layout: GridLayout
  isTransitioning: boolean
  toggleGridMode: () => void
  setGridMode: (mode: boolean) => void
  updateLayout: (layout: GridLayout) => void
  swapSlots: (fromIndex: number, toIndex: number) => void
  removeSlot: (index: number) => void
  setSlot: (index: number, panel: PanelType) => void
  getPanelIndex: (panel: PanelType) => number
  ensureUniquePanel: (panel: PanelType) => void
  resetLayout: () => void
  applyPreset: (key: LayoutPresetKey) => void
  setTransitioning: (v: boolean) => void
  // 拖动分隔条调整相邻两列/两行的比例（index 为左侧/上侧列/行索引）
  resizeColumn: (index: number, deltaRatio: number) => void
  resizeRow: (index: number, deltaRatio: number) => void
  resetSizes: () => void
}

const DEFAULT_LAYOUT: GridLayout = {
  slots: [
    null,   null,  null,
    null,   'pet', null,
    'chat', 'aiView', null,
  ],
  colSizes: [1, 1, 1],
  rowSizes: [1, 1, 1],
}

// 列/行比例的最小值，防止格子塌缩到不可用
const MIN_SIZE = 0.25
// 比例总和的期望值（3 列/行，每列/行基准为 1）
const EXPECTED_TOTAL = 3
// 总和允许的误差范围（防止浮点数精度问题导致误判）
const TOTAL_TOLERANCE = 0.5

/**
 * 验证列/行比例数组的有效性。
 * 无效值（NaN、负值、长度不为 3、总和偏离过多）会被重置为 [1,1,1]。
 * 这防止了持久化存储中可能出现的异常值导致分隔条位置错乱。
 */
export function sanitizeSizes(sizes: unknown): number[] {
  if (!Array.isArray(sizes) || sizes.length !== 3) {
    return [1, 1, 1]
  }
  const nums = sizes as number[]
  // 任一值为 NaN 或负数 → 无效
  if (nums.some((n) => typeof n !== 'number' || isNaN(n) || n < 0)) {
    return [1, 1, 1]
  }
  // 总和偏离期望值太多 → 无效（防止 [0.1,0.1,0.1] 等异常值）
  const total = nums.reduce((a, b) => a + b, 0)
  if (Math.abs(total - EXPECTED_TOTAL) > TOTAL_TOLERANCE) {
    return [1, 1, 1]
  }
  return nums
}

/**
 * 验证 slots 数组的有效性。
 * 九宫格必须始终为 9 格：超过 9 格截断，不足 9 格补 null。
 * 这防止了持久化存储中可能出现的异常长度导致网格渲染多余格子。
 */
export function sanitizeSlots(slots: unknown): PanelType[] {
  const VALID_PANELS = new Set<PanelType>(['chat', 'aiView', 'pet', 'browser', 'clock', 'weather', 'heatmap', 'extensions', 'todo', 'kanban', null])
  if (!Array.isArray(slots)) {
    return [...DEFAULT_LAYOUT.slots]
  }
  const arr = slots as unknown[]
  // 截取前 9 格，不足补 null
  const result: PanelType[] = []
  for (let i = 0; i < 9; i++) {
    const item = arr[i]
    if (typeof item === 'string' && VALID_PANELS.has(item as PanelType)) {
      result.push(item as PanelType)
    } else {
      result.push(null)
    }
  }
  return result
}

export const useGridStore = create<GridStore>()(
  persist(
    (set, get) => ({
      isGridMode: false,
      layout: DEFAULT_LAYOUT,
      isTransitioning: false,

      toggleGridMode: () => set((state) => ({ isGridMode: !state.isGridMode })),

      setGridMode: (mode: boolean) => set({ isGridMode: mode }),

      updateLayout: (layout: GridLayout) =>
        set({
          layout: {
            slots: sanitizeSlots(layout.slots),
            colSizes: sanitizeSizes(layout.colSizes),
            rowSizes: sanitizeSizes(layout.rowSizes),
          },
        }),

      swapSlots: (fromIndex: number, toIndex: number) =>
        set((state) => {
          if (fromIndex < 0 || fromIndex >= 9 || toIndex < 0 || toIndex >= 9) return state
          const newSlots = [...state.layout.slots]
          const tmp = newSlots[fromIndex]
          newSlots[fromIndex] = newSlots[toIndex]
          newSlots[toIndex] = tmp
          return { layout: { ...state.layout, slots: newSlots } }
        }),

      removeSlot: (index: number) =>
        set((state) => {
          const newSlots = [...state.layout.slots]
          newSlots[index] = null
          return { layout: { ...state.layout, slots: newSlots } }
        }),

      setSlot: (index: number, panel: PanelType) =>
        set((state) => {
          if (index < 0 || index >= 9) return state
          const newSlots = [...state.layout.slots]
          // 核心面板需保证全局唯一：先清空原位置
          if (panel && UNIQUE_PANELS.includes(panel)) {
            const existingIndex = newSlots.indexOf(panel)
            if (existingIndex !== -1 && existingIndex !== index) {
              newSlots[existingIndex] = null
            }
          }
          newSlots[index] = panel
          return { layout: { ...state.layout, slots: newSlots } }
        }),

      getPanelIndex: (panel: PanelType) => {
        return get().layout.slots.indexOf(panel)
      },

      ensureUniquePanel: (panel: PanelType) => {
        if (!panel || !UNIQUE_PANELS.includes(panel)) return
        set((state) => {
          const newSlots = [...state.layout.slots]
          const indices: number[] = []
          newSlots.forEach((slot, idx) => {
            if (slot === panel) indices.push(idx)
          })
          // 保留第一个，其余清空
          indices.slice(1).forEach((idx) => {
            newSlots[idx] = null
          })
          return { layout: { ...state.layout, slots: newSlots } }
        })
      },

      setTransitioning: (v: boolean) => set({ isTransitioning: v }),

      resetLayout: () =>
        set({
          layout: {
            slots: [...DEFAULT_LAYOUT.slots],
            colSizes: [1, 1, 1],
            rowSizes: [1, 1, 1],
          },
        }),

      applyPreset: (key: LayoutPresetKey) => {
        const preset = LAYOUT_PRESETS[key]
        if (preset) {
          set((state) => ({
            layout: { ...state.layout, slots: [...preset.slots] },
          }))
        }
      },

      // 调整相邻两列比例：保持 colSizes[index]+colSizes[index+1] 总和不变，重新分配
      resizeColumn: (index: number, deltaRatio: number) => {
        if (index < 0 || index > 1) return
        set((state) => {
          const sizes = [...state.layout.colSizes]
          const total = sizes[index] + sizes[index + 1]
          let a = sizes[index] + deltaRatio
          let b = total - a
          if (a < MIN_SIZE) {
            b -= MIN_SIZE - a
            a = MIN_SIZE
          }
          if (b < MIN_SIZE) {
            a -= MIN_SIZE - b
            b = MIN_SIZE
          }
          sizes[index] = a
          sizes[index + 1] = b
          return { layout: { ...state.layout, colSizes: sizes } }
        })
      },

      resizeRow: (index: number, deltaRatio: number) => {
        if (index < 0 || index > 1) return
        set((state) => {
          const sizes = [...state.layout.rowSizes]
          const total = sizes[index] + sizes[index + 1]
          let a = sizes[index] + deltaRatio
          let b = total - a
          if (a < MIN_SIZE) {
            b -= MIN_SIZE - a
            a = MIN_SIZE
          }
          if (b < MIN_SIZE) {
            a -= MIN_SIZE - b
            b = MIN_SIZE
          }
          sizes[index] = a
          sizes[index + 1] = b
          return { layout: { ...state.layout, rowSizes: sizes } }
        })
      },

      resetSizes: () =>
        set((state) => ({
          layout: { ...state.layout, colSizes: [1, 1, 1], rowSizes: [1, 1, 1] },
        })),
    }),
    {
      name: 'zx-grid-layout',
      partialize: (state) => ({ layout: state.layout }),
      // 兼容旧持久化数据：补全缺失的 colSizes/rowSizes，并验证值的有效性
      merge: (persisted, current) => {
        const p = (persisted as Partial<GridStore>) ?? {}
        const persistedLayout = p.layout
        const base = (current as GridStore).layout
        return {
          ...(current as GridStore),
          ...p,
          layout: persistedLayout
            ? {
                slots: sanitizeSlots(persistedLayout.slots),
                colSizes: sanitizeSizes(persistedLayout.colSizes),
                rowSizes: sanitizeSizes(persistedLayout.rowSizes),
              }
            : base,
        }
      },
    },
  ),
)
