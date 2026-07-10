import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { FileSearchResult, SearchOptions } from '@shared/types/search'
import { useProjectStore } from '@/stores/projectStore'

interface SearchState {
  isOpen: boolean
  query: string
  mode: 'filename' | 'content' | 'all'
  results: FileSearchResult[]
  loading: boolean
  error: string | null
  selectedIndex: number
  useRegex: boolean
  caseSensitive: boolean

  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (q: string) => void
  setMode: (m: 'filename' | 'content' | 'all') => void
  toggleRegex: () => void
  toggleCaseSensitive: () => void
  selectNext: () => void
  selectPrev: () => void
  selectIndex: (i: number) => void
  clear: () => void
  executeSearch: () => Promise<void>
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  mode: 'all',
  results: [],
  loading: false,
  error: null,
  selectedIndex: 0,
  useRegex: false,
  caseSensitive: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '', results: [], selectedIndex: 0 }),
  toggle: () => set((s) => (s.isOpen ? { isOpen: false } : { isOpen: true })),
  setQuery: (q) => { set({ query: q, selectedIndex: 0 }); void get().executeSearch() },
  setMode: (m) => { set({ mode: m, selectedIndex: 0 }); void get().executeSearch() },
  toggleRegex: () => { set((s) => ({ useRegex: !s.useRegex })); void get().executeSearch() },
  toggleCaseSensitive: () => { set((s) => ({ caseSensitive: !s.caseSensitive })); void get().executeSearch() },
  selectNext: () => set((s) => ({ selectedIndex: Math.min(s.selectedIndex + 1, s.results.length - 1) })),
  selectPrev: () => set((s) => ({ selectedIndex: Math.max(s.selectedIndex - 1, 0) })),
  selectIndex: (i) => set({ selectedIndex: i }),
  clear: () => set({ query: '', results: [], selectedIndex: 0 }),

  executeSearch: async () => {
    const { query, mode, useRegex, caseSensitive } = get()
    if (!query.trim()) { set({ results: [], loading: false }); return }
    const workspacePath = useProjectStore.getState().currentProject?.workspace_path
    if (!workspacePath) { set({ results: [], error: '未选择项目工作区' }); return }
    set({ loading: true, error: null })
    try {
      const results = await ipc.search.files({ workspacePath, query, mode, useRegex, caseSensitive, maxResults: 100 } as SearchOptions)
      set({ results, loading: false, selectedIndex: 0 })
    } catch (err) {
      set({ results: [], loading: false, error: (err as Error).message })
    }
  },
}))
