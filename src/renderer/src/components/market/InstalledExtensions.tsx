import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Globe,
  Link2,
  Link2Off,
  Loader2,
  Package,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import type { McpServerConfig, McpServerStatus } from '@shared/types/mcp'
import { Button } from '@/components/ui/Button'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

/** 统一缓动 */
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

/** 服务器类型徽章颜色 */
const typeBadgeColor: Record<'local' | 'remote', string> = {
  local: 'bg-accent-green/10 text-accent-green',
  remote: 'bg-accent-blue/10 text-accent-blue',
}

/** 类型图标 */
function TypeIcon({ type, className }: { type: 'local' | 'remote'; className?: string }) {
  return type === 'local' ? (
    <Terminal className={className} />
  ) : (
    <Globe className={className} />
  )
}

/** 状态徽章 */
function StatusBadge({ status }: { status?: McpServerStatus }) {
  if (!status) {
    return (
      <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-text-tertiary">
        未知
      </span>
    )
  }
  if (status.connected) {
    return (
      <span className="flex items-center gap-1 rounded bg-accent-green/10 px-1.5 py-0.5 text-xs text-accent-green">
        <span className="status-dot bg-accent-green" />
        已连接
      </span>
    )
  }
  if (status.error) {
    return (
      <span className="flex items-center gap-1 rounded bg-accent-red/10 px-1.5 py-0.5 text-xs text-accent-red">
        <span className="status-dot bg-accent-red" />
        错误
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-text-tertiary">
      <span className="status-dot bg-text-tertiary" />
      未连接
    </span>
  )
}

/** 单个已安装扩展行 */
function InstalledRow({
  config,
  status,
  onRefresh,
}: {
  config: McpServerConfig
  status?: McpServerStatus
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const connected = status?.connected ?? false

  const handleConnect = async () => {
    setLocalError(null)
    setBusy(true)
    try {
      const result = await ipc.mcp.connectServer(config.id)
      // connectMcpServer 永不抛错，返回 { connected, error } — 必须检查 connected 字段
      if (result.connected) {
        toast.success('已连接', `「${config.name}」连接成功`)
      } else {
        const errMsg = result.error || '未知错误'
        setLocalError(errMsg)
        toast.error('连接失败', `「${config.name}」连接失败：${errMsg}`)
      }
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
      toast.error('连接失败', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setLocalError(null)
    setBusy(true)
    try {
      await ipc.mcp.disconnectServer(config.id)
      toast.success('已断开', `「${config.name}」已断开连接`)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleUninstall = async () => {
    if (!window.confirm(`确定卸载服务器「${config.name}」吗？此操作不可撤销。`)) return
    setLocalError(null)
    setBusy(true)
    try {
      await ipc.mcp.removeServer(config.id)
      toast.success('已卸载', `「${config.name}」已卸载`)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
      toast.error('卸载失败', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border-default bg-bg-secondary">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <TypeIcon type={config.type} className="h-4 w-4 flex-shrink-0 text-text-secondary" />
        <span className="flex-1 truncate text-sm font-medium text-text-primary">
          {config.name}
        </span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-medium',
            typeBadgeColor[config.type],
          )}
        >
          {config.type === 'local' ? '本地' : '远程'}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* 详情 */}
      <div className="border-t border-border-default px-3 py-2.5 space-y-2">
        {/* 命令 / URL */}
        <div className="text-xs">
          {config.type === 'local' ? (
            <div className="flex gap-2">
              <span className="w-16 flex-shrink-0 text-text-tertiary">命令</span>
              <span className="flex-1 break-all font-mono text-text-secondary">
                {[config.command, ...(config.args ?? [])].filter(Boolean).join(' ') || '(未设置)'}
              </span>
            </div>
          ) : (
            <div className="flex gap-2">
              <span className="w-16 flex-shrink-0 text-text-tertiary">URL</span>
              <span className="flex-1 break-all font-mono text-text-secondary">
                {config.url || '(未设置)'}
              </span>
            </div>
          )}
        </div>

        {/* 工具数量 */}
        {connected && (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Wrench className="h-3 w-3" />
            提供 {status?.toolCount ?? 0} 个工具
          </div>
        )}

        {/* 错误信息 */}
        {(localError || (status?.error && !connected)) && (
          <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 break-all">{localError ?? status?.error}</span>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2Off className="h-3.5 w-3.5" />
              )}
              断开
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              disabled={busy || !config.enabled}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              连接
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUninstall}
            disabled={busy}
            className="text-accent-red hover:bg-accent-red/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            卸载
          </Button>
          {!config.enabled && (
            <span className="text-xs text-text-tertiary">已禁用</span>
          )}
        </div>
      </div>
    </div>
  )
}

/** 已安装扩展主组件 */
export function InstalledExtensions({
  servers,
  onServersChange,
}: {
  servers: McpServerConfig[]
  onServersChange: () => void
}) {
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])
  const [loading, setLoading] = useState(false)

  /** 拉取状态（连接态变化时调用以刷新） */
  const refreshStatuses = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ipc.mcp.listStatus().catch(() => [] as McpServerStatus[])
      setStatuses(list)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatuses()
  }, [refreshStatuses, servers])

  /** 在连接态变化后刷新状态，并通知父组件刷新服务器列表 */
  const handleChange = () => {
    void refreshStatuses()
    onServersChange()
  }

  const statusOf = (id: string) => statuses.find((s) => s.id === id)

  if (servers.length === 0) {
    return (
      <div className="surface-3d rounded-md px-4 py-10 text-center text-sm text-text-tertiary">
        <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
        暂未安装任何扩展
        <div className="mt-1 text-xs">前往「市场」标签浏览并安装扩展</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loading && statuses.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载状态中...</span>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.04,
                delayChildren: 0.02,
              },
            },
          }}
          className="space-y-2"
        >
          {servers.map((server) => (
            <motion.div
              key={server.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.3, ease: EASE_OUT_EXPO },
                },
              }}
            >
              <InstalledRow
                config={server}
                status={statusOf(server.id)}
                onRefresh={handleChange}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default InstalledExtensions
