import { Terminal, FolderOpen } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { cn } from '@/utils/cn'

const SHELL_LABEL: Record<'powershell' | 'cmd' | 'bash' | 'wsl', string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  bash: 'Bash',
  wsl: 'WSL',
}

export function BottomBar() {
  const currentProject = useProjectStore((s) => s.currentProject)
  const isOpen = useTerminalStore((s) => s.isOpen)
  const toggle = useTerminalStore((s) => s.toggle)
  const shell = useTerminalStore((s) => s.shell)

  return (
    <div className="flex h-6 items-center justify-between bg-bg-tertiary/40 px-3 text-xs text-text-tertiary backdrop-blur-sm transition-smooth">
      <div className="flex items-center gap-1.5 truncate">
        <FolderOpen className="h-3 w-3" />
        <span className="truncate transition-smooth-fast hover:text-text-secondary">
          {currentProject?.workspace_path || '未选择项目'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span>UTF-8</span>
        <span>·</span>
        <button
          onClick={toggle}
          className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-smooth-fast',
            isOpen ? 'text-accent-blue bg-accent-blue/10' : 'hover:text-text-secondary hover:bg-hover-surface',
          )}
          title={isOpen ? '隐藏终端' : '显示终端'}
        >
          <Terminal className="h-3 w-3" />
          <span>{SHELL_LABEL[shell]}</span>
        </button>
      </div>
    </div>
  )
}
