import { Minus, Square, X, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '@/services/ipc'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { APP_NAME } from '@shared/constants/app'
import { cn } from '@/utils/cn'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const setMaximized = useUIStore((s) => s.setMaximized)
  const visualStyle = useSettingsStore((s) => s.getSetting<string>('theme.visualStyle', 'apple'))

  const isApple = visualStyle === 'apple'
  const isClaude = visualStyle === 'claude'

  useEffect(() => {
    ipc.window.isMaximized().then(setIsMaximized)

    const cleanup = ipc.window.onMaximizeChanged((maximized: boolean) => {
      setIsMaximized(maximized)
      setMaximized(maximized)
    })

    return cleanup
  }, [setMaximized])

  const handleMinimize = () => ipc.window.minimize()
  const handleMaximize = () => ipc.window.maximize()
  const handleClose = () => ipc.window.close()

  return (
    <div className={cn(
      'drag-region flex h-9 items-center justify-between px-4',
      isApple
        ? 'bg-bg-primary/60 backdrop-blur-xl'
        : isClaude
          ? 'bg-bg-primary/90 backdrop-blur-md border-b border-border-subtle'
          : 'bg-bg-primary/90 backdrop-blur-md transition-smooth',
    )}>
      <div className="flex items-center gap-2">
        {/* Apple 风格：交通灯按钮组（左对齐） */}
        {isApple ? (
          <div className="no-drag flex items-center gap-2">
            <TrafficLightButton
              onClick={handleClose}
              color="bg-[#ff5f57]"
              hoverColor="hover:bg-[#ff5f57]"
              title="关闭"
            >
              <X className="h-2.5 w-2.5 opacity-0 group-hover/button:opacity-100" />
            </TrafficLightButton>
            <TrafficLightButton
              onClick={handleMinimize}
              color="bg-[#febc2e]"
              hoverColor="hover:bg-[#febc2e]"
              title="最小化"
            >
              <Minus className="h-2.5 w-2.5 opacity-0 group-hover/button:opacity-100" />
            </TrafficLightButton>
            <TrafficLightButton
              onClick={handleMaximize}
              color="bg-[#28c840]"
              hoverColor="hover:bg-[#28c840]"
              title={isMaximized ? '还原' : '最大化'}
            >
              {isMaximized
                ? <Copy className="h-2.5 w-2.5 opacity-0 group-hover/button:opacity-100" />
                : <Square className="h-2 w-2 opacity-0 group-hover/button:opacity-100" />
              }
            </TrafficLightButton>
          </div>
        ) : null}

        <span className={cn(
          'text-[13px] font-medium tracking-wide',
          isApple
            ? 'text-text-secondary'
            : isClaude
              ? 'text-text-tertiary'
              : 'text-text-primary opacity-80',
        )}>
          {APP_NAME}
        </span>
      </div>

      {/* 非 Apple 风格：右侧窗口按钮 */}
      {!isApple && (
        <div className="no-drag flex items-center gap-0.5">
          <button
            onClick={handleMinimize}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary',
              isClaude ? 'hover:bg-hover-surface hover:text-text-secondary' : 'transition-smooth-fast hover:bg-hover-surface hover:text-text-secondary',
            )}
            title="最小化"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary',
              isClaude ? 'hover:bg-hover-surface hover:text-text-secondary' : 'transition-smooth-fast hover:bg-hover-surface hover:text-text-secondary',
            )}
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
          </button>
          <button
            onClick={handleClose}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary',
              isClaude
                ? 'hover:bg-accent-red/60 hover:text-white'
                : 'transition-smooth-fast hover:bg-accent-red/80 hover:text-white',
            )}
            title="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Apple 风格右侧留空，交通灯已在左侧 */}
      {isApple && <div />}
    </div>
  )
}

/** macOS 交通灯窗口控制按钮 */
function TrafficLightButton({
  children,
  onClick,
  color,
  hoverColor,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  color: string
  hoverColor: string
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'group/button flex h-3 w-3 items-center justify-center rounded-full',
        color,
        hoverColor,
        'transition-[box-shadow] duration-150',
        'hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]',
      )}
    >
      <span className="text-black/70">{children}</span>
    </button>
  )
}