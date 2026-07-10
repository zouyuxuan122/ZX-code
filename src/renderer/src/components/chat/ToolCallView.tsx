import { memo, useState, type ComponentPropsWithoutRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ToolCallState } from '@/stores/chatStore'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { DiffView } from './DiffView'
import { cn } from '@/utils/cn'

interface ToolCallViewProps {
  toolCall: ToolCallState
  defaultExpanded?: boolean
}

const statusConfig: Record<ToolCallState['status'], { label: string; color: string }> = {
  running: { label: '运行中', color: 'text-accent-blue' },
  completed: { label: '已完成', color: 'text-accent-green' },
  error: { label: '错误', color: 'text-accent-red' },
  pending_approval: { label: '待审批', color: 'text-accent-orange' },
}

const statusEmoji: Record<ToolCallState['status'], string> = {
  running: '🔄',
  completed: '✅',
  error: '❌',
  pending_approval: '⏳',
}

const toolNameMap: Record<string, string> = {
  write_file: '写入文件',
  edit: '编辑文件',
  read_file: '读取文件',
  list_files: '列出文件',
  run_command: '执行命令',
  search_files: '搜索文件',
  grep: '搜索内容',
  todo_write: '更新任务清单',
  question: '向用户提问',
  task: '派发子智能体',
  webfetch: '获取网页',
  websearch: '网络搜索',
}

function tryFormatJson(raw: string): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function extractPathFromArgs(name: string, args: string): string | null {
  try {
    const parsed = JSON.parse(args)
    if (name === 'write_file' || name === 'edit' || name === 'read_file') return parsed.path || null
    if (name === 'run_command') return parsed.command ? parsed.command.slice(0, 40) + '...' : null
    if (name === 'list_files') return parsed.path || '.'
    if (name === 'grep') return parsed.pattern || null
    if (name === 'task') return parsed.description || null
    return null
  } catch {
    return null
  }
}

function formatDuration(toolCall: ToolCallState): string {
  if (!toolCall.startedAt) return ''
  const end = toolCall.endedAt ?? Date.now()
  const secs = (end - toolCall.startedAt) / 1000
  if (secs < 1) return `${Math.round(secs * 1000)}ms`
  return `${secs.toFixed(1)}s`
}

function CodePre({ className, children }: ComponentPropsWithoutRef<'pre'>) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border border-border-default bg-bg-primary p-2.5 text-xs leading-relaxed',
        className,
      )}
    >
      {children}
    </pre>
  )
}

export const ToolCallView = memo(function ToolCallView({
  toolCall,
  defaultExpanded = false,
}: ToolCallViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [approvalSubmitted, setApprovalSubmitted] = useState(false)

  const toolLabel = toolNameMap[toolCall.name] ?? toolCall.name
  const filePath = extractPathFromArgs(toolCall.name, toolCall.args)
  const config = statusConfig[toolCall.status]
  const isHighRisk = ['run_command', 'delete_file', 'bash'].includes(toolCall.name)

  const formattedArgs = tryFormatJson(toolCall.args)
  const resultContent = toolCall.result?.content ?? ''
  const isResultJson = (() => {
    try {
      JSON.parse(resultContent)
      return true
    } catch {
      return false
    }
  })()
  const formattedResult = isResultJson ? tryFormatJson(resultContent) : resultContent
  const diffMeta = toolCall.result?.metadata?.diff
  const cmdMeta = toolCall.result?.metadata?.command
  const taskMeta = toolCall.result?.metadata?.task

  const autoExpanded = toolCall.status === 'running' || toolCall.status === 'pending_approval'
  const isExpanded = expanded || autoExpanded

  const statusBorderColor =
    toolCall.status === 'running' ? 'border-l-accent-blue' :
    toolCall.status === 'completed' ? 'border-l-accent-green' :
    toolCall.status === 'error' ? 'border-l-accent-red' :
    'border-l-accent-orange'

  const handleApprove = (approved: boolean) => {
    if (approvalSubmitted) return
    setApprovalSubmitted(true)
    void useChatStore.getState().approveToolCall(toolCall.toolCallId, approved)
  }

  const openPermissionDialog = () => {
    useUIStore.getState().setPendingPermissionRequest({
      requestId: toolCall.toolCallId,
      sessionId: toolCall.toolCallId,
      toolName: toolCall.name,
      toolInput: toolCall.args,
      riskLevel: 'high',
    })
  }

  const diff = toolCall.result?.metadata?.diff

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'surface-3d my-1.5 rounded-md border-l-2 text-xs overflow-hidden',
        statusBorderColor,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-smooth-fast hover:bg-white/[0.03]"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex-shrink-0"
        >
          <svg className="h-3.5 w-3.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </motion.span>

        {isHighRisk && (
          <span className="text-accent-orange font-bold flex-shrink-0">[!]</span>
        )}

        <span className={`flex-shrink-0 font-mono ${toolCall.name === 'run_command' ? 'text-shimmer text-text-primary' : 'text-text-primary'}`}>{toolLabel}</span>

        {filePath && (
          <span className="flex-shrink-0 truncate max-w-[200px] text-text-primary">{filePath}</span>
        )}

        {diff && (
          <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] tabular-nums">
            <span className="text-accent-green">+{diff.additions}</span>
            <span className="text-accent-red">-{diff.deletions}</span>
          </span>
        )}

        {toolCall.startedAt && (
          <span className="flex-shrink-0 tabular-nums text-text-tertiary">
            {formatDuration(toolCall)}
          </span>
        )}

        <AnimatePresence mode="wait">
          <motion.span
            key={toolCall.status}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs',
              config.color,
            )}
          >
            <span>{statusEmoji[toolCall.status]}</span>
            <span>{config.label}</span>
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && !autoExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default px-3 py-2.5 space-y-2.5">
              {diffMeta && (
                <DiffView
                  filepath={diffMeta.filepath}
                  patch={diffMeta.patch}
                  additions={diffMeta.additions}
                  deletions={diffMeta.deletions}
                />
              )}

              {cmdMeta && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05, duration: 0.25 }}
                  className="flex items-center gap-2 text-xs text-text-secondary"
                >
                  <code className="font-mono text-text-primary">{cmdMeta.command}</code>
                  <span className="text-text-tertiary tabular-nums">
                    {cmdMeta.duration < 1000 ? `${cmdMeta.duration}ms` : `${(cmdMeta.duration / 1000).toFixed(1)}s`}
                  </span>
                  <span className={cn('font-mono', cmdMeta.exitCode === 0 ? 'text-accent-green' : 'text-accent-red')}>
                    exit={cmdMeta.exitCode}
                  </span>
                </motion.div>
              )}

              {taskMeta && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-md border border-accent-purple/30 bg-accent-purple/5 p-2.5"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-medium text-accent-purple">
                      子智能体 · {taskMeta.subagentType}
                    </span>
                    <span className="flex-1 truncate text-xs text-text-secondary">
                      {taskMeta.description}
                    </span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        taskMeta.state === 'completed'
                          ? 'bg-accent-green/15 text-accent-green'
                          : taskMeta.state === 'error'
                            ? 'bg-accent-red/15 text-accent-red'
                            : 'bg-accent-blue/15 text-accent-blue',
                      )}
                    >
                      {taskMeta.state === 'completed' ? '完成' : taskMeta.state === 'error' ? '失败' : '运行中'}
                    </span>
                  </div>
                  {taskMeta.result && (
                    <div className="rounded border border-border-default bg-bg-primary p-2 text-xs text-text-secondary max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {taskMeta.result}
                    </div>
                  )}
                </motion.div>
              )}

              {formattedArgs && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-text-secondary">参数</div>
                  <CodePre>
                    <code className="font-mono text-text-primary">{formattedArgs}</code>
                  </CodePre>
                </div>
              )}

              {toolCall.result && !diffMeta && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-text-secondary">结果</div>
                  <CodePre>
                    <code
                      className={cn(
                        'font-mono',
                        toolCall.result.is_error ? 'text-accent-red' : 'text-text-primary',
                      )}
                    >
                      {formattedResult}
                    </code>
                  </CodePre>
                </div>
              )}

              {!toolCall.result && toolCall.status === 'running' && (
                <div className="text-xs text-text-tertiary">等待结果...</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {autoExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="border-t border-border-default px-3 py-2.5 space-y-2">
            {formattedArgs && (
              <div>
                <div className="mb-1 text-xs font-semibold text-text-secondary">参数</div>
                <CodePre>
                  <code className="font-mono text-text-primary">{formattedArgs}</code>
                </CodePre>
              </div>
            )}

            {!toolCall.result && toolCall.status === 'running' && (
              <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <span className="animate-pulse-soft">🔄</span>
                <span>执行中...</span>
              </div>
            )}

            {toolCall.status === 'pending_approval' && (
              <div className="flex items-center gap-2 pt-1">
                {isHighRisk ? (
                  <button
                    type="button"
                    onClick={openPermissionDialog}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-orange px-3 text-xs font-medium text-white hover:bg-accent-orange/90"
                  >
                    查看权限请求
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={approvalSubmitted}
                      onClick={() => handleApprove(true)}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-green px-3 text-xs font-medium text-white hover:bg-accent-green/90 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      批准
                    </button>
                    <button
                      type="button"
                      disabled={approvalSubmitted}
                      onClick={() => handleApprove(false)}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-red px-3 text-xs font-medium text-white hover:bg-accent-red/90 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      拒绝
                    </button>
                    {approvalSubmitted && (
                      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
                        处理中...
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
})
