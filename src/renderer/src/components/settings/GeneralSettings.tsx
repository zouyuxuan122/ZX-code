import { useState, type MouseEvent } from 'react'
import { Globe, Type, Rocket, Moon, Sun } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { toast } from '@/stores/toastStore'
import { switchThemeWithTransition, getCurrentTheme } from '@/utils/theme'
import { cn } from '@/utils/cn'

/**
 * 通用设置：语言、字体大小、启动行为、主题
 */
export function GeneralSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [language, setLanguage] = useState(getSetting<string>('general.language', 'zh-CN'))
  const [fontSize, setFontSize] = useState(getSetting<number>('general.fontSize', 14))
  const [startup, setStartup] = useState(getSetting<string>('general.startup', 'last-project'))
  const [theme, setTheme] = useState<'dark' | 'light'>(getCurrentTheme())

  /** 保存离散设置项（带成功反馈） */
  const save = async (key: string, value: unknown, category: 'general' | 'theme') => {
    try {
      await updateSetting(key, value, category)
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 滑块即时保存（不带成功 toast，避免拖动时刷屏；仅出错时提示） */
  const saveSilent = async (key: string, value: unknown, category: 'general' | 'theme') => {
    try {
      await updateSetting(key, value, category)
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 主题切换：从点击位置圆形扩散到整个 UI */
  const handleThemeSwitch = async (next: 'dark' | 'light', e: MouseEvent<HTMLButtonElement>) => {
    if (next === theme) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    setTheme(next)
    await switchThemeWithTransition(next, x, y)
    await updateSetting('general.theme', next, 'general')
    toast.success(next === 'dark' ? '已切换到深色主题' : '已切换到浅色主题')
  }

  return (
    <div className="space-y-4">
      {/* 语言 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">语言</h3>
        </div>
        <Select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value)
            void save('general.language', e.target.value, 'general')
          }}
        >
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English</option>
        </Select>
      </section>

      {/* 字体大小 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Type className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">字体大小</h3>
        </div>
        <Slider
          value={fontSize}
          min={12}
          max={18}
          step={1}
          onChange={(v) => {
            setFontSize(v)
            void saveSilent('general.fontSize', v, 'general')
          }}
        />
      </section>

      {/* 启动行为 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">启动行为</h3>
        </div>
        <Select
          value={startup}
          onChange={(e) => {
            setStartup(e.target.value)
            void save('general.startup', e.target.value, 'general')
          }}
        >
          <option value="last-project">恢复上次项目</option>
          <option value="none">空白启动</option>
        </Select>
      </section>

      {/* 主题：高级切换按钮，点击时圆形扩散到整个 UI */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Moon className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">主题</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={(e) => handleThemeSwitch('dark', e)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-smooth',
              theme === 'dark'
                ? 'border-accent-blue bg-accent-blue/15 text-text-primary shadow-glow'
                : 'border-border-default text-text-secondary hover:bg-hover-surface hover:text-text-primary',
            )}
          >
            <Moon className="h-4 w-4" />
            <span>深色</span>
          </button>
          <button
            onClick={(e) => handleThemeSwitch('light', e)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-smooth',
              theme === 'light'
                ? 'border-accent-blue bg-accent-blue/15 text-text-primary shadow-glow'
                : 'border-border-default text-text-secondary hover:bg-hover-surface hover:text-text-primary',
            )}
          >
            <Sun className="h-4 w-4" />
            <span>浅色</span>
          </button>
        </div>
      </section>
    </div>
  )
}
