import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { SettingCategory } from '@shared/types/settings'

interface SettingsState {
  settings: Record<string, unknown>
  loaded: boolean
  
  loadSettings: () => Promise<void>
  getSetting: <T>(key: string, defaultValue: T) => T
  updateSetting: (key: string, value: unknown, category: SettingCategory) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loaded: false,
  
  loadSettings: async () => {
    try {
      const all = await ipc.settings.getAll()
      const map: Record<string, unknown> = {}
      for (const s of all) {
        try {
          map[s.key] = JSON.parse(s.value)
        } catch {
          map[s.key] = s.value
        }
      }
      set({ settings: map, loaded: true })
    } catch (err) {
      console.error('加载设置失败:', err)
      set({ loaded: true })
    }
  },
  
  getSetting: <T>(key: string, defaultValue: T): T => {
    const value = get().settings[key]
    return value !== undefined ? (value as T) : defaultValue
  },
  
  updateSetting: async (key: string, value: unknown, category: SettingCategory) => {
    await ipc.settings.set(key, value, category)
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }))
  },
}))

export function useSettingsInit() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loaded = useSettingsStore((s) => s.loaded)
  if (!loaded) {
    loadSettings()
  }
}
