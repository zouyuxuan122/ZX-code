import { useState, useCallback } from 'react'
import { Search, Loader2, AlertCircle, X, MessageSquare } from 'lucide-react'
import { ipc } from '@/services/ipc'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/stores/toastStore'

/** 历史对话搜索结果项（由 search:conversations 返回） */
interface ConversationSearchResult {
  conversationId: string
  title?: string
  summary?: string
  matchCount: number
  snippet?: string
}

/** 高亮 snippet 中的匹配关键词 */
function highlightSnippet(snippet: string, query: string): Array<{ text: string; hit: boolean }> {
  if (!query.trim()) return [{ text: snippet, hit: false }]
  const safe = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${safe})`, 'gi')
  const parts = snippet.split(re)
  return parts
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p, hit: re.test(p) && p.toLowerCase() === query.trim().toLowerCase() }))
}

export function HistorySearchSettings() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<ConversationSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    const query = keyword.trim()
    if (!query) {
      toast.info('请输入关键词', '搜索内容不能为空')
      return
    }
    setSearching(true)
    setError(null)
    setHasSearched(true)
    try {
      const list = await ipc.search.conversations(query)
      setResults(list ?? [])
    } catch (e) {
      setError((e as Error).message)
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [keyword])

  const handleClear = useCallback(() => {
    setKeyword('')
    setResults([])
    setError(null)
    setHasSearched(false)
  }, [])

  return (
    <div className="space-y-4">
      {/* 搜索区 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">历史搜索</h3>
        </div>
        <div className="flex gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearch()
            }}
            placeholder="搜索对话标题、内容或摘要..."
          />
          <Button variant="default" onClick={() => void handleSearch()} disabled={searching}>
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            搜索
          </Button>
          {hasSearched && (
            <Button variant="ghost" onClick={handleClear}>
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          通过语义与关键词检索历史对话，返回匹配片段、命中次数与一句话摘要。
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

      {/* 结果列表 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">
            搜索结果
            {hasSearched && (
              <span className="ml-2 text-xs text-text-tertiary">（{results.length} 条）</span>
            )}
          </h3>
        </div>

        {searching ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>搜索中...</span>
          </div>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">
            {hasSearched ? '未找到匹配的对话' : '输入关键词后点击搜索'}
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.conversationId}
                className="rounded-lg border border-border-default bg-bg-tertiary/30 p-3 transition-smooth-fast hover:border-border-strong"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {r.title || '(未命名对话)'}
                  </span>
                  <span className="ml-auto shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[10px] text-text-tertiary">
                    匹配 {r.matchCount}
                  </span>
                </div>
                {r.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{r.summary}</p>
                )}
                {r.snippet && (
                  <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">
                    {highlightSnippet(r.snippet, keyword).map((p, i) => (
                      <span key={i} className={p.hit ? 'bg-accent-yellow/20 text-text-primary' : ''}>
                        {p.text}
                      </span>
                    ))}
                  </p>
                )}
                <div className="mt-1 text-[10px] text-text-tertiary">
                  对话 ID: <span className="font-mono">{r.conversationId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
