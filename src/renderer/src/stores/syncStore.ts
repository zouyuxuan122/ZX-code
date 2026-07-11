import { create } from 'zustand'
import type {
  SyncSource,
  CreateSyncSourceDto,
  UpdateSyncSourceDto,
  FullSyncResult,
} from '@shared/types/sync'
import type { SchedulerStatus } from '@shared/types/ipc'
import { ipc } from '@/services/ipc'

interface SyncState {
  sources: SyncSource[]
  loading: boolean
  syncing: boolean
  schedulerStatus: SchedulerStatus | null
  lastSyncResult: FullSyncResult | null

  loadSources: () => Promise<void>
  loadSchedulerStatus: () => Promise<void>
  addSource: (dto: CreateSyncSourceDto) => Promise<void>
  updateSource: (id: string, dto: UpdateSyncSourceDto) => Promise<void>
  removeSource: (id: string) => Promise<void>
  triggerNow: () => Promise<FullSyncResult>
}

export const useSyncStore = create<SyncState>((set) => ({
  sources: [],
  loading: false,
  syncing: false,
  schedulerStatus: null,
  lastSyncResult: null,

  loadSources: async () => {
    set({ loading: true })
    try {
      const sources = await ipc.sync.listSources()
      set({ sources })
    } finally {
      set({ loading: false })
    }
  },

  loadSchedulerStatus: async () => {
    const status = await ipc.sync.getSchedulerStatus()
    set({ schedulerStatus: status })
  },

  addSource: async (dto) => {
    await ipc.sync.addSource(dto)
    const sources = await ipc.sync.listSources()
    set({ sources })
  },

  updateSource: async (id, dto) => {
    await ipc.sync.updateSource(id, dto)
    const sources = await ipc.sync.listSources()
    set({ sources })
  },

  removeSource: async (id) => {
    await ipc.sync.removeSource(id)
    const sources = await ipc.sync.listSources()
    set({ sources })
  },

  triggerNow: async () => {
    set({ syncing: true })
    try {
      const result = await ipc.sync.triggerNow()
      set({ lastSyncResult: result })
      return result
    } finally {
      set({ syncing: false })
    }
  },
}))
