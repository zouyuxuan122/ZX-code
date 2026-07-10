import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Check,
  X,
  ChevronDown,
  AlertCircle,
  Server,
  Plug,
  Save,
  Link2,
  Link2Off,
  Wrench,
  Terminal,
  Globe,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import type {
  McpServerConfig,
  McpServerStatus,
  McpToolDefinition,
} from '@shared/types/mcp'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

/** MCP 服务器类型（与 @shared/types/mcp 中的内联类型保持一致） */
type McpServerType = 'local' | 'remote'

/** 服务器类型选项 */
const SERVER_TYPES: { value: McpServerType; label: string }[] = [
  { value: 'local', label: '本地进程 (Local)' },
  { value: 'remote', label: '远程服务 (Remote)' },
]

/** 类型徽章颜色 */
const typeBadgeColors: Record<McpServerType, string> = {
  local: 'bg-accent-green/10 text-accent-green',
  remote: 'bg-accent-blue/10 text-accent-blue',
}

/** 类型图标 */
const TypeIcon = ({ type, className }: { type: McpServerType; className?: string }) =>
  type === 'local' ? (
    <Terminal className={className} />
  ) : (
    <Globe className={className} />
  )

/** 将字符串数组渲染为多行文本工具 */
function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function arrayToLines(arr?: string[]): string {
  return (arr ?? []).join('\n')
}

/** 键值对条目 */
interface KvEntry {
  key: string
  value: string
}

function recordToEntries(rec?: Record<string, string>): KvEntry[] {
  if (!rec) return []
  return Object.entries(rec).map(([key, value]) => ({ key, value }))
}

function entriesToRecord(entries: KvEntry[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const e of entries) {
    const k = e.key.trim()
    if (k) result[k] = e.value
  }
  return result
}

// ============ 键值对编辑器（env / headers） ============
function KvEditor({
  entries,
  onChange,
  placeholderKey,
  placeholderValue,
}: {
  entries: KvEntry[]
  onChange: (next: KvEntry[]) => void
  placeholderKey: string
  placeholderValue: string
}) {
  const update = (idx: number, patch: Partial<KvEntry>) => {
    onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  const remove = (idx: number) => onChange(entries.filter((_, i) => i !== idx))
  const add = () => onChange([...entries, { key: '', value: '' }])

  return (
    <div className="space-y-1.5">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            value={entry.key}
            onChange={(e) => update(idx, { key: e.target.value })}
            placeholder={placeholderKey}
            className="flex-1"
          />
          <Input
            value={entry.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            placeholder={placeholderValue}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            className="flex-shrink-0 rounded p-1 text-text-tertiary transition-smooth-fast hover:bg-white/5 hover:text-accent-red"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-accent-blue transition-smooth-fast hover:underline"
      >
        <Plus className="h-3 w-3" /> 添加
      </button>
    </div>
  )
}

// ============ 状态徽章 ============
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

// ============ 表单数据 ============
interface ServerFormData {
  name: string
  type: McpServerType
  command: string
  argsText: string
  envEntries: KvEntry[]
  url: string
  headerEntries: KvEntry[]
  enabled: boolean
  timeout: string
}

function configToForm(config: McpServerConfig): ServerFormData {
  return {
    name: config.name,
    type: config.type,
    command: config.command ?? '',
    argsText: arrayToLines(config.args),
    envEntries: recordToEntries(config.env),
    url: config.url ?? '',
    headerEntries: recordToEntries(config.headers),
    enabled: config.enabled,
    timeout: config.timeout != null ? String(config.timeout) : '',
  }
}

function emptyForm(): ServerFormData {
  return {
    name: '',
    type: 'local',
    command: '',
    argsText: '',
    envEntries: [],
    url: '',
    headerEntries: [],
    enabled: true,
    timeout: '',
  }
}

function formToConfig(
  form: ServerFormData,
): Omit<McpServerConfig, 'id'> {
  const base = {
    name: form.name.trim(),
    type: form.type,
    enabled: form.enabled,
    timeout: form.timeout.trim() ? Number(form.timeout.trim()) : undefined,
  }
  if (form.type === 'local') {
    return {
      ...base,
      command: form.command.trim() || undefined,
      args: linesToArray(form.argsText),
      env: entriesToRecord(form.envEntries),
    }
  }
  return {
    ...base,
    url: form.url.trim() || undefined,
    headers: entriesToRecord(form.headerEntries),
  }
}

// ============ 新增/编辑表单 ============
function ServerForm({
  initial,
  editing,
  onSubmit,
  onCancel,
}: {
  initial: ServerFormData
  editing: boolean
  onSubmit: (data: ServerFormData) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<ServerFormData>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError('请填写服务器名称')
      return
    }
    if (form.type === 'local' && !form.command.trim()) {
      setError('本地类型需要填写启动命令')
      return
    }
    if (form.type === 'remote' && !form.url.trim()) {
      setError('远程类型需要填写服务 URL')
      return
    }
    setSaving(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3 rounded-md border border-accent-blue/30 bg-bg-secondary p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {editing ? '编辑服务器' : '新增 MCP 服务器'}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">名称</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例如：filesystem"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">类型</label>
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as McpServerType })}
            className="w-full"
          >
            {SERVER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {form.type === 'local' ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              启动命令
            </label>
            <Input
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="例如：npx"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              参数（每行一个）
            </label>
            <textarea
              value={form.argsText}
              onChange={(e) => setForm({ ...form, argsText: e.target.value })}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/tmp'}
              rows={3}
              className="flex w-full rounded-md border border-border-default bg-white/5 px-3 py-2 font-mono text-xs text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-border-strong focus:ring-1 focus:ring-accent-coffee/30 no-drag"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              环境变量
            </label>
            <KvEditor
              entries={form.envEntries}
              onChange={(envEntries) => setForm({ ...form, envEntries })}
              placeholderKey="变量名"
              placeholderValue="变量值"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              服务 URL
            </label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/mcp"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              请求头
            </label>
            <KvEditor
              entries={form.headerEntries}
              onChange={(headerEntries) => setForm({ ...form, headerEntries })}
              placeholderKey="Header 名"
              placeholderValue="Header 值"
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            超时（毫秒，可选）
          </label>
          <Input
            value={form.timeout}
            onChange={(e) => setForm({ ...form, timeout: e.target.value })}
            placeholder="留空使用默认值"
            inputMode="numeric"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Toggle
            checked={form.enabled}
            onChange={(enabled) => setForm({ ...form, enabled })}
            size="sm"
          />
          <span className="text-xs text-text-secondary">启用此服务器</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={saving || !form.name.trim()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          保存
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </motion.div>
  )
}

// ============ 单个服务器卡片 ============
function ServerCard({
  config,
  status,
  tools,
  onRefresh,
  onEdit,
}: {
  config: McpServerConfig
  status?: McpServerStatus
  tools: McpToolDefinition[]
  onRefresh: () => void
  onEdit: (config: McpServerConfig) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const connected = status?.connected ?? false

  const handleConnect = async () => {
    setLocalError(null)
    setConnecting(true)
    try {
      await ipc.mcp.connectServer(config.id)
      toast.success('已连接', `「${config.name}」连接成功`)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
      toast.error('连接失败', (err as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setLocalError(null)
    setConnecting(true)
    try {
      await ipc.mcp.disconnectServer(config.id)
      toast.success('已断开', `「${config.name}」已断开连接`)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`确定删除服务器「${config.name}」吗？此操作不可撤销。`)) return
    try {
      await ipc.mcp.removeServer(config.id)
      toast.success('已删除', `「${config.name}」已删除`)
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  const toggleEnabled = async (next: boolean) => {
    setLocalError(null)
    try {
      await ipc.mcp.updateServer(config.id, { enabled: next })
      onRefresh()
    } catch (err) {
      setLocalError((err as Error).message)
    }
  }

  return (
    <div className="rounded-md border border-border-default bg-bg-secondary">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform duration-fast',
              !expanded && '-rotate-90',
            )}
          />
          <TypeIcon type={config.type} className="h-4 w-4 flex-shrink-0 text-text-secondary" />
          <span className="flex-1 truncate text-sm font-medium text-text-primary">
            {config.name}
          </span>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              typeBadgeColors[config.type],
            )}
          >
            {SERVER_TYPES.find((t) => t.value === config.type)?.label ?? config.type}
          </span>
          <StatusBadge status={status} />
        </button>
        <Toggle
          checked={config.enabled}
          onChange={toggleEnabled}
          size="sm"
        />
      </div>

      {/* 展开内容 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default px-3 py-3 space-y-3">
              {localError && (
                <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1">{localError}</span>
                </div>
              )}

              {status?.error && !connected && (
                <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-2.5 py-2 text-xs text-accent-red">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1">{status.error}</span>
                </div>
              )}

              {/* 只读信息 */}
              <div className="space-y-1.5 text-xs">
                {config.type === 'local' ? (
                  <>
                    <div className="flex gap-2">
                      <span className="w-20 flex-shrink-0 text-text-tertiary">命令</span>
                      <span className="flex-1 break-all font-mono text-text-secondary">
                        {config.command || '(未设置)'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 flex-shrink-0 text-text-tertiary">参数</span>
                      <span className="flex-1 break-all font-mono text-text-secondary">
                        {(config.args && config.args.length > 0)
                          ? config.args.join(' ')
                          : '(无)'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 flex-shrink-0 text-text-tertiary">环境变量</span>
                      <span className="flex-1 font-mono text-text-secondary">
                        {config.env && Object.keys(config.env).length > 0
                          ? `${Object.keys(config.env).length} 项`
                          : '(无)'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <span className="w-20 flex-shrink-0 text-text-tertiary">URL</span>
                      <span className="flex-1 break-all font-mono text-text-secondary">
                        {config.url || '(未设置)'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-20 flex-shrink-0 text-text-tertiary">请求头</span>
                      <span className="flex-1 font-mono text-text-secondary">
                        {config.headers && Object.keys(config.headers).length > 0
                          ? `${Object.keys(config.headers).length} 项`
                          : '(无)'}
                      </span>
                    </div>
                  </>
                )}
                {config.timeout != null && (
                  <div className="flex gap-2">
                    <span className="w-20 flex-shrink-0 text-text-tertiary">超时</span>
                    <span className="flex-1 font-mono text-text-secondary">
                      {config.timeout} ms
                    </span>
                  </div>
                )}
                {status?.lastConnected && (
                  <div className="flex gap-2">
                    <span className="w-20 flex-shrink-0 text-text-tertiary">最近连接</span>
                    <span className="flex-1 font-mono text-text-secondary">
                      {new Date(status.lastConnected).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-wrap items-center gap-2">
                {connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={connecting}
                  >
                    {connecting ? (
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
                    disabled={connecting || !config.enabled}
                  >
                    {connecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    连接
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => onEdit(config)}>
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-accent-red hover:bg-accent-red/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>

              {/* 工具列表 */}
              {connected && (
                <div className="rounded-md border border-border-default">
                  <div className="flex items-center gap-1.5 border-b border-border-default px-2.5 py-1.5 text-xs font-semibold text-text-secondary">
                    <Wrench className="h-3 w-3" />
                    提供的工具（{tools.length}）
                  </div>
                  {tools.length === 0 ? (
                    <div className="px-2.5 py-2 text-xs text-text-tertiary">
                      暂无可用工具
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-auto">
                      {tools.map((tool) => (
                        <div
                          key={`${tool.serverId}-${tool.name}`}
                          className="border-b border-border-default px-2.5 py-1.5 text-xs last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-text-primary">{tool.name}</span>
                          </div>
                          {tool.description && (
                            <div className="mt-0.5 text-text-tertiary line-clamp-2">
                              {tool.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============ 主组件 ============
export function McpSettings() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])
  const [tools, setTools] = useState<McpToolDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editing, setEditing] = useState<McpServerConfig | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [serverList, statusList, toolList] = await Promise.all([
        ipc.mcp.listServers(),
        ipc.mcp.listStatus().catch(() => [] as McpServerStatus[]),
        ipc.mcp.listTools().catch(() => [] as McpToolDefinition[]),
      ])
      setServers(serverList)
      setStatuses(statusList)
      setTools(toolList)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const statusOf = (id: string) => statuses.find((s) => s.id === id)
  const toolsOf = (id: string) => tools.filter((t) => t.serverId === id)

  const handleAdd = async (data: ServerFormData) => {
    await ipc.mcp.addServer(formToConfig(data))
    toast.success('已添加', `「${data.name}」已添加`)
    setShowAddForm(false)
    await loadAll()
  }

  const handleUpdate = async (data: ServerFormData) => {
    if (!editing) return
    await ipc.mcp.updateServer(editing.id, formToConfig(data))
    toast.success('已保存', `「${data.name}」已更新`)
    setEditing(null)
    await loadAll()
  }

  return (
    <div className="space-y-4">
      {/* 标题与操作 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 text-lg font-semibold text-text-primary">MCP 服务器</h2>
          <p className="text-sm text-text-secondary">
            管理 Model Context Protocol 服务器，扩展 Agent 可用的工具能力。
          </p>
        </div>
        {!showAddForm && !editing && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            添加服务器
          </Button>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-accent-red/70 hover:text-accent-red"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 新增表单 */}
      <AnimatePresence mode="wait">
        {showAddForm && (
          <ServerForm
            key="add"
            initial={emptyForm()}
            editing={false}
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </AnimatePresence>

      {/* 编辑表单 */}
      <AnimatePresence mode="wait">
        {editing && (
          <ServerForm
            key={`edit-${editing.id}`}
            initial={configToForm(editing)}
            editing={true}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      {/* 服务器列表 */}
      {loading && servers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载中...</span>
        </div>
      ) : servers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="surface-3d rounded-md border border-border-default px-4 py-8 text-center text-sm text-text-tertiary"
        >
          <Server className="mx-auto mb-2 h-8 w-8 opacity-40" />
          暂未配置任何 MCP 服务器
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1 text-accent-blue hover:underline"
            >
              <Plus className="h-3 w-3" />
              点击添加第一个服务器
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {servers.map((server) => (
              <motion.div
                key={server.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <ServerCard
                  config={server}
                  status={statusOf(server.id)}
                  tools={toolsOf(server.id)}
                  onRefresh={loadAll}
                  onEdit={(c) => {
                    setShowAddForm(false)
                    setEditing(c)
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 全局工具提示 */}
      {servers.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-xs text-text-tertiary">
          <Plug className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">
            已连接服务器提供的工具将自动注入到 Agent 工具列表中。共 {tools.length} 个工具可用。
          </span>
        </div>
      )}
    </div>
  )
}
