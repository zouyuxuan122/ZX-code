import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  File,
  FileCode,
  FileText,
  ChevronUp,
  ChevronDown,
  Regex,
  CaseSensitive,
  X,
  Loader2,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'
import { useSearchStore } from '@/stores/searchStore'
import { ipc } from '@/services/ipc'
import { cn } from '@/utils/cn'
import type { FileSearchResult } from '@shared/types/search'

const MODE_LABELS: Record<'filename' | 'content' | 'all', string> = {
  filename: '文件名',
  content: '内容',
  all: '全部',
}

const EASE = [0.16, 1, 0.3, 1] as const

interface IconInfo {
  Icon: LucideIcon
  color: string
}

/** 根据扩展名映射文件图标与配色 */
function getFileIcon(filename: string): IconInfo {
  const dot = filename.lastIndexOf('.')
  const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase()
  if (ext === '.ts' || ext === '.tsx') return { Icon: FileCode, color: 'text-accent-blue' }
  if (ext === '.js' || ext === '.jsx') return { Icon: FileCode, color: 'text-yellow-400' }
  if (ext === '.json') return { Icon: FileText, color: 'text-accent-green' }
  if (ext === '.md') return { Icon: FileText, color: 'text-text-tertiary' }
  return { Icon: File, color: 'text-text-secondary' }
}

/** 构造用于高亮的关键词正则；正则模式非法时返回 null */
function buildHighlightRegex(
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
): RegExp | null {
  if (!query.trim()) return null
  const flags = caseSensitive ? 'g' : 'gi'
  try {
    const inner = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(${inner})`, flags)
  } catch {
    return null
  }
}

/** 将文本中匹配 query 的部分用 <mark> 包裹 */
function renderHighlighted(text: string, regex: RegExp | null): ReactNode {
  if (!regex) return text
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(regex)) {
    if (m[0] === '') continue
    if (m.index > last) {
      out.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    }
    out.push(
      <mark key={key++} className="rounded-sm bg-accent-blue/30 px-0.5 text-text-primary">
        {m[0]}
      </mark>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(<span key={key++}>{text.slice(last)}</span>)
  }
  return out.length ? out : text
}

interface ResultRowProps {
  result: FileSearchResult
  index: number
  selected: boolean
  regex: RegExp | null
  onSelect: (i: number) => void
  onOpen: (result: FileSearchResult) => void
  itemRef: (el: HTMLButtonElement | null, i: number) => void
}

function ResultRow({ result, index, selected, regex, onSelect, onOpen, itemRef }: ResultRowProps) {
  const { Icon, color } = getFileIcon(result.filename)
  const isContent = result.matchType === 'content'
  const dirPath = result.filepath.includes('/')
    ? result.filepath.slice(0, result.filepath.lastIndexOf('/'))
    : ''

  return (
    <motion.button
      ref={(el) => itemRef(el, index)}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE, delay: Math.min(index * 0.02, 0.25) }}
      onMouseMove={() => onSelect(index)}
      onClick={() => onOpen(result)}
      className={cn(
        'group relative flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left transition-smooth-fast',
        selected
          ? 'border-l-accent-blue bg-white/10'
          : 'border-l-transparent hover:bg-white/5',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', color)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm',
              selected ? 'text-text-primary' : 'text-text-secondary',
            )}
          >
            {renderHighlighted(result.filename, regex)}
          </span>
          {isContent && result.line != null && (
            <span className="flex-shrink-0 rounded-sm bg-white/10 px-1.5 text-[10px] leading-4 text-text-tertiary">
              :{result.line}
            </span>
          )}
        </div>
        {!isContent && (
          <span className="truncate text-xs text-text-tertiary">
            {dirPath || './'}
          </span>
        )}
        {isContent && result.preview && (
          <span className="truncate font-mono text-xs text-text-tertiary">
            {renderHighlighted(result.preview, regex)}
          </span>
        )}
        {isContent && (
          <span className="truncate text-[10px] text-text-tertiary">
            {result.filepath}
          </span>
        )}
      </div>
    </motion.button>
  )
}

function PanelContent() {
  const query = useSearchStore((s) => s.query)
  const mode = useSearchStore((s) => s.mode)
  const results = useSearchStore((s) => s.results)
  const loading = useSearchStore((s) => s.loading)
  const error = useSearchStore((s) => s.error)
  const selectedIndex = useSearchStore((s) => s.selectedIndex)
  const useRegex = useSearchStore((s) => s.useRegex)
  const caseSensitive = useSearchStore((s) => s.caseSensitive)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setMode = useSearchStore((s) => s.setMode)
  const toggleRegex = useSearchStore((s) => s.toggleRegex)
  const toggleCaseSensitive = useSearchStore((s) => s.toggleCaseSensitive)
  const selectNext = useSearchStore((s) => s.selectNext)
  const selectPrev = useSearchStore((s) => s.selectPrev)
  const selectIndex = useSearchStore((s) => s.selectIndex)
  const close = useSearchStore((s) => s.close)

  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const setItemRef = useCallback((el: HTMLButtonElement | null, i: number) => {
    itemRefs.current[i] = el
  }, [])

  // 选中项变化时滚动进入视野
  useEffect(() => {
    const el = itemRefs.current[selectedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleOpen = useCallback(
    (result: FileSearchResult) => {
      void ipc.file.openInEditor(result.absolutePath, result.line)
      close()
    },
    [close],
  )

  const highlightRegex = buildHighlightRegex(query, caseSensitive, useRegex)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectNext()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectPrev()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const result = results[selectedIndex]
        if (result) {
          void ipc.file.openInEditor(result.absolutePath, result.line)
          close()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    },
    [selectNext, selectPrev, close, results, selectedIndex],
  )

  const showHint = !loading && !error && query.trim() === '' && results.length === 0
  const showEmpty = !loading && !error && query.trim() !== '' && results.length === 0

  return (
    <motion.div
      key="file-search-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      onClick={close}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.25, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(640px,92vw)] overflow-hidden rounded-lg border border-border-default bg-bg-primary shadow-lg"
      >
        {/* 顶部：搜索输入 + 模式切换 + 选项 */}
        <div className="border-b border-border-default p-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索文件名或内容…"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            {loading ? (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-accent-blue" />
            ) : (
              query && (
                <button
                  title="清空"
                  onClick={() => setQuery('')}
                  className="lift-button flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-white/10 hover:text-text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-0.5 rounded-md border border-border-default bg-bg-tertiary p-0.5">
              {(['filename', 'content', 'all'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'rounded px-2.5 py-0.5 text-xs transition-smooth-fast',
                    mode === m
                      ? 'bg-white/10 text-text-primary'
                      : 'text-text-tertiary hover:text-text-secondary',
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                title="正则匹配"
                onClick={toggleRegex}
                className={cn(
                  'lift-button flex h-7 w-7 items-center justify-center rounded-md border transition-smooth-fast',
                  useRegex
                    ? 'border-accent-blue/50 bg-accent-blue/15 text-accent-blue'
                    : 'border-border-default text-text-tertiary hover:text-text-secondary',
                )}
              >
                <Regex className="h-3.5 w-3.5" />
              </button>
              <button
                title="区分大小写"
                onClick={toggleCaseSensitive}
                className={cn(
                  'lift-button flex h-7 w-7 items-center justify-center rounded-md border transition-smooth-fast',
                  caseSensitive
                    ? 'border-accent-blue/50 bg-accent-blue/15 text-accent-blue'
                    : 'border-border-default text-text-tertiary hover:text-text-secondary',
                )}
              >
                <CaseSensitive className="h-3.5 w-3.5" />
              </button>
              <div className="ml-1 flex items-center gap-0.5 text-text-tertiary">
                <button
                  title="上一个"
                  onClick={selectPrev}
                  className="lift-button flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10 hover:text-text-primary"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  title="下一个"
                  onClick={selectNext}
                  className="lift-button flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10 hover:text-text-primary"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 结果列表 */}
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {error ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <X className="h-6 w-6 text-accent-red" />
              <p className="text-sm text-text-secondary">{error}</p>
            </div>
          ) : showHint ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Search className="h-6 w-6 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">输入关键词以搜索当前工作区</p>
            </div>
          ) : showEmpty ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <FolderOpen className="h-6 w-6 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">未找到匹配结果</p>
            </div>
          ) : (
            results.map((result, i) => (
              <ResultRow
                key={`${result.absolutePath}:${result.line ?? i}`}
                result={result}
                index={i}
                selected={i === selectedIndex}
                regex={highlightRegex}
                onSelect={selectIndex}
                onOpen={handleOpen}
                itemRef={setItemRef}
              />
            ))
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between border-t border-border-default px-3 py-1.5 text-[10px] text-text-tertiary">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-white/10 px-1">↑↓</kbd> 导航
            </span>
            <span>
              <kbd className="rounded bg-white/10 px-1">↵</kbd> 打开
            </span>
            <span>
              <kbd className="rounded bg-white/10 px-1">Esc</kbd> 关闭
            </span>
          </div>
          {results.length > 0 && <span>{results.length} 个结果</span>}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function FileSearchPanel() {
  const isOpen = useSearchStore((s) => s.isOpen)
  return (
    <AnimatePresence>
      {isOpen && <PanelContent key="file-search-panel" />}
    </AnimatePresence>
  )
}
