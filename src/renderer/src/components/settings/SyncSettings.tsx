import { useState, useEffect } from 'react'
import {
  RefreshCw, Plus, Trash2, CloudDownload, Clock, Activity, X,
} from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import type { SyncSourceType } from '@shared/types/sync'

const SOURCE_TYPE_LABELS: Record<SyncSourceType, string> = {
  github: 'GitHub',
  rss: 'RSS',
  webhook: 'Webhook',
}

const SOURCE_TYPE_OPTIONS: Array<{ value: SyncSourceType; label: string }> = [
  { value: 'github', label: 'GitHub Issues' },
  { value: 'rss', label: 'RSS Feed' },
  { value: 'webhook', label: 'Webhook' },
]

/** 格式化时间戳为可读日期 */
function formatTime(ts: number | null): string {
  if (!ts) return '从未同步'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface AddFormData {
  type: SyncSourceType
  name: string
  endpoint: string
  token: string
}

/**
 * 自动同步设置:外部数据源拉取(GitHub / RSS / Webhook)
 */
export function SyncSettings() {
  const {
    sources,
    loading,
    syncing,
    schedulerStatus,
    lastSyncResult,
    loadSources,
    loadSchedulerStatus,
    addSource,
    updateSource,
    removeSource,
    triggerNow,
  } = useSyncStore()

  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const [enabled, setEnabled] = useState(getSetting<boolean>('sync.enabled', false))
  const [intervalMinutes, setIntervalMinutes] = useState(
    getSetting<number>('sync.intervalMinutes', 20),
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<AddFormData>({
    type: 'github',
    name: '',
    endpoint: '',
    token: '',
  })

  useEffect(() => {
    void loadSources()
    void loadSchedulerStatus()
  }, [loadSources, loadSchedulerStatus])

  /** 保存总开关 */
  const saveEnabled = async (next: boolean) => {
    setEnabled(next)
    try {
      await updateSetting('sync.enabled', next, 'sync')
      toast.success(next ? '自动同步已开启' : '自动同步已关闭')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  /** 保存同步周期(失焦校验) */
  const saveInterval = async (raw: string) => {
    const value = parseInt(raw, 10)
    if (isNaN(value) || value < 5 || value > 1440) {
      toast.error('保存失败', '同步周期需在 5 ~ 1440 分钟之间')
      setIntervalMinutes(getSetting<number>('sync.intervalMinutes', 20))
      return
    }
    if (value !== intervalMinutes) {
      setIntervalMinutes(value)
      try {
        await updateSetting('sync.intervalMinutes', value, 'sync')
        toast.success('设置已保存,重启应用后生效')
      } catch (e) {
        toast.error('保存失败', (e as Error).message)
      }
    }
  }

  /** 切换单个数据源的启用状态 */
  const handleToggleSource = async (id: string, next: boolean) => {
    try {
      await updateSource(id, { enabled: next })
      toast.success(next ? '数据源已启用' : '数据源已禁用')
    } catch (e) {
      toast.error('更新失败', (e as Error).message)
    }
  }

  /** 删除数据源 */
  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`确认删除数据源「${name}」？此操作不可撤销。`)) return
    try {
      await removeSource(id)
      toast.success('数据源已删除')
    } catch (e) {
      toast.error('删除失败', (e as Error).message)
    }
  }

  /** 提交添加表单 */
  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      toast.error('请填写数据源名称')
      return
    }
    if (!addForm.endpoint.trim()) {
      toast.error('请填写 endpoint')
      return
    }
    try {
      await addSource({
        type: addForm.type,
        name: addForm.name.trim(),
        endpoint: addForm.endpoint.trim(),
        token: addForm.token.trim() || undefined,
        enabled: true,
      })
      toast.success('数据源已添加')
      setShowAddForm(false)
      setAddForm({ type: 'github', name: '', endpoint: '', token: '' })
    } catch (e) {
      toast.error('添加失败', (e as Error).message)
    }
  }

  /** 立即同步 */
  const handleTriggerNow = async () => {
    try {
      const result = await triggerNow()
      if (result.ok) {
        toast.success(
          '同步完成',
          `已同步 ${result.totalWritten} 条记忆(耗时 ${result.durationMs}ms)`,
        )
      } else {
        const errors = result.results
          .filter((r) => !r.ok)
          .map((r) => `${r.sourceName}: ${r.error}`)
          .join('; ')
        toast.error('部分同步失败', errors || '请检查数据源配置')
      }
      void loadSources()
      void loadSchedulerStatus()
    } catch (e) {
      toast.error('同步失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 总开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <CloudDownload className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">自动同步</h3>
          <div className="ml-auto">
            <Toggle
              checked={enabled}
              onChange={(next) => void saveEnabled(next)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后,后台调度器会按设定周期从外部数据源(GitHub issues / RSS feed)拉取数据并写入记忆树 general 分区。
        </p>
      </section>

      {/* 同步周期 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">同步周期</h3>
          <span className="ml-auto text-xs text-text-tertiary">单位:分钟</span>
        </div>
        <Input
          type="number"
          value={intervalMinutes}
          min={5}
          max={1440}
          step={5}
          onChange={(e) => setIntervalMinutes(parseInt(e.target.value, 10) || 0)}
          onBlur={(e) => void saveInterval(e.target.value)}
          disabled={!enabled}
        />
        <p className="mt-2 text-xs text-text-tertiary">
          调度器按此间隔自动拉取已启用的数据源。范围 5 ~ 1440 分钟(约 1 天)。修改后需重启应用生效。
        </p>
      </section>

      {/* 调度器状态 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">调度器状态</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void loadSchedulerStatus()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
        {schedulerStatus ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-border-default bg-bg-tertiary/40 px-3 py-2">
              <div className="text-xs text-text-tertiary">运行状态</div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    schedulerStatus.running
                      ? 'bg-accent-green'
                      : 'bg-text-tertiary'
                  }`}
                />
                {schedulerStatus.running ? '运行中' : '已停止'}
              </div>
            </div>
            <div className="rounded-lg border border-border-default bg-bg-tertiary/40 px-3 py-2">
              <div className="text-xs text-text-tertiary">已注册任务</div>
              <div className="text-sm font-semibold text-text-primary">
                {schedulerStatus.jobs.length > 0
                  ? schedulerStatus.jobs.join(', ')
                  : '无'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">加载中...</p>
        )}
      </section>

      {/* 立即同步 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 text-text-secondary ${syncing ? 'animate-spin' : ''}`} />
          <h3 className="text-sm font-semibold text-text-primary">立即同步</h3>
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            onClick={() => void handleTriggerNow()}
            disabled={syncing}
          >
            {syncing ? '同步中...' : '立即同步'}
          </Button>
        </div>
        {lastSyncResult && (
          <div className="mt-3 rounded-lg border border-border-default bg-bg-tertiary/30 p-3 text-xs text-text-secondary">
            <div className="flex flex-wrap gap-4">
              <span>状态: {lastSyncResult.ok ? '✓ 成功' : '✗ 部分失败'}</span>
              <span>抓取: {lastSyncResult.totalFetched} 条</span>
              <span>写入: {lastSyncResult.totalWritten} 条</span>
              <span>耗时: {lastSyncResult.durationMs}ms</span>
            </div>
          </div>
        )}
      </section>

      {/* 数据源列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">数据源列表</h3>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? (
              <>
                <X className="h-3.5 w-3.5" />
                取消
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                添加
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <p className="py-4 text-center text-xs text-text-tertiary">加载中...</p>
        ) : sources.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-tertiary">
            暂无数据源,点击「添加」配置第一个数据源
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-tertiary/30 p-3 transition-smooth-fast hover:border-border-strong"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {source.name}
                    </span>
                    <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] text-text-tertiary">
                      {SOURCE_TYPE_LABELS[source.type]}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {source.endpoint}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-text-tertiary">
                    <span>{formatTime(source.last_synced_at)}</span>
                    {source.last_sync_result && (
                      <span className="truncate">{source.last_sync_result}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={source.enabled}
                    onChange={(next) => void handleToggleSource(source.id, next)}
                    size="sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleRemove(source.id, source.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-red" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 添加数据源表单 */}
      {showAddForm && (
        <section className="surface-3d rounded-md p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-semibold text-text-primary">添加数据源</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-text-secondary">类型</label>
              <Select
                value={addForm.type}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, type: e.target.value as SyncSourceType }))
                }
              >
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">名称</label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如:ZX-Code Issues"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">
                Endpoint
                <span className="ml-1 text-text-tertiary">
                  {addForm.type === 'github'
                    ? '(owner/repo)'
                    : addForm.type === 'rss'
                      ? '(feed URL)'
                      : '(URL)'}
                </span>
              </label>
              <Input
                value={addForm.endpoint}
                onChange={(e) => setAddForm((f) => ({ ...f, endpoint: e.target.value }))}
                placeholder={
                  addForm.type === 'github'
                    ? 'owner/repo'
                    : addForm.type === 'rss'
                      ? 'https://example.com/feed.xml'
                      : 'https://example.com/webhook'
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-secondary">
                Token(可选)
              </label>
              <Input
                type="password"
                value={addForm.token}
                onChange={(e) => setAddForm((f) => ({ ...f, token: e.target.value }))}
                placeholder="GitHub PAT 等(用于私有仓库或提高速率限制)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void handleAdd()}>
                添加
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
