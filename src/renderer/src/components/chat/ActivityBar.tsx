import { memo, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ToolCallState } from '@/stores/chatStore'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/utils/cn'

const toolNameMap: Record<string, string> = {
  write_file: '写入文件',
  read_file: '读取文件',
  list_files: '列出文件',
  run_command: '执行命令',
  search_files: '搜索文件',
  grep: '搜索内容',
  todo_write: '更新任务清单',
  question: '向用户提问',
  task: '派发子智能体',
}

function extractPathFromArgs(name: string, args: string): string | null {
  try {
    const parsed = JSON.parse(args)
    if (name === 'write_file' || name === 'read_file') return parsed.path || null
    if (name === 'run_command') return parsed.command ? parsed.command.slice(0, 40) + '...' : null
    if (name === 'list_files') return parsed.path || '.'
    if (name === 'grep' || name === 'search_files') return parsed.pattern || parsed.query || null
    if (name === 'task') return parsed.description || null
    return null
  } catch {
    return null
  }
}

function getToolActivityLabel(toolCall: ToolCallState): string {
  const name = toolNameMap[toolCall.name] ?? toolCall.name
  const path = extractPathFromArgs(toolCall.name, toolCall.args)
  return path ? `${name} ${path}` : name
}

const ActivityItem = memo(function ActivityItem({ toolCall }: { toolCall: ToolCallState }) {
  const label = getToolActivityLabel(toolCall)
  const isRunning = toolCall.status === 'running'
  const isPending = toolCall.status === 'pending_approval'

  const duration = toolCall.startedAt
    ? (toolCall.endedAt ?? Date.now()) - toolCall.startedAt
    : 0

  const statusIndicator = isRunning ? '🔄' : isPending ? '⏳' : toolCall.status === 'completed' ? '✅' : '❌'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: -8, height: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
        isRunning && 'bg-accent-blue/10 text-text-primary',
        isPending && 'bg-accent-orange/10 text-text-primary',
        toolCall.status === 'completed' && 'text-text-secondary',
        toolCall.status === 'error' && 'bg-accent-red/10 text-accent-red',
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono">
        <span className="text-shimmer">{label}</span>
      </span>
      {duration > 0 && (
        <span className="flex-shrink-0 text-text-tertiary tabular-nums">
          {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
        </span>
      )}
      <span className="flex-shrink-0">{statusIndicator}</span>
    </motion.div>
  )
})

export const ActivityBar = memo(function ActivityBar() {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const toolCalls = useChatStore((s) => s.toolCalls)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const streamingContent = useChatStore((s) => s.streamingContent)

  const activeTools = useMemo(() => {
    return Object.values(toolCalls)
      .filter((tc) => tc.status === 'running' || tc.status === 'pending_approval')
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
  }, [toolCalls])

  const recentCompleted = useMemo(() => {
    return Object.values(toolCalls)
      .filter((tc) => tc.status === 'completed' || tc.status === 'error')
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, 3)
  }, [toolCalls])

  const showActivity = isStreaming && (activeTools.length > 0 || recentCompleted.length > 0 || !!streamingThinking)

  const statusLabel = useMemo(() => {
    if (activeTools.length > 0) {
      const first = activeTools[0]
      const label = getToolActivityLabel(first)
      return first.status === 'pending_approval' ? `等待审批: ${label}` : `正在执行: ${label}`
    }
    if (streamingThinking) return '正在思考...'
    if (streamingContent) return '正在回复...'
    if (isStreaming) return '处理中...'
    return ''
  }, [activeTools, streamingThinking, streamingContent, isStreaming])

  return (
    <AnimatePresence>
      {showActivity && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-b border-border-default bg-bg-secondary/60 backdrop-blur-sm"
        >
          <div className="px-4 py-2">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-text-secondary">
              {streamingThinking && !activeTools.length ? (
                <>
                  <span className="animate-pulse-soft text-accent-purple">●</span>
                  <span>AI 正在思考...</span>
                </>
              ) : (
                <>
                  <span className="text-accent-blue">⟳</span>
                  <span className="truncate">{statusLabel}</span>
                </>
              )}
            </div>

            <div className="space-y-0.5">
              {activeTools.map((tc) => (
                <ActivityItem key={tc.toolCallId} toolCall={tc} />
              ))}
            </div>

            {activeTools.length === 0 && recentCompleted.length > 0 && (
              <div className="space-y-0.5">
                {recentCompleted.map((tc) => (
                  <ActivityItem key={tc.toolCallId} toolCall={tc} />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
