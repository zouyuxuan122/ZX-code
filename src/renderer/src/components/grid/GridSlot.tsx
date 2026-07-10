import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useGridStore, type PanelType } from '@/stores/gridStore'
import { ChatPanel } from './panels/ChatPanel'
import { AIViewPanel } from './panels/AIViewPanel'
import { PetPanel } from './panels/PetPanel'
import { BrowserPreviewPanel } from './panels/BrowserPreviewPanel'
import { ClockPanel } from './panels/ClockPanel'
import { WeatherPanel } from './panels/WeatherPanel'
import { UsageHeatmapPanel } from './panels/UsageHeatmapPanel'
import { ExtensionsPanel } from './panels/ExtensionsPanel'
import { TodoPanel } from './panels/TodoPanel'
import { GridPanelPlaceholder } from './GridPanelPlaceholder'
import { cn } from '@/utils/cn'

interface GridSlotProps {
  slotType: PanelType
  index: number
  isDragSource?: boolean
  isDragOver?: boolean
  hasDragSource?: boolean
  onDragStart?: (index: number) => void
  onDragOver?: (e: React.DragEvent, index: number) => void
  onDragEnter?: (index: number) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, index: number) => void
  onDragEnd?: () => void
}

/** 右键上下文菜单项 */
interface ContextMenuState {
  x: number
  y: number
}

/** 格子右键菜单：当前仅含"删除"一项 */
function GridSlotContextMenu({
  menu,
  onDelete,
  onClose,
}: {
  menu: ContextMenuState
  onDelete: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击菜单外部或按 Esc 关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      data-testid="grid-slot-context-menu"
      className="fixed z-[9999] min-w-[120px] overflow-hidden rounded-lg border border-border-primary bg-bg-elevated py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        onClick={() => {
          onDelete()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary"
      >
        删除
      </button>
    </div>
  )
}

/** 面板类型 → 对应组件 */
const PANEL_COMPONENTS: Record<string, React.ComponentType> = {
  chat: ChatPanel,
  aiView: AIViewPanel,
  pet: PetPanel,
  browser: BrowserPreviewPanel,
  clock: ClockPanel,
  weather: WeatherPanel,
  heatmap: UsageHeatmapPanel,
  extensions: ExtensionsPanel,
  todo: TodoPanel,
}

/** 单个网格槽位：无标题栏，平面风格 */
export function GridSlot({
  slotType,
  index,
  isDragSource,
  isDragOver,
  hasDragSource,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: GridSlotProps) {
  const removeSlot = useGridStore((s) => s.removeSlot)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!slotType) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [slotType],
  )

  const handleDelete = useCallback(() => {
    removeSlot(index)
  }, [removeSlot, index])

  // 空槽位 - 可作为拖拽目标
  if (!slotType) {
    return (
      <div
        onDragOver={(e) => {
          if (!hasDragSource) return
          e.preventDefault()
          onDragOver?.(e, index)
        }}
        onDragEnter={() => {
          if (!hasDragSource) return
          onDragEnter?.(index)
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          if (!hasDragSource) return
          onDrop?.(e, index)
        }}
        className="h-full w-full"
      >
        <GridPanelPlaceholder index={index} isDragOver={isDragOver} />
      </div>
    )
  }

  const Panel = PANEL_COMPONENTS[slotType]

  const handleNativeDragStart = (e: React.DragEvent) => {
    // 模型 canvas 有自己的指针交互（视线跟随、拖动、缩放），
    // 不触发面板交换拖拽，避免 draggable 干扰 pointermove 等事件
    const target = e.target as HTMLElement
    if (
      target.tagName === 'CANVAS' ||
      target.closest('[data-testid="live2d-renderer"]') ||
      target.closest('[data-testid="vrm-renderer"]')
    ) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    onDragStart?.(index)
  }

  return (
    <div
      draggable
      onDragStart={handleNativeDragStart}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.(e, index)
      }}
      onDragEnter={() => onDragEnter?.(index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(e, index)}
      onDragEnd={onDragEnd}
      onContextMenu={handleContextMenu}
      className={cn(
        'h-full w-full cursor-grab active:cursor-grabbing',
        isDragSource && 'z-50',
      )}
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{
          opacity: isDragSource ? 0.7 : 1,
          scale: isDragSource ? 1.03 : hasDragSource && !isDragSource ? 0.98 : 1,
        }}
        transition={{
          layout: { type: 'spring', stiffness: 400, damping: 25 },
          scale: { duration: 0.2 },
          opacity: { duration: 0.2 },
        }}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden',
          isDragSource && 'ring-2 ring-black/30',
          isDragOver && 'ring-2 ring-dashed ring-black/50',
        )}
      >
        {/* 面板内容：无标题栏 */}
        <div className="flex-1 overflow-hidden">
          {Panel ? <Panel /> : null}
        </div>
      </motion.div>
      {contextMenu && (
        <GridSlotContextMenu
          menu={contextMenu}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
