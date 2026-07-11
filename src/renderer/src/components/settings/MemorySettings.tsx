import { useState, useEffect, useCallback } from 'react'
import { Search, Trash2, Pencil, Download, Brain, RefreshCw, X, Zap } from 'lucide-react'
import { useMemoryStore } from '@/stores/memoryStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { toast } from '@/stores/toastStore'
import { ipc } from '@/services/ipc'
import type { MemoryNode, MemoryPartition } from '@shared/types/memory'

const PARTITION_LABELS: Record<string, string> = {
  project: '项目',
  decision: '决策',
  error: '错误',
  preference: '偏好',
  subconscious: '潜意识',
  general: '通用',
}

const PARTITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部分区' },
  ...Object.entries(PARTITION_LABELS).map(([value, label]) => ({ value, label })),
]

/** 格式化时间戳为可读日期 */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface EditFormData {
  title: string
  content: string
  tags: string
  partition: MemoryPartition
}

/**
 * 记忆管理设置：统计、搜索、编辑、删除、导出 Obsidian
 */
export function MemorySettings() {
  const {
    nodes,
    loading,
    stats,
    searchResults,
    searching,
    loadNodes,
    search,
    updateNode,
    deleteNode,
    loadStats,
    exportObsidian,
  } = useMemoryStore()

  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const [superContextEnabled, setSuperContextEnabled] = useState(
    getSetting<boolean>('superContext.enabled', true),
  )

  const saveSuperContextEnabled = async (next: boolean) => {
    setSuperContextEnabled(next)
    try {
      await updateSetting('superContext.enabled', next, 'memory')
      toast.success('设置已保存')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  const [partitionFilter, setPartitionFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [editingNode, setEditingNode] = useState<MemoryNode | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({
    title: '',
    content: '',
    tags: '',
    partition: 'general',
  })
  const [exporting, setExporting] = useState(false)

  // 初次加载
  useEffect(() => {
    void loadNodes()
    void loadStats()
  }, [loadNodes, loadStats])

  // 切换分区过滤时重新加载
  useEffect(() => {
    if (!isSearchMode) {
      void loadNodes(
        partitionFilter ? (partitionFilter as MemoryPartition) : undefined,
      )
    }
  }, [partitionFilter, isSearchMode, loadNodes])

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setIsSearchMode(false)
      void loadNodes(partitionFilter ? (partitionFilter as MemoryPartition) : undefined)
      return
    }
    setIsSearchMode(true)
    await search({
      keyword: keyword.trim(),
      partition: partitionFilter
        ? (partitionFilter as MemoryPartition)
        : undefined,
      limit: 50,
    })
  }, [keyword, partitionFilter, search, loadNodes])

  const handleClearSearch = useCallback(() => {
    setKeyword('')
    setIsSearchMode(false)
    void loadNodes(partitionFilter ? (partitionFilter as MemoryPartition) : undefined)
  }, [partitionFilter, loadNodes])

  const startEdit = useCallback((node: MemoryNode) => {
    setEditingNode(node)
    setEditForm({
      title: node.title,
      content: node.content,
      tags: node.tags.join(', '),
      partition: node.partition,
    })
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingNode) return
    try {
      const tags = editForm.tags
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      await updateNode(editingNode.id, {
        title: editForm.title,
        content: editForm.content,
        tags,
        partition: editForm.partition,
      })
      toast.success('记忆已更新')
      setEditingNode(null)
      void loadStats()
    } catch (e) {
      toast.error('更新失败', (e as Error).message)
    }
  }, [editingNode, editForm, updateNode, loadStats])

  const handleDelete = useCallback(
    async (node: MemoryNode) => {
      if (!confirm(`确认删除记忆「${node.title}」？此操作不可撤销。`)) return
      try {
        await deleteNode(node.id)
        toast.success('记忆已删除')
      } catch (e) {
        toast.error('删除失败', (e as Error).message)
      }
    },
    [deleteNode],
  )

  const handleExport = useCallback(async () => {
    try {
      const dir = await ipc.system.selectDirectory()
      if (!dir) return
      setExporting(true)
      const result = await exportObsidian(dir, false)
      if (result.ok) {
        toast.success(
          '导出成功',
          `已导出 ${result.exportedCount} 条记忆到 ${result.outputPath}`,
        )
      } else {
        toast.error('导出失败', result.error)
      }
    } catch (e) {
      toast.error('导出失败', (e as Error).message)
    } finally {
      setExporting(false)
    }
  }, [exportObsidian])

  // 展示列表：搜索模式用搜索结果，否则用全量节点
  const displayList: MemoryNode[] = isSearchMode
    ? searchResults.map((r) => r.node)
    : nodes

  return (
    <div className="space-y-4">
      {/* SuperContext 上下文预热开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">上下文预热 (SuperContext)</h3>
          <div className="ml-auto">
            <Toggle
              checked={superContextEnabled}
              onChange={(next) => void saveSuperContextEnabled(next)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          开启后，在发送消息前会异步构建上下文简报（相关文件、相关记忆、历史相似对话）并注入到系统提示，消除冷启动。性能约束 ≤800ms，超时降级为空简报。
        </p>
      </section>

      {/* 统计信息 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">记忆统计</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              void loadStats()
              void loadNodes(
                partitionFilter ? (partitionFilter as MemoryPartition) : undefined,
              )
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
        {stats ? (
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border border-border-default bg-bg-tertiary/40 px-3 py-2">
              <div className="text-xs text-text-tertiary">总数</div>
              <div className="text-lg font-semibold text-text-primary">
                {stats.total}
              </div>
            </div>
            {Object.entries(stats.byPartition).map(([partition, count]) => (
              <div
                key={partition}
                className="rounded-lg border border-border-default bg-bg-tertiary/40 px-3 py-2"
              >
                <div className="text-xs text-text-tertiary">
                  {PARTITION_LABELS[partition] ?? partition}
                </div>
                <div className="text-lg font-semibold text-text-primary">
                  {count}
                </div>
              </div>
            ))}
            {stats.total === 0 && (
              <p className="text-xs text-text-tertiary">暂无记忆数据</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">加载中...</p>
        )}
      </section>

      {/* 搜索与过滤 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">搜索记忆</h3>
        </div>
        <div className="flex gap-2">
          <Select
            value={partitionFilter}
            onChange={(e) => setPartitionFilter(e.target.value)}
            className="w-32"
          >
            {PARTITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch()
            }}
            placeholder="输入关键词搜索标题或内容..."
          />
          <Button variant="default" onClick={() => void handleSearch()}>
            <Search className="h-3.5 w-3.5" />
            搜索
          </Button>
          {isSearchMode && (
            <Button variant="ghost" onClick={handleClearSearch}>
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          )}
        </div>
      </section>

      {/* 记忆列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            记忆列表
            {isSearchMode && (
              <span className="ml-2 text-xs text-text-tertiary">
                （搜索结果 {displayList.length} 条）
              </span>
            )}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => void handleExport()}
            disabled={exporting || (stats?.total ?? 0) === 0}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? '导出中...' : '导出 Obsidian'}
          </Button>
        </div>

        {loading || searching ? (
          <p className="py-4 text-center text-xs text-text-tertiary">加载中...</p>
        ) : displayList.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-tertiary">
            {isSearchMode ? '未找到匹配的记忆' : '暂无记忆数据'}
          </p>
        ) : (
          <div className="space-y-2">
            {displayList.map((node) => (
              <div
                key={node.id}
                className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-tertiary/30 p-3 transition-smooth-fast hover:border-border-strong"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {node.title}
                    </span>
                    <span className="shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] text-text-tertiary">
                      {PARTITION_LABELS[node.partition] ?? node.partition}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                    {node.content}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-text-tertiary">
                    <span>{formatTime(node.updated_at)}</span>
                    {node.tags.length > 0 && (
                      <span className="truncate">
                        {node.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(node)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(node)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-red" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 编辑弹窗 */}
      {editingNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setEditingNode(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border-default bg-bg-secondary p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">
                编辑记忆
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingNode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  标题
                </label>
                <Input
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  分区
                </label>
                <Select
                  value={editForm.partition}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      partition: e.target.value as MemoryPartition,
                    }))
                  }
                >
                  {Object.entries(PARTITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  内容
                </label>
                <textarea
                  value={editForm.content}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, content: e.target.value }))
                  }
                  rows={6}
                  className="flex w-full rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-2 text-sm text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 no-drag resize-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary">
                  标签（逗号分隔）
                </label>
                <Input
                  value={editForm.tags}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, tags: e.target.value }))
                  }
                  placeholder="tag1, tag2, tag3"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditingNode(null)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void handleSaveEdit()}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
