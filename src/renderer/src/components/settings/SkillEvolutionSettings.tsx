import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, X, Zap, RefreshCw, ChevronDown, History, Undo2,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import { cn } from '@/utils/cn'
import type { SclExtension } from '@shared/types/scl'
import type {
  EvolutionRun, EvolutionRunResult, SkillVersion,
} from '@shared/types/skill-evolution'

const SOURCE_LABELS: Record<SclExtension['source'], string> = {
  builtin: '内置',
  remote: '远程',
  local: '本地',
  auto: '自动',
}

const SOURCE_BADGE_COLORS: Record<SclExtension['source'], string> = {
  builtin: 'bg-accent-green/10 text-accent-green',
  remote: 'bg-accent-blue/10 text-accent-blue',
  local: 'bg-accent-coffee/10 text-accent-coffee',
  auto: 'bg-accent-purple/10 text-accent-purple',
}

const STATUS_LABELS: Record<EvolutionRun['status'], string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<EvolutionRun['status'], string> = {
  running: 'text-accent-blue',
  completed: 'text-accent-green',
  failed: 'text-accent-red',
  cancelled: 'text-text-tertiary',
}

function formatScore(score: number | null): string {
  return score == null ? '—' : score.toFixed(2)
}

function formatTime(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function SkillEvolutionSettings() {
  const getEvolutionEnabled = useSettingsStore((s) => s.getEvolutionEnabled)
  const setEvolutionEnabled = useSettingsStore((s) => s.setEvolutionEnabled)
  const enabled = getEvolutionEnabled()

  const [skills, setSkills] = useState<SclExtension[]>([])
  const [historyMap, setHistoryMap] = useState<Record<string, EvolutionRun[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evolving, setEvolving] = useState<Record<string, boolean>>({})
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [versionsMap, setVersionsMap] = useState<Record<string, SkillVersion[]>>({})
  const [rollingBack, setRollingBack] = useState(false)

  const loadHistory = useCallback(async (skillIds: string[]) => {
    const entries = await Promise.all(
      skillIds.map(async (id) => {
        try {
          const runs = await ipc.evolution.history(id)
          return [id, runs] as const
        } catch {
          return [id, [] as EvolutionRun[]] as const
        }
      }),
    )
    const map: Record<string, EvolutionRun[]> = {}
    for (const [id, runs] of entries) map[id] = runs
    setHistoryMap(map)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await ipc.scl.list()
      setSkills(list)
      await loadHistory(list.map((s) => s.id))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [loadHistory])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleEvolve = async (skill: SclExtension) => {
    setEvolving((m) => ({ ...m, [skill.id]: true }))
    try {
      const result = await ipc.evolution.run({
        skillId: skill.id,
      })
      if (result.improved) {
        toast.success('进化完成', `「${skill.name}」基线 ${result.baselineScore.toFixed(2)} → 最佳 ${result.run.bestScore?.toFixed(2) ?? '—'}`)
      } else {
        toast.info('进化完成', '未取得提升，保持当前版本')
      }
      await loadHistory([skill.id])
    } catch (e) {
      toast.error('进化失败', (e as Error).message)
    } finally {
      setEvolving((m) => ({ ...m, [skill.id]: false }))
    }
  }

  const handleExpand = async (run: EvolutionRun) => {
    if (expandedRunId === run.id) {
      setExpandedRunId(null)
      return
    }
    setExpandedRunId(run.id)
    if (!versionsMap[run.id]) {
      try {
        const cmp = await ipc.evolution.compare(run.id)
        setVersionsMap((m) => ({ ...m, [run.id]: cmp?.versions ?? [] }))
      } catch (e) {
        toast.error('加载版本失败', (e as Error).message)
      }
    }
  }

  const handleRollback = async (skill: SclExtension, version: SkillVersion) => {
    if (!confirm(`确认回滚「${skill.name}」到版本 ${version.version}？此操作不可撤销。`)) return
    setRollingBack(true)
    try {
      await ipc.evolution.rollback(skill.id, version.id)
      toast.success('回滚成功', `已回滚到版本 ${version.version}`)
      await loadHistory([skill.id])
    } catch (e) {
      toast.error('回滚失败', (e as Error).message)
    } finally {
      setRollingBack(false)
    }
  }

  const saveEnabled = async (next: boolean) => {
    try {
      await setEvolutionEnabled(next)
      toast.success(next ? '技能进化已开启' : '技能进化已关闭')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {/* 总开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">技能进化</h3>
          <div className="ml-auto">
            <Toggle checked={enabled} onChange={(next) => void saveEnabled(next)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          对 SCL 技能进行自动化迭代优化：基于评分（adherence / correctness / conciseness）生成变体、评估择优，并可回滚到历史版本。
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

      {/* 技能列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">技能列表</h3>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void loadAll()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>

        {loading && skills.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : skills.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">暂无已安装技能</p>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => {
              const runs = historyMap[skill.id] ?? []
              const isEvolving = evolving[skill.id]
              return (
                <div key={skill.id} className="rounded-lg border border-border-default bg-bg-tertiary/30">
                  {/* 技能头部 */}
                  <div className="flex items-center gap-2 p-3">
                    <span className="text-base">{skill.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-primary">{skill.name}</span>
                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', SOURCE_BADGE_COLORS[skill.source])}>
                          {SOURCE_LABELS[skill.source]}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">{skill.description}</p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleEvolve(skill)}
                      disabled={isEvolving || !enabled}
                    >
                      {isEvolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      进化
                    </Button>
                  </div>

                  {/* 进化历史 */}
                  {runs.length > 0 && (
                    <div className="border-t border-border-default p-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                        <History className="h-3 w-3" />
                        进化历史（{runs.length}）
                      </div>
                      <div className="space-y-2">
                        {runs.map((run) => {
                          const expanded = expandedRunId === run.id
                          const versions = versionsMap[run.id] ?? []
                          return (
                            <div key={run.id} className="rounded-md border border-border-default bg-bg-secondary">
                              <div className="flex items-center gap-3 px-3 py-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => void handleExpand(run)}
                                  aria-label="查看变体"
                                  className="flex items-center gap-1.5 text-left"
                                >
                                  <ChevronDown
                                    className={cn('h-3.5 w-3.5 text-text-tertiary transition-transform', !expanded && '-rotate-90')}
                                  />
                                  <span className={cn('font-medium', STATUS_COLORS[run.status])}>
                                    {STATUS_LABELS[run.status]}
                                  </span>
                                </button>
                                <span className="text-text-tertiary">基线: {formatScore(run.baselineScore)}</span>
                                <span className="text-text-tertiary">最佳: {formatScore(run.bestScore)}</span>
                                <span className="text-text-tertiary">变体: {run.variantCount}</span>
                                <span className="ml-auto text-text-tertiary">{formatTime(run.createdAt)}</span>
                              </div>

                              {expanded && (
                                <div className="border-t border-border-default px-3 py-2">
                                  {versions.length === 0 ? (
                                    <p className="text-xs text-text-tertiary">暂无版本数据</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {versions.map((v) => (
                                        <div key={v.id} className="flex items-center gap-2 text-xs">
                                          <span className="font-mono text-text-secondary">v{v.version}</span>
                                          <span className="text-text-tertiary">分数: {formatScore(v.score)}</span>
                                          {v.isCurrent && (
                                            <span className="rounded bg-accent-green/10 px-1.5 py-0.5 text-[10px] text-accent-green">当前</span>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="ml-auto"
                                            onClick={() => void handleRollback(skill, v)}
                                            disabled={rollingBack || v.isCurrent}
                                          >
                                            <Undo2 className="h-3 w-3" />
                                            回滚
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
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
