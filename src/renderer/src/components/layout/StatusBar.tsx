import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Server, Cpu, ChevronDown, Plus, RefreshCw, Store, Loader2, Link2, Link2Off } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '@/stores/uiStore'
import { parseModelName } from '@/components/chat/ModelSelector'
import { toast } from '@/stores/toastStore'
import { ipc } from '@/services/ipc'
import type { McpServerConfig, McpServerStatus } from '@shared/types/mcp'
import { cn } from '@/utils/cn'

type DropdownType = 'lcp' | 'mcp' | 'server' | null

export function StatusBar() {
  const [open, setOpen] = useState<DropdownType>(null)
  const selectedModel = useUIStore((s) => s.selectedModel)
  const navigate = useNavigate()
  
  // 每个按钮单独的 ref
  const lcpButtonRef = useRef<HTMLButtonElement>(null)
  const mcpButtonRef = useRef<HTMLButtonElement>(null)
  const serverButtonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // 当 open 变化时，计算对应按钮的下拉位置
  useEffect(() => {
    if (!open) return
    let buttonRect: DOMRect | null = null
    if (open === 'lcp' && lcpButtonRef.current) {
      buttonRect = lcpButtonRef.current.getBoundingClientRect()
    } else if (open === 'mcp' && mcpButtonRef.current) {
      buttonRect = mcpButtonRef.current.getBoundingClientRect()
    } else if (open === 'server' && serverButtonRef.current) {
      buttonRect = serverButtonRef.current.getBoundingClientRect()
    }
    if (buttonRect) {
      const DROPDOWN_WIDTH = 256 // w-64 = 16rem，实际像素随 fontSize 变化
      const VIEWPORT_MARGIN = 8
      // 钳制 left 使下拉面板不溢出视口右侧
      const maxLeft = window.innerWidth - DROPDOWN_WIDTH - VIEWPORT_MARGIN
      const left = Math.min(buttonRect.left, Math.max(VIEWPORT_MARGIN, maxLeft))
      setDropdownPos({ top: buttonRect.bottom + 6, left })
    }
  }, [open])

  // MCP 状态
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
  const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpBusy, setMcpBusy] = useState<Record<string, boolean>>({})

  const mcpConnectedCount = mcpStatuses.filter((s) => s.connected).length
  const mcpTotal = mcpServers.length

  // 加载 MCP 状态
  const loadMcp = async () => {
    setMcpLoading(true)
    try {
      const [servers, statuses] = await Promise.all([
        ipc.mcp.listServers().catch(() => [] as McpServerConfig[]),
        ipc.mcp.listStatus().catch(() => [] as McpServerStatus[]),
      ])
      setMcpServers(servers)
      setMcpStatuses(statuses)
    } finally {
      setMcpLoading(false)
    }
  }

  // 初次加载 + 下拉打开时刷新
  useEffect(() => {
    void loadMcp()
  }, [])

  useEffect(() => {
    if (open === 'mcp') void loadMcp()
  }, [open])

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // 检查是否点击在按钮或下拉框内部
      const clickedButton = 
        lcpButtonRef.current?.contains(target) ||
        mcpButtonRef.current?.contains(target) ||
        serverButtonRef.current?.contains(target)
      const clickedDropdown = dropdownRef.current?.contains(target)
      if (!clickedButton && !clickedDropdown) {
        setOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (type: DropdownType) => setOpen(open === type ? null : type)

  const handleMcpConnect = async (id: string, name: string) => {
    setMcpBusy((b) => ({ ...b, [id]: true }))
    try {
      await ipc.mcp.connectServer(id)
      toast.success('已连接', `「${name}」连接成功`)
      await loadMcp()
    } catch (err) {
      toast.error('连接失败', (err as Error).message)
    } finally {
      setMcpBusy((b) => {
        const next = { ...b }
        delete next[id]
        return next
      })
    }
  }

  const handleMcpDisconnect = async (id: string, name: string) => {
    setMcpBusy((b) => ({ ...b, [id]: true }))
    try {
      await ipc.mcp.disconnectServer(id)
      toast.success('已断开', `「${name}」已断开连接`)
      await loadMcp()
    } catch (err) {
      toast.error('断开失败', (err as Error).message)
    } finally {
      setMcpBusy((b) => {
        const next = { ...b }
        delete next[id]
        return next
      })
    }
  }

  // MCP 按钮状态展示
  const mcpStatusColor = mcpTotal === 0
    ? 'text-text-tertiary'
    : mcpConnectedCount === mcpTotal
      ? 'text-accent-green'
      : mcpConnectedCount > 0
        ? 'text-accent-orange'
        : 'text-text-secondary'
  const mcpDotColor = mcpTotal === 0
    ? 'bg-text-tertiary'
    : mcpConnectedCount > 0
      ? 'bg-accent-green'
      : 'bg-text-tertiary'
  const mcpLabel = mcpTotal === 0
    ? '无'
    : `${mcpConnectedCount}/${mcpTotal}`

  return (
    <div className="relative z-[10000] flex h-7 items-center justify-between bg-bg-tertiary/40 px-3 text-xs backdrop-blur-sm transition-smooth">
      <div className="flex items-center gap-1">
        {/* LCP 按钮 */}
        <button
          ref={lcpButtonRef}
          onClick={() => toggle('lcp')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
        >
          <Cpu className="h-3 w-3" />
          <span>LCP:</span>
          <span className="text-text-primary font-medium">{parseModelName(selectedModel)}</span>
          <ChevronDown className={cn('h-2.5 w-2.5 transition-transform duration-200', open === 'lcp' && 'rotate-180')} />
        </button>
        {/* MCP 按钮 */}
        <button
          ref={mcpButtonRef}
          onClick={() => toggle('mcp')}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
        >
          <span className={cn('status-dot', mcpDotColor)} />
          <Activity className="h-3 w-3" />
          <span>MCP:</span>
          <span className={cn('font-medium', mcpStatusColor)}>{mcpLabel}</span>
          <ChevronDown className={cn('h-2.5 w-2.5 transition-transform duration-200', open === 'mcp' && 'rotate-180')} />
        </button>
      </div>

      {/* Server 按钮 */}
      <button
        ref={serverButtonRef}
        onClick={() => toggle('server')}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
      >
        <span className="status-dot bg-accent-green" />
        <Server className="h-3 w-3" />
        <span>Server:</span>
        <span className="text-accent-green font-medium">Connected</span>
        <ChevronDown className={cn('h-2.5 w-2.5 transition-transform duration-200', open === 'server' && 'rotate-180')} />
      </button>

      {/* 下拉面板 */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
            className="w-64 rounded-xl border border-border-default bg-bg-elevated p-2 shadow-lg shadow-black/20"
          >
            {open === 'lcp' && (
              <div className="space-y-2">
                <div className="px-2 py-1 text-xs font-semibold text-text-secondary">当前模型</div>
                <div className="rounded-md border border-border-default bg-bg-tertiary px-2 py-1.5 text-xs text-text-primary">
                  {parseModelName(selectedModel)}
                </div>
                <button
                  onClick={() => {
                    navigate('/settings?tab=model')
                    setOpen(null)
                  }}
                  className="lift-button flex w-full items-center gap-2 rounded-md border border-border-default px-2 py-1.5 text-xs text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
                >
                  <RefreshCw className="h-3 w-3" /> 管理模型
                </button>
              </div>
            )}
            {open === 'mcp' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-semibold text-text-secondary">MCP 服务器</span>
                  <span className="text-xs text-text-tertiary">
                    {mcpLoading ? '加载中...' : `${mcpConnectedCount}/${mcpTotal} 已连接`}
                  </span>
                </div>

                {mcpLoading && mcpServers.length === 0 ? (
                  <div className="flex items-center justify-center gap-1.5 px-2 py-3 text-xs text-text-tertiary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>加载中...</span>
                  </div>
                ) : mcpServers.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border-default px-2 py-3 text-center text-xs text-text-tertiary">
                    暂无 MCP 服务器
                  </div>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {mcpServers.map((server) => {
                      const status = mcpStatuses.find((s) => s.id === server.id)
                      const connected = status?.connected ?? false
                      const busy = !!mcpBusy[server.id]
                      return (
                        <div
                          key={server.id}
                          className="flex items-center gap-2 rounded-md border border-border-default bg-bg-tertiary px-2 py-1.5 text-xs"
                        >
                          <span
                            className={cn(
                              'status-dot flex-shrink-0',
                              connected ? 'bg-accent-green' : status?.error ? 'bg-accent-red' : 'bg-text-tertiary',
                            )}
                          />
                          <span className="flex-1 truncate text-text-primary" title={server.name}>
                            {server.name}
                          </span>
                          {connected ? (
                            <button
                              onClick={() => void handleMcpDisconnect(server.id, server.name)}
                              disabled={busy}
                              className="flex-shrink-0 rounded p-1 text-text-tertiary transition-smooth-fast hover:bg-hover-surface hover:text-accent-red disabled:opacity-50"
                              title="断开"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleMcpConnect(server.id, server.name)}
                              disabled={busy || !server.enabled}
                              className="flex-shrink-0 rounded p-1 text-text-tertiary transition-smooth-fast hover:bg-hover-surface hover:text-accent-green disabled:opacity-50"
                              title={server.enabled ? '连接' : '已禁用'}
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      navigate('/market')
                      setOpen(null)
                    }}
                    className="lift-button flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-default px-2 py-1.5 text-xs text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
                  >
                    <Store className="h-3 w-3" /> 市场
                  </button>
                  <button
                    onClick={() => {
                      navigate('/settings?tab=mcp')
                      setOpen(null)
                    }}
                    className="lift-button flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-default px-2 py-1.5 text-xs text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
                  >
                    <Plus className="h-3 w-3" /> 添加
                  </button>
                </div>
              </div>
            )}
            {open === 'server' && (
              <div className="space-y-2">
                <div className="px-2 py-1 text-xs font-semibold text-text-secondary">服务器状态</div>
                <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-tertiary px-2 py-1.5 text-xs">
                  <span className="status-dot bg-accent-green" />
                  <span className="text-accent-green">已连接</span>
                </div>
                <button
                  onClick={() => {
                    navigate('/settings?tab=model')
                    setOpen(null)
                  }}
                  className="lift-button flex w-full items-center gap-2 rounded-md border border-border-default px-2 py-1.5 text-xs text-text-secondary transition-smooth-fast hover:bg-hover-surface hover:text-text-primary"
                >
                  <Plus className="h-3 w-3" /> 添加服务器
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
