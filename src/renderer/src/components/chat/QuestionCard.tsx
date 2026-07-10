import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, Check, X, ChevronRight, Pencil } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { QuestionItem } from '@shared/types/tool'

interface QuestionCardProps {
  questions: QuestionItem[]
  onReply: (answers: string[][]) => void
  onCancel: () => void
}

/**
 * AI 提问卡片
 *
 * 当 AI 调用 question 工具时，在输入框上方弹出此卡片，
 * 展示问题及对应的选项，用户选择后提交答案。
 *
 * 设计对标 OpenCode 桌面端的问答模式。
 */
export function QuestionCard({ questions, onReply, onCancel }: QuestionCardProps) {
  // 每个问题的选择状态：索引 -> 选中的 label 数组
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  // 每个问题的自定义输入：索引 -> 文本
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({})
  // 每个问题是否启用了自定义输入模式
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({})

  /** 切换选项 */
  const toggleOption = (qIndex: number, label: string, multiple: boolean) => {
    setSelections((prev) => {
      const current = prev[qIndex] || []
      if (multiple) {
        const next = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label]
        return { ...prev, [qIndex]: next }
      }
      // 单选：直接替换
      return { ...prev, [qIndex]: [label] }
    })
  }

  /** 切换自定义输入模式 */
  const toggleCustomMode = (qIndex: number) => {
    setCustomMode((prev) => ({ ...prev, [qIndex]: !prev[qIndex] }))
    setCustomInputs((prev) => ({ ...prev, [qIndex]: prev[qIndex] || '' }))
  }

  /** 检查所有问题是否已回答 */
  const allAnswered = useMemo(() => {
    return questions.every((_, idx) => {
      const sel = selections[idx] || []
      const custom = customMode[idx] ? (customInputs[idx] || '').trim() : ''
      return sel.length > 0 || custom.length > 0
    })
  }, [questions, selections, customInputs, customMode])

  /** 提交答案 */
  const handleSubmit = () => {
    if (!allAnswered) return
    const answers: string[][] = questions.map((_, idx) => {
      const sel = selections[idx] || []
      const custom = customMode[idx] ? (customInputs[idx] || '').trim() : ''
      const combined = [...sel]
      if (custom) combined.push(custom)
      return combined
    })
    onReply(answers)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mb-2 overflow-hidden rounded-lg border border-accent-blue/40 bg-bg-secondary shadow-glow"
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-border-default bg-accent-blue/5 px-4 py-2.5">
        <HelpCircle className="h-4 w-4 text-accent-blue" />
        <span className="text-xs font-medium text-accent-blue">
          AI 想向你确认 {questions.length} 个问题
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded p-1 text-text-tertiary transition-smooth-fast hover:bg-white/5 hover:text-text-primary"
          aria-label="取消提问"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 问题列表 */}
      <div className="max-h-[40vh] overflow-y-auto p-3">
        <div className="space-y-4">
          {questions.map((q, qIdx) => {
            const selected = selections[qIdx] || []
            const isCustom = !!customMode[qIdx]
            const customVal = customInputs[qIdx] || ''
            return (
              <div key={qIdx} className="space-y-2">
                {/* 问题标签 */}
                <div className="flex items-baseline gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-blue/15 text-[10px] font-semibold text-accent-blue">
                    {qIdx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-text-tertiary">{q.header}</div>
                    <div className="text-sm text-text-primary">{q.question}</div>
                  </div>
                </div>

                {/* 选项列表 */}
                <div className="ml-7 space-y-1.5">
                  {q.options.map((opt, oIdx) => {
                    const checked = selected.includes(opt.label)
                    const isSingle = !q.multiple
                    return (
                      <button
                        key={`${qIdx}-${oIdx}`}
                        type="button"
                        onClick={() => toggleOption(qIdx, opt.label, !!q.multiple)}
                        className={cn(
                          'group flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-smooth-fast',
                          checked
                            ? 'border-accent-blue/50 bg-accent-blue/10'
                            : 'border-border-default bg-bg-tertiary/50 hover:border-border-strong hover:bg-bg-tertiary',
                        )}
                      >
                        {/* 单选/多选指示器 */}
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center transition-smooth-fast',
                            isSingle ? 'rounded-full' : 'rounded',
                            checked
                              ? 'bg-accent-blue text-white'
                              : 'border border-border-strong text-transparent',
                          )}
                        >
                          {isSingle ? (
                            checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'text-xs font-medium',
                              checked ? 'text-accent-blue' : 'text-text-primary',
                            )}
                          >
                            {opt.label}
                          </div>
                          {opt.description && (
                            <div className="mt-0.5 text-[11px] text-text-tertiary">
                              {opt.description}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}

                  {/* 自定义输入区 */}
                  {q.custom !== false && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleCustomMode(qIdx)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-smooth-fast',
                          isCustom
                            ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                            : 'border-border-default bg-bg-tertiary/50 text-text-tertiary hover:border-border-strong hover:text-text-secondary',
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                        <span>{isCustom ? '使用自定义输入' : '自定义回答'}</span>
                      </button>
                      <AnimatePresence>
                        {isCustom && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <textarea
                              value={customVal}
                              onChange={(e) =>
                                setCustomInputs((prev) => ({ ...prev, [qIdx]: e.target.value }))
                              }
                              placeholder="输入你的回答..."
                              rows={2}
                              className="mt-1.5 w-full resize-none rounded-md border border-border-default bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent-blue/50 focus-visible:outline-none"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* 已选状态指示 */}
                  {(selected.length > 0 || (isCustom && customVal.trim())) && (
                    <div className="flex items-center gap-1 text-[10px] text-accent-green">
                      <Check className="h-2.5 w-2.5" />
                      <span>已回答</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between border-t border-border-default bg-bg-tertiary/50 px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-text-tertiary transition-smooth-fast hover:bg-white/5 hover:text-text-secondary"
        >
          取消
        </button>
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered}
          whileHover={allAnswered ? { scale: 1.03 } : undefined}
          whileTap={allAnswered ? { scale: 0.97 } : undefined}
          transition={{ duration: 0.15 }}
          className={cn(
            'flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-smooth-fast',
            allAnswered
              ? 'bg-accent-blue text-white shadow-glow'
              : 'cursor-not-allowed bg-white/5 text-text-tertiary',
          )}
        >
          <span>提交回答</span>
          <ChevronRight className="h-3 w-3" />
        </motion.button>
      </div>
    </motion.div>
  )
}
