import { useState, type ReactNode } from 'react'
import { Type, Keyboard, RotateCcw, Palette, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { switchStyleWithTransition, type VisualStyle, STYLE_LABELS, STYLE_DESCRIPTIONS } from '@/utils/theme'
import { cn } from '@/utils/cn'
import type { SettingCategory } from '@shared/types/settings'

type FontFamily = 'system' | 'mono' | 'sans'

/** 快捷键列表 */
const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['Ctrl', 'B'], desc: '切换左侧栏' },
  { keys: ['Ctrl', 'J'], desc: '切换右侧栏' },
  { keys: ['Ctrl', ','], desc: '打开设置' },
  { keys: ['Ctrl', 'N'], desc: '新建对话' },
  { keys: ['Ctrl', 'K'], desc: '聚焦搜索' },
]

/** 按键样式 */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border border-border-default bg-bg-tertiary px-1.5 font-mono text-[10px] text-text-secondary shadow-sm">
      {children}
    </kbd>
  )
}

/** 视觉风格预览色块 */
const STYLE_PREVIEW_COLORS: Record<VisualStyle, { bg: string; accent: string; label: string }> = {
  apple: { bg: '#1c1c1e', accent: '#007aff', label: 'Apple' },
  claude: { bg: '#1b1b19', accent: '#d97757', label: 'Claude' },
  base: { bg: '#000000', accent: '#5ba6ff', label: 'Base' },
}

/**
 * 外观设置：视觉风格、字体族、快捷键说明、重置 UI 状态
 */
export function ThemeSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [fontFamily, setFontFamily] = useState(
    getSetting<FontFamily>('theme.fontFamily', 'system'),
  )
  const [currentStyle, setCurrentStyle] = useState<VisualStyle>(
    getSetting<VisualStyle>('theme.visualStyle', 'apple'),
  )
  const [switching, setSwitching] = useState(false)

  /** 保存字体族 */
  const save = async (key: string, value: unknown, category: SettingCategory) => {
    try {
      await updateSetting(key, value, category)
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 切换视觉风格 */
  const handleStyleSwitch = async (style: VisualStyle) => {
    if (style === currentStyle || switching) return
    setSwitching(true)
    try {
      await switchStyleWithTransition(style)
      setCurrentStyle(style)
      await updateSetting('theme.visualStyle', style, 'theme')
      toast.success('风格已切换', `已切换为${STYLE_LABELS[style]}`)
    } catch (e) {
      toast.error('切换失败', (e as Error).message)
    } finally {
      setSwitching(false)
    }
  }

  /** 重置 UI 状态：侧边栏、终端类型 */
  const handleResetUi = async () => {
    try {
      await Promise.all([
        updateSetting('ui.sidebarCollapsed', false, 'ui'),
        updateSetting('ui.rightSidebarCollapsed', false, 'ui'),
        updateSetting('ui.terminalType', 'powershell', 'ui'),
      ])
      toast.success('UI 状态已重置')
    } catch (e) {
      toast.error('重置失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 视觉风格选择 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-text-primary">视觉风格</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(STYLE_PREVIEW_COLORS) as VisualStyle[]).map((style) => {
            const preview = STYLE_PREVIEW_COLORS[style]
            const isActive = currentStyle === style
            return (
              <motion.button
                key={style}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={switching}
                onClick={() => void handleStyleSwitch(style)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-xl border p-3 transition-smooth',
                  isActive
                    ? 'border-accent-blue shadow-glow'
                    : 'border-border-default hover:border-border-strong',
                )}
              >
                {/* 预览色块 */}
                <div
                  className="flex h-12 w-full items-center justify-center rounded-lg overflow-hidden"
                  style={{ backgroundColor: preview.bg }}
                >
                  <div
                    className="h-2 w-8 rounded-full"
                    style={{ backgroundColor: preview.accent, opacity: 0.8 }}
                  />
                </div>
                {/* 风格名 */}
                <span className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-accent-blue' : 'text-text-secondary',
                )}>
                  {STYLE_LABELS[style]}
                </span>
                {/* 选中标记 */}
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-blue"
                  >
                    <Check className="h-2.5 w-2.5 text-white" />
                  </motion.div>
                )}
              </motion.button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-text-tertiary">
          {STYLE_DESCRIPTIONS[currentStyle]}
        </p>
      </section>

      {/* 字体族 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Type className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">字体族</h3>
        </div>
        <Select
          value={fontFamily}
          onChange={(e) => {
            const next = e.target.value as FontFamily
            setFontFamily(next)
            void save('theme.fontFamily', next, 'theme')
          }}
        >
          <option value="system">系统默认</option>
          <option value="mono">等宽字体</option>
          <option value="sans">无衬线</option>
        </Select>
      </section>

      {/* 快捷键说明 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">快捷键</h3>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((item) => (
            <li
              key={item.desc}
              className="flex items-center justify-between gap-3 text-xs text-text-secondary"
            >
              <span>{item.desc}</span>
              <span className="flex items-center gap-1">
                {item.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-text-tertiary">+</span>}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 重置 UI 状态 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">重置 UI 状态</h3>
        </div>
        <p className="mb-3 text-xs text-text-tertiary">
          将侧边栏折叠状态与默认终端类型恢复为初始值。
        </p>
        <Button variant="outline" size="sm" onClick={handleResetUi}>
          <RotateCcw className="h-3.5 w-3.5" />
          重置 UI 状态
        </Button>
      </section>
    </div>
  )
}
