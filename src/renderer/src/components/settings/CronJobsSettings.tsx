import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, X, Plus, Trash2, Clock, ChevronDown, RefreshCw, CalendarClock,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'
import type { AgentCronJob } from '@shared/types/cron-agent'

const STATUS_LABELS: Record<NonNullable<AgentCronJob['lastRunStatus']>, string> = {
  success: '成功',
  failed: '失败',
  timeout: '超时',
}

const STATUS_COLORS: Record<NonNullable<AgentCronJob['lastRunStatus']>, string> = {
  success: 'text-accent-green',
  failed: 'text-accent-red',
  timeout: 'text-accent-yellow',
}

function formatTime(ts: number | null): string {
  if (!ts) return '从未运行'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

interface AddForm {
  name: string
  description: string
  cronExpression: string
  allowWriteTools: boolean
}

const EMPTY_FORM: AddForm = {
  name: '',
  description: '',
  cronExpression: '',
  allowWriteTools: false,
}

export function CronJobsSettings() {
  const [jobs, setJobs] = useState<AgentCronJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyMap, setHistoryMap] = useState<Record<string, AgentCronJob[]>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await ipc.cron.list()
      setJobs(list ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error('请填写任务名称')
      return
    }
    if (!form.cronExpression.trim()) {
      toast.error('请填写 cron 表达式')
      return
    }
    setSaving(true)
    try {
      await ipc.cron.create({
        name: form.name.trim(),
        description: form.description.trim(),
        cronExpression: form.cronExpression.trim(),
        allowWriteTools: form.allowWriteTools,
      })
      toast.success('已创建', `任务「${form.name.trim()}」已创建`)
      setForm(EMPTY_FORM)
      await load()
    } catch (e) {
      toast.error('创建失败', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (job: AgentCronJob) => {
    try {
      await ipc.cron.toggle(job.id)
      toast.success(job.enabled ? '已停用' : '已启用', `「${job.name}」`)
      await load()
    } catch (e) {
      toast.error('操作失败', (e as Error).message)
    }
  }

  const handleDelete = async (job: AgentCronJob) => {
    if (!confirm(`确认删除任务「${job.name}」？此操作不可撤销。`)) return
    try {
      await ipc.cron.delete(job.id)
      toast.success('已删除', `「${job.name}」已删除`)
      await load()
    } catch (e) {
      toast.error('删除失败', (e as Error).message)
    }
  }

  const handleExpand = async (job: AgentCronJob) => {
    if (expandedId === job.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(job.id)
    if (!historyMap[job.id]) {
      try {
        const all = await ipc.cron.history()
        setHistoryMap((m) => ({ ...m, [job.id]: all ?? [] }))
      } catch (e) {
        toast.error('加载历史失败', (e as Error).message)
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">定时任务</h3>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          用自然语言描述任务，配合 cron 表达式定时触发 Agent 执行。支持启用/停用、查看运行历史。
        </p>
      </section>

      {/* 创建表单 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">新建任务</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-secondary">任务名称</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="任务名称，例如：每日日报"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">任务描述（自然语言）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="用自然语言描述任务，例如：每天总结今天的项目进展并生成日报"
              className="flex w-full rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-2 text-sm text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 no-drag resize-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Cron 表达式</label>
            <Input
              value={form.cronExpression}
              onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
              placeholder="0 9 * * *"
              className="font-mono"
            />
            <p className="mt-1 text-xs text-text-tertiary">
                格式：分 时 日 月 周。例：<span className="font-mono">0 8 * * *</span> = 每天 8:00；
                <span className="font-mono">30 9 * * 1</span> = 每周一 9:30。
              </p>
          </div>
          <div className="flex items-center gap-2">
            <Toggle
              checked={form.allowWriteTools}
              onChange={(next) => setForm((f) => ({ ...f, allowWriteTools: next }))}
              size="sm"
            />
            <span className="text-xs text-text-secondary">允许使用写入工具（文件修改、命令执行等）</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={() => void handleAdd()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              创建
            </Button>
          </div>
        </div>
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

      {/* 任务列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">任务列表</h3>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">
            暂无定时任务，点击「新建任务」创建第一个
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const expanded = expandedId === job.id
              const history = historyMap[job.id] ?? []
              return (
                <div key={job.id} className="rounded-lg border border-border-default bg-bg-tertiary/30">
                  <div className="flex items-start gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => void handleExpand(job)}
                      aria-label="查看历史"
                      className="flex flex-1 items-start gap-2 text-left"
                    >
                      <ChevronDown
                        className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-tertiary transition-transform', !expanded && '-rotate-90')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-text-primary">{job.name}</span>
                          <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary">
                            {job.cronExpression}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{job.description}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-text-tertiary">
                          <span>运行 {job.runCount} 次</span>
                          <span>{formatTime(job.lastRunAt)}</span>
                          {job.lastRunStatus && (
                            <span className={STATUS_COLORS[job.lastRunStatus]}>
                              {STATUS_LABELS[job.lastRunStatus]}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <Toggle
                        checked={job.enabled}
                        onChange={() => void handleToggle(job)}
                        size="sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="删除"
                        onClick={() => void handleDelete(job)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-accent-red" />
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-border-default px-3 py-2">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                        <Clock className="h-3 w-3" />
                        执行历史
                      </div>
                      {history.length === 0 ? (
                        <p className="text-xs text-text-tertiary">暂无历史数据</p>
                      ) : (
                        <div className="space-y-1.5">
                          {history.map((h) => (
                            <div key={h.id} className="flex items-center gap-2 text-xs">
                              <span className="truncate text-text-secondary">{h.name}</span>
                              <span className="text-text-tertiary">{formatTime(h.lastRunAt)}</span>
                              {h.lastRunStatus && (
                                <span className={STATUS_COLORS[h.lastRunStatus]}>
                                  {STATUS_LABELS[h.lastRunStatus]}
                                </span>
                              )}
                              {h.lastRunResult && (
                                <span className="ml-auto truncate text-text-tertiary">{h.lastRunResult}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {job.lastRunResult && (
                        <div className="mt-2 rounded-md border border-border-default bg-bg-secondary px-2.5 py-1.5 text-xs text-text-secondary">
                          最近结果：{job.lastRunResult}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
