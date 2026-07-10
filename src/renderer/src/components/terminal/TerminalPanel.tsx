import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, Trash2, X, Square, TerminalSquare } from 'lucide-react'
import { ipc } from '@/services/ipc'
import { useTerminalStore } from '@/stores/terminalStore'
import { useProjectStore } from '@/stores/projectStore'
import { cn } from '@/utils/cn'
import type { TerminalShell } from '@shared/types/terminal'

const SHELL_OPTIONS: Array<{ value: TerminalShell; label: string }> = [
  { value: 'powershell', label: 'PowerShell' },
  { value: 'cmd', label: 'CMD' },
  { value: 'bash', label: 'Bash' },
  { value: 'wsl', label: 'WSL' },
]

const EASE = [0.16, 1, 0.3, 1] as const

/** xterm 主题：纯黑底 + 白字 */
const XTERM_THEME = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  selectionBackground: '#ffffff40',
} as const

/**
 * 终端面板：使用 xterm 渲染 shell 输出，通过 IPC 与主进程的 spawn 进程双向通信
 */
export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const shell = useTerminalStore((s) => s.shell)
  const setShell = useTerminalStore((s) => s.setShell)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const createSession = useTerminalStore((s) => s.createSession)
  const killSession = useTerminalStore((s) => s.killSession)
  const sessions = useTerminalStore((s) => s.sessions)
  const currentProject = useProjectStore((s) => s.currentProject)

  // 创建 / 销毁 xterm 实例（仅在 activeSessionId 变化时重建）
  useEffect(() => {
    if (!containerRef.current || !activeSessionId) return

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: XTERM_THEME,
      cursorBlink: true,
      allowProposedApi: true,
      cols: 80,
      rows: 24,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit
    // 用于在事件回调中判断是否已销毁（Terminal 未暴露 isDisposed）
    let disposed = false

    // 调整主进程侧的尺寸记录
    ipc.terminal.resize(activeSessionId, term.cols, term.rows).catch(() => {})

    // 用户输入 → 写到主进程 stdin
    const disposable = term.onData((data) => {
      ipc.terminal.write(activeSessionId, data).catch(() => {})
    })

    // 接收输出：仅处理当前活动会话的输出
    const offOutput = ipc.onTerminalOutput(({ id, data }) => {
      if (!disposed && id === activeSessionId && termRef.current) {
        termRef.current.write(data)
      }
    })

    // 接收退出
    const offExit = ipc.onTerminalExit(({ id, code }) => {
      if (!disposed && id === activeSessionId && termRef.current) {
        termRef.current.write(
          `\r\n\x1b[33m[进程已退出，退出码: ${code ?? 'null'}]\x1b[0m\r\n`,
        )
      }
    })

    // 容器尺寸变化时重新 fit
    const resizeObserver = new ResizeObserver(() => {
      if (!disposed && fitRef.current && termRef.current) {
        try {
          fitRef.current.fit()
          ipc.terminal
            .resize(activeSessionId, termRef.current.cols, termRef.current.rows)
            .catch(() => {})
        } catch {
          // fit 在容器不可见时会抛错，忽略即可
        }
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      disposable.dispose()
      offOutput()
      offExit()
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [activeSessionId])

  // 切换 shell 类型：保存选择，下一个会话生效
  const handleShellChange = (next: TerminalShell) => {
    setShell(next)
  }

  // 新建会话
  const handleNewSession = async () => {
    await createSession(currentProject?.workspace_path)
  }

  // 清屏
  const handleClear = () => {
    termRef.current?.clear()
  }

  // 关闭面板（不杀会话，便于再次打开）
  const handleClose = () => {
    useTerminalStore.getState().close()
  }

  // 终止当前会话
  const handleKillActive = async () => {
    if (activeSessionId) {
      await killSession(activeSessionId)
    }
  }

  return (
    <motion.div
      key="terminal-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="flex h-[300px] flex-col border-t border-border-default bg-black"
    >
      {/* 顶部工具栏 */}
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-b border-border-default bg-bg-primary px-2 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-3.5 w-3.5 text-accent-green" />
          <span className="font-medium">终端</span>
          {/* shell 选择器 */}
          <div className="ml-2 flex items-center gap-0.5 rounded-md border border-border-default bg-bg-tertiary p-0.5">
            {SHELL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleShellChange(opt.value)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-smooth-fast',
                  shell === opt.value
                    ? 'bg-white/10 text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* 会话标签 */}
          {sessions.length > 0 && (
            <div className="ml-2 flex items-center gap-1">
              {sessions.slice(-6).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] transition-smooth-fast',
                    s.id === activeSessionId
                      ? 'bg-white/10 text-text-primary'
                      : 'text-text-tertiary hover:text-text-secondary',
                  )}
                  title={s.cwd}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={handleNewSession}
            title="新建会话"
            className="lift-button flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleClear}
            title="清屏"
            className="lift-button flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-text-primary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleKillActive}
            title="终止当前会话"
            className="lift-button flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-accent-red"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            onClick={handleClose}
            title="关闭面板"
            className="lift-button flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* xterm 容器 */}
      <div className="min-h-0 flex-1 bg-black p-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </motion.div>
  )
}
