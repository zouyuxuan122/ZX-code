import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, X, RefreshCw, Pencil, Trash2, UserCircle,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import type { UserProfileEntry, ProfileDimension } from '@shared/types/user-profile'

const DIMENSION_LABELS: Record<ProfileDimension, string> = {
  tech_stack: '技术栈',
  coding_style: '编码风格',
  work_pattern: '工作模式',
  communication_preference: '沟通偏好',
  common_tasks: '常见任务',
  expertise_level: '专业水平',
  language_preference: '语言偏好',
}

const ALL_DIMENSIONS = Object.keys(DIMENSION_LABELS) as ProfileDimension[]

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function UserProfileSettings() {
  const getProfileEnabled = useSettingsStore((s) => s.getProfileEnabled)
  const setProfileEnabled = useSettingsStore((s) => s.setProfileEnabled)
  const enabled = getProfileEnabled()

  const [entries, setEntries] = useState<UserProfileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProfileDimension | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await ipc.profile.get()
      setEntries(list ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleEdit = (entry: UserProfileEntry) => {
    setEditing(entry.dimension)
    setEditValue(entry.value)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!editValue.trim()) {
      toast.error('保存失败', '值不能为空')
      return
    }
    setSaving(true)
    try {
      await ipc.profile.update({
        dimension: editing,
        value: editValue.trim(),
        source: 'manual',
      })
      toast.success('已保存', `${DIMENSION_LABELS[editing]} 已更新`)
      setEditing(null)
      await load()
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('确认清除全部用户画像数据？此操作不可撤销。')) return
    try {
      await ipc.profile.clear()
      toast.success('已清除', '全部画像数据已清空')
      setEntries([])
    } catch (e) {
      toast.error('清除失败', (e as Error).message)
    }
  }

  const saveEnabled = async (next: boolean) => {
    try {
      await setProfileEnabled(next)
      toast.success(next ? '用户画像已开启' : '用户画像已关闭')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  const entryOf = (dim: ProfileDimension) => entries.find((e) => e.dimension === dim)

  return (
    <div className="space-y-4">
      {/* 总开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <UserCircle className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">用户画像</h3>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleClear()}
              disabled={entries.length === 0}
              className="text-accent-red hover:bg-accent-red/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清除
            </Button>
            <Toggle checked={enabled} onChange={(next) => void saveEnabled(next)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          自动从对话中抽取用户特征（技术栈、编码风格、工作模式等），注入系统提示以提供个性化响应。每个维度含置信度，可手动编辑。
        </p>
      </section>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-accent-red/70 hover:text-accent-red">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 维度列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">画像维度</h3>
        </div>

        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_DIMENSIONS.map((dim) => {
              const entry = entryOf(dim)
              return (
                <div
                  key={dim}
                  className="rounded-lg border border-border-default bg-bg-tertiary/30 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {DIMENSION_LABELS[dim]}
                    </span>
                    {entry && (
                      <span className="shrink-0 rounded bg-accent-blue/10 px-1.5 py-0.5 text-[10px] text-accent-blue">
                        置信度 {entry.confidence.toFixed(2)}
                      </span>
                    )}
                    {entry && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        aria-label="编辑"
                        onClick={() => handleEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {entry ? (
                    <>
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {entry.value}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-text-tertiary">
                        <span>{entry.source === 'auto' ? '自动' : '手动'}</span>
                        <span>{formatTime(entry.updatedAt)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-text-tertiary">暂无数据</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 编辑弹窗 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border-default bg-bg-secondary p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">
                编辑画像维度
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">维度</label>
                <div className="rounded-lg border border-border-default bg-bg-tertiary/40 px-3 py-2 text-sm text-text-primary">
                  {DIMENSION_LABELS[editing]}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">值</label>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  placeholder="输入该维度的值..."
                  className="flex w-full rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-2 text-sm text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 no-drag resize-none"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
