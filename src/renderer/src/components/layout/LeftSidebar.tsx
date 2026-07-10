import { useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  Moon,
  Plus,
  Settings,
  LayoutGrid,
  Search,
  PanelLeft,
  PanelLeftClose,
  Info,
  PanelLeftOpen,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSearchStore } from '@/stores/searchStore'
import { useGridStore } from '@/stores/gridStore'
import { toast } from '@/stores/toastStore'
import { WorkspacePanel } from '@/components/chat/WorkspaceList'
import { switchThemeWithTransition } from '@/utils/theme'
import { cn } from '@/utils/cn'

// 深色模式：白灰透明系列（在纯黑底上显灰白炫光）
const PROJECT_COLORS_DARK = [
  'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.20)',
  'rgba(200,200,200,0.25)', 'rgba(180,180,180,0.20)', 'rgba(255,255,255,0.08)',
  'rgba(220,220,220,0.18)', 'rgba(160,160,160,0.22)', 'rgba(240,240,240,0.12)',
  'rgba(190,190,190,0.16)',
]
// 浅色模式：深灰系列（在白底上可见，配白字）
const PROJECT_COLORS_LIGHT = [
  'rgba(60,60,60,0.85)', 'rgba(80,80,80,0.8)', 'rgba(50,50,50,0.85)',
  'rgba(100,100,100,0.75)', 'rgba(70,70,70,0.8)', 'rgba(90,90,90,0.78)',
  'rgba(110,110,110,0.72)', 'rgba(65,65,65,0.82)', 'rgba(85,85,85,0.78)',
  'rgba(95,95,95,0.76)',
]

function getProjectColor(name: string, theme: 'dark' | 'light'): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = theme === 'light' ? PROJECT_COLORS_LIGHT : PROJECT_COLORS_DARK
  return colors[Math.abs(hash) % colors.length]
}

function getProjectInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

/* ------------------------------------------------------------------ */
/*  内部子组件                                                          */
/* ------------------------------------------------------------------ */

function NavItem({
  icon: Icon,
  label,
  collapsed,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  collapsed: boolean
  active?: boolean
  onClick: () => void
}) {
  const visualStyle = useSettingsStore((s) => s.getSetting<string>('theme.visualStyle', 'apple'))
  const isApple = visualStyle === 'apple'
  const isClaude = visualStyle === 'claude'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm',
        isApple ? '' : 'transition-smooth-fast',
        active
          ? isApple
            ? 'bg-accent-blue/12 text-accent-blue font-medium'
            : isClaude
              ? 'bg-[rgba(217,119,87,0.1)] text-[#d97757] font-medium'
              : 'bg-hover-surface text-text-primary shadow-[0_0_12px_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/10'
          : 'text-text-secondary hover:bg-hover-surface hover:text-text-primary',
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', active && isApple && 'text-accent-blue', active && isClaude && 'text-[#d97757]', active && !isApple && !isClaude && 'text-text-primary')} />
      {!collapsed && <span className="truncate">{label}</span>}
    </motion.button>
  )
}

function BottomAction({
  icon: Icon,
  label,
  collapsed,
  onClick,
}: {
  icon: LucideIcon
  label: string
  collapsed: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const visualStyle = useSettingsStore((s) => s.getSetting<string>('theme.visualStyle', 'apple'))
  const isApple = visualStyle === 'apple'

  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-text-tertiary',
        isApple ? '' : 'transition-smooth-fast',
        'hover:bg-hover-surface hover:text-text-secondary',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */

export function LeftSidebar() {
  const navigate = useNavigate()
  const collapsed = useUIStore((s) => s.leftSidebarCollapsed)
  const toggle = useUIStore((s) => s.toggleLeftSidebar)
  const workspaceCollapsed = useUIStore((s) => s.workspacePanelCollapsed)
  const toggleWorkspacePanel = useUIStore((s) => s.toggleWorkspacePanel)

  const projects = useProjectStore((s) => s.projects)
  const currentProject = useProjectStore((s) => s.currentProject)
  const switchProject = useProjectStore((s) => s.switchProject)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const theme = useSettingsStore((s) => s.getSetting<'dark' | 'light'>('general.theme', 'dark'))

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isGridMode = useGridStore((s) => s.isGridMode)

  const visibleProjects = useMemo(() => projects.slice(0, 8), [projects])

  const currentId = selectedId ?? currentProject?.id ?? null

  const activeProject = projects.find((p) => p.id === currentId) ?? null

  const handleThemeToggle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    await switchThemeWithTransition(next, x, y)
    await updateSetting('general.theme', next, 'general')
  }

  const handleSearch = () => {
    useSearchStore.getState().open()
  }

  return (
    <div className="flex h-full gap-1.5">
      {/* 主侧边栏面板 */}
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 52 : 220 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border-default/60 bg-bg-secondary shadow-sm"
      >
        {/* 顶部：标题 + 折叠按钮 */}
        <div className="flex h-10 flex-shrink-0 items-center justify-between px-3">
          {!collapsed && (
            <span className="text-sm font-semibold text-text-primary truncate">
              导航
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            className={cn(
              'h-7 w-7 rounded-lg flex items-center justify-center text-text-tertiary transition-smooth-fast',
              'hover:text-text-secondary hover:bg-hover-surface',
            )}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* 导航按钮 */}
        <div className="flex flex-col gap-0.5 px-2">
          <NavItem
            icon={LayoutGrid}
            label="九宫格"
            collapsed={collapsed}
            active={isGridMode}
            onClick={() => {
              useGridStore.getState().toggleGridMode()
            }}
          />
          <NavItem
            icon={Search}
            label="搜索"
            collapsed={collapsed}
            onClick={handleSearch}
          />
        </div>

        {/* 分隔线 */}
        <div className="mx-3 my-2 h-px bg-border-subtle flex-shrink-0" />

        {/* 项目列表 */}
        <div className="flex-1 overflow-y-auto px-2">
          <div
            className={cn(
              'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary flex-shrink-0',
              collapsed && 'text-center',
            )}
          >
            项目
          </div>
          {visibleProjects.map((project) => {
            const isActive = project.id === currentId
            return (
              <div
                key={project.id}
                className="relative flex items-center w-full"
              >
                {isActive && (
                  <motion.span
                    layoutId="sidebar-project-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-accent-blue"
                    transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(project.id)
                    void switchProject(project.id)
                  }}
                  title={collapsed ? project.name : undefined}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-smooth-fast',
                    isActive
                      ? 'bg-hover-surface text-text-primary'
                      : 'text-text-secondary hover:bg-hover-surface hover:text-text-primary',
                  )}
                >
                  <span
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                    style={{ backgroundColor: getProjectColor(project.name, theme) }}
                  >
                    {getProjectInitial(project.name)}
                  </span>
                  {!collapsed && (
                    <span className="truncate">{project.name}</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* 底部按钮 */}
        <div className="flex flex-col gap-0.5 px-2 py-2 flex-shrink-0">
          <BottomAction
            icon={Plus}
            label="新建"
            collapsed={collapsed}
            onClick={() => navigate('/projects')}
          />
          <BottomAction
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? '浅色' : '深色'}
            collapsed={collapsed}
            onClick={handleThemeToggle}
          />
          <BottomAction
            icon={Settings}
            label="设置"
            collapsed={collapsed}
            onClick={() => navigate('/settings')}
          />
          <BottomAction
            icon={Info}
            label="关于"
            collapsed={collapsed}
            onClick={() => navigate('/about')}
          />
        </div>
      </motion.div>

      {/* Workspace Panel - 280px, 选中项目时展开 */}
      <AnimatePresence>
        {activeProject && !workspaceCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden rounded-xl border border-border-default/60 bg-bg-primary shadow-sm"
          >
            <WorkspacePanel
              project={activeProject}
              onClose={() => setSelectedId(null)}
              onCollapse={toggleWorkspacePanel}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 工作区面板收起时的展开按钮 */}
      <AnimatePresence>
        {activeProject && workspaceCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 40, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col items-center justify-start pt-3"
          >
            <button
              type="button"
              onClick={toggleWorkspacePanel}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default/60 bg-bg-secondary text-text-secondary transition-smooth-fast hover:border-border-strong hover:bg-hover-surface hover:text-text-primary"
              title="展开对话列表"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
