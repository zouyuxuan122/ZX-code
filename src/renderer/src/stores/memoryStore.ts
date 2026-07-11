import { create } from 'zustand'
import type {
  MemoryNode,
  CreateMemoryNodeDto,
  UpdateMemoryNodeDto,
  RecallQuery,
  RecallResultItem,
  ObsidianExportResult,
  MemoryPartition,
} from '@shared/types/memory'
import type { MemoryStats } from '@shared/types/ipc'
import { ipc } from '@/services/ipc'

interface MemoryState {
  nodes: MemoryNode[]
  loading: boolean
  searchResults: RecallResultItem[]
  searching: boolean
  stats: MemoryStats | null

  loadNodes: (partition?: MemoryPartition) => Promise<void>
  search: (query: RecallQuery) => Promise<void>
  createNode: (dto: CreateMemoryNodeDto) => Promise<MemoryNode>
  updateNode: (id: string, dto: UpdateMemoryNodeDto) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  loadStats: () => Promise<void>
  exportObsidian: (
    outputPath: string,
    includeSubconscious?: boolean,
  ) => Promise<ObsidianExportResult>
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  nodes: [],
  loading: false,
  searchResults: [],
  searching: false,
  stats: null,

  loadNodes: async (partition) => {
    set({ loading: true })
    try {
      const nodes = await ipc.memory.list(partition)
      set({ nodes })
    } finally {
      set({ loading: false })
    }
  },

  search: async (query) => {
    set({ searching: true })
    try {
      const results = await ipc.memory.search(query)
      set({ searchResults: results })
    } finally {
      set({ searching: false })
    }
  },

  createNode: async (dto) => {
    const node = await ipc.memory.create(dto)
    set((state) => ({ nodes: [node, ...state.nodes] }))
    return node
  },

  updateNode: async (id, dto) => {
    const updated = await ipc.memory.update(id, dto)
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? updated : n)),
    }))
  },

  deleteNode: async (id) => {
    await ipc.memory.delete(id)
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      searchResults: state.searchResults.filter((r) => r.node.id !== id),
    }))
    // 重新加载统计
    await get().loadStats()
  },

  loadStats: async () => {
    const stats = await ipc.memory.stats()
    set({ stats })
  },

  exportObsidian: async (outputPath, includeSubconscious) => {
    return await ipc.memory.exportObsidian({ outputPath, includeSubconscious })
  },
}))
