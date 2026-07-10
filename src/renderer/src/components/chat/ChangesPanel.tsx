import { memo, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message, MessageMetadata } from '@shared/types/conversation'
import type { ToolCallState } from '@/stores/chatStore'
import { ToolCallView } from './ToolCallView'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ChangesPanelProps {
  /** 一组连续的 assistant(带 tool_calls) + tool 消息 */
  messages: Message[]
  toolCalls: Record<string, ToolCallState>
  toolResultMap: Map<string, Message>
  /** 是否正在流式（流式时自动展开） */
  isStreaming?: boolean
}

function parseMetadata(metadata: string | null): MessageMetadata | null {
  if (!metadata) return null
  try {
    return JSON.parse(metadata) as MessageMetadata
  } catch {
    return null
  }
}

/** 从一组消息中提取所有工具调用 + 对应结果，并计算总增删行数 */
function extractChanges(
  messages: Message[],
  toolResultMap: Map<string, Message>,
  toolCalls: Record<string, ToolCallState>,
) {
  const items: Array<{
    toolCallId: string
    name: string
    args: string
    preamble: string
    result?: Message
  }> = []
  let totalAdditions = 0
  let totalDeletions = 0
  let hasRunning = false

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const meta = parseMetadata(msg.metadata)
    if (!meta?.tool_calls || meta.tool_calls.length === 0) continue
    const preamble = msg.content || ''

    for (const tc of meta.tool_calls) {
      const liveState = toolCalls[tc.id]
      if (liveState?.status === 'running') hasRunning = true

      const result = toolResultMap.get(tc.id)
      const resultMeta = result ? parseMetadata(result.metadata) : null
      const diff = resultMeta?.result_metadata?.diff
      if (diff) {
        totalAdditions += diff.additions
        totalDeletions += diff.deletions
      }

      items.push({
        toolCallId: tc.id,
        name: tc.function.name,
        args: tc.function.arguments,
        preamble,
        result,
      })
    }
  }

  return { items, totalAdditions, totalDeletions, hasRunning }
}

export const ChangesPanel = memo(function ChangesPanel({
  messages,
  toolCalls,
  toolResultMap,
  isStreaming = false,
}: ChangesPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const { items, totalAdditions, totalDeletions, hasRunning } = useMemo(
    () => extractChanges(messages, toolResultMap, toolCalls),
    [messages, toolResultMap, toolCalls],
  )

  // 流式且有正在运行的工具时自动展开
  const autoExpanded = isStreaming && hasRunning
  const isExpanded = expanded || autoExpanded

  if (items.length === 0) return null

  const toolCount = items.length
  const hasDiff = totalAdditions > 0 || totalDeletions > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d my-2 rounded-md overflow-hidden"
    >
      {/* 标题栏：点击展开/收起 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-smooth-fast hover:bg-hover-surface"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex-shrink-0"
        >
          <svg className="h-3.5 w-3.5 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </motion.span>

        <span className="flex-shrink-0 text-xs font-semibold text-text-secondary">
          更改
        </span>

        <span className="flex-shrink-0 text-[11px] text-text-tertiary tabular-nums">
          {toolCount} 次操作
        </span>

        {/* 行数统计：正(+)红字，负(-)绿字 */}
        {hasDiff && (
          <span className="flex-shrink-0 flex items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-accent-red">+{totalAdditions}</span>
            <span className="text-accent-green">-{totalDeletions}</span>
          </span>
        )}

        {hasRunning && (
          <span className="flex-shrink-0 flex items-center gap-1 text-[11px] text-accent-blue">
            <span className="animate-pulse-soft">●</span>
            <span>运行中</span>
          </span>
        )}

        <span className="flex-1" />

        {!isExpanded && (
          <span className="flex-shrink-0 text-[11px] text-text-tertiary">
            点击展开
          </span>
        )}
      </button>

      {/* 展开内容：所有工具调用 + preamble */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default px-3 py-2 space-y-1">
              {items.map((item, idx) => {
                const liveState = toolCalls[item.toolCallId]
                const resultMeta = item.result
                  ? parseMetadata(item.result.metadata)
                  : null
                const reconstructedState: ToolCallState = liveState
                  ? liveState
                  : {
                      toolCallId: item.toolCallId,
                      name: item.name,
                      args: item.args,
                      status: 'completed',
                      ...(item.result
                        ? {
                            result: {
                              tool_call_id: item.toolCallId,
                              content: item.result.content,
                              is_error: resultMeta?.is_error ?? false,
                              ...(resultMeta?.result_metadata
                                ? { metadata: resultMeta.result_metadata }
                                : {}),
                            },
                          }
                        : {}),
                    }

                return (
                  <div key={item.toolCallId}>
                    {/* preamble 文本（工具调用前的说明） */}
                    {item.preamble && idx === 0 && (
                      <div className="chat-message-content mb-1.5 border-l border-border-default pl-2.5 text-xs text-text-secondary">
                        <MarkdownRenderer content={item.preamble} />
                      </div>
                    )}
                    {item.preamble && idx > 0 && items[idx - 1].preamble !== item.preamble && (
                      <div className="chat-message-content mb-1.5 mt-2 border-l border-border-default pl-2.5 text-xs text-text-secondary">
                        <MarkdownRenderer content={item.preamble} />
                      </div>
                    )}
                    <ToolCallView toolCall={reconstructedState} />
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
