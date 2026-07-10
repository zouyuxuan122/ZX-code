import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, FolderLock, FolderSearch, Terminal, Wifi, AlertTriangle, CheckCheck, RotateCcw, FolderOpen, Plus, X } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import { ipc } from '@/services/ipc'

type PermissionValue = 'ask' | 'allow' | 'deny'

/** 三态权限选项 */
const PERMISSION_OPTIONS: { value: PermissionValue; label: string }[] = [
  { value: 'ask', label: '询问' },
  { value: 'allow', label: '允许' },
  { value: 'deny', label: '拒绝' },
]

/** 所有内置工具名（用于"全部同意"） */
const ALL_TOOLS = [
  'read_file', 'list_files', 'search_files', 'grep',
  'write_file', 'edit', 'run_command', 'terminal_read',
  'webfetch', 'websearch', 'todo_write', 'question', 'task',
]

/** 默认权限规则（用于"恢复默认"） */
const DEFAULT_RULES: Array<{ tool: string; action: PermissionValue }> = [
  { tool: 'read_file', action: 'allow' },
  { tool: 'list_files', action: 'allow' },
  { tool: 'search_files', action: 'allow' },
  { tool: 'grep', action: 'allow' },
  { tool: 'write_file', action: 'ask' },
  { tool: 'edit', action: 'ask' },
  { tool: 'run_command', action: 'ask' },
  { tool: 'webfetch', action: 'allow' },
  { tool: 'websearch', action: 'allow' },
  { tool: 'todo_write', action: 'allow' },
  { tool: 'question', action: 'allow' },
  { tool: 'task', action: 'allow' },
]

/**
 * 权限管理：自动接受工具调用、文件系统、命令执行、网络访问
 */
export function PermissionSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  const [autoAccept, setAutoAccept] = useState(
    getSetting<boolean>('permission.autoAccept', true),
  )
  const [fileSystem, setFileSystem] = useState(
    getSetting<PermissionValue>('permission.fileSystem', 'ask'),
  )
  const [execute, setExecute] = useState(
    getSetting<PermissionValue>('permission.execute', 'ask'),
  )
  const [network, setNetwork] = useState(
    getSetting<PermissionValue>('permission.network', 'ask'),
  )

  /** 白名单外部目录列表（允许工具访问工作区外的目录） */
  const [allowedDirectories, setAllowedDirectories] = useState<string[]>([])
  /** 新增目录输入框值 */
  const [newDir, setNewDir] = useState('')
  /** 是否允许读取工作区外文件（一键开关） */
  const [allowReadOutside, setAllowReadOutside] = useState(true)

  /** 加载白名单目录 */
  const loadAllowedDirectories = useCallback(async () => {
    try {
      const dirs = await ipc.permission.getAllowedDirectories()
      setAllowedDirectories(dirs)
    } catch (e) {
      console.warn('加载白名单目录失败:', (e as Error).message)
    }
  }, [])

  /** 加载"允许读取工作区外"开关状态 */
  const loadAllowReadOutside = useCallback(async () => {
    try {
      const val = await ipc.permission.getAllowReadOutsideWorkspace()
      setAllowReadOutside(val)
    } catch (e) {
      console.warn('加载允许读取工作区外设置失败:', (e as Error).message)
    }
  }, [])

  useEffect(() => {
    void loadAllowedDirectories()
    void loadAllowReadOutside()
  }, [loadAllowedDirectories, loadAllowReadOutside])

  /** 保存白名单目录列表 */
  const persistDirectories = async (dirs: string[]) => {
    try {
      await ipc.permission.setAllowedDirectories(dirs)
      setAllowedDirectories(dirs)
      toast.success('白名单目录已更新')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 添加新目录 */
  const handleAddDirectory = async () => {
    const trimmed = newDir.trim()
    if (!trimmed) return
    if (allowedDirectories.includes(trimmed)) {
      toast.warning('该目录已在白名单中')
      return
    }
    await persistDirectories([...allowedDirectories, trimmed])
    setNewDir('')
  }

  /** 删除指定目录 */
  const handleRemoveDirectory = async (dir: string) => {
    await persistDirectories(allowedDirectories.filter((d) => d !== dir))
  }

  /** 切换"允许读取工作区外文件"开关 */
  const handleAllowReadOutside = async (next: boolean) => {
    setAllowReadOutside(next)
    try {
      await ipc.permission.setAllowReadOutsideWorkspace(next)
      toast.success(next ? '已开启自由读取工作区外文件' : '已关闭，读取工作区外文件需询问')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
      setAllowReadOutside(!next)
    }
  }

  /** 自动接受切换：开启时给警告提示 */
  const handleAutoAccept = async (next: boolean) => {
    setAutoAccept(next)
    try {
      await updateSetting('permission.autoAccept', next, 'permission')
      if (next) {
        toast.warning('已开启自动接受，请谨慎使用')
      } else {
        toast.success('设置已保存')
      }
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 离散权限保存 */
  const save = async (key: string, value: PermissionValue) => {
    try {
      await updateSetting(key, value, 'permission')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 全部同意：所有工具规则设为 allow，并开启 autoAccept，运行时不再询问 */
  const handleAcceptAll = async () => {
    try {
      const rules = ALL_TOOLS.map((tool) => ({ tool, action: 'allow' as PermissionValue }))
      await ipc.permission.setRules(rules)
      setAutoAccept(true)
      await updateSetting('permission.autoAccept', true, 'permission')
      toast.success('已设置全部同意，工具调用将不再询问')
    } catch (e) {
      toast.error('设置失败', (e as Error).message)
    }
  }

  /** 恢复默认权限规则 */
  const handleRestoreDefault = async () => {
    try {
      await ipc.permission.setRules(DEFAULT_RULES)
      toast.success('已恢复默认权限设置')
    } catch (e) {
      toast.error('恢复失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 快速操作：全部同意 / 恢复默认 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCheck className="h-4 w-4 text-accent-green" />
          <h3 className="text-sm font-semibold text-text-primary">快速操作</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAcceptAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-3 py-1.5 text-xs font-medium text-accent-green transition-colors hover:bg-accent-green/20"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            全部同意（不再询问）
          </button>
          <button
            type="button"
            onClick={handleRestoreDefault}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </button>
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-border-default bg-bg-tertiary px-2.5 py-2 text-xs text-text-tertiary">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">"全部同意"会将所有工具设为允许并开启自动接受，之后 Agent 调用任何工具都将直接执行，不再弹出审批对话框。</span>
        </div>
      </section>

      {/* 自动接受工具调用 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-accent-orange" />
          <h3 className="text-sm font-semibold text-text-primary">自动接受工具调用</h3>
          <div className="ml-auto">
            <Toggle checked={autoAccept} onChange={handleAutoAccept} />
          </div>
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-accent-orange/30 bg-accent-orange/5 px-2.5 py-2 text-xs text-accent-orange">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">开启后 Agent 调用工具将不再询问，请谨慎使用。</span>
        </div>
      </section>

      {/* 文件系统访问 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderLock className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">文件系统访问</h3>
        </div>
        <Select
          value={fileSystem}
          onChange={(e) => {
            const next = e.target.value as PermissionValue
            setFileSystem(next)
            void save('permission.fileSystem', next)
          }}
        >
          {PERMISSION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </section>

      {/* 允许读取工作区外文件（一键开关） */}
      <section className="surface-3d rounded-xl p-4">
        <div className="flex items-center gap-2">
          <FolderSearch className="h-4 w-4 text-accent-blue" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">允许读取工作区外文件</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">
              开启后 AI 可自由读取电脑上任意位置的文件；关闭后读取工作区外文件需询问。写入/删除操作始终需询问。
            </p>
          </div>
          <div className="ml-auto">
            <Toggle checked={allowReadOutside} onChange={handleAllowReadOutside} />
          </div>
        </div>
      </section>

      {/* 命令执行 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">命令执行</h3>
        </div>
        <Select
          value={execute}
          onChange={(e) => {
            const next = e.target.value as PermissionValue
            setExecute(next)
            void save('permission.execute', next)
          }}
        >
          {PERMISSION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </section>

      {/* 网络访问 */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wifi className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">网络访问</h3>
        </div>
        <Select
          value={network}
          onChange={(e) => {
            const next = e.target.value as PermissionValue
            setNetwork(next)
            void save('permission.network', next)
          }}
        >
          {PERMISSION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </section>

      {/* 可访问的外部目录（白名单） */}
      <section className="surface-3d rounded-xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">可访问的外部目录</h3>
        </div>
        <p className="mb-3 text-xs text-text-tertiary">
          添加工作区外的目录路径，允许 Agent 读取/写入这些目录中的文件。路径需为绝对路径。
        </p>

        {/* 已添加的目录列表 */}
        {allowedDirectories.length === 0 ? (
          <div className="mb-3 rounded-lg border border-dashed border-border-default px-3 py-2 text-xs text-text-tertiary">
            暂无白名单目录，Agent 仅能访问当前工作区
          </div>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {allowedDirectories.map((dir) => (
              <li
                key={dir}
                className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-tertiary px-2.5 py-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" />
                <span className="flex-1 truncate font-mono text-xs text-text-secondary" title={dir}>
                  {dir}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemoveDirectory(dir)}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-accent-red/10 hover:text-accent-red"
                  aria-label="删除目录"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 新增目录输入 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newDir}
            onChange={(e) => setNewDir(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAddDirectory()
              }
            }}
            placeholder="输入绝对路径，如 D:\Projects\other"
            className="flex-1 rounded-lg border border-border-default bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAddDirectory()}
            disabled={!newDir.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-accent-blue/40 bg-accent-blue/10 px-3 py-1.5 text-xs font-medium text-accent-blue transition-colors hover:bg-accent-blue/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>
        </div>
      </section>
    </div>
  )
}
