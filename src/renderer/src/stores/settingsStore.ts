import { create } from 'zustand'
import { ipc } from '@/services/ipc'
import type { SettingCategory } from '@shared/types/settings'

interface SettingsState {
  settings: Record<string, unknown>
  loaded: boolean

  loadSettings: () => Promise<void>
  getSetting: <T>(key: string, defaultValue: T) => T
  updateSetting: (key: string, value: unknown, category: SettingCategory) => Promise<void>
  /** 技能进化开关（默认 true） */
  getEvolutionEnabled: () => boolean
  setEvolutionEnabled: (value: boolean) => Promise<void>
  /** 用户画像开关（默认 true） */
  getProfileEnabled: () => boolean
  setProfileEnabled: (value: boolean) => Promise<void>
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

  getEvolutionEnabled: () => get().getSetting<boolean>('evolution.enabled', true),
  setEvolutionEnabled: (value) => get().updateSetting('evolution.enabled', value, 'evolution'),
  getProfileEnabled: () => get().getSetting<boolean>('profile.enabled', true),
  setProfileEnabled: (value) => get().updateSetting('profile.enabled', value, 'profile'),
}))

export function useSettingsInit() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loaded = useSettingsStore((s) => s.loaded)
  if (!loaded) {
    loadSettings()
  }
}
