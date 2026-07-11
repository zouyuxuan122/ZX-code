import { memo, useState, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message, MessageMetadata, ToolCall as ToolCallInfo } from '@shared/types/conversation'
import type { ToolCallState } from '@/stores/chatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { MarkdownRenderer } from './MarkdownRenderer'
import { ToolCallView } from './ToolCallView'
import { TtsButton } from './TtsButton'
import { cn } from '@/utils/cn'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
  streamingContent?: string
  streamingThinking?: string
  toolCalls?: Record<string, ToolCallState>
  toolResultMap?: Map<string, Message>
  onQuote?: (message: Message) => void
  onRollback?: (messageId: string) => void
}

function parseMetadata(metadata: string | null): MessageMetadata | null {
  if (!metadata) return null
  try {
    return JSON.parse(metadata) as MessageMetadata
  } catch {
    return null
  }
}

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!thinking.trim()) return null
  return (
    <div className="surface-3d mb-2 rounded-xl text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-text-secondary transition-smooth-fast hover:text-text-primary"
      >
        <svg
          className={cn('h-3 w-3 transition-transform duration-200', expanded && 'rotate-90')}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>思考过程</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default px-2.5 py-2">
              <div className="whitespace-pre-wrap text-text-tertiary font-mono text-xs leading-relaxed">
                {thinking}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Bubble({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl px-3 py-2', className)}>{children}</div>
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
  streamingContent = '',
  streamingThinking = '',
  toolCalls = {},
  toolResultMap,
  onQuote,
  onRollback,
}: MessageItemProps) {
  const aiAvatar = useProjectStore((s) => s.currentProject?.ai_avatar ?? '')
  const userAvatar = useProjectStore((s) => s.currentProject?.user_avatar ?? '')
  const visualStyle = useSettingsStore((s) => s.getSetting<string>('theme.visualStyle', 'apple'))
  const isApple = visualStyle === 'apple'
  const avatarSize = useSettingsStore((s) => s.getSetting<number>('workspace.avatarSize', 32))
  const rollbackToMessage = useChatStore((s) => s.rollbackToMessage)
  const isStreamingActive = useChatStore((s) => s.isStreaming)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [contentExpanded, setContentExpanded] = useState(true)

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }, [])

  if (message.role === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <div className="max-w-[80%] text-center text-xs italic text-text-tertiary">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return null
  }

  const isTempMessage = message.id.startsWith('temp-')
  const canRollbackUser = message.role === 'user' && !isStreaming && !isStreamingActive && !isTempMessage
  const userActions = (onQuote || canRollbackUser) && (
    <AnimatePresence>
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.9 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-1 flex items-center gap-1"
        >
          {onQuote && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onQuote(message)
              }}
              title="引用"
              className="flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-1 text-[11px] text-text-secondary hover:border-accent-purple/50 hover:bg-accent-purple/10 hover:text-accent-purple"
            >
              引用
            </button>
          )}
          {canRollbackUser && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (onRollback) {
                  onRollback(message.id)
                } else {
                  void rollbackToMessage(message.id)
                }
              }}
              title="回退到此处"
              className="flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-1 text-[11px] text-text-secondary hover:border-accent-orange/50 hover:bg-accent-orange/10 hover:text-accent-orange"
            >
              {onRollback ? '回退到此处' : '↶ 回退并编辑'}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10, x: 8 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="my-2.5 flex justify-end gap-2.5 group"
        data-message-role="user"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="min-w-0 flex-1 flex flex-col items-end gap-0.5">
          <Bubble className="chat-message-content max-w-[78%] border border-border-default bg-bg-tertiary shadow-sm text-text-primary whitespace-pre-wrap break-words">
            {message.content}
          </Bubble>
          {userActions}
        </div>
        <div className={cn(
          'msg-avatar flex flex-shrink-0 items-center justify-center overflow-hidden',
          isApple ? 'rounded-full' : 'rounded-md border border-border-default bg-bg-tertiary',
        )} style={{ width: avatarSize, height: avatarSize }}>
          {userAvatar ? (
            <img src={userAvatar} alt="用户" className="h-full w-full object-cover" />
          ) : (
            <span className="text-text-secondary text-sm">👤</span>
          )}
        </div>
      </motion.div>
    )
  }

  const metadata = parseMetadata(message.metadata)
  const thinking = isStreaming ? streamingThinking : metadata?.thinking
  const content = isStreaming ? streamingContent : message.content
  const metadataToolCalls = metadata?.tool_calls ?? []
  const errorMessage = metadata?.error

  const shouldCollapse = !isStreaming && content.length > 500
  const isContentExpanded = shouldCollapse ? contentExpanded : true
  const previewContent = shouldCollapse && !isContentExpanded
    ? content.slice(0, 200) + '\n\n...\n\n' + content.slice(-100)
    : content

  const activeToolCallIds = isStreaming ? Object.keys(toolCalls) : []
  const allToolCallIds = new Set<string>([
    ...metadataToolCalls.map((tc) => tc.id),
    ...activeToolCallIds,
  ])

  const mergedToolCalls: Array<{ id: string; name: string; args: string }> = []
  for (const tc of metadataToolCalls) {
    mergedToolCalls.push({ id: tc.id, name: tc.function.name, args: tc.function.arguments })
  }
  for (const id of activeToolCallIds) {
    if (!allToolCallIds.has(id) || metadataToolCalls.some((tc) => tc.id === id)) continue
    const state = toolCalls[id]
    if (state) {
      mergedToolCalls.push({ id, name: state.name, args: state.args })
    }
  }
  const seen = new Set<string>()
  const dedupedToolCalls = mergedToolCalls.filter((tc) => {
    if (seen.has(tc.id)) return false
    seen.add(tc.id)
    return true
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: -8 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="my-2.5 flex justify-start gap-2.5 group"
      data-message-role="assistant"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn(
        'msg-avatar flex flex-shrink-0 items-center justify-center overflow-hidden',
        isApple ? 'rounded-full' : 'rounded-md border border-border-default bg-accent-blue/15',
      )} style={{ width: avatarSize, height: avatarSize }}>
        {aiAvatar ? (
          <img src={aiAvatar} alt="AI" className="h-full w-full object-cover" />
        ) : (
          <span className="text-accent-blue text-sm">🤖</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {thinking ? <ThinkingBlock thinking={thinking} /> : null}

        {dedupedToolCalls.length > 0 && (
          <div className="space-y-1">
            {dedupedToolCalls.map((tc, idx) => {
              const liveState = toolCalls[tc.id]
              const toolMsg = toolResultMap?.get(tc.id)
              const reconstructedState: ToolCallState = liveState
                ? liveState
                : {
                    toolCallId: tc.id,
                    name: tc.name,
                    args: tc.args,
                    status: 'completed',
                    ...(toolMsg
                      ? {
                          result: {
                            tool_call_id: tc.id,
                            content: toolMsg.content,
                            is_error: parseMetadata(toolMsg.metadata)?.is_error ?? false,
                            ...(parseMetadata(toolMsg.metadata)?.result_metadata
                              ? { metadata: parseMetadata(toolMsg.metadata)!.result_metadata }
                              : {}),
                          },
                        }
                      : {}),
                  }
              return (
                <motion.div
                  key={tc.id}
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: idx * 0.06,
                    duration: 0.3,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <ToolCallView toolCall={reconstructedState} />
                </motion.div>
              )
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {content ? (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <Bubble className="chat-message-content border-l border-border-default bg-bg-tertiary pl-3 text-text-primary">
                <MarkdownRenderer content={previewContent} />
                {isStreaming && <span className="streaming-cursor" />}

                {shouldCollapse && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setContentExpanded((v) => !v)}
                      className="text-xs text-accent-blue hover:text-accent-blue-hover transition-smooth-fast"
                    >
                      {isContentExpanded ? '收起 ↑' : '展开全部 ↓'}
                    </button>
                  </div>
                )}
              </Bubble>
            </motion.div>
          ) : isStreaming ? (
            <motion.div
              key="streaming-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Bubble className="border-l border-border-default pl-3">
                <span className="streaming-cursor" />
              </Bubble>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 复制 / 引用按钮：位于 AI 消息内容下方（hover 显示） */}
        <AnimatePresence>
          {hovered && content && !isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="mt-1 flex items-center gap-1"
            >
              {onQuote && (
                <button
                  type="button"
                  onClick={() => onQuote(message)}
                  title="引用"
                  className="flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-1 text-[10px] text-text-secondary hover:border-accent-purple/50 hover:bg-accent-purple/10 hover:text-accent-purple transition-smooth-fast"
                >
                  引用
                </button>
              )}
              <TtsButton messageId={message.id} text={content} size="sm" />
              <button
                type="button"
                onClick={() => handleCopy(content)}
                className="flex items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 py-1 text-[10px] text-text-secondary hover:bg-white/10 hover:text-text-primary transition-smooth-fast"
              >
                {copied ? '✓ 已复制' : '复制'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="mt-1.5 flex items-center gap-1.5 text-xs text-accent-red overflow-hidden"
            >
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
})
