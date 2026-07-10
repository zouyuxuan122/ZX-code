import { memo, useState, useMemo } from 'react'
import { ChevronRight, FileEdit, Plus, Minus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/cn'

interface DiffViewProps {
  filepath: string
  patch: string
  additions: number
  deletions: number
  /** 是否默认展开 */
  defaultExpanded?: boolean
}

/** 解析 unified diff，按行分类渲染 */
function parseDiffLines(patch: string) {
  const lines = patch.split('\n')
  return lines.map((line, idx) => {
    if (line.startsWith('@@')) {
      return { type: 'hunk' as const, content: line, idx }
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return { type: 'add' as const, content: line.slice(1), idx }
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return { type: 'del' as const, content: line.slice(1), idx }
    }
    if (line.startsWith(' ')) {
      return { type: 'ctx' as const, content: line.slice(1), idx }
    }
    return { type: 'ctx' as const, content: line, idx }
  })
}

export const DiffView = memo(function DiffView({
  filepath,
  patch,
  additions,
  deletions,
  defaultExpanded = true,
}: DiffViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const diffLines = useMemo(() => parseDiffLines(patch), [patch])

  return (
    <div className="surface-3d my-1.5 rounded-md border border-border-default overflow-hidden">
      {/* 头部：文件名 + 增删统计 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-smooth-fast hover:bg-white/5"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-text-tertiary transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />
        <FileEdit className="h-3.5 w-3.5 flex-shrink-0 text-accent-blue" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-primary">{filepath}</span>
        <span className="flex flex-shrink-0 items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-0.5 rounded bg-accent-green/15 px-1.5 py-0.5 font-mono text-accent-green">
            <Plus className="h-2.5 w-2.5" />
            {additions}
          </span>
          <span className="inline-flex items-center gap-0.5 rounded bg-accent-red/15 px-1.5 py-0.5 font-mono text-accent-red">
            <Minus className="h-2.5 w-2.5" />
            {deletions}
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default">
              {/* diff 内容区 */}
              <div className="max-h-80 overflow-auto bg-bg-primary font-mono text-xs leading-relaxed">
                {diffLines.map((line) => (
                  <div
                    key={line.idx}
                    className={cn(
                      'flex min-w-0',
                      line.type === 'add' && 'bg-accent-green/10',
                      line.type === 'del' && 'bg-accent-red/10',
                      line.type === 'hunk' && 'bg-accent-blue/5 text-accent-blue/70',
                    )}
                  >
                    {/* 行号侧栏 */}
                    <span
                      className={cn(
                        'inline-block w-6 flex-shrink-0 select-none border-r border-border-default px-1 text-right text-text-tertiary/50',
                        line.type === 'add' && 'text-accent-green/40',
                        line.type === 'del' && 'text-accent-red/40',
                      )}
                    >
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                    </span>
                    <pre
                      className={cn(
                        'min-w-0 flex-1 whitespace-pre-wrap break-all px-2',
                        line.type === 'add' && 'text-accent-green',
                        line.type === 'del' && 'text-accent-red',
                        line.type === 'ctx' && 'text-text-secondary',
                        line.type === 'hunk' && 'text-accent-blue/70',
                      )}
                    >
                      {line.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
