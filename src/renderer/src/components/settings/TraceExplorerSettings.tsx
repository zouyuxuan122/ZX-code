import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, AlertCircle, X, RefreshCw, Activity, ChevronDown, Clock, CheckCircle, XCircle,
} from 'lucide-react'
import { ipc } from '@/services/ipc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/utils/cn'
import type { AgentTrace, TraceStats, TraceQuery } from '@shared/types/trace'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function TraceExplorerSettings() {
  const [traces, setTraces] = useState<AgentTrace[]>([])
  const [stats, setStats] = useState<TraceStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [convFilter, setConvFilter] = useState('')
  const [toolFilter, setToolFilter] = useState('')
  const [failureOnly, setFailureOnly] = useState(false)

  const buildQuery = useCallback((): TraceQuery => {
    const q: TraceQuery = {}
    if (convFilter.trim()) q.conversationId = convFilter.trim()
    if (toolFilter.trim()) q.toolName = toolFilter.trim()
    if (failureOnly) q.failureOnly = true
    return q
  }, [convFilter, toolFilter, failureOnly])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, s] = await Promise.all([
        ipc.trace.query(buildQuery()),
        ipc.trace.stats(),
      ])
      setTraces(list ?? [])
      setStats(s ?? null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void load()
  }, [load])

  const handleExpand = (trace: AgentTrace) => {
    const key = `${trace.conversationId}-${trace.createdAt}`
    setExpandedId((prev) => (prev === key ? null : key))
  }

  return (
    <div className="space-y-4">
      {/* 标题与刷新 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">轨迹浏览器</h3>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          查看 Agent 执行轨迹，按会话、工具、成功率筛选，展开查看每轮工具调用详情。
        </p>
      </section>

      {/* 统计摘要 */}
      {stats && (
        <section className="surface-3d rounded-md p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border-default bg-bg-tertiary/30 p-3 text-center">
              <div className="text-xs text-text-tertiary">总轨迹</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">
                {stats.totalTraces} 条
              </div>
            </div>
            <div className="rounded-lg border border-border-default bg-bg-tertiary/30 p-3 text-center">
              <div className="text-xs text-text-tertiary">成功率</div>
              <div className="mt-1 text-lg font-semibold text-accent-green">
                {Math.round(stats.successRate * 100)}%
              </div>
            </div>
            <div className="rounded-lg border border-border-default bg-bg-tertiary/30 p-3 text-center">
              <div className="text-xs text-text-tertiary">平均耗时</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">
                {formatDuration(stats.averageDurationMs)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 筛选控件 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">筛选</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={convFilter}
            onChange={(e) => setConvFilter(e.target.value)}
            placeholder="会话 ID 筛选..."
            className="max-w-[200px]"
          />
          <Input
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            placeholder="工具名称筛选..."
            className="max-w-[200px]"
          />
          <div className="flex items-center gap-2">
            <Toggle
              checked={failureOnly}
              onChange={(next) => setFailureOnly(next)}
              size="sm"
              aria-label="仅失败"
            />
            <span className="text-xs text-text-secondary">仅失败</span>
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

      {/* 轨迹列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            轨迹列表
            <span className="ml-2 text-xs text-text-tertiary">（{traces.length} 条）</span>
          </h3>
        </div>

        {loading && traces.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : traces.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">
            暂无轨迹数据
          </p>
        ) : (
          <div className="space-y-2">
            {traces.map((trace) => {
              const key = `${trace.conversationId}-${trace.createdAt}`
              const expanded = expandedId === key
              return (
                <div key={key} className="rounded-lg border border-border-default bg-bg-tertiary/30">
                  <div className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => handleExpand(trace)}
                      aria-label="查看详情"
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 flex-shrink-0 text-text-tertiary transition-transform', !expanded && '-rotate-90')}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-sm text-text-primary">
                            {trace.conversationId}
                          </span>
                          <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] text-text-tertiary">
                            {trace.totalToolCallCount}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-text-tertiary">
                          <span>成功 {trace.successCount}</span>
                          <span>失败 {trace.failureCount}</span>
                          <span>{formatDuration(trace.totalDurationMs)}</span>
                          <span>{formatTime(trace.createdAt)}</span>
                        </div>
                      </div>
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-border-default px-3 py-2">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                        <Clock className="h-3 w-3" />
                        工具调用详情
                      </div>
                      {trace.entries.map((entry) => (
                        <div key={entry.iteration} className="mb-2">
                          <div className="text-[10px] text-text-tertiary">
                            迭代 #{entry.iteration}（{formatDuration(entry.iterationDurationMs)}）
                          </div>
                          <div className="mt-1 space-y-1">
                            {entry.toolCalls.map((call, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 rounded-md border border-border-default bg-bg-secondary px-2.5 py-1.5 text-xs"
                              >
                                {call.success ? (
                                  <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent-green" />
                                ) : (
                                  <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent-red" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-medium text-text-primary">
                                      {call.toolName}
                                    </span>
                                    <span className="text-text-tertiary">
                                      {formatDuration(call.durationMs)}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-text-secondary">
                                    参数: <span>{call.argsSummary}</span>
                                  </div>
                                  <div className="text-text-secondary">
                                    结果: <span>{call.resultSummary}</span>
                                  </div>
                                  {call.error && (
                                    <div className="text-accent-red">
                                      错误: <span>{call.error}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
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
