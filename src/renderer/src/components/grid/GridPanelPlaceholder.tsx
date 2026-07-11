import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useGridStore, type PanelType } from '@/stores/gridStore'
import { cn } from '@/utils/cn'

interface GridPanelPlaceholderProps {
  index: number
  isDragOver?: boolean
}

const PANEL_OPTIONS: { type: PanelType; label: string }[] = [
  { type: 'chat', label: '对话' },
  { type: 'aiView', label: '实时AI视图' },
  { type: 'pet', label: '宠物窗口' },
  { type: 'browser', label: '浏览器预览' },
  { type: 'clock', label: '时钟' },
  { type: 'weather', label: '天气' },
  { type: 'heatmap', label: 'Token热力图' },
  { type: 'extensions', label: '扩展(Skill/MCP)' },
  { type: 'todo', label: 'AI待办' },
  { type: 'kanban', label: '看板' },
]

/** 空槽位占位：平面风格，点击展开面板选择菜单 */
export function GridPanelPlaceholder({ index, isDragOver }: GridPanelPlaceholderProps) {
  const setSlot = useGridStore((s) => s.setSlot)
  const slots = useGridStore((s) => s.layout.slots)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative flex h-full w-full items-center justify-center" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full border-2 border-black bg-white text-black transition-all duration-200',
          'hover:scale-110 hover:bg-black hover:text-white',
          isDragOver && 'scale-110 bg-black text-white',
        )}
        aria-label="添加面板"
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute left-1/2 top-1/2 z-50 min-w-[140px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-black bg-white shadow-xl">
          {PANEL_OPTIONS.map(({ type, label }) => {
            const existingIndex = slots.indexOf(type)
            const isInUse = existingIndex !== -1
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setSlot(index, type)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors duration-150',
                  isInUse
                    ? 'text-gray-400 hover:bg-gray-100'
                    : 'text-black hover:bg-black hover:text-white',
                )}
              >
                <span>{label}</span>
                {isInUse && (
                  <span className="ml-2 text-[10px] text-gray-400">移至此处</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
