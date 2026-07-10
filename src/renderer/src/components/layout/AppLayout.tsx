import { type ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { BottomBar } from './BottomBar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { useProjectInit } from '@/stores/projectStore'
import { useSettingsInit, useSettingsStore } from '@/stores/settingsStore'
import { usePetInit } from '@/stores/petStore'
import { useUIStore } from '@/stores/uiStore'
import { useSearchStore } from '@/stores/searchStore'
import { useGridStore } from '@/stores/gridStore'
import { GridLayout } from '@/components/grid/GridLayout'
import { applyTheme, applyStyle, type VisualStyle } from '@/utils/theme'
import { FileSearchPanel } from '@/components/search/FileSearchPanel'
import { cn } from '@/utils/cn'
import { APPLE_EASE, CLAUDE_EASE, EASE_OUT_EXPO } from '@/components/ui/Motion'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  useProjectInit()
  useSettingsInit()
  usePetInit()

  const navigate = useNavigate()
  const isGridMode = useGridStore((s) => s.isGridMode)
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar)
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar)

  // 应用外观设置：字体大小、字体族、主题
  const fontSize = useSettingsStore((s) => s.getSetting<number>('general.fontSize', 14))
  const fontFamily = useSettingsStore((s) => s.getSetting<string>('theme.fontFamily', 'system'))
  const theme = useSettingsStore((s) => s.getSetting<'dark' | 'light'>('general.theme', 'dark'))
  const visualStyle = useSettingsStore((s) => s.getSetting<VisualStyle>('theme.visualStyle', 'apple'))

  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = `${fontSize}px`
    const fontMap: Record<string, string> = {
      system: "-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
      mono: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }
    root.style.fontFamily = fontMap[fontFamily] ?? fontMap.system
  }, [fontSize, fontFamily])

  // 应用主题到 html data-theme（启动时 + 主题变更时）
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 应用视觉风格到 html data-style（启动时 + 风格变更时）
  useEffect(() => {
    applyStyle(visualStyle)
  }, [visualStyle])

  // 全局快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc → 退出九宫格模式
      if (e.key === 'Escape' && useGridStore.getState().isGridMode) {
        e.preventDefault()
        useGridStore.getState().setGridMode(false)
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      // Ctrl/Cmd + B → 切换左侧栏
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        toggleLeftSidebar()
        return
      }
      // Ctrl/Cmd + J → 切换右侧栏
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        toggleRightSidebar()
        return
      }
      // Ctrl/Cmd + P → 打开文件搜索
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        useSearchStore.getState().open()
        return
      }
      // Ctrl/Cmd + , → 打开设置
      if (e.key === ',') {
        e.preventDefault()
        navigate('/settings')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleLeftSidebar, toggleRightSidebar, navigate])

  return (
    <div className="relative flex h-full flex-col bg-bg-tertiary shadow-inset">
      {!isGridMode && <TitleBar />}
      {!isGridMode && <StatusBar />}
      <div className={cn('flex flex-1 overflow-hidden', !isGridMode && 'gap-1.5 px-2 mb-1')}>
        {!isGridMode && <LeftSidebar />}
        {/* main 区域用 flex 列布局，子页面通过 h-full 撑满；overflow-hidden 避免外层滚动，由页面内部自行处理滚动 */}
        <main className={cn(
          'relative flex min-w-0 flex-1 flex-col overflow-hidden',
          !isGridMode && 'rounded-xl border border-border-default/60 bg-bg-primary shadow-sm',
        )}>
          {/* 普通界面：始终挂载以保留页面状态，进入九宫格时淡出隐藏 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
            animate={
              isGridMode
                ? { opacity: 0 }
                : { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }
            transition={{
              duration: visualStyle === 'apple' ? 0.55 : visualStyle === 'claude' ? 0.5 : 0.45,
              ease: visualStyle === 'apple' ? APPLE_EASE : visualStyle === 'claude' ? CLAUDE_EASE : EASE_OUT_EXPO,
            }}
            className={cn(
              'absolute inset-0 flex flex-col will-change-transform [transform:translateZ(0)]',
              isGridMode && 'pointer-events-none',
            )}
          >
            {children}
          </motion.div>
        </main>
        {!isGridMode && <RightSidebar />}
      </div>
      {!isGridMode && <BottomBar />}
      <FileSearchPanel />

      {/* 九宫格全屏覆盖层：始终挂载 GridLayout，通过 opacity + pointer-events 控制可见性，
          确保退出动画期间内容仍然可见，实现流畅的高级切换效果 */}
      <motion.div
        initial={false}
        animate={
          isGridMode
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: 1.08 }
        }
        transition={{
          duration: visualStyle === 'apple' ? 0.55 : visualStyle === 'claude' ? 0.5 : 0.45,
          ease: visualStyle === 'apple' ? APPLE_EASE : visualStyle === 'claude' ? CLAUDE_EASE : EASE_OUT_EXPO,
        }}
        className={cn(
          'absolute inset-0 z-50 flex will-change-transform [transform:translateZ(0)]',
          !isGridMode && 'pointer-events-none',
        )}
      >
        <GridLayout />
      </motion.div>
    </div>
  )
}
